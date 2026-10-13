// §6.1 of the staff app redesign — `#/constraints`'s own client.
//
// Mirrors `app/schemas/schedule.py`'s `CoachConstraint*` shapes and
// `app/routers/coach_constraints.py`, hand-written for the same reason
// `../schedule/client.ts` is: `@studio/api-client` reflects an OpenAPI spec regenerated
// after a router lands, and this one has not gone through that yet. This collapses into
// the generated client at that point, same as that file's own header says.
import { apiFetch } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** `app/models/schedule.py::COACH_CONSTRAINT_REASONS`. A code — the client renders the
 *  label, never the server. */
export type CoachConstraintReason =
  | 'reserve_duty'
  | 'competition'
  | 'studies'
  | 'illness'
  | 'vacation'
  | 'family'
  | 'other'

/** `app/models/schedule.py::COACH_CONSTRAINT_STATUSES`. */
export type CoachConstraintStatus = 'pending' | 'approved' | 'refused' | 'withdrawn'

/** Mirrors `app/schemas/schedule.py::CoachConstraintOut`. */
export interface CoachConstraintRow {
  id: string
  person_id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  reason: CoachConstraintReason
  note: string | null
  status: CoachConstraintStatus
  substitute_person_id: string | null
  decided_by_person_id: string | null
  decided_at: string | null
}

/** Mirrors `app/schemas/schedule.py::CoachConstraintCreate`. */
export interface CoachConstraintInput {
  starts_at: string
  ends_at: string
  all_day: boolean
  reason: CoachConstraintReason
  note?: string | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

export interface CoachConstraintsClient {
  /** `GET /coach-constraints?mine=true` — the caller's own history, every status. */
  listMine(): Promise<CoachConstraintRow[]>
  /** `POST /coach-constraints` — always lands `pending`. */
  file(input: CoachConstraintInput): Promise<CoachConstraintRow>
  /** `DELETE /coach-constraints/{id}` — a status change, not a row deletion. */
  withdraw(id: string): Promise<CoachConstraintRow>
}

export function makeCoachConstraintsClient(fetcher: Fetcher = apiFetch): CoachConstraintsClient {
  return {
    async listMine() {
      // 200 is `/staff`'s own ceiling reasoning: far above any one coach's real filing
      // history, and still bounded.
      const response = await fetcher('/api/v1/coach-constraints?mine=true&limit=200')
      const body = await json<{ items: CoachConstraintRow[] }>(response)
      return body.items
    },
    async file(input) {
      const response = await fetcher('/api/v1/coach-constraints', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      })
      return json<CoachConstraintRow>(response)
    },
    async withdraw(id) {
      const response = await fetcher(`/api/v1/coach-constraints/${id}`, { method: 'DELETE' })
      return json<CoachConstraintRow>(response)
    },
  }
}
