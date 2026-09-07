// תשלומים, at the seam. `pay.test.ts` holds the arithmetic; this holds the wiring, because
// a field dropped between `fetch` and the component passes every unit test in the repo.
//
// The screen's three rules are the assertions:
//
//  1. the debt is every open charge and NOTHING on the screen moves it;
//  2. the button states the exact amount it is about to charge;
//  3. when that amount jumps, a line on the screen says why — and on the cash side it
//     names the club as the one who chose.
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
let orderResponse: () => Response
let formResponse: () => Response

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
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
  if (path.endsWith('/form')) return formResponse()
  if (path.startsWith('/api/v1/payment-orders')) return orderResponse()
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
  orderResponse = () => jsonResponse({ public_ref: 'ref-1' })
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

describe('the number that never moves', () => {
  it('is the debt, and it survives every choice on the screen', async () => {
    const user = await open()
    const owed = screen.getByTestId('pay-owed-amount')
    expect(owed).toHaveTextContent('208.33₪')
    expect(within(screen.getByTestId('pay-owed')).getByText(t('he', 'billing.pay.owed'))).toBeInTheDocument()

    // Three months on the card, then cash — the two choices that used to rewrite the
    // figure a parent came to the screen to read.
    await user.click(screen.getByTestId('pay-months-3'))
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('208.33₪')
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('208.33₪')
  })

  it('names the month and the child under it', async () => {
    await open()
    // The seam: `/me/students` is the only source of a name here, and without it every row
    // said "09/2026" and a two-child family could not tell whose month was whose.
    expect(screen.getByTestId('pay-owed')).toHaveTextContent('יובל כהן')
  })

  it('counts a charge another payment holds, and says which part that is', async () => {
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
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('458.33₪')
    // Rule 1 costs something: the total counts money this parent cannot pay right now. The
    // covered line is what stops that being a contradiction with nothing explaining it.
    expect(screen.getByTestId('pay-covered')).toHaveTextContent('250₪')
    // …and the button offers only what is actually payable.
    expect(payButton()).toHaveTextContent('208.33₪')
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
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('375₪')
    expect(payButton()).toHaveTextContent('375₪')
    expect(screen.queryByTestId('pay-forward-note')).toBeNull()
  })

  it('names the club when the cash block is what raises the number', async () => {
    // ₪900 IS on this screen — it is three months at ₪300, which is the club's own cash
    // term and not a choice the parent made. The defect was never the figure; it was a
    // figure with nothing beside it. ₪375 + ₪900 = ₪1,275, and the button says so.
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('375₪')
    expect(screen.getByTestId('pay-cash-term')).toHaveTextContent(
      t('he', 'billing.pay.cashTerm').replace('{{count}}', '3'),
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

  it('names the CLUB when cash adds the months, because the club chose them', async () => {
    const user = await open()
    await user.click(screen.getByTestId('pay-method-cash'))
    // The month chips are the card's question and disappear with it: leaving them on
    // screen under cash would present the club's rule as something to answer.
    expect(screen.queryByTestId('pay-months')).toBeNull()
    expect(screen.getByTestId('pay-cash-term')).toHaveTextContent('המועדון גובה 3')
    expect(payButton()).toHaveTextContent('958.33₪')
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
    expect(screen.getByTestId('pay-owed-amount')).toHaveTextContent('0₪')
    expect(screen.getByText(t('he', 'billing.pay.clearTitle'))).toBeInTheDocument()
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
