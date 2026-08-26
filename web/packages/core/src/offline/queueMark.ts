// The one call a screen makes to record a mark. §5.7: "Marks are written to the local store
// first and the UI updates immediately."
//
// **It is not conditional on the network, and that is the point.** §10.3 item 1: "Offline
// writes never depend on a valid token. Marks go to `pending_ops` regardless of auth state
// — the local write is not an API call." A roster that branched on `mode === 'online'` and
// called the API directly in the happy path would have two code paths for one tap, and the
// offline one would be the one nobody exercises until a coach is in a basement.
//
// So: **every** mark is queued, always, and `flush` drains the queue whenever the network
// allows. The online case is simply a queue that empties within a second.
import { enqueue } from './pendingOps'
import { offlineStore, queueChanged } from './useOffline'
import type { OfflineStore, PendingOpKind } from './types'

/**
 * Queue one mark, note, or bulk action.
 *
 * `clientMarkId` is the caller's, because §10.5 makes it the identity of the mark and the
 * caller is the one that can keep it stable across a re-tap of the same row. A UUID minted
 * here would make every correction a new op and every flush a conflict.
 *
 * `store` is injectable so a test does not open IndexedDB; production passes nothing.
 */
export async function queueMark(input: {
  clientMarkId: string
  kind: PendingOpKind
  sessionId: string
  studentId: string | null
  payload: Record<string, unknown>
  deviceMarkedAt: string
  personId: string | null
  /**
   * When it entered the queue. Defaults to `deviceMarkedAt`, and that default is the point:
   * §6.5's blocking warning compares this against the screen's clock, and a queue stamped
   * from `new Date()` while the screen reads an injected clock declares itself stale the
   * moment it is written. **One clock per device.**
   */
  queuedAt?: string
  store?: OfflineStore
}): Promise<void> {
  await enqueue(input.store ?? offlineStore(), {
    client_mark_id: input.clientMarkId,
    kind: input.kind,
    session_id: input.sessionId,
    student_id: input.studentId,
    payload: input.payload,
    device_marked_at: input.deviceMarkedAt,
    queued_at: input.queuedAt ?? input.deviceMarkedAt,
    person_id: input.personId,
    attempts: 0,
  })
  // The badge is the coach's only evidence the tap landed. Bumping it here rather than
  // leaving it to each caller is what makes "3 שיעורים ממתינים לסנכרון" true rather than
  // eventually true.
  queueChanged()
}
