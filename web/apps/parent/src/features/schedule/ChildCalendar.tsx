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
import { AttendanceMark, Card, EmptyState, SegmentedControl, StatusChip } from '@studio/ui'
import type { AttendanceState } from '@studio/ui'
import {
  apiFetch,
  formatDateInStudioZone,
  formatMonthLabel,
  formatTimeInStudioZone,
  studioDayKey,
} from '@studio/core'
import { DIRECTION, t } from '@studio/i18n'
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

/** The stored status, as the shared mark draws it. */
const STATUS_MARK: Record<string, AttendanceState> = {
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
  unmarked: 'unmarked',
}

/** One child's answer for one lesson. A day holds as many of these as it has answers. */
type DayMark = { key: string; state: AttendanceState; label: string }

/** Three 18px marks and their gaps are 62px, which is what a seventh of 390 minus the
 *  card's padding gives. A fourth would push the row past its column. */
const MAX_MARKS = 3

/**
 * **The day's single word, kept only as metadata.**
 *
 * This used to decide what the day LOOKED like, worst-first, which meant an evening where
 * דנה trained and יוסי did not rendered as one red dot — and the fact that one child had
 * turned up was destroyed at render, in the view that is the default. The cell now draws a
 * mark per child; this survives as `data-state` because a single dominant word is still
 * the right thing for a test and for anything scanning the DOM.
 */
const MARK_PRIORITY: AttendanceState[] = ['absent', 'notified', 'unmarked', 'present', 'planned']

/** Every state the grid can draw, so the legend and the grid cannot disagree. */
const LEGEND_STATES: AttendanceState[] = [
  'present',
  'absent',
  'notified',
  'unmarked',
  'planned',
]

function dominantState(marks: DayMark[]): AttendanceState | undefined {
  return MARK_PRIORITY.find((state) => marks.some((mark) => mark.state === state))
}

//: Which i18n suffix the arrows take, per view. `schedule.calendar.previousDay` etc.
const STRIDE: Record<BoardView, 'Day' | 'Week' | 'Month'> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

/**
 * **Four jobs, four bands.**
 *
 * Prev/next, the day-week-month switch, `היום` and the absence link were one flex row, and
 * at 390px it wrapped onto two lines with the only WRITE on the screen pushed to the end
 * of it as a bare caption-sized anchor. Only one of those four is about the month on
 * screen. They are now: the title row (with `היום`), the child chips, the month band (both
 * arrows and the switch), and the absence report down with the other destinations.
 */
const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
}

const chipStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--fg)',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'],
  gap: 'var(--space-1)',
  minBlockSize: '44px',
  paddingInline: 'var(--space-4)',
}

//: Never colour alone, on a control too: the chosen chip carries a check as well as a fill.
const chipSelectedStyle: CSSProperties = {
  ...chipStyle,
  background: 'var(--emphasis)',
  borderColor: 'var(--emphasis)',
  color: 'var(--on-emphasis)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

const bandStyle: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-xl)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-2)',
}

const monthRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'space-between',
}

const arrowStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: 'none',
  blockSize: '44px',
  borderRadius: 'var(--radius-md)',
  color: 'var(--emphasis)',
  cursor: 'pointer',
  display: 'inline-flex',
  inlineSize: '44px',
  justifyContent: 'center',
  padding: 0,
}

const monthLabelStyle: CSSProperties = {
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

/** The month's answer, at reading weight. It was a caption between two crowded bands, and
 *  the audit calls it the point of the screen. */
const summaryStyle: CSSProperties = {
  alignItems: 'baseline',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'var(--text-body)',
  gap: 'var(--space-1)',
  margin: 0,
}

const summaryFigureStyle: CSSProperties = {
  color: 'var(--fg)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

//: A row that opens something else — the folded lists and the absence report all wear it,
//: so the one WRITE on the screen is the same size as everything around it.
const destinationStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-xl)',
  color: 'var(--fg)',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: 'var(--text-body)',
  fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'],
  gap: 'var(--space-2)',
  justifyContent: 'space-between',
  minBlockSize: '46px',
  paddingInline: 'var(--space-4)',
  textDecoration: 'none',
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

// 52, not 40. §6.2's floor is 44 and the cell was under it — on a grid where the cell IS
// the target, which is what "the grid cells are not pressable" meant in practice.
const dayStyle: CSSProperties = {
  minBlockSize: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body)',
  color: 'var(--text-muted)',
}

// Longhand for the same reason DatePickerScreen uses it: `dayStyle` carries no border at
// all, so a shorthand here would be added and removed as days gain and lose lessons, and
// React warns that mixing the two forms leaves stale values behind.
const trainingDayStyle: CSSProperties = {
  ...dayStyle,
  background: 'var(--surface)',
  borderStyle: 'solid',
  borderWidth: 'var(--border-width-hairline)',
  borderColor: 'var(--border)',
  color: 'var(--fg)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

//: Today is the ground showing through, not a third border colour competing with the
//: training-day hairline and the focus ring.
const todayStyle: CSSProperties = {
  ...dayStyle,
  background: 'var(--disabled-surface)',
  color: 'var(--fg)',
  fontWeight: 'var(--weight-bold)' as CSSProperties['fontWeight'],
}

const todayTrainingStyle: CSSProperties = {
  ...trainingDayStyle,
  background: 'var(--disabled-surface)',
  fontWeight: 'var(--weight-bold)' as CSSProperties['fontWeight'],
}

//: The number over its marks. Three marks and their gaps are 62px, which is why the cap
//: below is three — a fourth child's mark would push the row past the column.
const dayInnerStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  justifyContent: 'center',
}

const markRowStyle: CSSProperties = {
  display: 'flex',
  gap: '3px',
}

const overflowStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
}

const legendStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--space-1) var(--space-3)',
  fontSize: 'var(--text-caption)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const legendItemStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--text-secondary)',
  display: 'flex',
  gap: 'var(--space-2)',
  minBlockSize: '24px',
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

/** The chosen chip's second signal. `aria-pressed` carries it to a screen reader and the
 *  fill carries it to everyone else; this is what carries it to a parent who cannot tell
 *  the fill from the ground. */
function Tick() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="13"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 16 16"
      width="13"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

/** `start` and `end` are the READER's, not the screen's: the caller picks by locale, so
 *  the same component points backwards in Hebrew and in English. */
function Chevron({ towards }: { towards: 'start' | 'end' }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="22"
    >
      <path d={towards === 'end' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
    </svg>
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
  const rtl = DIRECTION[locale] === 'rtl'
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
      //
      // **Caught, and `loaded` stays false on a failure.** An uncaught rejection here is a
      // floating promise that outlives the screen — it surfaced as an unhandled error in
      // CI, attributed to whichever unrelated test happened to be running when a teardown
      // pulled `fetch` out from under an in-flight read. It is also the honest shape: this
      // flag is what licenses `אין שיעורים בחודש הזה`, and a read that FAILED has not
      // established that the month is empty. Not knowing renders as not knowing.
      const rows = await client.listSessions({ from: bounds.from, to: bounds.to }).catch(() => null)
      if (!live || rows === null) return
      setSessions(rows)
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

  const childNames = useMemo(
    () => new Map(children.map((child) => [child.id, child.first_name])),
    [children],
  )

  /**
   * **Every answer the day holds, one mark each, in a stable order.**
   *
   * Past days come from the attendance rows, which are per (session, child) — so an
   * evening with two children in two groups draws two marks and says which is which.
   *
   * A FUTURE day cannot: `/me/attendance` only has a row once something has been recorded
   * or pre-reported, and `GET /sessions` returns the family's lessons without naming
   * whose they are (deliberately — see the module header). So a lesson nobody has answered
   * for yet gets ONE `planned` ring per lesson rather than one per child. That is what the
   * screen can honestly say, and it is also what a parent reads it as: two rings on a
   * Wednesday means two lessons that Wednesday.
   */
  const marksByDay = useMemo(() => {
    const byDay = new Map<string, DayMark[]>()
    const stateWord = (state: AttendanceState) =>
      t(locale, `schedule.calendar.legend.${state}`)

    for (const [day, rows] of attendanceByDay) {
      byDay.set(
        day,
        [...rows]
          .sort(
            (left, right) =>
              left.starts_at.localeCompare(right.starts_at) ||
              left.student_id.localeCompare(right.student_id),
          )
          .map((row) => {
            const state = STATUS_MARK[row.status] ?? 'unmarked'
            const name = childNames.get(row.student_id)
            return {
              key: `${row.session_id}:${row.student_id}`,
              state,
              label: name ? `${name} · ${stateWord(state)}` : stateWord(state),
            }
          }),
      )
    }

    // The two reads overlap on the open month, so the union is taken by id first — a
    // lesson counted twice is a day drawn with two rings for one lesson.
    const answered = new Set(filteredAttendance.map((row) => row.session_id))
    const byId = new Map<string, SessionRow>()
    for (const session of [...sessions, ...horizon]) byId.set(session.id, session)
    for (const session of byId.values()) {
      const day = studioDayKey(session.starts_at)
      if (day <= todayKey || answered.has(session.id)) continue
      byDay.set(day, [
        ...(byDay.get(day) ?? []),
        { key: `planned:${session.id}`, state: 'planned', label: stateWord('planned') },
      ])
    }
    return byDay
  }, [attendanceByDay, childNames, filteredAttendance, horizon, locale, sessions, todayKey])

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
      <div style={titleRowStyle}>
        <h1 id="child-calendar-title" style={{ margin: 0 }}>
          {t(locale, 'schedule.calendar.title')}
        </h1>
        {/* Navigating three months out and losing the way back is the complaint every
            calendar with arrows and no home key eventually gets. Out of the month band:
            it is about where you are, not about what you are looking at. */}
        {anchor !== todayKey ? (
          <button
            type="button"
            data-testid="calendar-today"
            onClick={() => setAnchor(todayKey)}
            style={chipStyle}
          >
            {t(locale, 'schedule.calendar.today')}
          </button>
        ) : null}
      </div>

      {/* 12b's per-child header: הלוח של דנה. The chip filters the layer; the grid
          itself is the family's. */}
      {children.length > 1 ? (
        <div role="group" aria-label={t(locale, 'schedule.calendar.childAll')} style={chipRowStyle}>
          <button
            aria-pressed={childFilter === null}
            data-testid="calendar-child-all"
            onClick={() => setChildFilter(null)}
            style={childFilter === null ? chipSelectedStyle : chipStyle}
            type="button"
          >
            {childFilter === null ? <Tick /> : null}
            {t(locale, 'schedule.calendar.childAll')}
          </button>
          {children.map((child) => (
            <button
              aria-pressed={childFilter === child.id}
              data-testid={`calendar-child-${child.id}`}
              key={child.id}
              onClick={() => setChildFilter(childFilter === child.id ? null : child.id)}
              style={childFilter === child.id ? chipSelectedStyle : chipStyle}
              type="button"
            >
              {childFilter === child.id ? <Tick /> : null}
              {child.first_name}
            </button>
          ))}
        </div>
      ) : null}

      {/* What you are looking at: which stretch of time, and how much of it. Nothing else
          shares the band — that crowding is the defect this screen was opened on. */}
      <div style={bandStyle}>
        <div style={monthRowStyle}>
          {/* The arrows name their own stride. "חודש קודם" on a control that moves a
              single day is the label lying about what the button does. The chevron is
              mirrored from the locale rather than from a physical side, so `next` points
              the way the reader is going in both directions. */}
          <button
            aria-label={t(locale, `schedule.calendar.previous${STRIDE[view]}`)}
            data-testid="calendar-previous"
            onClick={() => step(-1)}
            style={arrowStyle}
            type="button"
          >
            <Chevron towards={rtl ? 'end' : 'start'} />
          </button>
          <span data-testid="calendar-month" style={monthLabelStyle}>
            {view === 'month'
              ? formatMonthLabel(year, month, locale)
              : formatDateInStudioZone(`${anchor}T12:00:00Z`, locale)}
          </span>
          <button
            aria-label={t(locale, `schedule.calendar.next${STRIDE[view]}`)}
            data-testid="calendar-next"
            onClick={() => step(1)}
            style={arrowStyle}
            type="button"
          >
            <Chevron towards={rtl ? 'start' : 'end'} />
          </button>
        </div>
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
      </div>

      {/* The month summary the audit calls the point of the screen — so it is read at body
          size with the figures carrying weight, not set as a caption under a control band
          and skipped. */}
      <p data-testid="calendar-summary" style={summaryStyle}>
        <strong style={summaryFigureStyle}>
          {summary.pct === null ? '—' : `${summary.pct}%`}
        </strong>
        <span>{t(locale, 'schedule.calendar.summaryRate')}</span>
        <span aria-hidden="true">·</span>
        <strong style={summaryFigureStyle}>{summary.had}</strong>
        <span>{t(locale, 'schedule.calendar.summaryHeld')}</span>
        <span aria-hidden="true">·</span>
        <strong style={summaryFigureStyle}>{summary.planned}</strong>
        <span>{t(locale, 'schedule.calendar.summaryPlanned')}</span>
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
              const marks = marksByDay.get(cell) ?? []
              const state = dominantState(marks)
              // Three fit the column; a fourth child's mark would push the row past it.
              // `+N` is not a state, so it is not in the legend and carries no colour.
              const shown = marks.slice(0, MAX_MARKS)
              const hidden = marks.length - shown.length
              // Every answer the day holds, spelled out — this is the string that makes
              // the cell readable without seeing any of the marks at all.
              const spoken = marks.map((mark) => mark.label).join(', ')
              const dayName = formatDateInStudioZone(`${cell}T12:00:00Z`, locale)
              const body = (
                <span style={dayInnerStyle}>
                  <span>{Number(cell.slice(8))}</span>
                  {shown.length > 0 ? (
                    <span style={markRowStyle}>
                      {/* Decorative HERE: the cell or its button already speaks every
                          state in `spoken`, and labelling each mark again would read the
                          day out twice. */}
                      {shown.map((mark) => (
                        <AttendanceMark key={mark.key} label="" size="sm" state={mark.state} />
                      ))}
                      {hidden > 0 ? <span style={overflowStyle}>{`+${hidden}`}</span> : null}
                    </span>
                  ) : null}
                </span>
              )
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
                  aria-label={has && absence ? undefined : spoken ? `${dayName} — ${spoken}` : undefined}
                  style={
                    cell === todayKey
                      ? has
                        ? todayTrainingStyle
                        : todayStyle
                      : has
                        ? trainingDayStyle
                        : dayStyle
                  }
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
                      // The day number alone names nothing out loud. The date, what the
                      // day already holds, and the question are what a screen reader needs
                      // to hear — the marks inside are decoration once this exists.
                      aria-label={[
                        dayName,
                        spoken,
                        t(locale, 'schedule.calendar.attend.title'),
                      ]
                        .filter(Boolean)
                        .join(' — ')}
                      data-testid={`calendar-open-${cell}`}
                      onClick={() => setOpenDay(cell)}
                      style={dayButtonStyle}
                      type="button"
                    >
                      {body}
                    </button>
                  ) : (
                    body
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* **Five, not four.** `DayState` was five and `DAY_TONE` coloured five, but this
          list held four — so `לא סומן` shipped as a grey dot with nothing naming it, while
          `schedule.calendar.legend.unmarked` sat unused in all three locales. A state the
          legend does not name is a state told by colour alone, which is the one thing this
          screen is not allowed to do. */}
      <ul
        aria-label={t(locale, 'schedule.calendar.legend')}
        data-testid="calendar-legend"
        style={legendStyle}
      >
        {LEGEND_STATES.map((state) => (
          <li key={state} style={legendItemStyle}>
            {/* Decorative: the words beside it are the name. */}
            <AttendanceMark label="" size="sm" state={state} />
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
        // **Folded, like the past half — and for the same reason, only more so.** The
        // horizon reaches sixty days, so a club training four times a week put thirty-odd
        // flat rows under the grid and the list became the page. Every one of those days
        // is already drawn above as a `מתוכנן` ring on its own square, and pressing the
        // square is the shorter way to the same lesson. The count on the summary keeps
        // "when does my child next train" answerable without opening anything.
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" style={visuallyHidden}>
            {t(locale, 'schedule.calendar.upcoming')}
          </h2>
          <details>
            <summary data-testid="upcoming-toggle" style={pastSummaryStyle}>
              {t(locale, 'schedule.calendar.upcomingCount').replace('{n}', String(upcoming.length))}
            </summary>
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
          </details>
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

      {/* `12a`'s second entry (P1): the pre-report lives beside the calendar too.

          It was a bare `<a>` with no styling at all, wedged into the end of the band that
          also held both month arrows and the day/week/month switch — the only WRITE on the
          screen, dressed as the least important thing on it and under every tap-target
          floor we hold ourselves to. Down here it is a destination the size of a
          destination, next to the two lists. */}
      <a data-testid="calendar-absence" href="#/absence" style={destinationStyle}>
        {t(locale, 'attendance.absence.title')}
        <span aria-hidden="true" style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
          <Chevron towards={rtl ? 'start' : 'end'} />
        </span>
      </a>

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
