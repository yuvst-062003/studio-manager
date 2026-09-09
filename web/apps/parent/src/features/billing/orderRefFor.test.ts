// `orderRefFor` — which uPay page one ask opens, and the only place that decides it.
//
// Every card route in the parent app goes through this: תשלומים, the shop, and the plan
// screen's money step. They used to decide it three ways, each remembering the last
// `public_ref` in local state (`pendingOrder`, `pendingRef`) or, on the plan screen, not at
// all. That state is cleared the moment a form opens and dies with the screen — which is
// exactly when a parent walks away from a checkout — so the second attempt asked for a
// second order over charges the first still held, and `OrderService.create` refused it for
// `REPLACE_GRACE_MINUTES`. The parent could not pay and was told only that something failed.
//
// The server does not forget, so it is asked every time. These are the three answers it can
// give.
import { describe, expect, it, vi } from 'vitest'
import { OrderConflictError, makeParentBillingClient, orderKey } from './billingClient'

const OPEN_ORDER = {
  public_ref: 'ref-open',
  status: 'pending',
  charge_ids: ['ch-sep'],
  prepay_months: 0,
  max_payments: 1,
}

function clientOver(openOrders: unknown[], createStatus = 201) {
  const calls: { path: string; method?: string }[] = []
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method })
    if (path.startsWith('/api/v1/me/payment-orders')) {
      return new Response(JSON.stringify({ items: openOrders }), { status: 200 })
    }
    return new Response(
      JSON.stringify(
        createStatus === 201 ? { public_ref: 'ref-new' } : { detail: { code: 'conflict' } },
      ),
      { status: createStatus },
    )
  })
  return { billing: makeParentBillingClient(fetcher), calls }
}

describe('the ask key', () => {
  it('does not depend on the order the charge ids arrive in', () => {
    // The screen builds them oldest-first; the server returns them in its own order. A
    // match that depended on the two agreeing would work by luck.
    expect(orderKey(['b', 'a'], 0, 1)).toBe(orderKey(['a', 'b'], 0, 1))
  })

  it('tells apart asks that must not share one payment page', () => {
    // Months forward and the instalment split both change what uPay charges.
    expect(orderKey(['a'], 0, 1)).not.toBe(orderKey(['a'], 2, 1))
    expect(orderKey(['a'], 0, 1)).not.toBe(orderKey(['a'], 0, 3))
  })
})

describe('orderRefFor', () => {
  it('reopens the order the family already has, rather than asking for a second', async () => {
    const { billing, calls } = clientOver([OPEN_ORDER])
    expect(await billing.orderRefFor(['ch-sep'], 1, 0)).toBe('ref-open')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('opens a new one when the family has nothing open over these charges', async () => {
    const { billing, calls } = clientOver([])
    expect(await billing.orderRefFor(['ch-sep'], 1, 0)).toBe('ref-new')
    expect(calls.some((call) => call.method === 'POST')).toBe(true)
  })

  it('will not reuse an order opened for a DIFFERENT ask', async () => {
    // The refusal that protects the family's money: reopening a one-month page for somebody
    // who asked for three charges an amount they did not pick.
    const { billing } = clientOver([OPEN_ORDER])
    expect(await billing.orderRefFor(['ch-sep'], 1, 2)).toBe('ref-new')
  })

  it('raises the conflict by name, so a screen cannot report it as a generic failure', async () => {
    // The family CAN still pay — just not for the amount currently selected — so this
    // refusal has to reach copy that says so.
    const { billing } = clientOver([], 409)
    await expect(billing.orderRefFor(['ch-sep'], 1, 2)).rejects.toBeInstanceOf(OrderConflictError)
  })

  it('treats an order that names no charge as a forward-only buy, not a wildcard', async () => {
    // `charge_ids` and `prepay_months` carry server-side defaults, so the generated client
    // types them optional. A missing list must not match every ask.
    const { billing } = clientOver([{ ...OPEN_ORDER, charge_ids: [], prepay_months: 3 }])
    expect(await billing.orderRefFor([], 1, 3)).toBe('ref-open')
    expect(await billing.orderRefFor(['ch-sep'], 1, 0)).toBe('ref-new')
  })
})
