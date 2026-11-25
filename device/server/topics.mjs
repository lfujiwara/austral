import { readFileSync } from 'node:fs'

/** Matches device, sensor and entity name parts. */
export const ID_PATTERN = /^[a-z0-9_-]{1,64}$/

const file = new URL('../schema/entities.json', import.meta.url)

/** @type {Map<string, { pattern: RegExp, unit: string | null }>} keyed by `<component>/<entity>` */
const entities = new Map()

for (const entry of JSON.parse(readFileSync(file, 'utf8')).published) {
  if (!entry.topic.endsWith('/state')) continue
  const id = entry.topic.slice(0, -'/state'.length)
  const parts = id.split('/')
  if (parts.length !== 2 || !parts.every((part) => ID_PATTERN.test(part))) {
    throw new Error(`entities.json: bad entity id ${id}`)
  }
  entities.set(id, { pattern: new RegExp(entry.pattern), unit: entry.unit ?? null })
}

/** True when `id` is listed in entities.json and `value` matches its pattern. */
export function accepts (id, value) {
  const entity = entities.get(id)
  return entity !== undefined && entity.pattern.test(value)
}

/** Unit of a `sensor/<name>` or any entity id, or null. */
export function unit (id) {
  return entities.get(id)?.unit ?? null
}

/** Splits an entity id into component and name. */
export function split (id) {
  const [component, name] = id.split('/')
  return { component, name }
}
