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
/** One attendance mark, as `GET /students/{id}/attendance` returns it. */
export type AttendanceMarkRow = components['schemas']['AttendanceOut']
/** Only what `3c`'s picker renders. M1 owns `GroupOut`; naming the two fields this screen
 *  reads keeps the form independent of fields another lane may add or move. */
export type GroupOption = { id: string; name: string }

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

    /**
     * `4a`'s attendance strip. Built, manager-scoped, and called by NOTHING until now — the
     * card carried four sections and could not answer "has she been coming?", which is the
     * question a manager asks about a child immediately before telephoning their parent.
     *
     * The default page is taken as-is rather than asking for `4a`'s twelve: `2d` and `4a`
     * disagree on the window (2d finding 9) and the route deliberately bakes neither in, so
     * the screen trims what it draws instead of the server deciding for both surfaces.
     */
    attendance: (studentId: string) =>
      fetcher(`/api/v1/students/${studentId}/attendance`).then(
        json<{ items: AttendanceMarkRow[]; next_cursor: string | null; has_more: boolean }>,
      ),

    /** M1's group list. `3c` needs it because §5.4(a)'s form asks for a group, and the
     *  enrolment it creates has to name one that exists. */
    groups: () => fetcher('/api/v1/groups').then(json<{ items: GroupOption[] }>),

    weekdayOptions: (groupId: string) =>
      fetcher(`/api/v1/enrollments/weekday-options?group_id=${groupId}`).then(
        json<WeekdayOptions>,
      ),

    /** §5.4(a) — `+ תלמיד חדש`. One request: parent details AND child details (`3c`). */
    createStudent: (body: {
      first_name: string
      last_name: string
      birthdate?: string | null
      /** §5.4(a) — 'child details AND GROUP ... creates everything immediately'. Absent
       *  leaves a lead with no enrollment, which is the phone-enquiry case. */
      group_id?: string | null
      /** C12 — NULL means every session of that group, which is the default. */
      attends_weekdays?: number[] | null
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

    // -- 6c's queue -----------------------------------------------------------
    // The registration approval queue is gone (2026-08-30): nothing produces a pending row
    // any more, so a list read and two decision posts stood over something that could never
    // fill. The trial queue below is the funnel's remaining decision.
    trialBookings: (outcome?: string) =>
      fetcher(`/api/v1/trial-bookings${outcome ? `?outcome=${outcome}` : ''}`).then(
        json<{ items: TrialBookingRow[] }>,
      ),
  }
}

export type DashboardPeopleClient = ReturnType<typeof makeDashboardPeopleClient>
