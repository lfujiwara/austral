import { chmodSync, readFileSync, writeFileSync } from 'node:fs'

function required (name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

function quote (value) {
  return JSON.stringify(value)
}

function setLine (text, key, value) {
  const line = `${key}: ${quote(value)}`
  const pattern = new RegExp(`^${key}:.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, line)
  return `${text.replace(/\s*$/, '')}\n${line}\n`
}

function replaceIfPlaceholder (text, key, placeholder, value) {
  const pattern = new RegExp(`^${key}:\\s*${placeholder}\\s*$`, 'm')
  if (!pattern.test(text)) return text
  return text.replace(pattern, `${key}: ${quote(value)}`)
}

const secretsPath = required('AUSTRAL_SECRETS_FILE')
const examplePath = required('AUSTRAL_SECRETS_EXAMPLE')
const ca = readFileSync(required('AUSTRAL_CA_FILE'), 'utf8').trim()
let text
try {
  text = readFileSync(secretsPath, 'utf8')
} catch {
  text = readFileSync(examplePath, 'utf8')
}

if (process.env.AUSTRAL_WIFI_SSID) text = setLine(text, 'wifi_ssid', process.env.AUSTRAL_WIFI_SSID)
if (process.env.AUSTRAL_WIFI_PASSWORD) text = setLine(text, 'wifi_password', process.env.AUSTRAL_WIFI_PASSWORD)
text = setLine(text, 'mqtt_broker', required('AUSTRAL_MQTT_BROKER'))
text = setLine(text, 'mqtt_username', required('AUSTRAL_MQTT_USERNAME'))
text = setLine(text, 'mqtt_password', required('AUSTRAL_MQTT_PASSWORD'))
text = replaceIfPlaceholder(text, 'ota_password', '"ota-password"', required('AUSTRAL_OTA_PASSWORD'))
text = replaceIfPlaceholder(text, 'fallback_password', '"fallback-access-point-password"', required('AUSTRAL_FALLBACK_PASSWORD'))
text = text.replace(/^mqtt_ca:\s*\|?\r?\n(?:[ \t].*\r?\n)*/m, '')
const body = ca.split(/\r?\n/).map((line) => `  ${line}`).join('\n')
text = `${text.replace(/\s*$/, '')}\nmqtt_ca: |\n${body}\n`

writeFileSync(secretsPath, text, { mode: 0o600 })
chmodSync(secretsPath, 0o600)

const wifiReady = /^wifi_ssid:\s*"(?!YOUR_2_4_GHZ_NETWORK")[^"]+"\s*$/m.test(text) &&
  /^wifi_password:\s*"(?!YOUR_WIFI_PASSWORD")[^"]+"\s*$/m.test(text)
process.stdout.write(wifiReady ? 'wifi=ready\n' : 'wifi=missing\n')
