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
import { useCallback, useState } from 'react'
import type { Locale } from '@studio/i18n'
import { DatePickerScreen } from './DatePickerScreen'
import { TodayScreen } from './TodayScreen'
import type { CoachOption } from './TodayScreen'
import type { StaffScheduleClient } from './client'
import type { StaffEventsClient } from '../events/client'
import type { StaffPeopleClient } from '../people'
import type { StaffAttendanceClient } from '../attendance/client'

export type StaffScheduleView = 'today' | 'date'

/** `#/schedule` → 9a/1d · `#/schedule/date` → 9b. Anything else is היום. */
export function staffScheduleRoute(hash: string): StaffScheduleView {
  return hash.replace(/^#\/?/, '') === 'schedule/date' ? 'date' : 'today'
}

export function ScheduleSection({
  locale,
  client,
  eventsClient,
  peopleClient,
  attendanceClient,
  hash,
  today,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
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
  hash: string
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
  coaches?: CoachOption[]
  viewerPersonId?: string
  viewerIsCoach?: boolean
  /** §6.2, decision 16 — the same trio `RosterScreen`'s own prop of the same name gates. */
  canWritePlan?: boolean
}) {
  const [picked, setPicked] = useState<string | null>(null)

  // 9b hands back a range; היום shows one day, so the range's start is the day to open on.
  // Kept in state rather than pushed into the hash: a coach who picks 10 November and then
  // presses back wants the picker again, not a URL they have to clear by hand.
  const onSelect = useCallback((range: { from: string; to: string }) => {
    setPicked(range.from)
    if (globalThis.location) globalThis.location.hash = '#/schedule'
  }, [])

  if (staffScheduleRoute(hash) === 'date') {
    return <DatePickerScreen locale={locale} client={client} today={today} onSelect={onSelect} />
  }

  // 9b is reachable or it is not delivered — `open-date-picker` used to be a standalone
  // line drawn here, above 9a/1d's own header. C2's anatomy pass gave 9a a header of its
  // own with a calendar icon button that IS that door (a real `<a href>`, same reasoning:
  // it survives the back button and open-in-new-tab), so `TodayScreen` renders it now and
  // this file has nothing left to draw beside it.
  return (
    <TodayScreen
      // Remounts when the pick changes, so the day state re-seeds from it.
      key={picked ?? 'today'}
      locale={locale}
      client={client}
      eventsClient={eventsClient}
      peopleClient={peopleClient}
      attendanceClient={attendanceClient}
      today={today}
      // A day chosen in 9b wins over the clock until the coach navigates away — and
      // `חזרה להיום` on the screen itself walks back, because `today` stays honest.
      initialDay={picked}
      coaches={coaches}
      viewerPersonId={viewerPersonId}
      viewerIsCoach={viewerIsCoach}
      canWritePlan={canWritePlan}
    />
  )
}
