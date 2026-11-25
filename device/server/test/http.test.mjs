import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { openStore } from '../store.mjs'
import { createHttp, parseTokens } from '../http.mjs'

const T0 = 1_795_000_000_000
const TOKEN = 'test-token-aaaaaaaa'
let clock = T0
let store, http, ingestPort, readPort

before(async () => {
  store = openStore(':memory:')
  http = createHttp({
    store,
    tokens: parseTokens(`austral-device:${TOKEN},other-device:other-token`),
    allowedHosts: new Set(['allowed.test']),
    pingMs: 100,
    now: () => clock
  })
  await Promise.all([http.ingest, http.read].map((s) => new Promise((resolve) => s.listen(0, '127.0.0.1', resolve))))
  ingestPort = http.ingest.address().port
  readPort = http.read.address().port
})

after(() => { http.close(); store.close() })

const body = (seq, entries = [], extra = {}) => JSON.stringify({ device: 'austral-device', boot: 1, seq, entries, ...extra })
const entry = (value, id = 'sensor/product_temperature', age = 0) => ({ id, age, value })

function post (payload, headers = {}) {
  return fetch(`http://127.0.0.1:${ingestPort}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    body: payload
  })
}

const get = (path, host = 'allowed.test') => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: readPort, path, headers: { Host: host } }, (res) => {
    let text = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { text += chunk })
    res.on('end', () => resolve({ status: res.statusCode, text, type: res.headers['content-type'] }))
  })
  req.on('error', reject)
  req.end()
})

test('ingest answers 204 for a good batch', async () => {
  const res = await post(body(0, [entry('-18.4')]))
  assert.equal(res.status, 204)
})

test('ingest answers 401 without a token, with a wrong token or for another device', async () => {
  assert.equal((await post(body(1), { Authorization: '' })).status, 401)
  assert.equal((await post(body(1), { Authorization: 'Bearer nope' })).status, 401)
  assert.equal((await post(body(1), { Authorization: 'Basic abc' })).status, 401)
  assert.equal((await post(body(1, [], { device: 'other-device' }))).status, 401)
})

test('ingest answers 400 for bad JSON and fields outside the rules', async () => {
  for (const bad of [
    'not json', '[]', 'null',
    body(1, [], { device: 'Bad Device' }),
    body(1, [], { boot: 1.5 }), body(1, [], { boot: 2 ** 32 }), body(1, [], { seq: -1 }), body(1, [], { seq: '1' }),
    body(1, 'x'),
    body(1, [{ id: 'sensor/product_temperature', age: -1, value: '1.0' }]),
    body(1, [{ id: 'sensor/product_temperature', age: 86_400_001, value: '1.0' }]),
    body(1, [{ id: 'sensor/product_temperature', age: 1.5, value: '1.0' }]),
    body(1, [{ id: 'sensor/product_temperature', age: 0, value: 1.0 }]),
    body(1, Array.from({ length: 513 }, () => entry('1.0')))
  ]) {
    assert.equal((await post(bad)).status, 400, bad.slice(0, 60))
  }
})

test('ingest answers 413 above 64 KiB', async () => {
  const res = await post(JSON.stringify({ pad: 'x'.repeat(70 * 1024) }))
  assert.equal(res.status, 413)
})

test('ingest listener serves nothing else', async () => {
  assert.equal((await fetch(`http://127.0.0.1:${ingestPort}/api/devices`)).status, 404)
  assert.equal((await fetch(`http://127.0.0.1:${ingestPort}/ingest`)).status, 405)
})

test('a repeated batch is accepted and does not write twice', async () => {
  assert.equal((await post(body(10, [entry('-1.0')]))).status, 204)
  clock += 1000
  assert.equal((await post(body(10, [entry('-2.0')]))).status, 204)
  const series = JSON.parse((await get(`/api/series?device=austral-device&sensor=product_temperature&from=${T0 - 1000}&to=${clock + 1}&points=1`)).text)
  assert.ok(!series.points.some(([, v]) => v === -2))
})

test('read listener answers 421 for a Host outside the allowlist', async () => {
  assert.equal((await get('/api/devices', 'evil.test')).status, 421)
  assert.equal((await get('/', 'evil.test')).status, 421)
})

test('read listener serves the page and the script', async () => {
  const page = await get('/')
  assert.equal(page.status, 200)
  assert.match(page.type, /text\/html/)
  const script = await get('/monitor.js')
  assert.equal(script.status, 200)
  assert.match(script.type, /javascript/)
  assert.equal((await get('/index.html')).status, 404)
  assert.equal((await get('/api/state')).status, 404)
})

test('/api/devices lists what was ingested', async () => {
  const devices = JSON.parse((await get('/api/devices')).text)
  assert.equal(devices[0].id, 'austral-device')
  assert.equal(devices[0].sensors[0].id, 'product_temperature')
})

test('/api/series validates parameters', async () => {
  const base = 'device=austral-device&sensor=product_temperature'
  for (const query of [
    '', 'device=austral-device', 'sensor=product_temperature', 'device=A&sensor=x', `${base}&points=0`, `${base}&points=2001`,
    `${base}&points=1.5`, `${base}&from=abc`, `${base}&to=-5`, `${base}&from=100&to=100`, `${base}&from=200&to=100`
  ]) {
    const res = await get(`/api/series?${query}`)
    assert.equal(res.status, 400, query)
    assert.equal(typeof JSON.parse(res.text).error, 'string')
  }
  const ok = await get(`/api/series?${base}`)
  assert.equal(ok.status, 200)
  const series = JSON.parse(ok.text)
  assert.equal(series.to, clock)
  assert.equal(series.from, clock - 3_600_000)
  assert.equal(series.bucketMs, 3600)
})

test('/api/stream sends reading, state and status events and pings', async () => {
  const frames = await new Promise((resolve, reject) => {
    let text = ''
    const req = request({ host: '127.0.0.1', port: readPort, path: '/api/stream', headers: { Host: 'allowed.test' } }, (res) => {
      assert.match(res.headers['content-type'], /text\/event-stream/)
      res.setEncoding('utf8')
      res.on('data', async (chunk) => {
        if (text === '') {
          text = chunk
          clock += 60_000
          await post(JSON.stringify({
            device: 'austral-device', boot: 1, seq: 100, entries: [entry('-7.5', 'sensor/product_temperature', 20), entry('ON', 'binary_sensor/door_open')]
          }))
          http.broadcast(store.expire(clock + 60_000))
          return
        }
        text += chunk
        if (text.includes(': ping') && text.includes('event: state') && text.includes('event: status')) { req.destroy(); resolve(text) }
      })
    })
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e) })
    req.end()
    setTimeout(() => reject(new Error(`stream timeout: ${text}`)), 4000).unref()
  })
  assert.match(frames, /event: reading\ndata: \{"device":"austral-device","sensor":"product_temperature","t":\d+,"v":-7.5\}\n\n/)
  assert.match(frames, /event: state\ndata: \{"device":"austral-device","id":"binary_sensor\/door_open","t":\d+,"value":"ON"\}\n\n/)
  assert.match(frames, /event: status\ndata: \{"device":"austral-device","status":"offline","t":\d+\}\n\n/)
  assert.match(frames, /^: ok/)
})
