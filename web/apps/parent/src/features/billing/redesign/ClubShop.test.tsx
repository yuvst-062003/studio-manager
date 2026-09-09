// Paying for a shop order at the moment it is placed (owner, 2026-09-07).
//
// Before this, checkout created the charges and pointed the parent at תשלומים. Both payment
// routes existed there and both take charge ids, so nothing new was built — the question is
// simply asked where the money is being spent. These tests are about that seam: the ids the
// order returns must reach the route the parent picks, and a failure to PAY must never be
// reported as a failure to ORDER.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClubShop } from './ClubShop'

const PRODUCT = {
  id: 'p1',
  name: 'חגורה לבנה',
  description: 'מידה 2',
  price_agorot: 5000,
  sizes: [],
  image_url: null,
  is_active: true,
  // `/me/products` has carried these since the shop went per class: every item it returns
  // belongs to exactly one class, and the row names it so a family with children in two of
  // them can tell two identically-named items apart.
  class_id: 'class-judo',
  class_name: 'ג׳ודו',
}

/** Every call the shop makes, and the two the payment routes make. */
let calls: { path: string; init?: RequestInit }[] = []
/** The payer's own pending orders, as the server would list them. */
let openOrders: unknown[] = []
let orderResponse: () => Response
let formResponse: () => Response
let promiseResponse: () => Response

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** The ref the fake server hands back, and the one it then lists — see `createOrder`. */
const CREATED_REF = 'ref-1'

/**
 * `POST /payment-orders`, as the real one behaves: on success the order EXISTS, and
 * `GET /me/payment-orders` returns it from that moment.
 *
 * `payByCard` no longer keeps the `public_ref` in a ref of its own — it asks the server,
 * because a ref is cleared the moment the overlay opens and the X on that overlay is the
 * commonest way a parent leaves a checkout. A fake that forgot what it created would report
 * a working resume as a second order.
 */
function createOrder(path: string, init?: RequestInit): Response {
  const response = orderResponse()
  if (!response.ok) return response
  const query = new URLSearchParams(path.split('?')[1] ?? '')
  const body = JSON.parse(String(init?.body ?? '{}')) as { charge_ids?: string[] }
  openOrders = [
    ...openOrders,
    {
      public_ref: CREATED_REF,
      status: 'pending',
      charge_ids: body.charge_ids ?? [],
      prepay_months: Number(query.get('prepay_months') ?? 0),
      max_payments: Number(query.get('max_payments') ?? 1),
    },
  ]
  return response
}

function respond(path: string, init?: RequestInit): Response {
  calls.push({ path, init })
  if (path.startsWith('/api/v1/me/products')) return jsonResponse({ items: [PRODUCT] })
  if (path.startsWith('/api/v1/me/charges')) return jsonResponse({ items: [] })
  if (path.startsWith('/api/v1/me/orders')) {
    if (init?.method === 'POST') {
      return jsonResponse({ charge_ids: ['ch-1', 'ch-2'], total_agorot: 10_000 }, 201)
    }
    return jsonResponse({ items: [] })
  }
  // Before `/api/v1/payment-orders`: this is the payer's own listing, not the create.
  if (path.startsWith('/api/v1/me/payment-orders')) return jsonResponse({ items: openOrders })
  if (path.endsWith('/form')) return formResponse()
  if (path.startsWith('/api/v1/payment-orders')) return createOrder(path, init)
  if (path.startsWith('/api/v1/me/payment-promises')) return promiseResponse()
  return jsonResponse({ items: [] })
}

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => respond(path, init)),
  }
})

beforeEach(async () => {
  calls = []
  openOrders = []
  orderResponse = () => jsonResponse({ public_ref: CREATED_REF })
  formResponse = () =>
    jsonResponse({ action: 'https://app.upay.co.il/checkout', fields: { ref: 'ref-1' } })
  promiseResponse = () => jsonResponse({ id: 'pp-1' }, 201)
  const { apiFetch } = await import('@studio/core')
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) =>
    respond(path, init),
  )
})

/** Add the one product and send the order, leaving the sheet on its confirmation. */
async function placeAnOrder() {
  const user = userEvent.setup()
  render(<ClubShop locale="he" />)
  await user.click(await screen.findByTestId(`shop-choose-${PRODUCT.id}`))
  await user.click(await screen.findByTestId('shop-add'))
  await user.click(await screen.findByRole('button', { name: t('he', 'billing.shop.cartOpen') }))
  await user.click(await screen.findByTestId('shop-checkout'))
  await waitFor(() => expect(screen.getByTestId('shop-placed')).toBeInTheDocument())
  return user
}

describe('paying for an order without leaving the shop', () => {
  it('asks cash or card once the order is placed', async () => {
    await placeAnOrder()
    expect(screen.getByText(t('he', 'billing.shop.payHow'))).toBeInTheDocument()
    expect(screen.getByTestId('shop-pay-card')).toBeInTheDocument()
    expect(screen.getByTestId('shop-pay-cash')).toBeInTheDocument()
  })

  it('card opens an order over the charges this purchase created, and nothing else', async () => {
    const user = await placeAnOrder()
    await user.click(screen.getByTestId('shop-pay-card'))
    await waitFor(() => {
      const order = calls.find((call) => call.path.startsWith('/api/v1/payment-orders'))
      expect(order, 'no payment order was opened').toBeDefined()
      // The seam. The ids come from THIS order's response — a card checkout that swept up
      // every open charge would bill a family for last month's fees on a belt purchase.
      expect(JSON.parse(String(order!.init!.body))).toEqual({ charge_ids: ['ch-1', 'ch-2'] })
    })
    // And the uPay checkout opens IN the app, in an iframe, rather than navigating the
    // parent away from the shop — the same overlay the payments screen uses.
    const overlay = await screen.findByTestId('payment-overlay')
    expect(overlay.querySelector('iframe')).not.toBeNull()
  })

  it('cash raises the promise that notifies the manager, and says so', async () => {
    const user = await placeAnOrder()
    await user.click(screen.getByTestId('shop-pay-cash'))
    await waitFor(() => expect(screen.getByTestId('shop-cash-done')).toBeInTheDocument())

    const promise = calls.find((call) => call.path.startsWith('/api/v1/me/payment-promises'))
    expect(promise, 'no promise was raised — the manager would never hear').toBeDefined()
    const body = JSON.parse(String(promise!.init!.body))
    expect(body.charge_ids).toEqual(['ch-1', 'ch-2'])
    expect(body.method).toBe('cash')
    // "I will pay", not "I already did". They are different claims to a manager.
    expect(body.already_paid).toBe(false)
  })

  it('never says the ORDER failed when only the payment did', async () => {
    // The charges exist either way. Telling a parent their order failed sends them to place
    // it again, and they are charged twice for one delivery.
    orderResponse = () => jsonResponse({ detail: 'nope' }, 500)
    const user = await placeAnOrder()
    await user.click(screen.getByTestId('shop-pay-card'))
    await waitFor(() => expect(screen.getByTestId('shop-pay-failed')).toBeInTheDocument())
    expect(screen.getByTestId('shop-placed')).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'billing.shop.checkoutFailed'))).toBeNull()
    // And the choice is still there to retry with.
    expect(screen.getByTestId('shop-pay-cash')).toBeInTheDocument()
  })

  it('retries a failed card attempt against the SAME order, not a second one', async () => {
    // `OrderService.create` refuses a charge already covered by an open order. So if the
    // form fetch is what failed, asking for a second order 409s and the parent can never
    // reach the payment page — a dead end that looks like the club refusing their money.
    let forms = 0
    formResponse = () => {
      forms += 1
      return forms === 1
        ? jsonResponse({ detail: 'boom' }, 500)
        : jsonResponse({ action: 'https://app.upay.co.il/checkout', fields: {} })
    }
    const user = await placeAnOrder()
    await user.click(screen.getByTestId('shop-pay-card'))
    await waitFor(() => expect(screen.getByTestId('shop-pay-failed')).toBeInTheDocument())

    await user.click(screen.getByTestId('shop-pay-card'))
    await waitFor(() => expect(screen.getByTestId('payment-overlay')).toBeInTheDocument())
    const orders = calls.filter((call) => call.path.startsWith('/api/v1/payment-orders?'))
    expect(orders, 'a second order was opened over charges the first already claimed').toHaveLength(1)
  })

  it('reopens the same order when the parent closes the payment window', async () => {
    // The other half of the retry the test above covers. There the FORM fetch failed and
    // `pendingRef` still held the order; here uPay's page opened, so `pendingRef` was
    // cleared — and the X on the overlay is the commonest way a parent leaves a checkout.
    //
    // `OrderService.create` refuses these charges for `REPLACE_GRACE_MINUTES`, so the
    // second attempt is a 409 the shop reports as "payment failed" over an order the club
    // has already placed. The parent cannot pay for ten minutes and is not told why.
    const user = await placeAnOrder()
    await user.click(screen.getByTestId('shop-pay-card'))
    await screen.findByTestId('payment-overlay')

    await user.click(screen.getByTestId('payment-overlay-close'))
    // The server's answer inside the grace window, for the charges the first order holds.
    orderResponse = () =>
      jsonResponse({ detail: { code: 'conflict', message: 'already covered' } }, 409)
    await user.click(screen.getByTestId('shop-pay-card'))

    await waitFor(() => expect(screen.getByTestId('payment-overlay')).toBeInTheDocument())
    expect(screen.queryByTestId('shop-pay-failed')).toBeNull()
  })

  it('still offers the payments screen for a parent who wants to decide later', async () => {
    await placeAnOrder()
    expect(screen.getByText(t('he', 'billing.shop.payLater'))).toHaveAttribute('href', '#/payments')
  })
})
