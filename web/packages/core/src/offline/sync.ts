// §10.6's sync-queue mechanics, and §10.3's three authentication outcomes.
//
// **The one thing this module must never do is drop work.** §10.3 item 5: "A queue is never
// dropped on an auth failure. There is no code path that discards unsynced work." So there
// are exactly two ways an op leaves the queue, and both mean the *server took it*:
//
//   * the batch reported it `applied`, or
//   * the batch reported it `replayed`, which §10.5 says is a no-op and therefore also a
//     successful flush — a client that retried a replay would never drain its badge.
//
// Everything else — a 401, a failed refresh, a different person, a `TypeError: Failed to
// fetch` — leaves the queue exactly as it was and reports `deferred`.
//
// **A conflict card is raised BESIDE stored work, never instead of it.** §10.5: "Rejected
// operations become dismissible conflict cards; nothing is silently dropped." Dismissing a
// card hides the card. There is no action in this layer that deletes a mark.
import { listPending, markSynced, recordAttempt } from './pendingOps'
import type { ConflictCard, ConflictKind, OfflineStore, PendingOp } from './types'

const CONFLICTS = 'conflicts' as const
const BATCH_PATH = '/api/v1/attendance/batch'

/** What the server's `BatchResult` looks like on the wire. Mirrors
 *  `app/services/attendance/schemas.py`. */
type BatchResponse = {
  applied: number
  replayed: number
  superseded: number
  conflicts: {
    kind: Exclude<ConflictKind, 'different_person'>
    session_id: string
    student_ids: string[]
    count: number
  }[]
}

export type FlushResult = {
  /** Ops the server took. They have left the queue. */
  flushed: number
  /** Ops still in the queue, waiting for a better moment. **Not** a failure count — a
   *  deferred op is a preserved one, which is the whole point of §10.3 item 3. */
  deferred: number
  conflicts: ConflictCard[]
}

export type FlushDeps = {
  store: OfflineStore
  post: (path: string, body: unknown) => Promise<Response>
  /** Rotate the refresh token. `false` means it has expired too — §10.3 item 3's
   *  "device offline for over a month". */
  refresh: () => Promise<boolean>
  /** Who is signed in **right now**. `null` while nobody is. */
  currentPersonId: () => string | null
}

/**
 * Drain `pending_ops`, one request per session.
 *
 * One request per session rather than one per tap: `POST /attendance/batch` takes a session
 * and a list, and thirty requests on a reconnect is thirty chances to lose the network
 * halfway through a register.
 */
export async function flush(deps: FlushDeps): Promise<FlushResult> {
  const pending = await listPending(deps.store)
  if (pending.length === 0) return { flushed: 0, deferred: 0, conflicts: [] }

  const me = deps.currentPersonId()
  const { mine, theirs } = partitionByOwner(pending, me)

  const cards: ConflictCard[] = []
  if (theirs.length > 0) {
    // §10.3 item 4 — "If the re-authenticated identity is a *different* person, the queue is
    // not flushed; it is surfaced as a conflict card for a manager to resolve."
    //
    // Their ops stay queued and untouched. A shared club phone is the ordinary case here,
    // not a security scenario: one coach marks, goes home, another signs in on the same
    // handset before the first ever found signal. Holding *your own* marks hostage to
    // theirs would be its own kind of data loss, which is why this partitions rather than
    // refusing the whole queue.
    cards.push(
      await raise(deps.store, {
        kind: 'different_person',
        session_id: null,
        count: theirs.length,
      }),
    )
  }

  let flushed = 0
  let refreshed = false

  for (const [sessionId, ops] of groupBySession(mine)) {
    const send = (): Promise<Response> =>
      deps.post(BATCH_PATH, {
        session_id: sessionId,
        marks: ops.map(toMark),
        // §10.5 — what the device believed when the coach marked. A manager cancelling the
        // session meanwhile is the cross-actor conflict this lets the server detect rather
        // than silently apply.
        session_status_seen: 'scheduled',
      })

    let response: Response
    try {
      response = await send()
      if (response.status === 401 && !refreshed) {
        // §10.3 item 2 — "On reconnect the client refreshes and *then* flushes." A
        // fifteen-minute access token dying during a ninety-minute lesson is the normal
        // case, not an edge one.
        refreshed = true
        if (!(await deps.refresh())) {
          // §10.3 item 3 — the refresh token has expired too. The queue is PRESERVED. The
          // user signs in again and it flushes afterwards.
          await noteAttempts(deps.store, ops)
          continue
        }
        response = await send()
      }
    } catch {
      // A `TypeError: Failed to fetch` is the network, not an answer. Nothing leaves.
      await noteAttempts(deps.store, ops)
      continue
    }

    if (!response.ok) {
      await noteAttempts(deps.store, ops)
      continue
    }

    const body = (await response.json()) as BatchResponse
    // `replayed` counts as flushed: §10.5 makes a replay a no-op, so the server holds the
    // mark and the queue entry is done. Treating it as failure is how a badge gets stuck at
    // "3 ממתינים" forever on a device that already synced.
    await markSynced(
      deps.store,
      ops.map((op) => op.client_mark_id),
    )
    flushed += ops.length
    for (const conflict of body.conflicts ?? []) {
      cards.push(
        await raise(deps.store, {
          kind: conflict.kind,
          session_id: conflict.session_id,
          count: conflict.count,
        }),
      )
    }
  }

  const deferred = (await listPending(deps.store)).length
  return { flushed, deferred, conflicts: cards }
}

export async function listConflicts(store: OfflineStore): Promise<ConflictCard[]> {
  const rows = await store.all<ConflictCard>(CONFLICTS)
  return rows.map((row) => row.value).filter((card) => !card.dismissed)
}

/**
 * Hide a card.
 *
 * It does **not** touch the work the card concerns: a `session_cancelled` card's marks are
 * already on the server, and a `different_person` card's ops are still in the queue for a
 * manager to deal with. Dismissal is an acknowledgement, not a resolution.
 */
export async function dismissConflict(store: OfflineStore, id: string): Promise<void> {
  const card = await store.get<ConflictCard>(CONFLICTS, id)
  if (card === undefined) return
  await store.put<ConflictCard>(CONFLICTS, id, { ...card, dismissed: true })
}

function partitionByOwner(
  ops: PendingOp[],
  me: string | null,
): { mine: PendingOp[]; theirs: PendingOp[] } {
  const mine: PendingOp[] = []
  const theirs: PendingOp[] = []
  for (const op of ops) {
    // `person_id: null` is §10.3 item 1's op — written while nobody was verified, because
    // "the local write is not an API call". It is not a DIFFERENT person, so it is not a
    // conflict; the server attributes it to whoever is calling, which is the only honest
    // answer available.
    if (op.person_id === null || me === null || op.person_id === me) mine.push(op)
    else theirs.push(op)
  }
  return { mine, theirs }
}

function groupBySession(ops: PendingOp[]): Map<string, PendingOp[]> {
  const grouped = new Map<string, PendingOp[]>()
  for (const op of ops) {
    const existing = grouped.get(op.session_id)
    if (existing) existing.push(op)
    else grouped.set(op.session_id, [op])
  }
  return grouped
}

function toMark(op: PendingOp): Record<string, unknown> {
  return {
    ...op.payload,
    student_id: op.student_id,
    client_mark_id: op.client_mark_id,
    device_marked_at: op.device_marked_at,
  }
}

async function noteAttempts(store: OfflineStore, ops: PendingOp[]): Promise<void> {
  // The counter is for the queue detail sheet, not for a budget. There is no threshold at
  // which an op is dropped, because a threshold is a code path that discards unsynced work.
  for (const op of ops) await recordAttempt(store, op.client_mark_id)
}

/**
 * Store a card, or leave the one already showing alone.
 *
 * Keyed on `kind|session_id`, so three foreground resumes in a row do not stack three
 * identical cards in a coach's alert centre — and so a card the coach **dismissed** is not
 * resurrected by the next flush, which would make dismissal meaningless.
 */
async function raise(
  store: OfflineStore,
  card: { kind: ConflictKind; session_id: string | null; count: number },
): Promise<ConflictCard> {
  const id = `${card.kind}|${card.session_id ?? '-'}`
  const existing = await store.get<ConflictCard>(CONFLICTS, id)
  if (existing !== undefined) return existing
  const raised: ConflictCard = {
    id,
    kind: card.kind,
    session_id: card.session_id,
    count: card.count,
    raised_at: new Date().toISOString(),
    dismissed: false,
  }
  await store.put<ConflictCard>(CONFLICTS, id, raised)
  return raised
}
