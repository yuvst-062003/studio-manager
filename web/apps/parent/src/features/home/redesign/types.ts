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

/**
 * One child's plan, on the wire — `GET /me/training-plans`.
 *
 * **Why home needs its own read for this.** `HomeChild` below comes from `/me/students`,
 * whose `StudentSummaryOut` deliberately omits `price_plan_id`: that shape is the roster
 * row a COACH also receives from a list, and §13's third invariant keeps financial fields
 * off it. A tuition amount there would ride onto every screen that happens to list
 * students. So the plan arrives separately, on a parent-scoped route, and `Resolve` fetches
 * it beside the others.
 *
 * Snake_case because it is the payload, untouched — the pill reads two fields off it and
 * mapping the whole row into camelCase would be a second shape to keep in step.
 */
export type HomePlanRow = {
  student_id: string
  student_name: string
  /** `null` for a `lead`, or a child a manager has not priced yet. The pill is not drawn. */
  plan_name: string | null
  monthly_amount_agorot: number | null
}

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
  /**
   * WHAT THIS ROW IS.
   *
   * §4: "events appear beside every other session", so §5.12's competitions, seminars and
   * gradings are folded into the same list rather than living only behind `#/events`. A
   * family's week is one week; two lists of it is how a parent misses the grading.
   *
   * The CARD is not the same, and that is the reason this discriminator exists rather than
   * a lesson-shaped event. A lesson asks "נעדר/ת?" and writes an absence report; an event
   * asks for an RSVP, which is a different answer to a different question, stored in a
   * different table. Sending an event id to `POST /absence-reports` would 404 at best.
   */
  kind: 'lesson' | 'event'
  /** The SESSION's id, or the EVENT's. Not unique across rows; the React key is
   *  `${id}:${studentId}`, which is unique because a child appears once per row. */
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
  /**
   * `kind: 'event'` only — this child's own answer, `null` when they have not given one.
   *
   * `pending` from the API becomes `null` here on purpose: it is the ABSENCE of an answer,
   * and a card that renders it as a value would show "ממתין" as though the parent had
   * chosen it. `null` is what draws the ask.
   */
  rsvp?: 'yes' | 'no' | null
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
