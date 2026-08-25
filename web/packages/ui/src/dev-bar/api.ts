// The dev bar's own calls into /api/v1/dev/*.
//
// This module lives inside the dev-bar directory so that Task 17's switch removes it
// from a production bundle along with everything else here. That is why `devHeaders()`
// is exported from the same place M1's fetch layer will import it: in production it
// resolves to a function returning {}, so a production client cannot send X-Dev-Now
// even by accident — no conditional of M1's own is needed.

/** Must equal app/core/clock.py's X_DEV_NOW_HEADER. */
export const DEV_NOW_HEADER = 'X-Dev-Now'

/** §19.5's four. Kept in the enum's own order; tools/__tests__/ipn-shapes.test.ts
 *  asserts it equals app/integrations/upay/ipn.py's IpnShape member for member. */
export const IPN_SHAPES = ['success', 'amount_mismatch', 'forged_ref', 'duplicate'] as const
export type IpnShape = (typeof IPN_SHAPES)[number]

const DEV_BASE = '/api/v1/dev'

let devNow: string | null = null

export function setDevNow(iso: string | null): void {
  devNow = iso
}

export function getDevNow(): string | null {
  return devNow
}

/**
 * The headers every request should carry while the dev bar is present. Empty when the
 * clock has not been moved, so the server's default path is the one exercised unless
 * someone deliberately asked otherwise.
 */
export function devHeaders(): Record<string, string> {
  return devNow ? { [DEV_NOW_HEADER]: devNow } : {}
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${DEV_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...devHeaders() },
    // §19.4 writes the persona onto the caller's refresh row, so the switch has to reach
    // the server with the httpOnly cookie attached — without this it silently switches
    // only the access token and reverts on the next rotation.
    credentials: 'include',
    body: JSON.stringify(body),
  })
}

export function resetDemoStudio(): Promise<Response> {
  return post('/demo/reset', {})
}

export function simulateIpn(input: {
  shape: IpnShape
  orderPublicRef: string
  expectedAmountAgorot: number
}): Promise<Response> {
  return post('/upay/simulate-ipn', {
    shape: input.shape,
    order_public_ref: input.orderPublicRef,
    expected_amount_agorot: input.expectedAmountAgorot,
  })
}

/** §19.4's persona list. `tests` carries §19.3's "what this exists to test" column. */
export type DevPersona = {
  key: string | null
  person_id: string
  studio_id: string
  label: string
  roles: string[]
  is_guardian: boolean
  tests: string
}

export type DevPersonaList = {
  items: DevPersona[]
  /** §19.3 — the missing student persona, stated by the server so the bar cannot drift
   *  from the spec's own wording. */
  no_student_persona_note: string
}

export async function listPersonas(): Promise<DevPersonaList> {
  const response = await fetch(`${DEV_BASE}/personas`, {
    headers: devHeaders(),
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`personas: ${response.status}`)
  return (await response.json()) as DevPersonaList
}

/**
 * §19.4 — switch persona. Returns a NEW access token; the caller replaces the one it
 * holds. The server does not mutate the old one (see app/routers/dev.py), so a client
 * that ignored this return value would keep acting as whoever it was before.
 */
export async function actAs(personId: string): Promise<{ access_token: string; persona_label: string }> {
  const response = await post(`/act-as/${personId}`, {})
  if (!response.ok) throw new Error(`act-as: ${response.status}`)
  return (await response.json()) as { access_token: string; persona_label: string }
}
