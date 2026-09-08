// §6.1's parent-app first launch, step 4, and step 3's non-refusal arms:
//
//   3  resolve        invitation token → attach identity to the pre-created Person
//                     verified email/phone hit → attach to the matched Person
//   4  studio picker  only shown if she belongs to more than one studio
//
// Step 3's "no match" refusal ("לא מצאנו אותך" / [ יש לי קוד הזמנה ]) moved to
// `AccessGate` (2026-09-02), which wraps this component's caller rather than living
// inside it — see that file's header for why. Everything here now runs under the
// guarantee `AccessGate` provides: `session.access.parent` is `true` and no invite
// redemption is in flight.
//
// Steps 5 and 6 — the BLOCKING consent and health gates — are M4's, and this file
// deliberately does NOT pre-build a seam for them. §1.3's seam-4 table names five
// composites and this is not one of them, so inventing a sixth SlotId here would be
// speculative design in a file (`slots.ts`) the plan says is authored once. M4 decides
// its own shape; what M1 owes it is a container with an obvious place to land.
import { useEffect, useMemo, useState } from 'react'
import { StudioSwitcher } from '@studio/ui'
import type { Session } from '@studio/core'
import { apiFetch, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
// Checkpoint 2 of the parent-app redesign. `ParentHome` (artboard 1a, the 2026-09-01
// Option B rearrangement) is replaced wholesale by the port of the owner's prototype; it
// stays on disk until the redesign is accepted end to end, then goes.
import { HomeScreen } from '../home/redesign/HomeScreen'
import { familyNameOf } from '../home/redesign/derive'
import type { FamilyEvent, Intents, Lesson } from '../home/redesign/derive'
import type { HomePlanRow } from '../home/redesign/types'
import { makeIntentClient } from '../home/intentClient'
import { cancelReasonLabel } from '../schedule/client'
import { everyChildIsOnATrial, makePeopleClient, nextTrialLesson, useMyStudents } from '../people'
import type { TrialLesson } from '../people'
import { TrialHome } from '../people'
import { makeParentScheduleClient } from '../schedule/client'

export function Resolve({
  session,
  locale,
}: {
  session: Session
  locale: Locale
  /** The unread count the shell already fetches for the tab badge. Passed down rather than
   *  read again: one `/me/notifications` read per screen, and one number on it. */
}) {
  // A session with memberships but NO active studio has no tenant scope, and every
  // tenant-scoped route answers 401 without one. The picker below is skipped at a single
  // studio (§6.1 step 4 shows it "only if she belongs to more than one"), so such a
  // session fell straight through to a home whose every read failed, in silence — the
  // state a parent joining through §5.4b's link was left in (2026-08-31).
  //
  // The server no longer mints one: `_build_session` activates a sole membership. This is
  // the screen's own answer if one ever arrives anyway. With exactly one club there is no
  // choice to offer, so it is taken rather than presented.
  const soleStudioId =
    session.activeStudioId === null && session.studios.length === 1
      ? (session.studios[0]?.studio_id ?? null)
      : null
  // Which studio the switch has already been attempted for, rather than a pending flag:
  // `activating` is then DERIVED, and the effect never sets state synchronously in its
  // own body (react-hooks/set-state-in-effect).
  const [attempted, setAttempted] = useState<string | null>(null)
  const activating = soleStudioId !== null && attempted !== soleStudioId
  useEffect(() => {
    if (soleStudioId === null) return
    let live = true
    // One shot, keyed on the studio id: a refused switch is recorded as attempted and
    // falls through, rather than retrying for ever against a server that just said no.
    void apiFetch('/api/v1/auth/switch-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio_id: soleStudioId }),
    })
      .then((response) => {
        if (live && response.ok) session.reload()
      })
      .catch(() => undefined)
      .finally(() => live && setAttempted(soleStudioId))
    return () => {
      live = false
    }
    // `session` is a fresh object every render; the studio id is the only input that
    // decides whether to act.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleStudioId])

  // Memoised: `useMyStudents` reads through this in an effect keyed on the client, so a
  // fresh object every render would re-fetch forever.
  const peopleClient = useMemo(() => makePeopleClient(apiFetch), [])
  const mine = useMyStudents(peopleClient)
  const scheduleClient = useMemo(() => makeParentScheduleClient(apiFetch), [])
  // 2a's "upcoming" strip data, at 1a's depth: the next few lessons across the family's
  // groups, this week. `null` while loading so the home stays quiet rather than flashing
  // an empty state; a failed read renders the empty state, because a home that dies on a
  // schedule hiccup is worse than one missing a list.
  const [upcoming, setUpcoming] = useState<readonly Lesson[] | null>(null)
  // The schedule read failing is its own state: בית offers a retry rather than drawing an
  // empty week, which reads as "no training this week" and is a different claim entirely.
  const [lessonsFailed, setLessonsFailed] = useState(false)
  // What the family has already told the club about their COMING lessons. Read from the
  // server rather than held locally, so reopening the app shows what the club knows and
  // not what this device last hoped — the whole point of the answer being real.
  const [intents, setIntents] = useState<Intents>({})
  // `[]` and not `null`: a family with no events is the ordinary case and draws a home
  // with no events on it, so there is no third state for this read to be in.
  const [events, setEvents] = useState<readonly FamilyEvent[]>([])
  // Bumped after an answer lands, which re-runs the read below. One source of truth.
  const [intentEpoch, setIntentEpoch] = useState(0)
  // §6.3's reduced home is drawn around a lesson, and `TrialHome` was mounted below with
  // no `sessionStartsAt` at all — so every trial family fell through to the fallback copy.
  // `null` means "not asked yet or nothing booked", which is the same thing to the screen.
  const [trialLesson, setTrialLesson] = useState<TrialLesson | null>(null)
  /**
   * One row per child, for בית's plan pill — `GET /me/training-plans`.
   *
   * Read HERE and not in `HomeScreen`, which "deliberately does NOT fetch": this component
   * is the one place holding `useSession`, and a second reader would be a second
   * `/auth/refresh` on every visit.
   *
   * `[]` and not `null` on failure. A family whose plan read has a bad minute sees a home
   * with no pill on it — which is exactly what a family with no priced child sees, and is
   * the right degradation for a shortcut. It is not a claim about anything, unlike the
   * schedule read below, whose failure has its own banner because an empty week is.
   */
  const [plans, setPlans] = useState<readonly HomePlanRow[]>([])
  useEffect(() => {
    if (!session.access.parent) return
    let live = true
    void apiFetch('/api/v1/me/training-plans')
      .then(async (response) => {
        if (!live || !response.ok) return
        const body = (await response.json()) as { items: HomePlanRow[] }
        setPlans(body.items)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [session.access.parent])
  useEffect(() => {
    if (!session.access.parent) return
    let live = true
    // Only when every child is on a trial: this is the one screen that reads it, and a
    // family already using the full app has no use for the request. `mine.status` gates
    // it rather than a length check, so nothing fires while the children are loading.
    if (mine.status !== 'ready' || !everyChildIsOnATrial(mine.students)) return
    peopleClient
      .myTrialBookings()
      .then((body) => live && setTrialLesson(nextTrialLesson(body.items, new Date())))
      // A failed read leaves the fallback copy standing, which now says the honest thing.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [mine, peopleClient, session.access.parent])
  useEffect(() => {
    if (!session.access.parent) return
    let live = true
    // No `/me/balance` read here any more: it existed only to feed the urgent banner,
    // removed 2026-09-07. The payments screen makes the same read for itself, and a
    // request whose only reader is gone is a request nobody will remember to delete.
    const now = new Date()
    // 2a's strip reads back as well as forward: a week each way, one fetch.
    const weekBack = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const day = (d: Date) => d.toISOString().slice(0, 10)
    scheduleClient
      .listSessions({ from: day(weekBack), to: day(weekOut) })
      .then((rows) => {
        if (!live) return
        setUpcoming(
          rows
            // `completed` is dropped and `cancelled` is KEPT, which is the change the
            // redesign needed: בית draws a cancelled lesson as cancelled, with the club's
            // reason on it. Filtering it out here is what made the old home silently lose
            // the row a parent most needs to see -- they turn up to a locked dojo.
            .filter((row) => row.status !== 'completed')
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((row) => ({
              id: row.id,
              startsAt: row.starts_at,
              endsAt: row.ends_at,
              groupName: row.group_name,
              locationName: row.location_name,
              // The lead coach, never a substitute's absence of one. `staff` can be empty.
              coachName:
                row.staff.find((member) => member.role === 'lead_coach')?.display_name ?? null,
              status: row.status,
              cancelReason: row.cancel_reason,
            })),
        )
      })
      .catch(() => {
        if (!live) return
        setUpcoming([])
        setLessonsFailed(true)
      })
    // The two-way control's read half — the coming week, not the past one.
    void apiFetch(`/api/v1/me/attendance-intents?from=${day(now)}&to=${day(weekOut)}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              items: { session_id: string; student_id: string; intent: 'coming' | 'not_coming' }[]
            }>)
          : { items: [] },
      )
      .then((body) => {
        if (!live) return
        const next: Record<string, 'coming' | 'not_coming'> = {}
        for (const row of body.items) next[`${row.session_id}:${row.student_id}`] = row.intent
        setIntents(next)
      })
      .catch(() => {})
    // §4 — "events appear beside every other session". Read here rather than only behind
    // `#/events`, because a family's week is one week and a grading a parent finds only in
    // a second list is a grading they miss. `/me/events` already returns one row per CHILD
    // per event, which is the shape the home's session list is in.
    //
    // A failure leaves the list empty rather than raising: an unreachable events read must
    // not take the lessons down with it, and a home with no events on it is what a family
    // with no events sees anyway.
    void apiFetch('/api/v1/me/events')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              items: {
                event: {
                  id: string
                  title: string
                  starts_at: string
                  ends_at: string | null
                  location_text: string | null
                  status: string
                }
                registration: {
                  student_id: string
                  student_display_name: string
                  rsvp: 'yes' | 'no' | 'pending'
                }
              }[]
            }>)
          : { items: [] },
      )
      .then((body) => {
        if (!live) return
        setEvents(
          body.items.map((row) => ({
            id: row.event.id,
            title: row.event.title,
            startsAt: row.event.starts_at,
            endsAt: row.event.ends_at,
            locationText: row.event.location_text,
            cancelled: row.event.status === 'cancelled',
            studentId: row.registration.student_id,
            studentName: row.registration.student_display_name,
            rsvp: row.registration.rsvp,
          })),
        )
      })
      .catch(() => {})
    // 2a's other half — what actually happened — is NOT read here any more.
    //
    // The old strip let a parent read backwards into past attendance. The redesign's strip
    // looks forward and marks only whether a day has training; the prototype puts the
    // attendance record in PROFILE instead ("סיכום נוכחות" and "נוכחויות קודמות"), which is
    // checkpoint 5. So the capability moves rather than disappearing, and the read moves
    // with it — a fetch on this screen for a number no one on this screen renders is how a
    // home ends up making four calls to draw three things.
    return () => {
      live = false
    }
  }, [scheduleClient, session.access.parent, intentEpoch])

  // Held while the sole studio is being activated, for the reason the health gate holds
  // its own render: a home drawn before the scope exists is a home whose every read 401s,
  // and the parent reads empty boxes rather than a wait.
  if (activating) {
    return (
      <section aria-busy="true" data-testid="parent-activating-studio">
        <p>{t(locale, 'common.auth.joining')}</p>
      </section>
    )
  }

  // §6.3's trial state — 'A guardian whose children are ALL trial sees a reduced home.'
  //
  // Every child, not any: a family mid-conversion must keep the app they are already using.
  // Once a manager converts them "the full app appears with no further action from the
  // parent", which is this condition simply ceasing to hold.
  if (mine.status === 'ready' && everyChildIsOnATrial(mine.students)) {
    return (
      <TrialHome
        students={mine.students}
        locale={locale}
        // `StudentSummary` carries no session time and should not: it is the coach-reachable
        // roster row every student in the product shares. The lesson comes from
        // `GET /me/trial-bookings` above — see `nextTrialLesson` for which booking wins.
        sessionStartsAt={trialLesson?.sessionStartsAt ?? null}
        // §5.4a ④ — three-state in the column and three-state here. `attended === true` is
        // "the lesson happened"; `null` is "not yet", which must not ask "איך היה?".
        attended={trialLesson?.attended === true}
      />
    )
  }

  // §6.1 step 4 — 'only shown if she belongs to more than one studio'. StudioSwitcher
  // renders nothing below two, so the picker disappears on its own for the common case.
  if (session.studios.length > 1 && session.activeStudioId === null) {
    return (
      <section data-testid="studio-picker" aria-label={t(locale, 'common.studioPicker.title')}>
        <h2>{t(locale, 'common.studioPicker.title')}</h2>
        <StudioSwitcher
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          onSwitch={(studioId) => {
            void apiFetch('/api/v1/auth/switch-studio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ studio_id: studioId }),
            }).then(() => session.reload())
          }}
          locale={locale}
        />
      </section>
    )
  }

  return (
    // §6.1's home — artboard 1a. The health gate (step 6) wraps this whole shell in
    // App.tsx since the ship audit mounted it. The W1 `hasChildren` boolean is retired
    // with it: `mine` has named the children since M3, so the home renders them.
    <HomeScreen
      plans={plans}
      locale={locale}
      clubName={session.activeStudioName ?? ''}
      familyName={
        mine.status === 'ready' ? familyNameOf(mine.students.map((s) => s.last_name)) : null
      }
      childList={
        mine.status === 'ready'
          ? mine.students.map((student) => ({
              id: student.id,
              firstName: student.first_name,
              displayName: `${student.first_name} ${student.last_name}`,
              groupNames: student.group_names ?? [],
              // D7's bar colour, from `/me/students`. `null` before a first belt, and drawn
              // as absent rather than as an invented grey.
              beltColorHex: student.current_belt_color_hex ?? null,
              beltName: student.current_belt_name ?? null,
            }))
          : mine.status === 'error'
            ? []
            : null
      }
      lessons={upcoming}
      events={events}
      lessonsFailed={lessonsFailed}
      intents={intents}
      todayKey={studioDayKey(new Date())}
      writer={{
        reportAbsence: (sessionId, studentId, reason) =>
          makeIntentClient(apiFetch).reportAbsence(sessionId, studentId, reason),
        // FLOW B's one read. The home holds the two weeks fetched above; a range outside
        // it has to be asked for, or a family away for a month reports nothing at all and
        // is told it worked. `scope=mine` and the guardian narrowing are the schedule
        // client's — this names no group and no student, same as every other call.
        lessonsInRange: (from, to) =>
          scheduleClient.listSessions({ from, to }).then((rows) =>
            rows
              .filter((row) => row.status !== 'completed')
              .map((row) => ({
                id: row.id,
                startsAt: row.starts_at,
                endsAt: row.ends_at,
                groupName: row.group_name,
                locationName: row.location_name,
                coachName:
                  row.staff.find((member) => member.role === 'lead_coach')?.display_name ?? null,
                status: row.status,
                cancelReason: row.cancel_reason,
              })),
          ),
      }}
      cancelReasonLabel={(reason) => cancelReasonLabel(locale, reason)}
      onAbsenceReported={() => setIntentEpoch((n) => n + 1)}
      onRetry={() => {
        setLessonsFailed(false)
        setIntentEpoch((n) => n + 1)
      }}
    />
  )
}
