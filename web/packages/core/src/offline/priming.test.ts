import { describe, expect, it, vi } from 'vitest'
import { cachedSessions, watermark } from './cache'
import { enqueue } from './pendingOps'
import { needsPriming, primeOfflineCache, primeWindow } from './priming'
import { memoryStore } from './store'
import { STALE_AFTER_MS, staleQueueWarning } from './staleQueue'
import type { BootstrapPayload, PendingOp } from './types'

const NOW = '2026-11-03T12:00:00.000Z'

const payload = (): BootstrapPayload => ({
  server_time: NOW,
  from_time: '2026-11-03T00:00:00.000Z',
  to_time: '2026-11-05T00:00:00.000Z',
  sessions: [
    {
      id: 's1',
      group_id: 'g1',
      group_name: 'מתחילים',
      starts_at: '2026-11-03T15:00:00.000Z',
      ends_at: '2026-11-03T16:00:00.000Z',
      location_name: null,
      status: 'scheduled',
      attendance_taken: false,
    },
  ],
  rosters: { s1: [] },
})

const op = (queuedAt: string): PendingOp => ({
  client_mark_id: `mark-${queuedAt}`,
  kind: 'attendance.mark',
  session_id: 's1',
  student_id: 'student-1',
  payload: { status: 'present' },
  device_marked_at: queuedAt,
  queued_at: queuedAt,
  person_id: 'person-1',
  attempts: 0,
})

describe('§6.1 — offline priming is not optional', () => {
  it('primes today AND tomorrow', () => {
    // §6.1 — "today's and tomorrow's sessions + rosters are fetched and written to IndexedDB
    // BEFORE the coach reaches Today." Tomorrow is in the window because a coach's first
    // session of the next morning is the one most likely to be in a basement before anybody
    // has opened the app that day.
    const { from, to } = primeWindow(NOW)
    expect(from).toBe('2026-11-03')
    expect(to).toBe('2026-11-04')
  })

  it('computes the window in the studio s calendar, not the device s', () => {
    // 22:30 UTC on the 3rd is already the 4th in Jerusalem. A device in another zone that
    // primed its own "today" would fetch the wrong day and a coach would reach Today with
    // an empty roster.
    const { from } = primeWindow('2026-11-03T22:30:00.000Z')
    expect(from).toBe('2026-11-04')
  })

  it('writes the payload and its watermark, then reports ready', async () => {
    const store = memoryStore()
    const state = await primeOfflineCache({
      store,
      getBootstrap: async () => payload(),
      now: () => NOW,
    })
    expect(state).toBe('ready')
    expect(await cachedSessions(store)).toHaveLength(1)
    expect(await watermark(store)).toBe(NOW)
  })

  it('reports failed rather than ready when the fetch fails', async () => {
    // §6.1 — "The first launch **blocks** on this fetch." The caller can only honour that if
    // a failure is distinguishable from a success; a prime that resolved either way would
    // let the app fall through to Today with nothing cached, which is the exact failure the
    // blocking exists to prevent.
    const state = await primeOfflineCache({
      store: memoryStore(),
      getBootstrap: async () => {
        throw new TypeError('Failed to fetch')
      },
      now: () => NOW,
    })
    expect(state).toBe('failed')
  })

  it('leaves the previous cache intact when a re-prime fails', async () => {
    // §6.1 — "it re-runs on every foreground resume". A resume in a lift must not empty a
    // roster the coach is about to need.
    const store = memoryStore()
    await primeOfflineCache({ store, getBootstrap: async () => payload(), now: () => NOW })
    await primeOfflineCache({
      store,
      getBootstrap: async () => {
        throw new TypeError('Failed to fetch')
      },
      now: () => NOW,
    })
    expect(await cachedSessions(store)).toHaveLength(1)
  })

  it('requests persistent storage on the way through', async () => {
    // §6.5 — "the staff app requires standalone mode, calls `navigator.storage.persist()`,
    // and shows a blocking warning when unsynced work has been queued for more than one
    // session." The call is here because priming is the one moment guaranteed to happen
    // before any mark is ever taken.
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('navigator', { storage: { persist, persisted } })

    await primeOfflineCache({
      store: memoryStore(),
      getBootstrap: async () => payload(),
      now: () => NOW,
    })

    expect(persist).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('evicts on the way through, so the cache stays bounded across resumes', async () => {
    // Without this a device that resumes twice a day for a term accumulates a term of
    // rosters — and on iOS an oversized cache is exactly what creates the storage pressure
    // §6.5 says can evict `pending_ops`.
    const store = memoryStore()
    await primeOfflineCache({ store, getBootstrap: async () => payload(), now: () => NOW })
    await primeOfflineCache({
      store,
      getBootstrap: async () => ({ ...payload(), sessions: [], rosters: {} }),
      now: () => '2026-11-20T12:00:00.000Z',
    })
    expect(await cachedSessions(store)).toEqual([])
  })

  it('says a store with no watermark must be primed', async () => {
    // What §6.1's blocking gate reads. `null` is the only value that distinguishes "never
    // primed" from "primed a long time ago", and the two need different screens.
    expect(await needsPriming(memoryStore(), NOW)).toBe(true)
  })

  it('says a freshly primed store need not block again', async () => {
    const store = memoryStore()
    await primeOfflineCache({ store, getBootstrap: async () => payload(), now: () => NOW })
    expect(await needsPriming(store, NOW)).toBe(false)
  })

  it('requires priming again once the cached window is a day old', async () => {
    // §10.4 — "If the cached window is older than 24 hours the roster header shows
    // `נתונים מ-<time>` and a refresh is attempted on every app open."
    const store = memoryStore()
    await primeOfflineCache({ store, getBootstrap: async () => payload(), now: () => NOW })
    expect(await needsPriming(store, '2026-11-05T12:00:00.000Z')).toBe(true)
  })
})

describe('§6.5 — the blocking stale-queue warning', () => {
  it('does not warn on an empty queue', async () => {
    const warning = await staleQueueWarning(memoryStore(), NOW)
    expect(warning).toEqual({ blocking: false, count: 0, oldestQueuedAt: null })
  })

  it('does not warn about work queued minutes ago', async () => {
    // A coach mid-lesson has unsynced work by design. Blocking on that would block on the
    // normal case, and a warning that fires constantly is a warning nobody reads.
    const store = memoryStore()
    await enqueue(store, op('2026-11-03T11:30:00.000Z'))
    expect((await staleQueueWarning(store, NOW)).blocking).toBe(false)
  })

  it('BLOCKS once unsynced work has outlived a session', async () => {
    // §6.5 — "shows a blocking warning when unsynced work has been queued for more than one
    // session." Blocking rather than advisory because §6.5 traded the guarantee away
    // deliberately: "a home-screen web app on iOS is exempt from Safari's 7-day
    // script-storage cap, but iOS may still evict under storage pressure — a guarantee a
    // native container would have given. Coaches are a small, known group, so this is
    // managed rather than engineered around."
    //
    // A banner the coach can scroll past is not managing it. The warning is the management.
    const store = memoryStore()
    const old = new Date(Date.parse(NOW) - STALE_AFTER_MS - 1000).toISOString()
    await enqueue(store, op(old))
    const warning = await staleQueueWarning(store, NOW)
    expect(warning.blocking).toBe(true)
    expect(warning.count).toBe(1)
    expect(warning.oldestQueuedAt).toBe(old)
  })

  it('measures from the OLDEST op, not the newest', async () => {
    // A device that has been queuing for three days and took a mark five minutes ago is
    // still three days behind. Reading the newest would silence the warning permanently on
    // exactly the device that most needs it.
    const store = memoryStore()
    const old = new Date(Date.parse(NOW) - STALE_AFTER_MS - 1000).toISOString()
    await enqueue(store, op(old))
    await enqueue(store, op('2026-11-03T11:59:00.000Z'))
    expect((await staleQueueWarning(store, NOW)).blocking).toBe(true)
  })

  it('counts every waiting op, which is what the badge interpolates', async () => {
    const store = memoryStore()
    await enqueue(store, op('2026-11-03T11:00:00.000Z'))
    await enqueue(store, op('2026-11-03T11:05:00.000Z'))
    expect((await staleQueueWarning(store, NOW)).count).toBe(2)
  })
})
