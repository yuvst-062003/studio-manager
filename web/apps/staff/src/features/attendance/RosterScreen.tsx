// Staff artboards `1c` (נוכחות בשיעור) and `9f` (נוכחות) — the screen a coach uses on the
// mat, and the reason the offline queue exists.
//
// `9f` is the later iteration of `1c` and **lost** `1c`'s offline, sync and staleness
// indicators (`9f` finding 2). This screen is the merge the specs ask for: `9f`'s
// advance-notice hint row and its footer helper line, on top of `1c`'s three network
// affordances, which the screen a coach uses in a basement cannot ship without.
//
// Two findings are corrected here rather than carried:
//
//   * `9f` finding 1 — the bulk button as drawn overwrites every parent's advance notice,
//     directly under a hint row announcing those notices. The button's own copy now says
//     what the server actually does.
//   * `1c` finding 4 — the sync badge's copy counts *sessions* while its key counts *marks*.
//     `attendance.sync.pendingCount` interpolates marks, so the badge counts marks.
//
// **C3 (2026-09-06) restyled this screen onto the redesign's prototype**
// (`~/Downloads/staff-app/src/components/AttendanceModal.tsx`), taking its row anatomy,
// its quick actions and its counter — never its sheet chrome, because a register on a mat
// is a full screen here, not a bottom sheet a coach can swipe away mid-lesson. This is the
// OFFLINE-CRITICAL screen and its machinery does not move: `queueMark`, the stale-queue
// block, `readRoster`/`readSession`'s cache-first read and the bulk predicate below are
// untouched by this pass — every edit past this note is markup, class names and one new
// header element (the live present/total counter `9f` never draws but the prototype does).
//
// The prototype's quick-action strip draws a PAIR — "סמן כולם" and "אפס" (mark all /
// reset). Only the first has an endpoint: `bulkPresent` below calls the real
// `attendance.bulk` op, which is why it exists at all rather than a client-side loop (it
// also has to skip a parent's advance notice, which a loop over `onCycle` could not do
// atomically with the server). A "reset" that marked everyone absent has nothing behind
// it — no bulk-absent op, no `PendingOpKind` for one — so it is not drawn. Half a pair,
// deliberately, rather than a button whose tap would silently do nothing.
import { CheckCheck, ChevronRight, Search, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert } from '@studio/ui'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import {
  apiFetch,
  formatTimeInStudioZone,
  offlineStorageIsDurable,
  offlineStore,
  queueMark,
  readRoster,
  readSession,
  usePendingCount,
  useStaleQueueWarning,
  studioDayKey,
} from '@studio/core'
import type { RosterRow as RosterRowData } from '@studio/core'
import { SessionPlanCard } from '../briefing'
import { RosterRow } from './RosterRow'
import type { StaffAttendanceClient } from './client'
import { AddToSessionSheet } from './AddToSessionSheet'
import { SessionSummarySheet } from './SessionSummarySheet'
import type { StaffPeopleClient } from '../people'

/**
 * Isolates digit runs (and the `/` between two of them, so a "3/12" counter reads as one
 * mono block rather than two) into their own `font-mono` span, leaving the rest of an
 * already-translated string untouched. `TodayScreen.tsx` carries the same shape for the
 * identical reason and is not imported from here — that file is out of scope for this
 * lane, and splitting/rejoining a string changes none of its characters, so duplicating
 * ~10 lines is cheaper than a cross-lane import for one helper.
 */
function withMonoNumerals(text: string): ReactNode {
  const parts = text.split(/(\d+(?:\/\d+)?)/g)
  return parts.map((part, index) =>
    /^\d/.test(part) ? (
      <span className="font-mono" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/** §5.7's roster is split in two: the students expected today, and
 *  `לא אמורים להגיע היום` beneath them. The second is collapsed and still markable —
 *  "a child who turns up on an extra day is a real child". */
type Split = { expected: RosterRowData[]; notExpected: RosterRowData[] }

/** A register shorter than this scrolls to nothing, so a search field over it would be
 *  furniture. Base groups here run 12-16; the squad sessions are the long ones. */
const FILTER_FROM = 10

export function RosterScreen({
  sessionId,
  locale,
  client,
  clock = () => new Date().toISOString(),
  personId,
  /** C12 — which students are expected. The server sends the roster already ordered and the
   *  bootstrap payload does not carry `expected` per row, so the screen is told which ids
   *  are in the collapsed section rather than deriving a weekday rule of its own. */
  notExpectedIds = [],
  /** §6.2 — `owner` / `manager` / `lead_coach`, the same trio the server's
   *  `ManagerOrLeadCoach` checks. An assistant coach (the default, `false`) sees the
   *  briefing below the header but no editor — decision 16, straight from the App shell's
   *  own `viewerIsManager || roles.includes('lead_coach')` computation. */
  canWritePlan = false,
  peopleClient,
  canGrantTrialOverride = false,
}: {
  sessionId: string
  locale: Locale
  client: StaffAttendanceClient
  /**
   * The device clock, as a function.
   *
   * **One clock, not two.** The first draft took `now` as a string for §6.5's staleness
   * check while `queueMark` stamped `queued_at` from `new Date()` — so the screen compared
   * a fixed instant against a live one and declared a queue a day stale the moment it was
   * written. A function rather than a value because `device_marked_at` has to advance
   * between two taps in the same session (§10.5 resolves on it), which a value fixed for
   * the day cannot do.
   */
  clock?: () => string
  personId: string | null
  notExpectedIds?: string[]
  canWritePlan?: boolean
  /** For the add-to-session sheet's search and its trial form. Optional for the same reason
   *  `eventsClient` is optional on the schedule: a caller that has not wired one yet still
   *  gets a working roster, without the sheet. */
  peopleClient?: StaffPeopleClient
  /** §5.4a — a second free trial is a MANAGER's deliberate act. */
  canGrantTrialOverride?: boolean
}) {
  const [roster, setRoster] = useState<RosterRowData[]>([])
  const [header, setHeader] = useState<{
    groupId: string | null
    groupName: string
    startsAt: string
    locationName: string | null
  } | null>(null)
  // §6.2 — the briefing rides in with its session on `GET /sync/bootstrap` and is read off
  // the cache, never fetched: unlike the roster above, this has no live-fetch counterpart to
  // fall back FROM, because `GET /sessions/{id}/attendance` (`sessionRoster`) does not carry
  // it at all. That is deliberate, not an oversight — "the plan comes down in the bootstrap
  // with its session", so the one reader is the cache, online or off.
  const [plan, setPlan] = useState<string | null>(null)
  const pending = usePendingCount()
  const stale = useStaleQueueWarning(clock)
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'existing' | 'trial'>('existing')
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    let live = true
    void client
      .sessionRoster(sessionId)
      .then((body) => {
        if (!live) return
        setRoster(body.roster)
        setHeader({
          // The sheet's trial form needs it, and the roster read already carries it —
          // `TrialSection` used to make a SECOND `sessionRoster` call for this one field.
          groupId: body.session.group_id ?? null,
          groupName: body.session.group_name,
          startsAt: body.session.starts_at,
          locationName: body.session.location_name,
        })
      })
      .catch(async () => {
        // Offline is not an error state on this screen. §6.1 already primes `readRoster`/
        // `readSession` into IndexedDB on every successful bootstrap — this used to say
        // "the cached roster is what renders" while nothing ever read them back, so a
        // coach opening the app with no signal saw an empty screen rather than the roster
        // they had a moment ago. `mode` (NetworkStatus) already tells them why nothing
        // refreshed; this is what makes there be something to look at while it doesn't.
        if (!live) return
        const cache = offlineStore()
        const [cachedRoster, cachedSession] = await Promise.all([
          readRoster(cache, sessionId),
          readSession(cache, sessionId),
        ])
        if (!live) return
        if (cachedRoster) setRoster(cachedRoster)
        if (cachedSession) {
          setHeader({
            groupId: cachedSession.group_id ?? null,
            groupName: cachedSession.group_name,
            startsAt: cachedSession.starts_at,
            locationName: cachedSession.location_name,
          })
        }
      })
    return () => {
      live = false
    }
  }, [client, sessionId])

  // Independent of the fetch above and its catch branch: the briefing is cache-only
  // regardless of whether the live roster read succeeds, so it must not live inside either
  // branch of that effect.
  useEffect(() => {
    let live = true
    void readSession(offlineStore(), sessionId).then((cached) => {
      if (live) setPlan(cached?.plan ?? null)
    })
    return () => {
      live = false
    }
  }, [sessionId])

  // **A filter over the names already on screen** (owner, 2026-10-13): "it is possible to
  // have search options at the top, so one does not have to scroll through everybody to
  // mark a child". Local, over the rows the register already holds — no request, works in
  // a basement, and answers on the first letter rather than the third.
  const [query, setQuery] = useState('')
  // What the last bulk press marked, so the same control can take it back. A bulk write
  // with no one-tap undo is the part that makes a coach hesitate over the button.
  const [lastBulk, setLastBulk] = useState<string[] | null>(null)

  const split: Split = useMemo(() => {
    const notExpected = new Set(notExpectedIds)
    return {
      expected: roster.filter((row) => !notExpected.has(row.student_id)),
      notExpected: roster.filter((row) => notExpected.has(row.student_id)),
    }
  }, [roster, notExpectedIds])

  const needle = query.trim().toLowerCase()
  const shown: Split = useMemo(
    () =>
      needle === ''
        ? split
        : {
            expected: split.expected.filter((row) =>
              row.display_name.toLowerCase().includes(needle),
            ),
            notExpected: split.notExpected.filter((row) =>
              row.display_name.toLowerCase().includes(needle),
            ),
          },
    [split, needle],
  )

  // Over the EXPECTED section too, for the same reason as the three counts below: the note
  // sits above that list, and the not-expected rows are inside a `<details>` that is
  // collapsed. Counting the whole roster made the sentence promise more ⚠ than the screen
  // was showing — and after a club migration, where every child starts with no
  // declaration, the gap is the size of the not-expected section.
  const missingHealth = split.expected.filter((row) => row.health_status === 'missing').length

  // §5.7's three counts. Every one of them is over the EXPECTED section only: "its rows
  // never count toward `לא סומן`", and a not-expected child who did not come has not
  // missed anything.
  const counts = useMemo(
    () => ({
      present: split.expected.filter((row) => row.status === 'present').length,
      absent: split.expected.filter((row) => row.status.startsWith('absent')).length,
      unmarked: split.expected.filter((row) => row.status === 'unmarked').length,
    }),
    [split],
  )

  const preReported = split.expected.filter((row) => row.has_absence_report).length

  // §5.7 — "Marks are written to the local store first and the UI updates immediately."
  // Optimistic, unconditionally, and never branching on `mode`: a screen with an online
  // path and an offline path has one path nobody exercises until a coach is in a basement.
  const mark = (row: RosterRowData, next: RosterRowData['status'], source: 'coach') => {
    setLastBulk(null)
    setRoster((current) =>
      current.map((one) =>
        one.student_id === row.student_id ? { ...one, status: next, source } : one,
      ),
    )
    void queueMark({
      // Stable per (session, student), so a coach cycling a row three times leaves one op
      // carrying their final answer rather than three the server has to reconcile.
      clientMarkId: markId(sessionId, row.student_id),
      kind: 'attendance.mark',
      sessionId,
      studentId: row.student_id,
      payload: { status: next },
      deviceMarkedAt: clock(),
      personId,
    })
  }

  // §6.5 — "shows a **blocking** warning when unsynced work has been queued for more than
  // one session." Rendered INSTEAD of the roster, not above it. §6.5 traded the storage
  // guarantee away deliberately — "iOS may still evict under storage pressure — a guarantee
  // a native container would have given. Coaches are a small, known group, so this is
  // managed rather than engineered around" — and a banner a coach scrolls past is noticing
  // the trade, not managing it. The only thing that converts "your marks may be lost" into
  // "your marks were not lost" is a person walking to somewhere with signal.
  //
  // `offlineStorageIsDurable()` short-circuits the day threshold: on a device with no
  // IndexedDB at all the queue does not survive a reload, so the warning is true from the
  // first mark rather than after a day.
  if (stale?.blocking === true || (pending > 0 && !offlineStorageIsDurable())) {
    return (
      <section className="flex flex-col gap-3 px-4 pt-4" data-testid="roster-stale-block">
        <Alert iconLabel={t(locale, 'attendance.sync.staleWarning')} live tone="danger">
          <strong>{t(locale, 'attendance.sync.staleWarning')}</strong>
          <span>{t(locale, 'attendance.sync.staleBody')}</span>
        </Alert>
        <p className="text-xs font-semibold text-[var(--text-muted)]" data-testid="roster-stale-count">
          {plural(locale, 'attendance.sync.pendingCount', pending)}
        </p>
      </section>
    )
  }

  const totalExpected = split.expected.length

  return (
    <section
      aria-labelledby="roster-title"
      className="flex flex-col gap-4 px-4 pt-4"
      data-testid="roster-screen"
    >
      {/* **A way out** (owner, 2026-10-13): "there is no back button after pressing
          attendance". There never was one — a coach who opened a register was in a room
          whose only exits were the browser's own gesture, which a home-screen app does not
          offer, and the tab bar, which goes somewhere else. Nothing to flush on the way:
          every tap is already in `pending_ops` by the time it is drawn. */}
      <a
        className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-[var(--emphasis)]"
        data-testid="roster-back"
        href="#/"
      >
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" />
        {t(locale, 'attendance.roster.back')}
      </a>

      <header className="flex flex-col gap-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-black text-[var(--fg)]" id="roster-title">
              {t(locale, 'attendance.roster.title')}
            </h1>
            {header ? (
              <p
                className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]"
                data-testid="roster-session"
              >
                {/* S6 — `יום א׳ · 17:00 · אולם א׳`. The weekday and the hall are for the coach
                    covering for someone: the day comes from the studio's calendar day, never
                    the device's UTC date, and the hall renders only when the session has one. */}
                {t(locale, 'attendance.roster.dayLabel').replace(
                  '{{weekday}}',
                  t(locale, `schedule.weekday.${sessionWeekday(header.startsAt)}`),
                )}{' '}
                · <span className="font-mono">{formatTimeInStudioZone(header.startsAt, locale)}</span> ·{' '}
                <bdi>{header.groupName}</bdi>
                {header.locationName ? (
                  <>
                    {' '}
                    · <bdi>{header.locationName}</bdi>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          {/* The redesign's live counter — "present of total", which `9f` never drew.
              Scoped to the SAME expected-only denominator the three tiles below use
              (§5.7 — a not-expected child who has not come has not missed anything), so
              this number and `roster-counts`' own present tile never disagree. */}
          <div className="shrink-0 text-end" data-testid="roster-live-count">
            <p className="text-sm font-black text-[var(--fg)]">
              {withMonoNumerals(
                t(locale, 'attendance.roster.presentOfTotal')
                  .replace('{{present}}', String(counts.present))
                  .replace('{{total}}', String(totalExpected)),
              )}
            </p>
          </div>
        </div>

        {/* `1c`'s three count tiles. */}
        {/* 1c draws each tile as the number over its label, the number in the tile's
            own semantic colour — the styling pass (2026-08-27) made the markup match. */}
        <ul className="grid grid-cols-3 gap-2" data-testid="roster-counts">
          <li className="rounded-2xl border p-2.5 text-center" data-count="present">
            <span className="count-number block font-mono text-lg">{counts.present}</span>
            <span className="count-label mt-0.5 block text-[11px] font-semibold text-[var(--text-muted)]">
              {t(locale, 'attendance.roster.present')}
            </span>
          </li>
          <li className="rounded-2xl border p-2.5 text-center" data-count="absent">
            <span className="count-number block font-mono text-lg">{counts.absent}</span>
            <span className="count-label mt-0.5 block text-[11px] font-semibold text-[var(--text-muted)]">
              {t(locale, 'attendance.roster.absent')}
            </span>
          </li>
          <li className="rounded-2xl border p-2.5 text-center" data-count="unmarked">
            <span className="count-number block font-mono text-lg">{counts.unmarked}</span>
            <span className="count-label mt-0.5 block text-[11px] font-semibold text-[var(--text-muted)]">
              {t(locale, 'attendance.roster.unmarked')}
            </span>
          </li>
        </ul>

        {/* Register §9 — "offline is doubled": this screen used to repeat `NetworkStatus`'s
            mode text and pending count in a second banner right here. `NetworkStatus` is
            mounted once at the app shell (App.tsx) and is visible on every staff screen
            including this one, so a second copy was never new information, only a second
            place to read the same one. One offline signal, in one place. */}

        {/* `9f`'s advance-notice hint row. Its claim — that those students are handled
            automatically — is true precisely because the bulk button below skips them. */}
        {preReported > 0 ? (
          <Alert iconLabel={t(locale, 'attendance.source.preReported')} tone="pending">
            {t(locale, 'attendance.source.preReportedHint')}
          </Alert>
        ) : null}
      </header>

      {/* §6.2 — "shows the plan at the top, before the roster... that is the moment
          someone on the mat needs it." Above the quick-action strip and the list both.
          `SessionPlanCard` moved to `../briefing` (2026-09-07) so the schedule tab's card
          can open the same editor from its own marker — this screen's placement of it is
          unchanged, only its address moved. */}
      <SessionPlanCard
        canWrite={canWritePlan}
        locale={locale}
        onSave={async (body) => {
          // `addSessionNote` is optional on the interface (see `client.ts`'s own note on
          // why) but never actually absent here: every real client implements it, and
          // `canWritePlan` is what gates whether this card even offers the button that
          // reaches this handler. A missing implementation refuses rather than silently
          // updating local state for a write that never reached the server.
          if (!client.addSessionNote) throw new Error('addSessionNote is not implemented')
          await client.addSessionNote(sessionId, body, 'plan')
          setPlan(body)
        }}
        plan={plan}
      />

      {/* The prototype's quick-action strip. Only its "mark all" half is drawn — see this
          file's own header note on why "reset" has nothing behind it.

          No note beside the button (owner, 2026-09-17). `9f` finding 1 had put "will not
          overwrite a parent report" here, unconditionally; the owner took it off — the
          roster is read on the mat, and the strip is the button. The rule itself stands
          (`bulkPresent` still skips pre-reported marks) and the dashboard's quick view
          still says so beside its own copy of the button. */}
      {/* The filter, above the names and below the counts. Shown once the list is long
          enough for scrolling to be the problem it solves — on a register of six, a search
          field is furniture. */}
      {roster.length > FILTER_FROM ? (
        <label className="relative block" data-testid="roster-filter">
          <span className="sr-only">{t(locale, 'attendance.roster.filter')}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-9 py-2.5 text-sm"
            data-testid="roster-filter-input"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t(locale, 'attendance.roster.filterPlaceholder')}
            type="search"
            value={query}
          />
        </label>
      ) : null}

      {roster.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]" data-testid="roster-empty">
          {t(locale, 'attendance.roster.empty')}
        </p>
      ) : null}

      {/* §5.5's hint, once for the whole list — see `HealthBadge`'s `onRoster`. */}
      {missingHealth > 0 ? (
        <p className="text-xs text-[var(--text-muted)] m-0" data-testid="roster-health-note">
          {t(locale, 'health.badge.missingRosterNote').replace('{{count}}', String(missingHealth))}
        </p>
      ) : null}

      {/* **The bulk shortcut moves onto the label of what it marks** (owner, 2026-10-13):
          "the button סימון כולם כנוכחים is not in a good place". It was a full-width bar
          between the header and the first name — the loudest control on the screen, in the
          one place the eye lands, pressable before a coach has read a single row, and
          acting on everybody at once. Here it reads as what it is: a shortcut on a set.
          With the filter active it marks what is on screen and says so, and the moment it
          is used it offers the way back. */}
      {shown.expected.length > 0 ? (
        <div className="flex items-center justify-between gap-2" data-testid="roster-band-enrolled">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">
            {t(locale, 'attendance.roster.bandEnrolled').replace(
              '{{count}}',
              String(shown.expected.length),
            )}
          </span>
          <button
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${
              lastBulk
                ? 'border-[var(--border)] text-[var(--text-muted)]'
                : 'border-[var(--paid)] text-[var(--paid)]'
            }`}
            data-testid="roster-bulk"
            onClick={() => {
              void runBulk()
            }}
            type="button"
          >
            <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
            <span>
              {lastBulk
                ? t(locale, 'attendance.roster.undoBulk')
                : needle === ''
                  ? t(locale, 'attendance.roster.markAllPresent')
                  : t(locale, 'attendance.roster.markAllShown')}
            </span>
          </button>
        </div>
      ) : null}

      {needle !== '' && shown.expected.length === 0 && shown.notExpected.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]" data-testid="roster-no-matches">
          {t(locale, 'attendance.roster.noMatches')}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2" data-testid="roster-list">
        {shown.expected.map((row) => (
          <li key={row.student_id}>
            <RosterRow
              locale={locale}
              onCycle={(next) => mark(row, next, 'coach')}
              onOverride={() => mark(row, 'present', 'coach')}
              row={row}
            />
          </li>
        ))}
      </ul>

      {/* §5.7 — "Students enrolled in the group but not expected today sit in a separate
          collapsed section beneath it, and can still be marked." A <details>, so it is
          collapsed by default, reachable by keyboard, and needs no state of its own. */}
      {shown.notExpected.length > 0 ? (
        <details
          className="rounded-2xl border border-[var(--border)] bg-[var(--disabled-surface)] px-3"
          data-testid="roster-not-expected"
        >
          <summary className="text-sm font-semibold">
            {t(locale, 'attendance.roster.notExpectedToday')}
          </summary>
          <ul className="flex flex-col gap-2 pb-3">
            {shown.notExpected.map((row) => (
              <li key={row.student_id}>
                <RosterRow
                  locale={locale}
                  onCycle={(next) => mark(row, next, 'coach')}
                  onOverride={() => mark(row, 'present', 'coach')}
                  row={row}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="flex flex-col gap-3 pb-2">
        <p
          className="text-center text-xs font-medium text-[var(--text-muted)]"
          data-testid="roster-saved-immediately"
        >
          {t(locale, 'attendance.roster.savedImmediately')}
        </p>
        <p className="text-center text-xs font-medium text-[var(--text-muted)]" data-testid="roster-edit-anytime">
          {t(locale, 'attendance.roster.editAnytime')}
        </p>
        {/* **Two buttons, and only these two** (owner, 2026-10-13): "I think the summary
            should not be there but on the session card, and the item handover should be on
            the card itself". Both are things that belong to the SESSION, and the register
            is the screen open during the lesson by whoever is running it. They live on the
            day screen now, each as its own popup over it. What is left here is what the
            register is for: write down somebody who came, or start a trial lesson. */}
        <nav
          aria-label={t(locale, 'attendance.summary.whatNext')}
          className="flex flex-col gap-2"
          data-testid="roster-actions"
        >
          {peopleClient ? (
            <>
              <button
                type="button"
                aria-haspopup="dialog"
                data-testid="add-to-session-open"
                onClick={() => {
                  setAddMode('existing')
                  setAddOpen(true)
                }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--emphasis)] px-3 text-sm font-black text-[var(--on-emphasis)] transition-all active:scale-[0.98]"
              >
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                {t(locale, 'attendance.addToSession.fromClub')}
              </button>
              {/* §5.4a's trial, beside the register rather than inside the add sheet —
                  writing down a child who is already in the club and inventing a new one
                  are different acts, and the owner asked for them to look it. */}
              <button
                type="button"
                aria-haspopup="dialog"
                data-testid="trial-in-class-open"
                onClick={() => {
                  setAddMode('trial')
                  setAddOpen(true)
                }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--emphasis)] px-3 text-sm font-bold text-[var(--emphasis)] transition-all active:scale-[0.98]"
              >
                {t(locale, 'attendance.addToSession.trial')}
              </button>
            </>
          ) : null}
        </nav>
      </footer>

      {summaryOpen ? (
        <SessionSummarySheet
          locale={locale}
          sessionId={sessionId}
          roster={roster}
          personId={personId}
          clock={clock}
          heading={
            header ? `${header.groupName} · ${formatTimeInStudioZone(header.startsAt, locale)}` : null
          }
          onClose={() => setSummaryOpen(false)}
          onReportSomething={async (description) => {
            // Immediate, online-only — never queued (§10.2's absence-report reasoning,
            // mirrored). No `student_id`: the report is about the lesson, so it reaches the
            // managers and no guardian. A non-2xx must reject so the sheet can say so.
            const response = await apiFetch(`/api/v1/sessions/${sessionId}/injury-reports`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description }),
            })
            if (!response.ok) throw new Error(String(response.status))
          }}
        />
      ) : null}

      {addOpen && peopleClient ? (
        <AddToSessionSheet
          locale={locale}
          peopleClient={peopleClient}
          alreadyOnRoster={new Set(roster.map((row) => row.student_id))}
          onClose={() => setAddOpen(false)}
          mode={addMode}
          onPickStudents={(students) => {
            // One queued mark per child, each with its own `client_mark_id` — the batch is
            // a convenience for the coach, not a new kind of write, so the offline queue
            // and the server's idempotency see exactly what six separate taps would send.
            students.forEach(markVisitor)
            setAddOpen(false)
          }}
          trialGroupId={header?.groupId ?? null}
          trialSessionId={sessionId}
          canGrantTrialOverride={canGrantTrialOverride}
        />
      ) : null}
    </section>
  )

  /** Mark a student from another group present at THIS session. Optimistic like every other
   *  mark on this screen, and queued with `visiting` so the server stores it without raising
   *  §10.5's `student_unenrolled` card — see `app/schemas/attendance.py::AttendanceIn`. */
  function markVisitor(student: { id: string; first_name: string; last_name: string }): void {
    setRoster((current) =>
      current.some((row) => row.student_id === student.id)
        ? current
        : [
            ...current,
            {
              student_id: student.id,
              display_name: `${student.first_name} ${student.last_name}`.trim(),
              status: 'present',
              source: 'coach',
              health_status: 'missing',
              derived_flags: {},
              has_absence_report: false,
              absence_reason: null,
              has_confirmation: false,
              visiting: true,
              belt_color_hex: null,
              belt_name: null,
              plan_name: null,
            } satisfies RosterRowData,
          ],
    )
    void queueMark({
      clientMarkId: markId(sessionId, student.id),
      kind: 'attendance.mark',
      sessionId,
      studentId: student.id,
      payload: { status: 'present', visiting: true },
      deviceMarkedAt: clock(),
      personId,
    })
  }

  /** The band's shortcut, in both of its states. Pressed once it marks the unmarked rows
   *  of the band — all of them, or only the ones the filter is showing, which is what the
   *  label says it will do. Pressed again, while it is still the last thing that happened,
   *  it takes exactly those rows back to `unmarked` and nothing else. */
  async function runBulk(): Promise<void> {
    if (lastBulk !== null) {
      const undoing = new Set(lastBulk)
      // `mark` clears `lastBulk` itself, which is also what makes the label flip back.
      roster
        .filter((row) => undoing.has(row.student_id))
        .forEach((row) => mark(row, 'unmarked', 'coach'))
      return
    }
    // The same predicate the server applies to `attendance.bulk`: only expected, only
    // unmarked, never over a parent's advance notice. Computed here as well because the
    // undo has to know precisely which rows this press changed.
    const targets = shown.expected.filter(
      (row) => row.status === 'unmarked' && !row.has_absence_report,
    )
    if (targets.length === 0) return
    setLastBulk(targets.map((row) => row.student_id))
    if (needle === '') {
      // Unfiltered: one queued op over the server's own predicate, exactly as before.
      await bulkPresent()
      return
    }
    // Filtered: the server has no idea what is on this coach's screen, so the rows go one
    // by one — the same write a tap on each would have produced.
    targets.forEach((row) => mark(row, 'present', 'coach'))
    setLastBulk(targets.map((row) => row.student_id))
  }

  async function bulkPresent(): Promise<void> {
    const prefix = markId(sessionId, 'bulk')
    // Optimistic first, exactly as a single mark is — and over the SAME predicate the
    // server uses, so the screen and the database agree without a round trip: only
    // expected, only unmarked, never a parent's advance notice.
    setRoster((current) =>
      current.map((row) =>
        !notExpectedIds.includes(row.student_id) &&
        row.status === 'unmarked' &&
        !row.has_absence_report
          ? { ...row, status: 'present', source: 'bulk' }
          : row,
      ),
    )
    await queueMark({
      clientMarkId: prefix,
      kind: 'attendance.bulk',
      sessionId,
      studentId: null,
      payload: { client_mark_id_prefix: prefix },
      deviceMarkedAt: clock(),
      personId,
    })
  }
}

/**
 * A UUID derived from the session and the student, so the same row cycled twice amends one
 * queued op. Not `crypto.randomUUID()`: a fresh id per tap is a fresh op per tap, and
 * §10.5's idempotency is keyed on this value.
 *
 * **It has to be an actual UUID.** This returned `${sessionId}:${studentId}` — the
 * docstring already said "v5-shaped", so the intent was right and the implementation was
 * not. `AttendanceIn.client_mark_id` is a `uuid.UUID` and `BulkPresentIn`'s prefix is one
 * too, so every flush of every mark was refused with a 422 and the queue could never
 * drain. Nothing surfaced it: the roster is optimistic by design, so the screen looked
 * correct the whole time, and no code called `flush` at all until this wave.
 *
 * Derived rather than hashed with SubtleCrypto, which is async — and `queueMark` is called
 * from a click handler that must not await anything, because §10.3's whole point is that
 * the local write is not an API call. A 128-bit FNV-1a mix over the pair gives the two
 * properties that matter: the same pair always yields the same id, and different pairs
 * effectively never collide. Version and variant bits are set so it is a well-formed v4 to
 * anything that parses it.
 */
function markId(sessionId: string, studentId: string): string {
  const source = `${sessionId}:${studentId}`
  // Four independently-seeded FNV-1a passes, 32 bits each. One pass would give 32 bits of
  // spread across a whole club's marks, which is not enough to be careless with.
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let hash = seed >>> 0
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash >>> 0
  })
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('')
  const bytes = hex.match(/.{2}/g)!
  // v4 version and RFC 4122 variant, so the shape is honest about being derived garbage
  // rather than pretending to be a v5 of some namespace it was never hashed against.
  bytes[6] = ((parseInt(bytes[6]!, 16) & 0x0f) | 0x40).toString(16).padStart(2, '0')
  bytes[8] = ((parseInt(bytes[8]!, 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  const flat = bytes.join('')
  return [
    flat.slice(0, 8),
    flat.slice(8, 12),
    flat.slice(12, 16),
    flat.slice(16, 20),
    flat.slice(20, 32),
  ].join('-')
}

/** The session's weekday in the STUDIO's calendar, Sunday-first to match
 *  `schedule.weekday.*`. An evening class near midnight UTC is already the next day in
 *  Jerusalem, which is exactly what `studioDayKey` exists to get right. */
function sessionWeekday(startsAt: string): number {
  return new Date(`${studioDayKey(startsAt)}T12:00:00Z`).getUTCDay()
}
