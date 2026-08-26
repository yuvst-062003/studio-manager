// `4c` נוכחות — מה לא סומן, mounted. Nothing imported `AttendanceReport`, so §5.14's
// "unmarked is a real state and is not absence" had no screen in a running app.
//
// The window is the last week and the next day: `4c` is a chase list, so it is about
// sessions that have already happened and not yet been signed. Tomorrow's cannot be late.
import { useMemo } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { AttendanceReport } from './AttendanceReport'
import { makeDashboardAttendanceClient } from './client'

function windowAround(today: Date): { from: string; to: string } {
  const day = 24 * 60 * 60 * 1000
  return {
    from: new Date(today.getTime() - 7 * day).toISOString().slice(0, 10),
    to: new Date(today.getTime() + day).toISOString().slice(0, 10),
  }
}

export function AttendanceSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeDashboardAttendanceClient(apiFetch), [])
  const window = useMemo(() => windowAround(new Date()), [])

  // `onMarkNow` is deliberately absent. §5.14's chase ends on the register, which lives in
  // the STAFF app on another origin — and this app has no business knowing that hostname:
  // `infra/railway/domains.json` is the one place a hostname is written, and it is read
  // server-side. Offering a link built from a guessed origin would be the second place.
  return <AttendanceReport locale={locale} client={client} window={window} />
}
