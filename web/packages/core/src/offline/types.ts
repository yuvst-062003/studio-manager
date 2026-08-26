// The shapes §10's offline layer is built out of. One file, so a lane reading the queue
// and a lane reading the cache cannot disagree about what a `PendingOp` is.
//
// §8.1a names Dexie as the IndexedDB wrapper. It is deliberately NOT a dependency here:
// adding `dexie` (and `fake-indexeddb` for tests) edits `web/package.json` and the
// lockfile — files W3's ownership list gives to neither lane, and which the health lane
// holds at the same time. `OfflineStore` below is the seam that keeps that a swap rather
// than a rewrite: everything in `src/offline/` is written against the port, `memoryStore`
// backs every test, and `indexedDbStore` is ~80 lines that a Dexie-backed adapter can
// replace without a single caller changing.

/**
 * §10.1's four states — plus one the table lists separately.
 *
 * `api-down` is not a fifth mood: §10.1's own table gives it its own row ("API down,
 * client online") because the app must say `השרת אינו זמין, ננסה שוב` rather than
 * `לא מקוון`. A coach told "you are offline" while their phone plainly has four bars
 * stops trusting the indicator, and an indicator nobody trusts is worse than none.
 */
export type NetworkMode = 'online' | 'slow' | 'intermittent' | 'offline' | 'api-down'

/** What a lane can queue. §10.2: attendance, session notes and student notes, and nothing
 *  else — "Payments, absence pre-reports, RSVP" are `Never offline` on the same table. */
export type PendingOpKind =
  | 'attendance.mark'
  | 'attendance.bulk'
  | 'note.session'
  | 'note.student'

/**
 * One queued mutation. §10.6: "Every local mutation writes to a `pending_ops` store with a
 * `client_mark_id`, an operation type and a payload, and updates the UI optimistically."
 *
 * `person_id` is on the op and not on the queue as a whole, and that is §10.3 item 4: "If
 * the re-authenticated identity is a *different* person, the queue is not flushed; it is
 * surfaced as a conflict card... Attendance is attributed to whoever marked it, and a
 * device changing hands must not silently rewrite that." A queue-level owner cannot express
 * a device that two coaches used before either of them reconnected.
 *
 * It is nullable because §10.3 item 1 is absolute: "Offline writes never depend on a valid
 * token. Marks go to `pending_ops` regardless of auth state — the local write is not an API
 * call." A mark made while the session has already expired has no verified person to name,
 * and refusing to store it would be exactly the code path §10.3 item 5 forbids.
 */
export type PendingOp = {
  /** §4.3's `client_mark_id`. Client-generated, so it exists before the row has any idea
   *  when it will next reach a network. The server is idempotent on it (§10.5). */
  client_mark_id: string
  kind: PendingOpKind
  session_id: string
  student_id: string | null
  /** The request body this op becomes on flush. Opaque here on purpose — the queue is not
   *  the place that knows what a mark looks like. */
  payload: Record<string, unknown>
  /** §10.5 resolves conflicts on this. The DEVICE clock: resolving on arrival would let
   *  whoever reconnected second overwrite the earlier mark. */
  device_marked_at: string
  /** When it entered the queue. §6.5's blocking stale warning is computed from the oldest
   *  of these, which is a different question from when the coach tapped. */
  queued_at: string
  person_id: string | null
  /** Incremented by a failed flush and **never** used to drop anything. It exists so the
   *  UI can say "we have tried nine times", not so the queue can give up. */
  attempts: number
}

/** §10.5's cross-actor cases, plus §10.3's identity case. */
export type ConflictKind =
  | 'session_cancelled'
  | 'student_unenrolled'
  | 'different_person'
  | 'rejected'

/**
 * A dismissible card. §10.5: "Rejected operations become dismissible conflict cards;
 * nothing is silently dropped."
 *
 * Dismissible, not resolvable-away: dismissing hides the card, and the marks it concerns
 * are already on the server (or still in the queue, for `different_person`). There is no
 * action here that deletes work.
 */
export type ConflictCard = {
  id: string
  kind: ConflictKind
  session_id: string | null
  count: number
  raised_at: string
  dismissed: boolean
}

/** One roster row, as `BootstrapPayload.rosters[sessionId][]` sends it. Mirrors
 *  `app/schemas/attendance.py::RosterEntry`. **Carries no money and must never learn to** —
 *  SPEC §13 invariant 3, and this is the shape a coach's screen is built from. */
export type RosterRow = {
  student_id: string
  display_name: string
  belt_color_hex: string | null
  belt_name: string | null
  /** -- the W3 seam. M4 populates, M5 renders. */
  health_status: 'missing' | 'trial_signed' | 'signed'
  derived_flags: Record<string, boolean>
  /** -- the current mark. */
  status: 'unmarked' | 'present' | 'absent_excused' | 'absent_unexcused'
  source: 'coach' | 'parent' | 'bulk' | 'system' | null
  has_absence_report: boolean
  absence_reason: string | null
}

/** Mirrors `app/schemas/schedule.py::SessionOut`, narrowed to what the roster draws. */
export type CachedSession = {
  id: string
  group_id: string
  group_name: string
  starts_at: string
  ends_at: string
  location_name: string | null
  status: 'scheduled' | 'cancelled' | 'completed'
  attendance_taken: boolean
}

/** `GET /sync/bootstrap`'s body. §6.1's first launch blocks on this. */
export type BootstrapPayload = {
  server_time: string
  from_time: string
  to_time: string
  sessions: CachedSession[]
  rosters: Record<string, RosterRow[]>
}

/**
 * The tables. `pending_ops` and `conflicts` are named separately from everything else
 * because §10.6 treats them differently: "`pending_ops` **exempt from eviction under all
 * circumstances**. Unsynced work is the one thing that must never be reclaimed."
 */
export type TableName = 'pending_ops' | 'sessions' | 'rosters' | 'meta' | 'conflicts'

/**
 * The storage port. Deliberately tiny — five methods, no indexes, no queries.
 *
 * A larger port would let the eviction rule leak into the adapter, and §10.6's exemption is
 * the one rule in this lane that must be readable in one place. `evict()` in `cache.ts` is
 * that place, and it can only touch what it explicitly names.
 */
export interface OfflineStore {
  get<T>(table: TableName, key: string): Promise<T | undefined>
  put<T>(table: TableName, key: string, value: T): Promise<void>
  delete(table: TableName, key: string): Promise<void>
  /** Every row in a table, **key-sorted**, so eviction order and render order are stable
   *  rather than insertion-dependent. */
  all<T>(table: TableName): Promise<{ key: string; value: T }[]>
  clear(table: TableName): Promise<void>
}
