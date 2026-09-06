// The merge behind the restyled 9a/1d: sessions and events on one vertical timeline, and
// the dot-colour rule the prototype does not have.
//
// **The prototype's `ScheduleView` does not read the schedule it is passed** — its four
// cards are hardcoded Hebrew, and its four dot colours (red, green, blue, grey) exist for
// three states with nothing in the data distinguishing the blue card from the grey one.
// That is an artefact of hardcoded cards, not a design. This file states the rule instead:
// **blue is the next session up, grey is every one after it.** Four colours, four meanings.
import { studioDayKey } from '@studio/core'
import type { RosterRow } from '@studio/core'
import type { SessionRow } from './client'
import type { EventOut } from '../events/client'

export type TimelineItem =
  | { kind: 'session'; id: string; startsAt: string; endsAt: string; session: SessionRow }
  | { kind: 'event'; id: string; startsAt: string; endsAt: string | null; event: EventOut }

/**
 * Sessions and events for one studio day, merged by start time. Client-side only — no new
 * endpoint, per §4.1: `GET /api/v1/sessions` and `GET /api/v1/events` are both already
 * fetched, and this is where their answers meet.
 */
export function mergeTimeline(
  sessions: readonly SessionRow[],
  events: readonly EventOut[],
  dayKey: string,
): TimelineItem[] {
  const sessionItems: TimelineItem[] = sessions
    .filter((session) => studioDayKey(session.starts_at) === dayKey)
    .map((session) => ({
      kind: 'session',
      id: session.id,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      session,
    }))
  const eventItems: TimelineItem[] = events
    .filter((event) => studioDayKey(event.starts_at) === dayKey)
    .map((event) => ({
      kind: 'event',
      id: event.id,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      event,
    }))
  return [...sessionItems, ...eventItems].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )
}

/**
 * The dot's four states. **Not the same four as the status chip** (`scheduled` /
 * `cancelled` / `completed`, server truth) — this is what colours the timeline marker, and
 * a cancelled item is never passed in here at all (§9a shows a cancelled session, but it
 * gets no place on this clock; `TodayScreen` filters it out before calling this).
 */
export type DotState = 'pendingClose' | 'activeNow' | 'nextUp' | 'later'

function timeCategory(item: TimelineItem, nowMs: number): 'ended' | 'active' | 'upcoming' {
  const starts = Date.parse(item.startsAt)
  if (nowMs < starts) return 'upcoming'
  // An event with no `ends_at` (the schema allows it) has no "in progress" window — it is
  // either still ahead or already over, never active. A session always carries both.
  const ends = item.endsAt ? Date.parse(item.endsAt) : starts
  return item.endsAt && nowMs < ends ? 'active' : 'ended'
}

/**
 * One state per item, in the SAME order `items` arrives in — which must already be
 * chronological (`mergeTimeline`'s own output), because "next up" is defined as the
 * earliest upcoming item in that order, not recomputed here.
 *
 * An ended item keeps its own colour only when it is a session still owed its register
 * (`pendingClose`, §4.1's table). An ended-and-closed session and an ended event both fall
 * through to `later` — neutral, because neither needs anything from the coach right now.
 */
export function timelineStates(items: readonly TimelineItem[], nowIso: string): DotState[] {
  const nowMs = Date.parse(nowIso)
  let nextUpTaken = false
  return items.map((item) => {
    // A cancelled session never happens, so it is never the thing to close, the thing in
    // progress, or the thing to look at next — it stays neutral and, just as important,
    // does not consume the one `nextUp` slot the genuinely next session should get.
    if (item.kind === 'session' && item.session.status === 'cancelled') return 'later'
    const category = timeCategory(item, nowMs)
    if (category === 'active') return 'activeNow'
    if (category === 'upcoming') {
      if (nextUpTaken) return 'later'
      nextUpTaken = true
      return 'nextUp'
    }
    // ended
    if (item.kind === 'session' && !item.session.attendance_taken) return 'pendingClose'
    return 'later'
  })
}

export type ConfirmationCounts = { total: number; confirmed: number; notAnswered: number }

/**
 * §4.1's "the card also carries who has answered" — `has_confirmation` (will come) and
 * `has_absence_report` (will not) are already on every cached roster row; this just counts
 * them. `undefined` (a roster cached before `has_confirmation` existed, or a fixture that
 * predates it) reads as "not confirmed", never as a thrown error.
 */
export function confirmationCounts(roster: readonly RosterRow[] | undefined): ConfirmationCounts {
  const rows = roster ?? []
  const confirmed = rows.filter((row) => row.has_confirmation === true).length
  const notAnswered = rows.filter(
    (row) => row.has_confirmation !== true && !row.has_absence_report,
  ).length
  return { total: rows.length, confirmed, notAnswered }
}
