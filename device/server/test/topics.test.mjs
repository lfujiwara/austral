import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accepts, split, unit, ID_PATTERN } from '../topics.mjs'

test('accepts values that match the entity pattern', () => {
  assert.ok(accepts('sensor/product_temperature', '-18.4'))
  assert.ok(accepts('sensor/product_temperature', 'nan'))
  assert.ok(accepts('binary_sensor/door_open', 'ON'))
  assert.ok(accepts('sensor/wifi_signal', '-61'))
})

test('rejects bad values and unknown ids', () => {
  assert.ok(!accepts('sensor/product_temperature', '-18'))
  assert.ok(!accepts('sensor/product_temperature', '-18.4 '))
  assert.ok(!accepts('binary_sensor/door_open', 'on'))
  assert.ok(!accepts('sensor/unknown', '1.0'))
  assert.ok(!accepts('status', 'online'))
  assert.ok(!accepts('debug', 'x'))
  assert.ok(!accepts('__proto__/x', 'x'))
})

test('gives units', () => {
  assert.equal(unit('sensor/product_temperature'), '°C')
  assert.equal(unit('sensor/door_distance'), 'm')
  assert.equal(unit('binary_sensor/door_open'), null)
  assert.equal(unit('sensor/unknown'), null)
})

test('splits ids and checks name parts', () => {
  assert.deepEqual(split('sensor/uptime'), { component: 'sensor', name: 'uptime' })
  assert.ok(ID_PATTERN.test('austral-device'))
  assert.ok(!ID_PATTERN.test('Austral'))
  assert.ok(!ID_PATTERN.test('a'.repeat(65)))
})
