// §6.1 step 5's two calls, for the staff app.
//
// Not imported from `apps/parent/src/features/privacy/privacyClient.ts`: the two apps never
// import from each other's `src/` (see `features/attendance/client.ts`'s own header for the
// rule and why). What IS shared is the thing that should be — the generated types, which
// SPEC §8.2 regenerates from `openapi.json` and fails CI on a stale copy, so neither app
// carries a hand-written shape the other could drift from.
import type { components } from '@studio/api-client'

export type ConsentState = components['schemas']['ConsentStateOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * A shape the gate can safely treat as "nothing outstanding".
 *
 * The shell's tests stub `fetch` to answer `{items: []}` for every URL they do not
 * recognise, and a real network can answer anything at all. Reading `outstanding` off such
 * a body yields `undefined`, and `undefined.length` inside a gate is a blank screen where
 * the app used to be — so the parse is total, and a body that is not a consent state stands
 * the gate aside. See `StaffConsentGate`'s header for why aside is the right direction on a
 * read failure and the wrong one on a write failure.
 */
export function readConsentState(body: unknown): ConsentState | null {
  if (typeof body !== 'object' || body === null) return null
  const candidate = body as Partial<ConsentState>
  if (!Array.isArray(candidate.outstanding) || typeof candidate.policy_version !== 'number') {
    return null
  }
  return candidate as ConsentState
}

export type StaffConsentClient = {
  consents(): Promise<ConsentState | null>
  grant(version: number, grants: Record<string, boolean>): Promise<ConsentState | null>
}

export function makeStaffConsentClient(fetcher: Fetcher): StaffConsentClient {
  return {
    /** About the caller and nobody else — the route takes no id, by design. */
    consents: async () => readConsentState(await (await fetcher('/api/v1/privacy/consents')).json()),
    grant: async (version, grants) =>
      readConsentState(
        await (
          await fetcher('/api/v1/privacy/consents', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ version, grants }),
          })
        ).json(),
      ),
  }
}
