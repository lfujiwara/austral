import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHttp, parseTokens } from './http.mjs'
import { openStore } from './store.mjs'

function env (name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

function port (name, fallback) {
  const value = Number(env(name, fallback))
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} is not a port`)
  return value
}

function listen (server, host, portNumber) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(portNumber, host, resolve)
  })
}

const dbPath = env('AUSTRAL_DB_PATH')
const tokens = parseTokens(env('AUSTRAL_DEVICE_TOKENS'))
const ingestHost = env('AUSTRAL_INGEST_HOST', '127.0.0.1')
const ingestPort = port('AUSTRAL_INGEST_PORT', '8081')
const httpHost = env('AUSTRAL_HTTP_HOST', '127.0.0.1')
const httpPort = port('AUSTRAL_HTTP_PORT', '8080')
const allowedHosts = new Set(
  env('AUSTRAL_HTTP_ALLOWED_HOSTS', `127.0.0.1:${httpPort},localhost:${httpPort}`)
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
)
const offlineAfterMs = Number(env('AUSTRAL_OFFLINE_AFTER_MS', '15000'))
if (!Number.isInteger(offlineAfterMs) || offlineAfterMs < 1) throw new Error('AUSTRAL_OFFLINE_AFTER_MS is not a positive integer')

mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
const store = openStore(dbPath, { offlineAfterMs })
const http = createHttp({ store, tokens, allowedHosts })

await listen(http.ingest, ingestHost, ingestPort)
await listen(http.read, httpHost, httpPort)
console.log(`ingest on ${ingestHost}:${ingestPort}, read on ${httpHost}:${httpPort}`)

const timer = setInterval(() => http.broadcast(store.expire(Date.now())), 1000)

function stop () {
  clearInterval(timer)
  http.close()
  store.close()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
