const labels = {
  product_temperature: 'Produto',
  air_temperature: 'Ar',
  ambient_temperature: 'Ambiente',
  door_distance: 'Distância da porta',
  wifi_signal: 'Sinal Wi-Fi',
  uptime: 'Tempo ligado'
}
const lines = [
  { id: 'product_temperature', color: '--product', dash: [], css: 'solid' },
  { id: 'air_temperature', color: '--air', dash: [8, 5], css: 'dashed' },
  { id: 'ambient_temperature', color: '--ambient', dash: [2, 4], css: 'dotted' }
]
const tempIds = lines.map((line) => line.id)
const ranges = [['1 h', 3600e3], ['24 h', 86400e3], ['7 dias', 7 * 86400e3]]
const minGapMs = 90e3

const $ = (id) => document.getElementById(id)
const els = {
  device: $('device'), status: $('status'), seen: $('seen'), conn: $('conn'), connText: $('conn-text'),
  empty: $('empty'), tilesPanel: $('tiles-panel'), tiles: $('tiles'), tempPanel: $('temp-panel'),
  doorPanel: $('door-panel'), temp: $('temp-chart'), door: $('door-chart'), ranges: $('ranges')
}

let devices = []
let selected = null
let rangeMs = ranges[0][1]
let series = {} // sensor id -> { points: [[t, v]], bucketMs, buffer: [] | null }
let loadToken = 0
let connected = false

// The door sensor reports meters; the page shows centimeters.
// ponytail: assumes door_distance and number/door_closed_distance are in meters, api.md gives no unit for the state.
function toCm (value, unit) { return value != null && unit === 'm' ? value * 100 : value }

const current = () => devices.find((device) => device.id === selected)
const sensorOf = (device, id) => device?.sensors.find((sensor) => sensor.id === id)
const unitOf = (device, id) => sensorOf(device, id)?.unit ?? null
const hasDoor = (device) => !!sensorOf(device, 'door_distance')

function number (value, digits = 1) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function age (t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

function duration (s) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

function renderHeader () {
  const device = current()
  els.status.className = 'pill'
  if (!device) { els.status.textContent = 'sem dados'; els.status.classList.add('idle'); els.seen.textContent = ''; return }
  if (device.status === 'online') els.status.textContent = 'online'
  else if (device.status === 'offline') { els.status.textContent = 'offline'; els.status.classList.add('off') }
  else { els.status.textContent = 'sem status'; els.status.classList.add('idle') }
  els.seen.textContent = device.lastSeen ? `visto há ${age(device.lastSeen)}` : ''
}

function renderConn () {
  els.conn.classList.toggle('on', connected)
  els.connText.textContent = connected ? 'ao vivo' : 'reconectando'
}

function tileOrder (device) {
  const rank = (id) => tempIds.includes(id) ? tempIds.indexOf(id) : id === 'door_distance' ? 3 : 4
  return [...device.sensors].sort((a, b) => rank(a.id) - rank(b.id))
}

function tileValue (sensor) {
  const v = sensor.last?.v
  if (v == null) return ['sem leitura', '']
  if (sensor.id === 'uptime') return [duration(v), '']
  if (sensor.id === 'door_distance') return [number(toCm(v, sensor.unit)), sensor.unit === 'm' ? 'cm' : (sensor.unit ?? '')]
  return [number(v, Number.isInteger(v) && sensor.unit !== '°C' ? 0 : 1), sensor.unit ?? '']
}

function doorTile (device) {
  const open = device.states['binary_sensor/door_open']?.value
  const base = device.states['number/door_closed_distance']?.value
  const baseCm = base != null && Number.isFinite(Number(base)) ? number(Number(base) * 100) : null
  const text = open === 'ON' ? 'aberta' : open === 'OFF' ? 'fechada' : 'sem calibração'
  return `<div class="tile ${open === 'ON' ? 'alert' : ''}"><span>Porta</span><strong>${text}</strong>` +
    `<em>${baseCm ? `fechada a ${baseCm} cm` : 'distância de referência não definida'}</em></div>`
}

function renderTiles () {
  const device = current()
  if (!device) return
  const sensors = tileOrder(device).map((sensor) => {
    const [value, unit] = tileValue(sensor)
    const name = labels[sensor.id] ?? sensor.id.replace(/_/g, ' ')
    return { id: sensor.id, html: `<div class="tile"><span>${name}</span><strong>${value}${unit ? `<small>${unit}</small>` : ''}</strong></div>` }
  })
  // Door state sits right after door_distance, or after the temperatures when there is no distance sensor.
  const doorKnown = hasDoor(device) || device.states['binary_sensor/door_open'] || device.states['number/door_closed_distance']
  let at = sensors.findIndex((s) => s.id === 'door_distance')
  if (at < 0) at = sensors.filter((s) => tempIds.includes(s.id)).length
  const html = sensors.map((s) => s.html)
  if (doorKnown) html.splice(at + (sensors[at]?.id === 'door_distance' ? 1 : 0), 0, doorTile(device))
  els.tiles.innerHTML = html.join('')
}

// ---- chart ----

function drawChart (canvas, set, { baseline = null, unit = '', digits = 1 } = {}) {
  const style = getComputedStyle(document.documentElement)
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  canvas.width = width * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  const end = Date.now()
  const start = end - rangeMs
  const visible = set.map((line) => ({ ...line, points: line.points.filter(([t]) => t >= start - line.bucketMs) }))
  const values = visible.flatMap((line) => line.points.map(([, v]) => v)).filter((v) => v != null)
  if (baseline != null) values.push(baseline)
  ctx.font = '600 11px Manrope, sans-serif'
  ctx.fillStyle = style.getPropertyValue('--muted')
  if (!values.length) { ctx.fillText('Sem leituras neste período.', 8, 24); return }
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (high - low < 2) { low -= 1; high += 1 }
  const span = high - low
  low -= span * 0.05
  high += span * 0.05
  const pad = { left: 46, right: 8, top: 8, bottom: 22 }
  const x = (t) => pad.left + ((t - start) / (end - start)) * (width - pad.left - pad.right)
  const y = (v) => pad.top + ((high - v) / (high - low)) * (height - pad.top - pad.bottom)

  ctx.strokeStyle = style.getPropertyValue('--line')
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const v = low + ((high - low) * i) / 4
    ctx.beginPath()
    ctx.moveTo(pad.left, y(v))
    ctx.lineTo(width - pad.right, y(v))
    ctx.stroke()
    ctx.fillText(number(v, digits), 4, y(v) + 4)
  }
  const withDate = rangeMs > 86400e3
  const ticks = width < 420 ? 2 : 4
  for (let i = 0; i <= ticks; i++) {
    const t = start + ((end - start) * i) / ticks
    const d = new Date(t)
    const text = withDate
      ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const w = ctx.measureText(text).width
    ctx.fillText(text, Math.max(pad.left, Math.min(x(t) - w / 2, width - pad.right - w)), height - 6)
  }
  if (baseline != null) {
    ctx.strokeStyle = style.getPropertyValue('--muted')
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad.left, y(baseline))
    ctx.lineTo(width - pad.right, y(baseline))
    ctx.stroke()
  }

  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  for (const line of visible) {
    const color = style.getPropertyValue(line.color)
    ctx.strokeStyle = color
    ctx.fillStyle = color
    const gap = Math.max(minGapMs, line.bucketMs * 3)
    let prev = null // last drawn point of the current segment
    let lonely = null // segment of one point gets a dot
    ctx.setLineDash(line.dash)
    ctx.beginPath()
    for (const [t, v] of line.points) {
      if (v == null || (prev && t - prev[0] > gap)) {
        if (prev && lonely) { ctx.stroke(); ctx.beginPath(); ctx.arc(x(prev[0]), y(prev[1]), 2, 0, 7); ctx.fill(); ctx.beginPath() }
        prev = null
      }
      if (v == null) continue
      if (prev) { ctx.lineTo(x(t), y(v)); lonely = false } else { ctx.moveTo(x(t), y(v)); lonely = true }
      prev = [t, v]
    }
    ctx.stroke()
    if (prev && lonely) { ctx.beginPath(); ctx.arc(x(prev[0]), y(prev[1]), 2, 0, 7); ctx.fill() }
  }
  ctx.setLineDash([])
}

let drawQueued = false
function draw () {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(() => {
    drawQueued = false
    const device = current()
    if (!device) return
    drawChart(els.temp, lines.filter((line) => sensorOf(device, line.id)).map((line) => lineData(line, line.id)), { unit: '°C' })
    if (hasDoor(device)) {
      const base = Number(device.states['number/door_closed_distance']?.value)
      const unit = unitOf(device, 'door_distance')
      drawChart(els.door, [lineData({ color: '--door', dash: [] }, 'door_distance')], {
        baseline: Number.isFinite(base) ? toCm(base, 'm') : null, digits: 1, unit
      })
    }
  })
}

function lineData (line, id) {
  const s = series[id]
  const unit = unitOf(current(), id)
  const points = (s?.points ?? []).map(([t, v]) => [t, toCm(v, unit)])
  return { ...line, points, bucketMs: s?.bucketMs ?? 0 }
}

function renderLegend (device) {
  $('legend').innerHTML = lines.filter((line) => sensorOf(device, line.id))
    .map((line) => `<span><i style="border-top: 3px ${line.css} var(${line.color})"></i>${labels[line.id]}</span>`).join('')
}

// ---- data ----

async function getJson (url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json()
}

async function loadSeries (id, token) {
  const device = current()
  if (!device || !sensorOf(device, id)) return
  const entry = (series[id] = { points: [], bucketMs: 0, buffer: [] })
  const to = Date.now()
  const points = Math.max(100, Math.min(2000, Math.round(els.temp.clientWidth || 600)))
  try {
    const data = await getJson(`/api/series?device=${encodeURIComponent(device.id)}&sensor=${id}&from=${to - rangeMs}&to=${to}&points=${points}`)
    if (token !== loadToken) return
    entry.points = data.points
    entry.bucketMs = data.bucketMs
  } catch (error) {
    console.error(error)
  }
  if (token !== loadToken) return
  for (const point of entry.buffer) if (point[0] >= to) entry.points.push(point)
  entry.buffer = null
  draw()
}

function loadAll () {
  const device = current()
  const token = ++loadToken
  series = {}
  if (!device) return
  const ids = [...tempIds, 'door_distance'].filter((id) => sensorOf(device, id))
  ids.forEach((id) => loadSeries(id, token))
}

function show () {
  const device = current()
  const any = devices.length > 0
  els.empty.hidden = any
  els.tilesPanel.hidden = els.tempPanel.hidden = !any
  els.doorPanel.hidden = !device || !hasDoor(device)
  els.device.hidden = devices.length < 2
  if (device) { renderLegend(device); renderTiles() }
  renderHeader()
  draw()
}

async function refresh () {
  devices = await getJson('/api/devices')
  if (!devices.some((device) => device.id === selected)) selected = devices[0]?.id ?? null
  els.device.innerHTML = devices.map((device) => `<option value="${device.id.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}">${device.id.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</option>`).join('')
  els.device.value = selected ?? ''
  show()
  loadAll()
}

// ---- live ----

function deviceOf (id) {
  let device = devices.find((d) => d.id === id)
  if (!device) {
    // A device that appears after load: reload the list once.
    refresh().catch(console.error)
    return null
  }
  return device
}

function onReading ({ device: id, sensor, t, v }) {
  const device = deviceOf(id)
  if (!device) return
  device.lastSeen = t
  let known = sensorOf(device, sensor)
  if (!known) {
    known = { id: sensor, unit: null, last: null }
    device.sensors.push(known)
    device.sensors.sort((a, b) => a.id.localeCompare(b.id))
    if (id === selected && (tempIds.includes(sensor) || sensor === 'door_distance')) { show(); loadSeries(sensor, loadToken) }
  }
  known.last = { t, v }
  if (id !== selected) return
  const entry = series[sensor]
  if (entry) {
    if (entry.buffer) entry.buffer.push([t, v])
    else entry.points.push([t, v])
  }
  renderTiles()
  renderHeader()
  draw()
}

function onStatus ({ device: id, status, t }) {
  const device = deviceOf(id)
  if (!device) return
  device.status = status
  device.lastSeen = t
  if (id === selected) renderHeader()
}

function onState ({ device: id, id: key, t, value }) {
  const device = deviceOf(id)
  if (!device) return
  device.states[key] = { t, value }
  device.lastSeen = t
  if (id !== selected) return
  show()
}

let failed = false
function connect () {
  const source = new EventSource('/api/stream')
  const on = (name, handler) => source.addEventListener(name, (event) => {
    try { handler(JSON.parse(event.data)) } catch (error) { console.error(error) }
  })
  on('reading', onReading)
  on('status', onStatus)
  on('state', onState)
  source.onopen = () => {
    connected = true
    renderConn()
    // Events sent while the stream was down are lost, so reload after a reconnect.
    if (failed) { failed = false; refresh().catch(console.error) }
  }
  source.onerror = () => { connected = false; failed = true; renderConn() } // EventSource retries by itself
}

// ---- wiring ----

for (const [text, ms] of ranges) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text
  button.setAttribute('aria-pressed', ms === rangeMs)
  button.addEventListener('click', () => {
    rangeMs = ms
    for (const other of els.ranges.children) other.setAttribute('aria-pressed', other === button)
    loadAll()
  })
  els.ranges.append(button)
}
els.device.addEventListener('change', () => { selected = els.device.value; show(); loadAll() })
let resizeTimer
window.addEventListener('resize', () => { draw(); clearTimeout(resizeTimer); resizeTimer = setTimeout(loadAll, 300) })
setInterval(() => { renderHeader(); draw() }, 1000)

renderConn()
refresh().catch((error) => { console.error(error); els.empty.hidden = false; els.empty.textContent = 'Não foi possível carregar os dispositivos.' })
connect()
