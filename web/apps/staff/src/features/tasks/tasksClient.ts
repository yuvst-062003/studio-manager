// The one genuinely new fetch this checkpoint needs. Everything else the tasks tab reads
// — sessions, cached rosters, the at-risk inbox, pending cash promises — already has a
// client somewhere else in this app (`../schedule/client`, `@studio/core`'s offline
// module, `../comms`, `../billing/promiseClient`) and is reused rather than re-wrapped
// here; see `useOpenTasks.ts` for where each one is actually called.
//
// `GET /notifications` takes one `kind` per call (`app/routers/comms.py::list_notifications`),
// so the two manager-only kinds §4.4 names — `health.review_pending` and
// `health.trial_flagged` — need two requests, not one. That is the entire reason this
// file exists: nothing else in the app currently asks for either kind.
import { apiFetch } from '@studio/core'
import type { components } from '@studio/api-client'

export type NotificationOut = components['schemas']['NotificationOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/** `app/services/comms/kinds.py::HEALTH_REVIEW_PENDING` — task 4a's enrolment hold. */
export const HEALTH_REVIEW_PENDING_KIND = 'health.review_pending'
/** `app/services/comms/kinds.py::HEALTH_TRIAL_FLAGGED` — a trial declaration answered yes. */
export const HEALTH_TRIAL_FLAGGED_KIND = 'health.trial_flagged'

export function makeTasksClient(fetcher: Fetcher = apiFetch) {
  return {
    /** Both kinds, unread, merged — order is not meaningful here the way
     *  {@link import('../comms').byMostMissed} makes it meaningful for at-risk rows, so
     *  this does not sort them. */
    async healthReviewNotifications(): Promise<NotificationOut[]> {
      const [review, trial] = await Promise.all([
        fetcher(`/api/v1/notifications?unread=true&kind=${HEALTH_REVIEW_PENDING_KIND}`).then(
          json<{ items: NotificationOut[] }>,
        ),
        fetcher(`/api/v1/notifications?unread=true&kind=${HEALTH_TRIAL_FLAGGED_KIND}`).then(
          json<{ items: NotificationOut[] }>,
        ),
      ])
      return [...review.items, ...trial.items]
    },
  }
}

export type TasksClient = ReturnType<typeof makeTasksClient>
