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
import { ActionBar, Button, EmptyState, PageHeader, RangeText, TextField } from '@studio/ui'
import { apiFetch, formatTimeInStudioZone, studioDayKey, studioWallTimeToUtc } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeDashboardAttendanceClient } from '../attendance'
import { SessionPopover } from './SessionPopover'
import { cancelReasonLabel } from './client'
import type { ScheduleClient, SessionRow } from './client'

const DAY_MS = 86_400_000

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
}: {
  locale: Locale
  session: SessionRow
  onOpen: () => void
}) {
  const lead = session.staff[0]
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
      className="week-block"
      // F3 — D5: "clicking a session opens a popover with the roster and inline
      // attendance marking". A button, not an article with onClick: this is now an
      // interactive control and must be reachable by keyboard.
      onClick={onOpen}
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
  onCreated,
  open,
  setOpen,
}: {
  locale: Locale
  client: ScheduleClient
  defaultDay: string
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
  const [startTime, setStartTime] = useState('17:00')
  const [endTime, setEndTime] = useState('18:00')
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

  return (
    <form
      data-testid="session-create-form"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'end' }}
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
      <label>
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
      <TextField
        label={t(locale, 'schedule.session.adHocDate')}
        type="date"
        value={day}
        onChange={(event) => setDay(event.target.value)}
      />
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
      <label>
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
      <label>
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
      {failed ? (
        <p data-testid="session-create-failed">{t(locale, 'common.loadFailed.body')}</p>
      ) : null}
    </form>
  )
}

export function WeekBoard({
  locale,
  client,
  today,
}: {
  locale: Locale
  client: ScheduleClient
  /** An ISO instant. A prop, not `new Date()` — see the module header. */
  today: string
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [start, setStart] = useState(() => weekStart(today))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const attendanceClient = useMemo(() => makeDashboardAttendanceClient(apiFetch), [])
  const days = useMemo(() => weekDays(start), [start])
  // The create form's disclosure lives here so its TRIGGER can sit in the page header
  // while the form itself opens below the coverage strip.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await client.listSessions({ from: days[0] as string, to: days[6] as string })
      if (live) setSessions(loaded)
    })()
    return () => {
      live = false
    }
  }, [client, days, version])

  const openSession = sessions.find((row) => row.id === openSessionId) ?? null

  /** `3a`'s three counters, and the same two rules the manager home derives:
   *  a cancelled class needs no coach, and a class that has not ended yet is not late. */
  const missing = useMemo(() => {
    const live = sessions.filter((row) => row.status !== 'cancelled')
    const now = new Date(today)
    const noCoach = live.filter((row) => row.staff.length === 0).length
    const unmarked = live.filter(
      (row) => !row.attendance_taken && new Date(row.ends_at) < now,
    ).length
    const cancelled = sessions.length - live.length
    return { noCoach, unmarked, cancelled, total: noCoach + unmarked + cancelled }
  }, [sessions, today])

  /** `23–29`, as one ltr island. The week the board is showing, which three bare
   *  previous/today/next buttons never said. */
  const weekLabel = useMemo(() => {
    const last = days[days.length - 1]
    return last ? { from: String(Number(start.slice(8, 10))), to: String(Number(last.slice(8, 10))) } : null
  }, [days, start])

  /** Every start time the week actually contains, as Jerusalem `HH:MM`, ascending. One
   *  grid row each. A club training at 17:00 and 18:30 gets two rows; a club training at
   *  six different times gets six. */
  const slots = useMemo(() => {
    const seen = new Set(sessions.map((row) => formatTimeInStudioZone(row.starts_at, locale)))
    return [...seen].sort()
  }, [sessions, locale])

  /** `day|HH:MM` → the sessions in that cell. A cell holds more than one only when a club
   *  runs two groups in different halls at the same hour, which is real. */
  const byCell = useMemo(() => {
    const grouped = new Map<string, SessionRow[]>()
    for (const session of sessions) {
      const key = `${studioDayKey(session.starts_at)}|${formatTimeInStudioZone(session.starts_at, locale)}`
      grouped.set(key, [...(grouped.get(key) ?? []), session])
    }
    return grouped
  }, [sessions, locale])

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
                <Button
                  variant="ghost"
                  data-testid="week-previous"
                  onClick={() => setStart((current) => shiftDayKey(current, -7))}
                >
                  {t(locale, 'schedule.week.previous')}
                </Button>
                <Button
                  variant="ghost"
                  data-testid="week-today"
                  onClick={() => setStart(weekStart(today))}
                >
                  {t(locale, 'schedule.week.today')}
                </Button>
                <Button
                  variant="ghost"
                  data-testid="week-next"
                  onClick={() => setStart((current) => shiftDayKey(current, 7))}
                >
                  {t(locale, 'schedule.week.next')}
                </Button>
              </>
            }
          />
        }
        subtitle={weekLabel ? <RangeText from={weekLabel.from} to={weekLabel.to} /> : undefined}
        title={t(locale, 'schedule.week.title')}
      />

      {/* `3a`'s מה חסר השבוע. Derived from the week already on screen, not fetched — the
          sessions carry `staff` and `attendance_taken`, so a coverage endpoint would be a
          second source of truth for a number the board can already count. */}
      <ul className="week-missing" data-testid="week-missing">
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

        {slots.map((slot) => (
          <div role="row" className="week-grid__row" key={slot}>
            <span role="rowheader" className="week-grid__gutter" data-testid={`week-slot-${slot}`}>
              {slot}
            </span>
            {days.map((day) => {
              const cell = byCell.get(`${day}|${slot}`) ?? []
              return (
                <div
                  key={day}
                  role="gridcell"
                  className="week-grid__cell"
                  data-day={day}
                  data-slot={slot}
                  data-today={day === todayKey || undefined}
                  data-testid={`week-cell-${day}-${slot}`}
                >
                  {cell.map((session) => (
                    <SessionBlock
                      key={session.id}
                      locale={locale}
                      onOpen={() => setOpenSessionId(session.id)}
                      session={session}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {openSession ? (
        <SessionPopover
          attendanceClient={attendanceClient}
          client={client}
          fetcher={apiFetch}
          locale={locale}
          onChanged={() => setVersion((n) => n + 1)}
          onClose={() => setOpenSessionId(null)}
          session={openSession}
        />
      ) : null}
    </section>
  )
}
