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
import { Button, EmptyState, TextField } from '@studio/ui'
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

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
}

// A CSS grid flips with `dir` on its own, which is exactly why G12 bans the physical
// properties that would not.
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 'var(--space-2)',
  overflowX: 'auto',
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minInlineSize: '8rem',
  paddingBlock: 'var(--space-2)',
  borderBlockStart: 'var(--border-width-strong) solid var(--border)',
}

const todayColumnStyle: CSSProperties = {
  ...columnStyle,
  borderBlockStart: 'var(--border-width-strong) solid var(--fg)',
}

const blockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  fontSize: 'var(--text-caption)',
}

const cancelledBlockStyle: CSSProperties = {
  ...blockStyle,
  background: 'var(--cancelled-tint)',
  color: 'var(--cancelled)',
  textDecoration: 'line-through',
}

const dayHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'],
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
  return (
    <button
      data-testid="session-block"
      data-status={session.status}
      // F3 — D5: "clicking a session opens a popover with the roster and inline
      // attendance marking". A button, not an article with onClick: this is now an
      // interactive control and must be reachable by keyboard.
      onClick={onOpen}
      style={{
        ...(session.status === 'cancelled' ? cancelledBlockStyle : blockStyle),
        textAlign: 'start',
        cursor: 'pointer',
      }}
      type="button"
    >
      <strong>{session.group_name}</strong>
      <span>
        {formatTimeInStudioZone(session.starts_at, locale)}
        {'–'}
        {formatTimeInStudioZone(session.ends_at, locale)}
      </span>
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
}: {
  locale: Locale
  client: ScheduleClient
  defaultDay: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
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
    return () => {
      live = false
    }
  }, [client, open])

  if (!open) {
    return (
      <Button data-testid="session-create-open" onClick={() => setOpen(true)}>
        {t(locale, 'schedule.session.create')}
      </Button>
    )
  }

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
          .then(() => {
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

  const byDay = useMemo(() => {
    const grouped = new Map<string, SessionRow[]>()
    for (const session of sessions) {
      const key = studioDayKey(session.starts_at)
      grouped.set(key, [...(grouped.get(key) ?? []), session])
    }
    return grouped
  }, [sessions])

  return (
    <section aria-labelledby="week-board-title" style={boardStyle}>
      <h2 id="week-board-title">{t(locale, 'schedule.week.title')}</h2>

      <CreateSessionForm
        locale={locale}
        client={client}
        defaultDay={todayKey}
        onCreated={() => setVersion((n) => n + 1)}
      />

      <div style={toolbarStyle}>
        <button
          type="button"
          data-testid="week-previous"
          onClick={() => setStart((current) => shiftDayKey(current, -7))}
        >
          {t(locale, 'schedule.week.previous')}
        </button>
        <button type="button" data-testid="week-today" onClick={() => setStart(weekStart(today))}>
          {t(locale, 'schedule.week.today')}
        </button>
        <button
          type="button"
          data-testid="week-next"
          onClick={() => setStart((current) => shiftDayKey(current, 7))}
        >
          {t(locale, 'schedule.week.next')}
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title={t(locale, 'schedule.today.empty')}
          description={t(locale, 'schedule.today.emptyHint')}
        />
      ) : null}

      <div role="grid" aria-label={t(locale, 'schedule.week.title')} style={gridStyle}>
        {days.map((day, index) => {
          const isToday = day === todayKey
          return (
            <div
              key={day}
              role="gridcell"
              // Keyed rather than generic: the interesting assertion is WHICH day a
              // session was filed under, not how many columns there are. The column count
              // is `getAllByRole('gridcell')`, which asks the accessibility tree the same
              // question instead of asking a test hook.
              data-testid={`week-day-${day}`}
              data-day={day}
              aria-current={isToday ? 'date' : undefined}
              style={isToday ? todayColumnStyle : columnStyle}
            >
              <h3 style={dayHeadingStyle}>{t(locale, `schedule.weekday.${index}`)}</h3>
              {(byDay.get(day) ?? []).map((session) => (
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
