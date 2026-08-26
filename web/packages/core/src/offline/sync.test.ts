import { describe, expect, it, vi } from 'vitest'
import { enqueue, listPending, pendingCount } from './pendingOps'
import { memoryStore } from './store'
import { dismissConflict, flush, listConflicts } from './sync'
import type { OfflineStore, PendingOp } from './types'

const ME = 'person-me'
const SOMEONE_ELSE = 'person-else'

const op = (overrides: Partial<PendingOp> = {}): PendingOp => ({
  client_mark_id: 'mark-1',
  kind: 'attendance.mark',
  session_id: 'session-1',
  student_id: 'student-1',
  payload: { status: 'present' },
  device_marked_at: '2026-11-03T17:00:00.000Z',
  queued_at: '2026-11-03T17:00:00.000Z',
  person_id: ME,
  attempts: 0,
  ...overrides,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const accepted = () => json({ applied: 1, replayed: 0, superseded: 0, conflicts: [] })

async function queued(store: OfflineStore, ...ops: PendingOp[]): Promise<void> {
  for (const one of ops) await enqueue(store, one)
}

describe('§10.3 — authentication while offline', () => {
  it('refreshes and then flushes when the access token has expired', async () => {
    // §10.3 item 2: "On reconnect the client refreshes (refresh token, 30 days, rotating)
    // and *then* flushes." The first POST 401s because the fifteen-minute access token
    // died while the coach was on the mat — which is the NORMAL case for a ninety-minute
    // lesson, not an edge one.
    const store = memoryStore()
    await queued(store, op())
    const post = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(accepted())
    const refresh = vi.fn().mockResolvedValue(true)

    const result = await flush({ store, post, refresh, currentPersonId: () => ME })

    expect(refresh).toHaveBeenCalledOnce()
    expect(result.flushed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
  })

  it('PRESERVES the queue when the refresh token has also expired', async () => {
    // §10.3 item 3: "If the refresh token has also expired — a device offline for over a
    // month — **the queue is preserved, not discarded**. The user signs in again and the
    // queue flushes afterwards."
    //
    // The assertion that matters is the second one. `deferred` merely reports; a queue that
    // survives is the guarantee.
    const store = memoryStore()
    await queued(store, op())
    const post = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    const refresh = vi.fn().mockResolvedValue(false)

    const result = await flush({ store, post, refresh, currentPersonId: () => null })

    expect(result.flushed).toBe(0)
    expect(result.deferred).toBe(1)
    expect(await pendingCount(store)).toBe(1)
  })

  it('raises a conflict card rather than flushing when a DIFFERENT person signs in', async () => {
    // §10.3 item 4: "If the re-authenticated identity is a *different* person, the queue is
    // not flushed; it is surfaced as a conflict card for a manager to resolve. Attendance is
    // attributed to whoever marked it, and a device changing hands must not silently
    // rewrite that."
    //
    // A shared club phone is the ordinary case here, not a security scenario: one coach
    // marks, goes home, another signs in on the same handset before the first ever got
    // signal.
    const store = memoryStore()
    await queued(store, op({ person_id: SOMEONE_ELSE }))
    const post = vi.fn()

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(post).not.toHaveBeenCalled()
    expect(await pendingCount(store)).toBe(1)
    expect(result.conflicts.map((card) => card.kind)).toEqual(['different_person'])
  })

  it('flushes an op whose person is unknown, attributing it to whoever is signed in now', async () => {
    // The op stored with `person_id: null` by §10.3 item 1 — a mark made after the session
    // expired, with nobody verified to name. It is NOT a different person, so it is not a
    // conflict; the server attributes it to the caller, which is the only honest answer
    // available and is what §10.3 item 3's "validated against the same `person_id`" leaves
    // room for.
    const store = memoryStore()
    await queued(store, op({ person_id: null }))
    const post = vi.fn().mockResolvedValue(accepted())

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(result.flushed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
  })

  it('flushes the ops that ARE the signed-in person and holds the ones that are not', async () => {
    // A device two coaches used. §10.3 item 4 is about the ops that are not yours; it does
    // not make the whole queue radioactive, and holding your own marks hostage to somebody
    // else's is its own kind of data loss.
    const store = memoryStore()
    await queued(
      store,
      op({ client_mark_id: 'mine', person_id: ME }),
      op({ client_mark_id: 'theirs', person_id: SOMEONE_ELSE }),
    )
    const post = vi.fn().mockResolvedValue(accepted())

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(result.flushed).toBe(1)
    expect((await listPending(store)).map((o) => o.client_mark_id)).toEqual(['theirs'])
    expect(result.conflicts.map((card) => card.kind)).toEqual(['different_person'])
  })

  it('has no branch that empties the queue on an auth failure', async () => {
    // §10.3 item 5, at the source: "A queue is **never** dropped on an auth failure. There
    // is no code path that discards unsynced work."
    const source = (await import('./sync.ts?raw')).default
    const executable = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '')
    expect(executable).not.toContain("clear('pending_ops')")
  })
})

describe('§10.5 — cross-actor conflicts on flush', () => {
  it('turns a cancelled session into a card, with the marks already stored', async () => {
    // §10.5 — "the marks are accepted and stored, but the session is cancelled, so a card
    // appears for the manager: השיעור בוטל — התקבלו 22 סימוני נוכחות. A human decides. Never
    // silently dropped, never silently applied to a cancelled session's reports."
    //
    // The ops leave the queue because the SERVER TOOK THEM. That is the difference between
    // this and every case above.
    const store = memoryStore()
    await queued(store, op())
    const post = vi.fn().mockResolvedValue(
      json({
        applied: 1,
        replayed: 0,
        superseded: 0,
        conflicts: [
          { kind: 'session_cancelled', session_id: 'session-1', student_ids: [], count: 1 },
        ],
      }),
    )

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(result.flushed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
    expect(result.conflicts.map((c) => c.kind)).toEqual(['session_cancelled'])
    expect(result.conflicts[0]?.count).toBe(1)
  })

  it('turns an unenrolled student into its own card', async () => {
    const store = memoryStore()
    await queued(store, op())
    const post = vi.fn().mockResolvedValue(
      json({
        applied: 1,
        replayed: 0,
        superseded: 0,
        conflicts: [
          {
            kind: 'student_unenrolled',
            session_id: 'session-1',
            student_ids: ['student-1'],
            count: 1,
          },
        ],
      }),
    )
    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })
    expect(result.conflicts.map((c) => c.kind)).toEqual(['student_unenrolled'])
  })

  it('treats a replay as a successful flush, so the queue drains', async () => {
    // §10.5 — "The same device flushes twice. Idempotent on `client_mark_id`; the replay is
    // a no-op." A client that treated `replayed` as failure would retry forever and its
    // badge would never reach zero.
    const store = memoryStore()
    await queued(store, op())
    const post = vi
      .fn()
      .mockResolvedValue(json({ applied: 0, replayed: 1, superseded: 0, conflicts: [] }))

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(result.flushed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
  })

  it('groups a session s marks into one request rather than one per tap', async () => {
    // `POST /attendance/batch` takes a session and a list. Thirty requests on a reconnect
    // is thirty chances to lose the network halfway.
    const store = memoryStore()
    await queued(
      store,
      op({ client_mark_id: 'a', student_id: 'student-1' }),
      op({ client_mark_id: 'b', student_id: 'student-2' }),
    )
    const post = vi.fn().mockResolvedValue(accepted())

    await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(post).toHaveBeenCalledOnce()
    const body = post.mock.calls[0]?.[1] as { marks: unknown[] }
    expect(body.marks).toHaveLength(2)
  })
})

describe('the flusher', () => {
  it('leaves every op in place when the network fails mid-flush', async () => {
    const store = memoryStore()
    await queued(store, op())
    const post = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })

    expect(result.flushed).toBe(0)
    expect(await pendingCount(store)).toBe(1)
  })

  it('records the attempt so the queue sheet can say how many times it tried', async () => {
    const store = memoryStore()
    await queued(store, op())
    const post = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })
    expect((await listPending(store))[0]?.attempts).toBe(1)
  })

  it('never gives up on an op however many times it has failed', async () => {
    // There is deliberately no attempt budget. A threshold is a code path that discards
    // unsynced work, which §10.3 item 5 forbids outright.
    const store = memoryStore()
    await queued(store, op({ attempts: 99 }))
    const post = vi.fn().mockResolvedValue(accepted())
    const result = await flush({ store, post, refresh: async () => true, currentPersonId: () => ME })
    expect(result.flushed).toBe(1)
  })

  it('is a no-op on an empty queue and makes no request', async () => {
    const post = vi.fn()
    const result = await flush({
      store: memoryStore(),
      post,
      refresh: async () => true,
      currentPersonId: () => ME,
    })
    expect(post).not.toHaveBeenCalled()
    expect(result).toEqual({ flushed: 0, deferred: 0, conflicts: [] })
  })

  it('persists conflict cards so they survive a reload', async () => {
    // §10.5 — "Rejected operations become dismissible conflict cards". A card held only in
    // React state is a card that disappears when the coach backgrounds the app, which is
    // the moment they are most likely to do so.
    const store = memoryStore()
    await queued(store, op({ person_id: SOMEONE_ELSE }))
    await flush({ store, post: vi.fn(), refresh: async () => true, currentPersonId: () => ME })
    expect(await listConflicts(store)).toHaveLength(1)
  })

  it('dismisses a card without touching the work it concerns', async () => {
    // Dismissing hides the card. It does not delete a mark — there is no action anywhere in
    // this layer that does.
    const store = memoryStore()
    await queued(store, op({ person_id: SOMEONE_ELSE }))
    await flush({ store, post: vi.fn(), refresh: async () => true, currentPersonId: () => ME })
    const [card] = await listConflicts(store)

    await dismissConflict(store, card!.id)

    expect(await listConflicts(store)).toEqual([])
    expect(await pendingCount(store)).toBe(1)
  })

  it('does not raise a second card for a conflict already showing', async () => {
    // A foreground resume flushes. Three resumes must not stack three identical cards on
    // a coach's alert centre.
    const store = memoryStore()
    await queued(store, op({ person_id: SOMEONE_ELSE }))
    const deps = { store, post: vi.fn(), refresh: async () => true, currentPersonId: () => ME }
    await flush(deps)
    await flush(deps)
    expect(await listConflicts(store)).toHaveLength(1)
  })

  it('does not resurrect a card the coach dismissed', async () => {
    const store = memoryStore()
    await queued(store, op({ person_id: SOMEONE_ELSE }))
    const deps = { store, post: vi.fn(), refresh: async () => true, currentPersonId: () => ME }
    await flush(deps)
    const [card] = await listConflicts(store)
    await dismissConflict(store, card!.id)
    await flush(deps)
    expect(await listConflicts(store)).toEqual([])
  })
})
