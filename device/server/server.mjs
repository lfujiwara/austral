import { createServer as createTlsServer } from 'node:tls'
import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { Aedes } from 'aedes'

const bindHost = process.env.AUSTRAL_BIND ?? '127.0.0.1'
const mqttPort = 8883
const httpPort = Number(process.env.AUSTRAL_HTTP_PORT ?? 8080)
const tlsDir = required('AUSTRAL_TLS_DIR')
const username = required('AUSTRAL_MQTT_USERNAME')
const password = Buffer.from(required('AUSTRAL_MQTT_PASSWORD'))
const publicDir = join(import.meta.dirname, 'public')
const schemaFile = join(import.meta.dirname, '..', 'schema', 'mqtt.json')
const maxPoints = 4320
const maxDevices = 32
const maxTopicsPerDevice = 128
const maxStoredPayload = 1024

function required (name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/**
 * @typedef {{ status: string | null,
 *   series: Record<string, Array<[number, number | null]>>,
 *   states: Record<string, string> }} Device
 * @typedef {{ payload: string, at: number, count: number, invalid: number, valid: boolean | null }} Message
 *   valid is null for a topic the schema does not list.
 */
/** @type {Map<string, Device>} */
const devices = new Map()
/** @type {Map<string, Record<string, Message>>} last raw message per device and topic suffix */
const messages = new Map()
const identifier = /^[a-z0-9_-]{1,64}$/
const listeners = new Set()
const schema = JSON.parse(await readFile(schemaFile, 'utf8'))
const patterns = new Map([...schema.published, ...schema.commands].map((entry) => [entry.topic, new RegExp(entry.pattern)]))

function device (id) {
  if (!devices.has(id)) devices.set(id, { status: null, series: Object.create(null), states: Object.create(null) })
  return devices.get(id)
}

function accepts (deviceId, suffix) {
  const known = messages.get(deviceId)
  if (known) return suffix in known || Object.keys(known).length < maxTopicsPerDevice
  return messages.size < maxDevices
}

// Topics follow ESPHome: austral/<device>/status and austral/<device>/<component>/<entity>/state.
function parseTopic (topic) {
  const parts = topic.split('/')
  if (parts[0] !== 'austral' || !identifier.test(parts[1] ?? '')) return null
  if (parts.length === 3 && parts[2] === 'status') return { device: parts[1], kind: 'status' }
  if (parts.length === 5 && parts[4] === 'state' && identifier.test(parts[2]) && identifier.test(parts[3])) {
    return { device: parts[1], kind: parts[2] === 'sensor' ? 'sensor' : 'state', id: `${parts[2]}/${parts[3]}` }
  }
  return null
}

function broadcast (event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const response of listeners) response.write(line)
}

function recordMessage (topic, payload, at) {
  const [prefix, deviceId, ...rest] = topic.split('/')
  if (prefix !== 'austral' || !identifier.test(deviceId ?? '') || !rest.length) return
  const suffix = rest.join('/')
  if (!accepts(deviceId, suffix)) return false
  const pattern = patterns.get(suffix)
  if (!messages.has(deviceId)) messages.set(deviceId, Object.create(null))
  const previous = messages.get(deviceId)[suffix]
  const valid = pattern ? pattern.test(payload) : null
  const message = {
    payload: payload.slice(0, maxStoredPayload),
    at,
    count: (previous?.count ?? 0) + 1,
    invalid: (previous?.invalid ?? 0) + (valid === true ? 0 : 1),
    valid
  }
  messages.get(deviceId)[suffix] = message
  broadcast({ device: deviceId, kind: 'message', id: suffix, ...message })
  return valid === true
}

function record (topic, payload, at) {
  if (!recordMessage(topic, payload, at)) return
  const parsed = parseTopic(topic)
  if (!parsed) return
  const entry = device(parsed.device)
  let event
  if (parsed.kind === 'status') {
    entry.status = payload
    event = { device: parsed.device, kind: 'status', value: payload, at }
  } else if (parsed.kind === 'sensor') {
    const number = Number(payload)
    const value = payload.trim() === '' || !Number.isFinite(number) ? null : number
    const id = parsed.id.slice('sensor/'.length)
    const series = (entry.series[id] ??= [])
    series.push([at, value])
    if (series.length > maxPoints) series.splice(0, series.length - maxPoints)
    event = { device: parsed.device, kind: 'sensor', id, value, at }
  } else {
    entry.states[parsed.id] = payload
    event = { device: parsed.device, kind: 'state', id: parsed.id, value: payload, at }
  }
  broadcast(event)
}

const broker = await Aedes.createBroker()
broker.authenticate = (client, user, pass, done) => {
  const ok = user === username && pass?.length === password.length && timingSafeEqual(pass, password)
  done(null, ok)
}
broker.on('publish', (packet, client) => {
  if (client) record(packet.topic, packet.payload.toString(), Date.now())
})

const [cert, key] = await Promise.all([
  readFile(join(tlsDir, 'server.pem')),
  readFile(join(tlsDir, 'server.key'))
])
createTlsServer({ cert, key }, broker.handle).listen(mqttPort, bindHost, () => {
  console.log(`mqtt broker on mqtts://${bindHost}:${mqttPort}`)
})

const pages = {
  '/': [join(publicDir, 'index.html'), 'text/html; charset=utf-8'],
  '/app.js': [join(publicDir, 'app.js'), 'text/javascript; charset=utf-8'],
  '/manrope.woff2': [join(import.meta.dirname, '..', '..', 'assets', 'fonts', 'manrope.woff2'), 'font/woff2']
}

const allowedHosts = new Set([`127.0.0.1:${httpPort}`, `localhost:${httpPort}`])
for (const name of (process.env.AUSTRAL_LAN_HOSTS ?? '').split(',')) {
  const trimmed = name.trim().toLowerCase()
  if (trimmed) allowedHosts.add(trimmed.includes(':') ? trimmed : `${trimmed}:${httpPort}`)
}

createHttpServer(async (request, response) => {
  try {
    await serve(request, response)
  } catch {
    if (!response.headersSent) response.writeHead(500)
    response.end()
  }
}).listen(httpPort, bindHost, () => {
  console.log(`chart on http://${bindHost}:${httpPort}`)
})

async function serve (request, response) {
  if (!allowedHosts.has((request.headers.host ?? '').toLowerCase())) {
    response.writeHead(421).end()
    return
  }
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (url.pathname === '/api/state') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(Object.fromEntries(devices)))
    return
  }
  if (url.pathname === '/api/messages') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(Object.fromEntries(messages)))
    return
  }
  if (url.pathname === '/api/schema') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(schema))
    return
  }
  if (url.pathname === '/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    response.write(': connected\n\n')
    listeners.add(response)
    request.on('close', () => listeners.delete(response))
    return
  }
  const page = pages[url.pathname]
  if (!page) {
    response.writeHead(404).end()
    return
  }
  const body = await readFile(page[0])
  response.writeHead(200, { 'content-type': page[1] })
  response.end(body)
}
