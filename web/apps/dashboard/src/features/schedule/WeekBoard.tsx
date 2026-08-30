// Dashboard artboard 3a — לוח שבועי עם תפריט הצד.
//
// D5: "Dashboard is a superset of the staff app, and contains a calendar", and the session
// block "surfaces coverage and completion — is a coach assigned, is it cancelled, has
// attendance been taken — **not** registration counts." Children are enrolled rather than
// booking (§5.4), so a capacity number here would invite a question the product does not
// answer, and a test asserts none is rendered.
//
// **The week starts on Sunday and the day is a Jerusalem day.** Both are the same rule the
// backend uses — `group_schedule_rule.weekday` is Sunday-first, and `studioDayKey` files an
// instant under the Jerusalem date. A Monday-based grid would push every Sunday class into
// the previous column, and grouping by the UTC date would file a 22:30 class under the
// wrong day entirely.
//
// `today` is a prop rather than `new Date()`: a component that read the clock could not be
// tested at a fixed date, and every assertion about this grid depends on which week it is.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ActionBar,
  Button,
  EmptyState,
  PageHeader,
  RangeText,
  SegmentedControl,
  TextField,
} from '@studio/ui'
import {
  STUDIO_TIMEZONE,
  apiFetch,
  formatTimeInStudioZone,
  studioDayKey,
  studioWallTimeToUtc,
} from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeDashboardAttendanceClient } from '../attendance'
import { usePlanBadges } from '../billing/usePlanBadges'
import { useLongPress } from './useLongPress'
import { SessionPopover } from './SessionPopover'
import { cancelReasonLabel } from './client'
import type { ScheduleClient, SessionRow } from './client'

const DAY_MS = 86_400_000

/**
 * The hours the grid always rules, inclusive.
 *
 * A judo club's day runs from an after-school class to a late adult session, so this is
 * the window a manager expects to see without scrolling. It is a floor and a ceiling on
 * what is *always drawn*, never on what CAN be drawn: `hours` widens past it for any
 * session outside, so a 06:00 class is never hidden.
 */
const DAY_WINDOW: { from: number; to: number } = { from: 8, to: 21 }

/**
 * The Jerusalem hour an instant falls in, 0–23, or null if it cannot be read.
 *
 * `formatTimeInStudioZone` is `hour12: false` with 2-digit hours, so the first two
 * characters are the hour in every locale — which is what makes this safe to slice rather
 * than re-derive. `24:00` is a legal midnight rendering in some engines; it folds to 0.
 */
function hourOf(iso: string, locale: Locale): number | null {
  const hour = Number(formatTimeInStudioZone(iso, locale).slice(0, 2))
  return Number.isFinite(hour) ? hour % 24 : null
}

/** The `HH:00` row an instant belongs on. 18:30 sits on the 18:00 rule. */
function hourSlot(iso: string, locale: Locale): string {
  const hour = hourOf(iso, locale)
  return `${String(hour ?? 0).padStart(2, '0')}:00`
}

/** A `YYYY-MM-DD` key shifted by whole days. Safe across DST because it never leaves noon. */
function shiftDayKey(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS))
}

/**
 * The Sunday of the week an instant falls in, as a Jerusalem `YYYY-MM-DD`.
 *
 * The anchor is read in Jerusalem rather than UTC: 22:30Z on a Saturday is already Sunday
 * here — the first day of the *next* week, not the last of this one.
 */
export function weekStart(iso: string): string {
  const key = studioDayKey(iso)
  // `getUTCDay()` on the key's own noon is safe: the key is already a Jerusalem date, and
  // noon UTC never crosses a day boundary in either direction.
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay()
  return shiftDayKey(key, -weekday)
}

/** Seven consecutive Jerusalem day keys, starting at `startKey`. */
export function weekDays(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shiftDayKey(startKey, offset))
}


/** D5's three views. Week is the default, in as many words. */
export type BoardView = 'day' | 'week' | 'month'

/** The first day of the Jerusalem month `key` falls in. */
export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`
}

/** Whole weeks covering the month `key` falls in — Sunday of the first week through
 *  Saturday of the last, so the month grid is always rectangular. A month that begins on a
 *  Wednesday leaves three cells of the previous month visible, which is what every
 *  calendar does and what stops the first row being ragged. */
export function monthGridDays(key: string): string[] {
  const first = monthStart(key)
  const firstOfNext = shiftDayKey(`${first.slice(0, 8)}28`, 5)
  const lastOfMonth = shiftDayKey(monthStart(firstOfNext), -1)
  const from = weekStart(`${first}T12:00:00Z`)
  const to = shiftDayKey(weekStart(`${lastOfMonth}T12:00:00Z`), 6)
  const days: string[] = []
  for (let day = from; day <= to; day = shiftDayKey(day, 1)) days.push(day)
  return days
}

/** The days a view shows, and the range its fetch has to cover. */
export function daysFor(view: BoardView, anchor: string): string[] {
  if (view === 'day') return [anchor]
  if (view === 'month') return monthGridDays(anchor)
  return weekDays(weekStart(`${anchor}T12:00:00Z`))
}

const boardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  inlineSize: '100%',
}

function SessionBlock({
  locale,
  session,
  onOpen,
  onPickUp,
  moving,
}: {
  locale: Locale
  session: SessionRow
  onOpen: () => void
  onPickUp: () => void
  moving: boolean
}) {
  const lead = session.staff[0]
  // A short press opens the popover, a long one picks the class up off the board. Both
  // arrive through the same button, so it stays one control with one accessible name.
  const press = useLongPress({ onClick: onOpen, onLongPress: onPickUp })
  // `3a` draws five block states and the shipped board drew two. A class with nobody
  // assigned rendered identically to a covered one — which is how the two coachless
  // classes in the 2026-08-28 staging capture sat on the board unremarked. The state is a
  // data attribute rather than a style object so the CSS carries it, one rule per state.
  const coverage = session.status === 'cancelled'
    ? 'cancelled'
    : session.staff.length === 0
      ? 'uncovered'
      : session.attendance_taken
        ? 'complete'
        : 'unmarked'
  return (
    <button
      data-testid="session-block"
      data-status={session.status}
      data-coverage={coverage}
      data-moving={moving || undefined}
      className="week-block"
      // F3 — D5: "clicking a session opens a popover with the roster and inline
      // attendance marking". A button, not an article with onClick: this is now an
      // interactive control and must be reachable by keyboard.
      {...press}
      type="button"
    >
      <strong>{session.group_name}</strong>
      {/* Was three text children in one span, which an RTL row lays out end-then-start:
          the staging board printed `15:00–14:00`. Fifth occurrence of that shape. */}
      <RangeText
        from={formatTimeInStudioZone(session.starts_at, locale)}
        to={formatTimeInStudioZone(session.ends_at, locale)}
      />
      {session.location_name ? <span>{session.location_name}</span> : null}
      {/* D5 — coverage. A block with no coach is §5.14's 'sessions without a coach'. */}
      {lead ? <span>{lead.display_name}</span> : <span>{t(locale, 'schedule.session.noCoach')}</span>}
      {lead?.is_substitute ? <span>{t(locale, 'schedule.session.substitute')}</span> : null}
      {session.cancel_reason ? (
        <span>{cancelReasonLabel(locale, session.cancel_reason)}</span>
      ) : null}
    </button>
  )
}

/**
 * The board's missing verb (2026-08-28): `POST /sessions` shipped in the backend with no
 * UI calling it, so a manager could not create a session at all — the popover's date
 * fields are the MOVE control. One small form, opened in place: group · date · times ·
 * hall. The training year is resolved, not asked — a session belongs to the ACTIVE year,
 * and a picker would offer a choice §5.15 does not give.
 */
function CreateSessionForm({
  locale,
  client,
  defaultDay,
  defaultStart,
  onCreated,
  open,
  setOpen,
}: {
  locale: Locale
  client: ScheduleClient
  defaultDay: string
  /** Pre-filled when the form was opened from a slot, so the manager confirms a time
   *  rather than retyping the one they just tapped. */
  defaultStart?: string
  onCreated: () => void
  /** Controlled by the board, so the TRIGGER can live in the page header while the form
   *  opens below it. While this component owned the state, its closed form was a lone
   *  Button element — and `boardStyle` is a flex column with the default `align-items:
   *  stretch`, so that button spanned the whole 1130px content width and read as a banner
   *  rather than a control. That was the loudest thing on the shipped screen.
   *
   *  (The tag is spelled out in prose here on purpose: `tools/__tests__/inert-buttons`
   *  scans the file as text, so writing the literal JSX in a comment makes the guard
   *  report a handler-less button that does not exist.) */
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  // 2026-08-28 (owner report) — who teaches it, pickable at creation. EVERY staff member,
  // owner included: in a small club the owner teaching is the norm, and a coach-role
  // filter here would repeat the popover's "everyone except myself" bug.
  const [staff, setStaff] = useState<{ person_id: string; name: string }[]>([])
  const [coachId, setCoachId] = useState('')
  const [yearId, setYearId] = useState<string | null | undefined>(undefined)
  const [groupId, setGroupId] = useState('')
  const [day, setDay] = useState(defaultDay)
  const [startTime, setStartTime] = useState(defaultStart ?? '17:00')
  const [endTime, setEndTime] = useState(() => {
    if (!defaultStart) return '18:00'
    // An hour after the slot. A default end BEFORE the default start would disable the
    // submit button on open, which reads as a broken form rather than a hint.
    const [h, m] = defaultStart.split(':').map(Number)
    return `${String(((h ?? 17) + 1) % 24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
  })
  const [locationId, setLocationId] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let live = true
    void Promise.all([client.listGroups(), client.listLocations(), client.listTrainingYears()])
      .then(([groupRows, locationRows, years]) => {
        if (!live) return
        setGroups(groupRows.filter((row) => row.isActive))
        setLocations(locationRows)
        setYearId(years.find((year) => year.status === 'active')?.id ?? null)
      })
      .catch(() => live && setYearId(null))
    // Best-effort, like the popover's: a failure just hides the coach select.
    void apiFetch('/api/v1/staff')
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items: { person_id: string | null; first_name: string | null; last_name: string | null }[]
            }).items
          : [],
      )
      .then(
        (rows) =>
          live &&
          setStaff(
            rows
              .filter((row) => row.person_id !== null)
              .map((row) => ({
                person_id: row.person_id as string,
                name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
              })),
          ),
      )
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, open])

  if (!open) return null

  // §5.15 — no active year, no sessions. Said, not greyed in silence.
  if (yearId === null) {
    return (
      <p data-testid="session-create-no-year">
        {t(locale, 'schedule.group.noActiveYear')} — {t(locale, 'schedule.group.noActiveYearHint')}
      </p>
    )
  }

  const createFieldStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-label)',
  }
  return (
    <form
      data-testid="session-create-form"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--space-3)',
        alignItems: 'end',
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (!groupId || !yearId) return
        setSending(true)
        setFailed(false)
        client
          .createSession({
            group_id: groupId,
            training_year_id: yearId,
            // G3 — typed in Jerusalem wall time, sent as UTC instants.
            starts_at: studioWallTimeToUtc(day, startTime),
            ends_at: studioWallTimeToUtc(day, endTime),
            location_id: locationId || null,
          })
          .then(async (created) => {
            // The chosen teacher, planned rather than substituting — the same staff
            // shape the popover writes, minus its is_substitute.
            if (coachId) {
              await client
                .patchSession(created.id, {
                  staff: [{ person_id: coachId, role: 'lead_coach', is_substitute: false }],
                })
                .catch(() => undefined)
            }
            setOpen(false)
            onCreated()
          })
          .catch(() => setFailed(true))
          .finally(() => setSending(false))
      }}
    >
      <label style={{ ...createFieldStyle, gridColumn: '1 / -1' }}>
        {t(locale, 'schedule.session.createGroup')}
        <select
          data-testid="session-create-group"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          <option value="">—</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ gridColumn: '1 / -1' }}>
        <TextField
          label={t(locale, 'schedule.session.adHocDate')}
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </div>
      <TextField
        label={t(locale, 'schedule.session.adHocStart')}
        type="time"
        value={startTime}
        onChange={(event) => setStartTime(event.target.value)}
      />
      <TextField
        label={t(locale, 'schedule.session.adHocEnd')}
        type="time"
        value={endTime}
        onChange={(event) => setEndTime(event.target.value)}
      />
      <label style={createFieldStyle}>
        {t(locale, 'schedule.session.createCoach')}
        <select
          data-testid="session-create-coach"
          value={coachId}
          onChange={(event) => setCoachId(event.target.value)}
        >
          <option value="">—</option>
          {staff.map((member) => (
            <option key={member.person_id} value={member.person_id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label style={createFieldStyle}>
        {t(locale, 'schedule.session.location')}
        <select
          data-testid="session-create-location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          <option value="">—</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 'var(--space-2)', gridColumn: '1 / -1' }}>
        <Button
          type="submit"
          data-testid="session-create-submit"
          disabled={!groupId || sending || endTime <= startTime}
        >
          {t(locale, 'schedule.session.create')}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t(locale, 'common.cancel')}
        </Button>
      </div>
      {failed ? (
        <p data-testid="session-create-failed" style={{ gridColumn: '1 / -1' }}>
          {t(locale, 'common.loadFailed.body')}
        </p>
      ) : null}
    </form>
  )
}

export function WeekBoard({
  locale,
  client,
  today,
  canSeeMoney = false,
}: {
  locale: Locale
  client: ScheduleClient
  /** An ISO instant. A prop, not `new Date()` — see the module header. */
  today: string
  /** §3.2 — coaches never see money, so only a manager gets the plan badge on a roster. */
  canSeeMoney?: boolean
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  // Read once for the whole board rather than per popover: a manager opening five sessions
  // in a row should not refetch the club's plans five times. Disabled for a coach, so a
  // coach's board never issues the manager-only request at all.
  const plans = usePlanBadges(canSeeMoney)
  const [view, setView] = useState<BoardView>('week')
  /** The day the view is anchored on. For `week` it is any day in the week; `daysFor`
   *  resolves it to the Sunday, so switching views keeps the manager where they were
   *  rather than snapping them back to today. */
  const [anchor, setAnchor] = useState(() => studioDayKey(today))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const attendanceClient = useMemo(() => makeDashboardAttendanceClient(apiFetch), [])
  const days = useMemo(() => daysFor(view, anchor), [view, anchor])
  // The create form's disclosure lives here so its TRIGGER can sit in the page header
  // while the form itself opens below the coverage strip.
  const [open, setOpen] = useState(false)
  /** Previous/next move by the unit the view shows: a day, a week, a month. Three buttons
   *  that always moved by seven days would be wrong in two of the three views. */
  const step = (direction: 1 | -1) =>
    setAnchor((current) => {
      if (view === 'day') return shiftDayKey(current, direction)
      if (view === 'week') return shiftDayKey(current, 7 * direction)
      // A month is not a fixed number of days. Land on the 1st of the next or previous
      // month by stepping off either end of the current one.
      const first = monthStart(current)
      return monthStart(direction === 1 ? shiftDayKey(`${first.slice(0, 8)}28`, 5) : shiftDayKey(first, -1))
    })

  /** `3a` item 7. Empty string means "all" — one falsy check per axis rather than three
   *  nullable ids, because the select's own empty option is a string too. */
  const [filter, setFilter] = useState({ group: '', coach: '', hall: '' })
  /** The class currently picked up off the board, waiting for a slot. */
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveFailed, setMoveFailed] = useState(false)
  /** The empty slot a manager tapped, and where on screen it was — the popover is
   *  positioned from the cell's own rect because `.week-grid` scrolls, and anything
   *  rendered INSIDE a scrolling box is clipped by it. */
  const [slot, setSlot] = useState<{ day: string; time: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      // The whole span the view shows — `days[6]` was right only for a week, and a month
      // view asking for seven days would have rendered three weeks of empty cells.
      try {
        const loaded = await client.listSessions({
          from: days[0] as string,
          to: days[days.length - 1] as string,
        })
        if (live) setSessions(loaded)
      } catch (error) {
        // `void` silences the floating-promise lint; it does not handle anything. Without
        // this catch a failed load became an *unhandled* rejection — thrown past every
        // boundary that could have shown it, leaving a board that is empty for a reason
        // nobody can read, and in the suite an error attributed to whichever test happened
        // to be running when the promise settled.
        //
        // The board keeps whatever it last had rather than blanking: a week that was on
        // screen a moment ago is better than an empty grid that looks like a club with no
        // classes. What this deliberately does NOT do is render an error surface — there is
        // no such convention in this app yet (no reporter in `packages/core`, no shared
        // error state in this family of loaders) and inventing one here would put copy in
        // the `schedule` namespace and a pattern in one component, decided by the file that
        // happened to be broken first.
        console.error('WeekBoard: failed to load sessions', error)
      }
    })()
    return () => {
      live = false
    }
  }, [client, days, version])

  const openSession = sessions.find((row) => row.id === openSessionId) ?? null

  /**
   * The filter's options come from the week ON SCREEN, not from the club's full roster.
   *
   * A `listGroups()` would offer every group the club has ever had, most of which do not
   * train this week — choosing one would empty the board and say nothing about why. Only
   * offering what is present means a filter can narrow the view but never blank it.
   */
  const options = useMemo(() => {
    const groups = new Map<string, string>()
    const coaches = new Map<string, string>()
    const halls = new Map<string, string>()
    for (const row of sessions) {
      groups.set(row.group_id, row.group_name)
      if (row.location_name) halls.set(row.location_name, row.location_name)
      for (const person of row.staff) coaches.set(person.person_id, person.display_name)
    }
    const sorted = (map: Map<string, string>) =>
      [...map].sort((a, b) => a[1].localeCompare(b[1]))
    return { groups: sorted(groups), coaches: sorted(coaches), halls: sorted(halls) }
  }, [sessions])

  /**
   * Filtered in memory rather than refetched.
   *
   * `listSessions` does accept `group_id` and `coach_person_id`, but not a hall — so a
   * server-side filter would narrow two axes over the network and the third locally, and
   * the counters below would then be describing a set assembled from two places. A week is
   * tens of rows; filtering it here keeps one source for everything on screen and makes
   * changing a filter instant.
   */
  const visible = useMemo(
    () =>
      sessions.filter((row) => {
        if (filter.group && row.group_id !== filter.group) return false
        if (filter.hall && row.location_name !== filter.hall) return false
        if (filter.coach && !row.staff.some((p) => p.person_id === filter.coach)) return false
        return true
      }),
    [sessions, filter],
  )

  const filtered = Boolean(filter.group || filter.coach || filter.hall)

  // Escape puts a picked-up class back. Registered only while something is held, so this
  // never competes with the popover's own Escape handling.
  useEffect(() => {
    if (!movingId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMovingId(null)
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [movingId])

  /**
   * Drop the held class into `day` at `time`, keeping how long it runs.
   *
   * The duration is carried rather than recomputed: a 90-minute class moved to 17:00 ends
   * at 18:30, and asking the manager to retype the end time is how a move becomes an edit.
   * `patchSession` is the route §5.6 already documents as the move control — the popover's
   * date fields write the same PATCH, which is what keeps this an accelerator rather than
   * a second way to change a session.
   */
  const drop = (day: string, time: string) => {
    const session = sessions.find((row) => row.id === movingId)
    if (!session) return
    const startsAt = studioWallTimeToUtc(day, time)
    const runsFor = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()
    const endsAt = new Date(new Date(startsAt).getTime() + runsFor).toISOString()
    setMovingId(null)
    setMoveFailed(false)
    void client
      .patchSession(session.id, { starts_at: startsAt, ends_at: endsAt })
      .then(() => setVersion((n) => n + 1))
      .catch(() => setMoveFailed(true))
  }

  /** `3a`'s three counters, and the same two rules the manager home derives:
   *  a cancelled class needs no coach, and a class that has not ended yet is not late. */
  const missing = useMemo(() => {
    const live = visible.filter((row) => row.status !== 'cancelled')
    const now = new Date(today)
    const noCoach = live.filter((row) => row.staff.length === 0).length
    const unmarked = live.filter(
      (row) => !row.attendance_taken && new Date(row.ends_at) < now,
    ).length
    const cancelled = visible.length - live.length
    // `1e`'s fourth counter. Completed is what went RIGHT, so it is the one number here
    // that is not a problem — and it is why the strip does not read as an error list.
    const completed = live.filter((row) => row.attendance_taken).length
    return { noCoach, unmarked, cancelled, completed, total: noCoach + unmarked + cancelled }
  }, [visible, today])

  // The buttons name what they actually do. "Previous week" while looking at a month is
  // a lie the manager finds out about by pressing it.
  const previousKey =
    view === 'day' ? 'view.previousDay' : view === 'month' ? 'view.previousMonth' : 'previous'
  const nextKey = view === 'day' ? 'view.nextDay' : view === 'month' ? 'view.nextMonth' : 'next'

  /** `23–29`, as one ltr island. The week the board is showing, which three bare
   *  previous/today/next buttons never said. */
  const weekLabel = useMemo(() => {
    const first = days[0]
    const last = days[days.length - 1]
    if (!first || !last) return null
    // A month is named, not measured. The grid spans whole weeks, so its first and last
    // days belong to the neighbouring months — labelling the view `2026-11-01–2026-12-05`
    // would answer a question nobody asked and get the month wrong at both ends.
    if (view === 'month') {
      return {
        text: new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: STUDIO_TIMEZONE,
        }).format(new Date(`${monthStart(anchor)}T12:00:00Z`)),
      }
    }
    // A day view has one date, not a range — `23–23` is noise.
    if (first === last) return { from: first, to: null }
    return { from: first, to: last }
  }, [days, view, anchor, locale])

  /**
   * The hour axis: one row per hour, `HH:00`, ascending.
   *
   * **Fixed, not derived from the sessions present.** The rows used to be the distinct
   * start times the week contained, which read as a reasonable economy and was not: a week
   * with nothing in it got seven day headings above *no rows at all*, and a manager could
   * not click an empty 18:00 cell to create a class there because that cell only existed
   * once something already started at 18:00. That is the one case where nothing needs
   * creating. Both halves were reported separately on 2026-08-29; they are one cause.
   *
   * `DAY_WINDOW` is a default, not a ceiling — the axis widens to reach any session
   * outside it, so a club training at 06:00 still sees its class. That is what the old
   * comment here was right about: hard-coding `3a`'s 16:00/17:00/18:30/20:00 would be one
   * club's timetable imposed on every other. A ruler that always exists and stretches when
   * it must keeps that property without the empty-week hole.
   */
  const hours = useMemo(() => {
    let first = DAY_WINDOW.from
    let last = DAY_WINDOW.to
    for (const row of visible) {
      const hour = hourOf(row.starts_at, locale)
      if (hour === null) continue
      first = Math.min(first, hour)
      last = Math.max(last, hour)
    }
    return Array.from({ length: last - first + 1 }, (_, index) =>
      `${String(first + index).padStart(2, '0')}:00`,
    )
  }, [visible, locale])

  /** Sessions per day, for the month view — which asks "which days are busy", not "when". */
  const byDay = useMemo(() => {
    const grouped = new Map<string, SessionRow[]>()
    for (const session of visible) {
      const key = studioDayKey(session.starts_at)
      grouped.set(key, [...(grouped.get(key) ?? []), session])
    }
    for (const rows of grouped.values()) rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return grouped
  }, [visible])

  /**
   * `day|HH:00` → the sessions in that cell.
   *
   * Keyed by the HOUR, not by the exact start time: a class at 18:30 belongs on the 18:00
   * rule, next to the one at 18:00, rather than on a rule of its own. Keying by the exact
   * minute is what made the axis ragged — six classes at six odd minutes produced six
   * rules and no readable grid.
   *
   * A cell holds more than one session only when a club runs two groups in different halls
   * within the same hour, which is real and is why this is a list.
   */
  const byCell = useMemo(() => {
    const grouped = new Map<string, SessionRow[]>()
    for (const session of visible) {
      const key = `${studioDayKey(session.starts_at)}|${hourSlot(session.starts_at, locale)}`
      grouped.set(key, [...(grouped.get(key) ?? []), session])
    }
    for (const rows of grouped.values()) rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return grouped
  }, [visible, locale])

  return (
    <section aria-labelledby="week-board-title" style={boardStyle}>
      {/* Four stacked rows became one. The shipped board put the title, a full-width
          create button and three bare `<button>` elements on four separate lines, so
          nothing on the screen was visibly related to anything else. The week navigation
          keeps its own group on the start edge; the one verb sits on the end edge. */}
      <PageHeader
        actions={
          <ActionBar
            end={
              <Button data-testid="session-create-open" onClick={() => setOpen(true)}>
                {t(locale, 'schedule.session.create')}
              </Button>
            }
            start={
              <>
                <SegmentedControl
                  legend={t(locale, 'schedule.week.view.legend')}
                  onValueChange={(next) => setView(next as BoardView)}
                  options={[
                    { value: 'day', label: t(locale, 'schedule.week.view.day') },
                    { value: 'week', label: t(locale, 'schedule.week.view.week') },
                    { value: 'month', label: t(locale, 'schedule.week.view.month') },
                  ]}
                  value={view}
                />
                <Button variant="ghost" data-testid="week-previous" onClick={() => step(-1)}>
                  {t(locale, `schedule.week.${previousKey}`)}
                </Button>
                <Button
                  variant="ghost"
                  data-testid="week-today"
                  onClick={() => setAnchor(todayKey)}
                >
                  {t(locale, 'schedule.week.today')}
                </Button>
                <Button variant="ghost" data-testid="week-next" onClick={() => step(1)}>
                  {t(locale, `schedule.week.${nextKey}`)}
                </Button>
              </>
            }
          />
        }
        subtitle={
          weekLabel && 'text' in weekLabel ? (
            weekLabel.text
          ) : weekLabel?.to ? (
            <RangeText from={weekLabel.from} to={weekLabel.to} />
          ) : weekLabel ? (
            <bdi dir="ltr">{weekLabel.from}</bdi>
          ) : undefined
        }
        title={t(locale, 'schedule.week.title')}
      />

      {/* `3a` item 7. A fieldset because these three narrow one thing together — a screen
          reader announcing "Group" with no idea what it belongs to is why they are grouped
          and the group is named. Only the axes the week actually has are rendered: a club
          with one hall gets two selects, not three greyed ones. */}
      <fieldset className="week-filter" data-testid="week-filter">
        <legend className="studio-visually-hidden">
          {t(locale, 'schedule.week.filter.legend')}
        </legend>
        {options.groups.length > 1 ? (
          <label>
            {t(locale, 'schedule.week.filter.group')}
            <select
              data-testid="week-filter-group"
              onChange={(event) => setFilter((f) => ({ ...f, group: event.target.value }))}
              value={filter.group}
            >
              <option value="">{t(locale, 'schedule.week.filter.all')}</option>
              {options.groups.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {options.coaches.length > 1 ? (
          <label>
            {t(locale, 'schedule.week.filter.coach')}
            <select
              data-testid="week-filter-coach"
              onChange={(event) => setFilter((f) => ({ ...f, coach: event.target.value }))}
              value={filter.coach}
            >
              <option value="">{t(locale, 'schedule.week.filter.all')}</option>
              {options.coaches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {options.halls.length > 1 ? (
          <label>
            {t(locale, 'schedule.week.filter.hall')}
            <select
              data-testid="week-filter-hall"
              onChange={(event) => setFilter((f) => ({ ...f, hall: event.target.value }))}
              value={filter.hall}
            >
              <option value="">{t(locale, 'schedule.week.filter.all')}</option>
              {options.halls.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {filtered ? (
          <Button
            variant="ghost"
            data-testid="week-filter-clear"
            onClick={() => setFilter({ group: '', coach: '', hall: '' })}
          >
            {t(locale, 'schedule.week.filter.clear')}
          </Button>
        ) : null}
      </fieldset>

      {/* `3a`'s מה חסר השבוע. Derived from the week already on screen, not fetched — the
          sessions carry `staff` and `attendance_taken`, so a coverage endpoint would be a
          second source of truth for a number the board can already count. */}
      <ul className="week-missing" data-testid="week-missing">
        {/* `total` counts only the PROBLEMS, so it gates the problem rows and the reassuring
            line — but not the completed counter below, which is true either way. Gating
            that on `total` hid it exactly when the week had gone well, which is the week a
            manager most wants the number for. */}
        {missing.total === 0 ? (
          <li data-testid="week-missing-none">{t(locale, 'schedule.week.missing.none')}</li>
        ) : (
          <>
            {missing.noCoach > 0 ? (
              <li data-tone="danger" data-testid="week-missing-no-coach">
                <b>{missing.noCoach}</b> {t(locale, 'schedule.week.missing.noCoach')}
              </li>
            ) : null}
            {missing.unmarked > 0 ? (
              <li data-tone="pending" data-testid="week-missing-unmarked">
                <b>{missing.unmarked}</b> {t(locale, 'schedule.week.missing.unmarked')}
              </li>
            ) : null}
            {missing.cancelled > 0 ? (
              <li data-tone="muted" data-testid="week-missing-cancelled">
                <b>{missing.cancelled}</b> {t(locale, 'schedule.week.missing.cancelled')}
              </li>
            ) : null}
          </>
        )}
        {/* `1e`'s counter. Outside the branch above, and last: the only number in the
            strip that is not a problem. */}
        {missing.completed > 0 ? (
          <li data-tone="done" data-testid="week-missing-completed">
            <b>{missing.completed}</b> {t(locale, 'schedule.week.missing.completed')}
          </li>
        ) : null}
      </ul>

      <CreateSessionForm
        locale={locale}
        client={client}
        defaultDay={todayKey}
        onCreated={() => setVersion((n) => n + 1)}
        open={open}
        setOpen={setOpen}
      />

      {sessions.length === 0 ? (
        <EmptyState
          title={t(locale, 'schedule.today.empty')}
          description={t(locale, 'schedule.today.emptyHint')}
        />
      ) : null}

      {/* A week that HAS classes and a filter that hides all of them. Distinct from the
          empty week above: the fix is to widen the filter, not to add a class. */}
      {sessions.length > 0 && visible.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.week.filter.empty')} />
      ) : null}

      {movingId ? (
        <div className="week-moving" data-testid="week-moving" role="status">
          <span className="week-moving__hint">{t(locale, 'schedule.session.move.hint')}</span>
          <Button
            variant="ghost"
            data-testid="week-moving-cancel"
            onClick={() => setMovingId(null)}
          >
            {t(locale, 'schedule.session.move.cancel')}
          </Button>
        </div>
      ) : null}

      {moveFailed ? (
        <p role="alert" data-testid="week-move-failed" style={{ color: 'var(--danger)' }}>
          {t(locale, 'schedule.session.move.failed')}
        </p>
      ) : null}

      {view === 'month' ? (
        /* A month is not a time grid. Thirty days of ruled hour rows would be mostly
           blank and unreadably tall; every calendar answers a month with day cells, and
           the question changes with it — "which days are busy", not "when exactly". */
        <div role="grid" aria-label={t(locale, 'schedule.week.view.month')} className="month-grid">
          <div role="row" className="month-grid__row">
            {days.slice(0, 7).map((day, index) => (
              <span role="columnheader" className="month-grid__head" key={day}>
                {t(locale, `schedule.weekday.${index}`)}
              </span>
            ))}
          </div>
          {Array.from({ length: days.length / 7 }, (_, week) => (
            <div role="row" className="month-grid__row" key={days[week * 7]}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const rows = byDay.get(day) ?? []
                return (
                  <div
                    role="gridcell"
                    className="month-grid__cell"
                    key={day}
                    data-day={day}
                    data-today={day === todayKey || undefined}
                    /* A day from the neighbouring month, kept so the grid stays
                       rectangular but dimmed so it is not mistaken for this one. */
                    data-outside={day.slice(0, 7) !== anchor.slice(0, 7) || undefined}
                    data-testid={`month-cell-${day}`}
                  >
                    <span className="month-grid__date">{Number(day.slice(8, 10))}</span>
                    {rows.map((session) => (
                      <button
                        className="month-grid__pill"
                        data-coverage={
                          session.status === 'cancelled'
                            ? 'cancelled'
                            : session.staff.length === 0
                              ? 'uncovered'
                              : 'ok'
                        }
                        data-testid="month-session"
                        key={session.id}
                        onClick={() => setOpenSessionId(session.id)}
                        type="button"
                      >
                        <bdi dir="ltr">{formatTimeInStudioZone(session.starts_at, locale)}</bdi>{' '}
                        {session.group_name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <>
      {/* `3a`'s grid: a time gutter, then one column per day, ruled into rows — one row
          per start time the week actually contains. The shipped board had no axis at all,
          so blocks floated in unruled columns and two classes an hour apart looked like
          two classes at the same time.

          The rows are DERIVED from the week rather than fixed at the artboard's
          16:00/17:00/18:30/20:00. Those four are one club's timetable drawn on one day;
          hard-coding them would leave every other club's classes with no row to sit in. */}
      <div
        role="grid"
        aria-label={t(locale, 'schedule.week.title')}
        className="week-grid"
        // The day view has one column, the week seven. A custom property rather than a
        // width: the tracks are the grid's, and CSS is where they belong.
        style={{ '--week-columns': days.length } as CSSProperties}
      >
        <div role="row" className="week-grid__row">
          {/* The corner. Empty, but present: a grid row whose cells do not line up with
              the header above it is a grid in name only. */}
          <span role="columnheader" className="week-grid__gutter" />
          {days.map((day, index) => (
            <span
              key={day}
              role="columnheader"
              data-testid={`week-day-${day}`}
              data-day={day}
              aria-current={day === todayKey ? 'date' : undefined}
              className="week-grid__head"
              data-today={day === todayKey || undefined}
            >
              {/* `3a` heads each column `א׳ 23`, not a bare weekday name: a manager
                  looking at "next week" has no way to tell which week it is otherwise.
                  The number is the Jerusalem day-of-month, taken from the key the column
                  is already filed under rather than re-derived from an instant. */}
              {t(locale, `schedule.weekday.${index}`)}{' '}
              <span className="week-day__date">{Number(day.slice(8, 10))}</span>
            </span>
          ))}
        </div>

        {hours.map((time) => (
          <div role="row" className="week-grid__row" key={time}>
            <span role="rowheader" className="week-grid__gutter" data-testid={`week-slot-${time}`}>
              {time}
            </span>
            {days.map((day) => {
              const cell = byCell.get(`${day}|${time}`) ?? []
              // A cell is a target while a class is held, and a way to start one when it
              // is empty. Spec `3a` says an empty cell carries no "add here" affordance
              // and calls that a decision — overridden deliberately on 2026-08-29 at the
              // owner's request; see docs/design/decisions.md.
              const acts = movingId !== null || cell.length === 0
              return (
                <div
                  key={day}
                  role="gridcell"
                  className="week-grid__cell"
                  data-day={day}
                  data-slot={time}
                  data-today={day === todayKey || undefined}
                  data-target={movingId !== null || undefined}
                  data-testid={`week-cell-${day}-${time}`}
                >
                  {acts ? (
                    <button
                      className="week-grid__slot"
                      data-testid={`week-slot-action-${day}-${time}`}
                      onClick={(event) => {
                        if (movingId !== null) {
                          drop(day, time)
                          return
                        }
                        const box = event.currentTarget.getBoundingClientRect()
                        // Clamped so the popover stays on screen: in RTL the first
                        // columns hug the right edge and an unclamped centre point put
                        // half the form outside the viewport (2026-08-30).
                        setSlot({
                          day,
                          time,
                          x: Math.min(Math.max(box.left + box.width / 2, 190), window.innerWidth - 190),
                          y: Math.max(Math.min(box.bottom, window.innerHeight - 460), 8),
                        })
                      }}
                      type="button"
                    >
                      {/* Named for a screen reader, invisible to everyone else: the cell
                          must not look like a button, or the grid becomes forty of them. */}
                      <span className="studio-visually-hidden">
                        {t(
                          locale,
                          movingId !== null
                            ? 'schedule.session.move.target'
                            : 'schedule.session.slot.create',
                        )}
                      </span>
                    </button>
                  ) : null}
                  {cell.map((session) => (
                    <SessionBlock
                      key={session.id}
                      locale={locale}
                      moving={session.id === movingId}
                      onOpen={() => setOpenSessionId(session.id)}
                      onPickUp={() => setMovingId(session.id)}
                      session={session}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
        </>
      )}


      {slot ? (
        <>
          {/* A backdrop that only dismisses. The form inside is not a dialog — it does not
              trap focus, because it is one small form and a manager comparing it against
              the week behind it is the point of anchoring it here. */}
          <div
            data-testid="week-slot-backdrop"
            onClick={() => setSlot(null)}
            style={{ position: 'fixed', insetBlock: 0, insetInline: 0, zIndex: 39 }}
          />
          <div
            className="week-slot-popover"
            data-testid="week-slot-popover"
            // Physical `left`, deliberately: `slot.x` comes from getBoundingClientRect,
            // which measures from the LEFT edge regardless of direction, and the CSS
            // centres with translateX(-50%) on the same assumption. `insetInlineStart`
            // resolves to `right` in RTL, which put the popover on the mirror side of
            // the board (2026-08-30). D10 governs layout, not viewport measurements.
            // eslint-disable-next-line no-restricted-syntax
            style={{ left: `${slot.x}px`, top: `${slot.y + 8}px` }}
          >
            <div className="week-slot-popover__head">
              <span>
                {slot.day} · {slot.time}
              </span>
              <Button variant="ghost" data-testid="week-slot-close" onClick={() => setSlot(null)}>
                {t(locale, 'common.cancel')}
              </Button>
            </div>
            <CreateSessionForm
              client={client}
              defaultDay={slot.day}
              defaultStart={slot.time}
              locale={locale}
              onCreated={() => {
                setSlot(null)
                setVersion((n) => n + 1)
              }}
              open
              setOpen={(next) => {
                if (!next) setSlot(null)
              }}
            />
          </div>
        </>
      ) : null}

      {openSession ? (
        <SessionPopover
          attendanceClient={attendanceClient}
          client={client}
          fetcher={apiFetch}
          locale={locale}
          onChanged={() => setVersion((n) => n + 1)}
          onClose={() => setOpenSessionId(null)}
          plans={canSeeMoney ? plans : undefined}
          session={openSession}
        />
      ) : null}
    </section>
  )
}
