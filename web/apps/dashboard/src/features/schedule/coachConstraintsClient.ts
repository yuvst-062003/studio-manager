// C12 of the staff app redesign (§5, decisions 10–12) — the manager's side of §6.1's coach
// unavailability. `app/routers/coach_constraints.py` is the source of truth for every shape
// and status code here; read that file and `app/services/schedule/constraints.py` before
// changing this one.
//
// Hand-written for the same reason `./client.ts` is (see that file's own header):
// `@studio/api-client` reflects an OpenAPI spec regenerated after a router lands, and this
// router has not gone through that cycle yet.
//
// **A separate file from `./client.ts` rather than widening `ScheduleClient`.** That
// interface is hand-mocked in half a dozen existing tests (WeekBoard, ScheduleSection,
// GroupSchedulePage…) that know nothing about coach constraints; adding required methods to
// it would break every one of those mocks for a feature none of those screens touch. This
// file only reuses `./client.ts`'s `Fetcher` type, and the resolution popup takes a
// `ScheduleClient` alongside this one for the three session-level actions (§5: "the existing
// `PATCH /sessions/{id}`", "the existing `POST /sessions/{id}/cancel`").
import type { Fetcher } from './client'

/** `app/models/schedule.py::COACH_CONSTRAINT_REASONS`. A code — the client renders the
 *  label, never the server (the same rule the staff app's own constraints client states). */
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

/** Mirrors `app/schemas/schedule.py::StaffAvailabilityRow`. Decision 12: no ranking, and
 *  `available: false` is a real row, not a filtered-out one. */
export interface StaffAvailabilityRow {
  person_id: string
  display_name: string
  roles: string[]
  available: boolean
}

/** `{ person_id, first_name, last_name }` off `GET /api/v1/staff` — the same endpoint
 *  `SessionPopover.tsx` and `GroupCoachPanel.tsx` already read to resolve a name from an id.
 *  Coach constraints carry only `person_id`; this is how the queue and the popup show who
 *  actually filed one. */
export interface StaffDirectoryRow {
  person_id: string | null
  first_name: string | null
  last_name: string | null
}

/** Thrown by every call below on a non-2xx response.
 *
 * §5's "refuse rather than half-do": a chosen substitute the server 422s for being
 * unavailable or not staff here must be SHOWN, not swallowed back down to a bare status
 * code — `message` carries the API's own `detail.message` whenever the server sent one,
 * and `code` its machine-readable `detail.code` (`not_staff` | `unavailable`), matching
 * `app/routers/coach_constraints.py::_SUBSTITUTE_MESSAGES`.
 */
export class CoachConstraintApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message)
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = String(response.status)
    let code: string | null = null
    try {
      const body = (await response.json()) as { detail?: { code?: string; message?: string } }
      if (body?.detail?.message) message = body.detail.message
      if (body?.detail?.code) code = body.detail.code
    } catch {
      // No JSON body to read (or it did not match the shape) — the plain status stands.
    }
    throw new CoachConstraintApiError(message, response.status, code)
  }
  return (await response.json()) as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export interface CoachConstraintClient {
  /** `GET /coach-constraints?status=pending` — the queue behind the alert. Manager/owner
   *  only; a coach's 403 is treated as "nothing pending" by the caller, the same way
   *  `AtRiskAlert` already swallows a role-gated read into an empty list. */
  listPending(): Promise<CoachConstraintRow[]>
  /** `GET /api/v1/staff` — for resolving a filer's or a substitute's name. */
  listStaff(): Promise<StaffDirectoryRow[]>
  /** `GET /staff/available?from&to` — decision 12, verbatim: everyone, with a flag. */
  staffAvailable(fromAt: string, toAt: string): Promise<StaffAvailabilityRow[]>
  /** `POST /coach-constraints/{id}/approve`. Omitting `substitutePersonId` (the default,
   *  `undefined`) leaves whatever the filer already suggested untouched, matching
   *  `CoachConstraintApprove`'s own "absence is not null" rule; passing `null` clears it,
   *  and a real id is validated by the server first and 422s as `CoachConstraintApiError`
   *  when it is refused. */
  approve(id: string, substitutePersonId?: string | null): Promise<CoachConstraintRow>
  /** `POST /coach-constraints/{id}/refuse`. The coach is told either way (§6.1's own
   *  notification, not this client's concern) — this only carries the reason. */
  refuse(id: string, reason: string): Promise<CoachConstraintRow>
}

export function makeCoachConstraintClient(fetcher: Fetcher): CoachConstraintClient {
  return {
    async listPending() {
      // 200 — the same ceiling `./constraintsClient.ts` (staff app) uses for one coach's
      // own history: far above any one studio's live queue, and still bounded.
      const body = await json<{ items: CoachConstraintRow[] }>(
        await fetcher('/api/v1/coach-constraints?status=pending&limit=200'),
      )
      return body.items
    },
    async listStaff() {
      const response = await fetcher('/api/v1/staff')
      if (!response.ok) return []
      const body = (await response.json()) as { items: StaffDirectoryRow[] }
      return body.items
    },
    async staffAvailable(fromAt, toAt) {
      const params = new URLSearchParams({ from: fromAt, to: toAt })
      const body = await json<{ items: StaffAvailabilityRow[] }>(
        await fetcher(`/api/v1/staff/available?${params.toString()}`),
      )
      return body.items
    },
    async approve(id, substitutePersonId) {
      const body: Record<string, unknown> = {}
      if (substitutePersonId !== undefined) body.substitute_person_id = substitutePersonId
      return json<CoachConstraintRow>(
        await fetcher(`/api/v1/coach-constraints/${id}/approve`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      )
    },
    async refuse(id, reason) {
      return json<CoachConstraintRow>(
        await fetcher(`/api/v1/coach-constraints/${id}/refuse`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ reason }),
        }),
      )
    },
  }
}

/** `${first} ${last}`.trim() — the same fallback `SessionPopover.tsx` and
 *  `GroupCoachPanel.tsx` use for a staff row with no formatted name attached. */
export function staffDisplayName(row: StaffDirectoryRow): string {
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()
}
