// §10.6's cache budget: two days of sessions, evicted oldest-first.
//
// **`pending_ops` is not mentioned anywhere in this file's executable text, and
// `cache.test.ts` asserts that by reading the source.** §10.6: "`pending_ops` **exempt from
// eviction under all circumstances**. Unsynced work is the one thing that must never be
// reclaimed." The obvious way to break that is not malice — it is writing eviction as "drop
// the session and everything that references it", which is both the natural phrasing and
// exactly wrong, because the ops referencing an evicted session are precisely the ones a
// coach made offline and has not synced.
//
// So the tables this module may touch are named as a constant, `pending_ops` is not among
// them, and the source-level test is what keeps it that way when somebody adds a sixth
// table in W6.
//
// §10.6 also notes the budget is not really about quota — "a single day's rosters for a
// busy studio is on the order of tens of KB" — but it is bounded anyway, because on iOS an
// unbounded cache is what puts the device under the storage pressure that §6.5 says can
// evict the one store that must not be.
import { STUDIO_TIMEZONE } from '../datetime'
import type { BootstrapPayload, CachedSession, OfflineStore, RosterRow, TableName } from './types'

/** §10.6 — "two days of sessions". Today and tomorrow, which is §6.1's priming window. */
export const CACHE_WINDOW_DAYS = 2

/**
 * One day of grace behind today.
 *
 * §6.1 primes *today and tomorrow*, so the forward edge is `CACHE_WINDOW_DAYS - 1` and
 * needs no slack — the server clamps the bootstrap window to the same two days, so nothing
 * further ahead can be in the cache to begin with. The backward edge does need it: without
 * grace, yesterday evening's register vanishes at midnight, and a coach correcting it over
 * breakfast finds an empty screen. One day, not seven: the marks themselves are in
 * `pending_ops`, which no amount of eviction touches, so the grace period is about the
 * roster being *readable*, not about the work being safe.
 */
const RETENTION_GRACE_DAYS = 1

/** The tables eviction is allowed to reach. The queue's table is deliberately absent, and
 *  every destructive call below goes through this list rather than naming a table inline. */
const EVICTABLE = ['sessions', 'rosters', 'meta'] as const satisfies readonly TableName[]

const WATERMARK_KEY = 'synced_at'

/** G3 — stored UTC, rendered Asia/Jerusalem. A "day" in §10.6's budget is a calendar day in
 *  the studio's zone, not a rolling 48 hours: a rolling window drops this morning's lesson
 *  at 09:00 tomorrow, mid-morning, while a coach may still be correcting it. */
function studioDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: STUDIO_TIMEZONE })
}

/**
 * Store one `GET /sync/bootstrap` response.
 *
 * Sessions are keyed by `startsAt|id` so `OfflineStore.all` — which sorts by key — yields
 * them chronologically. That is what makes "evicted oldest-first" a property of the port
 * rather than a sort somebody has to remember to write.
 */
export async function writeWindow(store: OfflineStore, payload: BootstrapPayload): Promise<void> {
  for (const session of payload.sessions) {
    await store.put<CachedSession>(_sessions, sessionKey(session), session)
    const roster = payload.rosters[session.id]
    if (roster !== undefined) await store.put<RosterRow[]>(_rosters, session.id, roster)
  }
  // §10.6 — "stored in IndexedDB with a `synced_at` watermark." The SERVER's clock, not the
  // device's: §10.4's staleness banner and §10.5's skew detection both compare against it,
  // and a device an hour out would compute both wrong.
  await store.put<string>(_meta, WATERMARK_KEY, payload.server_time)
}

export async function watermark(store: OfflineStore): Promise<string | null> {
  return (await store.get<string>(_meta, WATERMARK_KEY)) ?? null
}

export async function cachedSessions(store: OfflineStore): Promise<CachedSession[]> {
  return (await store.all<CachedSession>(_sessions)).map((row) => row.value)
}

export async function readSession(
  store: OfflineStore,
  sessionId: string,
): Promise<CachedSession | undefined> {
  return (await cachedSessions(store)).find((session) => session.id === sessionId)
}

export async function readRoster(
  store: OfflineStore,
  sessionId: string,
): Promise<RosterRow[] | undefined> {
  return store.get<RosterRow[]>(_rosters, sessionId)
}

/**
 * Trim the cache to `CACHE_WINDOW_DAYS`, oldest-first.
 *
 * `nowIso` is a parameter and not a `Date.now()`, because the whole rule is about time and
 * a module that read the clock could only be tested by waiting a day.
 *
 * The queue is untouched — it is not in `EVICTABLE`, and the ops that reference an evicted
 * session are exactly the ones this must not reclaim.
 */
export async function evict(
  store: OfflineStore,
  nowIso: string,
): Promise<{ evicted: string[] }> {
  const rows = await store.all<CachedSession>(_sessions)
  // The window is anchored on NOW, not on the days the cache happens to hold. The first
  // draft kept "the newest `CACHE_WINDOW_DAYS` days present", which reads the same and is
  // wrong in the one case that matters: a device that has been offline for a week holds
  // only stale days, so the newest two of them are stale — and the cache never shrinks
  // however long the coach stays out of signal.
  const today = studioDay(nowIso)
  const lower = shiftDay(today, -RETENTION_GRACE_DAYS)
  const upper = shiftDay(today, CACHE_WINDOW_DAYS - 1)

  const evicted: string[] = []
  // `rows` is key-sorted and the key leads with `starts_at`, so this walks oldest-first
  // without a sort of its own — §10.6's "evicted oldest-first" as a property of the port.
  for (const row of rows) {
    const day = studioDay(row.value.starts_at)
    if (day >= lower && day <= upper) continue
    await store.delete(_sessions, row.key)
    // The roster goes with its session. A roster whose session is gone is unreachable
    // bytes, and leaving it is the leak that makes a "bounded" cache grow forever.
    await store.delete(_rosters, row.value.id)
    evicted.push(row.value.id)
  }
  return { evicted }
}

/**
 * §10.4 — "Past 7 days the cache is treated as untrustworthy for display but **the pending
 * queue is still preserved and flushable**."
 *
 * The deliberate, total discard. It walks `EVICTABLE` rather than naming tables, so it
 * cannot reach the queue even by accident — which is the whole reason the constant exists.
 */
export async function discardCache(store: OfflineStore): Promise<void> {
  for (const table of EVICTABLE) {
    await store.clear(table)
  }
}

function sessionKey(session: CachedSession): string {
  return `${session.starts_at}|${session.id}`
}

/** `YYYY-MM-DD` plus or minus whole days, in the studio's calendar.
 *
 * Parsed as a UTC midnight and shifted there, then re-rendered — never through the local
 * zone. The day string is already the studio's answer (`studioDay` did that conversion);
 * running it through a second zone would move March's DST boundary by an hour and drop a
 * day on the two mornings a year it matters. */
function shiftDay(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

// The three evictable tables, bound to local names so no destructive call below writes a
// table name inline. `cache.test.ts` reads this file's executable text and fails if the
// queue's table name appears in it at all.
const [_sessions, _rosters, _meta] = EVICTABLE
