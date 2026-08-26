// Dashboard artboards `3e` and `5a`, plus the reconciliation queue the canvas never drew.
//
// The tests that carry weight are the three findings with teeth: the cash affordance must
// create a payment and allocate it (never flag a charge), the charge-generation button must
// carry invariant 5 in words, and a match suggestion must never be applied without a human.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { CollectionsScreen } from './CollectionsScreen'
import type { HouseholdRow } from './CollectionsScreen'
import { ReconciliationQueue } from './ReconciliationQueue'
import { PricePlansScreen } from './PricePlansScreen'
import { DebtAlert } from './DebtAlert'
import { DEBT_ALERT_ORDER } from './register'
import { RUN_JOB_ORDER } from './RunJobTool'
import { ageBucket, daysOverdue, escalationRung } from './billingClient'
import { agorotFromShekels } from './money'
import type { DashboardBillingClient } from './billingClient'

const LOCALE = 'he' as const

function household(overrides: Partial<HouseholdRow> = {}): HouseholdRow {
  return {
    payerPersonId: 'payer-1',
    payerName: 'משפחת כהן',
    studentNames: ['דנה', 'יוסי'],
    balanceAgorot: 64_000,
    monthsInDebt: 2,
    daysOverdue: 5,
    ...overrides,
  }
}

function stub(overrides: Partial<DashboardBillingClient> = {}): DashboardBillingClient {
  return {
    runBilling: vi.fn().mockResolvedValue({ charges_created: 12, status: 'completed' }),
    recordPayment: vi.fn().mockResolvedValue({ allocated: 2, unallocatedAgorot: 3_000 }),
    unmatched: vi.fn().mockResolvedValue([]),
    suggestions: vi.fn().mockResolvedValue({ items: [], never_auto: true }),
    confirmMatch: vi.fn().mockResolvedValue(undefined),
    ignoreIpn: vi.fn().mockResolvedValue(undefined),
    pricePlans: vi.fn().mockResolvedValue([]),
    closePricePlan: vi.fn().mockResolvedValue({}),
    createPricePlan: vi.fn().mockResolvedValue({}),
    products: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as DashboardBillingClient
}

function renderCollections(props: Record<string, unknown> = {}) {
  return render(
    <CollectionsScreen
      locale={LOCALE}
      client={stub()}
      households={[household(), household({ payerPersonId: 'payer-2', daysOverdue: 15 })]}
      openDebtAgorot={128_000}
      collectedThisMonthAgorot={400_000}
      collectedSharePercent={79}
      activeSubscriptions={12}
      failedCharges={5}
      period={{ year: 2026, month: 11 }}
      {...props}
    />,
  )
}

describe('3e — collections', () => {
  it('records a cash payment through a dialogue and reports what it settled', async () => {
    // ▲ 3e finding 1, the sharpest on the artboard. The label is right — it records a
    // PAYMENT — but a one-click, one-row, one-aggregate control is exactly the shape that
    // invites the shortcut §5.10 forbids: a charge is settled by allocation, never mutated.
    const recordPayment = vi.fn().mockResolvedValue({ allocated: 2, unallocatedAgorot: 3_000 })
    renderCollections({ client: stub({ recordPayment }) })
    await userEvent.click(screen.getAllByTestId('record-cash')[0]!)
    expect(screen.getByLabelText(t(LOCALE, 'billing.payment.date'))).toBeInTheDocument()
    expect(screen.getByLabelText(t(LOCALE, 'billing.payment.amount'))).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.payment.amount')), '320')
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.payment.date')), '2026-11-12')
    await userEvent.click(screen.getByTestId('record-payment-submit'))
    // G2 at the boundary: the manager typed 320, the client sends 32000.
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountAgorot: 32_000, method: 'cash' }),
    )
    expect(await screen.findByText(t(LOCALE, 'billing.payment.allocatedOldestFirst'))).toBeInTheDocument()
    expect(screen.getByTestId('record-payment-surplus')).toBeInTheDocument()
  })

  it('puts invariant 5 in words on the charge-generation button', async () => {
    // 3e finding 2. `billing.run.idempotentHint` IS invariant 5 written for the manager, on
    // the single most consequential button on the dashboard — and the artboard draws it with
    // no confirmation, no in-progress state and no result.
    renderCollections()
    await userEvent.click(screen.getByTestId('run-charges'))
    expect(screen.getByTestId('run-idempotent-hint')).toHaveTextContent(
      'הרצה חוזרת לאותו חודש לא תיצור חיובים כפולים',
    )
  })

  it('reports the result of the run', async () => {
    renderCollections()
    await userEvent.click(screen.getByTestId('run-charges'))
    await userEvent.click(screen.getByTestId('run-charges-confirm'))
    expect(await screen.findByTestId('run-result')).toHaveTextContent('12')
  })

  it('shows which rung of the ladder each household is on', () => {
    // 3e finding 4: `billing.debt.escalation.*` models FOUR rungs — day3, day7, day14, none
    // — and the artboard has one undifferentiated reminder button. A manager who cannot see
    // the rung cannot tell a first nudge from a final notice.
    renderCollections()
    const rungs = screen.getAllByTestId('household-rung')
    expect(rungs[0]!).toHaveTextContent(t(LOCALE, 'billing.debt.escalation.day3'))
    expect(rungs[1]!).toHaveTextContent(t(LOCALE, 'billing.debt.escalation.day14'))
  })

  it('is a household row and never a student row', () => {
    // D-M6-10 and L9: there is no household entity — the row unit is the payer, and the
    // children are a flat summary column inside it.
    renderCollections()
    const row = screen.getAllByTestId('household-row')[0]!
    expect(within(row).getByTestId('household-students')).toHaveTextContent('דנה, יוסי')
    expect(within(row).queryByTestId('expand-household')).not.toBeInTheDocument()
  })

  it('renders the empty state when the club has no debt', () => {
    // 3e finding 7, and the goal state for a well-run club.
    renderCollections({ households: [] })
    expect(screen.getByText('אין חובות פתוחים במועדון')).toBeInTheDocument()
  })

  it('disables the bulk reminder at zero selected', () => {
    renderCollections()
    expect(screen.getByTestId('bulk-reminder')).toBeDisabled()
  })

  it('names the two finance KPIs from its own namespace', () => {
    // D-M6-9. 3e finding 6: `נגבה החודש` and `79% מהצפוי` resolve to `reports.*`, which is
    // M9's namespace, on M6's screen. Seam 3 exists so two LANES never touch one file.
    renderCollections()
    expect(screen.getByText(t(LOCALE, 'billing.debt.collectedThisMonth'))).toBeInTheDocument()
    expect(screen.getByText('79% מהצפוי')).toBeInTheDocument()
  })
})

describe('the ageing and ladder arithmetic', () => {
  it('buckets ageing the way §5.10 does', () => {
    expect(ageBucket(0)).toBe('0_30')
    expect(ageBucket(30)).toBe('0_30')
    expect(ageBucket(31)).toBe('31_60')
    expect(ageBucket(61)).toBe('60_plus')
  })

  it('derives the rung from the same numbers the worker escalates on', () => {
    // Two answers to "how overdue is this" is how a screen starts disagreeing with the
    // messages the club actually sent.
    expect(escalationRung(2)).toBe('none')
    expect(escalationRung(3)).toBe('day3')
    expect(escalationRung(7)).toBe('day7')
    expect(escalationRung(14)).toBe('day14')
    expect(escalationRung(40)).toBe('day14')
  })

  it('counts whole days', () => {
    expect(daysOverdue('2026-11-01', '2026-11-12')).toBe(11)
  })
})

describe('the shekels boundary', () => {
  it('sends agorot for what a manager typed in shekels', () => {
    // The single most likely money bug in the product, and invisible until a parent is
    // billed ₪3.20 — or ₪32,000.
    expect(agorotFromShekels('320')).toBe(32_000)
    expect(agorotFromShekels('3.2')).toBe(320)
    expect(agorotFromShekels('0.29')).toBe(29)
  })

  it('rounds on the product rather than truncating', () => {
    // 3.2 * 100 is 320.00000000000006 in binary floating point; truncating charges a family
    // one agora less, on every price ending in a fraction.
    expect(agorotFromShekels('3.20')).toBe(320)
    expect(agorotFromShekels(19.99)).toBe(1_999)
  })

  it('treats nonsense as nothing rather than NaN', () => {
    expect(agorotFromShekels('')).toBe(0)
    expect(agorotFromShekels('abc')).toBe(0)
  })
})

describe('the reconciliation queue', () => {
  const IPN = {
    id: 'ipn-1',
    received_at: '2026-11-03T09:00:00Z',
    transactionid: 'SO-1',
    order_public_ref: null,
    amount: '250',
    amount_agorot: 25_000,
    card_owner_name: 'ישראל ישראלי',
    four_digits: '4242',
    payment_date: '2026-11-03',
    matched_payment_id: null,
    match_status: 'unmatched' as const,
    source_ip: '84.95.87.35',
  }

  function renderQueue(props: Record<string, unknown> = {}) {
    return render(
      <ReconciliationQueue
        locale={LOCALE}
        client={stub()}
        unmatched={[IPN]}
        suggestions={[
          {
            ipn_id: 'ipn-1',
            payer_person_id: 'payer-1',
            confidence: 2,
            amount_agorot: 25_000,
            card_owner_name: 'ישראל ישראלי',
            four_digits: '4242',
          },
        ]}
        expected={[]}
        payerName={() => 'משפחת כהן'}
        onChanged={vi.fn()}
        {...props}
      />,
    )
  }

  it('never applies a suggestion without a human', async () => {
    // §5.10 step 5, and the most important assertion on this screen. A wrong automatic match
    // marks the wrong payer paid and sends the wrong parent a debt reminder.
    const confirmMatch = vi.fn().mockResolvedValue(undefined)
    renderQueue({ client: stub({ confirmMatch }) })
    expect(screen.getByTestId('never-auto')).toHaveTextContent(
      'שיוך נרשם רק לאחר אישור אנושי',
    )
    expect(confirmMatch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('confirm-match'))
    expect(confirmMatch).toHaveBeenCalledTimes(1)
    expect(confirmMatch).toHaveBeenCalledWith('ipn-1', 'payer-1')
  })

  it('shows the card owner name and last four, because this is where reconciling happens', () => {
    // §11.7 forbids these in application LOGS. They are data on a manager-only screen, and
    // uPay provides no other identifying field — a confirmed provider limitation (§12).
    renderQueue()
    expect(screen.getByTestId('card-owner')).toHaveTextContent('ישראל ישראלי')
    expect(screen.getByTestId('four-digits')).toHaveTextContent('4242')
  })

  it('shows the raw amount beside our parse', () => {
    // `UpayIpnRecordOut.amount` is a STRING kept exactly as uPay sent it, beside
    // `amount_agorot`, which is our parse. A manager seeing both is the only way an amount
    // mismatch is legible.
    renderQueue()
    expect(screen.getByTestId('raw-amount')).toHaveTextContent('250')
    expect(screen.getByTestId('unmatched-row').querySelector('.studio-money')).not.toBeNull()
  })

  it('shows a dash rather than inventing a number we could not read', () => {
    // `ipn.py` raises rather than coercing on an unrecognised amount format, for exactly
    // this reason: a silent coercion becomes a fraud alert on a good payment.
    renderQueue({ unmatched: [{ ...IPN, amount: 'weird', amount_agorot: null }] })
    expect(screen.getByTestId('unreadable-amount')).toHaveTextContent('—')
  })

  it('cannot confirm a row with no suggestion', () => {
    renderQueue({ suggestions: [] })
    expect(screen.getByTestId('confirm-match')).toBeDisabled()
  })

  it('renders the empty state when nothing awaits matching', () => {
    renderQueue({ unmatched: [] })
    expect(screen.getByText('אין תשלומים הממתינים לשיוך')).toBeInTheDocument()
  })
})

describe('5a — prices and plans', () => {
  const PLAN = {
    id: 'plan-1',
    name: 'פעמיים בשבוע',
    sessions_per_week: 2,
    monthly_amount_agorot: 25_000,
    registration_fee_agorot: 10_000,
    active_from: '2026-09-01',
    active_to: null,
  }

  it('offers to close and replace a plan, never to edit its amount', async () => {
    // §5.10 and §5.15: a price change CLOSES the current plan and opens a new one, because a
    // charge raised last year must still be explicable by the plan in force when it was
    // raised. There is no shape in the API that edits an amount in place.
    render(
      <PricePlansScreen locale={LOCALE} client={stub()} plans={[PLAN]} onChanged={vi.fn()} />,
    )
    await userEvent.click(screen.getByTestId('plan-row'))
    expect(screen.getByTestId('versioned-hint')).toHaveTextContent(
      'שינוי מחיר סוגר את המסלול הקיים ופותח חדש',
    )
    expect(screen.getByTestId('plan-close')).toBeInTheDocument()
  })

  it('prices by training volume and never by group', () => {
    // C11. A group-scoped plan is what charged a child in two groups twice, at two different
    // prices, silently and forever.
    render(
      <PricePlansScreen locale={LOCALE} client={stub()} plans={[PLAN]} onChanged={vi.fn()} />,
    )
    expect(screen.getByTestId('plan-volume')).toHaveTextContent('2')
    expect(screen.queryByLabelText(/קבוצה/)).not.toBeInTheDocument()
  })

  it('shows a closed plan as history rather than hiding it', () => {
    render(
      <PricePlansScreen
        locale={LOCALE}
        client={stub()}
        plans={[PLAN, { ...PLAN, id: 'plan-0', active_to: '2026-08-31' }]}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('plan-row')).toHaveLength(2)
    expect(screen.getByTestId('plan-closed')).toBeInTheDocument()
  })

  it('takes amounts in shekels and sends agorot', async () => {
    const createPricePlan = vi.fn().mockResolvedValue(PLAN)
    render(
      <PricePlansScreen
        locale={LOCALE}
        client={stub({ createPricePlan })}
        plans={[]}
        onChanged={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.plan.name')), 'כל יום')
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.plan.monthlyAmount')), '500')
    await userEvent.click(screen.getByTestId('plan-save'))
    expect(createPricePlan).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyAmountAgorot: 50_000 }),
    )
  })

  it('renders the empty state before any plan exists', () => {
    render(<PricePlansScreen locale={LOCALE} client={stub()} plans={[]} onChanged={vi.fn()} />)
    expect(screen.getByText('לא הוגדרו מסלולים')).toBeInTheDocument()
  })
})

describe('the alert-centre section and the dev bar', () => {
  it('shows nothing when there is nothing to decide', () => {
    const { container } = render(
      <DebtAlert
        locale={LOCALE}
        overdueHouseholds={0}
        amountMismatches={0}
        staleOrders={0}
        onOpenCollections={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('raises the amount-mismatch alert as high priority', () => {
    // §5.10: 'a high-priority manager alert is raised'. If nobody looks, a family is chased
    // for a month they paid.
    render(
      <DebtAlert
        locale={LOCALE}
        overdueHouseholds={0}
        amountMismatches={1}
        staleOrders={0}
        onOpenCollections={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      t(LOCALE, 'billing.order.mismatchAlert'),
    )
  })

  it('registers at the orders the container already assigned', () => {
    // `features/people/register.ts` leaves order 10 free and says so: "M6's debt alert
    // belongs above a trial queue". `tools.ts` fixes runJob at 40.
    expect(DEBT_ALERT_ORDER).toBe(10)
    expect(RUN_JOB_ORDER).toBe(40)
  })
})
