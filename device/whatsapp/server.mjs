import { once } from 'node:events'
import { mkdir, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createConnection, createServer as createLockServer } from 'node:net'
import { join } from 'node:path'
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

// libsignal also writes session data directly to the global console.
const { log, error: reportError } = console
for (const method of ['log', 'info', 'debug', 'warn', 'error', 'trace']) console[method] = () => {}
const logger = pino({ level: 'silent' })

const host = '127.0.0.1'
const port = Number(process.env.AUSTRAL_WHATSAPP_PORT ?? 19001)
const authDir = process.env.AUSTRAL_WHATSAPP_AUTH_DIR ?? join(import.meta.dirname, '..', '.local', 'whatsapp-auth')
const recipient = process.env.AUSTRAL_WHATSAPP_RECIPIENT
const alarmTopic = /^austral\/([a-z0-9_-]{1,64})\/binary_sensor\/local_temperature_alarm\/state$/
const maxBodySize = 16 * 1024
let socket
let connected = false
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('AUSTRAL_WHATSAPP_PORT must be a TCP port from 1 to 65535')
}

if (recipient && !/^\d{8,15}$/.test(recipient)) {
  throw new Error('AUSTRAL_WHATSAPP_RECIPIENT must contain 8 to 15 digits, without + or spaces')
}

function respond (response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function connect () {
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  if (!process.stdout.isTTY && !state.creds.me?.id) {
    reportError('pair WhatsApp in a terminal with ./dev whatsapp before starting ./dev up')
    process.exit(1)
  }
  socket = makeWASocket({ auth: state, logger, markOnlineOnConnect: false })
  socket.ev.on('creds.update', saveCreds)
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (process.stdout.isTTY) qrcode.generate(qr, { small: true }, log)
      else reportError('pair WhatsApp in a terminal with ./dev whatsapp')
    }
    if (connection === 'open') {
      connected = true
      log('whatsapp connected')
    }
    if (connection === 'close') {
      connected = false
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        reportError(`whatsapp logged out; remove ${authDir} and restart to pair again`)
        return
      }
      setTimeout(() => connect().catch(() => {
        reportError('whatsapp reconnect failed; restart the receiver')
        process.exit(1)
      }), 1000)
    }
  })
}

const receiver = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/events') {
    response.writeHead(404).end()
    return
  }

  try {
    let body = ''
    let size = 0
    for await (const chunk of request) {
      size += Buffer.byteLength(chunk)
      if (size > maxBodySize) {
        respond(response, 413, { error: 'event too large' })
        return
      }
      body += chunk
    }
    let event
    try {
      event = JSON.parse(body)
    } catch {
      respond(response, 400, { error: 'invalid JSON' })
      return
    }
    if (typeof event?.topic !== 'string' || typeof event.payload !== 'string') {
      respond(response, 400, { error: 'topic and payload are required' })
      return
    }

    const match = alarmTopic.exec(event.topic)
    if (!match || event.payload !== 'ON') {
      respond(response, 202, { accepted: true, sent: false })
      return
    }
    if (!recipient) {
      reportError('temperature alarm received; set AUSTRAL_WHATSAPP_RECIPIENT to send it')
      respond(response, 503, { error: 'whatsapp recipient is not configured' })
      return
    }
    if (!connected) {
      respond(response, 503, { error: 'whatsapp is not connected' })
      return
    }

    try {
      await socket.sendMessage(`${recipient}@s.whatsapp.net`, {
        text: `Alerta Austral: o dispositivo ${match[1]} ativou o alarme local de temperatura.`
      })
    } catch {
      reportError('whatsapp send failed')
      respond(response, 502, { error: 'whatsapp send failed' })
      return
    }
    log('whatsapp temperature alarm submitted')
    respond(response, 202, { accepted: true, sent: true })
  } catch {
    reportError('event request failed')
    respond(response, 500, { error: 'event processing failed' })
  }
})

// Different receiver ports can still refer to the same Baileys session.
await mkdir(authDir, { recursive: true, mode: 0o700 })
const lockPath = join(authDir, 'receiver.sock')
const sessionGuard = createLockServer((client) => client.destroy())
process.once('exit', () => { if (sessionGuard.listening) sessionGuard.close() })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(0))

try {
  await new Promise((resolve, reject) => {
    const probe = createConnection(lockPath)
    probe.once('connect', () => {
      probe.destroy()
      reject(new Error('session is already locked'))
    })
    probe.once('error', resolve)
  })
  await unlink(lockPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
} catch {
  reportError(`WhatsApp session is locked at ${lockPath}; stop its receiver first`)
  process.exit(1)
}

try {
  sessionGuard.listen(lockPath)
  await once(sessionGuard, 'listening')
} catch (error) {
  reportError(error.code === 'EADDRINUSE'
    ? `WhatsApp session is locked at ${lockPath}; stop its receiver first`
    : 'cannot lock the WhatsApp session directory')
  process.exit(1)
}
try {
  receiver.listen(port, host)
  await once(receiver, 'listening')
} catch (error) {
  reportError(error.code === 'EADDRINUSE'
    ? `WhatsApp receiver port ${port} is already in use; choose AUSTRAL_WHATSAPP_PORT or use the existing receiver`
    : `cannot listen on WhatsApp receiver port ${port}`)
  process.exit(1)
}
try {
  await connect()
} catch {
  reportError('whatsapp connection setup failed; check the session directory and pair in a terminal with ./dev whatsapp')
  process.exit(1)
}
log(`whatsapp event receiver on http://${host}:${port}/events`)
if (!recipient) log('sending is disabled until AUSTRAL_WHATSAPP_RECIPIENT is configured')
