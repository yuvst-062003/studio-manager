// `4c` נוכחות — מה לא סומן, mounted. Nothing imported `AttendanceReport`, so §5.14's
// "unmarked is a real state and is not absence" had no screen in a running app.
//
// **The range is state now, not a constant.** It used to be `useMemo(() => windowAround(new
// Date()), [])` — the last seven days plus tomorrow, with no control anywhere to change it.
// A chase list whose window a manager cannot move is a chase list that answers one question
// and refuses every follow-up, and the CSV button beside it exported that same fixed window.
// This component owns the range; `AttendanceReport` renders `9b`'s `DateRangePicker` over it
// and reads both the table and the export off it.
import { useMemo, useState } from 'react'
import { apiFetch, studioDayKey } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { AttendanceReport } from './AttendanceReport'
import { makeDashboardAttendanceClient } from './client'

/** The default window: the seven days that have already happened, ending today.
 *
 * **Tomorrow is gone from it, deliberately.** The old default reached a day into the future
 * and the comment beside it said "tomorrow's cannot be late" — which was true and was
 * exactly why including it did nothing. `GET /attendance/report` now says so on the server
 * (`ends_at <= now`), so a window that still claimed to cover tomorrow would be advertising
 * a day it can never return a row for.
 *
 * **The day is read in Asia/Jerusalem** (G3). `toISOString().slice(0, 10)`, which this used
 * to do, is the UTC day: between 22:00 and midnight Israel time it puts the manager a day
 * behind their own club, every night. `studioDayKey` is the same conversion the roster
 * strips and `DateRangePicker`'s ISO value format already agree on.
 */
export function defaultWindow(todayIso: string): { from: string; to: string } {
  const day = 24 * 60 * 60 * 1000
  const today = Date.parse(todayIso)
  return {
    from: studioDayKey(new Date(today - 7 * day).toISOString()),
    to: studioDayKey(new Date(today).toISOString()),
  }
}

export function AttendanceSection({ locale, today }: { locale: Locale; today?: string }) {
  const client = useMemo(() => makeDashboardAttendanceClient(apiFetch), [])
  // `today` is optional so a test can pin the clock; the app passes nothing and gets now.
  const [window, setWindow] = useState(() => defaultWindow(today ?? new Date().toISOString()))

  // B1.4 — `AttendanceReport` used to take an `onMarkNow` callback nobody supplied. §5.14's
  // chase ends on the register, which lives in the STAFF app on another origin — and this
  // app has no business knowing that hostname: `infra/railway/domains.json` is the one
  // place a hostname is written, and it is read server-side. A link built from a guessed
  // origin would have been the second place. `AttendanceReport` now opens `QuickViewRoster`
  // in place instead, through the same `client` this section already hands it, so there is
  // no callback left for this section to decline to pass.
  return (
    <AttendanceReport
      client={client}
      locale={locale}
      onWindowChange={setWindow}
      window={window}
    />
  )
}
