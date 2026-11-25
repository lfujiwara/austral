import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '../store.mjs'

const T0 = 1_795_000_000_000
const batch = (seq, entries, extra = {}) => ({ device: 'austral-device', boot: 7, seq, entries, ...extra })
const temp = (value, age = 0) => ({ id: 'sensor/product_temperature', age, value })
const query = (from, to, points) => ({ device: 'austral-device', sensor: 'product_temperature', from, to, points })

test('stores readings and aligns bucket starts to from', () => {
  const store = openStore(':memory:')
  store.ingest(batch(0, [temp('-10.0', 5000), temp('-20.0', 4000), temp('-30.0', 1500)]), T0)
  // t = T0-5000, T0-4000, T0-1500. from = T0-5500, bucketMs = ceil(5000/5) = 1000.
  const result = store.series(query(T0 - 5500, T0 - 500, 5))
  assert.equal(result.bucketMs, 1000)
  assert.deepEqual(result.points, [[T0 - 5500, -10], [T0 - 4500, -20], [T0 - 1500, -30]])
  assert.equal(result.unit, '°C')
})

test('averages inside a bucket and keeps the range half open', () => {
  const store = openStore(':memory:')
  store.ingest(batch(0, [temp('-10.0', 3000), temp('-20.0', 2500), temp('-30.0', 0)]), T0)
  const result = store.series(query(T0 - 3000, T0, 1))
  assert.deepEqual(result.points, [[T0 - 3000, -15]])
})

test('a bucket with only nulls gives null and an empty bucket is omitted', () => {
  const store = openStore(':memory:')
  store.ingest(batch(0, [temp('nan', 9000), temp('nan', 8500), temp('-5.0', 100)]), T0)
  const result = store.series(query(T0 - 10000, T0, 10))
  assert.deepEqual(result.points, [[T0 - 9000, null], [T0 - 1000, -5]])
})

test('a bucket mixing null and values averages the values only', () => {
  const store = openStore(':memory:')
  store.ingest(batch(0, [temp('nan', 800), temp('-4.0', 200)]), T0)
  assert.deepEqual(store.series(query(T0 - 1000, T0, 1)).points, [[T0 - 1000, -4]])
})

test('unknown device or sensor gives empty points with the unit', () => {
  const store = openStore(':memory:')
  const result = store.series({ device: 'nope', sensor: 'door_distance', from: 0, to: 1000, points: 10 })
  assert.deepEqual(result.points, [])
  assert.equal(result.unit, 'm')
})

test('repeated boot and seq writes nothing', () => {
  const store = openStore(':memory:')
  const first = store.ingest(batch(4, [temp('-10.0')]), T0)
  assert.equal(first.duplicate, false)
  const again = store.ingest(batch(4, [temp('-99.0'), temp('1')]), T0 + 5000)
  assert.deepEqual(again, { duplicate: true, rejected: 0, events: [] })
  const [device] = store.devices(T0 + 5000)
  assert.equal(device.lastSeen, T0)
  assert.equal(device.rejected, 0)
  assert.deepEqual(store.series(query(T0 - 1000, T0 + 1000, 1)).points, [[T0 - 1000, -10]])
  assert.equal(store.ingest(batch(5, []), T0 + 5000).duplicate, false)
  assert.equal(store.ingest(batch(5, [], { boot: 8 }), T0 + 6000).duplicate, false)
})

test('counts rejected entries and keeps the valid ones', () => {
  const store = openStore(':memory:')
  const result = store.ingest(batch(0, [
    temp('-10.0'), temp('oops'), { id: 'sensor/nope', age: 0, value: '1.0' }, { id: 'binary_sensor/door_open', age: 0, value: 'MAYBE' }
  ]), T0)
  assert.equal(result.rejected, 3)
  store.ingest(batch(1, [temp('x')]), T0 + 5000)
  const [device] = store.devices(T0 + 5000)
  assert.equal(device.rejected, 4)
  assert.equal(device.sensors.length, 1)
})

test('lists devices with sensors, units, states and status', () => {
  const store = openStore(':memory:', { offlineAfterMs: 15000 })
  store.ingest(batch(0, [
    temp('-18.4', 100), { id: 'sensor/air_temperature', age: 0, value: 'nan' },
    { id: 'binary_sensor/door_open', age: 50, value: 'OFF' }, { id: 'binary_sensor/door_open', age: 10, value: 'ON' }
  ]), T0)
  const [device] = store.devices(T0 + 14999)
  assert.equal(device.status, 'online')
  assert.equal(store.devices(T0 + 15000)[0].status, 'offline')
  assert.deepEqual(device.sensors.map((s) => s.id), ['air_temperature', 'product_temperature'])
  assert.deepEqual(device.sensors[1], { id: 'product_temperature', unit: '°C', last: { t: T0 - 100, v: -18.4 } })
  assert.deepEqual(device.sensors[0].last, { t: T0, v: null })
  assert.deepEqual(device.states, { 'binary_sensor/door_open': { t: T0 - 10, value: 'ON' } })
})

test('an empty batch makes the device appear without sensors', () => {
  const store = openStore(':memory:')
  store.ingest(batch(0, []), T0)
  const [device] = store.devices(T0)
  assert.deepEqual(device.sensors, [])
  assert.deepEqual(device.states, {})
})

test('emits events once, with status transitions', () => {
  const store = openStore(':memory:', { offlineAfterMs: 1000 })
  const first = store.ingest(batch(0, [temp('-1.0', 10), { id: 'binary_sensor/door_open', age: 0, value: 'ON' }]), T0)
  assert.deepEqual(first.events.map((e) => e.type), ['reading', 'state', 'status'])
  assert.deepEqual(first.events[0].data, { device: 'austral-device', sensor: 'product_temperature', t: T0 - 10, v: -1 })
  assert.equal(store.ingest(batch(1, []), T0 + 500).events.length, 0)
  assert.deepEqual(store.expire(T0 + 1000), [])
  assert.deepEqual(store.expire(T0 + 1500), [{ type: 'status', data: { device: 'austral-device', status: 'offline', t: T0 + 1500 } }])
  assert.deepEqual(store.expire(T0 + 1600), [])
  assert.equal(store.ingest(batch(2, []), T0 + 2000).events[0].data.status, 'online')
})

test('persists across reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'austral-'))
  const path = join(dir, 'db.sqlite')
  try {
    const store = openStore(path)
    store.ingest(batch(9, [temp('-10.0'), { id: 'binary_sensor/door_open', age: 0, value: 'ON' }]), T0)
    store.close()
    const reopened = openStore(path)
    assert.equal(reopened.ingest(batch(9, [temp('-50.0')]), T0 + 1).duplicate, true)
    const [device] = reopened.devices(T0)
    assert.equal(device.lastSeen, T0)
    assert.equal(device.states['binary_sensor/door_open'].value, 'ON')
    assert.deepEqual(reopened.series(query(T0 - 1000, T0 + 1000, 1)).points, [[T0 - 1000, -10]])
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a 7-day series of 600k rows buckets quickly', () => {
  const store = openStore(':memory:')
  const week = 7 * 86_400_000
  const rows = 600_000
  const start = T0 - week
  const step = week / rows
  for (let i = 0; i < rows; i += 500) {
    const entries = []
    for (let j = i; j < Math.min(i + 500, rows); j++) entries.push(temp((-20 + (j % 40) / 10).toFixed(1), Math.round(week - j * step)))
    store.ingest(batch(i / 500, entries), T0)
  }
  const began = performance.now()
  const result = store.series(query(start, T0, 1000))
  const ms = performance.now() - began
  console.log(`series over ${rows} rows in 7 days, 1000 points: ${ms.toFixed(1)} ms`)
  assert.ok(result.points.length > 900 && result.points.length <= 1000)
  assert.ok(ms < 2000, `took ${ms} ms`)
})
