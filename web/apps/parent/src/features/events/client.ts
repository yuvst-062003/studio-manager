// The parent app's events endpoints.
//
// **Narrow on purpose.** A guardian answers for their own children and signs a consent, and
// that is the whole surface. §3.2 resolves the guardian column per-record rather than by
// grant, so every one of these is scoped server-side by "which children does this identity
// answer for" — a client method that took a studio-wide list would be asking a question the
// API is right to refuse.
//
// **`charge_id` is read, never written.** The fee becomes a charge server-side when §5.8's
// confirmation completes. A parent app that could create one would be M7 writing a billing
// table through the longest pipe available.
import type { components } from '@studio/api-client'

export type ParentEventOut = components['schemas']['ParentEventOut']
export type EventOut = components['schemas']['EventOut']
export type EventRegistrationOut = components['schemas']['EventRegistrationOut']
export type RegistrationAnswerOut = components['schemas']['RegistrationAnswerOut']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeParentEventsClient(fetcher: Fetcher) {
  return {
    /** 12h. One row per child per event — a family with two children on one competition
     *  sees one event and two answers. Drafts never appear (§4.3), filtered server-side. */
    myEvents: async (): Promise<Page<ParentEventOut>> => json(await fetcher('/api/v1/me/events')),

    /** `pending` is not accepted: it is the ABSENCE of an answer, and letting a client send
     *  it would make "un-answer" a supported action the office then has to interpret. */
    answer: async (
      eventId: string,
      studentId: string,
      rsvp: 'yes' | 'no',
    ): Promise<RegistrationAnswerOut> =>
      json(
        await fetcher(`/api/v1/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ student_id: studentId, rsvp }),
        }),
      ),

    /** The consent §5.8 requires before an RSVP counts as confirmed. The body names the
     *  child and NOT the wording: the text lives on the event, and a signature carrying its
     *  own would let a client sign something the manager never wrote. */
    signConsent: async (eventId: string, studentId: string): Promise<RegistrationAnswerOut> =>
      json(
        await fetcher(`/api/v1/events/${eventId}/consent`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ student_id: studentId }),
        }),
      ),
  }
}

export type ParentEventsClient = ReturnType<typeof makeParentEventsClient>

/**
 * §5.8's gate, for the screen.
 *
 * `RsvpService.is_confirmed` on the server is the definition and `ParentEventOut.confirmed`
 * carries its answer — this is the same rule applied to a LOCAL edit, before a round trip,
 * so the confirm button can be disabled the moment a parent looks at it rather than after
 * they press it.
 */
export function blocksConfirmation(event: EventOut, registration: EventRegistrationOut): boolean {
  return event.requires_consent && registration.consent_signed_at === null
}

/** §5.8's `rsvp_deadline`. Past it, there is nothing to answer. */
export function deadlinePassed(event: EventOut, now: string): boolean {
  return event.rsvp_deadline !== null && Date.parse(now) > Date.parse(event.rsvp_deadline)
}
