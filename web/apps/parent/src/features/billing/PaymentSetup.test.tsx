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
      onOrderOpened={vi.fn()}
      onFinish={vi.fn()}
      {...props}
    />,
  )
}

/** Answer for the child currently being asked about. */
async function answer(method: string) {
  await userEvent.click(await screen.findByTestId(`setup-method-${method}`))
}

describe('the onboarding payment step', () => {
  it('asks once per child, and names the price their groups already decided', async () => {
    // The price is not a question here — `register` derived it from the groups the parent
    // picked. This screen shows it and asks only how the money moves.
    setup()
    expect(await screen.findByTestId('setup-ask-s1')).toHaveTextContent(
      t('he', 'schedule.plan.gate.payHow'),
    )
    await answer('card')
    expect(await screen.findByTestId('setup-ask-s2')).toBeInTheDocument()
  })

  it('settles every card child in ONE checkout', async () => {
    // Money is held per PAYER, not per child, so one order covers them both — a two-child
    // family enters their card once rather than twice.
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    const onOrderOpened = vi.fn()
    setup({ client: stub({ createOrder }), onOrderOpened })

    await answer('card')
    await answer('card')

    // 300 + 400 quoted before they leave the app.
    expect(await screen.findByTestId('setup-card')).toHaveTextContent('700')
    await userEvent.click(screen.getByTestId('setup-pay-card'))
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith(['c1', 'c2'], 1, 0))
    await waitFor(() => expect(onOrderOpened).toHaveBeenCalled())
  })

  it('gives הוראת קבע a separate link per child', async () => {
    // A uPay shared link charges a FIXED amount, so two children need two mandates — one
    // link for both would underpay for the second every month (owner, 2026-08-30).
    setup()
    await answer('standing_order')
    await answer('standing_order')

    const first = await screen.findByTestId('setup-standing-link-s1')
    const second = screen.getByTestId('setup-standing-link-s2')
    expect(first).toHaveAttribute('href', 'https://app.upay.co.il/r/300')
    expect(second).toHaveAttribute('href', 'https://app.upay.co.il/r/400')
    // Told apart by name, because two anchors with the same words are two links a screen
    // reader cannot distinguish.
    expect(first).toHaveAccessibleName(
      t('he', 'schedule.setup.linkFor').replace('{name}', 'דנה'),
    )
    // Nothing is charged by this route, so no card total appears.
    expect(screen.queryByTestId('setup-card')).toBeNull()
  })

  it('tells the manager about cash and cheques, one promise per method', async () => {
    // The manager settles "the family's cash" in one action; a row per child would be two
    // things to tick off for one handover.
    const createPromise = vi.fn().mockResolvedValue(undefined)
    setup({ client: stub({ createPromise }) })

    await answer('cash')
    await answer('cheque')
    await userEvent.click(await screen.findByTestId('setup-tell-manager'))

    await waitFor(() => expect(createPromise).toHaveBeenCalledTimes(2))
    expect(createPromise).toHaveBeenCalledWith(['c1'], 'cash', 0)
    expect(createPromise).toHaveBeenCalledWith(['c2'], 'cheque', 0)
    expect(screen.getByTestId('setup-hand-sent')).toBeInTheDocument()
  })

  it('carries a different method per child through to the summary', async () => {
    // The reported gap: "pay for different kids — choose a payment for each kid."
    const createOrder = vi.fn().mockResolvedValue({ public_ref: 'ref-1' })
    setup({ client: stub({ createOrder }) })

    await answer('card')
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
    await screen.findByTestId('setup-ask-s1')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })
})
