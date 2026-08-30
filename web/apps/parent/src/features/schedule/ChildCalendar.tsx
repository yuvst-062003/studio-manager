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
import {
  apiFetch,
  formatDateInStudioZone,
  formatMonthLabel,
  formatTimeInStudioZone,
  studioDayKey,
} from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel } from './client'
import type { ParentScheduleClient, SessionRow } from './client'
import { SessionAttendanceDialog, reportedKey } from './SessionAttendanceDialog'
import type { AttendanceChild } from './SessionAttendanceDialog'

const pad = (value: number): string => String(value).padStart(2, '0')
const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`

/** How far past today שיעורים קרובים looks, in days. Two months, so a family who opens the
 *  app in the last week of the summer still sees the term start. */
const HORIZON_DAYS = 60

/** `2026-08-30` + n days, as another day key. Pure UTC arithmetic on a date-only string —
 *  the studio-zone conversion already happened in `studioDayKey`, and doing it twice is how
 *  a lesson lands on the wrong side of midnight. */
function addDays(key: string, days: number): string {
  const at = new Date(`${key}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** D5's three, now the parent's too (owner request, 2026-08-30): "in the calendar screen
 *  the parent can choose between the month and the week and the day like in the admin". */
type BoardView = 'day' | 'week' | 'month'

/** The Sunday-first week `key` falls in, as seven day keys. */
function weekOf(key: string): string[] {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay()
  const sunday = addDays(key, -weekday)
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index))
}

/** `key` moved by whole months, clamped to the target month's length so 31 January + 1
 *  lands on 28 February rather than rolling into March. */
function addMonths(key: string, delta: number): string {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const day = Number(key.slice(8, 10))
  const target = new Date(Date.UTC(year, month - 1 + delta, 1))
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return dayKey(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, daysInTarget))
}

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

//: The `<summary>` carries the count, so the h2 would repeat it out loud. Kept for the
//: landmark structure, hidden from sight.
const visuallyHidden: CSSProperties = {
  blockSize: '1px',
  clipPath: 'inset(50%)',
  inlineSize: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
}

const pastSummaryStyle: CSSProperties = {
  cursor: 'pointer',
  minBlockSize: '44px',
  paddingBlock: 'var(--space-3)',
}

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

//: Which i18n suffix the arrows take, per view. `schedule.calendar.previousDay` etc.
const STRIDE: Record<BoardView, 'Day' | 'Week' | 'Month'> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
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

//: Day view is one column, not seven with six blanks beside it.
const dayViewGridStyle: CSSProperties = { ...gridStyle, gridTemplateColumns: 'minmax(0, 1fr)' }

//: Fills the cell so the whole square is the target — §6.2's 44px is the cell's own
//: min-block-size, and a smaller button inside it would undo that on a phone.
const dayButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  blockSize: '100%',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  inlineSize: '100%',
  padding: 0,
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

//: The whole row is the target, so the row's own layout moves onto the button.
const sessionButtonStyle: CSSProperties = {
  ...rowStyle,
  background: 'none',
  borderInline: 'none',
  borderBlockStart: 'none',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  inlineSize: '100%',
  textAlign: 'start',
}

function SessionLine({
  locale,
  session,
  testId,
  onPress,
}: {
  locale: Locale
  session: SessionRow
  testId: string
  /** Opens the attendance popup on this lesson's day. Absent on a past lesson, and on any
   *  mount with no absence client — a row that cannot answer must not look like it can. */
  onPress?: () => void
}) {
  const body = (
    <>
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
    </>
  )
  return (
    <li data-testid={testId} style={onPress ? undefined : rowStyle}>
      {onPress ? (
        <button onClick={onPress} style={sessionButtonStyle} type="button">
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  )
}

export function ChildCalendar({
  locale,
  client,
  today,
  absence,
}: {
  locale: Locale
  client: ParentScheduleClient
  /** An ISO instant. A prop, not `new Date()` — upcoming-vs-past is decided against it. */
  today: string
  /**
   * The absence pre-report writes, for the popup a lesson opens (owner request,
   * 2026-08-30). Optional so a mount that predates the popup still renders a calendar —
   * without it a lesson is not pressable and nothing else changes.
   */
  absence?: {
    report(input: { studentId: string; sessionId: string; reason: string | null }): Promise<unknown>
    cancel(sessionId: string, studentId: string): Promise<void>
  }
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  /**
   * **The focused DAY, not a year and a month.**
   *
   * The two-number version could only step by months, so week view filtered the grid to
   * `week.includes(todayKey)` — navigate to any other month and the week view rendered a
   * header row and nothing else, because no week of March contains today. A single day key
   * is what lets one control move by a day, a week or a month and stay correct in all
   * three.
   */
  const [anchor, setAnchor] = useState(todayKey)
  const year = Number(anchor.slice(0, 4))
  const month = Number(anchor.slice(5, 7))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // **The next lessons are not a property of the open month.** See `horizonBounds`.
  const [horizon, setHorizon] = useState<SessionRow[]>([])
  // P3 — the attendance layer and its per-child switcher.
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const [view, setView] = useState<BoardView>('month')
  /** The pressed day. The popup's open state, and the day whose lessons it answers for. */
  const [openDay, setOpenDay] = useState<string | null>(null)
  /** Bumped after a pre-report is filed or withdrawn, so the dots and the popup re-read
   *  rather than showing the family the state from before their own press. */
  const [refresh, setRefresh] = useState(0)

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

  /**
   * **`שיעורים קרובים` is bounded by today, not by the month on screen.**
   *
   * Every list here used to read from the month grid's own fetch, which made "when does my
   * child next train" answerable only if the answer happened to fall before the 31st. A
   * club whose training year starts on 1 September opened the app on 30 August to an empty
   * August, `אין שיעורים בחודש הזה`, and no sign at all that the first lesson was three
   * days away — which is exactly how the first real club read this screen.
   *
   * Keyed on `today` and nothing else, so paging through months never refetches it. That
   * makes this *fewer* requests than the old arrangement, not more: the upcoming list
   * stopped being re-read on every press of חודש הבא.
   */
  const horizonBounds = useMemo(
    () => ({ from: todayKey, to: addDays(todayKey, HORIZON_DAYS) }),
    [todayKey],
  )

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
    void (async () => {
      const rows = await client.listSessions(horizonBounds).catch(() => [])
      if (live) setHorizon(rows)
    })()
    return () => {
      live = false
    }
  }, [horizonBounds, client])

  useEffect(() => {
    let live = true
    const read = (from: string, to: string) =>
      // Well inside the endpoint's 62-day cap: a month is at most 31 and the horizon is 60.
      apiFetch(`/api/v1/me/attendance?from=${from}&to=${to}`)
        .then(async (r) => (r.ok ? ((await r.json()) as { items: AttendanceRow[] }).items : []))
        .catch(() => [] as AttendanceRow[])
    // Both ranges, because an absence the family already pre-reported decides what the
    // popup offers — and the popup opens on upcoming lessons, which now reach past the
    // open month. Merged by (session, student): the ranges overlap on the current month.
    void Promise.all([
      read(bounds.from, bounds.to),
      read(horizonBounds.from, horizonBounds.to),
    ]).then(([monthRows, horizonRows]) => {
      if (!live) return
      const byPair = new Map<string, AttendanceRow>()
      for (const row of [...monthRows, ...horizonRows]) {
        byPair.set(`${row.session_id}:${row.student_id}`, row)
      }
      setAttendance([...byPair.values()])
    })
    void apiFetch('/api/v1/me/students')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: Child[] }).items : []))
      .then((items) => live && setChildren(items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [bounds.from, bounds.to, horizonBounds.from, horizonBounds.to, refresh])

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

  // Both reads: a week view sitting across a month boundary draws days the month fetch
  // never covered, and an undotted lesson day is a lesson the family cannot press.
  const trainingDays = useMemo(
    () => new Set([...sessions, ...horizon].map((session) => studioDayKey(session.starts_at))),
    [sessions, horizon],
  )

  const { upcoming, past } = useMemo(() => {
    // The two reads overlap whenever the open month is the current one, so the union is
    // taken by id. A lesson listed twice is a lesson a parent counts twice.
    const byId = new Map<string, SessionRow>()
    for (const session of [...sessions, ...horizon]) byId.set(session.id, session)
    const sorted = [...byId.values()].sort((left, right) =>
      left.starts_at.localeCompare(right.starts_at),
    )
    return {
      upcoming: sorted.filter((session) => session.starts_at > today),
      // שיעורים שהיו stays a property of the OPEN month — it sits under a month grid and
      // is how a parent reads back a month they navigated to on purpose.
      past: [...sessions]
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
        .filter((session) => session.starts_at <= today)
        .reverse(),
    }
  }, [sessions, horizon, today])

  /** One control, three strides. The arrows move by whatever is on screen — a day in day
   *  view, a week in week view, a month in month view — which is what "like in the admin"
   *  means and what the dashboard's board already does. */
  const step = useCallback(
    (delta: number) => {
      setAnchor((current) =>
        view === 'day'
          ? addDays(current, delta)
          : view === 'week'
            ? addDays(current, delta * 7)
            : addMonths(current, delta),
      )
    },
    [view],
  )

  /** The cells the open view actually draws. `weeks` stays the month's — week view picks
   *  the one containing the anchor, and day view draws a single cell. */
  const visibleWeeks = useMemo(() => {
    if (view === 'month') return weeks
    if (view === 'week') return [weekOf(anchor)]
    return [[anchor]]
  }, [view, weeks, anchor])

  /** Every lesson on the pressed day, from both reads. */
  const sessionsOn = useCallback(
    (key: string) => {
      const byId = new Map<string, SessionRow>()
      for (const session of [...sessions, ...horizon]) {
        if (studioDayKey(session.starts_at) === key) byId.set(session.id, session)
      }
      return [...byId.values()].sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    },
    [sessions, horizon],
  )

  /** The (session, student) pairs already pre-reported absent. §5.7 lands a pre-report as
   *  an `absent_excused` attendance row, so this read is the same one the dots use — there
   *  is no second source to disagree with. */
  const reportedAbsences = useMemo(
    () =>
      new Set(
        attendance
          .filter((row) => row.status === 'absent_excused')
          .map((row) => reportedKey(row.session_id, row.student_id)),
      ),
    [attendance],
  )

  const attendanceChildren = useMemo<AttendanceChild[]>(
    () => children.map(({ id, first_name, last_name }) => ({ id, first_name, last_name })),
    [children],
  )

  const openSessions = openDay ? sessionsOn(openDay) : []

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
        {/* The arrows name their own stride. "חודש קודם" on a control that moves a single
            day is the label lying about what the button does. */}
        <button type="button" data-testid="calendar-previous" onClick={() => step(-1)}>
          {t(locale, `schedule.calendar.previous${STRIDE[view]}`)}
        </button>
        <span data-testid="calendar-month">
          {view === 'month'
            ? formatMonthLabel(year, month, locale)
            : formatDateInStudioZone(`${anchor}T12:00:00Z`, locale)}
        </span>
        <button type="button" data-testid="calendar-next" onClick={() => step(1)}>
          {t(locale, `schedule.calendar.next${STRIDE[view]}`)}
        </button>
        {/* Navigating three months out and losing the way back is the complaint every
            calendar with arrows and no home key eventually gets. */}
        {anchor !== todayKey ? (
          <button type="button" data-testid="calendar-today" onClick={() => setAnchor(todayKey)}>
            {t(locale, 'schedule.calendar.today')}
          </button>
        ) : null}
        <SegmentedControl
          legend={t(locale, 'schedule.week.view.legend')}
          onValueChange={(next) => setView(next as BoardView)}
          options={[
            { value: 'day', label: t(locale, 'schedule.view.day') },
            { value: 'week', label: t(locale, 'schedule.view.week') },
            { value: 'month', label: t(locale, 'schedule.view.month') },
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
      <div
        style={view === 'day' ? dayViewGridStyle : gridStyle}
        role="table"
        aria-label={t(locale, `schedule.view.${view}`)}
      >
        {/* A single day is a single column, so seven weekday headers over it would label
            six columns that are not there. */}
        {view === 'day' ? null : (
          <div role="row" style={weekRowStyle}>
            {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
              <div key={weekday} style={headerCellStyle} role="columnheader">
                {t(locale, `schedule.weekday.${weekday}`)}
              </div>
            ))}
          </div>
        )}
        {visibleWeeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} role="row" style={weekRowStyle}>
            {week.map((cell, index) => {
              if (cell === '') return <div key={`pad-${index}`} style={dayStyle} aria-hidden="true" />
              const has = trainingDays.has(cell)
              const state = attendanceByDay.has(cell)
                ? dayState(attendanceByDay.get(cell)!)
                : has && cell > todayKey
                  ? 'planned'
                  : undefined
              const dot =
                attendanceByDay.has(cell) || (has && cell > todayKey) ? (
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
                      background: DAY_TONE[state ?? 'planned'],
                    }}
                  />
                ) : null
              return (
                <div
                  key={cell}
                  role="cell"
                  // Keyed only; the month's length is `getAllByRole('cell')`. The pads are
                  // aria-hidden divs, so the cells ARE the days.
                  data-testid={`calendar-day-${cell}`}
                  data-has-sessions={has ? 'true' : 'false'}
                  data-state={state}
                  aria-current={cell === todayKey ? 'date' : undefined}
                  style={has ? trainingDayStyle : dayStyle}
                >
                  {/* **A day with a lesson is pressable; a day without one is not.**
                      (Owner request, 2026-08-30: "when a user presses the session on the
                      calendar a popup should open and ask for attendance".) A button
                      inside the cell rather than an operable cell: `role="table"` promises
                      no arrow-key traversal and must not start claiming one, and a real
                      <button> is what puts the day in the tab order with a name and a
                      focus ring for free. */}
                  {has && absence ? (
                    <button
                      // The day number alone names nothing out loud. The date and the
                      // question together are what a screen reader needs to hear.
                      aria-label={`${formatDateInStudioZone(`${cell}T12:00:00Z`, locale)} — ${t(
                        locale,
                        'schedule.calendar.attend.title',
                      )}`}
                      data-testid={`calendar-open-${cell}`}
                      onClick={() => setOpenDay(cell)}
                      style={dayButtonStyle}
                      type="button"
                    >
                      {Number(cell.slice(8))}
                      {dot}
                    </button>
                  ) : (
                    <>
                      {Number(cell.slice(8))}
                      {dot}
                    </>
                  )}
                </div>
              )
            })}
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

      {/* An empty month with lessons coming is not an empty screen — the upcoming list
          below is carrying it, and repeating `אין שיעורים בחודש הזה` above real lessons
          reads as a contradiction. The state survives for the club that genuinely has
          nothing scheduled. */}
      {loaded && sessions.length === 0 && upcoming.length === 0 ? (
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
                  onPress={
                    absence ? () => setOpenDay(studioDayKey(session.starts_at)) : undefined
                  }
                  session={session}
                  testId="upcoming-session"
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {past.length > 0 ? (
        // **Folded away, with the count on the summary.** A busy month is thirty-odd rows,
        // and they were all rendered open, below the two sections a parent came for — the
        // longest thing on the screen was the part nobody navigated here for. The month
        // grid above already carries every one of these days as a coloured dot, so this
        // list is the detail you go looking for rather than the page itself.
        //
        // `<details>`, not a `useState` toggle: it is disclosure, the element exists for it,
        // and it is keyboard-operable and announced correctly with no code of ours.
        <section aria-labelledby="past-title">
          <h2 id="past-title" style={visuallyHidden}>
            {t(locale, 'schedule.calendar.past')}
          </h2>
          <details>
            <summary data-testid="past-toggle" style={pastSummaryStyle}>
              {t(locale, 'schedule.calendar.pastCount').replace('{n}', String(past.length))}
            </summary>
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
          </details>
        </section>
      ) : null}

      {openDay && absence ? (
        <SessionAttendanceDialog
          children={attendanceChildren}
          locale={locale}
          now={today}
          onCancelReport={async (sessionId, studentId) => {
            await absence.cancel(sessionId, studentId)
            setRefresh((n) => n + 1)
          }}
          onClose={() => setOpenDay(null)}
          onReport={async (sessionId, studentId, reason) => {
            await absence.report({ sessionId, studentId, reason })
            setRefresh((n) => n + 1)
          }}
          reported={reportedAbsences}
          sessions={openSessions}
        />
      ) : null}
    </section>
  )
}
