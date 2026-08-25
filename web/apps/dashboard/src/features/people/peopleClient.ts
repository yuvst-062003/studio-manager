// The dashboard's endpoint paths, in one file.
import type { components } from '@studio/api-client'

export type StudentSummary = components['schemas']['StudentSummaryOut']
export type StudentDetail = components['schemas']['StudentDetailOut']
export type StudentPricePlan = components['schemas']['StudentPricePlanOut']
export type EnrollmentOut = components['schemas']['EnrollmentOut']
export type WeekdayOptions = components['schemas']['EnrollmentWeekdayOptionsOut']
export type RegistrationRequestOut = components['schemas']['RegistrationRequestOut']
export type TrialBookingRow = components['schemas']['TrialBookingRow']
export type StatusHistoryOut = components['schemas']['StudentStatusHistoryOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type StudentFilters = {
  q?: string
  status?: string
  group_id?: string
  health_status?: string
  after?: string
}

export function makeDashboardPeopleClient(fetcher: Fetcher) {
  return {
    /** Dashboard `3b`. Cursor-paginated (G16) — `after` is the previous page's cursor. */
    students: (filters: StudentFilters = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
      return fetcher(`/api/v1/students?${query.toString()}`).then(
        json<{ items: StudentSummary[]; next_cursor: string | null; has_more: boolean }>,
      )
    },

    student: (id: string) => fetcher(`/api/v1/students/${id}`).then(json<StudentDetail>),

    /**
     * C11's two numbers, manager-scoped. Never coach-reachable — `price_plan_id` is what
     * invariant 3's detector reads as a financial field, which is why it lives behind its
     * own route instead of on the card.
     */
    pricePlan: (id: string) =>
      fetcher(`/api/v1/students/${id}/price-plan`).then(json<StudentPricePlan>),

    enrollments: (studentId: string) =>
      fetcher(`/api/v1/enrollments?student_id=${studentId}`).then(json<EnrollmentOut[]>),

    statusHistory: (studentId: string) =>
      fetcher(`/api/v1/students/${studentId}/status-history`).then(
        json<{ items: StatusHistoryOut[] }>,
      ),

    weekdayOptions: (groupId: string) =>
      fetcher(`/api/v1/enrollments/weekday-options?group_id=${groupId}`).then(
        json<WeekdayOptions>,
      ),

    /** §5.4(a) — `+ תלמיד חדש`. One request: parent details AND child details (`3c`). */
    createStudent: (body: {
      first_name: string
      last_name: string
      birthdate?: string | null
      guardian: {
        first_name: string
        last_name: string
        email?: string | null
        phone?: string | null
        relation?: string
      }
    }) =>
      fetcher('/api/v1/students', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    /** §5.4a step 5 — group, price and start date, in one decision. */
    convert: (
      studentId: string,
      body: {
        group_id: string
        started_on: string
        price_plan_id?: string | null
        attends_weekdays?: number[] | null
      },
    ) =>
      fetcher(`/api/v1/students/${studentId}/convert`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    markLost: (studentId: string, reason: string) =>
      fetcher(`/api/v1/students/${studentId}/mark-lost`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason }),
      }),

    freeze: (studentId: string, body: { from_date: string; to_date?: string | null }) =>
      fetcher(`/api/v1/students/${studentId}/freeze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    // -- 6c's queues ---------------------------------------------------------
    pendingRequests: () =>
      fetcher('/api/v1/registration-requests?status=pending').then(
        json<{ items: RegistrationRequestOut[] }>,
      ),

    trialBookings: (outcome?: string) =>
      fetcher(`/api/v1/trial-bookings${outcome ? `?outcome=${outcome}` : ''}`).then(
        json<{ items: TrialBookingRow[] }>,
      ),

    approve: (requestId: string, groupId: string) =>
      fetcher(`/api/v1/registration-requests/${requestId}/approve`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ group_id: groupId }),
      }),

    reject: (requestId: string, reason: string) =>
      fetcher(`/api/v1/registration-requests/${requestId}/reject`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason }),
      }),
  }
}

export type DashboardPeopleClient = ReturnType<typeof makeDashboardPeopleClient>
