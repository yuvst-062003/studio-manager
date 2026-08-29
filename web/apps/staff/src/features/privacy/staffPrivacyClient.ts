// §16's read of §11's request queue. One route, and deliberately nothing else.
//
// **Read-only, and that is the whole surface.** §11.3 also says "Managers can trigger the
// same for any student", which needs a person picker this lane did not build — the
// endpoint accepts a manager's POST already (`tests/privacy/test_subject_access.py`), so
// what is missing is a screen to choose a subject from, not a permission. Shipping the
// queue without it is the half that answers a guardian who is already waiting.
//
// Types come from the generated client (@studio/api-client), regenerated from openapi.json
// by SPEC §8.2 — a hand-written shape here would be a second definition nothing keeps in
// step with the one the parent app reads through.
import type { components } from '@studio/api-client'

export type PrivacyRequest = components['schemas']['PrivacyRequestOut']
export type PrivacyRequests = components['schemas']['PrivacyRequestsOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeStaffPrivacyClient(fetcher: Fetcher) {
  return {
    /**
     * Every privacy request in this studio. The scope is decided by the SERVER from the
     * caller's roles — a manager gets the studio, anyone else gets their own subjects — so
     * this route needs no parameter and cannot be widened by editing the client.
     */
    requests: (): Promise<PrivacyRequests> =>
      fetcher('/api/v1/privacy/requests')
        .then(json<PrivacyRequests>)
        .then((body) => ({
          exports: Array.isArray(body?.exports) ? body.exports : [],
          deletions: Array.isArray(body?.deletions) ? body.deletions : [],
        })),
  }
}

export type StaffPrivacyClient = ReturnType<typeof makeStaffPrivacyClient>
