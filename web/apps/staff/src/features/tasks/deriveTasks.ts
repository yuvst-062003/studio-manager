// §4.4 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md, checkpoint 8's own
// central rule stated as literally as code can state it: "there is no task table and no
// task entity. The list is rebuilt every time the tab opens, from state the app already
// has." Every function below is pure and reads no store of its own — each one takes
// state the rest of the app already fetched (a session list, a cached roster, a page of
// notifications, a page of pending cash promises) and returns the cards that follow from
// it today, or none. Nothing here can go stale in a way a re-render does not already fix,
// because nothing here remembers anything between calls.
//
// Decision 15 — "their own, by what they actually do, not by job title" — is honoured by
// EVERY SOURCE BEING PERSONAL ALREADY, not by a role check written here:
//
//   * `sessions` arrives already filtered to `coach_person_id = <the viewer>` by
//     `GET /sessions` (`SessionStaff.person_id`, not a role), so an owner who teaches
//     Tuesdays gets Tuesday's rows and an owner who never teaches gets none — the same
//     list, unfiltered a second time here.
//   * the at-risk rows arrive from the viewer's OWN notification inbox, and the worker
//     already addresses "the group's coaches and the studio's managers" (§6.3's fix) —
//     so whoever is looking at their own inbox is exactly who §4.4 means to show it to.
//   * the two manager rows are gated by the caller on `viewerIsManager` before the fetch
//     is even made (`useOpenTasks.ts`), because `payment-promises` 403s a coach outright
//     and the two notification kinds are never addressed to one in the first place.
//
// So nothing in this file takes a role or asks "is this person allowed to see this
// row" — by the time a list reaches here, the personal scoping has already happened.
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow } from '@studio/core'
import type { components } from '@studio/api-client'
import { byMostMissed } from '../comms'
import type { AtRiskPayload } from '../comms'
import type { SessionRow } from '../schedule/client'
import type { ContactFamily } from '../contact'
import type { StaffPromiseRow } from '../billing/promiseClient'

export type NotificationOut = components['schemas']['NotificationOut']

/** The filter chips, as drawn (§4.4: "filter chips work as drawn"). The prototype's own
 *  bucketing (`TasksView.tsx`'s `selectedFilter`) puts "close a session" alone in the
 *  urgent bucket and everything that is really a conversation to have — a family to call,
 *  a form to chase, a manager's paperwork — under the follow-up one; the two manager rows
 *  join it for the same reason (neither is a mat-safety emergency, both are "get to it
 *  today"). */
export type TaskBucket = 'urgent' | 'followUp'

export type TaskKind =
  | 'close_session'
  | 'missing_health_form'
  | 'call_parent'
  | 'cash_pending'
  | 'health_review'

/** Contact actions are §4.9's, reused rather than re-invented — `ContactFamiliesButton`
 *  from `features/contact/`. A `link` action is everything else: a real destination this
 *  app already has (the roster, the cash screen, a student card), never an `alert()` and
 *  never a dead href. */
export type TaskPrimaryAction =
  | { kind: 'link'; label: string; href: string; onSelect?: () => void }
  | {
      kind: 'contact'
      triggerLabel: string
      title: string
      message: string
      resolveFamilies: () => Promise<ContactFamily[]>
    }

/** Only the "call a parent" row ever carries this — §4.4: "that card carries a tick,
 *  which marks the underlying notification read... An unticked alert stays until the
 *  student turns up and the worker stops raising it." Every other row disappears on its
 *  own when the state it was built from changes, and gets no tick at all. */
export type TaskTick = { label: string; onTick: () => void }

export type TaskCard = {
  id: string
  taskKind: TaskKind
  bucket: TaskBucket
  scope: string
  badgeText: string
  title: string
  subtitle: string
  alertText: string
  primaryAction: TaskPrimaryAction
  tick?: TaskTick
  /** Cash only — a `MoneyDisplay` amount the card renders beside the subtitle. Kept off
   *  every other kind's shape rather than becoming an optional field nothing else sets. */
  moneyAgorot?: number
}

/**
 * Coach row 1 — "sessions that have ended with `attendance_taken` false" (§4.4's table:
 * backend work none, already in `GET /sessions`). `sessions` is expected to be the
 * viewer's own day, already scoped server-side by `coach_person_id` — see this file's own
 * header for why that is what makes this "personal" rather than a role check.
 */
export function closeSessionTasks(
  sessions: SessionRow[],
  nowIso: string,
  locale: Locale,
): TaskCard[] {
  const now = Date.parse(nowIso)
  return sessions
    .filter(
      (session) =>
        session.status !== 'cancelled' &&
        !session.attendance_taken &&
        Date.parse(session.ends_at) <= now,
    )
    .map((session) => ({
      id: `close-session:${session.id}`,
      taskKind: 'close_session' as const,
      bucket: 'urgent' as const,
      scope: t(locale, 'tasks.closeSession.scope'),
      badgeText: t(locale, 'tasks.closeSession.badge'),
      title: t(locale, 'tasks.closeSession.title'),
      subtitle: session.group_name,
      alertText: t(locale, 'tasks.closeSession.alert'),
      primaryAction: {
        kind: 'link' as const,
        label: t(locale, 'tasks.closeSession.action'),
        href: `#/attendance/${session.id}`,
      },
    }))
}

/**
 * Coach row 2 — "the health flags already on today's cached rosters" (§4.4: backend work
 * none, already cached, already a badge on a roster row — `RosterHealthBadge`).
 * `todaySessions` is the same coach-scoped list {@link closeSessionTasks} reads, and
 * `rosters` is exactly what `readRoster` already returned for each of them: nothing here
 * touches the network or the cache itself.
 *
 * A student cached under two of today's sessions with this coach (unusual, but the
 * roster shape carries no rule against it) gets one card, not two — `seen` is keyed on
 * the student, not the session.
 */
export function missingHealthFormTasks(
  todaySessions: SessionRow[],
  rosters: Record<string, RosterRow[] | undefined>,
  resolveFamily: (studentId: string) => () => Promise<ContactFamily[]>,
  locale: Locale,
): TaskCard[] {
  const seen = new Set<string>()
  const cards: TaskCard[] = []
  for (const session of todaySessions) {
    for (const row of rosters[session.id] ?? []) {
      // §4.4's non-negotiable: a row may say a declaration is missing; it must never
      // render or log its contents. `health_status` is the one boolean-shaped fact this
      // reads — never `derived_flags`, which is the roster's own personal-data surface.
      if (row.health_status !== 'missing' || seen.has(row.student_id)) continue
      seen.add(row.student_id)
      cards.push({
        id: `health-form:${row.student_id}`,
        taskKind: 'missing_health_form',
        bucket: 'followUp',
        scope: session.group_name,
        badgeText: t(locale, 'tasks.healthForm.badge'),
        title: row.display_name,
        subtitle: t(locale, 'tasks.healthForm.subtitle'),
        alertText: t(locale, 'tasks.healthForm.alert'),
        primaryAction: {
          kind: 'contact',
          triggerLabel: t(locale, 'tasks.healthForm.action'),
          title: row.display_name,
          message: t(locale, 'tasks.healthForm.message').replace('{{name}}', row.display_name),
          resolveFamilies: resolveFamily(row.student_id),
        },
      })
    }
  }
  return cards
}

/**
 * Coach row 3 — "call a parent (three absences)", from the viewer's own
 * `attendance.at_risk` inbox (§6.3 fixed the worker to actually address a coach; this is
 * the row that could not exist before that fix). `onTick` is called with the
 * notification's id when the coach presses the tick — the caller (`useOpenTasks.ts`)
 * removes the card and calls `POST /notifications/{id}/read`, because this is the one row
 * §4.4 says cannot derive its own completion.
 *
 * `row.body` already carries the child's name and the count
 * (`app/workers/at_risk.py`: `"{display_name} — {streak} היעדרויות רצופות"`) — split
 * rather than re-fetched, so this needs no extra network round trip per row.
 */
export function callParentTasks(
  rows: NotificationOut[],
  locale: Locale,
  onTick: (notificationId: string) => void,
): TaskCard[] {
  return byMostMissed(rows).map((row) => {
    const payload = (row.payload ?? {}) as AtRiskPayload
    const name = row.body.split(' — ')[0]?.trim() || row.body
    return {
      id: `call-parent:${row.id}`,
      taskKind: 'call_parent' as const,
      bucket: 'followUp' as const,
      scope: t(locale, 'tasks.callParent.scope'),
      badgeText: t(locale, 'tasks.callParent.badge'),
      title: t(locale, 'tasks.callParent.title').replace('{{name}}', name),
      subtitle:
        payload.missed_count != null
          ? plural(locale, 'tasks.callParent.missedCount', payload.missed_count)
          : '',
      alertText: t(locale, 'tasks.callParent.alert'),
      primaryAction: {
        kind: 'contact',
        triggerLabel: t(locale, 'tasks.callParent.action'),
        title: name,
        message: t(locale, 'tasks.callParent.message').replace('{{name}}', name),
        // Synchronous on purpose — the payload already carries everything this needs
        // (§5.14's payload puts `contact_phone` on the wire precisely so a card never has
        // to look the guardian up a second time). `ContactFamiliesButton`'s own docs name
        // this exact shape: "a caller that already has its contacts synchronously
        // satisfies the same prop with `() => Promise.resolve(families)`."
        resolveFamilies: () =>
          Promise.resolve(
            payload.contact_person_id
              ? [{ person_id: payload.contact_person_id, name, phone: payload.contact_phone ?? null }]
              : [],
          ),
      },
      tick: {
        label: t(locale, 'tasks.callParent.tick'),
        onTick: () => onTick(row.id),
      },
    }
  })
}

/**
 * Manager row 1 — "cash waiting to be confirmed", `GET /payment-promises?status=pending`.
 * One card, not one per promise: the phone screen names the total and sends the manager
 * to the existing `#/cash` screen (`PaymentPromisesSection`) to actually decide each
 * one — that screen already lists every promise with its own amount and payer, and
 * repeating that list here would be a second, thinner copy of it rather than a task.
 */
export function cashPendingTasks(promises: StaffPromiseRow[], locale: Locale): TaskCard[] {
  if (promises.length === 0) return []
  const totalAgorot = promises.reduce((sum, promise) => sum + promise.total_agorot, 0)
  return [
    {
      id: 'cash-pending',
      taskKind: 'cash_pending',
      bucket: 'followUp',
      scope: t(locale, 'tasks.cash.scope'),
      badgeText: t(locale, 'tasks.cash.badge'),
      title: t(locale, 'tasks.cash.title'),
      subtitle: plural(locale, 'tasks.cash.count', promises.length),
      alertText: t(locale, 'tasks.cash.alert'),
      primaryAction: { kind: 'link', label: t(locale, 'tasks.cash.action'), href: '#/cash' },
      moneyAgorot: totalAgorot,
    },
  ]
}

/**
 * Manager row 2 — "health review pending", the `health.review_pending` /
 * `health.trial_flagged` notifications already sent to every manager
 * (`OnboardingService`/`TrialService`'s own `_managers_of_studio`). Both kinds' bodies
 * already carry the child's name and a plain-language summary
 * (`"{name} — הרישום ממתין לאישור מנהל"` / `"{name} — ... מסומנת לבדיקה (N תשובות)"`) —
 * never a question or an answer, per each enqueue site's own rule, so rendering `row.body`
 * verbatim carries nothing this file has to scrub.
 *
 * There is no staff-app screen that can approve or refuse the hold this notification is
 * about — that decision needs the health answers themselves, which stay behind the
 * dashboard's manager-only permission boundary (`PendingHealthReviewAlert.tsx`) and are
 * out of this checkpoint's scope entirely. The honest action available on a phone is
 * opening the child's own card, which both kinds' payloads carry a `student_id` for —
 * `onOpen` marks the notification read the moment that link is taken, the same shape
 * `AtRiskAlert` already uses for its own `tel:` link.
 */
export function healthReviewTasks(
  rows: NotificationOut[],
  locale: Locale,
  onOpen: (notificationId: string) => void,
): TaskCard[] {
  return rows.map((row) => {
    const studentId = (row.payload as { student_id?: string } | undefined)?.student_id ?? null
    const name = row.body.split(' — ')[0]?.trim() || row.body
    return {
      id: `health-review:${row.id}`,
      taskKind: 'health_review' as const,
      bucket: 'followUp' as const,
      scope: t(locale, 'tasks.healthReview.scope'),
      badgeText: t(locale, 'tasks.healthReview.badge'),
      title: name,
      subtitle: row.title,
      alertText: row.body,
      primaryAction: {
        kind: 'link' as const,
        label: t(locale, 'tasks.healthReview.action'),
        // Both HEALTH_REVIEW_PENDING and HEALTH_TRIAL_FLAGGED always carry `student_id`
        // (`app/services/people/onboarding.py`, `app/services/people/trials.py`) — the
        // account-tab fallback is defensive typing, not an expected path.
        href: studentId ? `#/students/${studentId}` : '#/account',
        onSelect: () => onOpen(row.id),
      },
    }
  })
}

/** The tab bar's badge and the screen's own "N open" line both want the same number —
 *  one function so the two can never disagree about what counts as open. */
export function openTaskCount(tasks: TaskCard[]): number {
  return tasks.length
}
