// §6.1's payment step for a family joining through the club's link.
//
// Owner design, 2026-08-30: a payment method per kid, then one summary — card in one
// checkout, a הוראת קבע link per kid, cash and cheques told to the manager.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PaymentSetup, isHandCarried, rowsFor } from './PaymentSetup'
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
    openCharges: vi.fn().mockResolvedValue([charge('c1', 's1', 30_000), charge('c2', 's2', 40_000)]),
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

/** Answer for the current setup question. */
async function answer(method: string) {
  await userEvent.click(await screen.findByTestId(`setup-method-${method}`))
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
    expect(first).toHaveAccessibleName(
      t('he', 'schedule.setup.linkFor').replace('{name}', 'דנה'),
    )
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

  it('tells the manager about cash and cheques, one promise per method', async () => {
    // The manager settles "the family's cash" in one action; a row per child would be two
    // things to tick off for one handover.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('cash')
    await userEvent.click(await screen.findByTestId('setup-tell-manager'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(1))
    expect(createPromise).toHaveBeenCalledWith(['c1', 'c2'], 'cash', 0)
    expect(screen.getByTestId('setup-hand-sent')).toBeInTheDocument()
  })

  it('carries a different method per child through to the summary', async () => {
    // The reported gap: "pay for different kids — choose a payment for each kid."
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    setup({ client: stub({ createOrder }) })

    await answer('card')
    await userEvent.click(await screen.findByTestId('setup-change-s2'))
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
    await userEvent.click(await screen.findByTestId('setup-change-s1'))
    // Back on that child's question, not the other's.
    expect(await screen.findByTestId('setup-ask-s1')).toBeInTheDocument()
  })

  it('says so when the club has not priced a child, instead of skipping them', async () => {
    // `register` prices a child only when exactly one live plan matches their weekly
    // volume. Zero or two leaves them unpriced, on the manager's checklist — and a row
    // silently missing from this summary is the one nobody chases.
    setup({ client: stub({ openCharges: vi.fn().mockResolvedValue([charge('c1', 's1', 30_000)]) }) })
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
    await userEvent.click(await screen.findByTestId('setup-change-s2'))
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
    expect(createPromise).toHaveBeenCalledWith(['c1', 'c2'], 'standing_order', 0)
    await waitFor(() => expect(onFinish).toHaveBeenCalled())
  })

  it('does not write a second standing-order promise for a family also paying by cash', async () => {
    // Mixed families are the common case (owner spec). Only the standing-order rows go
    // into this promise; the cash rows still go through `tellTheManager`'s own button.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('card')
    await userEvent.click(await screen.findByTestId('setup-change-s2'))
    await answer('standing_order')
    await userEvent.click(screen.getByTestId('setup-change-s1'))
    await answer('cash')

    await userEvent.click(await screen.findByTestId('setup-tell-manager'))
    await waitFor(() => expect(createPromise).toHaveBeenCalledWith(['c1'], 'cash', 0))

    await userEvent.click(screen.getByTestId('setup-finish'))
    await waitFor(() => expect(createPromise).toHaveBeenCalledWith(['c2'], 'standing_order', 0))
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
})
