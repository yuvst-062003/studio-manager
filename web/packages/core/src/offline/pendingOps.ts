// §10.6's `pending_ops` store — "the one thing that must never be reclaimed".
//
// **Nothing in this module takes a token, a session or a fetcher.** That is §10.3 item 1
// expressed as a signature rather than as a comment: "Offline writes never depend on a
// valid token. Marks go to `pending_ops` regardless of auth state — the local write is not
// an API call." A coach on a mat for ninety minutes has an expired access token long
// before they finish, and the whole point is that nothing about that reaches the tap.
//
// **There is no function here that empties the queue**, and `pendingOps.test.ts` asserts
// it against the module's exported names. §10.3 item 5 is absolute — "A queue is never
// dropped on an auth failure. There is no code path that discards unsynced work." —
// and the way to keep that true through five more waves is to make the absence testable.
// `markSynced` is the one remover and it removes only ids the *server acknowledged*.
import type { OfflineStore, PendingOp } from './types'

const TABLE = 'pending_ops' as const

/**
 * Queue one mutation, or amend one already queued.
 *
 * Keyed on `client_mark_id`, so a coach tapping the same row three times leaves **one**
 * op carrying their final answer rather than three the server has to reconcile. §10.5's
 * idempotency starts here on the device; the server's is the second line, not the first.
 *
 * `queued_at` survives an amendment. §6.5's blocking warning fires on work "queued for
 * more than one session", and a coach correcting a mark has not reset the clock on how long
 * this device has been holding unsynced work.
 */
export async function enqueue(store: OfflineStore, op: PendingOp): Promise<void> {
  const existing = await store.get<PendingOp>(TABLE, op.client_mark_id)
  await store.put<PendingOp>(TABLE, op.client_mark_id, {
    ...op,
    queued_at: existing?.queued_at ?? op.queued_at,
    attempts: existing?.attempts ?? op.attempts,
  })
}

/**
 * Everything still unsynced, oldest tap first.
 *
 * Ordered by `queued_at` rather than by key: the key is a UUID and the flush replays taps,
 * so key order would send a 17:40 correction before the 17:05 mark it corrects. The server
 * resolves on `device_marked_at` and would get the right answer anyway — but a queue that
 * relies on that is a queue whose order is untested.
 */
export async function listPending(store: OfflineStore): Promise<PendingOp[]> {
  const rows = await store.all<PendingOp>(TABLE)
  return rows
    .map((row) => row.value)
    .sort((a, b) => (a.queued_at < b.queued_at ? -1 : a.queued_at > b.queued_at ? 1 : 0))
}

export async function pendingCount(store: OfflineStore): Promise<number> {
  return (await store.all<PendingOp>(TABLE)).length
}

/**
 * The oldest instant anything has been waiting since, or `null` for an empty queue.
 *
 * §6.5's blocking warning and §10.4's staleness banner both read this. `null` is a real
 * answer — "nothing is waiting" — and is why the return type is not a date with a sentinel.
 */
export async function oldestQueuedAt(store: OfflineStore): Promise<string | null> {
  const rows = await listPending(store)
  return rows[0]?.queued_at ?? null
}

/**
 * Note that a flush was attempted and did not land.
 *
 * **The counter is not a budget.** There is deliberately no threshold at which an op is
 * dropped, because a threshold is a code path that discards unsynced work — the exact thing
 * §10.3 item 5 forbids. It exists so the queue detail sheet can say how many times the app
 * has tried, which is what turns "3 שיעורים ממתינים לסנכרון" from a mystery into a
 * diagnosis.
 */
export async function recordAttempt(store: OfflineStore, clientMarkId: string): Promise<void> {
  const existing = await store.get<PendingOp>(TABLE, clientMarkId)
  if (existing === undefined) return
  await store.put<PendingOp>(TABLE, clientMarkId, { ...existing, attempts: existing.attempts + 1 })
}

/**
 * Remove the ops the **server acknowledged**.
 *
 * The only removal in this module, and the only one anywhere in `src/offline/` that touches
 * this table — `cache.ts`'s eviction explicitly excludes it (§10.6). An id the queue no
 * longer holds is ignored rather than raised: two overlapping flushes acknowledge the same
 * op, and that is a successful outcome, not an error to put on a coach's screen.
 */
export async function markSynced(store: OfflineStore, clientMarkIds: string[]): Promise<void> {
  for (const id of clientMarkIds) {
    await store.delete(TABLE, id)
  }
}
