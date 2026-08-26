// The parent schedule vertical's container, so `App.tsx` needs one route branch.
//
// One screen today — 12b לוח הילד — and the indirection still earns its place: `App.tsx`
// is a file lane PEOPLE also edits this wave, and a second parent schedule screen should
// not reopen it.
//
// **An unknown hash renders nothing here, unlike the staff app.** The parent app's default
// screen is home, which is another lane's; claiming the fallback would quietly replace it.
import type { Locale } from '@studio/i18n'
import { ChildCalendar } from './ChildCalendar'
import type { ParentScheduleClient } from './client'

export function isCalendarRoute(hash: string): boolean {
  return hash.replace(/^#\/?/, '') === 'calendar'
}

export function ScheduleSection({
  locale,
  client,
  hash,
  today,
}: {
  locale: Locale
  client: ParentScheduleClient
  hash: string
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
}) {
  if (!isCalendarRoute(hash)) return null
  return <ChildCalendar locale={locale} client={client} today={today} />
}
