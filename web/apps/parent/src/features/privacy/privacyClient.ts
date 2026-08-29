// §11's parent-facing endpoints, in one file. A screen with a fetch in it is a screen a
// test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client) — SPEC §8.2 regenerates it
// from openapi.json and fails CI on a stale copy, so a hand-written shape here would be a
// second definition nothing keeps in step.
//
// **Nothing in this file logs.** §11.7 and G7: the consent state carries a version and a
// timestamp and no policy text, and a failed request carries a reason written for a person
// to read — neither belongs in a console line that survives in a support ticket.
import type { components } from '@studio/api-client'

export type ConsentState = components['schemas']['ConsentStateOut']
export type ConsentRecord = components['schemas']['ConsentRecordOut']
export type PrivacyRequest = components['schemas']['PrivacyRequestOut']
export type PrivacyRequests = components['schemas']['PrivacyRequestsOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/** The two consents §6.1 step 5 blocks on, in the order the gate asks for them. */
export const REQUIRED_CONSENTS = ['terms', 'privacy'] as const

/**
 * A shape the gate can safely treat as "nothing outstanding".
 *
 * The shell's other tests stub `fetch` to answer `{items: []}` for every URL they do not
 * recognise, and a real network can answer anything at all. Reading `outstanding` off such
 * a body yields `undefined`, and `undefined.length` in a gate is a blank screen where a
 * family's app used to be — so the parse is total and a body that is not a consent state
 * stands the gate aside. See `ConsentGate`'s header for why standing aside is the right
 * direction on a failure.
 */
export function readConsentState(body: unknown): ConsentState | null {
  if (typeof body !== 'object' || body === null) return null
  const candidate = body as Partial<ConsentState>
  if (!Array.isArray(candidate.outstanding) || typeof candidate.policy_version !== 'number') {
    return null
  }
  return candidate as ConsentState
}

export function makePrivacyClient(fetcher: Fetcher) {
  return {
    /** §6.1 step 5's read, about the caller and nobody else — the route takes no id. */
    consents: (): Promise<ConsentState | null> =>
      fetcher('/api/v1/privacy/consents')
        .then(json<unknown>)
        .then(readConsentState),

    /**
     * Append one decision per entry. `false` withdraws, and the server writes a NEW row
     * either way — §11.6's ledger is never edited.
     *
     * `version` is the one the CLIENT rendered. The server answers 409 if the published
     * text has moved on, which is what stops a stale tab recording an agreement to wording
     * nobody was shown.
     */
    grant: (version: number, grants: Record<string, boolean>): Promise<ConsentState | null> =>
      fetcher('/api/v1/privacy/consents', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ version, grants }),
      })
        .then(json<unknown>)
        .then(readConsentState),

    /** §11.3's "where is my export", which needs no id kept in browser state. */
    requests: (): Promise<PrivacyRequests> =>
      fetcher('/api/v1/privacy/requests')
        .then(json<PrivacyRequests>)
        .then((body) => ({
          exports: Array.isArray(body?.exports) ? body.exports : [],
          deletions: Array.isArray(body?.deletions) ? body.deletions : [],
        })),

    requestExport: (personId: string): Promise<unknown> =>
      fetcher('/api/v1/privacy/export', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ person_id: personId, include_audit_trail: true }),
      }).then(json<unknown>),

    /**
     * §11.4. `reason` is a short machine string on the row, not the guardian's words —
     * `deletion_request.reason` is `VARCHAR(100)` and its examples are `account_closure`,
     * `gdpr_request`, `parent_request`.
     */
    requestDeletion: (personId: string, reason: string): Promise<unknown> =>
      fetcher('/api/v1/privacy/delete', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ person_id: personId, reason }),
      }).then(json<unknown>),
  }
}

export type PrivacyClient = ReturnType<typeof makePrivacyClient>
