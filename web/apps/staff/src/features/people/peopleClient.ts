// The staff app's endpoint paths, in one file — same reason the parent app has one.
import type { components } from '@studio/api-client'

export type StudentSummary = components['schemas']['StudentSummaryOut']
/** The paged envelope `GET /students` answers with — `search` below reads it to the end. */
export type StudentSummaryPage = components['schemas']['CursorPage_StudentSummaryOut_']
export type StudentDetail = components['schemas']['StudentDetailOut']
export type EnrollmentOut = components['schemas']['EnrollmentOut']
export type WeekdayOptions = components['schemas']['EnrollmentWeekdayOptionsOut']
export type GroupOut = components['schemas']['GroupOut']
/** The account tab's own record — the same `/me/profile` route the parent app's profile
 *  tab already edits. No role dependency (the route's own docstring says why), so a coach
 *  corrects their own name, email and phone through it exactly as a guardian does. */
export type MyProfile = components['schemas']['MyProfileOut']
export type MyProfileUpdate = components['schemas']['MyProfileUpdate']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeStaffPeopleClient(fetcher: Fetcher) {
  return {
    /** Staff `9h`. §3.2 scopes a coach to their own groups server-side, not here.
     *
     *  **Reads every page, because this screen's answer is the whole roster.** The request
     *  used to send no `limit` and ignore `next_cursor`, so it got the server's default
     *  page of 50 — and a club with more children than that lost the rest silently: 72
     *  loaded, 50 drawn, and each class heading counting only what had arrived rather than
     *  who trains there (Gladiator, 2026-10-12). A coach looking for a child who is not in
     *  the first fifty was told, in effect, that the child is not in the club.
     *
     *  `PAGE` is the server's own `MAX_PAGE_SIZE`, so a club of any ordinary size is one
     *  request and the loop never runs a second time. `MAX_PAGES` is a guard against a
     *  cursor that never advances — a bug on either side would otherwise fetch forever. */
    search: async (query: string, groupId?: string): Promise<{ items: StudentSummary[] }> => {
      const PAGE = 200
      const MAX_PAGES = 25
      const base = `/api/v1/students?q=${encodeURIComponent(query)}${
        groupId ? `&group_id=${groupId}` : ''
      }&limit=${PAGE}`

      const items: StudentSummary[] = []
      let after: string | null = null
      const seen = new Set<string>()
      for (let read = 0; read < MAX_PAGES; read += 1) {
        const body: StudentSummaryPage = await fetcher(
          after ? `${base}&after=${encodeURIComponent(after)}` : base,
        ).then(json<StudentSummaryPage>)
        items.push(...body.items)
        const next = body.next_cursor ?? null
        // A repeated cursor means the server is not advancing; taking it again would
        // re-read the same page until MAX_PAGES, and duplicate every child in the list.
        if (next === null || seen.has(next)) break
        seen.add(next)
        after = next
      }
      return { items }
    },

    /** 9h's class tabs. The same scoping note applies: a coach receives their own. */
    groups: (): Promise<{ items: GroupOut[] }> =>
      fetcher('/api/v1/groups').then(json<{ items: GroupOut[] }>),

    /** 9e's identity block — the groups the CALLER coaches, from `group_staff`. */
    myGroups: (): Promise<{ items: GroupOut[] }> =>
      fetcher('/api/v1/groups?mine=true').then(json<{ items: GroupOut[] }>),

    /** The account tab's profile card — this coach's own name, email and phone. */
    myProfile: (): Promise<MyProfile> => fetcher('/api/v1/me/profile').then(json<MyProfile>),

    /** The edit sheet's save. Role and belt grade are not in `MyProfileUpdate` at all —
     *  there is no shape in which this call could touch either. */
    updateMyProfile: (body: MyProfileUpdate): Promise<MyProfile> =>
      fetcher('/api/v1/me/profile', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }).then(json<MyProfile>),

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
