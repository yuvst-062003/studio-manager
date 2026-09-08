// `readMoneyContext`, at the seam — because every number it returns is money.
//
// The rule this file exists to hold is the one `ParentPayments` already learned and wrote
// down: **a wrong number about money is worse than an error.** Its loader throws when
// `/me/prepay-terms` or `/me/balance` refuses, with the reason in as many words — "a failed
// terms read used to become zeroes, and the screen then priced a forward month at nothing",
// and "credit is money, and 0-on-failure is a lie about it".
//
// `readMoneyContext` was written the older way and kept the defect. A failed terms read
// became `monthly_total_agorot: 0`, and zero is not an inert default here:
// `prepayHeadroomMonths` returns 0 for it, `cashMonthChips` returns NO CHIPS for a zero
// headroom, and the card route prices every forward month at nothing. So the plan screen
// showed a family a payment step with no way to pay and no error — the owner's report of
// 2026-09-08, "in the plans I couldn't pay to upgrade the plan".
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return { ...actual, apiFetch: vi.fn() }
})

const { apiFetch } = await import('@studio/core')
const { readMoneyContext } = await import('./PlanMoney')

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const TERMS = { cash_prepay_months: 3, monthly_total_agorot: 30_000 }

function route(overrides: Record<string, Response> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (input: unknown) => {
    const path = String(input ?? '')
    for (const [fragment, response] of Object.entries(overrides)) {
      if (path.includes(fragment)) return response.clone()
    }
    if (path.includes('/me/prepay-terms')) return ok(TERMS)
    if (path.includes('/me/balance')) return ok({ credit_agorot: 0 })
    if (path.includes('/me/charges')) return ok({ items: [] })
    if (path.includes('/me/standing-order-links')) return ok({ items: [] })
    return ok({ items: [] })
  }) as unknown as typeof apiFetch)
}

beforeEach(() => vi.mocked(apiFetch).mockReset())

describe('readMoneyContext refuses to invent money', () => {
  it('reads the real numbers when every call succeeds', async () => {
    route()
    const context = await readMoneyContext('plan-1', 'kid-1')
    expect(context.monthlyTotalAgorot).toBe(30_000)
    expect(context.cashFloorMonths).toBe(3)
  })

  it('throws when the terms read fails, rather than pricing a month at nothing', async () => {
    // A zero here is not a smaller offer, it is NO offer: `cashMonthChips` returns [] for a
    // zero headroom, so the family is shown a payment step with nothing to press.
    route({ '/me/prepay-terms': new Response('nope', { status: 500 }) })
    await expect(readMoneyContext('plan-1', 'kid-1')).rejects.toThrow()
  })

  it('throws when the balance read fails, because credit is money too', async () => {
    // Credit decides the headroom alongside the monthly total. A silent 0 credit offers a
    // family months they have already paid for.
    route({ '/me/balance': new Response('nope', { status: 503 }) })
    await expect(readMoneyContext('plan-1', 'kid-1')).rejects.toThrow()
  })

  it('still tolerates a missing standing-order link, which is not money', async () => {
    // The club may simply have set no mandate link for this plan. That is an absence, not a
    // failed measurement, and it must not take the whole screen down with it.
    route({ '/me/standing-order-links': new Response('nope', { status: 404 }) })
    const context = await readMoneyContext('plan-1', 'kid-1')
    expect(context.mandateUrl).toBeNull()
    expect(context.monthlyTotalAgorot).toBe(30_000)
  })
})
