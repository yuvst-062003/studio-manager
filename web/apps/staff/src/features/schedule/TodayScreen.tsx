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
// The header carries ONE calendar button, to §4.7's month grid. It carried a second, to
// artboard 9b, until both that icon and that screen were deleted on 2026-09-07 — 9b's grid
// marked days but showed no sessions, and its date RANGE fed one value the month grid gives
// with a tap.
//
// **Third pass, same day (C3): the anatomy pass flattened the states it had just told
// apart.** The four dot states got their own colour and their own words, but every card
// still drew the same shape — the session actually happening now looked like any other,
// carrying no more information than one that had not started. Three fixes, all from the
// prototype's own four hand-drawn cards, none of them a token swap:
//   - `activeNow`'s card gets the prototype's own frame — `border-2 border-[var(--emphasis)]
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
//
// **Fifth pass (C5, 2026-09-07): the briefing marker stops being decoration.** Until now
// `schedule.session.hasBriefing` was a read-only badge — the only way to WRITE a session's
// briefing was to open the register, which does not exist until the class has already
// happened once (§5.7 is M5's, and a manager planning Tuesday from Sunday has no register
// to open yet). Tapping the marker now opens the same editor (`SessionPlanCard`,
// `../briefing`) in a dialog: read it as any staff role, edit it as `owner`/`manager`/
// `lead_coach` — decision 16, unchanged. `SessionPlanCard` itself moved out of
// `attendance/RosterScreen.tsx` rather than being rewritten here a second time — two
// editors for one field is exactly how `PaymentStrip` drifted before it was deleted.
// `plans` (below) changed shape with it: the marker's old boolean became the cached TEXT
// (nullable), because the sheet needs something to show and the rule stays "cache only,
// never a fetch" — the briefing rides down with its session on `GET /sync/bootstrap`
// precisely so the schedule tab keeps working with no signal. Saving is the one part of
// this that DOES need the network (`attendanceClient.addSessionNote`), and a failed save
// keeps the sheet open and says so, exactly as `SessionPlanCard` already does on the
// register — the dialog itself is `useModalDialog`, the same contract
// `ContactFamiliesButton`'s panel already gives this app (focus trapped, Escape closes,
// focus returns to whatever opened it).
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertCircle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  MapPin,
  MessageCircle,
  Settings2,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react'
import { EmptyState, LoadFailed, useModalDialog } from '@studio/ui'
import {
  cachedSessions,
  formatDateInStudioZone,
  formatTimeInStudioZone,
  offlineStore,
  readRoster,
  readSession,
  studioDayKey,
  useNetworkMode,
} from '@studio/core'
import type { RosterRow } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel, closureOn, yearCovers } from './client'
import type { ClosureRow, SessionRow, StaffScheduleClient } from './client'
import { confirmationCounts, mergeTimeline, timelineStates } from './timeline'
import type { DotState, TimelineItem } from './timeline'
import type { EventOut, StaffEventsClient } from '../events/client'
import type { StaffPeopleClient } from '../people'
import type { StaffAttendanceClient } from '../attendance/client'
import { ContactFamiliesButton } from '../contact'
import type { ContactFamily } from '../contact'
import { SessionPlanCard } from '../briefing'
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
 * the session happening right now with its own two-pixel frame (`border-2 border-[var(--emphasis)]
 * shadow-lg shadow-blue-500/10`), distinct from every other card's `border shadow-xs`. Its
 * dot and chip stay emerald (nothing above changes); only the card's own outline goes blue,
 * which is what makes it the one card on the screen a coach cannot mistake for any other.
 */
const CARD_FRAME: Record<DotState, string> = {
  pendingClose: 'border border-[var(--danger)] shadow-xs',
  activeNow: 'border-2 border-[var(--emphasis)] shadow-lg shadow-blue-500/10',
  nextUp: 'border border-[var(--emphasis)] shadow-xs',
  later: 'border border-[var(--border)] shadow-xs',
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
  'py-3 rounded-2xl bg-[var(--emphasis)] hover:brightness-110 active:scale-[0.98] text-[var(--on-emphasis)] font-bold text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all'
const CHASE_BUTTON_CLASS =
  'py-3 rounded-2xl bg-[var(--paid)] hover:bg-[var(--paid)] active:scale-[0.98] text-[var(--on-status)] font-bold text-xs shadow-md shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition-all'

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
// Exported — the month calendar (§4.7, checkpoint C11) draws its own day's agenda with
// this exact dot, `SessionCard` and `EventCard`, rather than a second card built to look
// the same: "the same card anatomy as the schedule tab" is a claim only true while there is
// one component being pointed at twice, not two that started identical and can drift.
export function TimelineDot({ state, time, locale }: { state: DotState; time: string; locale: Locale }) {
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
  attendanceClient,
  today,
  initialDay = null,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
  viewerIsManager = false,
  canWritePlan = false,
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
  /** §6.2's marker-becomes-a-button pass (2026-09-07) — the sheet's save needs the network,
   *  and this is where it reaches it: `RosterScreen`'s own `StaffAttendanceClient`, optional
   *  for the same reason `eventsClient`/`peopleClient` are. Never used to READ the
   *  briefing — that stays cache-only (see the `plans` effect below) — only to write it. */
  attendanceClient?: StaffAttendanceClient
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
  /**
   * `owner`/`manager` only — NOT the `canWritePlan` trio, which includes a lead coach.
   * Owner-reported 2026-09-07: the coach filter is a manager's tool for reading somebody
   * else's day, so a coach was being offered a control whose only useful setting is the
   * one they already start on.
   */
  viewerIsManager?: boolean
  /** §6.2, decision 16 — `owner`/`manager`/`lead_coach`, the exact trio `RosterScreen`'s own
   *  prop of the same name already gates the identical rule on. Defaults to false: a caller
   *  that has not wired this yet gets an assistant coach's view of the marker — read-only,
   *  never a false editor. */
  canWritePlan?: boolean
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [day, setDay] = useState(initialDay ?? todayKey)
  //: `!viewerIsManager` is the half this was missing, and the prop above already stated
  //: the rule it was breaking: "a coach opening the app wants their own day, A MANAGER
  //: WANTS THE CLUB'S". The code only asked the first question, so somebody who is BOTH —
  //: a manager who also coaches, which is most owners of a small club — silently opened on
  //: their own day. Owner-reported 2026-09-07: the month calendar showed the club's
  //: sessions and לוח זמנים said "אין שיעורים היום" on a day that had one, because that
  //: one belonged to a different coach.
  const [coachFilter, setCoachFilter] = useState<string>(
    viewerIsCoach && !viewerIsManager && viewerPersonId ? viewerPersonId : '',
  )
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [events, setEvents] = useState<EventOut[]>([])
  const [failed, setFailed] = useState(false)
  /** Rendered from IndexedDB rather than the network. Said out loud, because a coach
   *  looking at a stale list has to know it may be stale. */
  const [fromCacheNotice, setFromCacheNotice] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Register §4.2 — defaults to false (an ordinary empty day) until the check below
  // (fired only when the day's own fetch comes back empty) proves otherwise.
  const [noTrainingYear, setNoTrainingYear] = useState(false)
  // Bug #20 — the closure covering the day on screen, or null. Same default and the same
  // honesty rule as `noTrainingYear`: an unanswered question renders as "ordinary day off".
  const [closure, setClosure] = useState<ClosureRow | null>(null)
  // §4.1 — every roster row already carries `has_confirmation`/`has_absence_report`, and
  // both are already in the offline cache primed at §6.1's launch. Read here, never
  // fetched again: keyed by session id so each card's counts travel from THIS session's
  // own cached roster, not a shared one.
  const [rosters, setRosters] = useState<Record<string, RosterRow[] | undefined>>({})
  // §6.2 of the staff app redesign, updated 2026-09-07 — the marker stopped being
  // decoration and became the door onto the briefing, so this now holds the TEXT
  // (nullable), not a boolean: the sheet the marker opens needs something to show, and it
  // must come from the cache, not a further fetch — the whole point of the briefing riding
  // down with its session on `GET /sync/bootstrap`. The LIST itself still never renders
  // this string, only the sheet does; "do not render the text on a list" still holds.
  const [plans, setPlans] = useState<Record<string, string | null>>({})
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const strip = useMemo(() => stripAround(initialDay ?? todayKey), [initialDay, todayKey])

  /** §6.1's offline promise, finally kept (2026-09-07).
   *
   * `writeWindow` has primed two days of sessions into IndexedDB since the offline
   * machinery shipped, and **nothing ever read them back** — `cachedSessions` had no caller
   * outside its own tests. So the app carried the data for a basement and then, in a
   * basement, showed "could not load" over the top of it. The register was genuinely
   * offline-capable; the screen that reaches the register was not.
   *
   * The cache holds `CACHE_WINDOW_DAYS`, so this can only answer for today and tomorrow.
   * That is why an empty result here still fails the screen rather than rendering an empty
   * day: "no sessions" reads as a day off, and saying it about a Thursday nobody cached
   * would be the exact lie S11 already forbids.
   *
   * The shapes differ and the gap is filled honestly rather than with zeroes.
   * `CachedSession` has no `staff` and no `headcount` — `/sync/bootstrap` does not send
   * them — so the meta row shows no coach and the card falls back to its own
   * "not saved on this device" line for counts, which is true. `headcount: 0` would have
   * drawn "0 חניכים" on a full class.
   */
  const fromCache = useCallback(async (): Promise<SessionRow[] | null> => {
    try {
      const rows = await cachedSessions(offlineStore())
      const forDay = rows.filter(
        (row) => row.kind !== 'event' && studioDayKey(row.starts_at) === day,
      )
      if (forDay.length === 0) return null
      return forDay.map((row) => ({
        id: row.id,
        group_id: row.group_id,
        group_name: row.group_name,
        training_year_id: '',
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        location_id: null,
        location_name: row.location_name,
        status: row.status,
        is_manually_edited: false,
        is_ad_hoc: false,
        cancel_reason: null,
        // Absent from the cache, and named absent rather than invented — see above.
        staff: [],
        attendance_taken: row.attendance_taken,
        headcount: 0,
      }))
    } catch {
      return null
    }
  }, [day])

  useEffect(() => {
    let live = true
    client
      .listSessions({
        from: day,
        to: day,
        coachPersonId: coachFilter || undefined,
      })
      .then((loaded) => {
        if (!live) return
        setSessions(loaded)
        setFromCacheNotice(false)
      })
      // S11 — the day's list used to reject unhandled and render as an empty day, which
      // is the one lie this screen must never tell: "no sessions" reads as a day off.
      // The cache is tried FIRST now, and only a cache that has nothing for this day falls
      // through to the failure screen.
      .catch(async () => {
        const cached = await fromCache()
        if (!live) return
        if (cached) {
          setSessions(cached)
          setFromCacheNotice(true)
        } else {
          setFailed(true)
        }
      })
    return () => {
      live = false
    }
  }, [client, coachFilter, day, attempt, fromCache])

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

  // Bug #20 — the second half of the same question, asked on exactly the same terms as the
  // training-year check above: only on an empty day, and a failure answers "no closure"
  // rather than inventing a holiday. `GET /closures` is `AnyStaff`, so a coach's own client
  // can already ask.
  useEffect(() => {
    if (onThisDay.length > 0) return
    let live = true
    client
      .listClosures()
      .then((closures) => live && setClosure(closureOn(closures, day)))
      .catch(() => live && setClosure(null))
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

  // §6.2 — the same cache, read the same way as the roster above, for the briefing TEXT
  // this session's marker and sheet both need (a boolean was enough while the marker was
  // decoration; it is a door now — see this file's own C5 header note). `GET /sessions`
  // (this screen's live fetch, `client.listSessions`) never carries `plan` at all — only
  // `build_bootstrap` fills it — so this has no live-fetch source to read from and is
  // cache-only exactly like the confirmation counts.
  useEffect(() => {
    let live = true
    const store = offlineStore()
    Promise.all(onThisDay.map((session) => readSession(store, session.id))).then((loaded) => {
      if (!live) return
      setPlans((current) => {
        const next = { ...current }
        onThisDay.forEach((session, index) => {
          next[session.id] = loaded[index]?.plan ?? null
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

  /** §6.2's marker-becomes-a-button pass — the sheet's own save, curried per session exactly
   *  like `chaseFamilies` above so `SessionBriefingControl` calls it with nothing but the
   *  body it collected. `attendanceClient` is optional for the same reason `eventsClient`/
   *  `peopleClient` are: a caller that has not wired one yet still gets a working marker
   *  that can READ the cached text (the sheet still opens), and refuses rather than
   *  pretending to succeed the one time it is asked to WRITE — the same rule
   *  `RosterScreen`'s own `onSave` already applies to a missing `addSessionNote`. */
  const saveBriefing = useCallback(
    (sessionId: string) => async (body: string): Promise<void> => {
      if (!attendanceClient?.addSessionNote) throw new Error('addSessionNote is not implemented')
      await attendanceClient.addSessionNote(sessionId, body, 'plan')
      // Mirrors `RosterScreen`'s own `setPlan(body)` — shown without a further fetch.
      setPlans((current) => ({ ...current, [sessionId]: body }))
    },
    [attendanceClient],
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
          {/* ONE calendar door (owner, 2026-09-07). There were two side by side, and a
              header that offers the same errand twice makes a coach choose between them
              before they can do it. The one that went was `open-date-picker` -> 9b, the
              older screen moved in here from `ScheduleSection`'s own header bar; this one
              is §4.7's month grid, and it is the better of the two on its own terms — it
              shows what is happening beyond tomorrow, which is the whole reason a coach
              opens a calendar.
              9b's extra half was a date RANGE, and losing it costs nothing: `ScheduleSection`
              kept `range.from` and threw the end away ("היום shows one day"), so the range
              picker was two inputs feeding one value the month grid supplies with a tap. */}
          <a
            href="#/calendar"
            data-testid="open-month-calendar"
            aria-label={t(locale, 'schedule.staffCalendar.openButton')}
            className="w-10 h-10 rounded-2xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shadow-xs border border-[var(--emphasis)] active:scale-95 transition-all shrink-0"
          >
            <CalendarDays className="w-5 h-5" aria-hidden="true" />
          </a>
          <button
            type="button"
            data-testid="back-to-today"
            disabled={day === todayKey}
            onClick={() => setDay(todayKey)}
            className="px-3.5 py-1 rounded-xl text-xs font-bold bg-[var(--emphasis-tint)] text-[var(--emphasis)] border border-[var(--emphasis)] active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {t(locale, 'schedule.today.title')}
          </button>
        </div>

        <div className="text-end">
          <h1 id="today-title" className="text-base font-black text-[var(--fg)] tracking-tight">
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
          <p data-testid="today-summary" className="text-xs font-semibold text-[var(--text-muted)] mt-0.5">
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
        aria-label={t(locale, 'schedule.today.dayStripLabel')}
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
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-md ring-2 ring-blue-600/30'
                  : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${selected ? 'text-blue-200' : 'text-[var(--text-muted)]'}`}
              >
                {t(locale, `schedule.weekday.${new Date(`${key}T12:00:00Z`).getUTCDay()}`)}
              </span>
              <span className="text-sm font-black font-mono">{key.slice(8)}</span>
              {isToday ? (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-[var(--surface-raised)]' : 'bg-[var(--emphasis)]'}`}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Two conditions, both owner-stated (2026-09-07), and each removes a control that
          could only ever do nothing:

          A COACH is already filtered to themselves — `coachFilter` defaults to their own
          person id above — so the only other setting is "somebody else's day", which is
          not theirs to read. §3.2 puts that at owner/manager.

          ONE COACH means the club has nobody to switch between, so the select would offer
          "all coaches" and the single coach: two labels for one identical list. That is
          true for a manager too, which is why it is `&&` and not an either/or. */}
      {viewerIsManager && coaches.length > 1 ? (
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
      ) : null}

      {/* Said out loud. A coach reading a cached list has to know it may be stale — the
          alternative is a screen that looks live and is not, which is worse than the
          "could not load" it replaces. */}
      {fromCacheNotice ? (
        <p
          role="status"
          data-testid="schedule-from-cache"
          className="rounded-2xl bg-[var(--pending-tint)] px-3 py-2 text-xs font-bold text-[var(--pending)]"
        >
          {t(locale, 'schedule.today.fromCache')}
        </p>
      ) : null}

      {/* Sessions decide the empty state — an event with no session on a day-off still
          means "nothing routine today", and `noTrainingYear` is a training-year concept
          events are not governed by. `timelineItems` decides whether the LIST renders,
          because an event on an otherwise-empty day is still something to show. */}
      {timelineItems.length === 0 ? (
        /* Three reasons a day can be empty, and they are not interchangeable. A missing
           training year is a setup gap only a manager can close, so it outranks the other
           two — a club with no year declared has no closures worth naming either. A closure
           names itself with the manager's own words, which is why the description is the
           reason verbatim and not a translated string (bug #20). */
        <EmptyState
          title={t(
            locale,
            noTrainingYear
              ? 'schedule.today.noTrainingYear'
              : closure
                ? 'schedule.closure.dayClosed'
                : 'schedule.today.empty',
          )}
          description={
            !noTrainingYear && closure
              ? closure.reason
              : t(
                  locale,
                  noTrainingYear ? 'schedule.today.noTrainingYearHint' : 'schedule.today.emptyHint',
                )
          }
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
              briefingText={item.kind === 'session' ? (plans[item.id] ?? null) : null}
              canWritePlan={canWritePlan}
              saveBriefing={saveBriefing}
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
  briefingText,
  canWritePlan,
  saveBriefing,
  chaseFamilies,
}: {
  item: TimelineItem
  state: DotState
  locale: Locale
  today: string
  roster: RosterRow[] | undefined
  briefingText: string | null
  canWritePlan: boolean
  saveBriefing: (sessionId: string) => (body: string) => Promise<void>
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
              briefingText={briefingText}
              canWritePlan={canWritePlan}
              saveBriefing={saveBriefing}
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
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--disabled-surface)] text-[var(--text-secondary)]"
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
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--danger-tint)] text-[var(--danger)] border border-[var(--danger)]"
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
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--paid-tint)] text-[var(--paid)] border border-[var(--paid)]"
      >
        <span className="w-2 h-2 rounded-full bg-[var(--paid)] animate-pulse" aria-hidden="true" />
        <span>{t(locale, 'schedule.session.state.activeNow')}</span>
      </span>
    )
  }
  if (state === 'nextUp') {
    return (
      <span
        data-testid="session-state"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--emphasis-tint)] text-[var(--emphasis)] border border-[var(--emphasis)]"
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
        className="bg-[var(--disabled-surface)] rounded-2xl p-3 border border-[var(--border)] mb-3"
        data-testid="session-progress"
      >
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {t(locale, 'schedule.session.rosterUnavailable')}
        </span>
      </div>
    )
  }
  const counts = confirmationCounts(roster)
  const percent = counts.total > 0 ? Math.round((counts.confirmed / counts.total) * 100) : 0
  return (
    <div
      className="bg-[var(--disabled-surface)] rounded-2xl p-3 border border-[var(--border)] mb-3"
      data-testid="session-progress"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[var(--text-secondary)]" data-testid="session-progress-count">
          {withMonoNumerals(
            t(locale, 'schedule.session.confirmedCount')
              .replace('{{confirmed}}', String(counts.confirmed))
              .replace('{{total}}', String(counts.total)),
          )}
        </span>
        <span className="text-xs font-black text-[var(--emphasis)] font-mono" data-testid="session-progress-percent">
          {t(locale, 'schedule.session.confirmedPercent').replace('{{percent}}', String(percent))}
        </span>
      </div>
      <div className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden mb-2">
        <div
          className="bg-[var(--emphasis)] h-2 rounded-full transition-all duration-500"
          style={{ inlineSize: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-[var(--paid)] flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--paid)]" aria-hidden="true" />
          <span className="font-mono">{counts.confirmed}</span>
          <span>{t(locale, 'schedule.session.progressConfirmedLabel')}</span>
        </span>
        <span className="text-[var(--danger)] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" aria-hidden="true" />
          <span className="font-mono">{counts.notAnswered}</span>
          <span>{t(locale, 'schedule.session.progressNotAnsweredLabel')}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * §6.2's marker, now a door rather than decoration (C5, 2026-09-07). Tapping it opens the
 * SAME `SessionPlanCard` the register uses (`../briefing`) inside a real dialog —
 * `useModalDialog` traps focus, closes on Escape, and (because it restores whatever had
 * focus at the moment `open` became true) returns focus to this very button on close, the
 * same contract `ContactFamiliesButton`'s panel already gives this app.
 *
 * Renders nothing when there is no briefing and the viewer cannot write one — the marker
 * has exactly two live states, "there is one, open it" and "there is none, and you may add
 * one"; a third (nothing to see, nothing to do) draws no control at all, matching decision
 * 16's rule on the register exactly. The caller already gates on this (`showBriefingControl`
 * in `SessionCard`, so the hints row's own `hasHints` agrees); the check is repeated here
 * so this component is correct on its own terms too, not only when called correctly.
 */
function SessionBriefingControl({
  locale,
  briefingText,
  canWrite,
  onSave,
}: {
  locale: Locale
  briefingText: string | null
  canWrite: boolean
  onSave: (body: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const dialogRef = useModalDialog(open, close)

  if (briefingText === null && !canWrite) return null

  const hasBriefing = briefingText !== null

  return (
    <>
      <button
        type="button"
        data-testid="session-briefing-marker"
        data-has-briefing={hasBriefing}
        // SC 4.1.2 — the accessible name says what tapping it DOES, and the two states
        // never share one: opening a briefing that exists is a different action from
        // adding one that doesn't, and a screen-reader user needs to hear which is on offer.
        aria-label={t(
          locale,
          hasBriefing ? 'schedule.session.openBriefing' : 'attendance.briefing.add',
        )}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 font-bold text-[var(--emphasis)]"
      >
        <ClipboardList className="w-3 h-3" aria-hidden="true" />
        {t(locale, hasBriefing ? 'schedule.session.hasBriefing' : 'attendance.briefing.add')}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-xs sm:items-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t(locale, 'attendance.briefing.title')}
            tabIndex={-1}
            data-testid="session-briefing-sheet"
            className="relative w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-2xl"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t(locale, 'common.a11y.close')}
              data-testid="session-briefing-close"
              className="absolute end-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
            <SessionPlanCard canWrite={canWrite} locale={locale} onSave={onSave} plan={briefingText} />
          </div>
        </div>
      ) : null}
    </>
  )
}

// Exported (§4.7, checkpoint C11) — see `TimelineDot`'s own note just above for why.
export function SessionCard({
  session,
  state,
  locale,
  today,
  roster,
  briefingText,
  canWritePlan,
  saveBriefing,
  chaseFamilies,
  onEdit,
}: {
  session: SessionRow
  state: DotState
  locale: Locale
  /** An ISO instant — `ends_at - today` is the active card's own "נותרו X דק'" badge. */
  today: string
  roster: RosterRow[] | undefined
  /** §6.2 — the cached briefing text, nullable; `null` means "none cached", never
   *  "loading" (see `TodayScreen`'s own `plans` effect). The whole text now, not a
   *  boolean — the marker became a door onto it (C5, 2026-09-07) and the sheet behind that
   *  door needs something to show. */
  briefingText: string | null
  /** `owner`/`manager`/`lead_coach` — the same trio `RosterScreen`'s own `canWritePlan`
   *  already gates decision 16 on. */
  canWritePlan: boolean
  /** Curried per session, exactly like `chaseFamilies` below: `SessionBriefingControl` gets
   *  nothing but the body it collected, never the session id. */
  saveBriefing: (sessionId: string) => (body: string) => Promise<void>
  chaseFamilies: (studentIds: string[]) => () => Promise<ContactFamily[]>
  /**
   * §4.7's edit sheet (checkpoint C11) — `undefined` on every call site in THIS file, so
   * the schedule tab renders exactly as it did before this prop existed. The month
   * calendar is the one caller that passes it, which is what turns this card from a
   * read-and-open-attendance surface into one a manager or lead coach can also act on
   * without a second card built to look the same (see this file's export note above).
   */
  onEdit?: () => void
}) {
  const counts = confirmationCounts(roster)
  const notAnsweredIds = (roster ?? [])
    .filter((row) => row.has_confirmation !== true && !row.has_absence_report)
    .map((row) => row.student_id)
  const coachLine = session.staff[0]
    ? session.staff[0].display_name
    : t(locale, 'schedule.session.noCoach')
  // §6.2 — "the control still appears, offering to add one" whenever the viewer may write
  // and there is none yet; "when there is none and you may not write, nothing is drawn."
  const showBriefingControl = briefingText !== null || canWritePlan
  const hasHints =
    session.attendance_taken ||
    session.staff[0]?.is_substitute ||
    (session.is_manually_edited && !session.is_ad_hoc) ||
    session.is_ad_hoc ||
    showBriefingControl

  // C3 — while a class is in progress, "45 דק׳" (its total length, unchanging) is less
  // useful than "נותרו 32 דק׳" (how much is left, which is the fact a coach checking the
  // screen mid-class actually wants). The absolute time range above it is untouched either
  // way, so nothing here is lost — only the redundant derived fact beneath it swaps for a
  // more useful one, and only for the one card where "remaining" means something.
  const remainingMinutes = Math.max(
    0,
    Math.round((Date.parse(session.ends_at) - Date.parse(today)) / 60_000),
  )

  // Owner fixes (2026-09-07): the card's primary action names the act it actually performs
  // rather than always reading "open attendance" — `timelineStates`' own `ended` category
  // (see its header) is recomputed here off the same two instants, because `pendingClose`
  // is not the only ended state (`later` also covers "ended and closed") and a cancelled
  // session never happened at all, however long ago its slot was. Neither fix touches the
  // schedule client, adds a status, or invents a "close" write — see this card's own note
  // above `open-roster` for why closing is, and stays, derived rather than a button's doing.
  const sessionHasEnded = session.status !== 'cancelled' && Date.parse(today) >= Date.parse(session.ends_at)

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
    <article className={`bg-[var(--surface-raised)] rounded-3xl p-4 ${CARD_FRAME[state]}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <SessionStateChip status={session.status} state={state} locale={locale} />
          {/* §4.7's edit sheet (checkpoint C11) — the ONLY caller passing `onEdit` is the
              month calendar; every schedule-tab card renders exactly as it did before this
              button existed. */}
          {onEdit ? (
            <button
              type="button"
              data-testid="session-edit-open"
              aria-label={t(locale, 'schedule.session.actions')}
              onClick={onEdit}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--disabled-surface)] text-[var(--text-muted)] transition-all hover:bg-[var(--border)] active:scale-95"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {/* 1d — `45 דק׳`, derived: two instants are already on the wire. */}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-bold font-mono text-[var(--text-muted)]">
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

      <strong className="block text-base font-black text-[var(--fg)] mb-1">{session.group_name}</strong>

      <div className="flex flex-col gap-1 mb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
          {session.location_name ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              <span>{session.location_name}</span>
            </span>
          ) : null}
          {session.location_name ? <span aria-hidden="true">•</span> : null}
          <span className="flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            <span>{coachLine}</span>
          </span>
        </div>
        {hasHints ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
            {/* 1d — "נוכחות נרשמה": the register-state marker, the difference between
                "done" and "still owed" at a glance down the day. A Tailwind badge of our
                own rather than `StatusChip status="paid"` — that token is money-scoped. */}
            {session.attendance_taken ? (
              <span className="inline-flex items-center gap-1 font-bold text-[var(--paid)]">
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
            {/* §6.2, C5 (2026-09-07) — the marker is a door now, not decoration: tapping it
                opens the SAME editor the register uses. The list itself still never renders
                the text — only the sheet does. See `SessionBriefingControl`'s own header for
                the dialog contract and why "no briefing, no write access" draws nothing. */}
            {showBriefingControl ? (
              <SessionBriefingControl
                locale={locale}
                briefingText={briefingText}
                canWrite={canWritePlan}
                onSave={saveBriefing(session.id)}
              />
            ) : null}
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
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
        <div className="flex items-center justify-end gap-2">
          {counts.total > 0 ? (
            <>
              <div className="text-end">
                {counts.notAnswered > 0 ? (
                  <span
                    data-testid="session-not-answered"
                    className="block font-extrabold text-[var(--danger)] text-xs"
                  >
                    {withMonoNumerals(plural(locale, 'schedule.session.notAnsweredCount', counts.notAnswered))}
                  </span>
                ) : null}
                <span
                  data-testid="session-confirmed"
                  className={
                    counts.notAnswered > 0
                      ? 'block text-[11px] text-[var(--text-muted)]'
                      : 'block font-extrabold text-[var(--paid)] text-xs'
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
                  counts.notAnswered > 0 ? 'bg-[var(--danger-tint)] text-[var(--danger)]' : 'bg-[var(--paid-tint)] text-[var(--paid)]'
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
            <span data-testid="session-roster-unavailable" className="text-xs font-semibold text-[var(--text-muted)]">
              {t(locale, 'schedule.session.rosterUnavailable')}
            </span>
          ) : (
            <>
              {/* 1d — `אולם א׳ · 14 חניכים`. */}
              <span data-testid="session-headcount" className="text-xs font-bold text-[var(--text-secondary)]">
                {withMonoNumerals(
                  `${session.location_name ? `${session.location_name} · ` : ''}${t(
                    locale,
                    'schedule.session.headcount',
                  ).replace('{{count}}', String(session.headcount))}`,
                )}
              </span>
              <div className="w-7 h-7 rounded-xl bg-[var(--disabled-surface)] text-[var(--text-muted)] flex items-center justify-center">
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
            {/* Owner fix (2026-09-07): `pendingClose` is a session already over with its
                register still owed — the prototype's own card names the act that closes it
                (`סגור אימון`), not "open attendance" again. Same link, same destination
                (closing a session IS taking its register, per this card's own note above),
                only the label and the accessible name it carries change; every other state
                keeps `schedule.today.openRoster` exactly as it read before this pass. */}
            <a href={`#/attendance/${session.id}`} data-testid="open-roster" className={ATTENDANCE_BUTTON_CLASS}>
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
              <span>
                {t(locale, state === 'pendingClose' ? 'schedule.today.closeSession' : 'schedule.today.openRoster')}
              </span>
            </a>
            {chaseButton}
          </div>
        ) : (
          // A cancelled session has no `openRoster` action, so this row names the
          // cancellation and its reason instead — the chase action still offers below it
          // when a cancelled session somehow still has families unanswered, unchanged from
          // before this pass.
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
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

        {/* Owner fix (2026-09-07): the write-up (`#/attendance/<id>/summary`) used to be
            reachable only from a footer button below the whole roster — nothing on the card
            itself pointed at it. A discreet tertiary link, never a third filled button
            beside the two-up grid above, and only once the class has actually happened:
            `sessionHasEnded` is false for `nextUp`/`activeNow` and for any cancelled
            session (a class that never happened has no write-up to reach), true for
            `pendingClose` and for the "ended and closed" sessions `timelineStates` files
            under the neutral `later` bucket. Any staff may write one (`POST
            /sessions/{id}/notes` is `AnyStaff`) — this is deliberately not `canWritePlan`
            gated, unlike the briefing marker above. */}
        {sessionHasEnded ? (
          <a
            href={`#/attendance/${session.id}/summary`}
            data-testid="session-summary-link"
            className="self-center text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          >
            {t(locale, 'attendance.summary.title')}
          </a>
        ) : null}
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
// Exported (§4.7, checkpoint C11) — see `TimelineDot`'s own note above for why.
export function EventCard({ event, state, locale }: { event: EventOut; state: DotState; locale: Locale }) {
  const total = event.rsvp_yes_count + event.rsvp_no_count + event.rsvp_pending_count
  return (
    <article className={`bg-[var(--surface-raised)] rounded-3xl p-4 ${CARD_FRAME[state]}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--pending-tint)] text-[var(--pending)] border border-[var(--pending)]">
          <Trophy className="w-3 h-3" aria-hidden="true" />
          <span>{t(locale, `events.type.${event.type}`)}</span>
        </span>
        <span className="text-xs font-bold font-mono text-[var(--text-muted)]" data-testid="event-when">
          {formatTimeInStudioZone(event.starts_at, locale)}
        </span>
      </div>

      <strong className="block text-base font-black text-[var(--fg)] mb-1">{event.title}</strong>

      {event.location_text ? (
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mb-3">
          <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <bdi>{event.location_text}</bdi>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
        <a
          href={`#/events/${event.id}/roster`}
          data-testid="open-event-roster"
          className="px-4 py-2 rounded-xl border border-[var(--pending)] text-[var(--pending)] font-bold text-xs hover:bg-[var(--pending-tint)] active:scale-95 transition-all inline-flex items-center gap-1"
        >
          <span>{t(locale, 'events.roster.title')}</span>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </a>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            {withMonoNumerals(
              total > 0
                ? `${t(locale, 'events.counts.confirmed')} ${event.rsvp_yes_count}/${total}`
                : t(locale, 'events.roster.empty'),
            )}
          </span>
          <div className="w-7 h-7 rounded-xl bg-[var(--pending-tint)] text-[var(--pending)] flex items-center justify-center">
            <Users className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  )
}
