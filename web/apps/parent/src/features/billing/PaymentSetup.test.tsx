// §6.1's payment step for a family joining through the club's link.
//
// Owner design, 2026-08-30: a payment method per kid, then one summary — card in one
// checkout, a הוראת קבע link per kid, cash and cheques told to the manager.
//
// Decision 17 (2026-09-03) made "כבר שילמתי" a fifth, up-front answer -- offered
// alongside the other four rather than a checkbox buried under standing-order rows --
// and decision 18/19 generalised the (method, already_paid) split and the "never reads
// as settled" chip wording to every hand-carried route, not just standing order.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PaymentSetup, isHandCarried, rowsFor } from './PaymentSetup'
// The same sentinel PaymentsSection.tsx's own `onOrderOpened` already checks (F15, cause
// 1) and the real client `makeParentBillingClient` builds (F15, cause 2) -- imported
// rather than retyped, so a drift here is a compile error, not a second place for the
// two checks (or the test and the fix) to disagree.
import { DEMO_SIMULATOR, makeParentBillingClient } from './PaymentsSection'
import type { BillingClient, ChargeOut } from './billingClient'

const DANA = { id: 's1', first_name: 'דנה', last_name: 'לוי' }
const YOAV = { id: 's2', first_name: 'יואב', last_name: 'לוי' }

function charge(id: string, studentId: string, amount: number): ChargeOut {
  return {
    id,
    payer_person_id: 'payer-1',
    student_id: studentId,
    kind: 'tuition',
    period_year: 2026,
    period_month: 9,
    amount_agorot: amount,
    original_amount_agorot: null,
    proration_note: null,
    due_date: '2026-09-28',
    status: 'open',
    created_by: 'billing_run',
    allocated_agorot: 0,
    is_covered_elsewhere: false,
  } as ChargeOut
}

function stub(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    openCharges: vi
      .fn()
      .mockResolvedValue([charge('c1', 's1', 30_000), charge('c2', 's2', 40_000)]),
    promises: vi.fn().mockResolvedValue([]),
    createPromise: vi.fn().mockResolvedValue(undefined),
    balance: vi.fn(),
    payments: vi.fn().mockResolvedValue([]),
    products: vi.fn().mockResolvedValue([]),
    createOrder: vi.fn().mockResolvedValue({ public_ref: 'ref-1' }),
    orderForm: vi.fn().mockResolvedValue({ action: 'https://upay', fields: {} }),
    orderStatus: vi.fn(),
    ...overrides,
  } as BillingClient
}

const LINKS = [
  { studentId: 's1', amountAgorot: 30_000, url: 'https://app.upay.co.il/r/300' },
  { studentId: 's2', amountAgorot: 40_000, url: 'https://app.upay.co.il/r/400' },
]

function setup(props: Partial<Parameters<typeof PaymentSetup>[0]> = {}) {
  return render(
    <PaymentSetup
      locale="he"
      client={stub()}
      students={[DANA, YOAV]}
      standingOrderLinks={LINKS}
      onFinish={vi.fn()}
      {...props}
    />,
  )
}

/** Answer for the current setup question (family or per-child override) with one of the
 *  four plain methods -- never "already paid", which has its own follow-up. */
async function answer(method: string) {
  await userEvent.click(await screen.findByTestId(`setup-method-${method}`))
}

/** Decision 17's fifth choice, from whichever screen (family or override) is open:
 *  "כבר שילמתי" then the one follow-up, מזומן / צ׳ק / הוראת קבע. */
async function claimAlreadyPaid(method: 'cash' | 'cheque' | 'standing_order') {
  await userEvent.click(await screen.findByTestId('setup-method-already_paid'))
  await userEvent.click(await screen.findByTestId(`setup-claim-method-${method}`))
}

/** Opens the per-row "שינוי" override for one child from the summary. */
async function change(childId: string) {
  await userEvent.click(await screen.findByTestId(`setup-change-${childId}`))
}

describe('the onboarding payment step', () => {
  it('asks for one family method before the per-child summary', async () => {
    setup()
    expect(await screen.findByTestId('setup-family-method')).toHaveTextContent(
      t('he', 'schedule.setup.familyMethodHint'),
    )
    await answer('card')
    expect(await screen.findByTestId('setup-card')).toHaveTextContent('700')
  })

  it('settles every card child in ONE checkout, opened in the in-app overlay', async () => {
    // Money is held per PAYER, not per child, so one order covers them both — a two-child
    // family enters their card once rather than twice. 2026-09-03 addendum: opened in the
    // overlay instead of navigating the tab away, so the family never leaves the wizard.
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    setup({ client: stub({ createOrder }) })

    await answer('card')

    // 300 + 400 quoted before they leave the app.
    expect(await screen.findByTestId('setup-card')).toHaveTextContent('700')
    await userEvent.click(screen.getByTestId('setup-pay-card'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith(['c1', 'c2'], 1, 0))
    await screen.findByTestId('payment-overlay')
    expect(document.querySelector('form[target]')).not.toBeNull()
  })

  it('F15 cause 1 — says so instead of opening a blank frame when the studio has no live form', async () => {
    // `orderForm` resolves to the demo sentinel exactly the way the real client does for
    // both a demo studio (its own explicit action) and the 409 `demo_studio_has_no_live_form`
    // it is caught and turned into (PaymentsSection.tsx `orderForm`) -- one guard here
    // closes both. Nothing failed, so this must read as a notice, not an error, and the
    // row list must reload rather than staying on pre-order data.
    const openCharges = vi
      .fn()
      .mockResolvedValue([charge('c1', 's1', 30_000), charge('c2', 's2', 40_000)])
    const orderForm = vi.fn().mockResolvedValue(DEMO_SIMULATOR)
    setup({ client: stub({ openCharges, orderForm }) })

    await answer('card')
    await userEvent.click(await screen.findByTestId('setup-pay-card'))

    await waitFor(() => expect(orderForm).toHaveBeenCalled())
    // No iframe overlay: the sentinel is never handed to the overlay-opening code.
    expect(screen.queryByTestId('payment-overlay')).toBeNull()
    expect(await screen.findByTestId('setup-notice')).toHaveTextContent(
      t('he', 'billing.card.demoOrderOpened'),
    )
    expect(screen.queryByTestId('setup-error')).toBeNull()
    // The initial mount read, plus one after the sentinel — the row list is refreshed
    // rather than left showing data fetched before this order existed.
    await waitFor(() => expect(openCharges).toHaveBeenCalledTimes(2))
  })

  it('F15 cause 2 — names the reason when card payment is not configured for this deployment', async () => {
    // Driven through the REAL client's error path (`makeParentBillingClient`,
    // PaymentsSection.tsx) rather than an `Error` this test builds by hand — this asserts
    // the shape the server actually produces (`detail.code` on a 503), the same shape
    // `GET /payment-orders/{ref}/form` sends when `UPAY_MERCHANT_EMAIL` is unset
    // (app/routers/payments.py).
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/payment-orders/ref-1/form') {
        return new Response(
          JSON.stringify({
            detail: {
              code: 'merchant_account_unconfigured',
              message: 'card payment is not configured for this deployment',
            },
          }),
          { status: 503 },
        )
      }
      throw new Error(`unexpected fetch in this test: ${path}`)
    })
    const orderForm = makeParentBillingClient(fetcher).orderForm
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    setup({ client: stub({ createOrder, orderForm }) })

    await answer('card')
    await userEvent.click(await screen.findByTestId('setup-pay-card'))

    expect(await screen.findByTestId('setup-error')).toHaveTextContent(
      t('he', 'billing.card.merchantUnconfigured'),
    )
    expect(screen.queryByTestId('payment-overlay')).toBeNull()
    expect(screen.queryByTestId('setup-notice')).toBeNull()
  })

  it('gives הוראת קבע a separate link per child, each opened in the in-app overlay', async () => {
    // A uPay shared link charges a FIXED amount, so two children need two mandates — one
    // link for both would underpay for the second every month (owner, 2026-08-30).
    // 2026-09-03 addendum: opened in the overlay instead of a new tab.
    setup()
    await answer('standing_order')

    const first = await screen.findByTestId('setup-standing-link-s1')
    const second = screen.getByTestId('setup-standing-link-s2')
    // Told apart by name, because two controls with the same words are two links a screen
    // reader cannot distinguish.
    expect(first).toHaveAccessibleName(t('he', 'schedule.setup.linkFor').replace('{name}', 'דנה'))
    // Nothing is charged by this route, so no card total appears.
    expect(screen.queryByTestId('setup-card')).toBeNull()

    await userEvent.click(first)
    const iframe = (await screen.findByTitle(/./)) as HTMLIFrameElement
    expect(iframe.src).toBe('https://app.upay.co.il/r/300')

    await userEvent.click(screen.getByTestId('payment-overlay-close'))
    await userEvent.click(second)
    const iframe2 = (await screen.findByTitle(/./)) as HTMLIFrameElement
    expect(iframe2.src).toBe('https://app.upay.co.il/r/400')
  })

  it('tells the manager about cash and cheques, one promise per method, when nobody has claimed already-paid', async () => {
    // The manager settles "the family's cash" in one action; a row per child would be two
    // things to tick off for one handover. Decision 18 always splits by (method,
    // already_paid), so the ordinary case is a single `already_paid: false` promise.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('cash')
    await userEvent.click(await screen.findByTestId('setup-tell-manager'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(1))
    expect(createPromise).toHaveBeenCalledWith(['c1', 'c2'], 'cash', 0, false)
    expect(screen.getByTestId('setup-hand-sent')).toBeInTheDocument()
  })

  it('F20 / decision 18 — splits cash into two promises when one child claimed already-paid and the other has not', async () => {
    // Today `tellTheManager()` grouped by method alone, so a claimed payment and an
    // expected one, both cash, would merge into one promise reporting `already_paid:
    // false` — losing the claim entirely. This drives the real client call, not a
    // hand-built grouping check, the same way `recordStandingOrder()` was already
    // proven for standing order below.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('cash') // family: both children pay cash, nobody has claimed yet
    await change('s1')
    await claimAlreadyPaid('cash') // s1 alone claims "already paid, cash"

    await userEvent.click(await screen.findByTestId('setup-tell-manager'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(2))
    expect(createPromise).toHaveBeenCalledWith(['c1'], 'cash', 0, true)
    expect(createPromise).toHaveBeenCalledWith(['c2'], 'cash', 0, false)
  })

  it('carries a different method per child through to the summary', async () => {
    // The reported gap: "pay for different kids — choose a payment for each kid."
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    setup({ client: stub({ createOrder }) })

    await answer('card')
    await change('s2')
    await answer('standing_order')

    // Only the card child is in the checkout, at their own price.
    expect(await screen.findByTestId('setup-card')).toHaveTextContent('300')
    await userEvent.click(screen.getByTestId('setup-pay-card'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith(['c1'], 1, 0))
    // And only the other child gets a mandate link.
    expect(screen.getByTestId('setup-standing-link-s2')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-standing-link-s1')).toBeNull()
  })

  it('lets a family change an answer from the summary', async () => {
    setup()
    await answer('card')
    await change('s1')
    // Back on that child's question, not the other's.
    expect(await screen.findByTestId('setup-ask-s1')).toBeInTheDocument()
  })

  it('says so when the club has not priced a child, instead of skipping them', async () => {
    // `register` prices a child only when exactly one live plan matches their weekly
    // volume. Zero or two leaves them unpriced, on the manager's checklist — and a row
    // silently missing from this summary is the one nobody chases.
    setup({
      client: stub({ openCharges: vi.fn().mockResolvedValue([charge('c1', 's1', 30_000)]) }),
    })
    await answer('card')
    expect(await screen.findByTestId('setup-unpriced-s2')).toHaveTextContent(
      t('he', 'schedule.setup.unpriced'),
    )
    expect(screen.getByTestId('setup-card')).toHaveTextContent('300')
  })

  it('finishes into the app when nothing is owed', async () => {
    const onFinish = vi.fn()
    setup({ client: stub({ openCharges: vi.fn().mockResolvedValue([]) }), onFinish })
    await userEvent.click(await screen.findByTestId('setup-finish'))
    expect(onFinish).toHaveBeenCalled()
  })

  it('reports the final per-child method/amount summary alongside onFinish', async () => {
    const onSummary = vi.fn()
    setup({ onSummary })
    await answer('card')
    await change('s2')
    await answer('cash')
    await userEvent.click(screen.getByTestId('setup-finish'))

    await waitFor(() => expect(onSummary).toHaveBeenCalledTimes(1))
    expect(onSummary).toHaveBeenCalledWith([
      { studentId: 's1', displayName: 'דנה', method: 'card', amountAgorot: 30_000 },
      { studentId: 's2', displayName: 'יואב', method: 'cash', amountAgorot: 40_000 },
    ])
  })

  it('tells the manager about a standing-order mandate too, on finish', async () => {
    // §7.1 — `tellTheManager()` only loops cash/cheque, so a family who picks standing
    // order for every child pressed סיום and the manager's queue never got a row. The
    // manager's own payments screen already lists a `standing_order` promise
    // (PaymentPromisesPanel.tsx); this is what writes one.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    const onFinish = vi.fn()
    setup({ client: stub({ createPromise }), onFinish })

    await answer('standing_order')
    await userEvent.click(await screen.findByTestId('setup-finish'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(1))
    expect(createPromise).toHaveBeenCalledWith(['c1', 'c2'], 'standing_order', 0, false)
    await waitFor(() => expect(onFinish).toHaveBeenCalled())
  })

  it('lets a parent mark a standing-order child as already paid outside the app, separately from the rest', async () => {
    // A family who paid the manager directly (cash in hand, before the mandate cleared)
    // still needs the manager to see and verify that claim -- distinctly from a child
    // whose mandate is still just expected. Decision 17 moved this from a checkbox under
    // the mandate-link card to the same up-front "כבר שילמתי" flow every method gets.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('standing_order')
    await change('s1')
    await claimAlreadyPaid('standing_order')
    await userEvent.click(screen.getByTestId('setup-finish'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(2))
    expect(createPromise).toHaveBeenCalledWith(['c1'], 'standing_order', 0, true)
    expect(createPromise).toHaveBeenCalledWith(['c2'], 'standing_order', 0, false)
  })

  it('does not write a second standing-order promise for a family also paying by cash', async () => {
    // Mixed families are the common case (owner spec). Only the standing-order rows go
    // into this promise; the cash rows still go through `tellTheManager`'s own button.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('card')
    await change('s2')
    await answer('standing_order')
    await change('s1')
    await answer('cash')

    await userEvent.click(await screen.findByTestId('setup-tell-manager'))
    await waitFor(() => expect(createPromise).toHaveBeenCalledWith(['c1'], 'cash', 0, false))

    await userEvent.click(screen.getByTestId('setup-finish'))
    await waitFor(() =>
      expect(createPromise).toHaveBeenCalledWith(['c2'], 'standing_order', 0, false),
    )
    expect(createPromise).toHaveBeenCalledTimes(2)
  })

  it('does not treat a failed charges read as nothing owed', async () => {
    // §7.6 — a transient 500 on `openCharges` silently became `rows = []`, then
    // `payable.length === 0`, then `onNothingToPay()`, then `finishWizard`: a family with
    // an unpaid first month bounced out of onboarding entirely by a network blip.
    const onNothingToPay = vi.fn()
    setup({
      client: stub({ openCharges: vi.fn().mockRejectedValue(new Error('boom')) }),
      onNothingToPay,
    })
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
    expect(onNothingToPay).not.toHaveBeenCalled()
  })

  it('retries the charges read from the failed state', async () => {
    const openCharges = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([charge('c1', 's1', 30_000), charge('c2', 's2', 40_000)])
    setup({ client: stub({ openCharges }) })
    await userEvent.click(await screen.findByTestId('load-failed-retry'))
    expect(await screen.findByTestId('setup-family-method')).toBeInTheDocument()
  })

  it('shows a loading state rather than a bare screen while charges load', async () => {
    let resolve: (value: ChargeOut[]) => void = () => {}
    const openCharges = vi.fn().mockReturnValue(
      new Promise<ChargeOut[]>((r) => {
        resolve = r
      }),
    )
    const { container } = setup({ client: stub({ openCharges }) })
    expect(screen.getByTestId('payment-setup-loading')).toBeInTheDocument()
    expect(container).not.toBeEmptyDOMElement()
    resolve([])
    await waitFor(() => expect(screen.queryByTestId('payment-setup-loading')).toBeNull())
  })

  it('keeps the card out of the promise queue', () => {
    // A card payment settles itself through the IPN; a card promise would be a pending
    // item nobody ever has to act on.
    expect(isHandCarried('card')).toBe(false)
    expect(isHandCarried('cash')).toBe(true)
    expect(isHandCarried('standing_order')).toBe(true)
  })

  it('groups charges by the child they belong to', () => {
    const rows = rowsFor([DANA, YOAV], [charge('c1', 's1', 30_000), charge('c3', 's1', 5_000)])
    expect(rows[0]!.amountAgorot).toBe(35_000)
    expect(rows[1]!.amountAgorot).toBe(0)
  })

  it('gives every control an accessible name', async () => {
    setup()
    await screen.findByTestId('setup-family-method')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })

  // -- decision 17 — "כבר שילמתי" as a real, up-front fifth choice ------------------------

  describe('decision 17 — "כבר שילמתי" as a fifth, up-front family choice', () => {
    it('is offered alongside the other four, before any price is read, and asks one follow-up that never offers כרטיס אשראי', async () => {
      setup()

      // The fifth choice sits next to the other four on the very first screen.
      expect(await screen.findByTestId('setup-method-card')).toBeInTheDocument()
      expect(screen.getByTestId('setup-method-cash')).toBeInTheDocument()
      expect(screen.getByTestId('setup-method-cheque')).toBeInTheDocument()
      expect(screen.getByTestId('setup-method-standing_order')).toBeInTheDocument()
      const alreadyPaidButton = screen.getByTestId('setup-method-already_paid')
      expect(alreadyPaidButton).toHaveTextContent(t('he', 'schedule.plan.gate.paidAlready'))

      await userEvent.click(alreadyPaidButton)

      // The one follow-up — איך שילמתם — offers exactly the three hand-carried routes.
      expect(
        await screen.findByText(t('he', 'billing.alreadyPaid.methodQuestion')),
      ).toBeInTheDocument()
      expect(screen.getByTestId('setup-claim-method-cash')).toBeInTheDocument()
      expect(screen.getByTestId('setup-claim-method-cheque')).toBeInTheDocument()
      expect(screen.getByTestId('setup-claim-method-standing_order')).toBeInTheDocument()
      expect(screen.queryByTestId('setup-claim-method-card')).toBeNull()
      expect(screen.queryByTestId(/^setup-method-(?!already_paid)/)).toBeNull()
    })

    it('stores method + already_paid: true for every payable child once the follow-up is answered', async () => {
      setup()
      await claimAlreadyPaid('cheque')

      const expectedChip = t('he', 'billing.chip.alreadyPaid').replace(
        '{{method}}',
        t('he', 'schedule.plan.gate.method.cheque'),
      )
      expect(await screen.findByTestId('setup-row-s1')).toHaveTextContent(expectedChip)
      expect(screen.getByTestId('setup-row-s2')).toHaveTextContent(expectedChip)
    })

    it('can be cancelled back to the five-choice screen without answering', async () => {
      setup()
      await userEvent.click(await screen.findByTestId('setup-method-already_paid'))
      await userEvent.click(await screen.findByTestId('setup-claim-cancel'))
      expect(await screen.findByTestId('setup-method-already_paid')).toBeInTheDocument()
      expect(screen.queryByTestId('setup-claim-method-cash')).toBeNull()
    })

    it('lets a per-row "שינוי" override diverge into an already-paid claim independently of the family choice', async () => {
      const createPromise = vi.fn().mockResolvedValue(undefined)
      setup({ client: stub({ createPromise }) })

      await answer('card') // family: everyone pays by card
      await change('s2')
      await claimAlreadyPaid('cheque') // s2 alone claims "already paid, cheque"

      // s1 is still the only card child.
      expect(await screen.findByTestId('setup-card')).toHaveTextContent('300')
      const expectedChip = t('he', 'billing.chip.alreadyPaid').replace(
        '{{method}}',
        t('he', 'schedule.plan.gate.method.cheque'),
      )
      expect(screen.getByTestId('setup-row-s2')).toHaveTextContent(expectedChip)

      await userEvent.click(await screen.findByTestId('setup-tell-manager'))
      await waitFor(() => expect(createPromise).toHaveBeenCalledWith(['c2'], 'cheque', 0, true))
    })
  })

  // -- decision 19 — the exact chip wording per §4's table ------------------------------

  describe('decision 19 — a claimed payment never reads as settled', () => {
    it('renders the plain method chip for a row paying now', async () => {
      setup()
      await answer('cash')
      expect(await screen.findByTestId('setup-row-s1')).toHaveTextContent(
        t('he', 'schedule.plan.gate.method.cash'),
      )
    })

    it('renders "כבר שולם · מזומן · ממתין לאישור המועדון" for an already-paid cash row', async () => {
      setup()
      await claimAlreadyPaid('cash')
      const expected = t('he', 'billing.chip.alreadyPaid').replace(
        '{{method}}',
        t('he', 'schedule.plan.gate.method.cash'),
      )
      expect(expected).toBe('כבר שולם · מזומן · ממתין לאישור המועדון')
      expect(await screen.findByTestId('setup-row-s1')).toHaveTextContent(expected)
      expect(screen.getByTestId('setup-row-s2')).toHaveTextContent(expected)
    })

    it('renders "הוראת קבע · המועדון יאשר לאחר קליטת ההוראה" for a not-yet-cleared standing-order row', async () => {
      setup()
      await answer('standing_order')
      expect(t('he', 'billing.chip.standingPending')).toBe(
        'הוראת קבע · המועדון יאשר לאחר קליטת ההוראה',
      )
      expect(await screen.findByTestId('setup-row-s1')).toHaveTextContent(
        t('he', 'billing.chip.standingPending'),
      )
      expect(screen.getByTestId('setup-row-s2')).toHaveTextContent(
        t('he', 'billing.chip.standingPending'),
      )
    })
  })

  // -- decision 15/16 regression — a claim never re-enters the mandate-link queue -------

  describe('decision 15/16 — a claimed standing-order child is never in the mandate-link queue', () => {
    it('excludes only the claimed child, while an unclaimed sibling still gets their link', async () => {
      setup()
      await answer('standing_order')
      await change('s1')
      await claimAlreadyPaid('standing_order')

      // s1 claimed the mandate already exists; s2 has not.
      expect(screen.queryByTestId('setup-standing-link-s1')).toBeNull()
      expect(await screen.findByTestId('setup-standing-link-s2')).toBeInTheDocument()
    })

    it('hides the mandate-link card entirely once every standing-order child has claimed', async () => {
      setup()
      await claimAlreadyPaid('standing_order')
      // Both children are already-paid standing order — no links to offer at all.
      await screen.findByTestId('setup-row-s1')
      expect(screen.queryByTestId('setup-standing')).toBeNull()
    })

    it('still writes a promise for the claimed child even though they are off the link queue', async () => {
      const createPromise = vi.fn().mockResolvedValue(undefined)
      setup({ client: stub({ createPromise }) })

      await claimAlreadyPaid('standing_order')
      await userEvent.click(screen.getByTestId('setup-finish'))

      await waitFor(() =>
        expect(createPromise).toHaveBeenCalledWith(['c1', 'c2'], 'standing_order', 0, true),
      )
    })
  })
})
