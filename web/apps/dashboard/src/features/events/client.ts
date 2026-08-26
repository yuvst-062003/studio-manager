// The manager dashboard's events endpoints, in one file. A screen with a fetch in it is a
// screen a test has to stand up a server for.
//
// **No call here writes a charge.** `charge_id` on a registration is READ; the ledger row
// behind it is M6's, created server-side by `BillingService.create_charge(kind='event')`
// when §5.8's confirmation completes. A client that could create one would be this lane
// writing a billing table through a longer pipe.
//
// Types come from `@studio/api-client`, which is generated from the API's own OpenAPI and
// never hand-edited. Hand-typing them here would be a second declaration of every shape,
// free to drift from the server the moment a field moves.
import type { components } from '@studio/api-client'

export type EventOut = components['schemas']['EventOut']
export type EventTargetOut = components['schemas']['EventTargetOut']
export type EventCreateIn = components['schemas']['EventCreateIn']
export type EventUpdateIn = components['schemas']['EventUpdateIn']
export type EventPublishedOut = components['schemas']['EventPublishedOut']
export type EventRegistrationOut = components['schemas']['EventRegistrationOut']
export type CandidateOut = components['schemas']['CandidateOut']
export type EventExamResultOut = components['schemas']['EventExamResultOut']
export type EventExamResultIn = components['schemas']['EventExamResultIn']
export type BeltRankOut = components['schemas']['BeltRankOut']

export type EventType = EventOut['type']
export type EventStatus = EventOut['status']
export type RsvpState = EventRegistrationOut['rsvp']

/**
 * The six the enum has, in the order `7a`'s filter bar reads them.
 *
 * **The canvas draws a different five** — competition, אימון מיוחד, מחנה, belt exam, אירוע
 * מועדון — of which three are not members, while seminar, joint training and trip are
 * members with no chip. `EVENT_TYPES` is a CHECK constraint in revision 0008 and a lane
 * never runs a migration, so the enum is what ships and the chips are built from it.
 */
export const EVENT_TYPES: readonly EventType[] = [
  'competition',
  'belt_exam',
  'seminar',
  'joint_training',
  'trip',
  'other',
]

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeDashboardEventsClient(fetcher: Fetcher) {
  return {
    /** `7a`. Filtered server-side: the list is cursor-paginated, so a browser-side filter
     *  would only ever filter the page it happens to be holding. */
    list: async (type?: EventType): Promise<Page<EventOut>> =>
      json(await fetcher(`/api/v1/events${type ? `?type=${type}` : ''}`)),

    read: async (eventId: string): Promise<EventOut> =>
      json(await fetcher(`/api/v1/events/${eventId}`)),

    create: async (body: EventCreateIn): Promise<EventOut> =>
      json(
        await fetcher('/api/v1/events', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      ),

    update: async (eventId: string, body: EventUpdateIn): Promise<EventOut> =>
      json(
        await fetcher(`/api/v1/events/${eventId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      ),

    /** Publishing materialises the roster (§5.8). It sends nothing — an invitation is a
     *  notification, and `NotificationService` is M8's. */
    publish: async (eventId: string): Promise<EventPublishedOut> =>
      json(await fetcher(`/api/v1/events/${eventId}/publish`, { method: 'POST' })),

    cancel: async (eventId: string): Promise<EventOut> =>
      json(await fetcher(`/api/v1/events/${eventId}/cancel`, { method: 'POST' })),

    /** `7c`'s participants table. `charge_id` arrives null for a coach (§3.2). */
    registrations: async (eventId: string): Promise<Page<EventRegistrationOut>> =>
      json(await fetcher(`/api/v1/events/${eventId}/registrations`)),

    /** `4d` and `6b`. Rank and tenure only — see `CandidateOut`'s server-side docstring. */
    eligibility: async (eventId: string): Promise<Page<CandidateOut>> =>
      json(await fetcher(`/api/v1/events/${eventId}/eligibility`)),

    /** `9d` frame 2 and `4d`'s promote button. One call per save, because §5.9 step 3 is
     *  one transaction: a per-row call would half-promote a roster. */
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

export type DashboardEventsClient = ReturnType<typeof makeDashboardEventsClient>
