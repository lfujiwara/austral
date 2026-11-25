import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ID_PATTERN } from './topics.mjs'

const MAX_BODY = 64 * 1024
const MAX_ENTRIES = 512
const MAX_AGE_MS = 86_400_000
const MAX_VALUE_LENGTH = 1024
const MAX_STREAMS = 64
const publicDir = new URL('./public/', import.meta.url)
const assets = new Map([
  ['/', ['monitor.html', 'text/html; charset=utf-8']],
  ['/monitor.js', ['monitor.js', 'text/javascript; charset=utf-8']]
])

/** Parses `<device>:<token>,...` into a Map from device id to the token's SHA-256. */
export function parseTokens (text) {
  const tokens = new Map()
  for (const pair of text.split(',')) {
    const colon = pair.indexOf(':')
    const device = pair.slice(0, colon)
    const token = pair.slice(colon + 1)
    if (colon < 1 || token === '' || !ID_PATTERN.test(device)) throw new Error('bad AUSTRAL_DEVICE_TOKENS entry')
    tokens.set(device, sha256(token))
  }
  return tokens
}

function sha256 (text) {
  return createHash('sha256').update(text).digest()
}

/** Returns the device id owning the bearer token, or null. Compares every token. */
function tokenOwner (tokens, header) {
  const match = /^Bearer (\S+)$/.exec(header ?? '')
  if (!match) return null
  const given = sha256(match[1])
  let owner = null
  for (const [device, expected] of tokens) {
    if (timingSafeEqual(given, expected)) owner = device
  }
  return owner
}

/**
 * Turns the request body into domain values. Returns null for anything outside the api.md rules.
 * @returns {import('./store.mjs').Batch | null}
 */
function parseBatch (text) {
  let body
  try { body = JSON.parse(text) } catch { return null }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const { device, boot, seq, entries } = body
  if (typeof device !== 'string' || !ID_PATTERN.test(device)) return null
  if (!Number.isInteger(boot) || boot < 0 || boot > 0xFFFFFFFF) return null
  if (!Number.isSafeInteger(seq) || seq < 0) return null
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) return null
  const parsed = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') return null
    const { id, age, value } = entry
    if (typeof id !== 'string' || id.length > 129) return null
    if (!Number.isInteger(age) || age < 0 || age > MAX_AGE_MS) return null
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) return null
    parsed.push({ id, age, value })
  }
  return { device, boot, seq, entries: parsed }
}

function send (res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(body)
}

function sendJson (res, status, value) {
  send(res, status, JSON.stringify(value))
}

/** Reads the body, or answers 413 and returns null when it passes MAX_BODY. */
function readBody (req, res) {
  return new Promise((resolve) => {
    const tooBig = () => { send(res, 413, '', undefined, { Connection: 'close' }); resolve(null) }
    if (Number(req.headers['content-length']) > MAX_BODY) return tooBig()
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) { chunks.length = 0; req.removeAllListeners('data'); req.resume(); tooBig() } else chunks.push(chunk)
    })
    req.on('end', () => { if (size <= MAX_BODY) resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', () => resolve(null))
  })
}

/**
 * Both listeners. The ingest listener only takes POST /ingest. The read listener serves the API,
 * the SSE stream and the monitor page.
 * @param {object} options
 * @param {ReturnType<typeof import('./store.mjs').openStore>} options.store
 * @param {Map<string, Buffer>} options.tokens from parseTokens
 * @param {Set<string>} options.allowedHosts lower-case Host header values for the read listener
 * @param {number} [options.pingMs]
 * @param {() => number} [options.now]
 */
export function createHttp ({ store, tokens, allowedHosts, pingMs = 15000, now = Date.now }) {
  const streams = new Set()

  /** Sends events to every stream. Call only after the store committed them. */
  function broadcast (events) {
    for (const stream of streams) {
      for (const { type, data } of events) {
        if (stream.writableNeedDrain) { stream.destroy(); break }
        stream.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    }
  }

  const pinger = setInterval(() => {
    for (const stream of streams) stream.write(': ping\n\n')
  }, pingMs)
  pinger.unref()

  const ingest = createServer(async (req, res) => {
    try {
      if (new URL(req.url, 'http://x').pathname !== '/ingest') return send(res, 404, '')
      if (req.method !== 'POST') return send(res, 405, '', undefined, { Allow: 'POST' })
      const owner = tokenOwner(tokens, req.headers.authorization)
      if (owner === null) return send(res, 401, '', undefined, { 'WWW-Authenticate': 'Bearer' })
      const text = await readBody(req, res)
      if (text === null) return
      const batch = parseBatch(text)
      if (batch === null) return sendJson(res, 400, { error: 'bad batch' })
      if (batch.device !== owner) return send(res, 401, '')
      const { events } = store.ingest(batch, now())
      send(res, 204, '')
      broadcast(events)
    } catch (error) {
      console.error(error)
      if (!res.headersSent) send(res, 500, '')
    }
  })

  const read = createServer(async (req, res) => {
    try {
      if (!allowedHosts.has((req.headers.host ?? '').toLowerCase())) return send(res, 421, '')
      if (req.method !== 'GET') return send(res, 405, '', undefined, { Allow: 'GET' })
      const url = new URL(req.url, 'http://x')
      const asset = assets.get(url.pathname)
      if (asset) return send(res, 200, await readFile(new URL(asset[0], publicDir)), asset[1])
      if (url.pathname === '/api/devices') return sendJson(res, 200, store.devices(now()))
      if (url.pathname === '/api/series') return series(url.searchParams, res)
      if (url.pathname === '/api/stream') return stream(req, res)
      send(res, 404, '')
    } catch (error) {
      console.error(error)
      if (!res.headersSent) send(res, 500, '')
    }
  })

  function series (params, res) {
    const bad = (error) => sendJson(res, 400, { error })
    const device = params.get('device')
    const sensor = params.get('sensor')
    if (device === null || !ID_PATTERN.test(device)) return bad('device is required and must match [a-z0-9_-]{1,64}')
    if (sensor === null || !ID_PATTERN.test(sensor)) return bad('sensor is required and must match [a-z0-9_-]{1,64}')
    const integer = (name, fallback) => {
      const text = params.get(name)
      if (text === null) return fallback
      return /^\d{1,15}$/.test(text) ? Number(text) : NaN
    }
    const to = integer('to', now())
    if (Number.isNaN(to)) return bad('to must be an integer in ms')
    const from = integer('from', to - 3_600_000)
    if (Number.isNaN(from)) return bad('from must be an integer in ms')
    if (to <= from) return bad('to must be greater than from')
    const points = integer('points', 1000)
    if (!(points >= 1 && points <= 2000)) return bad('points must be an integer from 1 to 2000')
    sendJson(res, 200, store.series({ device, sensor, from, to, points }))
  }

  function stream (req, res) {
    if (streams.size >= MAX_STREAMS) return send(res, 503, '')
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff'
    })
    res.write(': ok\n\n')
    streams.add(res)
    req.on('close', () => streams.delete(res))
  }

  return {
    ingest,
    read,
    broadcast,
    close () {
      clearInterval(pinger)
      for (const stream of streams) stream.end()
      for (const server of [ingest, read]) { server.close(); server.closeAllConnections() }
    }
  }
}
