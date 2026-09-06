// The tasks tab's data seam. §4.4's central rule — "nothing is stored... the list is
// rebuilt every time the tab opens" — is what this hook IS: every render's task list is
// computed fresh from whatever the last fetch returned, never patched or merged with a
// previous one, so a task cannot outlive the state that justified it.
//
// **Called from two places on purpose.** `App.tsx` calls it once to drive the tab bar's
// badge, which is visible on every screen and not only this one — the same shape the
// parent app already established for its own updates badge (`apps/parent/src/App.tsx`'s
// `pendingCount`, computed once and handed to both `ParentTabBar` and `Resolve`).
// `TasksScreen` calls it again, independently, to draw the list itself. Two separate
// fetches rather than one array threaded down as a prop: every other screen in this app
// owns its own fetching from injected clients (`TodayScreen`, `StudentsSearch`,
// `PaymentPromisesSection`, ...), and a tasks screen fed a pre-fetched array would be the
// one screen in the app that could not be pointed at a stub client and rendered on its
// own — which is exactly what `TasksScreen.test.tsx` needs to do.
//
// Because `App.tsx` never unmounts, its own call does not get §4.4's "rebuilt every time
// the tab opens" for free the way `TasksScreen`'s does (React remounts a fresh instance,
// with fresh effects, every time the shell's routing switches back onto `#/tasks`). The
// optional `refreshKey` exists for exactly that gap: `App.tsx` passes its own `hash`, so
// the badge's fetches re-run on every navigation rather than sitting on whatever they saw
// at sign-in. `TasksScreen` does not need to pass one — mounting IS its refresh.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { offlineStore, readRoster, studioDayKey } from '@studio/core'
import type { RosterRow } from '@studio/core'
import type { Locale } from '@studio/i18n'
import type { StaffScheduleClient } from '../schedule/client'
import type { StaffPeopleClient, StudentDetail } from '../people'
import type { StaffCommsClient } from '../comms'
import type { ContactFamily } from '../contact'
import { makePromiseClient } from '../billing/promiseClient'
import type { PromiseClient } from '../billing/promiseClient'
import { makeTasksClient } from './tasksClient'
import type { TasksClient } from './tasksClient'
import {
  callParentTasks,
  cashPendingTasks,
  closeSessionTasks,
  healthReviewTasks,
  missingHealthFormTasks,
} from './deriveTasks'
import type { TaskCard } from './deriveTasks'

/** The same narrow shape `TodayScreen`'s own local `primaryContact` reads off
 *  `StudentDetail` — one primary (or first-added) guardian, or none. Duplicated rather
 *  than imported: it is eight lines, and the two screens read it off two different
 *  fetches (a roster row's chase list there, a single flagged student here). */
function primaryGuardianContact(student: StudentDetail): ContactFamily | null {
  const guardians = student.guardians ?? []
  const guardian = guardians.find((g) => g.is_primary) ?? guardians[0]
  if (!guardian) return null
  return { person_id: guardian.person_id, name: guardian.display_name, phone: guardian.phone ?? null }
}

export function useOpenTasks({
  enabled,
  locale,
  scheduleClient,
  peopleClient,
  commsClient,
  promiseClient: injectedPromiseClient,
  tasksClient: injectedTasksClient,
  viewerPersonId,
  viewerIsManager,
  today,
  refreshKey,
}: {
  /** `session.access.staff` — the same gate every other fetch in this app runs behind. */
  enabled: boolean
  locale: Locale
  scheduleClient: StaffScheduleClient
  peopleClient: StaffPeopleClient
  commsClient: StaffCommsClient
  /** Manager-only fetches, self-contained like `PaymentPromisesSection`'s own `client?`
   *  prop — `App.tsx` does not thread a promise client through every screen, only the
   *  one that already needed it, so this defaults rather than asking `App.tsx` to build
   *  one nothing else there uses. */
  promiseClient?: PromiseClient
  tasksClient?: TasksClient
  viewerPersonId: string | null
  viewerIsManager: boolean
  /** An ISO instant, not `new Date()` — every derivation here is a pure function of it. */
  today: string
  refreshKey?: unknown
}): { tasks: TaskCard[] } {
  const promiseClient = useMemo(
    () => injectedPromiseClient ?? makePromiseClient(),
    [injectedPromiseClient],
  )
  const tasksClient = useMemo(() => injectedTasksClient ?? makeTasksClient(), [injectedTasksClient])

  const [closeSession, setCloseSession] = useState<TaskCard[]>([])
  const [healthForm, setHealthForm] = useState<TaskCard[]>([])
  const [callParent, setCallParent] = useState<TaskCard[]>([])
  const [cash, setCash] = useState<TaskCard[]>([])
  const [healthReview, setHealthReview] = useState<TaskCard[]>([])

  // §4.4 — "the app has no way to know whether the coach phoned", so this is the one
  // action that removes a card itself rather than waiting for the next fetch to agree.
  // Optimistic: filtered locally first, `markRead` fired after and its failure swallowed
  // — a lost mark-read leaves the notification unread server-side, which is the safe
  // direction to fail in (the coach sees it again rather than a call quietly going
  // untracked).
  const tick = useCallback(
    (notificationId: string) => {
      setCallParent((current) => current.filter((card) => card.id !== `call-parent:${notificationId}`))
      void commsClient.markRead(notificationId).catch(() => undefined)
    },
    [commsClient],
  )

  // The health-review link marks its own notification read the moment it is taken —
  // see `deriveTasks.ts::healthReviewTasks`'s own note on why a tap is the honest signal
  // here rather than a second tick this checkpoint has no screen to back up.
  const openReview = useCallback(
    (notificationId: string) => {
      setHealthReview((current) =>
        current.filter((card) => card.id !== `health-review:${notificationId}`),
      )
      void commsClient.markRead(notificationId).catch(() => undefined)
    },
    [commsClient],
  )

  // Coach rows 1 and 2 — one fetch serves both. `GET /sessions` already scopes to this
  // coach's own day (`coach_person_id`), and today's cached rosters carry the health
  // flags §4.4 asks for; see `deriveTasks.ts`'s module header for why neither needs a
  // role check here.
  useEffect(() => {
    // No setState here when disabled — `react-hooks/set-state-in-effect` flags a
    // synchronous setState in an effect body, and the visibility gate below (in the final
    // `tasks` memo) already hides these rows whenever `enabled`/`viewerPersonId` says to,
    // so there is nothing this branch needs to clear.
    if (!enabled || !viewerPersonId) return
    let live = true
    const todayKey = studioDayKey(today)
    scheduleClient
      .listSessions({ from: todayKey, to: todayKey, coachPersonId: viewerPersonId })
      .then(async (sessions) => {
        if (!live) return
        setCloseSession(closeSessionTasks(sessions, today, locale))
        const store = offlineStore()
        const loaded = await Promise.all(sessions.map((session) => readRoster(store, session.id)))
        if (!live) return
        const rosters: Record<string, RosterRow[] | undefined> = {}
        sessions.forEach((session, index) => {
          rosters[session.id] = loaded[index]
        })
        setHealthForm(
          missingHealthFormTasks(
            sessions,
            rosters,
            (studentId) => () =>
              peopleClient
                .student(studentId)
                .then((student) => {
                  const contact = primaryGuardianContact(student)
                  return contact ? [contact] : []
                })
                // §4.9 rule 1 — a lookup that fails still leaves the trigger button real;
                // it opens to an empty list rather than throwing.
                .catch(() => []),
            locale,
          ),
        )
      })
      .catch(() => {
        if (!live) return
        setCloseSession([])
        setHealthForm([])
      })
    return () => {
      live = false
    }
  }, [enabled, viewerPersonId, scheduleClient, peopleClient, today, locale, refreshKey])

  // Coach row 3 — the viewer's own at-risk inbox. Not gated on any role: whoever it was
  // addressed to (a coach, a manager, or both) is exactly who §4.4 means to show it to.
  useEffect(() => {
    if (!enabled) return
    let live = true
    commsClient
      .atRisk()
      .then((page) => live && setCallParent(callParentTasks(page.items, locale, tick)))
      .catch(() => live && setCallParent([]))
    return () => {
      live = false
    }
  }, [enabled, commsClient, locale, tick, refreshKey])

  // Manager rows. Gated on `viewerIsManager`: `payment-promises` 403s a coach outright
  // (§13 invariant 3), and both notification kinds are only ever addressed to a manager
  // or owner (`OnboardingService`/`TrialService`'s own `_managers_of_studio`) — fetching
  // either for a coach would only ever come back empty, so the gate is purely to avoid a
  // 403 in the console and a call nobody needed.
  useEffect(() => {
    if (!enabled || !viewerIsManager) return
    let live = true
    promiseClient
      .pending()
      .then((rows) => live && setCash(cashPendingTasks(rows, locale)))
      .catch(() => live && setCash([]))
    tasksClient
      .healthReviewNotifications()
      .then((rows) => live && setHealthReview(healthReviewTasks(rows, locale, openReview)))
      .catch(() => live && setHealthReview([]))
    return () => {
      live = false
    }
  }, [enabled, viewerIsManager, promiseClient, tasksClient, locale, openReview, refreshKey])

  // The visibility gate lives here rather than as a synchronous reset inside each effect
  // above (`react-hooks/set-state-in-effect` forbids that shape) — so a coach who loses
  // `enabled`/`viewerPersonId`/`viewerIsManager` mid-session stops seeing rows their own
  // last fetch produced, without any effect ever calling setState outside a fetch
  // callback.
  const tasks = useMemo(() => {
    const coachRows = enabled && viewerPersonId ? [...closeSession, ...healthForm] : []
    const callParentRows = enabled ? callParent : []
    const managerRows = enabled && viewerIsManager ? [...cash, ...healthReview] : []
    return [...coachRows, ...callParentRows, ...managerRows]
  }, [enabled, viewerPersonId, viewerIsManager, closeSession, healthForm, callParent, cash, healthReview])

  return { tasks }
}
