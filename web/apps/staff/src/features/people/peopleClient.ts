// The staff app's endpoint paths, in one file — same reason the parent app has one.
import type { components } from '@studio/api-client'

export type StudentSummary = components['schemas']['StudentSummaryOut']
export type StudentDetail = components['schemas']['StudentDetailOut']
export type EnrollmentOut = components['schemas']['EnrollmentOut']
export type WeekdayOptions = components['schemas']['EnrollmentWeekdayOptionsOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeStaffPeopleClient(fetcher: Fetcher) {
  return {
    /** Staff `9h`. §3.2 scopes a coach to their own groups server-side, not here. */
    search: (query: string): Promise<{ items: StudentSummary[] }> =>
      fetcher(`/api/v1/students?q=${encodeURIComponent(query)}`).then(
        json<{ items: StudentSummary[] }>,
      ),

    student: (id: string): Promise<StudentDetail> =>
      fetcher(`/api/v1/students/${id}`).then(json<StudentDetail>),

    enrollments: (studentId: string): Promise<EnrollmentOut[]> =>
      fetcher(`/api/v1/enrollments?student_id=${studentId}`).then(json<EnrollmentOut[]>),

    /**
     * C12's checkboxes. L5 — the days come through `ScheduleService.materialize_sessions()`,
     * so an empty list means "this group has no timetable yet" and the form says exactly
     * that rather than rendering an unexplained empty row.
     */
    weekdayOptions: (groupId: string): Promise<WeekdayOptions> =>
      fetcher(`/api/v1/enrollments/weekday-options?group_id=${groupId}`).then(
        json<WeekdayOptions>,
      ),

    /** Staff `9c`'s מעבר כיתה — end one enrollment, open another. */
    endEnrollment: (enrollmentId: string, endedOn: string) =>
      fetcher(`/api/v1/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: 'ended', ended_on: endedOn }),
      }),

    enrol: (body: {
      student_id: string
      group_id: string
      started_on: string
      attends_weekdays?: number[] | null
    }) =>
      fetcher('/api/v1/enrollments', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    /** Staff `11b` — §5.4a: 'A manager can also log a phone enquiry, producing the same rows.' */
    logTrial: (body: {
      group_id: string
      session_id?: string | null
      child: { first_name: string; last_name: string; birthdate?: string | null }
      guardian: { first_name: string; last_name: string; phone?: string | null; email?: string | null }
    }) =>
      fetcher('/api/v1/trial-bookings', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),
  }
}

export type StaffPeopleClient = ReturnType<typeof makeStaffPeopleClient>
