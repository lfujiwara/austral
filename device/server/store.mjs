import { DatabaseSync } from 'node:sqlite'
import { accepts, split, unit } from './topics.mjs'

/**
 * @typedef {{ id: string, age: number, value: string }} Entry
 * @typedef {{ device: string, boot: number, seq: number, entries: Entry[] }} Batch
 * @typedef {{ type: 'reading', data: object } | { type: 'state', data: object } | { type: 'status', data: object }} StoreEvent
 */

const migrations = [
  `CREATE TABLE series (
     id INTEGER PRIMARY KEY,
     device TEXT NOT NULL,
     sensor TEXT NOT NULL,
     UNIQUE (device, sensor)
   );
   CREATE TABLE reading (
     series INTEGER NOT NULL,
     t INTEGER NOT NULL,
     v REAL,
     PRIMARY KEY (series, t)
   ) WITHOUT ROWID;
   CREATE TABLE entity (
     device TEXT NOT NULL,
     id TEXT NOT NULL,
     value TEXT NOT NULL,
     t INTEGER NOT NULL,
     PRIMARY KEY (device, id)
   );
   CREATE TABLE device (
     id TEXT PRIMARY KEY,
     last_seen INTEGER NOT NULL,
     boot INTEGER NOT NULL,
     seq INTEGER NOT NULL,
     rejected INTEGER NOT NULL DEFAULT 0,
     online INTEGER NOT NULL DEFAULT 1
   );`
]

/**
 * Opens (and migrates) the database. SQLite owns all state: nothing is cached here.
 * @param {string} path file path, or ':memory:'
 * @param {{ offlineAfterMs?: number }} [options]
 */
export function openStore (path, { offlineAfterMs = 15000 } = {}) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000')
  migrate(db)

  const sql = {
    device: db.prepare('SELECT boot, seq FROM device WHERE id = ?'),
    upsertDevice: db.prepare(
      `INSERT INTO device (id, last_seen, boot, seq, rejected, online) VALUES (:id, :now, :boot, :seq, :rejected, 1)
       ON CONFLICT (id) DO UPDATE SET last_seen = :now, boot = :boot, seq = :seq,
         rejected = rejected + :rejected, online = 1`
    ),
    wasOnline: db.prepare('SELECT online FROM device WHERE id = ?'),
    seriesId: db.prepare(
      `INSERT INTO series (device, sensor) VALUES (?, ?)
       ON CONFLICT (device, sensor) DO UPDATE SET device = device RETURNING id`
    ),
    reading: db.prepare('INSERT OR REPLACE INTO reading (series, t, v) VALUES (?, ?, ?)'),
    entity: db.prepare(
      `INSERT INTO entity (device, id, value, t) VALUES (?, ?, ?, ?)
       ON CONFLICT (device, id) DO UPDATE SET value = excluded.value, t = excluded.t WHERE excluded.t >= entity.t`
    ),
    devices: db.prepare('SELECT id, last_seen, rejected FROM device ORDER BY id'),
    sensors: db.prepare(
      `SELECT s.sensor, r.t, r.v FROM series s
       JOIN reading r ON r.series = s.id AND r.t = (SELECT max(t) FROM reading WHERE series = s.id)
       WHERE s.device = ? ORDER BY s.sensor`
    ),
    states: db.prepare('SELECT id, value, t FROM entity WHERE device = ? ORDER BY id'),
    expire: db.prepare('UPDATE device SET online = 0 WHERE online = 1 AND last_seen <= ? RETURNING id'),
    bucketed: db.prepare(
      `SELECT :from + ((t - :from) / :bucket) * :bucket AS start, avg(v) AS v
       FROM reading WHERE series = :series AND t >= :from AND t < :to
       GROUP BY start ORDER BY start`
    ),
    series: db.prepare('SELECT id FROM series WHERE device = ? AND sensor = ?')
  }

  return {
    /**
     * Stores a batch in one transaction. Returns the events to publish once it is committed.
     * A repeat of the last (boot, seq) writes nothing and returns `duplicate`.
     * @param {Batch} batch
     * @param {number} receivedAt ms since 1970
     * @returns {{ duplicate: boolean, rejected: number, events: StoreEvent[] }}
     */
    ingest (batch, receivedAt) {
      const events = []
      let rejected = 0
      db.exec('BEGIN IMMEDIATE')
      try {
        const last = sql.device.get(batch.device)
        if (last && last.boot === batch.boot && last.seq === batch.seq) {
          db.exec('COMMIT')
          return { duplicate: true, rejected: 0, events }
        }
        const wasOnline = sql.wasOnline.get(batch.device)?.online === 1
        for (const { id, age, value } of batch.entries) {
          if (!accepts(id, value)) { rejected++; continue }
          const t = receivedAt - age
          const { component, name } = split(id)
          if (component === 'sensor') {
            const v = value === 'nan' ? null : Number(value)
            const { id: series } = sql.seriesId.get(batch.device, name)
            sql.reading.run(series, t, v)
            events.push({ type: 'reading', data: { device: batch.device, sensor: name, t, v } })
          } else {
            sql.entity.run(batch.device, id, value, t)
            events.push({ type: 'state', data: { device: batch.device, id, t, value } })
          }
        }
        sql.upsertDevice.run({
          id: batch.device, now: receivedAt, boot: batch.boot, seq: batch.seq, rejected
        })
        if (!wasOnline) events.push({ type: 'status', data: { device: batch.device, status: 'online', t: receivedAt } })
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return { duplicate: false, rejected, events }
    },

    /** Marks devices silent for too long as offline. Returns one status event per change. */
    expire (now) {
      return sql.expire.all(now - offlineAfterMs).map(({ id }) => (
        { type: 'status', data: { device: id, status: 'offline', t: now } }
      ))
    },

    /** The /api/devices payload. */
    devices (now) {
      return sql.devices.all().map((row) => ({
        id: row.id,
        status: now - row.last_seen < offlineAfterMs ? 'online' : 'offline',
        lastSeen: row.last_seen,
        rejected: row.rejected,
        sensors: sql.sensors.all(row.id).map((s) => (
          { id: s.sensor, unit: unit(`sensor/${s.sensor}`), last: { t: s.t, v: s.v } }
        )),
        states: Object.fromEntries(sql.states.all(row.id).map((s) => [s.id, { t: s.t, value: s.value }]))
      }))
    },

    /**
     * The /api/series payload. All numbers are integers in ms, except points and `points` values.
     * @param {{ device: string, sensor: string, from: number, to: number, points: number }} query
     */
    series ({ device, sensor, from, to, points }) {
      const bucketMs = Math.ceil((to - from) / points)
      const row = sql.series.get(device, sensor)
      // node:sqlite binds JS numbers as REAL, so BigInt keeps the bucket division in integers.
      const rows = row === undefined
        ? []
        : sql.bucketed.all({ from: BigInt(from), to: BigInt(to), bucket: BigInt(bucketMs), series: row.id })
      return {
        device,
        sensor,
        unit: unit(`sensor/${sensor}`),
        from,
        to,
        bucketMs,
        points: rows.map((r) => [Number(r.start), r.v])
      }
    },

    close () { db.close() }
  }
}

function migrate (db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get()
  for (let next = version; next < migrations.length; next++) {
    db.exec('BEGIN')
    try {
      db.exec(migrations[next])
      db.exec(`PRAGMA user_version = ${next + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
