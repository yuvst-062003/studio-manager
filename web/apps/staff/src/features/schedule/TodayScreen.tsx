// Staff artboards 9a (היום) and 1d — **one screen, two artboards.**
//
// 1d is 9a at a lower fidelity, the way 1a and 2a are the same parent home. Building two
// components would give one screen two owners and guarantee they drift; a test asserts they
// stay one.
//
// 9a's headline is `מסנן מאמן במקום פיצול מסכים` — a coach filter rather than a separate
// coach app. A coach opening this wants their own day and gets it by default; a manager
// gets the whole club, on the same screen. That default is the entire feature.
//
// **Attendance is not here.** §5.7's roster is M5's and artboard 9f is its screen. A tap
// target here that looked like a mark would be a coach marking into a table that does not
// exist yet, and the last test in the file keeps it out.
//
// **C2 (2026-09-06) restyled this screen onto the redesign's prototype and merged events
// into the same list — read `timeline.ts`'s own header before touching the dot logic.**
// The prototype's `ScheduleView` does not read the schedule it is passed: its four cards
// are hardcoded Hebrew and its day strip changes nothing when tapped. It is the visual
// reference here, never the behavioural one — everything above this comment already
// existed and keeps working exactly as it did.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, LoadFailed, StatusChip } from '@studio/ui'
import {
  formatDateInStudioZone,
  formatTimeInStudioZone,
  offlineStore,
  readRoster,
  studioDayKey,
  useNetworkMode,
} from '@studio/core'
import type { RosterRow } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel, yearCovers } from './client'
import type { SessionRow, StaffScheduleClient } from './client'
import { confirmationCounts, mergeTimeline, timelineStates } from './timeline'
import type { DotState, TimelineItem } from './timeline'
import type { EventOut, StaffEventsClient } from '../events/client'
import type { StaffPeopleClient } from '../people'
import { ContactFamiliesButton } from '../contact'
import type { ContactFamily } from '../contact'
import './schedule.css'

const DAY_MS = 86_400_000

/** A `YYYY-MM-DD` key shifted by whole days, via noon so it never crosses a DST edge. */
function shiftDayKey(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS))
}

/** §6.2's strip reads forward and back: three days either side of the chosen one. */
function stripAround(key: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shiftDayKey(key, offset - 3))
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const stripStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBlockEnd: 'var(--space-2)',
}

const chipStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  // §6.2 — a thumb, one-handed, on a moving bus.
  minInlineSize: '44px',
  minBlockSize: '44px',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  border: 'var(--border-width-hairline) solid var(--border)',
  background: 'var(--surface)',
  fontSize: 'var(--text-caption)',
}

const selectedChipStyle: CSSProperties = {
  ...chipStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  border: 'var(--border-width-hairline) solid var(--fg)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minBlockSize: '44px',
}

const filterStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-label)',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }

// -- the timeline: a grey line, a dot per item, that item's own start time beneath it -----
//
// §4.1's rule the prototype does not have: the dot does not track the clock. Each dot is
// coloured by its OWN item's state, computed once in `timeline.ts` and never re-derived
// here. Tokens only, never a hex (`schedule.css`'s own header says why `--paid`'s green is
// not one of the four): `--danger` for a session still owed its register, `--pending` for
// the one happening right now, `--emphasis` for the very next thing on the day, and a
// muted structural tone for everything after it.
const DOT_COLOR: Record<DotState, string> = {
  pendingClose: 'var(--danger)',
  activeNow: 'var(--pending)',
  nextUp: 'var(--emphasis)',
  later: 'var(--border-strong)',
}

const timelineRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-3)',
}

const dotColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  paddingBlockStart: 'var(--space-2)',
  // The grey line the prototype draws down the day — a border on this column, which reads
  // as one continuous rail down the list without any absolutely-positioned pseudo-element.
  borderInlineEnd: 'var(--border-width-hairline) solid var(--border)',
  paddingInlineEnd: 'var(--space-3)',
  minInlineSize: '3rem',
}

const dotRingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  inlineSize: '1.25rem',
  blockSize: '1.25rem',
  borderRadius: '50%',
  border: '2px solid',
  background: 'var(--surface)',
  flexShrink: 0,
}

const dotCoreStyle: CSSProperties = {
  inlineSize: '0.5rem',
  blockSize: '0.5rem',
  borderRadius: '50%',
}

const dotTimeStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 'var(--text-micro)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
}

const cardColumnStyle: CSSProperties = { flex: 1, minInlineSize: 0 }

/**
 * The dot itself. Decorative (`aria-hidden`) whenever the state carries no meaning of its
 * own — `later` is the default "nothing needs you here" state and the whole point of the
 * rule is that only three of the four colours DO carry one. Where a colour does mean
 * something, that meaning is also written out as text (SC 1.4.1 — never colour alone),
 * either on this label or on the badge the card itself renders beside it.
 */
function TimelineDot({ state, time, locale }: { state: DotState; time: string; locale: Locale }) {
  const labelKey =
    state === 'pendingClose'
      ? 'schedule.session.state.pendingClose'
      : state === 'activeNow'
        ? 'schedule.session.state.activeNow'
        : state === 'nextUp'
          ? 'schedule.session.state.nextUp'
          : null
  return (
    <div style={dotColumnStyle} data-testid="timeline-dot" data-state={state}>
      <span
        role={labelKey ? 'img' : undefined}
        aria-label={labelKey ? t(locale, labelKey) : undefined}
        aria-hidden={labelKey ? undefined : true}
        className={state === 'activeNow' ? 'schedule-dot--active' : undefined}
        style={{ ...dotRingStyle, borderColor: DOT_COLOR[state] }}
      >
        <span
          className="schedule-dot__core"
          style={{ ...dotCoreStyle, background: DOT_COLOR[state] }}
        />
      </span>
      <span style={dotTimeStyle}>{time}</span>
    </div>
  )
}

const stateBadgeStyle = (color: string): CSSProperties => ({
  color,
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
})

export interface CoachOption {
  person_id: string
  display_name: string
}

/** One roster row's guardian, resolved lazily — see `TodayScreen`'s `chaseFamilies`.
 *  `guardians` mirrors `StudentDetailOut`, where it is optional rather than a possibly-
 *  empty array — a student record from before a guardian was linked at all. */
function primaryContact(student: {
  guardians?: { person_id: string; display_name: string; phone?: string | null; is_primary: boolean }[]
}): ContactFamily | null {
  const guardians = student.guardians ?? []
  const guardian = guardians.find((g) => g.is_primary) ?? guardians[0]
  if (!guardian) return null
  return { person_id: guardian.person_id, name: guardian.display_name, phone: guardian.phone ?? null }
}

export function TodayScreen({
  locale,
  client,
  eventsClient,
  peopleClient,
  today,
  initialDay = null,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
}: {
  locale: Locale
  client: StaffScheduleClient
  /** §4.1's merge — `GET /api/v1/events` alongside sessions, client-side, no new endpoint.
   *  Optional so a caller that has not wired an events client yet keeps working exactly as
   *  before: no events client, no events in the list. */
  eventsClient?: StaffEventsClient
  /** §4.9's chase action needs a phone number per unanswered student, and the roster
   *  deliberately carries none (SPEC §13 invariant 3 — no money, and no contact details
   *  either). `peopleClient.student(id)` is the same call the students tab already makes;
   *  optional for the same reason `eventsClient` is. */
  peopleClient?: StaffPeopleClient
  /** An ISO instant. A prop, not `new Date()` — every assertion here fixes the day. */
  today: string
  /** A day picked in 9b. The strip anchors here and the screen opens on it; `חזרה להיום`
   *  is what walks back. */
  initialDay?: string | null
  coaches?: CoachOption[]
  viewerPersonId?: string
  /**
   * Whether the signed-in person coaches. **This is what 9a's filter defaults from**: a
   * coach opening the app wants their own day, a manager wants the club's. The same screen
   * serves both, which is what "מסנן מאמן במקום פיצול מסכים" means.
   */
  viewerIsCoach?: boolean
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [day, setDay] = useState(initialDay ?? todayKey)
  const [coachFilter, setCoachFilter] = useState<string>(
    viewerIsCoach && viewerPersonId ? viewerPersonId : '',
  )
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [events, setEvents] = useState<EventOut[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Register §4.2 — defaults to false (an ordinary empty day) until the check below
  // (fired only when the day's own fetch comes back empty) proves otherwise.
  const [noTrainingYear, setNoTrainingYear] = useState(false)
  // §4.1 — every roster row already carries `has_confirmation`/`has_absence_report`, and
  // both are already in the offline cache primed at §6.1's launch. Read here, never
  // fetched again: keyed by session id so each card's counts travel from THIS session's
  // own cached roster, not a shared one.
  const [rosters, setRosters] = useState<Record<string, RosterRow[] | undefined>>({})
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const strip = useMemo(() => stripAround(initialDay ?? todayKey), [initialDay, todayKey])

  useEffect(() => {
    let live = true
    client
      .listSessions({
        from: day,
        to: day,
        coachPersonId: coachFilter || undefined,
      })
      .then((loaded) => live && setSessions(loaded))
      // S11 — the day's list used to reject unhandled and render as an empty day, which
      // is the one lie this screen must never tell: "no sessions" reads as a day off.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, coachFilter, day, attempt])

  // §4.1 — events are not scoped by the coach filter (an event has no single instructing
  // coach the way a session does), so they are fetched once and merged by day alone. A
  // failure here is not the screen's own failure: sessions are the load-bearing fetch and
  // already have their own failure path, so an events outage just means no events merge in.
  useEffect(() => {
    if (!eventsClient) return
    let live = true
    eventsClient
      .list()
      .then((page) => live && setEvents(page.items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [eventsClient])

  // The server already scoped the query to one day, but it answers in instants and the
  // screen groups by Jerusalem days. Re-filtering here is what keeps a 00:30 class off
  // yesterday's screen.
  const onThisDay = useMemo(
    () => sessions.filter((session) => studioDayKey(session.starts_at) === day),
    [day, sessions],
  )

  const timelineItems = useMemo(
    () => mergeTimeline(sessions, events, day),
    [sessions, events, day],
  )
  const dotStates = useMemo(() => timelineStates(timelineItems, today), [timelineItems, today])

  // Register §4.2 — `_year_covering` (app/services/schedule/service.py) silently skips any
  // occurrence outside every declared training year, so a year-less date and an ordinary
  // day off both arrive here as "zero sessions" with nothing to tell them apart. Checked
  // only when the day is empty: `GET /training-years` is `AnyStaff`, so a coach's own
  // client can already ask, and asking on every non-empty day would be a query nobody needs
  // the answer to.
  useEffect(() => {
    // `noTrainingYear` is read only inside the `onThisDay.length === 0` branch below, so
    // a non-empty day has nothing to reset -- the effect re-runs on every transition of
    // `onThisDay.length`, including back to 0, and the fetch below sets the current
    // answer fresh each time that happens.
    if (onThisDay.length > 0) return
    let live = true
    client
      .listTrainingYears()
      .then((years) => live && setNoTrainingYear(!yearCovers(years, day)))
      // A failed check must not invent a claim the day cannot back up — the ordinary
      // "no classes" empty state is the honest fallback, not a second failure mode.
      .catch(() => live && setNoTrainingYear(false))
    return () => {
      live = false
    }
  }, [client, day, onThisDay.length])

  // §4.1 — the cache this reads is primed at launch for today and tomorrow (§6.1); this
  // does not widen that window or touch the queue, it only reads what is already there.
  useEffect(() => {
    let live = true
    const store = offlineStore()
    Promise.all(onThisDay.map((session) => readRoster(store, session.id))).then((loaded) => {
      if (!live) return
      setRosters((current) => {
        const next = { ...current }
        onThisDay.forEach((session, index) => {
          next[session.id] = loaded[index]
        })
        return next
      })
    })
    return () => {
      live = false
    }
  }, [onThisDay])

  const chooseDay = useCallback((key: string) => setDay(key), [])

  const coachName = useMemo(
    () => coaches.find((coach) => coach.person_id === coachFilter)?.display_name ?? null,
    [coachFilter, coaches],
  )

  /** §4.9's lazy resolve — a phone number per unanswered student, fetched only once the
   *  coach actually opens the chase panel. One guardian per student (their primary, or the
   *  first on file), de-duplicated by person id so a parent with two children in the group
   *  is chased once, not twice. A student whose lookup fails is dropped rather than
   *  blocking everyone else's — the same resilience `phoneList` already applies to a
   *  missing number. */
  const chaseFamilies = useCallback(
    (studentIds: string[]) => async (): Promise<ContactFamily[]> => {
      if (!peopleClient) return []
      const settled = await Promise.allSettled(studentIds.map((id) => peopleClient.student(id)))
      const byPerson = new Map<string, ContactFamily>()
      for (const outcome of settled) {
        if (outcome.status !== 'fulfilled') continue
        const contact = primaryContact(outcome.value)
        if (contact) byPerson.set(contact.person_id, contact)
      }
      return [...byPerson.values()]
    },
    [peopleClient],
  )

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        offline={networkMode !== 'online'}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <section aria-labelledby="today-title" data-testid="staff-today" style={pageStyle}>
      <h1 id="today-title">
        {/* S7 — `היום`, or the day being looked at: `יום שלישי · 3 בנובמבר`. */}
        {day === todayKey
          ? t(locale, 'schedule.today.title')
          : `${t(locale, 'attendance.roster.dayLabel').replace(
              '{{weekday}}',
              t(locale, `schedule.weekday.${new Date(`${day}T12:00:00Z`).getUTCDay()}`),
            )} · ${formatDateInStudioZone(`${day}T12:00:00Z`, locale)}`}
      </h1>

      {/* S7 — `5 שיעורים · אלון מזרחי`. The coach half renders only when the filter has
          chosen one, which for a coach opening their own day is the default. Sessions
          only — an event is a different kind of thing to count in the same breath. */}
      <p data-testid="today-summary" style={noteStyle}>
        {plural(locale, 'schedule.today.sessionCount', onThisDay.length)}
        {coachName ? <> · <bdi>{coachName}</bdi></> : null}
      </p>

      {day !== todayKey ? (
        <Button variant="secondary" data-testid="back-to-today" onClick={() => setDay(todayKey)}>
          {t(locale, 'schedule.today.backToToday')}
        </Button>
      ) : null}

      <div style={stripStyle} role="group" aria-label={t(locale, 'schedule.datePicker.title')}>
        {strip.map((key) => {
          const selected = key === day
          return (
            <button
              key={key}
              type="button"
              // Keyed, not generic: the interesting assertion is WHICH day is selected.
              // The strip's length is `within(strip).getAllByRole('button')`, which asks
              // the accessibility tree instead of a test hook.
              data-testid={`day-chip-${key}`}
              aria-current={selected ? 'date' : undefined}
              style={selected ? selectedChipStyle : chipStyle}
              onClick={() => chooseDay(key)}
            >
              <span>{t(locale, `schedule.weekday.${new Date(`${key}T12:00:00Z`).getUTCDay()}`)}</span>
              <span>{key.slice(8)}</span>
            </button>
          )
        })}
      </div>

      <label style={filterStyle}>
        {t(locale, 'schedule.today.filterByCoach')}
        <select
          data-testid="coach-filter"
          value={coachFilter}
          onChange={(event) => setCoachFilter(event.target.value)}
        >
          <option value="">{t(locale, 'schedule.today.allCoaches')}</option>
          {coaches.map((coach) => (
            <option key={coach.person_id} value={coach.person_id}>
              {coach.display_name}
            </option>
          ))}
        </select>
      </label>

      {/* Sessions decide the empty state — an event with no session on a day-off still
          means "nothing routine today", and `noTrainingYear` is a training-year concept
          events are not governed by. `timelineItems` decides whether the LIST renders,
          because an event on an otherwise-empty day is still something to show. */}
      {timelineItems.length === 0 ? (
        <EmptyState
          title={t(locale, noTrainingYear ? 'schedule.today.noTrainingYear' : 'schedule.today.empty')}
          description={t(
            locale,
            noTrainingYear ? 'schedule.today.noTrainingYearHint' : 'schedule.today.emptyHint',
          )}
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {timelineItems.map((item, index) => (
            <TimelineRow
              key={item.id}
              item={item}
              state={dotStates[index]!}
              locale={locale}
              roster={item.kind === 'session' ? rosters[item.id] : undefined}
              chaseFamilies={chaseFamilies}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function TimelineRow({
  item,
  state,
  locale,
  roster,
  chaseFamilies,
}: {
  item: TimelineItem
  state: DotState
  locale: Locale
  roster: RosterRow[] | undefined
  chaseFamilies: (studentIds: string[]) => () => Promise<ContactFamily[]>
}) {
  return (
    <li
      data-testid={item.kind === 'session' ? 'session-row' : 'event-row'}
      style={{ minBlockSize: '44px' }}
    >
      <div style={timelineRowStyle}>
        <TimelineDot state={state} time={formatTimeInStudioZone(item.startsAt, locale)} locale={locale} />
        <div style={cardColumnStyle}>
          {item.kind === 'session' ? (
            <SessionCard
              session={item.session}
              state={state}
              locale={locale}
              roster={roster}
              chaseFamilies={chaseFamilies}
            />
          ) : (
            <EventCard event={item.event} locale={locale} />
          )}
        </div>
      </div>
    </li>
  )
}

function SessionCard({
  session,
  state,
  locale,
  roster,
  chaseFamilies,
}: {
  session: SessionRow
  state: DotState
  locale: Locale
  roster: RosterRow[] | undefined
  chaseFamilies: (studentIds: string[]) => () => Promise<ContactFamily[]>
}) {
  const counts = confirmationCounts(roster)
  const notAnsweredIds = (roster ?? [])
    .filter((row) => row.has_confirmation !== true && !row.has_absence_report)
    .map((row) => row.student_id)

  return (
    <Card>
      <div style={rowStyle}>
        {/* The state badge — text, not colour alone, for exactly the two states that mean
            "look at this": a register still owed, or a class in progress right now. A
            plain upcoming session gets no badge here; its dot and position on the list
            already say everything there is to say. */}
        {session.status !== 'cancelled' && state === 'pendingClose' ? (
          <span style={stateBadgeStyle('var(--danger)')} data-testid="session-state">
            {t(locale, 'schedule.session.state.pendingClose')}
          </span>
        ) : null}
        {session.status !== 'cancelled' && state === 'activeNow' ? (
          <span style={stateBadgeStyle('var(--pending)')} data-testid="session-state">
            {t(locale, 'schedule.session.state.activeNow')}
          </span>
        ) : null}
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            fontSize: 'var(--text-title)',
          }}
        >
          {formatTimeInStudioZone(session.starts_at, locale)}
          {'–'}
          {formatTimeInStudioZone(session.ends_at, locale)}
        </span>
        {/* 1d — `45 דק׳`, derived: two instants are already on the wire. */}
        <span style={noteStyle} data-testid="session-duration">
          {t(locale, 'schedule.session.durationMinutes').replace(
            '{{minutes}}',
            String(Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000)),
          )}
        </span>
        <strong>{session.group_name}</strong>
        {/* 1d — `אולם א׳ · 14 חניכים`. */}
        <span style={noteStyle} data-testid="session-headcount">
          {session.location_name ? <>{session.location_name} · </> : null}
          {t(locale, 'schedule.session.headcount').replace('{{count}}', String(session.headcount))}
        </span>
        <StatusChip
          status={session.status === 'cancelled' ? 'cancelled' : 'planned'}
          label={t(locale, `schedule.session.status.${session.status}`)}
        />
        {/* 1d — `נוכחות נרשמה`: the register-state marker, the difference between
            "done" and "still owed" at a glance down the day. */}
        {session.attendance_taken ? (
          <StatusChip status="paid" label={t(locale, 'schedule.session.attendanceTaken')} />
        ) : null}
        {session.staff[0] ? (
          <span style={noteStyle}>{session.staff[0].display_name}</span>
        ) : (
          <span style={noteStyle}>{t(locale, 'schedule.session.noCoach')}</span>
        )}
        {session.staff[0]?.is_substitute ? (
          <span style={noteStyle}>{t(locale, 'schedule.session.substitute')}</span>
        ) : null}
        {session.is_manually_edited && !session.is_ad_hoc ? (
          <span style={noteStyle}>{t(locale, 'schedule.session.manuallyEditedHint')}</span>
        ) : null}
        {session.is_ad_hoc ? <span style={noteStyle}>{t(locale, 'schedule.session.adHoc')}</span> : null}
        {session.cancel_reason ? (
          <span style={noteStyle}>{cancelReasonLabel(locale, session.cancel_reason)}</span>
        ) : null}
      </div>

      {/* §4.1's "the card also carries who has answered" — thrown away until now, and
          every field it needs is already in the offline cache. `counts.total === 0` covers
          both "roster not cached yet" and "nobody expected", and neither is worth a line. */}
      {counts.total > 0 ? (
        <p style={noteStyle} data-testid="session-confirmed">
          {t(locale, 'schedule.session.confirmedCount')
            .replace('{{confirmed}}', String(counts.confirmed))
            .replace('{{total}}', String(counts.total))}
        </p>
      ) : null}
      {counts.notAnswered > 0 ? (
        <p style={noteStyle} data-testid="session-not-answered">
          {plural(locale, 'schedule.session.notAnsweredCount', counts.notAnswered)}
        </p>
      ) : null}

      {/* §4.9's chase action, decision 18: the same mechanism as everywhere else in the
          app — copy the numbers, open WhatsApp with the message ready. No integration. */}
      {counts.notAnswered > 0 ? (
        <div style={{ marginBlockStart: 'var(--space-2)' }}>
          <ContactFamiliesButton
            locale={locale}
            triggerLabel={plural(locale, 'schedule.session.chaseButton', counts.notAnswered)}
            title={session.group_name}
            message={t(locale, 'schedule.session.chaseMessage')
              .replace('{{group}}', session.group_name)
              .replace('{{time}}', formatTimeInStudioZone(session.starts_at, locale))}
            resolveFamilies={chaseFamilies(notAnsweredIds)}
          />
        </div>
      ) : null}

      {session.status !== 'cancelled' ? (
        // 1d — "לחיצה פותחת את 1c". Until the design pass NOTHING in the app linked to
        // the roster: the product's core daily flow was reachable only by typing
        // `#/attendance/<id>` into the URL bar.
        <a
          href={`#/attendance/${session.id}`}
          data-testid="open-roster"
          className="studio-btn"
          data-variant="primary"
          style={{
            marginBlockStart: 'var(--space-3)',
            display: 'flex',
            textDecoration: 'none',
          }}
        >
          {t(locale, 'schedule.today.openRoster')}
        </a>
      ) : null}
    </Card>
  )
}

/**
 * §4.1's merge, "visually marked as events" — the type chip (`events.type.*`, the same
 * labels 9i already uses) is what marks it, rather than inventing a second "this is an
 * event" badge nobody asked for. Tapping it opens 9i's own roster screen, which already
 * exists; this card is deliberately thin.
 */
function EventCard({ event, locale }: { event: EventOut; locale: Locale }) {
  const total = event.rsvp_yes_count + event.rsvp_no_count + event.rsvp_pending_count
  return (
    <Card>
      <div style={rowStyle}>
        <StatusChip status="planned" label={t(locale, `events.type.${event.type}`)} />
        <strong>{event.title}</strong>
        <span style={noteStyle} data-testid="event-when">
          {formatTimeInStudioZone(event.starts_at, locale)}
          {event.location_text ? <> · <bdi>{event.location_text}</bdi></> : null}
        </span>
        {total > 0 ? (
          <span style={noteStyle}>
            {t(locale, 'events.counts.confirmed')} {event.rsvp_yes_count}/{total}
          </span>
        ) : (
          <span style={noteStyle}>{t(locale, 'events.roster.empty')}</span>
        )}
      </div>
      <a
        href={`#/events/${event.id}/roster`}
        data-testid="open-event-roster"
        className="studio-btn"
        data-variant="secondary"
        style={{ marginBlockStart: 'var(--space-3)', display: 'flex', textDecoration: 'none' }}
      >
        {t(locale, 'events.roster.title')}
      </a>
    </Card>
  )
}
