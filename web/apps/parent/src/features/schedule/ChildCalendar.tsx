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
// `כולל נוכחות שהייתה` is real now (P3): every day carries what actually happened, per
// child, from `GET /me/attendance` — the §3.3-scoped read whose docstring names 2a's
// strip and this screen as its two consumers. The legend is the screen's purpose.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, EmptyState, SegmentedControl, StatusChip } from '@studio/ui'
import { apiFetch, formatDateInStudioZone, formatTimeInStudioZone, studioDayKey } from '@studio/core'
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

type AttendanceRow = { session_id: string; student_id: string; status: string; starts_at: string }
type Child = { id: string; first_name: string; last_name: string }

//: The day's single word, worst-first: an absence outranks a presence on the same day
//: (two children, one missed), a pre-report outranks unmarked.
const DAY_PRIORITY = ['absent_unexcused', 'absent_excused', 'unmarked', 'present'] as const

type DayState = 'present' | 'absent' | 'notified' | 'unmarked' | 'planned'

function dayState(rows: AttendanceRow[]): DayState {
  for (const status of DAY_PRIORITY) {
    if (rows.some((row) => row.status === status)) {
      if (status === 'present') return 'present'
      if (status === 'absent_unexcused') return 'absent'
      if (status === 'absent_excused') return 'notified'
      return 'unmarked'
    }
  }
  return 'unmarked'
}

const DAY_TONE: Record<DayState, string> = {
  present: 'var(--paid)',
  absent: 'var(--debt)',
  notified: 'var(--pending)',
  unmarked: 'var(--text-muted)',
  planned: 'var(--accent)',
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

/** No box of its own: the month is one flat CSS grid, and the row exists only so the ARIA
 *  structure is valid (a cell may not be a direct child of a table). */
const weekRowStyle: CSSProperties = { display: 'contents' }

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
  // P3 — the attendance layer and its per-child switcher.
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const [view, setView] = useState<'month' | 'week'>('month')

  const cells = useMemo(() => monthGrid(year, month), [year, month])
  // `monthGrid` already pads to a whole number of sevens, so every chunk is a full week.
  const weeks = useMemo(
    () => Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)),
    [cells],
  )
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

  useEffect(() => {
    let live = true
    // Well inside the endpoint's 62-day cap: one month is at most 31.
    void apiFetch(`/api/v1/me/attendance?from=${bounds.from}&to=${bounds.to}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { items: AttendanceRow[] }).items : []))
      .then((items) => live && setAttendance(items))
      .catch(() => undefined)
    void apiFetch('/api/v1/me/students')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: Child[] }).items : []))
      .then((items) => live && setChildren(items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [bounds.from, bounds.to])

  const filteredAttendance = useMemo(
    () => (childFilter ? attendance.filter((row) => row.student_id === childFilter) : attendance),
    [attendance, childFilter],
  )

  const attendanceByDay = useMemo(() => {
    const map = new Map<string, AttendanceRow[]>()
    for (const row of filteredAttendance) {
      const key = studioDayKey(row.starts_at)
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return map
  }, [filteredAttendance])

  const summary = useMemo(() => {
    const held = [...attendanceByDay.values()].flat().filter((row) => row.starts_at <= today)
    const present = held.filter((row) => row.status === 'present').length
    const marked = held.filter((row) => row.status !== 'unmarked').length
    const planned = sessions.filter((session) => session.starts_at > today).length
    return {
      had: new Set(held.map((row) => row.session_id)).size,
      planned,
      pct: marked > 0 ? Math.round((present / marked) * 100) : null,
    }
  }, [attendanceByDay, sessions, today])

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

      {/* 12b's per-child header: הלוח של דנה. The chip filters the layer; the grid
          itself is the family's. */}
      {children.length > 1 ? (
        <div role="group" aria-label={t(locale, 'schedule.calendar.childAll')} style={toolbarStyle}>
          <button
            aria-pressed={childFilter === null}
            data-testid="calendar-child-all"
            onClick={() => setChildFilter(null)}
            type="button"
          >
            {t(locale, 'schedule.calendar.childAll')}
          </button>
          {children.map((child) => (
            <button
              aria-pressed={childFilter === child.id}
              data-testid={`calendar-child-${child.id}`}
              key={child.id}
              onClick={() => setChildFilter(childFilter === child.id ? null : child.id)}
              type="button"
            >
              {t(locale, 'schedule.calendar.childOf').replace('{name}', child.first_name)}
            </button>
          ))}
        </div>
      ) : null}

      <div style={toolbarStyle}>
        <button type="button" data-testid="calendar-previous" onClick={() => step(-1)}>
          {t(locale, 'schedule.calendar.previousMonth')}
        </button>
        <span data-testid="calendar-month">{`${year}-${pad(month)}`}</span>
        <button type="button" data-testid="calendar-next" onClick={() => step(1)}>
          {t(locale, 'schedule.calendar.nextMonth')}
        </button>
        <SegmentedControl
          legend={t(locale, 'schedule.view.month')}
          onValueChange={(next) => setView(next as 'month' | 'week')}
          options={[
            { value: 'month', label: t(locale, 'schedule.view.month') },
            { value: 'week', label: t(locale, 'schedule.view.week') },
          ]}
          value={view}
        />
        {/* `12a`'s second entry (P1): the pre-report lives beside the calendar too. */}
        <a data-testid="calendar-absence" href="#/absence">
          {t(locale, 'attendance.absence.title')}
        </a>
      </div>

      {/* The month summary the audit calls the point of the screen. */}
      <p data-testid="calendar-summary">
        {t(locale, 'schedule.calendar.summary')
          .replace('{had}', String(summary.had))
          .replace('{planned}', String(summary.planned))
          .replace('{pct}', summary.pct === null ? '—' : String(summary.pct))}
      </p>

      {/* `role="table"`, not `role="grid"`.
          
          A grid PROMISES two-dimensional keyboard traversal — arrow keys between cells, a
          roving tabindex, one tab stop for the whole widget. This calendar has none of that
          and should not: it is a read-only month view, nothing in it is operable, and every
          cell is static text. Declaring `grid` told a screen-reader user to press the arrow
          keys and then did nothing when they did.
          
          The `row` layer below is also required and was missing. ARIA does not permit a cell
          as a direct child of a table, so the old markup was invalid as well as
          over-promising. `display: contents` gives the rows no box of their own, so the flat
          CSS grid that lays the month out is completely unaffected. */}
      <div style={gridStyle} role="table" aria-label={t(locale, 'schedule.view.month')}>
        <div role="row" style={weekRowStyle}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <div key={weekday} style={headerCellStyle} role="columnheader">
              {t(locale, `schedule.weekday.${weekday}`)}
            </div>
          ))}
        </div>
        {weeks
          .filter((week) => view === 'month' || week.includes(todayKey))
          .map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} role="row" style={weekRowStyle}>
        {week.map((cell, index) =>
          cell === '' ? (
            <div key={`pad-${index}`} style={dayStyle} aria-hidden="true" />
          ) : (
            <div
              key={cell}
              role="cell"
              // Keyed only; the month's length is `getAllByRole('cell')`. The pads are
              // aria-hidden divs, so the cells ARE the days.
              data-testid={`calendar-day-${cell}`}
              data-has-sessions={trainingDays.has(cell) ? 'true' : 'false'}
              data-state={
                attendanceByDay.has(cell)
                  ? dayState(attendanceByDay.get(cell)!)
                  : trainingDays.has(cell) && cell > todayKey
                    ? 'planned'
                    : undefined
              }
              aria-current={cell === todayKey ? 'date' : undefined}
              style={trainingDays.has(cell) ? trainingDayStyle : dayStyle}
            >
              {Number(cell.slice(8))}
              {attendanceByDay.has(cell) || (trainingDays.has(cell) && cell > todayKey) ? (
                // Never colour alone (SC 1.4.1): the dot carries the state colour, and
                // the legend below names every state in words.
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    inlineSize: '6px',
                    blockSize: '6px',
                    borderRadius: '50%',
                    marginInline: 'auto',
                    background:
                      DAY_TONE[
                        attendanceByDay.has(cell) ? dayState(attendanceByDay.get(cell)!) : 'planned'
                      ],
                  }}
                />
              ) : null}
            </div>
          ),
        )}
          </div>
        ))}
      </div>

      <ul aria-label={t(locale, 'schedule.calendar.legend')} data-testid="calendar-legend" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: 'var(--text-caption)' }}>
        {(['present', 'absent', 'notified', 'planned'] as const).map((state) => (
          <li key={state} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span
              aria-hidden="true"
              style={{ inlineSize: '8px', blockSize: '8px', borderRadius: '50%', background: DAY_TONE[state] }}
            />
            {t(locale, `schedule.calendar.legend.${state}`)}
          </li>
        ))}
      </ul>

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
        </section>
      ) : null}
    </section>
  )
}
