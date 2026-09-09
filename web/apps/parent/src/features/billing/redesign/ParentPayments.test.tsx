// תשלומים, at the seam. `pay.test.ts` holds the arithmetic; this holds the wiring, because
// a field dropped between `fetch` and the component passes every unit test in the repo.
//
// The screen's three rules are the assertions:
//
//  1. the headline is what the button is about to charge, and the receipt under it says
//     what that is made of — REVISED 2026-09-08, see PayScreen's own header for why;
//  2. the button states the exact amount it is about to charge;
//  3. when that amount jumps, the receipt says why — and on the cash side the copy still
//     names the club as the one who set the minimum.
//
// The numbers are the owner's own: ₪208.33 owed, ₪250.00 a month. That case is here because
// it is the one the old screen could not pay — a top line of ₪208.33 above buttons offering
// ₪500, ₪750 and ₪3,000.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ParentPayments } from './ParentPayments'

const OWED = 20_833
const MONTHLY = 25_000

const CHARGE = {
  id: 'ch-sep',
  payer_person_id: 'payer-1',
  student_id: 'kid-1',
  kind: 'tuition',
  period_year: 2026,
  period_month: 9,
  amount_agorot: OWED,
  original_amount_agorot: null,
  proration_note: null,
  product_id: null,
  due_date: '2026-09-30',
  status: 'open',
  created_by: 'billing_run',
  allocated_agorot: 0,
  is_covered_elsewhere: false,
}

let calls: { path: string; init?: RequestInit }[] = []
let charges: unknown[]
let payments: unknown[]
let promises: unknown[]
let terms: { cash_prepay_months: number; cheque_prepay_months: number; monthly_total_agorot: number }
let creditAgorot: number
let standingOrderActive: boolean
let openOrders: unknown[]
let orderResponse: () => Response
let formResponse: () => Response

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** The ref the fake server hands back, and the one it then lists. One constant, because a
 *  fake that created an order under one reference and listed it under another would let a
 *  broken resume look like a working one. */
const CREATED_REF = 'ref-1'

/**
 * `POST /payment-orders`, as the real one behaves: on success the order EXISTS, and
 * `GET /me/payment-orders` returns it from that moment.
 *
 * The screen no longer remembers a `public_ref` in React state — it asks the server, which
 * is the whole point of the fix (state dies when a parent leaves a checkout; the server does
 * not). So a fake that forgot what it created would report every resume as a second order.
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
  // Order matters: `/me/payment-promises` also starts with `/api/v1/me/payment`.
  if (path.startsWith('/api/v1/me/payment-promises')) {
    return init?.method === 'POST' ? jsonResponse({ id: 'pp-1' }, 201) : jsonResponse({ items: promises })
  }
  if (path.startsWith('/api/v1/me/payments')) return jsonResponse({ items: payments })
  if (path.startsWith('/api/v1/me/charges')) return jsonResponse({ items: charges })
  if (path.startsWith('/api/v1/me/students')) {
    return jsonResponse({ items: [{ id: 'kid-1', first_name: 'יובל', last_name: 'כהן' }] })
  }
  if (path.startsWith('/api/v1/me/prepay-terms')) return jsonResponse(terms)
  if (path.startsWith('/api/v1/me/balance')) {
    return jsonResponse({
      payer_person_id: 'payer-1',
      balance_agorot: OWED,
      charged_agorot: OWED,
      paid_agorot: 0,
      credit_agorot: creditAgorot,
      open_charge_count: charges.length,
    })
  }
  if (path.startsWith('/api/v1/me/standing-order')) return jsonResponse({ active: standingOrderActive })
  // Before `/api/v1/payment-orders`: this is the payer's own listing, not the create.
  if (path.startsWith('/api/v1/me/payment-orders')) return jsonResponse({ items: openOrders })
  if (path.endsWith('/form')) return formResponse()
  if (path.startsWith('/api/v1/payment-orders')) return createOrder(path, init)
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
  charges = [CHARGE]
  payments = []
  promises = []
  terms = { cash_prepay_months: 3, cheque_prepay_months: 12, monthly_total_agorot: MONTHLY }
  creditAgorot = 0
  standingOrderActive = false
  openOrders = []
  orderResponse = () => jsonResponse({ public_ref: CREATED_REF })
  formResponse = () =>
    jsonResponse({ action: 'https://app.upay.co.il/checkout', fields: { ref: 'ref-1' } })
  const { apiFetch } = await import('@studio/core')
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) =>
    respond(path, init),
  )
})

async function open() {
  const user = userEvent.setup()
  render(<ParentPayments locale="he" />)
  await screen.findByTestId('pay-screen')
  return user
}

const payButton = () => screen.getByTestId('pay-button')

describe('the headline and the button are one number', () => {
  it('moves with the method, and never disagrees with what is charged', async () => {
    // The owner's report: "when I switch to cash the total amount above doesn't change,
    // only the bottom". The screen deliberately froze the top figure at the debt, which
    // fixed one reconciliation problem by creating its mirror.
    const user = await open()
    const headline = () => screen.getByTestId('pay-now-amount').textContent ?? ''

    expect(headline()).toContain('208.33')
    expect(payButton()).toHaveTextContent('208.33₪')

    await user.click(screen.getByTestId('pay-method-cash'))
    // 208.33 owed + 3 months at 250 = 958.33, and BOTH figures say so.
    expect(headline()).toContain('958.33')
    expect(payButton()).toHaveTextContent('958.33₪')
  })

  it('keeps the debt visible as a line inside the arithmetic', async () => {
    // The old rule protected a real thing — a family must not lose sight of what they
    // owe. It survives as a receipt row rather than as a frozen headline.
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    const receipt = within(screen.getByTestId('pay-receipt'))
    expect(receipt.getByText(/208\.33/)).toBeInTheDocument()
    expect(screen.getByTestId('pay-receipt-total')).toHaveTextContent('958.33₪')
  })

  it('names the month and the child on the row', async () => {
    await open()
    // The seam: `/me/students` is the only source of a name here, and without it every row
    // said "09/2026" and a two-child family could not tell whose month was whose.
    expect(screen.getByTestId('pay-receipt')).toHaveTextContent('יובל כהן')
  })

  it('leaves a charge another payment holds out of the receipt, and in the remainder', async () => {
    charges = [
      CHARGE,
      {
        ...CHARGE,
        id: 'ch-oct',
        period_month: 10,
        amount_agorot: MONTHLY,
        is_covered_elsewhere: true,
      },
    ]
    await open()
    // It is not being paid, so it is not a row — but it is still owed, so it is named.
    expect(screen.getAllByTestId('pay-receipt-row')).toHaveLength(1)
    expect(screen.getByTestId('pay-remainder')).toHaveTextContent('250₪')
    expect(screen.getByTestId('pay-covered')).toHaveTextContent('250₪')
    expect(payButton()).toHaveTextContent('208.33₪')
  })
})

describe('what am I paying for (the owner\'s first report)', () => {
  it('separates a shop item from a month of tuition, by name', async () => {
    // "An item from the store plus מנוי" was one figure with no way to tell the two apart.
    // `proration_note` is where both shop routes write the item's name.
    charges = [
      CHARGE,
      {
        ...CHARGE,
        id: 'ch-belt',
        kind: 'manual',
        period_year: null,
        period_month: null,
        student_id: null,
        amount_agorot: 12_000,
        proration_note: 'חגורה כחולה',
      },
    ]
    await open()
    const receipt = screen.getByTestId('pay-receipt')
    expect(receipt).toHaveTextContent('חגורה כחולה')
    expect(receipt).toHaveTextContent(t('he', 'billing.charge.kind.tuition'))
    expect(screen.getByTestId('pay-receipt-total')).toHaveTextContent('328.33₪')
    expect(payButton()).toHaveTextContent('328.33₪')
  })

  it('falls back to the charge kind when nothing ever named the charge', async () => {
    charges = [{ ...CHARGE, kind: 'manual', proration_note: null, period_year: null, period_month: null }]
    await open()
    expect(screen.getByTestId('pay-receipt')).toHaveTextContent(
      t('he', 'billing.charge.kind.manual'),
    )
  })
})

describe("the owner's #17 — ₪375 on the screen and ₪900 on the button", () => {
  // Reported against the screen this one replaced (`PaymentsScreen.tsx`, before the
  // 2026-09-07 rebuild), where the top line and the button were two unrelated
  // computations. The rebuild's rules make that shape impossible, and the shape is what
  // the report is about — so the owner's own figures are pinned here rather than left as
  // a claim in a handoff document.
  beforeEach(() => {
    charges = [{ ...CHARGE, amount_agorot: 37_500 }]
    terms = { cash_prepay_months: 3, cheque_prepay_months: 12, monthly_total_agorot: 30_000 }
  })

  it('charges exactly what it says is owed, with nothing to reconcile', async () => {
    await open()
    expect(screen.getByTestId('pay-now-amount')).toHaveTextContent('375₪')
    expect(payButton()).toHaveTextContent('375₪')
    expect(screen.queryByTestId('pay-forward-note')).toBeNull()
  })

  it('names the club when the cash block is what raises the number', async () => {
    // ₪900 IS on this screen — it is three months at ₪300, which is the club's own cash
    // term and not a choice the parent made. The defect was never the figure; it was a
    // figure with nothing beside it. ₪375 + ₪900 = ₪1,275, and the button says so.
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    // The headline now says 1,275 too — that is the 2026-09-08 revision. The ₪375 is
    // still on the screen, as the receipt row it belongs in.
    expect(screen.getByTestId('pay-now-amount')).toHaveTextContent('1,275₪')
    expect(within(screen.getByTestId('pay-receipt')).getByText(/375/)).toBeInTheDocument()
    expect(screen.getByTestId('pay-cash-floor')).toHaveTextContent(
      t('he', 'billing.pay.cashFloor').replace('{{count}}', '3'),
    )
    expect(payButton()).toHaveTextContent('1,275₪')
  })
})

describe('splitting a card payment (bug #16)', () => {
  it('asks uPay for the number of instalments the parent picked', async () => {
    // The owner's #16 — 'no way to split a card payment into instalments'. The backend has
    // taken `max_payments` since M6 and the screen this one replaced had the chips; the
    // rebuild dropped them and hardcoded 1, so the control existed everywhere except where
    // a parent could reach it.
    const user = await open()
    await user.click(screen.getByTestId('pay-instalments-3'))
    await user.click(payButton())
    await waitFor(() => {
      const order = calls.find((call) => call.path.startsWith('/api/v1/payment-orders?'))
      expect(order).toBeDefined()
      expect(order!.path).toContain('max_payments=3')
    })
  })

  it('says what each instalment costs, so the total is not arithmetic to do', async () => {
    // Rule 2 of this screen: no figure on it is assembled from two others. ₪208.33 over
    // three is ₪69.45 then two of ₪69.44 — `instalmentSplit` puts the odd agora on the
    // first, and the copy says which is which rather than rounding in silence.
    const user = await open()
    await user.click(screen.getByTestId('pay-instalments-3'))
    expect(screen.getByTestId('pay-split-note')).toHaveTextContent('69.45₪')
    expect(screen.getByTestId('pay-split-note')).toHaveTextContent('69.44₪')
    // The BUTTON still states the whole charge — the split is how it is collected, not a
    // smaller thing being bought.
    expect(payButton()).toHaveTextContent('208.33₪')
  })

  it('says nothing at all about a split when there is one payment', async () => {
    await open()
    expect(screen.queryByTestId('pay-split-note')).toBeNull()
  })

  it('offers no split under cash, which is handed over once', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.queryByTestId('pay-instalments')).toBeNull()
  })

  it('opens a NEW order when the instalment count changes', async () => {
    // The `pendingOrder` reuse key must carry the split: an order opened for one payment
    // and then reused for three would put the parent on a uPay page for terms they did not
    // pick — the same failure the month count already guards against.
    const user = await open()
    formResponse = () => jsonResponse({ detail: 'nope' }, 500)
    await user.click(payButton())
    await waitFor(() => expect(screen.getByTestId('pay-error')).toBeInTheDocument())
    orderResponse = () => jsonResponse({ public_ref: 'ref-2' })
    formResponse = () =>
      jsonResponse({ action: 'https://app.upay.co.il/checkout', fields: { ref: 'ref-2' } })
    await user.click(screen.getByTestId('pay-instalments-2'))
    await user.click(payButton())
    await waitFor(() => {
      const orders = calls.filter((call) => call.path.startsWith('/api/v1/payment-orders?'))
      expect(orders).toHaveLength(2)
      expect(orders[1]!.path).toContain('max_payments=2')
    })
  })
})

describe('what the button says it will charge', () => {
  it('starts at the whole debt, exactly', async () => {
    await open()
    expect(payButton()).toHaveTextContent('208.33₪')
    // No forward months, so nothing to explain.
    expect(screen.queryByTestId('pay-forward-note')).toBeNull()
  })

  it('states the new amount AND why it grew', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-months-2'))
    // ₪208.33 of debt plus one month bought forward at ₪250.00 — the sketch's own figure.
    expect(payButton()).toHaveTextContent('458.33₪')
    expect(screen.getByTestId('pay-forward-note')).toHaveTextContent(
      t('he', 'billing.pay.forward.one'),
    )
  })

  it('still names the CLUB as the one who set the cash minimum', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    // The CARD's month chips are its own question and disappear with it. Cash has chips of
    // its own now (2026-09-08) — but the club's number is a floor, and the copy beside them
    // still says whose floor it is rather than presenting it as the parent's choice.
    expect(screen.queryByTestId('pay-months')).toBeNull()
    expect(screen.getByTestId('pay-cash-floor')).toHaveTextContent('המועדון גובה 3')
    expect(payButton()).toHaveTextContent('958.33₪')
  })

  it('lets a family buy more months of cash than the club collects', async () => {
    // The owner's report: "when I press cash I can only pay for 3 months ahead, and not
    // more. What if the person wants 5 months?" The club's three was the whole offer.
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    await user.click(screen.getByTestId('pay-cash-months-6'))
    // ₪208.33 owed + 6 × ₪250 = ₪1,708.33.
    expect(payButton()).toHaveTextContent('1,708.33₪')
    expect(screen.getByTestId('pay-now-amount')).toHaveTextContent('1,708.33₪')
  })

  it('offers no chip below the club floor', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.queryByTestId('pay-cash-months-1')).toBeNull()
    expect(screen.queryByTestId('pay-cash-months-2')).toBeNull()
    expect(screen.getByTestId('pay-cash-months-3')).toBeInTheDocument()
  })
})

describe('the ceiling — twelve months and no further', () => {
  it('withdraws the forward offer from a family already a season ahead', async () => {
    // The owner's report: "don't allow a user to pay more months if he already paid for a
    // season (12 months)". Nothing counted what was held, so twelve could be bought twice.
    charges = []
    creditAgorot = 12 * MONTHLY
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.queryByTestId('pay-cash-months')).toBeNull()
    // Said out loud. Chips that are simply absent read as a screen that failed to load.
    expect(screen.getByTestId('pay-ceiling-reached')).toBeInTheDocument()
  })

  it('offers a family two months from the ceiling exactly two, floor or no floor', async () => {
    charges = []
    creditAgorot = 10 * MONTHLY
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    // The club collects three at a time; there is only room for two. The ceiling wins —
    // refusing money a family is holding out would be the wrong end of the club's rule.
    expect(screen.getByTestId('pay-cash-months-2')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-cash-months-3')).toBeNull()
  })

  it('blocks a card chip whose forward half would pass the ceiling, but never the debt', async () => {
    creditAgorot = 12 * MONTHLY
    await open()
    // One month: settles the debt and buys nothing forward, so it stands.
    expect(screen.getByTestId('pay-months-1').querySelector('input')).not.toBeDisabled()
    // Six: five months forward, and there is no room for any of them.
    expect(screen.getByTestId('pay-months-6').querySelector('input')).toBeDisabled()
    // …and the button charges the debt alone rather than an amount the server refuses.
    expect(payButton()).toHaveTextContent('208.33₪')
  })
})

describe('the routes, at the seam', () => {
  it('opens a uPay order over the months chosen and nothing else', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-months-2'))
    await user.click(payButton())
    await waitFor(() => {
      const order = calls.find((call) => call.path.startsWith('/api/v1/payment-orders?'))
      expect(order, 'no payment order was opened').toBeDefined()
      // The charge ids come from the ask the button rendered. `prepay_months` is a COUNT —
      // the server prices it, and this screen never posts an amount.
      expect(JSON.parse(String(order!.init!.body))).toEqual({ charge_ids: ['ch-sep'] })
      expect(order!.path).toContain('prepay_months=1')
      expect(order!.path).toContain('max_payments=1')
    })
    // And uPay opens IN the app, in an iframe — the same overlay the shop uses.
    const overlay = await screen.findByTestId('payment-overlay')
    expect(overlay.querySelector('iframe')).not.toBeNull()
  })

  it("raises a cash promise for the club's own term", async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    await user.click(payButton())
    await waitFor(() => {
      const promise = calls.find(
        (call) => call.path.startsWith('/api/v1/me/payment-promises') && call.init?.method === 'POST',
      )
      expect(promise, 'no promise was raised — the manager would never hear').toBeDefined()
      const body = JSON.parse(String(promise!.init!.body))
      expect(body.charge_ids).toEqual(['ch-sep'])
      expect(body.method).toBe('cash')
      expect(body.prepay_months).toBe(3)
      // "I will pay", not "I already did". Different claims to a manager.
      expect(body.already_paid).toBe(false)
    })
  })

  it('retries a failed card attempt against the SAME order', async () => {
    // `OrderService.create` still refuses a charge covered by an order opened MOMENTS ago,
    // so asking for a second one here 409s and the parent reaches no payment page at all.
    let forms = 0
    formResponse = () => {
      forms += 1
      return forms === 1
        ? jsonResponse({ detail: 'boom' }, 500)
        : jsonResponse({ action: 'https://app.upay.co.il/checkout', fields: {} })
    }
    const user = await open()
    await user.click(payButton())
    await waitFor(() => expect(screen.getByTestId('pay-error')).toBeInTheDocument())
    await user.click(payButton())
    await waitFor(() => expect(screen.getByTestId('payment-overlay')).toBeInTheDocument())
    expect(calls.filter((call) => call.path.startsWith('/api/v1/payment-orders?'))).toHaveLength(1)
  })

  it('reports a cash request already with the manager instead of offering a second', async () => {
    promises = [
      {
        id: 'pp-live',
        status: 'pending',
        method: 'cash',
        total_agorot: 95_833,
        prepay_months: 3,
        claimed_plan_id: null,
        already_paid: false,
        charge_ids: ['ch-sep'],
        created_at: '2026-09-06T09:00:00Z',
        decided_at: null,
      },
    ]
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.getByTestId('pay-cash-pending')).toBeInTheDocument()
    expect(payButton()).toBeDisabled()
  })
})

describe('the states either side of owing money', () => {
  it('says so when nothing is owed, and still sells a term', async () => {
    charges = []
    creditAgorot = MONTHLY
    await open()
    // Nothing owed, so the card route's default chip buys one month forward: the headline
    // is that month, and `clearTitle` is gone from the top because there IS something to
    // pay for now. The strip below still says what is already covered.
    expect(screen.getByTestId('pay-now-amount')).toHaveTextContent('250₪')
    // Nothing owed is not nothing to do: a family in good standing can still hand the club
    // a term, which is the whole of what prepayment on the card route is for.
    expect(payButton()).toBeEnabled()
    expect(payButton()).toHaveTextContent('250₪')
    expect(screen.getByTestId('pay-paid-ahead')).toHaveTextContent('250₪')
  })

  it('offers nothing to a payer with no price and no debt', async () => {
    charges = []
    terms = { cash_prepay_months: 3, cheque_prepay_months: 12, monthly_total_agorot: 0 }
    await open()
    // A month forward would cost nothing, and the server refuses an order it cannot price.
    // A disabled button that says why beats one that answers 422.
    expect(payButton()).toBeDisabled()
    expect(payButton()).toHaveTextContent(t('he', 'billing.pay.nothingPayable'))
  })

  it('warns a family that already has a standing order — and does not block them', async () => {
    standingOrderActive = true
    await open()
    expect(screen.getByTestId('pay-standing-order-warning')).toBeInTheDocument()
    expect(payButton()).toBeEnabled()
  })

  it('shows the last payment that still stands, not one the club reversed', async () => {
    payments = [
      {
        id: 'pay-old',
        amount_agorot: 25_000,
        method: 'cash',
        received_at: '2026-08-01T09:00:00Z',
        reversed_at: null,
        reversal_reason: null,
        payer_person_id: 'payer-1',
        payment_order_id: null,
        recorded_by_person_id: null,
        external_receipt_number: null,
        note: null,
        allocations: [],
      },
      {
        id: 'pay-undone',
        amount_agorot: 99_900,
        method: 'upay_card',
        received_at: '2026-09-01T09:00:00Z',
        reversed_at: '2026-09-02T09:00:00Z',
        reversal_reason: 'chargeback',
        payer_person_id: 'payer-1',
        payment_order_id: null,
        recorded_by_person_id: null,
        external_receipt_number: null,
        note: null,
        allocations: [],
      },
    ]
    await open()
    const last = screen.getByTestId('pay-last-payment')
    expect(last).toHaveTextContent('250₪')
    expect(last).not.toHaveTextContent('999₪')
  })
})

describe('a payment the family opened and walked away from', () => {
  // The owner's report: "if I pressed pay, didn't complete the pay and exit, the app
  // doesn't allow me to open the payment link again."
  //
  // `create` holds the payer's own pending order for REPLACE_GRACE_MINUTES — correctly,
  // since uPay's IPN lands about five minutes after a real payment. The half that was
  // missing is the way back: the `public_ref` lived in React state, which is cleared the
  // moment a form opens and gone entirely when the screen unmounts. So the second attempt
  // POSTed a new order over charges the first one still claimed, was refused 409, and the
  // screen showed a generic failure with nothing to say why.
  const RESUMABLE = {
    public_ref: 'ref-abandoned',
    status: 'pending',
    charge_ids: [CHARGE.id],
    prepay_months: 0,
    max_payments: 1,
  }

  it('reopens the order it already has instead of asking for a second one', async () => {
    openOrders = [RESUMABLE]
    const user = await open()
    await user.click(payButton())

    await waitFor(() =>
      expect(calls.some((call) => call.path === '/api/v1/payment-orders/ref-abandoned/form')).toBe(
        true,
      ),
    )
    // The point of the fix: no second order is created over charges the first still holds.
    const created = calls.filter(
      (call) => call.path.startsWith('/api/v1/payment-orders?') && call.init?.method === 'POST',
    )
    expect(created).toHaveLength(0)
  })

  it('resumes the abandoned order over a charge the server reports as covered', async () => {
    // The state the SERVER actually reports inside `REPLACE_GRACE_MINUTES`, which the two
    // tests above do not set up: `covered_charge_ids` counts the payer's own order until
    // it is ten minutes old, so `/me/charges` comes back with `is_covered_elsewhere: true`
    // for exactly the charge `/me/payment-orders` is offering back. Both are true at once,
    // and any reload of the screen inside that window sees both.
    //
    // `payable()` drops a covered row, so `askFor` builds an ask over NO charges — and the
    // card branch turns the month chip into a month bought FORWARD. The parent presses the
    // same button for the same amount and buys next month instead of paying for September,
    // which is not the payment they asked for and leaves September open.
    charges = [{ ...CHARGE, is_covered_elsewhere: true }]
    openOrders = [RESUMABLE]
    const user = await open()
    await user.click(payButton())

    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/form'))).toBe(true),
    )
    const created = calls.filter(
      (call) => call.path.startsWith('/api/v1/payment-orders?') && call.init?.method === 'POST',
    )
    // No second order, and no order that buys a month forward instead of settling the one
    // the family opened the payment page for.
    expect(created.map((call) => call.path)).toEqual([])
    expect(calls.some((call) => call.path === '/api/v1/payment-orders/ref-abandoned/form')).toBe(
      true,
    )
  })

  it('names the open payment instead of failing when the ask has changed', async () => {
    // The case the fix above CREATES. September is payable again, so the family can now
    // build an ask the open order does not match — one month started, three months now
    // selected. `create` still refuses for `REPLACE_GRACE_MINUTES`, and it is right to:
    // that is the window in which money may already be moving.
    //
    // Reopening the one-month page anyway would charge an amount they did not pick, so the
    // only honest answer names the payment they have and offers it back. Before this it was
    // `billing.pay.failed` — "try again" for something trying again cannot fix.
    charges = [{ ...CHARGE, is_covered_elsewhere: true }]
    openOrders = [RESUMABLE]
    orderResponse = () => jsonResponse({ detail: { code: 'conflict', message: 'covered' } }, 409)
    const user = await open()
    // Three months: one settles September, two are bought forward — a different ask, so
    // `orderRefFor` finds no match and reaches the server's refusal.
    await user.click(screen.getByTestId('pay-months-3'))
    await user.click(payButton())

    await waitFor(() => expect(screen.getByTestId('pay-error')).toBeInTheDocument())
    expect(screen.getByTestId('pay-error')).toHaveTextContent(
      t('he', 'billing.pay.orderAlreadyOpen'),
    )
    // and the way out is on screen, not a ten-minute wait with nothing to read
    await user.click(screen.getByTestId('pay-resume-open-order'))
    await waitFor(() => expect(screen.getByTestId('payment-overlay')).toBeInTheDocument())
    expect(calls.some((call) => call.path === '/api/v1/payment-orders/ref-abandoned/form')).toBe(
      true,
    )
  })

  it('still opens a fresh order when the pending one is for a different ask', async () => {
    // A stuck order must not be reused for a different amount — that would open a payment
    // page for money the family did not agree to. Two months forward is a different ask.
    openOrders = [{ ...RESUMABLE, prepay_months: 2 }]
    const user = await open()
    await user.click(payButton())

    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.path.startsWith('/api/v1/payment-orders?') && call.init?.method === 'POST',
        ),
      ).toBe(true),
    )
    // and the form fetched is the NEW order's, not the stuck one's
    expect(calls.some((call) => call.path === '/api/v1/payment-orders/ref-1/form')).toBe(true)
  })
})

describe('a month chip that cannot be chosen says why', () => {
  // The owner's report: "when I press to pay in card one month or two months, that amount
  // doesn't change." It could not. `monthsBlocked` disables every chip whose forward half
  // exceeds the headroom and `effectiveMonths` falls back to the largest allowed chip, so
  // the tap changed neither the selection nor the total — silently. The cash branch had
  // explained this since the ceiling shipped; the card branch, where the owner met it,
  // said nothing.
  it('names the ceiling when the family has paid as far ahead as the club takes', async () => {
    creditAgorot = 12 * MONTHLY // exactly the twelve-month ceiling: no room for a forward month
    await open()
    expect(screen.getByTestId('pay-months-capped')).toHaveTextContent(
      t('he', 'billing.pay.ceilingReached'),
    )
  })

  it('names the missing price when the child has no monthly total at all', async () => {
    // `monthly_total_agorot` is 0 when no OPEN price plan points at the child. That is not
    // a small allowance, it is none — and it is the club's data to fix, so the copy says so
    // rather than blaming the ceiling.
    terms = { cash_prepay_months: 3, cheque_prepay_months: 12, monthly_total_agorot: 0 }
    await open()
    expect(screen.getByTestId('pay-months-capped')).toHaveTextContent(
      t('he', 'billing.pay.noMonthlyPrice'),
    )
  })

  it('says nothing at all when every chip is genuinely available', async () => {
    // The note must not become furniture: a family with room to prepay sees no warning.
    await open()
    expect(screen.queryByTestId('pay-months-capped')).toBeNull()
  })
})
