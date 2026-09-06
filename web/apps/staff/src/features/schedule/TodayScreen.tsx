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
//
// **Second pass, same day: the anatomy, not a token swap.** The first pass kept the old
// flat-row card and the old boxy day strip and only recoloured them, which is not what
// `~/Downloads/staff-app/src/components/ScheduleView.tsx` draws. This pass ports the
// prototype's actual shapes — the pill day strip, the chip-and-time card header, the
// meta row, the divider with a small outlined action beside a stat cluster — onto the real
// data `timeline.ts` already computes correctly. Two adaptations from the prototype, both
// because it hardcodes four bespoke cards and this screen draws one shape for any session:
//   - The state chip now speaks for THREE of the dot's four states (`pendingClose`,
//     `activeNow`, `nextUp` — all three already have a words-not-colour label the dot's own
//     `aria-label` uses), plus a fourth for a cancelled session, which `timelineStates`
//     files under the same neutral `later` bucket as "ended and closed" but which still
//     needs its own word or a coach reads a cancelled class as an ordinary later one. A
//     `later` session that is not cancelled gets no chip — its dot and its position in the
//     list already say everything there is to say, same as before this pass.
//   - The stat cluster in the bottom-right shows `confirmationCounts` off the cached roster
//     when there is one, and `headcount` (the group's live enrollment, always on the wire)
//     when there is not — never a blank corner. `openRoster`, this session's one real
//     action, is the outlined button beside it; a cancelled session has no such action, so
//     that corner names the cancellation and its reason instead.
// The calendar icon button the header now carries opens the same `#/schedule/date` this
// screen always has — `open-date-picker` moved in from `ScheduleSection`'s own header bar,
// which sat as a separate line above this one; see that file's own note.
//
// **Third pass, same day (C3): the anatomy pass flattened the states it had just told
// apart.** The four dot states got their own colour and their own words, but every card
// still drew the same shape — the session actually happening now looked like any other,
// carrying no more information than one that had not started. Three fixes, all from the
// prototype's own four hand-drawn cards, none of them a token swap:
//   - `activeNow`'s card gets the prototype's own frame — `border-2 border-blue-500
//     shadow-lg shadow-blue-500/10` — in place of the ordinary hairline every other state
//     draws, via `CARD_FRAME` below (replacing the old colour-only `CARD_BORDER`).
//   - `activeNow` gets a second thing no other state carries: a live progress block, off
//     the SAME `confirmationCounts` the bottom cluster already reads — never a second
//     source of truth. The prototype calls this "on the mat", which assumes a physical
//     check-in this app does not have; every count here is who has *confirmed*, worded
//     accordingly. Its header swaps the plain duration for `ends_at - now` — real, and the
//     one fact that keeps changing while a class is in progress, unlike the duration next
//     to it doesn't. `pendingClose`'s two-line count (a bold "N families have not
//     answered" over a quiet "(confirmed/total)") already existed but silently gave up and
//     showed a headcount the moment a roster was not cached — a number that reads as the
//     same fact but is not. It now says so instead, in both places: `session-progress` and
//     the bottom cluster share the same `rosterUnavailable` sentence rather than a
//     substituted number.
//   - The `היום` pill beside the calendar icon is unconditional now, matching the
//     prototype exactly — the port had hidden it while already on today, because a test
//     asserted its absence rather than the design calling for one. It is `disabled` on
//     today instead: still present, still an honest description of the day, no click that
//     would do nothing.
// A `Locale`-driven `withMonoNumerals` below isolates just the digits in an already-
// translated sentence into their own `font-mono` span — never a new template, and never a
// change to what `toHaveTextContent` reads, since splitting and rejoining a string changes
// none of its characters.
//
// **Fourth pass, same day (C4): owner review of the actions row.** A large standalone "N
// families have not answered — contact" button sat on every card, with attendance — the
// thing a coach actually does here every day — riding beside it as a small outlined link.
// Backwards, and not what `~/Downloads/staff-app/src/components/ScheduleView.tsx` draws:
// its active card's actions are a two-up grid of two EQUAL filled buttons, attendance
// (`ClipboardList`, blue) first and primary, the chase (`MessageCircle`, emerald, carrying
// its own count — `שלח תזכורת (N)`) second. `ATTENDANCE_BUTTON_CLASS`/`CHASE_BUTTON_CLASS`
// replace the old per-state `ACTION_TINT`; the chase half is only drawn when
// `counts.notAnswered > 0`, and attendance takes the whole row alone when it is not — a
// button offering to chase nobody is noise. The same grid now applies to every non-
// cancelled card state, not only the active one: `pendingClose` (ended, unclosed) still
// has attendance as its primary action, which is the whole point of that card. The bottom
// stat cluster (present/total, headcount, or "not cached on this device") is unchanged —
// only its position moved, onto its own row above the grid, now that the actions beneath
// it are full width. `ContactFamiliesButton` itself is NOT forked: it grew an optional
// `renderTrigger`, the same escape hatch `AccessibilityMenu` already has, so the panel and
// its three rules (a missing number gets a sentence, nothing claims delivery, no new
// exposure) stay in exactly one place.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertCircle,
  Ban,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  MapPin,
  MessageCircle,
  Trophy,
  User,
  Users,
} from 'lucide-react'
import { EmptyState, LoadFailed } from '@studio/ui'
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

const filterStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-bold)',
}

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

/**
 * The card's own frame, tinted by the SAME `DotState` the dot carries — rose for a
 * register still owed, blue for the next thing up, slate for everything else (a cancelled
 * session included: `timelineStates` already resolves it to `later`). Tailwind's literal
 * hues, not the tokens above — this pass draws that line on purpose: the tokens stay the
 * dot's alone, and `--paid`'s green is money-scoped and never borrowed here.
 *
 * `activeNow` is not a fourth hairline the way the other three are — the prototype draws
 * the session happening right now with its own two-pixel frame (`border-2 border-blue-500
 * shadow-lg shadow-blue-500/10`), distinct from every other card's `border shadow-xs`. Its
 * dot and chip stay emerald (nothing above changes); only the card's own outline goes blue,
 * which is what makes it the one card on the screen a coach cannot mistake for any other.
 */
const CARD_FRAME: Record<DotState, string> = {
  pendingClose: 'border border-rose-200 shadow-xs',
  activeNow: 'border-2 border-blue-500 shadow-lg shadow-blue-500/10',
  nextUp: 'border border-blue-200 shadow-xs',
  later: 'border border-slate-200/80 shadow-xs',
}

/**
 * C4 (owner review, 2026-09-06) — the actions row used to put a large standalone "N
 * families have not answered — contact" button on every card, with attendance riding
 * beside it as a small `ACTION_TINT`-tinted outline. Backwards: the prototype's own
 * `ScheduleView` draws a two-up grid of two EQUAL filled buttons, attendance first and
 * primary. These two classes replace `ACTION_TINT` — no more per-state tint, because both
 * buttons now carry their own fixed colour (blue for attendance, emerald for the chase)
 * the way the prototype has it, regardless of which `DotState` the card is in.
 */
const ATTENDANCE_BUTTON_CLASS =
  'py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all'
const CHASE_BUTTON_CLASS =
  'py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition-all'

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
 * Isolates every digit run in an already-translated sentence into its own `font-mono`
 * span, leaving the surrounding words exactly as `t`/`plural` returned them. A regex over
 * the resolved string rather than the template: `plural` already interpolates `{{count}}`
 * before this ever sees it, and a resolved digit reads the same regardless of which locale
 * or plural form produced it. Splitting and rejoining changes no character in the string,
 * so every `toHaveTextContent` assertion already written against these labels keeps
 * matching — only the markup around the digits changes.
 */
function withMonoNumerals(text: string): ReactNode {
  const parts = text.split(/(\d+(?:[.,]\d+)?%?)/g)
  return parts.map((part, index) =>
    /^\d/.test(part) ? (
      <span key={index} className="font-mono">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

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
    <section
      aria-labelledby="today-title"
      data-testid="staff-today"
      className="flex flex-col gap-4 px-4 pt-4"
    >
      {/* Two clusters, one row. Leading: the calendar door to 9b and, beside it, the
          `היום` pill — unconditional, per C3: the prototype always draws it there rather
          than only once a coach has already wandered off today. `disabled` on today itself
          says the same thing a click would have found out the hard way — there is nowhere
          left for it to take you — without hiding the control the design keeps in view.
          Trailing: the date, and beneath it the count this screen has always carried in
          `today-summary`. */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <a
            href="#/schedule/date"
            data-testid="open-date-picker"
            aria-label={t(locale, 'schedule.datePicker.title')}
            className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs border border-blue-100 active:scale-95 transition-all shrink-0"
          >
            <CalendarIcon className="w-5 h-5" aria-hidden="true" />
          </a>
          <button
            type="button"
            data-testid="back-to-today"
            disabled={day === todayKey}
            onClick={() => setDay(todayKey)}
            className="px-3.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {t(locale, 'schedule.today.title')}
          </button>
        </div>

        <div className="text-end">
          <h1 id="today-title" className="text-base font-black text-slate-900 tracking-tight">
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
          <p data-testid="today-summary" className="text-xs font-semibold text-slate-400 mt-0.5">
            ({withMonoNumerals(plural(locale, 'schedule.today.sessionCount', onThisDay.length))}
            {coachName ? (
              <>
                {' · '}
                <bdi>{coachName}</bdi>
              </>
            ) : null}
            )
          </p>
        </div>
      </header>

      <div
        role="group"
        aria-label={t(locale, 'schedule.datePicker.title')}
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
      >
        {strip.map((key) => {
          const selected = key === day
          const isToday = key === todayKey
          return (
            <button
              key={key}
              type="button"
              // Keyed, not generic: the interesting assertion is WHICH day is selected.
              // The strip's length is `within(strip).getAllByRole('button')`, which asks
              // the accessibility tree instead of a test hook.
              data-testid={`day-chip-${key}`}
              aria-current={selected ? 'date' : undefined}
              onClick={() => chooseDay(key)}
              className={`flex-1 min-w-[44px] py-2.5 rounded-2xl flex flex-col items-center gap-0.5 transition-all active:scale-95 ${
                selected
                  ? 'bg-[#1e3a8a] text-white shadow-md ring-2 ring-blue-600/30'
                  : 'bg-white text-slate-600 border border-slate-200/80'
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${selected ? 'text-blue-200' : 'text-slate-400'}`}
              >
                {t(locale, `schedule.weekday.${new Date(`${key}T12:00:00Z`).getUTCDay()}`)}
              </span>
              <span className="text-sm font-black font-mono">{key.slice(8)}</span>
              {isToday ? (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-blue-600'}`}
                  aria-hidden="true"
                />
              ) : null}
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
              today={today}
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
  today,
  roster,
  chaseFamilies,
}: {
  item: TimelineItem
  state: DotState
  locale: Locale
  today: string
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
              today={today}
              roster={roster}
              chaseFamilies={chaseFamilies}
            />
          ) : (
            <EventCard event={item.event} state={state} locale={locale} />
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Row 1's leading chip — the state in words, never colour alone (SC 1.4.1). Three of the
 * dot's four states get one, the same three the dot's own `aria-label` already names
 * (`pendingClose`, `activeNow`, `nextUp`); a cancelled session gets a fourth the dot does
 * not carry at all, because `timelineStates` files it under the same neutral `later` bucket
 * as "ended and closed" and a plain grey card would read as an ordinary later class. A
 * `later` session that is not cancelled gets no chip here — its dot and its position in the
 * list already say everything there is to say, unchanged from before this pass.
 */
function SessionStateChip({
  status,
  state,
  locale,
}: {
  status: SessionRow['status']
  state: DotState
  locale: Locale
}) {
  if (status === 'cancelled') {
    return (
      <span
        data-testid="session-state"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600"
      >
        <Ban className="w-3 h-3" aria-hidden="true" />
        <span>{t(locale, 'schedule.session.status.cancelled')}</span>
      </span>
    )
  }
  if (state === 'pendingClose') {
    return (
      <span
        data-testid="session-state"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
      >
        <AlertCircle className="w-3 h-3" aria-hidden="true" />
        <span>{t(locale, 'schedule.session.state.pendingClose')}</span>
      </span>
    )
  }
  if (state === 'activeNow') {
    return (
      <span
        data-testid="session-state"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
        <span>{t(locale, 'schedule.session.state.activeNow')}</span>
      </span>
    )
  }
  if (state === 'nextUp') {
    return (
      <span
        data-testid="session-state"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100"
      >
        <Clock className="w-3 h-3" aria-hidden="true" />
        <span>{t(locale, 'schedule.session.state.nextUp')}</span>
      </span>
    )
  }
  return null
}

/**
 * The active card's own block — no other state carries one. The SAME `confirmationCounts`
 * the bottom cluster reads, never a second source of truth, worded as a confirmation
 * rather than the prototype's "on the mat" — this app has no physical check-in during a
 * class, only who said in advance they were coming. `roster === undefined` means the
 * offline cache never got this session at all (§6.1 only primes today and tomorrow); the
 * honest line there is `rosterUnavailable`, not a bar drawn at 0% that would read as
 * "nobody has confirmed" when the truth is "nobody has looked".
 */
function SessionProgress({ locale, roster }: { locale: Locale; roster: RosterRow[] | undefined }) {
  if (roster === undefined) {
    return (
      <div
        className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/80 mb-3"
        data-testid="session-progress"
      >
        <span className="text-xs font-semibold text-slate-400">
          {t(locale, 'schedule.session.rosterUnavailable')}
        </span>
      </div>
    )
  }
  const counts = confirmationCounts(roster)
  const percent = counts.total > 0 ? Math.round((counts.confirmed / counts.total) * 100) : 0
  return (
    <div
      className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/80 mb-3"
      data-testid="session-progress"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-700" data-testid="session-progress-count">
          {withMonoNumerals(
            t(locale, 'schedule.session.confirmedCount')
              .replace('{{confirmed}}', String(counts.confirmed))
              .replace('{{total}}', String(counts.total)),
          )}
        </span>
        <span className="text-xs font-black text-blue-700 font-mono" data-testid="session-progress-percent">
          {t(locale, 'schedule.session.confirmedPercent').replace('{{percent}}', String(percent))}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ inlineSize: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          <span className="font-mono">{counts.confirmed}</span>
          <span>{t(locale, 'schedule.session.progressConfirmedLabel')}</span>
        </span>
        <span className="text-rose-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true" />
          <span className="font-mono">{counts.notAnswered}</span>
          <span>{t(locale, 'schedule.session.progressNotAnsweredLabel')}</span>
        </span>
      </div>
    </div>
  )
}

function SessionCard({
  session,
  state,
  locale,
  today,
  roster,
  chaseFamilies,
}: {
  session: SessionRow
  state: DotState
  locale: Locale
  /** An ISO instant — `ends_at - today` is the active card's own "נותרו X דק'" badge. */
  today: string
  roster: RosterRow[] | undefined
  chaseFamilies: (studentIds: string[]) => () => Promise<ContactFamily[]>
}) {
  const counts = confirmationCounts(roster)
  const notAnsweredIds = (roster ?? [])
    .filter((row) => row.has_confirmation !== true && !row.has_absence_report)
    .map((row) => row.student_id)
  const coachLine = session.staff[0]
    ? session.staff[0].display_name
    : t(locale, 'schedule.session.noCoach')
  const hasHints =
    session.attendance_taken ||
    session.staff[0]?.is_substitute ||
    (session.is_manually_edited && !session.is_ad_hoc) ||
    session.is_ad_hoc

  // C3 — while a class is in progress, "45 דק׳" (its total length, unchanging) is less
  // useful than "נותרו 32 דק׳" (how much is left, which is the fact a coach checking the
  // screen mid-class actually wants). The absolute time range above it is untouched either
  // way, so nothing here is lost — only the redundant derived fact beneath it swaps for a
  // more useful one, and only for the one card where "remaining" means something.
  const remainingMinutes = Math.max(
    0,
    Math.round((Date.parse(session.ends_at) - Date.parse(today)) / 60_000),
  )

  // §4.9's chase action, decision 18: the same mechanism as everywhere else in the app —
  // copy the numbers, open WhatsApp with the message ready. No integration. Computed once,
  // C4, so both the ordinary two-up grid and the cancelled-session row (which has no
  // attendance half to grid against) render the identical trigger.
  const chaseLabel = t(locale, 'schedule.session.chaseButton').replace(
    '{{count}}',
    String(counts.notAnswered),
  )
  const chaseButton =
    counts.notAnswered > 0 ? (
      <ContactFamiliesButton
        locale={locale}
        triggerLabel={chaseLabel}
        title={session.group_name}
        message={t(locale, 'schedule.session.chaseMessage')
          .replace('{{group}}', session.group_name)
          .replace('{{time}}', formatTimeInStudioZone(session.starts_at, locale))}
        resolveFamilies={chaseFamilies(notAnsweredIds)}
        // The trigger the prototype draws — filled emerald, equal weight to attendance,
        // its own count baked into the label rather than a separate badge. Unforked: this
        // is `renderTrigger`, the same escape hatch `AccessibilityMenu` already has, so the
        // panel, its loading/failure states and its three rules stay in one place.
        renderTrigger={({ onOpen }) => (
          <button
            type="button"
            data-testid="contact-open"
            onClick={onOpen}
            className={CHASE_BUTTON_CLASS}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>{withMonoNumerals(chaseLabel)}</span>
          </button>
        )}
      />
    ) : null

  return (
    <article className={`bg-white rounded-3xl p-4 ${CARD_FRAME[state]}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <SessionStateChip status={session.status} state={state} locale={locale} />
        {/* 1d — `45 דק׳`, derived: two instants are already on the wire. */}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-bold font-mono text-slate-400">
            {formatTimeInStudioZone(session.starts_at, locale)}
            {'–'}
            {formatTimeInStudioZone(session.ends_at, locale)}
          </span>
          {state === 'activeNow' ? (
            <span
              className="text-[10px] font-semibold text-slate-300 font-mono"
              data-testid="session-remaining"
            >
              {t(locale, 'schedule.session.remainingMinutes').replace(
                '{{minutes}}',
                String(remainingMinutes),
              )}
            </span>
          ) : (
            <span
              className="text-[10px] font-semibold text-slate-300 font-mono"
              data-testid="session-duration"
            >
              {t(locale, 'schedule.session.durationMinutes').replace(
                '{{minutes}}',
                String(Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000)),
              )}
            </span>
          )}
        </div>
      </div>

      <strong className="block text-base font-black text-slate-900 mb-1">{session.group_name}</strong>

      <div className="flex flex-col gap-1 mb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {session.location_name ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>{session.location_name}</span>
            </span>
          ) : null}
          {session.location_name ? <span aria-hidden="true">•</span> : null}
          <span className="flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>{coachLine}</span>
          </span>
        </div>
        {hasHints ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            {/* 1d — "נוכחות נרשמה": the register-state marker, the difference between
                "done" and "still owed" at a glance down the day. A Tailwind badge of our
                own rather than `StatusChip status="paid"` — that token is money-scoped. */}
            {session.attendance_taken ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {t(locale, 'schedule.session.attendanceTaken')}
              </span>
            ) : null}
            {session.staff[0]?.is_substitute ? (
              <span>{t(locale, 'schedule.session.substitute')}</span>
            ) : null}
            {session.is_manually_edited && !session.is_ad_hoc ? (
              <span>{t(locale, 'schedule.session.manuallyEditedHint')}</span>
            ) : null}
            {session.is_ad_hoc ? <span>{t(locale, 'schedule.session.adHoc')}</span> : null}
          </div>
        ) : null}
      </div>

      {/* C3 — the one block no other state carries: see `SessionProgress`'s own header. */}
      {state === 'activeNow' ? <SessionProgress locale={locale} roster={roster} /> : null}

      {/* §4.1's "the card also carries who has answered" — thrown away until C2, and
          every field it needs is already in the offline cache. The stat cluster's leading
          half is `confirmationCounts` off that cache when there is one; `headcount` (the
          group's live enrollment, always on the wire) is the honest fallback when there
          isn't — never a blank corner. C4 moved this cluster onto its own row, right-
          aligned as before, now that the actions beneath it are a full-width grid rather
          than a row it used to share. */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-end gap-2">
          {counts.total > 0 ? (
            <>
              <div className="text-end">
                {counts.notAnswered > 0 ? (
                  <span
                    data-testid="session-not-answered"
                    className="block font-extrabold text-rose-700 text-xs"
                  >
                    {withMonoNumerals(plural(locale, 'schedule.session.notAnsweredCount', counts.notAnswered))}
                  </span>
                ) : null}
                <span
                  data-testid="session-confirmed"
                  className={
                    counts.notAnswered > 0
                      ? 'block text-[11px] text-slate-400'
                      : 'block font-extrabold text-emerald-700 text-xs'
                  }
                >
                  {withMonoNumerals(
                    t(locale, 'schedule.session.confirmedCount')
                      .replace('{{confirmed}}', String(counts.confirmed))
                      .replace('{{total}}', String(counts.total)),
                  )}
                </span>
              </div>
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                  counts.notAnswered > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {counts.notAnswered > 0 ? (
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                )}
              </div>
            </>
          ) : state === 'pendingClose' ? (
            // C3 — a register still owed its counts must say that plainly. `headcount` (the
            // group's live enrollment) answers a different question than "who confirmed",
            // and showing it here would read as the same fact when it is not — the roster
            // simply is not cached, and this says exactly that.
            <span data-testid="session-roster-unavailable" className="text-xs font-semibold text-slate-400">
              {t(locale, 'schedule.session.rosterUnavailable')}
            </span>
          ) : (
            <>
              {/* 1d — `אולם א׳ · 14 חניכים`. */}
              <span data-testid="session-headcount" className="text-xs font-bold text-slate-700">
                {withMonoNumerals(
                  `${session.location_name ? `${session.location_name} · ` : ''}${t(
                    locale,
                    'schedule.session.headcount',
                  ).replace('{{count}}', String(session.headcount))}`,
                )}
              </span>
              <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
                <Users className="w-4 h-4" aria-hidden="true" />
              </div>
            </>
          )}
        </div>

        {session.status !== 'cancelled' ? (
          // 1d — "לחיצה פותחת את 1c". Until the design pass NOTHING in the app linked to
          // the roster: the product's core daily flow was reachable only by typing
          // `#/attendance/<id>` into the URL bar. C4 — attendance is now the primary half
          // of a two-up grid, matching the prototype's own filled `ClipboardList` button;
          // the chase half is only drawn beside it when there is anyone left to chase, and
          // attendance takes the whole row alone when there is not — a button offering to
          // chase nobody is noise.
          <div className={counts.notAnswered > 0 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1'}>
            <a href={`#/attendance/${session.id}`} data-testid="open-roster" className={ATTENDANCE_BUTTON_CLASS}>
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
              <span>{t(locale, 'schedule.today.openRoster')}</span>
            </a>
            {chaseButton}
          </div>
        ) : (
          // A cancelled session has no `openRoster` action, so this row names the
          // cancellation and its reason instead — the chase action still offers below it
          // when a cancelled session somehow still has families unanswered, unchanged from
          // before this pass.
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {t(locale, 'schedule.session.cancelled')}
              {session.cancel_reason ? (
                <>
                  {' · '}
                  <span>{cancelReasonLabel(locale, session.cancel_reason)}</span>
                </>
              ) : null}
            </span>
            {chaseButton}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * §4.1's merge, "visually marked as events" — the type chip (`events.type.*`, the same
 * labels 9i already uses) is what marks it, rather than inventing a second "this is an
 * event" badge nobody asked for. Tapping it opens 9i's own roster screen, which already
 * exists; this card is deliberately thin. The outer border still follows the timeline's
 * own state (an event can be `activeNow`/`nextUp`/`later` exactly like a session, per
 * `timelineStates`'s own rule) — the amber only marks the leading chip, which is about
 * what kind of thing this is, not when.
 */
function EventCard({ event, state, locale }: { event: EventOut; state: DotState; locale: Locale }) {
  const total = event.rsvp_yes_count + event.rsvp_no_count + event.rsvp_pending_count
  return (
    <article className={`bg-white rounded-3xl p-4 ${CARD_FRAME[state]}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Trophy className="w-3 h-3" aria-hidden="true" />
          <span>{t(locale, `events.type.${event.type}`)}</span>
        </span>
        <span className="text-xs font-bold font-mono text-slate-400" data-testid="event-when">
          {formatTimeInStudioZone(event.starts_at, locale)}
        </span>
      </div>

      <strong className="block text-base font-black text-slate-900 mb-1">{event.title}</strong>

      {event.location_text ? (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
          <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <bdi>{event.location_text}</bdi>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <a
          href={`#/events/${event.id}/roster`}
          data-testid="open-event-roster"
          className="px-4 py-2 rounded-xl border border-amber-300 text-amber-700 font-bold text-xs hover:bg-amber-50 active:scale-95 transition-all inline-flex items-center gap-1"
        >
          <span>{t(locale, 'events.roster.title')}</span>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </a>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-700">
            {withMonoNumerals(
              total > 0
                ? `${t(locale, 'events.counts.confirmed')} ${event.rsvp_yes_count}/${total}`
                : t(locale, 'events.roster.empty'),
            )}
          </span>
          <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Users className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  )
}
