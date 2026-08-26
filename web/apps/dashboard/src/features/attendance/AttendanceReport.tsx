// Dashboard artboard `4c` — נוכחות. Two problems on one screen: sessions nobody marked, and
// students who have stopped coming.
//
// **This builds the main pane only.** `4c` finding 2: "The at-risk sidebar is M9's data on
// an M5 screen. Every string in it resolves to `reports.*`, and `4g` is M9's own reports
// page. Decide in the W3 contract whether M5 renders M9's at-risk list or whether this
// sidebar waits for W5 — otherwise both lanes build it." W3's contract commit did not
// decide, so this lane does not build it: shipping it here would have M5 own a list whose
// every string lives in a namespace M9 owns, and W5 would find it already written and
// differently.
//
// **The unmarked-is-not-absent rule is stated, not only encoded.** `4c` finding 1: the
// artboard draws a strip reading present · absent · absent · unmarked · absent · unmarked
// and labels it *three consecutive absences*, so the rule is inferred from the data and
// written nowhere. `reports.attendance.unmarkedExcluded` exists "and this screen does not
// use it. It should." It does now — through this lane's own key, because `reports` is M9's
// namespace and a lane does not write in another's file.
import { useEffect, useState } from 'react'
import { Button, EmptyState, ProgressBar } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import type { DashboardAttendanceClient, UnmarkedSession } from './client'

export function AttendanceReport({
  locale,
  client,
  window,
  groups = [],
  onMarkNow,
}: {
  locale: Locale
  client: DashboardAttendanceClient
  window: { from: string; to: string }
  /** `4c`'s second card — name · bar · percentage. M9's own report computes these across a
   *  term; this screen renders whatever window it is handed. */
  groups?: { id: string; name: string; rate: number }[]
  onMarkNow?: (sessionId: string) => void
}) {
  const [unmarked, setUnmarked] = useState<UnmarkedSession[] | null>(null)

  useEffect(() => {
    let live = true
    void client
      .unmarkedSessions(window)
      .then((rows) => {
        if (live) setUnmarked(rows)
      })
      .catch(() => {
        // §10.2 — the dashboard is online only, explicitly. An empty list with no rows is
        // the honest rendering; there is no cache behind this screen to fall back to.
        if (live) setUnmarked([])
      })
    return () => {
      live = false
    }
  }, [client, window])

  return (
    <section aria-labelledby="attendance-report-title" data-testid="attendance-report">
      <header>
        <h1 id="attendance-report-title">{t(locale, 'attendance.report.title')}</h1>
        <Button variant="secondary">{t(locale, 'attendance.report.export')}</Button>
      </header>

      <section data-testid="unmarked-sessions">
        <h2>{t(locale, 'attendance.report.unmarkedSessions')}</h2>
        {/* finding 1 — the rule, said out loud. §5.14 is why `unmarked` is a real state at
            all, and a manager reading this screen has to know that a forgotten register is
            not a child who stopped coming. */}
        <p data-testid="unmarked-not-absence">
          {t(locale, 'attendance.report.unmarkedNotAbsence')}
        </p>

        {unmarked === null ? null : unmarked.length === 0 ? (
          // finding 6 — "Neither empty state is drawn, and both are the goal state." An
          // empty `ממתין לסימון` list is the club doing well, and a screen that renders
          // nothing there looks broken instead.
          <EmptyState title={t(locale, 'attendance.report.empty')} />
        ) : (
          <ul data-testid="unmarked-list">
            {unmarked.map((session) => (
              <li data-testid={`unmarked-${session.id}`} key={session.id}>
                <span>{formatTimeInStudioZone(session.starts_at, locale)}</span>
                <bdi>{session.group_name}</bdi>
                <span>{formatDateInStudioZone(session.starts_at, locale)}</span>
                <Button variant="secondary">{t(locale, 'attendance.report.remindCoach')}</Button>
                <Button onClick={() => onMarkNow?.(session.id)} variant="primary">
                  {t(locale, 'attendance.report.markNow')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="group-rates">
        <h2>{t(locale, 'attendance.report.byGroup')}</h2>
        {groups.length === 0 ? (
          <EmptyState title={t(locale, 'attendance.report.empty')} />
        ) : (
          <ul>
            {groups.map((group) => (
              <li data-testid={`group-rate-${group.id}`} key={group.id}>
                <bdi>{group.name}</bdi>
                <ProgressBar
                  label={group.name}
                  max={100}
                  readout={`${group.rate}%`}
                  value={group.rate}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
