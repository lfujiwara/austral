import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const dev = join(root, 'dev')
const deviceLog = join(root, '.local', 'run', 'device.log')
const base = `http://127.0.0.1:${process.env.AUSTRAL_HTTP_PORT ?? 8080}`
const schema = JSON.parse(readFileSync(join(root, 'schema', 'mqtt.json'), 'utf8'))

const run = (...args) => execFileSync(dev, args, { stdio: 'inherit' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function device () {
  try {
    const state = await (await fetch(`${base}/api/state`)).json()
    return state['austral-device']
  } catch {
    return undefined
  }
}

function latest (state, sensor) {
  const series = state?.series?.[sensor]
  return series?.length ? series[series.length - 1] : undefined
}

async function waitFor (description, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) {
      console.log(`ok  ${description}`)
      return
    }
    await sleep(1000)
  }
  throw new Error(`timed out: ${description}`)
}

const reads = (sensor, value) => async () => latest(await device(), sensor)?.[1] === value
const boots = () => readFileSync(deviceLog, 'utf8').split('Running through setup()').length - 1

async function checkSchema () {
  const seen = (await (await fetch(`${base}/api/messages`)).json())['austral-device'] ?? {}
  const missing = schema.published.filter((entry) => entry.at_boot !== false && seen[entry.topic]?.valid !== true)
  const offSchema = Object.entries(seen).filter(([, message]) => message.invalid > 0)
  const buzzer = Object.keys(seen).filter((topic) => topic.toLowerCase().includes('buzzer'))
  const threshold = seen['number/alarm_threshold/state']
  const thresholdValue = Number(threshold?.payload)
  if (missing.length || offSchema.length || buzzer.length || threshold?.valid !== true || thresholdValue !== 5) {
    throw new Error(`schema: missing or invalid ${JSON.stringify(missing.map((entry) => entry.topic))}, ` +
      `off schema ${JSON.stringify(offSchema.map(([topic, message]) => [topic, message.invalid, message.payload]))}, ` +
      `buzzer ${JSON.stringify(buzzer)}, alarm threshold ${threshold?.payload}`)
  }
  console.log(`ok  every message matches schema/mqtt.json (${Object.keys(seen).length} topics, buzzer disabled, alarm threshold 5 °C)`)
}

let failed = false
try {
  run('down')
  run('build')
  run('temps', '-21.25')
  run('wifi', 'on')
  run('up')

  await waitFor('device connects to the broker', async () => (await device())?.status === 'online', 180_000)
  await waitFor('clock synchronized over SNTP', () => readFileSync(deviceLog, 'utf8').includes('Synchronized time'), 120_000)
  await waitFor('air reads -21.2 °C', reads('air_temperature', -21.2), 60_000)

  run('temps', '-10')
  await waitFor('air follows the injected -10 °C', reads('air_temperature', -10), 60_000)
  run('temps', '85')
  await waitFor('a real 85 °C reading is not taken for the power-on value', reads('air_temperature', 85), 60_000)
  run('temps', '-10')

  run('temps', 'unplugged')
  await waitFor('unplugged air probe reads as missing', reads('air_temperature', null), 60_000)
  run('temps', '-21.25')
  await waitFor('air probe reads again after replug', reads('air_temperature', -21.2), 60_000)

  run('wifi', 'off')
  await waitFor('broker marks the device offline', async () => (await device())?.status === 'offline', 120_000)
  const lastBeforeReconnect = latest(await device(), 'air_temperature')[0]
  run('wifi', 'on')
  await waitFor('device reconnects after the Wi-Fi returns', async () => (await device())?.status === 'online', 300_000)
  await waitFor('readings resume after reconnecting', async () => {
    const reading = latest(await device(), 'air_temperature')
    return reading && reading[0] > lastBeforeReconnect
  }, 60_000)

  const bootsBefore = boots()
  const otaStarted = Date.now()
  run('ota')
  await waitFor('device reboots into the OTA image', () => boots() > bootsBefore, 120_000)
  await waitFor('device is back online after the OTA reboot', async () => {
    const state = await device()
    return state?.status === 'online' && latest(state, 'air_temperature')?.[0] > otaStarted
  }, 180_000)

  await checkSchema()
} catch (error) {
  failed = true
  console.error(`FAIL ${error.message}`)
  console.error(`serial log: ${deviceLog}`)
} finally {
  run('down')
}
process.exit(failed ? 1 : 0)
