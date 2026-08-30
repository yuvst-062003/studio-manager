// The parent app's training-plan endpoints, in one file — the same shape and the same
// reason as `billingClient.ts`: a screen with a fetch in it is a screen a test has to
// stand up a server for.
//
// Types come from the generated client (@studio/api-client), which §8.2 regenerates from
// openapi.json and fails CI on a stale copy.
//
// **G2 — every amount crossing this boundary is an integer count of agorot.** Nothing here
// divides by 100.
import type { components } from '@studio/api-client'

export type TrainingPlanView = components['schemas']['TrainingPlanOut']
export type PlanOption = components['schemas']['PlanOptionOut']
export type BookableSession = components['schemas']['BookableSessionOut']
export type PlanChange = components['schemas']['PlanChangeOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type TrainingPlanClient = {
  read(studentId: string): Promise<TrainingPlanView>
  mark(studentId: string, sessionId: string): Promise<void>
  release(bookingId: string): Promise<void>
  requestPlan(studentId: string, planId: string): Promise<void>
  cancelChange(studentId: string, changeId: string): Promise<void>
  /** The plan picker's "already paid" — a payment promise claiming this program, priced
   *  by the server from the plan row. The manager confirms or declines it. */
  claimPaid(planId: string, method: 'cash' | 'cheque' | 'standing_order'): Promise<void>
}

export function makeTrainingPlanClient(fetcher: Fetcher): TrainingPlanClient {
  return {
    async read(studentId) {
      return json<TrainingPlanView>(
        await fetcher(`/api/v1/students/${studentId}/training-plan`),
      )
    },
    async mark(studentId, sessionId) {
      await json(
        await fetcher('/api/v1/session-bookings', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ student_id: studentId, session_id: sessionId }),
        }),
      )
    },
    // No student id: the booking already names one, and the server checks it belongs to
    // this caller's family. Sending it again would be a second, disagreeable source.
    async release(bookingId) {
      await json(
        await fetcher(`/api/v1/session-bookings/${bookingId}`, { method: 'DELETE' }),
      )
    },
    async requestPlan(studentId, planId) {
      await json(
        await fetcher(`/api/v1/students/${studentId}/plan-changes`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ to_price_plan_id: planId }),
        }),
      )
    },
    async cancelChange(studentId, changeId) {
      await json(
        await fetcher(`/api/v1/students/${studentId}/plan-changes/${changeId}`, {
          method: 'DELETE',
        }),
      )
    },
    async claimPaid(planId, method) {
      await json(
        await fetcher('/api/v1/me/payment-promises', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ claimed_plan_id: planId, method }),
        }),
      )
    },
  }
}
