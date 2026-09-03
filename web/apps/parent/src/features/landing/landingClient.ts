// The only file in the parent app that knows the public endpoint paths, for the same reason
// @studio/ui's setup-wizard/client.ts is the only one that knows the setup paths: a screen
// with a fetch in it is a screen a test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client), never hand-written duplicates
// — SPEC §8.2 regenerates it from openapi.json and fails CI on a stale copy, so a
// hand-rolled shape here would be a second definition nothing keeps in step.
import type { components } from '@studio/api-client'

export type PublicLanding = components['schemas']['PublicLandingOut']
export type PublicGroup = components['schemas']['PublicGroupOut']
export type TrialSlot = components['schemas']['TrialSlotOut']
export type BookingResult = components['schemas']['TrialBookingSelfResult']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export type BookingRequest = {
  /** Who is booking, when nobody signed in (owner's decision 2026-08-31 — a first lesson
   *  is booked with a form). Omitted for a signed-in parent, whose provider-verified
   *  address the server uses instead and which a typed one must never override. */
  guardian?: {
    first_name: string
    last_name: string
    email: string
    phone: string | null
  }
  /** §5.4a steps 2 and 4 are asked PER CHILD — the group list is filtered by each child's
   *  age, so siblings of different ages are the case the picker exists for. The request
   *  root still accepts a `group_id`/`session_id` pair as a default for a per-group QR,
   *  but this client always sends the choice with the child it belongs to. */
  children: {
    first_name: string
    last_name: string
    birthdate?: string | null
    group_id: string
    session_id?: string | null
  }[]
  //: F21, closed: one entry per child, the REAL declaration collected through the same
  //: popup every other door uses (`template_id`/`answers`/`signature_image_base64`) --
  //: never the hardcoded `{ confirmed: true }` this door used to send regardless of what
  //: the parent ticked.
  trial_health_declarations: Record<string, unknown>[]
  //: §2 decision 5 -- the welcome screen's three ticks, deferred into this one write
  //: because an anonymous caller has no authenticated route to record them through.
  agreements_accepted: boolean
}

/** What a failed booking means, in terms the page can render. */
export type BookingError = 'already_used' | 'rate_limited' | 'schedule_unavailable' | 'generic'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeLandingClient(fetcher: Fetcher) {
  return {
    landing: (slug: string): Promise<PublicLanding> =>
      fetcher(`/api/v1/public/studios/${slug}/landing`).then(json<PublicLanding>),

    trialSlots: (groupId: string): Promise<{ items: TrialSlot[] }> =>
      fetcher(`/api/v1/public/groups/${groupId}/trial-slots`).then(
        json<{ items: TrialSlot[] }>,
      ),

    book: (body: BookingRequest): Promise<Response> =>
      fetcher('/api/v1/trial-bookings/self', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),
  }
}

export type LandingClient = ReturnType<typeof makeLandingClient>

/** Maps a failed booking response onto the one sentence the parent should read. */
export function bookingErrorFor(status: number, code?: string): BookingError {
  if (status === 409 || code === 'trial_already_used') return 'already_used'
  if (status === 429 || code === 'too_many_bookings') return 'rate_limited'
  if (status === 503 || code === 'schedule_unavailable') return 'schedule_unavailable'
  return 'generic'
}
