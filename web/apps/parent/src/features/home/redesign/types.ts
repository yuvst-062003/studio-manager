// The shapes בית's ported components take. Written before the markup, because they are
// the one place the prototype's fiction and this app's data have to be reconciled.
//
// **THE RECONCILIATION THAT MATTERS: a session belongs to a GROUP, not to a child.**
//
// The prototype's `Session` carries `traineeId` and `traineeName` — one session, one child.
// Ours is `GET /sessions`'s `SessionRow`, which carries `group_id` and `group_name`, and a
// group can hold two of a family's children. `ParentHome` already resolves this the only
// way the data allows — `child.groupNames.includes(lesson.groupName)` — and names the
// FIRST matching child, which is why its card can only ever ask about one of them.
//
// The redesign does not have that problem, because the prototype draws one card per child
// per lesson. So a lesson matching two children expands into two `HomeSession` rows with
// the same `id` and different `studentId`, and each carries its own answer. That pair is
// what the server stores an absence report against, so two siblings in one group are asked
// separately and answered separately — which is correct, and is what the old card could
// not do.

/** One of the family's children, as the chips and the belt bars need them. */
export type HomeChild = {
  id: string
  /** Chips and cards name a child by their FIRST name — three shared surnames in one
   *  column identify nobody. `ParentHome` made the same call. */
  firstName: string
  displayName: string
  /** Group NAMES, not ids: `/me/students` returns `group_names` and `GET /sessions`
   *  returns `group_name`, and matching them is the only join the API offers. */
  groupNames: readonly string[]
  /** `current_belt_color_hex`. `null` before a first belt — drawn as absent, never as an
   *  invented colour. */
  beltColorHex: string | null
  beltName: string | null
}

/** One lesson, resolved to ONE child. See the header — a group lesson expands into one of
 *  these per matching child. */
export type HomeSession = {
  /** The SESSION's id. Not unique across rows; the React key is `${id}:${studentId}`. */
  id: string
  studentId: string
  studentName: string
  /** The prototype's `sessionName`. Ours is the group's name — there is no per-session
   *  title in the API, and inventing one ("אימון טכניקה וקאטה") would be fiction. */
  groupName: string
  /** UTC ISO. Rendered in the studio zone at the edge, never stored local. */
  startsAt: string
  endsAt: string | null
  locationName: string | null
  /** The lead coach, from `SessionRow.staff`. `null` when none is assigned. */
  coachName: string | null
  beltColorHex: string | null
  /** Has the family already filed an absence report for this (session, child)? */
  reportedAbsent: boolean
  /** §5's `cancel_reason`, already resolved to a sentence by the caller. A cancelled
   *  lesson is not an absence and must not read as one. */
  cancelledReason: string | null
}

/** What the urgent banner has to say, or `null` for each half that is clear. */
export type HomeUrgent = {
  /** Outstanding balance in agorot. Integer, never a float, never divided outside a
   *  formatter. `null` when the family owes nothing. */
  debtAgorot: number | null
  /** The children whose health declaration is missing or expired, by first name. Empty
   *  when every child is signed. */
  childrenNeedingDeclaration: readonly string[]
}

/** A day in the seven-day strip. */
export type StripDay = {
  /** `YYYY-MM-DD` in the studio's zone — the key everything else is filtered by. */
  dayKey: string
  /** The day-of-month numeral the chip prints. */
  dayOfMonth: number
  /** Sunday = 0, matching `Date.getUTCDay()` and the `schedule.weekday.*` keys. */
  weekday: number
  isToday: boolean
  /** Does any of the family's children train that day? The prototype's strip has no such
   *  mark; ours does, because a strip that looks identical on every day is a strip that
   *  answers nothing. */
  hasSessions: boolean
}
