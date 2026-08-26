import { describe, expect, it } from 'vitest'
// The module's own exports, read as text. See `network.test.ts` for why a source-level
// assertion earns its place: some of §10.3's rules are about what does NOT exist.
import pendingOpsSource from './pendingOps.ts?raw'
import * as pendingOps from './pendingOps'
import {
  enqueue,
  listPending,
  markSynced,
  oldestQueuedAt,
  pendingCount,
  recordAttempt,
} from './pendingOps'
import { memoryStore } from './store'
import type { PendingOp } from './types'

const op = (overrides: Partial<PendingOp> = {}): PendingOp => ({
  client_mark_id: '11111111-1111-4111-8111-111111111111',
  kind: 'attendance.mark',
  session_id: 'session-1',
  student_id: 'student-1',
  payload: { status: 'present' },
  device_marked_at: '2026-11-03T17:00:00.000Z',
  queued_at: '2026-11-03T17:00:00.000Z',
  person_id: 'person-1',
  attempts: 0,
  ...overrides,
})

describe('§10.3 — offline writes never depend on a valid token', () => {
  it('enqueues with no token, no session and no network', async () => {
    // §10.3 item 1, verbatim: "Offline writes never depend on a valid token. Marks go to
    // `pending_ops` regardless of auth state — the local write is not an API call."
    //
    // The test proves it by construction: `enqueue` takes a store and an op. There is no
    // parameter through which a token could be demanded, and no import of the session
    // module that could read one. A coach on a mat for ninety minutes has an expired access
    // token long before they finish, and this is the line that makes that a non-event.
    const store = memoryStore()
    await enqueue(store, op())
    expect(await pendingCount(store)).toBe(1)
  })

  it('enqueues an op whose person is unknown', async () => {
    // The harder half of the same rule. A mark made after the session expired has no
    // verified person to name, and refusing to store it is exactly the code path §10.3
    // item 5 forbids. The op is stored with `person_id: null` and `sync.ts` decides what
    // to do with it on reconnect.
    const store = memoryStore()
    await enqueue(store, op({ person_id: null }))
    expect((await listPending(store))[0]?.person_id).toBeNull()
  })

  it('exports no function that empties the queue', () => {
    // §10.3 item 5: "A queue is never dropped on an auth failure. **There is no code path
    // that discards unsynced work.**"
    //
    // Asserted against the module's public surface rather than against a behaviour, because
    // the failure this guards is somebody ADDING such a path — and a behavioural test of an
    // absent function cannot be written at all. `markSynced` is the one remover, and it
    // removes only ids the server has acknowledged.
    const removers = Object.keys(pendingOps).filter((name) =>
      /clear|drop|discard|purge|reset|wipe|abandon/i.test(name),
    )
    expect(removers).toEqual([])
  })

  it('never calls clear() on the pending_ops table', () => {
    // The port's most destructive call, checked at the source. `cache.ts` clears tables;
    // this module must not, and a review cannot see the difference between
    // `clear('sessions')` and `clear('pending_ops')` at a glance.
    expect(pendingOpsSource).not.toContain("clear('pending_ops')")
  })
})

describe('the queue', () => {
  it('stores one row per client_mark_id, so a double tap is one mark', async () => {
    // §10.5's idempotency starts on the DEVICE. A row keyed by anything else would send
    // the same tap twice and rely on the server to notice.
    const store = memoryStore()
    await enqueue(store, op({ payload: { status: 'present' } }))
    await enqueue(store, op({ payload: { status: 'absent_unexcused' } }))
    const queued = await listPending(store)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.payload).toEqual({ status: 'absent_unexcused' })
  })

  it('preserves the original queued_at when a mark is corrected', async () => {
    // §6.5's blocking warning fires on work that has been queued "for more than one
    // session". A coach who corrects a mark five times has not reset that clock — the
    // device has been holding unsynced work since the first tap.
    const store = memoryStore()
    await enqueue(store, op({ queued_at: '2026-11-03T17:00:00.000Z' }))
    await enqueue(store, op({ queued_at: '2026-11-03T18:30:00.000Z' }))
    expect((await listPending(store))[0]?.queued_at).toBe('2026-11-03T17:00:00.000Z')
  })

  it('lists in queue order so a flush replays taps in the order they happened', async () => {
    const store = memoryStore()
    await enqueue(store, op({ client_mark_id: 'b', queued_at: '2026-11-03T17:05:00.000Z' }))
    await enqueue(store, op({ client_mark_id: 'a', queued_at: '2026-11-03T17:00:00.000Z' }))
    expect((await listPending(store)).map((row) => row.client_mark_id)).toEqual(['a', 'b'])
  })

  it('increments attempts and keeps the op', async () => {
    // The counter exists so the UI can say "we have tried nine times". It is deliberately
    // NOT a budget: there is no threshold at which the queue gives up, because giving up
    // is discarding unsynced work.
    const store = memoryStore()
    await enqueue(store, op())
    await recordAttempt(store, op().client_mark_id)
    await recordAttempt(store, op().client_mark_id)
    const queued = await listPending(store)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.attempts).toBe(2)
  })

  it('removes only the ids the server acknowledged', async () => {
    const store = memoryStore()
    await enqueue(store, op({ client_mark_id: 'a' }))
    await enqueue(store, op({ client_mark_id: 'b' }))
    await markSynced(store, ['a'])
    expect((await listPending(store)).map((row) => row.client_mark_id)).toEqual(['b'])
  })

  it('ignores an acknowledgement for something it never held', async () => {
    // A flush that raced a second flush acknowledges ids already gone. That is a
    // successful outcome, not an error to raise on a coach's screen.
    const store = memoryStore()
    await enqueue(store, op({ client_mark_id: 'a' }))
    await markSynced(store, ['a', 'never-existed'])
    expect(await pendingCount(store)).toBe(0)
  })

  it('reports the oldest queued instant, which is what the stale warning reads', async () => {
    const store = memoryStore()
    expect(await oldestQueuedAt(store)).toBeNull()
    await enqueue(store, op({ client_mark_id: 'b', queued_at: '2026-11-03T18:00:00.000Z' }))
    await enqueue(store, op({ client_mark_id: 'a', queued_at: '2026-11-02T09:00:00.000Z' }))
    expect(await oldestQueuedAt(store)).toBe('2026-11-02T09:00:00.000Z')
  })

  it('counts an empty queue as zero rather than throwing', async () => {
    expect(await pendingCount(memoryStore())).toBe(0)
  })
})
