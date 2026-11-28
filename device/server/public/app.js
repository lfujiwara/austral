const lines = [
  { id: 'air_temperature', label: 'Air', color: '--air', dash: [], css: 'solid' }
]
const maxPoints = 4320
const devices = Object.create(null)
const messages = Object.create(null)
const verdicts = { true: ['matches', 'ok'], false: ['mismatch', 'mismatch'], null: ['not in schema', 'unknown'] }
const deviceSelect = document.getElementById('device')
const windowSelect = document.getElementById('window')
const canvas = document.getElementById('chart')

function entry (id) {
  devices[id] ??= { status: null, series: Object.create(null), states: Object.create(null) }
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
  if (event.kind === 'status') device.status = event.value
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
    points: (device.series[line.id] ?? []).filter(([at]) => at >= start)
  }))
  const values = visible.flatMap((line) => line.points.map(([, value]) => value)).filter((value) => value != null)
  if (!values.length) return
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (high - low < 2) { low -= 1; high += 1 }
  const pad = { left: 44, right: 8, top: 8, bottom: 22 }
  const x = (at) => pad.left + ((at - start) / (end - start)) * (width - pad.left - pad.right)
  const y = (value) => pad.top + ((high - value) / (high - low)) * (height - pad.top - pad.bottom)

  ctx.font = '600 11px Manrope, sans-serif'
  ctx.fillStyle = style.getPropertyValue('--muted')
  ctx.strokeStyle = style.getPropertyValue('--line')
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const value = low + ((high - low) * i) / 4
    ctx.beginPath()
    ctx.moveTo(pad.left, y(value))
    ctx.lineTo(width - pad.right, y(value))
    ctx.stroke()
    ctx.fillText(value.toFixed(1), 4, y(value) + 4)
  }
  for (let i = 0; i <= 4; i++) {
    const at = start + ((end - start) * i) / 4
    const text = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const textWidth = ctx.measureText(text).width
    ctx.fillText(text, Math.max(pad.left, Math.min(x(at) - textWidth / 2, width - pad.right - textWidth)), height - 6)
  }

  ctx.lineWidth = 2
  for (const line of visible) {
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

function render () {
  const device = devices[deviceSelect.value]
  if (!device) return
  renderStats(device)
  renderChart(device)
  renderMessages(messages[deviceSelect.value])
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
