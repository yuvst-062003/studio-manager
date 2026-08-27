// The staff app's events endpoints.
//
// A narrower client than the dashboard's on purpose: §3.2 gives a coach "Create events"
// only at lead_coach, "Record belt exam results" at the same line, and NO money at all. The
// methods a coach cannot use are not here — a client is a statement about what this app
// does, and one carrying a charge call would be a statement this app should never make.
import type { components } from '@studio/api-client'

export type EventOut = components['schemas']['EventOut']
export type CandidateOut = components['schemas']['CandidateOut']
export type EventExamResultIn = components['schemas']['EventExamResultIn']
export type EventExamResultOut = components['schemas']['EventExamResultOut']
export type EventRegistrationOut = components['schemas']['EventRegistrationOut']
export type EventType = EventOut['type']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeStaffEventsClient(fetcher: Fetcher) {
  return {
    list: async (type?: EventType): Promise<Page<EventOut>> =>
      json(await fetcher(`/api/v1/events${type ? `?type=${type}` : ''}`)),

    read: async (eventId: string): Promise<EventOut> =>
      json(await fetcher(`/api/v1/events/${eventId}`)),

    registrations: async (eventId: string): Promise<Page<EventRegistrationOut>> =>
      json(await fetcher(`/api/v1/events/${eventId}/registrations`)),

    /** 9i's `שליחה` — publish materialises the roster at `rsvp='pending'`. NOTHING is
     *  sent by wire: publishing makes the event visible to guardians, which is what
     *  "sending invitations" is in a product with no mailer. */
    publish: async (eventId: string): Promise<Response> =>
      fetcher(`/api/v1/events/${eventId}/publish`, { method: 'POST', headers: JSON_HEADERS }),

    /** 9d frame 2's candidate list, with each row already resolved to a current → next. */
    eligibility: async (eventId: string): Promise<Page<CandidateOut>> =>
      json(await fetcher(`/api/v1/events/${eventId}/eligibility`)),

    /** ONE call per save. §5.9 step 3 is one transaction; a per-row call would leave a
     *  half-promoted roster and a coach with no way to tell which half. */
    recordResults: async (
      eventId: string,
      results: EventExamResultIn[],
    ): Promise<Page<EventExamResultOut>> =>
      json(
        await fetcher(`/api/v1/events/${eventId}/exam-results`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ results }),
        }),
      ),

    markAttendance: async (
      eventId: string,
      marks: { student_id: string; attended: boolean }[],
    ): Promise<{ marked: number }> =>
      json(
        await fetcher(`/api/v1/events/${eventId}/attendance`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ marks }),
        }),
      ),
  }
}

export type StaffEventsClient = ReturnType<typeof makeStaffEventsClient>
