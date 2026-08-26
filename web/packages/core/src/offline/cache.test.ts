import { describe, expect, it } from 'vitest'
import {
  CACHE_WINDOW_DAYS,
  cachedSessions,
  evict,
  readRoster,
  readSession,
  watermark,
  writeWindow,
} from './cache'
import { enqueue, pendingCount } from './pendingOps'
import { memoryStore } from './store'
import type { BootstrapPayload, PendingOp, RosterRow } from './types'

const roster = (studentId: string): RosterRow => ({
  student_id: studentId,
  display_name: 'ילד בודק',
  belt_color_hex: null,
  belt_name: null,
  health_status: 'missing',
  derived_flags: {},
  status: 'unmarked',
  source: null,
  has_absence_report: false,
  absence_reason: null,
})

const payload = (sessions: { id: string; startsAt: string }[]): BootstrapPayload => ({
  server_time: '2026-11-03T12:00:00.000Z',
  from_time: '2026-11-03T00:00:00.000Z',
  to_time: '2026-11-05T00:00:00.000Z',
  sessions: sessions.map(({ id, startsAt }) => ({
    id,
    group_id: 'group-1',
    group_name: 'מתחילים',
    starts_at: startsAt,
    ends_at: startsAt,
    location_name: null,
    status: 'scheduled' as const,
    attendance_taken: false,
  })),
  rosters: Object.fromEntries(sessions.map(({ id }) => [id, [roster(`student-${id}`)]])),
})

const op = (id: string): PendingOp => ({
  client_mark_id: id,
  kind: 'attendance.mark',
  session_id: 'gone',
  student_id: 'student-1',
  payload: { status: 'present' },
  device_marked_at: '2026-11-01T17:00:00.000Z',
  queued_at: '2026-11-01T17:00:00.000Z',
  person_id: 'person-1',
  attempts: 0,
})

describe('§10.6 — the cache budget', () => {
  it('stores the window and its watermark in one write', async () => {
    // §10.6 — "`GET /sync/bootstrap?from&to` returns everything a coach needs for a date
    // window in one payload, stored in IndexedDB with a `synced_at` watermark."
    const store = memoryStore()
    await writeWindow(store, payload([{ id: 's1', startsAt: '2026-11-03T17:00:00.000Z' }]))
    expect(await watermark(store)).toBe('2026-11-03T12:00:00.000Z')
    expect((await readSession(store, 's1'))?.group_name).toBe('מתחילים')
    expect(await readRoster(store, 's1')).toHaveLength(1)
  })

  it('keeps the window bounded to two days, evicting oldest-first', async () => {
    // §10.6 — "two days of sessions, evicted oldest-first". The three sessions below are on
    // three different days; after eviction the newest two survive.
    const store = memoryStore()
    await writeWindow(
      store,
      payload([
        { id: 'old', startsAt: '2026-11-01T17:00:00.000Z' },
        { id: 'today', startsAt: '2026-11-03T17:00:00.000Z' },
        { id: 'tomorrow', startsAt: '2026-11-04T17:00:00.000Z' },
      ]),
    )
    const result = await evict(store, '2026-11-04T20:00:00.000Z')
    expect(result.evicted).toEqual(['old'])
    expect((await cachedSessions(store)).map((s) => s.id)).toEqual(['today', 'tomorrow'])
  })

  it('evicts a session and its roster together', async () => {
    // A roster whose session is gone is unreachable bytes. Leaving it is the leak that
    // makes a "bounded" cache grow forever.
    const store = memoryStore()
    await writeWindow(
      store,
      payload([
        { id: 'old', startsAt: '2026-11-01T17:00:00.000Z' },
        { id: 'today', startsAt: '2026-11-03T17:00:00.000Z' },
      ]),
    )
    await evict(store, '2026-11-04T20:00:00.000Z')
    expect(await readRoster(store, 'old')).toBeUndefined()
    expect(await readRoster(store, 'today')).toHaveLength(1)
  })

  it('EXEMPTS pending_ops from eviction under all circumstances', async () => {
    // §10.6, the sentence this whole module exists to honour: "`pending_ops` **exempt from
    // eviction under all circumstances**. Unsynced work is the one thing that must never be
    // reclaimed."
    //
    // The op below points at the session being evicted, which is the case that actually
    // bites: an eviction written as "drop the session and everything referencing it" is
    // both obvious and catastrophic.
    const store = memoryStore()
    await writeWindow(store, payload([{ id: 'gone', startsAt: '2026-11-01T17:00:00.000Z' }]))
    await enqueue(store, op('op-1'))

    await evict(store, '2026-11-10T00:00:00.000Z')

    expect(await cachedSessions(store)).toEqual([])
    expect(await pendingCount(store)).toBe(1)
  })

  it('keeps pending_ops even when the whole cache is discarded', async () => {
    // §10.4 — "Past 7 days the cache is treated as untrustworthy for display but the
    // pending queue is still preserved and flushable." The strongest form of the exemption:
    // even the deliberate, total discard leaves the queue alone.
    const store = memoryStore()
    await writeWindow(store, payload([{ id: 's1', startsAt: '2026-11-03T17:00:00.000Z' }]))
    await enqueue(store, op('op-1'))
    const { discardCache } = await import('./cache')
    await discardCache(store)
    expect(await cachedSessions(store)).toEqual([])
    expect(await watermark(store)).toBeNull()
    expect(await pendingCount(store)).toBe(1)
  })

  it('never names pending_ops in a destructive call', async () => {
    // The rule at the source. A review cannot tell `clear('sessions')` from
    // `clear('pending_ops')` at a glance, and this is the one table where the difference is
    // a coach's afternoon.
    const source = (await import('./cache.ts?raw')).default
    const executable = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '')
    expect(executable).not.toContain('pending_ops')
  })

  it('evicts nothing when everything is inside the window', async () => {
    const store = memoryStore()
    await writeWindow(
      store,
      payload([
        { id: 'today', startsAt: '2026-11-03T17:00:00.000Z' },
        { id: 'tomorrow', startsAt: '2026-11-04T17:00:00.000Z' },
      ]),
    )
    expect((await evict(store, '2026-11-04T20:00:00.000Z')).evicted).toEqual([])
  })

  it('measures the window in studio days, not in a rolling 48 hours', async () => {
    // The session below starts at 08:00 Jerusalem on the 3rd; `now` is 22:00 Jerusalem on
    // the 4th — sixty-two hours later. A rolling 48-hour window would have dropped it
    // fourteen hours ago, mid-afternoon, while a coach could still be correcting it.
    // §10.6 says "two days of sessions", and a day is a calendar day in Asia/Jerusalem (G3).
    const store = memoryStore()
    await writeWindow(store, payload([{ id: 'early', startsAt: '2026-11-03T06:00:00.000Z' }]))
    expect((await evict(store, '2026-11-04T20:00:00.000Z')).evicted).toEqual([])
  })

  it('evicts once the studio day rolls over, however few hours have passed', async () => {
    // The mirror, and what keeps the rule honest rather than merely lenient: the same
    // session is gone at 01:00 Jerusalem on the 5th — two calendar days later — even though
    // only a few more hours have elapsed. A window measured in days has to move in days.
    const store = memoryStore()
    await writeWindow(store, payload([{ id: 'early', startsAt: '2026-11-03T06:00:00.000Z' }]))
    expect((await evict(store, '2026-11-04T23:00:00.000Z')).evicted).toEqual(['early'])
  })

  it('declares the window as two days', () => {
    expect(CACHE_WINDOW_DAYS).toBe(2)
  })

  it('returns undefined for a session it does not hold rather than throwing', async () => {
    expect(await readSession(memoryStore(), 'nothing')).toBeUndefined()
  })

  it('has no watermark before the first prime', async () => {
    // §6.1's first launch reads this to decide whether it must block. `null` is what makes
    // "never primed" distinguishable from "primed a long time ago".
    expect(await watermark(memoryStore())).toBeNull()
  })
})
