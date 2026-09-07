// The staff schedule vertical's container, and the reason `App.tsx` needs exactly one
// route branch rather than two.
//
// `web/apps/staff/src/App.tsx` is a file lane PEOPLE also has to edit this wave, so the
// diff there is one NAV href, one hash hook and a single `{route === 'schedule' ? … : …}`.
// Which of 9a/1d or 9b to draw, and how a coach gets from one to the other, is this lane's
// business and lives in this lane's folder.
//
// Routing is `location.hash`, matching the dashboard: real `<a href>` links that survive
// the back button and open-in-new-tab, with no router dependency —
// `.claude/rules/ui-rtl-a11y.md` says not to add one without asking.
import type { Locale } from '@studio/i18n'
import { TodayScreen } from './TodayScreen'
import type { CoachOption } from './TodayScreen'
import type { StaffScheduleClient } from './client'
import type { StaffEventsClient } from '../events/client'
import type { StaffPeopleClient } from '../people'
import type { StaffAttendanceClient } from '../attendance/client'

// `#/schedule` is 9a/1d and there is nothing else under it any more.
//
// **9b (`#/schedule/date`) was deleted on 2026-09-07**, with the duplicate calendar icon
// that was its only door. Its month grid marked days but showed no sessions, and its extra
// half — a date RANGE — was already half-dead: this file kept `range.from` and threw the
// end away, so two inputs fed one value that §4.7's month calendar supplies with a tap.
// `staffScheduleRoute` and `StaffScheduleView` went with it; a router with one destination
// is an `if` that always answers the same way. The grid helpers 9b also held live on in
// `./monthGrid`, which the month calendar imports.

export function ScheduleSection({
  locale,
  client,
  eventsClient,
  peopleClient,
  attendanceClient,
  today,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
  viewerIsManager = false,
  canWritePlan = false,
}: {
  locale: Locale
  client: StaffScheduleClient
  /** §4.1's merge — passed straight through to 9a/1d. Optional: see `TodayScreen`'s own
   *  note on why a caller that has not wired one yet still works unchanged. */
  eventsClient?: StaffEventsClient
  /** §4.9's chase action, passed straight through. Same optionality as `eventsClient`. */
  peopleClient?: StaffPeopleClient
  /** §6.2's marker-becomes-a-button pass (2026-09-07), passed straight through to 9a/1d —
   *  same optionality as `eventsClient`/`peopleClient`: a caller that has not wired one yet
   *  still gets a working marker, it just cannot save through it. */
  attendanceClient?: StaffAttendanceClient
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
  coaches?: CoachOption[]
  viewerPersonId?: string
  viewerIsCoach?: boolean
  /** owner/manager only — gates 9a's coach filter. See `TodayScreen`'s note. */
  viewerIsManager?: boolean
  /** §6.2, decision 16 — the same trio `RosterScreen`'s own prop of the same name gates. */
  canWritePlan?: boolean
}) {
  return (
    <TodayScreen
      locale={locale}
      client={client}
      eventsClient={eventsClient}
      peopleClient={peopleClient}
      attendanceClient={attendanceClient}
      today={today}
      coaches={coaches}
      viewerPersonId={viewerPersonId}
      viewerIsCoach={viewerIsCoach}
      viewerIsManager={viewerIsManager}
      canWritePlan={canWritePlan}
    />
  )
}
