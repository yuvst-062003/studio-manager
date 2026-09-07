// §4.7 of the staff app redesign — the month calendar, `#/calendar` (checkpoint C11).
//
// Decision 7: the phone gets a month view because it is the one screen that can show a
// coach their FUTURE sessions and events — neither the seven-day strip (`TodayScreen`,
// three days either side) nor the offline cache (today and tomorrow only) reach past
// tomorrow. That is this screen's whole reason to exist, and it shapes every choice below.
//
// **Read critically, per the brief: layout from the prototype, not behaviour.**
// `~/Downloads/staff-app/src/components/CalendarOverviewScreen.tsx` is the visual
// reference — the month grid, the day-count dots, the agenda beneath it — and nothing
// else. Three things in it do not survive the port:
//
//   1. **It invents its own sessions from the day of the week**, hardcoded Hebrew cards
//      keyed off `new Date(...).getDay()`, and ignores the `schedule` prop it is handed
//      entirely. This screen reads `GET /sessions?from&to` and `GET /events` instead —
//      the same two calls `TodayScreen` already makes, merged the same way `timeline.ts`
//      already merges them for one day, just called for the whole visible month.
//   2. **Two of its five filter chips filter nothing** (`week`, `weekend` — dead code that
//      highlights and does nothing) and a third (`team`) filters on a hardcoded `isTeam`
//      flag no real session carries. The real distinction underneath is which GROUP is
//      training, which every session already carries as `group_id`/`group_name`, so the
//      row here is a group filter with an "all" chip — the one chip from the prototype
//      that actually meant something, generalised to every group rather than one hardcoded
//      squad.
//   3. **Its session ids are invented** (`` `cal-${dateKey}-1` ``) and match nothing a real
//      attendance screen could open. Not relevant here, because decisions 8/9 do not open
//      attendance from this screen at all — tapping a session opens the edit sheet below.
//
// **The card anatomy is not reinvented.** `TimelineDot`, `SessionCard` and `EventCard` are
// `TodayScreen`'s own — exported from there for exactly this reuse, per that file's own
// note beside each export. The agenda below calls `mergeTimeline`/`timelineStates` from
// `./timeline`, the same functions `TodayScreen` calls for one day, just supplied this
// screen's SELECTED day instead of `today`. A second, look-alike card built here would be
// the "two editors for one field" failure `SessionPlanCard`'s own header already names —
// two cards that start identical and drift the next time either screen changes.
//
// One deliberate simplification from that reuse: every card here renders with
// `roster={undefined}`. The offline cache holds only today and tomorrow (§6.1), so a roster
// read here would be honest for at most two of a month's thirty-odd days and "not saved on
// this device" for the rest — a screen whose entire purpose is looking BEYOND the cache has
// no business reading it for two special-cased days and not the others. `SessionCard`
// already has an honest fallback for "no roster" (`schedule.session.rosterUnavailable`) and
// renders it uniformly here, which is the correct trade for a screen this forward-looking.
//
// **The briefing was in that paragraph and should not have been (2026-09-07).** It shipped
// as `briefingText={null}` and `canWritePlan={false}` for the same cache reason, and the
// result was that the one screen a senior coach uses to plan NEXT week could not write the
// briefing for it — the same session offered an editor from the schedule tab and refused
// one here, which is two doors giving two answers about one permission. The cache argument
// does not carry: unlike a roster, a briefing is a single string per session, `GET
// /sessions/{id}/notes?kind=plan` is `AnyStaff`, and this screen is already a network
// screen that says so. So the day's plans are FETCHED for the handful of sessions actually
// on the selected day — not the month, which would be thirty pointless requests — and the
// marker is then accurate rather than absent.
//
// **Editing (decisions 8, 9).** Tapping a session's own edit button opens `SessionEditSheet`
// below, offering change-coach, cancel and move — the SAME sheet for every role, per
// decision 8: "an assistant_coach gets the same sheet, read-only." That is not a new
// permission rule invented for this screen. `PATCH /sessions/{id}` and
// `POST /sessions/{id}/cancel` are already `owner`/`manager`/`lead_coach` server-side
// (`app/routers/sessions.py::ManagerOrLeadCoach`) — the exact trio `canEdit` below is
// computed from in `App.tsx` (the same `viewerCanWritePlan` §6.2 already uses, because it
// is the identical question asked twice) — so the sheet asks the same question the
// endpoint already asks rather than inventing a second gate beside it that could drift.
//
// **Moving is a form, not a drag.** D13 recorded why for the dashboard's own week board —
// HTML5 drag-and-drop does not fire on touch and is unusable with a screen reader — and it
// holds at least as strongly on a phone. `SessionEditSheet`'s move section is a date input
// and two time inputs, exactly like the dashboard's own `SessionPopover`, converted with
// `studioWallTimeToUtc` rather than a fixed offset (Jerusalem observes daylight time).
//
// **Honest about offline.** No proactive network probe before the fetch — every other
// screen here (`StudentsSearch`, `TodayScreen`) tries the read and
// lets a failure resolve through `LoadFailed`'s own `offline` flag, and this screen follows
// the same house rule rather than inventing a second one. The point made in §4.7 — "a
// month view is a network screen, and it says so when there is no signal rather than
// rendering an empty month" — is about NOT attempting a two-day-cache-shaped fallback that
// would show 28 empty days looking like 28 confirmed days off. `LoadFailed`'s existing
// `common.loadFailed.offline` copy already says exactly the honest thing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Shield,
  X,
} from 'lucide-react'
import { EmptyState, LoadFailed, useModalDialog } from '@studio/ui'
import {
  formatDateInStudioZone,
  formatDayHeadline,
  formatMonthLabel,
  formatTimeInStudioZone,
  studioDayKey,
  studioWallTimeToUtc,
  useNetworkMode,
} from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { monthBounds, monthGrid } from './monthGrid'
import { EventCard, SessionCard, TimelineDot } from './TodayScreen'
import type { Fetcher, SessionRow, StaffScheduleClient } from './client'
import { mergeTimeline, timelineStates } from './timeline'
import type { EventOut, StaffEventsClient } from '../events/client'
import type { CoachConstraintRow, CoachConstraintsClient } from '../constraints'
import type { StaffAttendanceClient } from '../attendance/client'

const pad = (value: number): string => String(value).padStart(2, '0')

const DAY_MS = 86_400_000

/** Mirrors `CoachConstraintsScreen.tsx`'s own noon-anchored shift, duplicated rather than
 *  imported: that file sits under `features/constraints/`, which this checkpoint may only
 *  import from, and two four-line date-arithmetic helpers are a smaller coupling than a
 *  cross-feature export neither screen otherwise needs. */
function shiftDayKey(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS))
}

/**
 * Every calendar day a filed constraint covers, inclusive.
 *
 * **All-day's `ends_at` is midnight of the day AFTER the last covered day** — the same
 * exclusive boundary `CoachConstraintsScreen`'s own submit writes — so an all-day window is
 * walked back one day before enumerating, or a single all-day request would mark a phantom
 * extra day on the grid.
 */
function constraintDayKeys(row: CoachConstraintRow): string[] {
  const startKey = studioDayKey(row.starts_at)
  const endKey = row.all_day
    ? shiftDayKey(studioDayKey(row.ends_at), -1)
    : studioDayKey(row.ends_at)
  const keys: string[] = []
  for (let key = startKey; key <= endKey; key = shiftDayKey(key, 1)) keys.push(key)
  return keys
}

/** The Jerusalem wall-clock `HH:mm` of an instant, for prefilling the move form — the same
 *  helper `apps/dashboard/src/features/schedule/SessionPopover.tsx` carries under the same
 *  name, duplicated for the reason `./client.ts`'s own header gives for the types beside
 *  it: a cross-app import would couple two separately deployed bundles. */
function wallTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** The subset of `StaffMemberOut` the coach picker needs — mirrors the dashboard's own
 *  `SessionPopover.tsx::StaffMember`, same reasoning as `wallTime` above. */
type StaffOption = { person_id: string | null; first_name: string | null; last_name: string | null }

const chipClass = (active: boolean): string =>
  `px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 active:scale-95 ${
    active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`

/**
 * The edit sheet decisions 8/9 describe: change the coach, cancel it, move it — **the same
 * sheet for every role**, `useModalDialog` throughout (the contract `ContactFamiliesButton`
 * and the briefing sheet already give this app: focus trapped, Escape closes, focus returns
 * to whatever opened it on close).
 *
 * `canEdit` is not a second permission rule. It is `viewerCanWritePlan` from `App.tsx`,
 * the exact `owner`/`manager`/`lead_coach` trio `PATCH /sessions`/`POST .../cancel` already
 * admit — passed in rather than re-derived, so there is exactly one place this question is
 * answered. An `assistant_coach` still reaches this component; it simply renders none of
 * the controls below the coach line, per decision 8's "read-only".
 */
function SessionEditSheet({
  locale,
  session,
  client,
  fetcher,
  canEdit,
  onClose,
  onChanged,
}: {
  locale: Locale
  session: SessionRow
  client: StaffScheduleClient
  fetcher: Fetcher
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [day, setDay] = useState(() => studioDayKey(session.starts_at))
  const [startTime, setStartTime] = useState(() => wallTime(session.starts_at))
  const [endTime, setEndTime] = useState(() => wallTime(session.ends_at))
  const [cancelReason, setCancelReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Best-effort, exactly like the dashboard's own `SessionPopover`: `GET /staff` is
    // `ManagerOrOwner`, not `lead_coach`, so a lead coach's 403 here simply leaves the
    // coach picker unrendered rather than failing the whole sheet — the same asymmetry
    // that already exists on the dashboard between who may PATCH a session and who may
    // list the staff to reassign it to. Nothing invented for this screen; the same gap.
    if (!canEdit) return
    let live = true
    fetcher('/api/v1/staff')
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: StaffOption[] }).items : [],
      )
      .then((rows) => live && setStaff(rows.filter((row) => row.person_id !== null)))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [canEdit, fetcher])

  const act = useCallback(
    (work: Promise<SessionRow>) => {
      setFailed(false)
      setBusy(true)
      work
        .then(() => {
          setBusy(false)
          onChanged()
        })
        .catch(() => {
          setBusy(false)
          setFailed(true)
        })
    },
    [onChanged],
  )

  const currentCoach = session.staff[0]?.display_name ?? t(locale, 'schedule.session.noCoach')
  const sheetLabel = `${session.group_name} · ${formatTimeInStudioZone(session.starts_at, locale)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-xs sm:items-center"
      data-testid="session-edit-backdrop"
      onClick={onClose}
    >
      <div
        aria-label={sheetLabel}
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl"
        data-testid="session-edit-sheet"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label={t(locale, 'common.a11y.close')}
          className="absolute end-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700"
          data-testid="session-edit-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        <div>
          <h2 className="text-base font-black text-slate-900">{t(locale, 'schedule.session.actions')}</h2>
          <p className="text-xs text-slate-500">
            <bdi>{session.group_name}</bdi> · {formatDateInStudioZone(session.starts_at, locale)} ·{' '}
            {formatTimeInStudioZone(session.starts_at, locale)}–
            {formatTimeInStudioZone(session.ends_at, locale)}
          </p>
        </div>

        {!canEdit ? (
          <p
            className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500"
            data-testid="session-edit-readonly-note"
          >
            {t(locale, 'schedule.session.editRestricted')}
          </p>
        ) : null}

        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-700">{t(locale, 'schedule.session.coach')}</span>
          {canEdit && staff.length > 0 ? (
            <select
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900"
              data-testid="edit-coach-select"
              onChange={(event) => {
                if (event.target.value === '') return
                act(
                  client.patchSession(session.id, {
                    staff: [{ person_id: event.target.value, role: 'lead_coach', is_substitute: true }],
                  }),
                )
              }}
              value={session.staff[0]?.person_id ?? ''}
            >
              <option value="">{t(locale, 'schedule.session.noCoach')}</option>
              {staff.map((option) => (
                <option key={option.person_id} value={option.person_id ?? ''}>
                  {`${option.first_name ?? ''} ${option.last_name ?? ''}`.trim()}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-bold text-slate-900" data-testid="session-edit-coach-display">
              <bdi>{currentCoach}</bdi>
            </p>
          )}
        </section>

        {session.status === 'cancelled' ? (
          <p className="text-xs font-semibold text-slate-500">{t(locale, 'schedule.session.cancelled')}</p>
        ) : canEdit ? (
          <>
            <section className="flex flex-col gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-700">{t(locale, 'schedule.session.editTime')}</span>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500">
                    {t(locale, 'schedule.session.adHocDate')}
                  </span>
                  <input
                    className="h-10 rounded-lg border border-slate-200 px-2 text-xs font-mono font-bold"
                    data-testid="edit-move-date"
                    onChange={(event) => setDay(event.target.value)}
                    type="date"
                    value={day}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500">
                    {t(locale, 'schedule.session.adHocStart')}
                  </span>
                  <input
                    className="h-10 rounded-lg border border-slate-200 px-2 text-xs font-mono font-bold"
                    data-testid="edit-move-start"
                    onChange={(event) => setStartTime(event.target.value)}
                    type="time"
                    value={startTime}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-500">
                    {t(locale, 'schedule.session.adHocEnd')}
                  </span>
                  <input
                    className="h-10 rounded-lg border border-slate-200 px-2 text-xs font-mono font-bold"
                    data-testid="edit-move-end"
                    onChange={(event) => setEndTime(event.target.value)}
                    type="time"
                    value={endTime}
                  />
                </label>
              </div>
              <button
                className="h-10 rounded-xl bg-blue-600 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                data-testid="edit-move-submit"
                disabled={busy}
                onClick={() =>
                  act(
                    client.patchSession(session.id, {
                      starts_at: studioWallTimeToUtc(day, startTime),
                      ends_at: studioWallTimeToUtc(day, endTime),
                    }),
                  )
                }
                type="button"
              >
                {t(locale, 'schedule.session.save')}
              </button>
            </section>

            <section className="flex flex-col gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-rose-700">{t(locale, 'schedule.session.cancel')}</span>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500">
                  {t(locale, 'schedule.session.cancelReason')}
                </span>
                <input
                  className="h-10 rounded-lg border border-slate-200 px-2.5 text-xs"
                  data-testid="edit-cancel-reason"
                  onChange={(event) => setCancelReason(event.target.value)}
                  type="text"
                  value={cancelReason}
                />
              </label>
              <button
                className="h-10 rounded-xl bg-rose-600 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                data-testid="edit-cancel-submit"
                disabled={busy || cancelReason.trim() === ''}
                onClick={() => act(client.cancelSession(session.id, cancelReason.trim()))}
                type="button"
              >
                {t(locale, 'schedule.session.cancel')}
              </button>
            </section>
          </>
        ) : null}

        {failed ? (
          <p className="text-xs font-bold text-rose-600" data-testid="session-edit-failed" role="alert">
            {t(locale, 'common.loadFailed.body')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function CalendarScreen({
  locale,
  client,
  eventsClient,
  constraintsClient,
  fetcher,
  today,
  canEdit,
  attendanceClient,
}: {
  locale: Locale
  client: StaffScheduleClient
  /** §4.1's merge, called here for a whole month instead of one day. Optional for the same
   *  reason `TodayScreen`'s own prop of the same name is: a caller with no events client
   *  wired yet still gets a working grid, just with no events merged in. */
  eventsClient?: StaffEventsClient
  /** `GET /coach-constraints?mine=true` — every staff role may call this (§6.1), so it is
   *  required rather than optional: the constraint marker is not an enhancement bolted onto
   *  an existing screen, it is one of the two things this grid draws besides a session
   *  count. */
  constraintsClient: CoachConstraintsClient
  /** Raw fetch, for the edit sheet's best-effort `/api/v1/staff` read — the same shape
   *  `apiFetch` already has everywhere else in this app. */
  fetcher: Fetcher
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
  /** `owner`/`manager`/`lead_coach` — decision 8, computed once in `App.tsx` from the same
   *  membership `viewerCanWritePlan` already reads, not re-derived here. */
  canEdit: boolean
  /** §6.2's briefing, read and written. Optional like `eventsClient`: a caller without one
   *  gets a working grid whose cards simply carry no briefing marker, never a marker that
   *  opens an editor with nothing behind it. */
  attendanceClient?: Pick<StaffAttendanceClient, 'addSessionNote' | 'sessionPlan'>
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)))
  const [selectedDay, setSelectedDay] = useState(todayKey)
  const [groupFilter, setGroupFilter] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [events, setEvents] = useState<EventOut[]>([])
  const [constraints, setConstraints] = useState<CoachConstraintRow[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null)
  /** §6.2 — the selected day's briefings, by session id. `undefined` for a session whose
   *  plan has not been read yet (the marker stays quiet), `null` once read and empty. */
  const [plans, setPlans] = useState<Record<string, string | null | undefined>>({})
  // S11 — a failed read distinguishes offline from broken (S5's network state), the same
  // rule `StudentsSearch`/`TodayScreen` already follow.
  const networkMode = useNetworkMode()

  const bounds = useMemo(() => monthBounds(year, month), [year, month])
  const cells = useMemo(() => monthGrid(year, month), [year, month])

  const changeMonth = useCallback(
    (nextYear: number, nextMonth: number) => {
      setYear(nextYear)
      setMonth(nextMonth)
      const isCurrentMonth =
        nextYear === Number(todayKey.slice(0, 4)) && nextMonth === Number(todayKey.slice(5, 7))
      setSelectedDay(isCurrentMonth ? todayKey : `${nextYear}-${pad(nextMonth)}-01`)
    },
    [todayKey],
  )

  const step = useCallback(
    (delta: number) => {
      let nextMonth = month + delta
      let nextYear = year
      if (nextMonth < 1) {
        nextMonth = 12
        nextYear -= 1
      } else if (nextMonth > 12) {
        nextMonth = 1
        nextYear += 1
      }
      changeMonth(nextYear, nextMonth)
    },
    [changeMonth, month, year],
  )

  const jumpToToday = useCallback(() => {
    changeMonth(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)))
  }, [changeMonth, todayKey])

  useEffect(() => {
    let live = true
    client
      .listSessions({ from: bounds.from, to: bounds.to })
      .then((rows) => live && setSessions(rows))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [bounds.from, bounds.to, client, attempt])

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

  useEffect(() => {
    let live = true
    constraintsClient
      .listMine()
      .then((rows) => live && setConstraints(rows))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [constraintsClient])

  const groups = useMemo(() => {
    const byId = new Map<string, string>()
    for (const session of sessions) {
      if (!byId.has(session.group_id)) byId.set(session.group_id, session.group_name)
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [sessions])

  const filteredSessions = useMemo(
    () => (groupFilter ? sessions.filter((session) => session.group_id === groupFilter) : sessions),
    [sessions, groupFilter],
  )

  // §4.7 — a count of sessions AND events, per day. Cancelled sessions still count: the
  // schedule tab's own day summary (`schedule.today.sessionCount`) counts them too, and a
  // day is not "empty" just because what was on it got cancelled.
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const session of filteredSessions) {
      const key = studioDayKey(session.starts_at)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    for (const event of events) {
      const key = studioDayKey(event.starts_at)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [events, filteredSessions])

  // §4.7 / §6.1 — a marker on a day the signed-in coach has an approved OR pending
  // constraint (a refused or withdrawn one is not a live unavailability and marks nothing).
  const constraintByDay = useMemo(() => {
    const map = new Map<string, CoachConstraintRow>()
    for (const row of constraints) {
      if (row.status !== 'pending' && row.status !== 'approved') continue
      for (const key of constraintDayKeys(row)) {
        if (!map.has(key)) map.set(key, row)
      }
    }
    return map
  }, [constraints])

  const dayItems = useMemo(
    () => mergeTimeline(filteredSessions, events, selectedDay),
    [events, filteredSessions, selectedDay],
  )
  const dayStates = useMemo(() => timelineStates(dayItems, today), [dayItems, today])

  // The selected day's briefings, one request per session actually on that day — a handful,
  // never the month. Best-effort by design: a plan that fails to load leaves its marker off
  // rather than failing the whole grid, because the agenda underneath it is still correct
  // and a briefing is not what a coach opened a calendar to see.
  const sessionIdsOnDay = useMemo(
    () =>
      dayItems
        .filter((item) => item.kind === 'session')
        .map((item) => item.id)
        .join(','),
    [dayItems],
  )
  useEffect(() => {
    const readPlan = attendanceClient?.sessionPlan
    if (!readPlan || !sessionIdsOnDay) return undefined
    let live = true
    for (const sessionId of sessionIdsOnDay.split(',')) {
      void readPlan(sessionId)
        .then((plan) => {
          if (live) setPlans((current) => ({ ...current, [sessionId]: plan }))
        })
        .catch(() => undefined)
    }
    return () => {
      live = false
    }
    // Keyed on the joined ids rather than the array: `dayItems` is a fresh array on every
    // render, and depending on it directly would re-fetch every plan on every keystroke in
    // the group filter.
  }, [attendanceClient, sessionIdsOnDay])

  /** Mirrors `TodayScreen`'s own `saveBriefing` exactly, including the optimistic write —
   *  the sheet must show what was just typed without a second round trip. */
  const saveBriefing = useCallback(
    (sessionId: string) => async (body: string): Promise<void> => {
      if (!attendanceClient?.addSessionNote) throw new Error('addSessionNote is not implemented')
      await attendanceClient.addSessionNote(sessionId, body, 'plan')
      setPlans((current) => ({ ...current, [sessionId]: body }))
    },
    [attendanceClient],
  )

  const closeEdit = useCallback(() => setEditingSession(null), [])
  const onEditChanged = useCallback(() => {
    setEditingSession(null)
    // A patched/cancelled session may have moved to a different day, or even a different
    // month — a full re-fetch is what keeps the grid and the agenda honest either way,
    // rather than trying to patch one row into local state and getting a cross-month move
    // wrong.
    setAttempt((n) => n + 1)
  }, [])

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
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8" data-testid="staff-calendar">
      <header className="flex items-center justify-between">
        <a
          className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 active:scale-95"
          href="#/schedule"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-500" />
          <span>{t(locale, 'schedule.staffCalendar.back')}</span>
        </a>
        <div className="flex items-center gap-2">
          {/* A month view is exactly when a coach notices they cannot make a date — the
              prototype's own header puts this beside its "today" control, tinted rose so it
              never reads as another neutral nav action. `#/constraints` already has one link
              (the account tab's); `routes.reachable.test.ts` allows a route more than one. */}
          <a
            className="flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 shadow-xs transition-all hover:bg-rose-100 active:scale-95"
            data-testid="calendar-file-constraint"
            href="#/constraints"
          >
            <Shield aria-hidden="true" className="h-3.5 w-3.5 text-rose-600" />
            <span>{t(locale, 'schedule.staffCalendar.fileConstraint')}</span>
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 shadow-xs">
            <CalendarIcon aria-hidden="true" className="h-4 w-4" />
          </div>
        </div>
      </header>

      <div>
        <h1 className="text-xl font-black tracking-tight text-slate-900">
          {t(locale, 'schedule.staffCalendar.title')}
        </h1>
        <p className="mt-1 text-xs text-slate-500">{t(locale, 'schedule.staffCalendar.subtitle')}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-slate-900">{formatMonthLabel(year, month, locale)}</span>
          <div className="flex items-center gap-1.5">
            <button
              aria-label={t(locale, 'schedule.week.view.previousMonth')}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-all hover:bg-slate-200 active:scale-95"
              data-testid="calendar-prev-month"
              onClick={() => step(-1)}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-all hover:bg-blue-100 active:scale-95"
              data-testid="calendar-jump-today"
              onClick={jumpToToday}
              type="button"
            >
              {t(locale, 'schedule.staffCalendar.jumpToToday')}
            </button>
            <button
              aria-label={t(locale, 'schedule.week.view.nextMonth')}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-all hover:bg-slate-200 active:scale-95"
              data-testid="calendar-next-month"
              onClick={() => step(1)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {groups.length > 0 ? (
          <div
            aria-label={t(locale, 'schedule.staffCalendar.filterLegend')}
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
            role="group"
          >
            <button
              aria-pressed={groupFilter === ''}
              className={chipClass(groupFilter === '')}
              data-testid="calendar-filter-all"
              onClick={() => setGroupFilter('')}
              type="button"
            >
              {t(locale, 'schedule.week.filter.all')}
            </button>
            {groups.map((group) => (
              <button
                aria-pressed={groupFilter === group.id}
                className={chipClass(groupFilter === group.id)}
                data-testid={`calendar-filter-${group.id}`}
                key={group.id}
                onClick={() => setGroupFilter(group.id)}
                type="button"
              >
                <bdi>{group.name}</bdi>
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-7 gap-1 text-center" role="row">
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <div className="py-1 text-[11px] font-bold text-slate-500" key={weekday} role="columnheader">
              {t(locale, `schedule.weekday.${weekday}`)}
            </div>
          ))}
        </div>

        <div aria-label={t(locale, 'schedule.view.month')} className="grid grid-cols-7 gap-1" role="grid">
          {cells.map((cell, index) =>
            cell === '' ? (
              <div aria-hidden="true" className="h-12" key={`pad-${index}`} />
            ) : (
              <DayCell
                constraintReason={constraintByDay.get(cell)?.reason ?? null}
                count={countsByDay.get(cell) ?? 0}
                isSelected={selectedDay === cell}
                isToday={cell === todayKey}
                dayKey={cell}
                key={cell}
                locale={locale}
                onSelect={setSelectedDay}
              />
            ),
          )}
        </div>

        {/* The key to the two markers `DayCell` actually draws (a count badge, a
            constraint dot) plus the today ring — ported from the prototype's own
            closing row, but describing THIS build's markers rather than its list.
            Not decoration: a screen reader reads each swatch's own label beside it
            (SC 1.4.1), and every swatch here reaches 3:1 against this white card,
            the label text 4.5:1 — checked, not assumed (`blue-100`/`blue-50` as a
            MEANINGFUL fill both failed that check and are decorative-only above). */}
        <div
          aria-label={t(locale, 'schedule.staffCalendar.legend.label')}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[10px] text-slate-500"
          data-testid="calendar-legend"
          role="group"
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-500" />
            <span>{t(locale, 'schedule.staffCalendar.legend.count')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rose-500" />
            <span>{t(locale, 'schedule.staffCalendar.legend.constraint')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-50 ring-2 ring-blue-500" />
            <span>{t(locale, 'schedule.today.title')}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="calendar-agenda-title" className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black text-slate-900" id="calendar-agenda-title">
            {formatDayHeadline(selectedDay, locale)}
          </h2>
          <span className="text-xs font-semibold text-slate-500" data-testid="calendar-agenda-count">
            {dayItems.length > 0
              ? plural(locale, 'schedule.staffCalendar.dayItemCount', dayItems.length)
              : t(locale, 'schedule.staffCalendar.dayEmpty')}
          </span>
        </div>

        {dayItems.length === 0 ? (
          <EmptyState
            description={t(locale, 'schedule.today.emptyHint')}
            title={t(locale, 'schedule.staffCalendar.dayEmpty')}
          />
        ) : (
          <ul className="flex flex-col gap-3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {dayItems.map((item, index) => (
              <li
                data-testid={item.kind === 'session' ? 'calendar-session-row' : 'calendar-event-row'}
                key={item.id}
              >
                <div className="flex items-start gap-3">
                  <TimelineDot
                    locale={locale}
                    state={dayStates[index]!}
                    time={formatTimeInStudioZone(item.startsAt, locale)}
                  />
                  <div className="min-w-0 flex-1">
                    {item.kind === 'session' ? (
                      <SessionCard
                        briefingText={plans[item.id] ?? null}
                        canWritePlan={canEdit && attendanceClient?.addSessionNote !== undefined}
                        chaseFamilies={() => async () => []}
                        locale={locale}
                        onEdit={() => setEditingSession(item.session)}
                        roster={undefined}
                        saveBriefing={saveBriefing}
                        session={item.session}
                        state={dayStates[index]!}
                        today={today}
                      />
                    ) : (
                      <EventCard event={item.event} locale={locale} state={dayStates[index]!} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editingSession ? (
        <SessionEditSheet
          canEdit={canEdit}
          client={client}
          fetcher={fetcher}
          locale={locale}
          onChanged={onEditChanged}
          onClose={closeEdit}
          session={editingSession}
        />
      ) : null}
    </div>
  )
}

/** A day's own grid button — a real `<button>`, so tab order is a plain document order and
 *  no roving-tabindex machinery is needed (the brief: "a day is a button; arrow keys are
 *  not required but tab order must be sane"). Colour never carries meaning alone (SC
 *  1.4.1): a constraint day's rose dot is decorative, and `dayConstraint` is folded into
 *  the SAME `aria-label` as the count, so a screen reader hears both facts a sighted coach
 *  sees from the dot and the badge. */
function DayCell({
  dayKey,
  locale,
  isToday,
  isSelected,
  count,
  constraintReason,
  onSelect,
}: {
  dayKey: string
  locale: Locale
  isToday: boolean
  isSelected: boolean
  count: number
  constraintReason: string | null
  onSelect: (dayKey: string) => void
}) {
  const dateLabel = formatDateInStudioZone(`${dayKey}T12:00:00Z`, locale)
  const countLabel =
    count > 0
      ? plural(locale, 'schedule.staffCalendar.dayItemCount', count)
      : t(locale, 'schedule.staffCalendar.dayEmpty')
  const constraintLabel = constraintReason
    ? ` · ${t(locale, 'schedule.staffCalendar.dayConstraint').replace(
        '{{reason}}',
        t(locale, `schedule.constraint.reason.${constraintReason}`),
      )}`
    : ''

  return (
    <button
      aria-current={isSelected ? 'date' : undefined}
      aria-label={`${dateLabel} · ${countLabel}${constraintLabel}`}
      className={`relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
        isSelected
          ? 'bg-[#1e3a8a] text-white shadow-md'
          : isToday
            ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-500'
            : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
      }`}
      data-testid={`calendar-day-${dayKey}`}
      onClick={() => onSelect(dayKey)}
      type="button"
    >
      <span className="font-mono">{Number(dayKey.slice(8))}</span>
      <span aria-hidden="true" className="flex items-center gap-1">
        {constraintReason ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
        {count > 0 ? (
          <span
            className={`rounded-sm px-1 text-[9px] font-black ${
              isSelected ? 'bg-white/20 text-blue-100' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {count}
          </span>
        ) : null}
      </span>
    </button>
  )
}
