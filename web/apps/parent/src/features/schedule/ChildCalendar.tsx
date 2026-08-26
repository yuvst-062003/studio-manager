// Parent artboard 12b — לוח הילד: חודש שלם, כולל נוכחות שהייתה.
//
// **§5.6's change is only real when the family sees it.** A schedule change that updates
// the dashboard and not the parent app is how a child arrives an hour early. Because the
// rewrite touches only the future, this screen shows the new time on an upcoming lesson and
// the old one on a lesson that already happened — E2E-5's second scenario, and a test here.
//
// **The screen never names a group or a student.** `GET /sessions` narrows a guardian to
// the groups their own children are enrolled in, server-side. A client that named its own
// scope could name somebody else's, and the server would have no way to tell; the client's
// type forbids the parameter and a test asserts the call site too.
//
// `כולל נוכחות שהייתה` is M5's half. It ships as a stated sentence rather than a blank
// column — a parent opening this should read when attendance arrives, not see an empty box
// that looks broken.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, EmptyState, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel } from './client'
import type { ParentScheduleClient, SessionRow } from './client'

const pad = (value: number): string => String(value).padStart(2, '0')
const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`

/** One month, Sunday-first, padded to whole weeks with `''`. */
function monthGrid(year: number, month: number): string[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: string[] = Array.from({ length: firstWeekday }, () => '')
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(dayKey(year, month, day))
  while (cells.length % 7 !== 0) cells.push('')
  return cells
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 'var(--space-1)',
}

const headerCellStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: 'var(--text-caption)',
  color: 'var(--text-secondary)',
}

const dayStyle: CSSProperties = {
  minBlockSize: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-caption)',
}

// Longhand for the same reason DatePickerScreen uses it: `dayStyle` carries no border at
// all, so a shorthand here would be added and removed as days gain and lose lessons, and
// React warns that mixing the two forms leaves stale values behind.
const trainingDayStyle: CSSProperties = {
  ...dayStyle,
  background: 'var(--surface)',
  borderStyle: 'solid',
  borderWidth: 'var(--border-width-strong)',
  borderColor: 'var(--accent)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }
const laterStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }

function SessionLine({
  locale,
  session,
  testId,
}: {
  locale: Locale
  session: SessionRow
  testId: string
}) {
  return (
    <li data-testid={testId} style={rowStyle}>
      <span>{formatDateInStudioZone(session.starts_at, locale)}</span>
      <span>
        {formatTimeInStudioZone(session.starts_at, locale)}
        {'–'}
        {formatTimeInStudioZone(session.ends_at, locale)}
      </span>
      <strong>{session.group_name}</strong>
      {session.location_name ? <span style={noteStyle}>{session.location_name}</span> : null}
      {session.status !== 'scheduled' ? (
        <StatusChip
          status={session.status === 'cancelled' ? 'cancelled' : 'planned'}
          label={t(locale, `schedule.session.status.${session.status}`)}
        />
      ) : null}
      {session.cancel_reason ? (
        <span style={noteStyle}>{cancelReasonLabel(locale, session.cancel_reason)}</span>
      ) : null}
    </li>
  )
}

export function ChildCalendar({
  locale,
  client,
  today,
}: {
  locale: Locale
  client: ParentScheduleClient
  /** An ISO instant. A prop, not `new Date()` — upcoming-vs-past is decided against it. */
  today: string
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const bounds = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return { from: dayKey(year, month, 1), to: dayKey(year, month, daysInMonth) }
  }, [year, month])

  useEffect(() => {
    let live = true
    void (async () => {
      // No group, no student. See the module header.
      const loaded_ = await client.listSessions({ from: bounds.from, to: bounds.to })
      if (!live) return
      setSessions(loaded_)
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [bounds.from, bounds.to, client])

  const trainingDays = useMemo(
    () => new Set(sessions.map((session) => studioDayKey(session.starts_at))),
    [sessions],
  )

  const { upcoming, past } = useMemo(() => {
    const sorted = [...sessions].sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    return {
      upcoming: sorted.filter((session) => session.starts_at > today),
      past: sorted.filter((session) => session.starts_at <= today).reverse(),
    }
  }, [sessions, today])

  const step = useCallback((delta: number) => {
    setMonth((currentMonth) => {
      const next = currentMonth + delta
      if (next < 1) {
        setYear((currentYear) => currentYear - 1)
        return 12
      }
      if (next > 12) {
        setYear((currentYear) => currentYear + 1)
        return 1
      }
      return next
    })
  }, [])

  return (
    <section aria-labelledby="child-calendar-title" data-testid="child-calendar" style={pageStyle}>
      <h1 id="child-calendar-title">{t(locale, 'schedule.calendar.title')}</h1>

      <div style={toolbarStyle}>
        <button type="button" data-testid="calendar-previous" onClick={() => step(-1)}>
          {t(locale, 'schedule.calendar.previousMonth')}
        </button>
        <span data-testid="calendar-month">{`${year}-${pad(month)}`}</span>
        <button type="button" data-testid="calendar-next" onClick={() => step(1)}>
          {t(locale, 'schedule.calendar.nextMonth')}
        </button>
      </div>

      <div style={gridStyle} role="grid" aria-label={t(locale, 'schedule.view.month')}>
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
          <div key={weekday} style={headerCellStyle} role="columnheader">
            {t(locale, `schedule.weekday.${weekday}`)}
          </div>
        ))}
        {cells.map((cell, index) =>
          cell === '' ? (
            <div key={`pad-${index}`} style={dayStyle} aria-hidden="true" />
          ) : (
            <div
              key={cell}
              role="gridcell"
              // Keyed only; the month's length is `getAllByRole('gridcell')`. The pads are
              // aria-hidden divs, so the gridcells ARE the days.
              data-testid={`calendar-day-${cell}`}
              data-has-sessions={trainingDays.has(cell) ? 'true' : 'false'}
              aria-current={cell === todayKey ? 'date' : undefined}
              style={trainingDays.has(cell) ? trainingDayStyle : dayStyle}
            >
              {Number(cell.slice(8))}
            </div>
          ),
        )}
      </div>

      {loaded && sessions.length === 0 ? (
        <EmptyState
          title={t(locale, 'schedule.calendar.empty')}
          description={t(locale, 'schedule.calendar.emptyHint')}
        />
      ) : null}

      {upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">{t(locale, 'schedule.calendar.upcoming')}</h2>
          <Card>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {upcoming.map((session) => (
                <SessionLine
                  key={session.id}
                  locale={locale}
                  session={session}
                  testId="upcoming-session"
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="past-title">
          <h2 id="past-title">{t(locale, 'schedule.calendar.past')}</h2>
          <Card>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {past.map((session) => (
                <SessionLine
                  key={session.id}
                  locale={locale}
                  session={session}
                  testId="past-session"
                />
              ))}
            </ul>
          </Card>
          {/* M5's half of 12b, stated rather than left blank. */}
          <p style={laterStyle}>{t(locale, 'schedule.calendar.attendanceComesLater')}</p>
        </section>
      ) : null}
    </section>
  )
}
