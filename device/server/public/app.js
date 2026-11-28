const lines = [
  { id: 'air_temperature', label: 'Air', color: '--air', dash: [], css: 'solid', axis: 'left', unit: '°C', digits: 1, minSpan: 2 },
  { id: 'door_distance', label: 'Door distance', color: '--distance', dash: [6, 4], css: 'dashed', axis: 'right', unit: 'm', digits: 2, minSpan: 0.2 }
]
const maxPoints = 4320
const maxProbeFailures = 20
const devices = Object.create(null)
const messages = Object.create(null)
const verdicts = { true: ['matches', 'ok'], false: ['mismatch', 'mismatch'], null: ['not in schema', 'unknown'] }
const deviceSelect = document.getElementById('device')
const windowSelect = document.getElementById('window')
const canvas = document.getElementById('chart')

function entry (id) {
  devices[id] ??= { status: null, series: Object.create(null), states: Object.create(null), probeFailures: [] }
  if (![...deviceSelect.options].some((option) => option.value === id)) deviceSelect.add(new Option(id, id))
  return devices[id]
}

function apply (event) {
  if (event.kind === 'message') {
    entry(event.device)
    ;(messages[event.device] ??= Object.create(null))[event.id] = event
    return
  }
  const device = entry(event.device)
  if (event.kind === 'probe') {
    device.probeFailures.push({ at: event.at, bytes: event.bytes, received: event.received, computed: event.computed })
    if (device.probeFailures.length > maxProbeFailures) device.probeFailures.splice(0, device.probeFailures.length - maxProbeFailures)
  } else if (event.kind === 'status') device.status = event.value
  else if (event.kind === 'state') device.states[event.id] = event.value
  else {
    const series = (device.series[event.id] ??= [])
    series.push([event.at, event.value])
    if (series.length > maxPoints) series.splice(0, series.length - maxPoints)
  }
}

function latest (series) {
  return series?.length ? series[series.length - 1][1] : undefined
}

function escape (text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function format (value, unit, digits = 1) {
  return value == null ? 'n/a' : `${value.toFixed(digits)}${unit}`
}

function renderStats (device) {
  const alarm = device.states['binary_sensor/local_temperature_alarm']
  const door = device.states['binary_sensor/door_open']
  const cells = [
    ['Status', device.status ?? 'unknown', device.status === 'online' ? 'online' : 'offline'],
    ['Air', format(latest(device.series.air_temperature), ' °C')],
    ['Door distance', format(latest(device.series.door_distance), ' m', 3)],
    ['Door', door ?? 'not reported', door === 'ON' ? 'alarm' : ''],
    ['Local alarm', alarm ?? 'not reported', alarm === 'ON' ? 'alarm' : ''],
    ['Wi-Fi signal', format(latest(device.series.wifi_signal), ' dBm', 0)],
    ['Uptime', format(latest(device.series.uptime), ' s', 0)]
  ]
  document.getElementById('stats').innerHTML = cells
    .map(([name, value, css]) => `<div class="stat"><span>${name}</span><strong class="${css ?? ''}">${escape(value)}</strong></div>`)
    .join('')
}

function axisRange (points, minSpan) {
  const values = points.map(([, value]) => value).filter((value) => value != null)
  if (!values.length) return null
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (high - low < minSpan) {
    const mid = (high + low) / 2
    low = mid - minSpan / 2
    high = mid + minSpan / 2
  }
  return { low, high }
}

function renderChart (device) {
  const style = getComputedStyle(document.documentElement)
  const scale = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.clearRect(0, 0, width, height)

  const end = Date.now()
  const start = end - Number(windowSelect.value)
  const visible = lines.map((line) => ({
    ...line,
    points: (device.series[line.id] ?? []).filter(([at]) => at >= start),
    range: null
  }))
  for (const line of visible) line.range = axisRange(line.points, line.minSpan)
  if (!visible.some((line) => line.range)) return

  const pad = { left: 52, right: 52, top: 20, bottom: 22 }
  const plotHeight = height - pad.top - pad.bottom
  const x = (at) => pad.left + ((at - start) / (end - start)) * (width - pad.left - pad.right)
  const yOf = (range) => (value) => pad.top + ((range.high - value) / (range.high - range.low)) * plotHeight

  ctx.font = '600 11px Manrope, sans-serif'
  ctx.lineWidth = 1
  const grid = visible.find((line) => line.axis === 'left' && line.range) ?? visible.find((line) => line.range)
  const gridY = yOf(grid.range)
  ctx.strokeStyle = style.getPropertyValue('--line')
  ctx.fillStyle = style.getPropertyValue('--muted')
  for (let i = 0; i <= 4; i++) {
    const value = grid.range.low + ((grid.range.high - grid.range.low) * i) / 4
    const y = gridY(value)
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(width - pad.right, y)
    ctx.stroke()
  }
  for (const line of visible) {
    if (!line.range) continue
    const y = yOf(line.range)
    const left = line.axis === 'left'
    ctx.fillStyle = style.getPropertyValue(line.color)
    ctx.textAlign = left ? 'left' : 'right'
    ctx.fillText(line.unit, left ? 4 : width - 4, 12)
    ctx.fillStyle = style.getPropertyValue('--muted')
    for (let i = 0; i <= 4; i++) {
      const value = line.range.low + ((line.range.high - line.range.low) * i) / 4
      ctx.fillText(value.toFixed(line.digits), left ? 4 : width - 4, y(value) + 4)
    }
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = style.getPropertyValue('--muted')
  for (let i = 0; i <= 4; i++) {
    const at = start + ((end - start) * i) / 4
    const text = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const textWidth = ctx.measureText(text).width
    ctx.fillText(text, Math.max(pad.left, Math.min(x(at) - textWidth / 2, width - pad.right - textWidth)), height - 6)
  }

  ctx.lineWidth = 2
  for (const line of visible) {
    if (!line.range) continue
    const y = yOf(line.range)
    ctx.strokeStyle = style.getPropertyValue(line.color)
    ctx.setLineDash(line.dash)
    ctx.beginPath()
    let drawing = false
    for (const [at, value] of line.points) {
      if (value == null) { drawing = false; continue }
      if (drawing) ctx.lineTo(x(at), y(value))
      else ctx.moveTo(x(at), y(value))
      drawing = true
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function renderMessages (byTopic) {
  const now = Date.now()
  document.getElementById('messages').innerHTML = Object.entries(byTopic ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, message]) => {
      const payload = message.payload.replace(/\x1b\[[0-9;]*m/g, '')
      const [verdict, css] = verdicts[message.valid]
      const age = Math.max(0, Math.round((now - message.at) / 1000))
      return `<tr><td>${escape(topic)}</td><td class="payload">${escape(payload.slice(0, 120))}</td>` +
        `<td class="num">${message.count}</td><td class="num">${age} s ago</td><td><span class="verdict ${css}">${verdict}</span></td></tr>`
    })
    .join('')
}

function renderProbe (device) {
  const failures = device.probeFailures
  document.getElementById('probe-summary').textContent = failures.length
    ? `The probe checksum failed ${failures.length} time${failures.length === 1 ? '' : 's'} since the server started (last ${failures.length} shown, newest first). Bytes are the 9 scratch pad bytes the probe sent. Received is the 9th byte, computed is the CRC the device calculated from the first 8.`
    : 'No checksum failure reported since the server started.'
  document.getElementById('probe').innerHTML = failures
    .slice()
    .reverse()
    .map((failure) => `<tr><td class="num">${new Date(failure.at).toLocaleTimeString()}</td>` +
      `<td class="payload">${escape(failure.bytes.join(' '))}</td>` +
      `<td class="payload">${escape(failure.received)}</td><td class="payload">${escape(failure.computed)}</td></tr>`)
    .join('')
}

function render () {
  const device = devices[deviceSelect.value]
  if (!device) return
  renderStats(device)
  renderChart(device)
  renderMessages(messages[deviceSelect.value])
  renderProbe(device)
}

document.getElementById('legend').innerHTML = lines
  .map((line) => `<span><i style="border-top: 3px ${line.css} var(${line.color})"></i>${line.label}</span>`)
  .join('')
deviceSelect.addEventListener('change', render)
windowSelect.addEventListener('change', render)
window.addEventListener('resize', render)

async function loadSnapshot () {
  const [state, byDevice] = await Promise.all([
    fetch('/api/state').then((response) => response.json()),
    fetch('/api/messages').then((response) => response.json())
  ])
  for (const [id, device] of Object.entries(state)) Object.assign(entry(id), device)
  for (const [id, byTopic] of Object.entries(byDevice)) messages[id] = byTopic
  render()
}

function isNew (event) {
  if (event.kind === 'message') return !(messages[event.device]?.[event.id]?.at >= event.at)
  if (event.kind === 'probe') return !devices[event.device]?.probeFailures.some((failure) => failure.at >= event.at)
  if (event.kind !== 'sensor') return true
  const series = devices[event.device]?.series[event.id]
  return !(series?.length && series[series.length - 1][0] >= event.at)
}

// Events that arrive while the snapshot loads are held, then applied only if the snapshot lacks them.
let held = null
const events = new EventSource('/events')
events.onopen = async () => {
  held = []
  try {
    await loadSnapshot()
  } finally {
    const queued = held
    held = null
    for (const event of queued) if (isNew(event)) apply(event)
    render()
  }
}
events.onmessage = (message) => {
  const event = JSON.parse(message.data)
  if (held) {
    held.push(event)
    return
  }
  apply(event)
  render()
}
setInterval(render, 5000)
