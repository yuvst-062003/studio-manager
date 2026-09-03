// Dashboard artboards `3e` and `5a`, plus the reconciliation queue the canvas never drew.
//
// The tests that carry weight are the three findings with teeth: the cash affordance must
// create a payment and allocate it (never flag a charge), the charge-generation button must
// carry invariant 5 in words, and a match suggestion must never be applied without a human.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { CollectionsScreen } from './CollectionsScreen'
import type { HouseholdRow } from './CollectionsScreen'
import { ReconciliationQueue } from './ReconciliationQueue'
import { PricePlansScreen } from './PricePlansScreen'
import { PaymentPromisesPanel } from './PaymentPromisesPanel'
import { StandingOrderLinksPanel } from './StandingOrderLinksPanel'
import { PrepayTermsPanel } from './PrepayTermsPanel'
import { PlanChangesPanel } from './PlanChangesPanel'
import { PRICES_WIZARD_ORDER, PricesWizardStep } from './PricesWizardStep'
import { DebtAlert } from './DebtAlert'
import { DEBT_ALERT_ORDER } from './register'
import { RUN_JOB_ORDER } from './RunJobTool'
import { ageBucket, creditByPayer, daysOverdue, escalationRung } from './billingClient'
import { agorotFromShekels } from './money'
import type { DashboardBillingClient, ManagerPaymentPromiseOut } from './billingClient'

const LOCALE = 'he' as const

function household(overrides: Partial<HouseholdRow> = {}): HouseholdRow {
  return {
    payerPersonId: 'payer-1',
    payerName: 'משפחת כהן',
    studentNames: ['דנה', 'יוסי'],
    balanceAgorot: 64_000,
    creditAgorot: 0,
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
    paymentPromises: vi.fn().mockResolvedValue([]),
    setStandingOrderLink: vi.fn().mockResolvedValue({}),
    billingSettings: vi.fn().mockResolvedValue({
      cash_prepay_months: 3,
      cheque_prepay_months: 12,
      run_day: 1,
      cash_instructions: null,
    }),
    saveBillingSettings: vi.fn().mockResolvedValue({}),
    planChanges: vi.fn().mockResolvedValue([]),
    settlePlanChange: vi.fn().mockResolvedValue(undefined),
    confirmPromise: vi.fn().mockResolvedValue(undefined),
    declinePromise: vi.fn().mockResolvedValue(undefined),
    unpricedStudents: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as DashboardBillingClient
}

function managerPromise(
  id: string,
  method: 'cash' | 'cheque',
  overrides: Record<string, unknown> = {},
): ManagerPaymentPromiseOut {
  return {
    id,
    status: 'pending',
    method,
    total_agorot: 90_000,
    claimed_plan_name: null,
    already_paid: false,
    payer_person_id: 'payer-1',
    payer_name: 'משפחת כהן',
    charge_count: 3,
    prepay_months: 0,
    created_at: '2026-09-01T09:00:00Z',
    ...overrides,
  }
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

describe('3e — the children nobody can bill', () => {
  const unpriced = {
    student_id: 'st9',
    display_name: 'עומר שגיא',
    joined_on: '2026-09-01',
    payer_person_id: 'p9',
    payer_display_name: 'הורה שגיא',
  }

  it('lists an active student with no plan, beside the debts', async () => {
    // §5.10's run has appended these to `tally.unpriced` since M6; the tally lands in
    // `billing_run.log` and no router, worker or screen has ever read it. A child whose
    // groups total three sessions a week in a club with no plan labelled 3 trained all
    // year for nothing, recorded only in a JSON blob nobody opens.
    renderCollections({
      client: stub({ unpricedStudents: vi.fn().mockResolvedValue([unpriced]) }),
    })
    const row = await screen.findByTestId('unpriced-row')
    expect(row).toHaveTextContent('עומר שגיא')
    expect(screen.getByTestId('unpriced-payer')).toHaveTextContent('הורה שגיא')
    // The plan is set on the student card, which is the one screen that closes the gap.
    expect(screen.getByTestId('unpriced-open')).toHaveAttribute('href', '#/students/st9')
  })

  it('shows no money on the row, because there is none to show', async () => {
    // The whole point of the row is that no plan says what this family owes. A number here
    // would be an invention, and invariant 1 would be the least of its problems.
    renderCollections({
      client: stub({ unpricedStudents: vi.fn().mockResolvedValue([unpriced]) }),
    })
    const row = await screen.findByTestId('unpriced-row')
    expect(row.textContent ?? '').not.toContain('₪')
  })

  it('renders nothing at all when every active student is priced', async () => {
    // The goal state. A permanent empty panel on the club's busiest screen is a panel
    // people learn to skip past, and then do not see when it fills.
    renderCollections()
    await screen.findByTestId('collections')
    expect(screen.queryByTestId('unpriced-students')).toBeNull()
  })

  it('leaves the debt table standing when the unpriced read fails', async () => {
    // A secondary list on a screen whose primary job is the debt table. A broken box above
    // it would read as the debt being broken.
    renderCollections({
      client: stub({ unpricedStudents: vi.fn().mockRejectedValue(new Error('offline')) }),
    })
    expect(await screen.findByTestId('collections')).toBeInTheDocument()
    expect(screen.getAllByTestId('household-row').length).toBeGreaterThan(0)
  })
})

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

  it('records a CHEQUE, which is the route the dialogue could not express', async () => {
    // `payment.method` has allowed 'cheque' since W4 and `ManualPaymentIn` accepts it;
    // the promises panel already asks a family whether they will bring cash or cheques.
    // The dialogue that actually records the money hard-coded `method: 'cash'`, so every
    // cheque a club took was filed as cash and §10's question — "how much is sitting in
    // undeposited cheques" — could never be answered from the data (reported 2026-08-29).
    const recordPayment = vi.fn().mockResolvedValue({ allocated: 1, unallocatedAgorot: 0 })
    renderCollections({ client: stub({ recordPayment }) })
    await userEvent.click(screen.getAllByTestId('record-cash')[0]!)
    await userEvent.click(screen.getByTestId('payment-method-cheque'))
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.payment.amount')), '320')
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.payment.date')), '2026-11-12')
    await userEvent.click(screen.getByTestId('record-payment-submit'))
    expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'cheque' }))
  })

  it('offers the routes a club actually takes money by, and defaults to cash', async () => {
    renderCollections()
    await userEvent.click(screen.getAllByTestId('record-cash')[0]!)
    for (const method of ['cash', 'cheque', 'bank_transfer']) {
      expect(screen.getByTestId(`payment-method-${method}`)).toBeInTheDocument()
    }
    // A card is never recorded by hand — uPay's IPN writes those, and a manual one would
    // be a second source of truth for money that already has one.
    expect(screen.queryByTestId('payment-method-upay_card')).toBeNull()
    expect(screen.getByTestId('payment-method-cash')).toBeChecked()
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
    // §3.3 -- the percentage is its own isolated left-to-right run (`PercentDisplay`), so
    // it is no longer one bare string with the amount above it: asserted by combined
    // content, the way a split run is asserted everywhere else in this codebase.
    expect(screen.getByTestId('kpi-collected-share')).toHaveTextContent('79% מהצפוי')
  })

  it('isolates the collected-share percentage from the amount beside it', () => {
    // §3.3 of the completion findings register: `MoneyDisplay`'s own amount sat directly
    // beside an un-isolated percent note with no separator, and the bidi algorithm
    // reordered the two digit runs into `0%₪0` instead of `₪0` then `0% מהצפוי`.
    renderCollections()
    const card = screen.getByTestId('kpi-collected-share')
    expect(card.querySelector('bdi')).not.toBeNull()
    expect(card.querySelector('bdi')).toHaveTextContent('79%')
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
    standing_order_link_url: null,
  }

  it('badges an active plan whose standing-order link is missing', () => {
    // §3.2's visible half. A successor plan is born with a NULL link -- deliberately, so a
    // 320 ₪ plan can never carry the 300 ₪ mandate -- and the badge is what turns that
    // silence into a prompt. Without it the rollover's gift to the club is a year of
    // parents who cannot find the link they were told to use.
    render(<PricePlansScreen locale={LOCALE} client={stub()} plans={[PLAN]} onChanged={vi.fn()} />)
    expect(screen.getByTestId('plan-link-missing')).toHaveTextContent(
      t(LOCALE, 'billing.plan.linkMissing'),
    )
  })

  it('shows the full URL rather than a "link set" tick', () => {
    // §4 -- a typo in a payment URL has to be visible WITHOUT clicking it. A checkmark
    // says a link exists; it cannot say the link is the right one.
    const url = 'https://app.upay.co.il/recurring/300'
    render(
      <PricePlansScreen
        locale={LOCALE}
        client={stub()}
        plans={[{ ...PLAN, standing_order_link_url: url }]}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.getByTestId('plan-link')).toHaveTextContent(url)
    expect(screen.queryByTestId('plan-link-missing')).not.toBeInTheDocument()
  })

  it('does not badge a CLOSED plan with no link', () => {
    // A closed plan's link is dead by definition: its amount is not what anyone is billed
    // any more. Badging it would put a permanent, unfixable warning on every plan the club
    // has ever retired.
    render(
      <PricePlansScreen
        locale={LOCALE}
        client={stub()}
        plans={[{ ...PLAN, active_to: '2026-12-31' }]}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('plan-link-missing')).not.toBeInTheDocument()
  })

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
    // The frequency is the first question on this screen too since 2026-08-29 — it used to
    // be a bare `חל על` number box here while the wizard had already been rebuilt, so one
    // club saw two designs for one decision.
    await userEvent.click(screen.getByTestId('wizard-plan-freq-5'))
    await userEvent.type(screen.getByLabelText(t(LOCALE, 'billing.plan.monthlyAmount')), '500')
    await userEvent.click(screen.getByTestId('plan-save'))
    expect(createPricePlan).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyAmountAgorot: 50_000, sessionsPerWeek: 5 }),
    )
  })

  it('asks how often here in the same shape the wizard asks it', async () => {
    // Same control, same testids, one implementation — `PlanFrequency.tsx`. The two
    // screens drifting apart is the thing that was reported.
    render(
      <PricePlansScreen
        locale={LOCALE}
        client={stub()}
        plans={[]}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.getByTestId('wizard-plan-frequency')).toBeInTheDocument()
    expect(screen.getByTestId('wizard-plan-freq-open')).toHaveTextContent(
      t(LOCALE, 'billing.plan.unlimited'),
    )
    // And the old bare number box is gone.
    expect(screen.queryByLabelText(t(LOCALE, 'billing.plan.appliesTo'))).toBeNull()
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

describe('the payment-promise queue', () => {
  // The manager's half of both hand-carried routes. Confirm and decline are unchanged from
  // the cash queue this replaces — what is new is that the queue can no longer answer "how
  // much of this is cheques" by looking at the screen's title.
  function renderPanel(props: Record<string, unknown> = {}) {
    return render(<PaymentPromisesPanel locale={LOCALE} client={stub()} {...props} />)
  }

  it('names the method on every row', async () => {
    // §10 — the club's question is 'how much of this year is sitting in undeposited
    // cheques'. A queue that renders both methods identically cannot be asked it, and the
    // manager confirms twelve cheques thinking they are one month of cash.
    renderPanel({
      client: stub({
        paymentPromises: vi
          .fn()
          .mockResolvedValue([managerPromise('r1', 'cash'), managerPromise('r2', 'cheque')]),
      }),
    })
    const rows = await screen.findAllByTestId('payment-promise-row')
    expect(within(rows[0]!).getByTestId('promise-method')).toHaveTextContent('מזומן')
    expect(within(rows[1]!).getByTestId('promise-method')).toHaveTextContent('צ׳קים')
  })

  it('names a single charge in the singular, not "1 חיובים"', async () => {
    // §3.4 of the completion findings register.
    renderPanel({
      client: stub({
        paymentPromises: vi
          .fn()
          .mockResolvedValue([managerPromise('r1', 'cash', { charge_count: 1 })]),
      }),
    })
    const row = await screen.findByTestId('promise-charges')
    expect(row).toHaveTextContent(t(LOCALE, 'billing.promise.manager.chargesOne'))
    expect(row).not.toHaveTextContent('1 חיובים')
  })

  it('says whether the money is already in the drawer or still coming', async () => {
    // The signup plan step offers both tenses under every hand-carried route (owner
    // correction, 2026-08-30), and they need different actions here: money the family says
    // they have already handed over can be checked right now, money that is coming cannot.
    // Until the flag existed the queue showed one indistinguishable pending row for both,
    // which made the parent's two buttons mean nothing.
    renderPanel({
      client: stub({
        paymentPromises: vi.fn().mockResolvedValue([
          managerPromise('r1', 'cash', { already_paid: true }),
          managerPromise('r2', 'cheque', { already_paid: false }),
        ]),
      }),
    })
    const rows = await screen.findAllByTestId('payment-promise-row')
    expect(rows[0]!).toHaveTextContent(t(LOCALE, 'billing.promise.manager.saysPaid'))
    expect(rows[1]!).toHaveTextContent(t(LOCALE, 'billing.promise.manager.saysWillPay'))
    // Neither is a settlement: both still wait for the manager's ✓.
    expect(within(rows[0]!).getByTestId('promise-confirm')).toBeInTheDocument()
  })

  it('asks the server for one method when the filter is set, never filters in the browser', async () => {
    // The list is paged by the server and the filter has to mean the same thing as
    // `?method=` does — a client-side filter over one page would silently mean 'of the
    // rows that happened to load', which is a different and wrong answer.
    const paymentPromises = vi.fn().mockResolvedValue([managerPromise('r1', 'cheque')])
    renderPanel({ client: stub({ paymentPromises }) })
    await screen.findAllByTestId('payment-promise-row')
    // Queried by role: the filter is a `SegmentedControl`, so it is a radiogroup, and a
    // testid here would let it stop being one without a test noticing.
    await userEvent.click(screen.getByRole('radio', { name: t(LOCALE, 'billing.method.cheque') }))
    expect(paymentPromises).toHaveBeenLastCalledWith('pending', 'cheque')
  })

  it('confirms and declines through the promise routes', async () => {
    const confirmPromise = vi.fn().mockResolvedValue(undefined)
    const declinePromise = vi.fn().mockResolvedValue(undefined)
    renderPanel({
      client: stub({
        paymentPromises: vi.fn().mockResolvedValue([managerPromise('r1', 'cheque')]),
        confirmPromise,
        declinePromise,
      }),
    })
    await userEvent.click(await screen.findByTestId('promise-confirm'))
    expect(confirmPromise).toHaveBeenCalledWith('r1')
    await userEvent.click(await screen.findByTestId('promise-decline'))
    expect(declinePromise).toHaveBeenCalledWith('r1')
  })
})

describe('Settings → Payments — the standing-order links', () => {
  // §5's canonical editor. Two surfaces, one field: the wizard's prices step sets it as a
  // plan is created, and this is where it is fixed afterwards -- which is the whole reason
  // the column is the one exception to `price_plan` never being edited in place.
  const ACTIVE = {
    id: 'plan-1',
    name: 'פעמיים בשבוע',
    sessions_per_week: 2,
    monthly_amount_agorot: 30_000,
    registration_fee_agorot: 0,
    active_from: '2026-09-01',
    active_to: null,
    standing_order_link_url: null,
  }
  const CLOSED = { ...ACTIVE, id: 'plan-0', active_to: '2026-08-31' }

  it('lists active plans only — a closed plan\'s link is dead by definition', async () => {
    render(
      <StandingOrderLinksPanel
        locale={LOCALE}
        client={stub({ pricePlans: vi.fn().mockResolvedValue([ACTIVE, CLOSED]) })}
      />,
    )
    expect(await screen.findAllByTestId('link-editor-row')).toHaveLength(1)
  })

  it('saves a pasted link against the plan it sits beside', async () => {
    const setStandingOrderLink = vi.fn().mockResolvedValue({})
    render(
      <StandingOrderLinksPanel
        locale={LOCALE}
        client={stub({
          pricePlans: vi.fn().mockResolvedValue([ACTIVE]),
          setStandingOrderLink,
        })}
      />,
    )
    const field = await screen.findByTestId('link-editor-input')
    await userEvent.type(field, 'https://app.upay.co.il/recurring/300')
    await userEvent.tab()
    expect(setStandingOrderLink).toHaveBeenCalledWith(
      'plan-1',
      'https://app.upay.co.il/recurring/300',
    )
  })

  it('says so when the server refuses the host, rather than looking saved', async () => {
    // The server is the only thing that knows the allowlist, and a field that silently
    // keeps the text a manager typed is a field they will walk away from believing worked.
    render(
      <StandingOrderLinksPanel
        locale={LOCALE}
        client={stub({
          pricePlans: vi.fn().mockResolvedValue([ACTIVE]),
          setStandingOrderLink: vi.fn().mockRejectedValue(new Error('422')),
        })}
      />,
    )
    const field = await screen.findByTestId('link-editor-input')
    await userEvent.type(field, 'https://evil.example/recurring/300')
    await userEvent.tab()
    expect(await screen.findByTestId('link-editor-error')).toHaveTextContent(
      t(LOCALE, 'billing.plan.linkRefused'),
    )
  })
})

describe('the wizard\'s prices step', () => {
  // §5's other surface: the link sits beside the amount as a plan is CREATED, so a club
  // that already has its uPay links never has to come back for them. `WIZARD_STEPS` in
  // `app/services/structure/setup.py` is a contract this feature does not touch -- `prices`
  // is already step 4 there, and it was the only one of the six with nothing registered
  // into its slot.
  function renderStep(props: Record<string, unknown> = {}) {
    return render(
      <PricesWizardStep
        locale={LOCALE}
        status="pending"
        onDone={vi.fn()}
        onSkip={vi.fn()}
        client={stub()}
        {...props}
      />,
    )
  }

  it('registers at the order WIZARD_STEP_ORDER gives prices', () => {
    // studio · groups · belts · prices · staff · students. A step registered at the wrong
    // order lands the owner on the wrong panel after they finish the previous one.
    expect(PRICES_WIZARD_ORDER).toBe(4)
  })

  /** Open the folded-away name and link fields. Most clubs never touch either. */
  async function openExtras() {
    await userEvent.click(screen.getByText(t('he', 'billing.plan.moreOptions')))
  }

  it('creates a plan with the link the manager pasted beside the amount', async () => {
    const createPricePlan = vi.fn().mockResolvedValue({ id: 'plan-9' })
    const setStandingOrderLink = vi.fn().mockResolvedValue({})
    renderStep({ client: stub({ createPricePlan, setStandingOrderLink }) })
    await userEvent.click(screen.getByTestId('wizard-plan-freq-2'))
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '300')
    await openExtras()
    await userEvent.type(screen.getByTestId('wizard-plan-name'), 'פעמיים בשבוע')
    await userEvent.type(
      screen.getByTestId('wizard-plan-link'),
      'https://app.upay.co.il/recurring/300',
    )
    await userEvent.click(screen.getByTestId('wizard-plan-save'))
    await waitFor(() => expect(createPricePlan).toHaveBeenCalled())
    expect(createPricePlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'פעמיים בשבוע', monthlyAmountAgorot: 30_000 }),
    )
    expect(setStandingOrderLink).toHaveBeenCalledWith(
      'plan-9',
      'https://app.upay.co.il/recurring/300',
    )
  })

  it('creates the plan when the link is left blank, and asks for nothing more', async () => {
    // §5 and open item 4 -- OPTIONAL. A club may not have its uPay links on the day it
    // sets the app up, and stopping setup for one would be a wall in front of a club that
    // cannot pass it yet. The plan is created and the link is simply never sent.
    const createPricePlan = vi.fn().mockResolvedValue({ id: 'plan-9' })
    const setStandingOrderLink = vi.fn().mockResolvedValue({})
    renderStep({ client: stub({ createPricePlan, setStandingOrderLink }) })
    await userEvent.click(screen.getByTestId('wizard-plan-freq-2'))
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '300')
    await userEvent.click(screen.getByTestId('wizard-plan-save'))
    await waitFor(() => expect(createPricePlan).toHaveBeenCalled())
    expect(setStandingOrderLink).not.toHaveBeenCalled()
  })

  // ── the 2026-08-29 rebuild ────────────────────────────────────────────────────────
  it('asks how often as a choice, not as a bare number box', async () => {
    // `חל על` ("applies to") was a `TextField` bound to sessionsPerWeek: no unit, no
    // example, nothing saying what a good answer was. The manager who reported the step
    // as not understandable described this ladder unprompted.
    renderStep()
    const options = within(screen.getByTestId('wizard-plan-frequency')).getAllByRole('button')
    expect(options).toHaveLength(6)
    expect(screen.getByTestId('wizard-plan-freq-3')).toHaveTextContent(
      t('he', 'billing.plan.perWeek').replace('{{count}}', '3'),
    )
    expect(screen.getByTestId('wizard-plan-freq-open')).toHaveTextContent(
      t('he', 'billing.plan.unlimited'),
    )
  })

  it('sends null for an open membership rather than a made-up count', async () => {
    // `price_plan.sessions_per_week` is nullable and NULL means open membership — the
    // plan a club sells most. The API declared a non-null int on both sides until this
    // was reported ("550 fully"), so the plan could not be expressed at all.
    const createPricePlan = vi.fn().mockResolvedValue({ id: 'plan-9' })
    renderStep({ client: stub({ createPricePlan }) })
    await userEvent.click(screen.getByTestId('wizard-plan-freq-open'))
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '550')
    await userEvent.click(screen.getByTestId('wizard-plan-save'))
    await waitFor(() => expect(createPricePlan).toHaveBeenCalled())
    expect(createPricePlan).toHaveBeenCalledWith(
      expect.objectContaining({ sessionsPerWeek: null, monthlyAmountAgorot: 55_000 }),
    )
  })

  it('names the plan from the frequency when the manager gives no name', async () => {
    // The name was required, so a club with no house name for "3 times a week" had to
    // invent one before it could price anything.
    const createPricePlan = vi.fn().mockResolvedValue({ id: 'plan-9' })
    renderStep({ client: stub({ createPricePlan }) })
    await userEvent.click(screen.getByTestId('wizard-plan-freq-3'))
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '400')
    await userEvent.click(screen.getByTestId('wizard-plan-save'))
    await waitFor(() =>
      expect(createPricePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: t('he', 'billing.plan.perWeek').replace('{{count}}', '3'),
          sessionsPerWeek: 3,
        }),
      ),
    )
  })

  it('shows the plan as one sentence before it is created', async () => {
    // "400 – 3 times a week" is how the club says it, and this is the only place the two
    // answers meet before the plan exists.
    renderStep()
    expect(screen.queryByTestId('wizard-plan-preview')).toBeNull()
    await userEvent.click(screen.getByTestId('wizard-plan-freq-3'))
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '400')
    const preview = await screen.findByTestId('wizard-plan-preview')
    expect(preview).toHaveTextContent('400')
    expect(preview).toHaveTextContent(
      t('he', 'billing.plan.perWeek').replace('{{count}}', '3'),
    )
  })

  it('will not create a plan before the frequency is answered', async () => {
    const createPricePlan = vi.fn().mockResolvedValue({ id: 'plan-9' })
    renderStep({ client: stub({ createPricePlan }) })
    await userEvent.type(screen.getByTestId('wizard-plan-amount'), '400')
    await userEvent.click(screen.getByTestId('wizard-plan-save'))
    expect(createPricePlan).not.toHaveBeenCalled()
  })

  it('reports itself finished rather than letting the container guess', async () => {
    // The container never computes completeness -- `packages/ui/src/setup-wizard/types.ts`
    // says so, and it is what keeps this seam one-directional.
    const onDone = vi.fn()
    renderStep({ client: stub({ pricePlans: vi.fn().mockResolvedValue([]) }), onDone })
    await userEvent.click(screen.getByTestId('wizard-prices-done'))
    expect(onDone).toHaveBeenCalled()
  })
})

describe('prepayment, on the manager\'s side', () => {
  it('derives credit per payer the way the server does — payments minus allocations', () => {
    // The same formula as `BillingService.payer_credit`, over the payments list the
    // collections screen already needs. A reversed payment is money recorded as never
    // having arrived, so it is credit on neither side of the subtraction.
    const payments = [
      {
        id: 'p1',
        payer_person_id: 'payer-1',
        amount_agorot: 90_000,
        reversed_at: null,
        allocations: [{ amount_agorot: 30_000 }],
      },
      {
        id: 'p2',
        payer_person_id: 'payer-1',
        amount_agorot: 30_000,
        reversed_at: '2026-09-05T00:00:00Z',
        allocations: [],
      },
      {
        id: 'p3',
        payer_person_id: 'payer-2',
        amount_agorot: 25_000,
        reversed_at: null,
        allocations: [{ amount_agorot: 25_000 }],
      },
    ]
    const credit = creditByPayer(payments)
    expect(credit.get('payer-1')).toBe(60_000)
    // Fully allocated: money that settled charges is not credit.
    expect(credit.get('payer-2') ?? 0).toBe(0)
  })

  it('shows a household\'s credit beside its balance, never merged into it', () => {
    // §7 — a manager about to phone a family should see "owes 640 ₪, paid ahead 600 ₪"
    // before dialling. One number that meant neither is what merging them produces.
    renderCollections({
      households: [household({ creditAgorot: 60_000 })],
    })
    const row = screen.getAllByTestId('household-row')[0]!
    expect(within(row).getByTestId('household-credit')).toHaveTextContent('600')
  })

  it('says nothing about credit for a household that has none', () => {
    renderCollections({ households: [household()] })
    expect(screen.queryByTestId('household-credit')).not.toBeInTheDocument()
  })

  it('lets the manager set the club\'s own prepayment terms', async () => {
    // §5 — cash three months forward, twelve cheques. Configuration rather than constants,
    // on the one screen that answers "how may a family pay this club".
    const saveBillingSettings = vi.fn().mockResolvedValue({})
    render(<PrepayTermsPanel locale={LOCALE} client={stub({ saveBillingSettings })} />)
    const cash = await screen.findByTestId('prepay-term-cash')
    await userEvent.clear(cash)
    await userEvent.type(cash, '6')
    await userEvent.tab()
    expect(saveBillingSettings).toHaveBeenCalledWith({ cash_prepay_months: 6 })
  })

  it('shows how many months forward a promise buys, beside its amount', async () => {
    // 3,600 ₪ with no explanation is the number a manager phones the office about. Twelve
    // months forward is why it is large, and it is what they are holding cheques for.
    render(
      <PaymentPromisesPanel
        locale={LOCALE}
        client={stub({
          paymentPromises: vi
            .fn()
            .mockResolvedValue([managerPromise('r1', 'cheque', { prepay_months: 12 })]),
        })}
      />,
    )
    expect(await screen.findByTestId('promise-forward-months')).toHaveTextContent('12')
  })
})

describe('the plan-change settlement queue', () => {
  // §11 — the parent's tap changes access; a person always closes the loop on money. Two
  // of the club's three payment routes are prepaid, so a plan change cannot settle itself.
  const CHANGE = {
    id: 'c1',
    student_id: 's1',
    student_name: 'דנה כהן',
    from_price_plan_id: 'p300',
    to_price_plan_id: 'p400',
    from_plan_name: '300',
    to_plan_name: '400',
    monthly_difference_agorot: 10_000,
    effective_on: '2026-12-01',
    status: 'applied',
    settlement_status: 'pending',
    requested_at: '2026-11-10T09:00:00Z',
    applied_at: '2026-11-10T09:00:00Z',
  }

  it('shows the monthly difference a manager has to collect', async () => {
    // "collect 100 ₪ × the remaining months" is the instruction. A queue that showed only
    // the two plan names would make the manager look up two prices to compute it.
    render(
      <PlanChangesPanel
        locale={LOCALE}
        client={stub({ planChanges: vi.fn().mockResolvedValue([CHANGE]) })}
      />,
    )
    const row = await screen.findByTestId('plan-change-row')
    expect(within(row).getByTestId('plan-change-difference')).toHaveTextContent('100')
    expect(row).toHaveTextContent('דנה כהן')
  })

  it('settles a change and drops it from the queue', async () => {
    const settlePlanChange = vi.fn().mockResolvedValue(undefined)
    const planChanges = vi.fn().mockResolvedValueOnce([CHANGE]).mockResolvedValue([])
    render(<PlanChangesPanel locale={LOCALE} client={stub({ planChanges, settlePlanChange })} />)
    await userEvent.click(await screen.findByTestId('plan-change-settle'))
    expect(settlePlanChange).toHaveBeenCalledWith('c1')
  })

  it('renders nothing at all when the queue is empty', async () => {
    // A heading over nothing is a row of noise on a dashboard that already has a
    // collections list — the same rule the payment-promise queue follows.
    const { container } = render(<PlanChangesPanel locale={LOCALE} client={stub()} />)
    await screen.findByTestId('plan-changes-loaded')
    expect(container.querySelector('[data-testid="plan-change-row"]')).toBeNull()
  })
})

describe('the household detail drill (2026-08-30)', () => {
  it('opens the open charges under the row — labels, the parent’s note riding them', async () => {
    // The 3e no-expansion note recorded a gap, not a rule; the owner asked for it: a
    // parent's shop-order note travels on the charge label, and the manager needs a place
    // that shows it.
    const openCharges = vi.fn().mockResolvedValue([
      {
        id: 'c1',
        kind: 'manual',
        amount_agorot: 36_000,
        proration_note: 'גי × 2 — רקמה: יוסי',
        due_date: '2026-09-01',
        status: 'open',
      },
    ])
    renderCollections({ client: stub({ openCharges } as Partial<DashboardBillingClient>) })
    await userEvent.click(screen.getAllByTestId('household-details')[0]!)
    expect(await screen.findByText(/רקמה: יוסי/)).toBeInTheDocument()
    expect(openCharges).toHaveBeenCalledWith('payer-1')
  })

  it('says so when a payer has no open charges', async () => {
    const openCharges = vi.fn().mockResolvedValue([])
    renderCollections({ client: stub({ openCharges } as Partial<DashboardBillingClient>) })
    await userEvent.click(screen.getAllByTestId('household-details')[0]!)
    expect(
      await screen.findByText(t(LOCALE, 'billing.debt.detailsEmpty')),
    ).toBeInTheDocument()
  })
})
