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
