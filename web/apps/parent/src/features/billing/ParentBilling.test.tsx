// Parent artboards `1b`, `12f` and `12e`.
//
// The tests that carry weight here are rules rather than renders: all three payment routes
// stay visible with an active standing order (§5.10 makes that a WARNING, not a block), a
// charge already covered by an open order is not selectable but still shown, the receipt
// email is a card-row affordance and nowhere else (D9.3's structural half), and no screen
// ever builds a `₪` string by hand (G2).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PaymentsScreen } from './PaymentsScreen'
import type { DebtRow } from './PaymentsScreen'
import { PaymentHistoryScreen } from './PaymentHistoryScreen'
import { PaymentCompleteScreen } from './PaymentCompleteScreen'
import { OrderItemsScreen } from './OrderItemsScreen'
import { PaymentStrip } from './PaymentStrip'
import { instalmentSplit, oldestMonths, selectionTotal } from './billingClient'
import type { BillingClient, ChargeOut, PaymentOut, PaymentPromiseOut } from './billingClient'

const LOCALE = 'he' as const

function charge(
  id: string,
  month: number,
  amount = 25_000,
  isCoveredElsewhere = false,
): ChargeOut {
  return {
    id,
    payer_person_id: 'payer-1',
    student_id: 'student-1',
    kind: 'tuition',
    period_year: 2026,
    period_month: month,
    amount_agorot: amount,
    original_amount_agorot: null,
    proration_note: null,
    due_date: `2026-${String(month).padStart(2, '0')}-28`,
    status: 'open',
    created_by: 'billing_run',
    allocated_agorot: 0,
    // §5.10's covered-elsewhere flag, served by `/me/charges` since W6. The row-level
    // `DebtRow.coveredElsewhere` below is what the screen reads; this is the wire field the
    // section maps from, and the two are kept separate so a screen test can still build a
    // greyed-out row without a server shape.
    is_covered_elsewhere: isCoveredElsewhere,
  }
}

function debt(id: string, month: number, overrides: Partial<DebtRow> = {}): DebtRow {
  return {
    charge: charge(id, month),
    studentName: 'דנה',
    beltColorHex: '#ffffff',
    coveredElsewhere: false,
    ...overrides,
  }
}

function stubClient(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    openCharges: vi.fn().mockResolvedValue([]),
    promises: vi.fn().mockResolvedValue([]),
    createPromise: vi.fn(),
    balance: vi.fn(),
    payments: vi.fn().mockResolvedValue([]),
    products: vi.fn().mockResolvedValue([]),
    createOrder: vi.fn().mockResolvedValue({ public_ref: 'ref-1' }),
    orderForm: vi.fn().mockResolvedValue({ action: 'https://upay', fields: {} }),
    orderStatus: vi.fn(),
    ...overrides,
  } as BillingClient
}

function renderPay(props: Partial<Parameters<typeof PaymentsScreen>[0]> = {}) {
  return render(
    <PaymentsScreen
      locale={LOCALE}
      client={stubClient()}
      debts={[debt('c1', 9), debt('c2', 10)]}
      hasActiveSubscription={false}
      standingOrderLinks={[
        {
          studentName: 'דנה',
          planName: 'פעמיים בשבוע',
          amountAgorot: 30_000,
          url: 'https://app.upay.co.il/recurring/300',
        },
      ]}
      cashInstructions={null}
      onOrderOpened={vi.fn()}
      onOpenHistory={vi.fn()}
      {...props}
    />,
  )
}

describe('1b — the pay screen', () => {
  it('shows all three routes even when a standing order is already active', () => {
    // §5.10's second double-payment guard is a warning, not a block: 'the parent decides'.
    // A screen that hid the card option here would leave a family who set up a mandate and
    // then wanted to clear a one-off with no route at all.
    renderPay({ hasActiveSubscription: true })
    expect(screen.getByTestId('route-card')).toBeInTheDocument()
    expect(screen.getByTestId('route-standing-order')).toBeInTheDocument()
    expect(screen.getByTestId('route-cash')).toBeInTheDocument()
    // Queried by text, not by role: `Alert` sets `role="alert"` only when `live` is true,
    // and its own docstring says why -- role="alert" on content that was already there when
    // the screen loaded makes a screen reader announce it on load, every load.
    expect(screen.getByText('רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים')).toBeInTheDocument()
    expect(screen.getByTestId('pay-button')).toBeEnabled()
  })

  it('says the selection is oldest-first across every child', () => {
    // `billing.card.oldestFirst` exists and 1b's finding 5 records that the artboard never
    // says it. The rule IS the product behaviour.
    renderPay()
    expect(screen.getByTestId('route-card')).toHaveTextContent('נבחרים החיובים הוותיקים ביותר')
  })

  it('shows a charge covered by an open order but does not let it be selected', () => {
    // §5.10's PRIMARY guard. Shown rather than hidden: a month a parent can see they owe,
    // silently missing from the picker, is a support call.
    renderPay({ debts: [debt('c1', 9), debt('c2', 10, { coveredElsewhere: true })] })
    expect(screen.getAllByTestId('debt-row')).toHaveLength(2)
    expect(screen.getByTestId('covered-elsewhere')).toHaveTextContent(
      'החיוב כלול בתשלום שכבר נפתח',
    )
    expect(screen.getByTestId('months-control')).toHaveAttribute('data-max', '1')
  })

  it('says so when every charge is covered elsewhere', () => {
    renderPay({ debts: [debt('c1', 9, { coveredElsewhere: true })] })
    expect(screen.getByTestId('nothing-selectable')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument()
  })

  it('renders the empty state when nothing is owed', () => {
    // 1b's finding 3: not drawn, and it is the GOAL state.
    renderPay({ debts: [] })
    expect(screen.getByText('אין חובות פתוחים')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument()
  })

  it('disables the pay button while the order is being created', async () => {
    // 1b's finding 2: no in-flight state is drawn, and this button opens a payment page. A
    // double submit creates two orders over overlapping charges.
    let release: (value: unknown) => void = () => {}
    const createOrder = vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve)))
    renderPay({ client: stubClient({ createOrder }) })
    await userEvent.click(screen.getByTestId('pay-button'))
    expect(screen.getByTestId('pay-button')).toBeDisabled()
    release({ public_ref: 'ref-1' })
  })

  it('renders every amount through MoneyDisplay and never a hand-built string', () => {
    // G2, and 1b's RTL note: the hazard is the FIX, not the bug. Digits are strong-LTR and
    // resolve on their own; a `direction: ltr` wrapper or a transform would flip `1,280₪`
    // to `₪1,280`.
    //
    // Asserted per ELEMENT rather than over `container.textContent`: concatenated text runs
    // two amounts together (`250₪10/2026`), so a naive `/₪\d/` over the whole tree matches
    // a boundary between two perfectly correct amounts.
    const { container } = renderPay()
    const amounts = [...container.querySelectorAll('.studio-money')]
    // Two debt rows, the open-debts total, the card route's selection total, and the one
    // standing-order link's monthly amount.
    expect(amounts.length).toBe(5)
    for (const amount of amounts) {
      expect(amount.textContent).not.toMatch(/₪\d/)
      expect(amount.querySelector('bdi')).not.toBeNull()
    }
    // And no shekel sign anywhere outside a MoneyDisplay.
    for (const el of container.querySelectorAll('*')) {
      if (el.closest('.studio-money')) continue
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
      expect(own).not.toContain('₪')
    }
  })

  it('routes every belt accent bar through BeltBar so it carries D7 ring', () => {
    // 1b finding 4. D7 covers anywhere `belt_rank.color_hex` is rendered as a fill, and a
    // white belt with no ring is invisible on a light ground at 1.08:1.
    const { container } = renderPay()
    expect(container.querySelectorAll('.studio-belt-bar').length).toBe(2)
  })
})

function promise(
  id: string,
  method: 'cash' | 'cheque',
  overrides: Partial<PaymentPromiseOut> = {},
): PaymentPromiseOut {
  return {
    id,
    status: 'pending',
    method,
    total_agorot: 50_000,
    charge_ids: ['c1'],
    created_at: '2026-09-01T09:00:00Z',
    decided_at: null,
    ...overrides,
  }
}

describe('1b — the standing-order links', () => {
  // Part A of the payment-routes spec. The card and the string existed since W4 and the
  // section hardcoded the prop to null, so no parent has ever seen a link — this is the
  // missing SOURCE, and its shape is a LIST because a uPay link carries a fixed amount.
  const TWO = [
    {
      studentName: 'דנה',
      planName: 'פעמיים בשבוע',
      amountAgorot: 30_000,
      url: 'https://app.upay.co.il/recurring/300',
    },
    {
      studentName: 'יוסי',
      planName: 'כל יום',
      amountAgorot: 55_000,
      url: 'https://app.upay.co.il/recurring/550',
    },
  ]

  it('gives a payer one labelled link per child, never one bare link', () => {
    // §6 — a parent with a child on 300 and a child on 550 needs BOTH, labelled. One link
    // has them sign one mandate and underpay for the other child every month, and nothing
    // reports it until the reconciliation queue disagrees months later.
    renderPay({ standingOrderLinks: TWO })
    const links = screen.getAllByTestId('standing-order-link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://app.upay.co.il/recurring/300')
    expect(links[1]).toHaveAttribute('href', 'https://app.upay.co.il/recurring/550')
  })

  it('names the child in each link, because the link text alone repeats', () => {
    // SC 2.4.4: two anchors reading 'קישור להקמת הוראת קבע' are two links a screen-reader
    // user cannot tell apart — and telling them apart is the entire point of the list.
    renderPay({ standingOrderLinks: TWO })
    const links = screen.getAllByTestId('standing-order-link')
    expect(links[0]).toHaveAccessibleName(expect.stringContaining('דנה'))
    expect(links[1]).toHaveAccessibleName(expect.stringContaining('יוסי'))
  })

  it('shows the amount each mandate will charge', () => {
    // A uPay shared link charges a FIXED amount and never says which. A parent signing
    // one is committing to a monthly figure the page they land on may not show them.
    renderPay({ standingOrderLinks: TWO })
    const card = screen.getByTestId('route-standing-order')
    expect(within(card).getAllByText('דנה')).toHaveLength(1)
    expect(card.querySelectorAll('.studio-money')).toHaveLength(2)
  })

  it('is never served from the service worker cache', async () => {
    // §7 — the link is read live on every visit. This app is an installed PWA and the rest
    // of the screen is cache-friendly, but a stale payment link is not a stale roster: it
    // sends a family to sign a mandate at the wrong amount, and neither they nor the
    // manager finds out until the reconciliation queue disagrees months later.
    //
    // Read from the SOURCE, the way `packages/core/src/offline/cache.test.ts` reads its
    // own: the rule is 'no runtimeCaching rule exists for the API', and that is a fact
    // about the config file rather than about anything a render can observe.
    const config = (await import('../../../vite.config.ts?raw')).default as string
    expect(config).not.toContain('runtimeCaching')
    // And the precache glob is built assets only -- no JSON, so no API response.
    expect(config).toMatch(/globPatterns:\s*\['\*\*\/\*\.\{js,css,html,woff2,png,svg,webmanifest\}'\]/)
  })

  it('renders the card with no anchor when no plan has a link', () => {
    // §3.2's degradation, and the reason NULL is safe: the card keeps its instructions and
    // loses its anchor. Exactly what the screen has always done, so the empty case is not
    // a special case.
    renderPay({ standingOrderLinks: [] })
    expect(screen.getByTestId('route-standing-order')).toBeInTheDocument()
    expect(screen.queryByTestId('standing-order-link')).not.toBeInTheDocument()
    expect(screen.getByTestId('route-standing-order')).toHaveTextContent(
      t(LOCALE, 'billing.standingOrder.instructions'),
    )
  })
})

describe('1b — the two hand-carried routes', () => {
  // The payment-routes spec §8: cheques are cash with a different word on the payment.
  // Both end at a manager confirming by hand, so the screen offers them as two cards over
  // one mechanism rather than two mechanisms — which is what makes every rule below hold
  // for either method without being written twice.
  it('offers cheques beside cash, so all four routes are visible', () => {
    // §5.10 — nothing is ever hidden from the payments screen. The manager's own letter
    // lists three ways to pay and the app served two of them.
    renderPay()
    expect(screen.getByTestId('route-card')).toBeInTheDocument()
    expect(screen.getByTestId('route-standing-order')).toBeInTheDocument()
    expect(screen.getByTestId('route-cash')).toBeInTheDocument()
    expect(screen.getByTestId('route-cheque')).toBeInTheDocument()
  })

  it('raises a promise carrying the method the parent tapped', async () => {
    // The method is the ONE thing that separates these two cards, and it is what the
    // manager's queue filters on. A cheque promise raised as `cash` is a cheque the club
    // cannot count later — §10's whole reason for existing.
    const onPaymentPromise = vi.fn().mockResolvedValue(undefined)
    renderPay({ onPaymentPromise })
    await userEvent.click(screen.getByTestId('promise-button-cheque'))
    expect(onPaymentPromise).toHaveBeenCalledWith(['c1', 'c2'], 'cheque')
    await userEvent.click(screen.getByTestId('promise-button-cash'))
    expect(onPaymentPromise).toHaveBeenLastCalledWith(['c1', 'c2'], 'cash')
  })

  it('reports a pending cheque promise on the cheque card', () => {
    renderPay({ promises: [promise('r1', 'cheque')], onPaymentPromise: vi.fn() })
    expect(screen.getByTestId('promise-pending-cheque')).toHaveTextContent('ממתין לאישור המנהל')
    expect(screen.queryByTestId('promise-button-cheque')).not.toBeInTheDocument()
  })

  it('lets no second promise be raised while one of EITHER method is pending', () => {
    // One live promise at a time, across both routes. Two pending promises over the same
    // months would show the manager the same money twice, and the service refuses the
    // second anyway — a card that still offered the button would be offering a 409.
    renderPay({ promises: [promise('r1', 'cash')], onPaymentPromise: vi.fn() })
    expect(screen.getByTestId('promise-pending-cash')).toBeInTheDocument()
    expect(screen.queryByTestId('promise-button-cheque')).not.toBeInTheDocument()
    // And it says why, rather than rendering a card with nothing in it.
    expect(screen.getByTestId('promise-blocked-cheque')).toBeInTheDocument()
  })

  it('badges the charge rows a pending cheque promise covers, in its own words', () => {
    renderPay({ promises: [promise('r1', 'cheque', { charge_ids: ['c1'] })], onPaymentPromise: vi.fn() })
    expect(screen.getByText('צ׳קים בהמתנה')).toBeInTheDocument()
    expect(screen.queryByText('מזומן בהמתנה')).not.toBeInTheDocument()
  })

  it('says a decline out loud, on the card it was declined on', () => {
    // A decline the parent is never told about is silence they have to infer from a
    // charge that stayed open. It belongs to the method that was declined: a declined
    // cheque promise must not make the cash card look broken.
    renderPay({
      promises: [
        promise('r1', 'cheque', { status: 'declined', decided_at: '2026-09-02T09:00:00Z' }),
      ],
      onPaymentPromise: vi.fn(),
    })
    expect(screen.getByTestId('promise-declined-cheque')).toBeInTheDocument()
    expect(screen.queryByTestId('promise-declined-cash')).not.toBeInTheDocument()
    // And the route is open again — a decline is not a ban.
    expect(screen.getByTestId('promise-button-cheque')).toBeInTheDocument()
  })
})

describe('the selection arithmetic', () => {
  it('selects the N oldest by due date even when the list arrives shuffled', () => {
    // Ship-audit B5. "Pay 2 months" is §5.10's money decision — the two OLDEST months —
    // and this used to be a bare slice trusting the server's ordering, which was a
    // random-UUID order in disguise: a parent could settle August while June stayed
    // owed. Sorting here agrees with a correct server and corrects a broken one.
    const charges = [charge('c', 11), charge('a', 9), charge('b', 10)]
    expect(oldestMonths(charges, 2).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('breaks due-date ties by id so a re-render selects the same months', () => {
    const twin = { ...charge('z', 9), id: 'a2' }
    const charges = [twin, charge('a1', 9), charge('b', 10)]
    expect(oldestMonths(charges, 2).map((c) => c.id)).toEqual(['a1', 'a2'])
  })

  it('sums in agorot', () => {
    expect(selectionTotal([charge('a', 9), charge('b', 10)])).toBe(50_000)
  })

  it('splits instalments so the parts sum back exactly', () => {
    // Integer arithmetic (G2). The remainder rides the FIRST instalment, which is what a
    // card processor does and what a parent sees on their statement.
    const split = instalmentSplit(100_01, 3)
    expect(split.first + split.rest * 2).toBe(100_01)
  })

  it('a single instalment is the whole amount', () => {
    expect(instalmentSplit(25_000, 1)).toEqual({ first: 25_000, rest: 25_000, count: 1 })
  })
})

describe('12f — payment history', () => {
  function payment(id: string, method: PaymentOut['method']): PaymentOut {
    return {
      id,
      payer_person_id: 'payer-1',
      method,
      amount_agorot: 25_000,
      received_at: '2026-09-01T09:00:00Z',
      recorded_by_person_id: null,
      payment_order_id: null,
      note: null,
      external_receipt_number: null,
      reversed_at: null,
      reversal_reason: null,
      allocations: [],
    }
  }

  function renderHistory(props: Record<string, unknown> = {}) {
    return render(
      <PaymentHistoryScreen
        locale={LOCALE}
        payments={[payment('p1', 'upay_card'), payment('p2', 'cash')]}
        openCharges={[]}
        paidThisYearAgorot={50_000}
        openBalanceAgorot={0}
        onEmailReceipt={vi.fn()}
        onPay={vi.fn()}
        {...props}
      />,
    )
  }

  it('offers the receipt email on card rows and nowhere else', () => {
    // ▲ D9.3's STRUCTURAL half, which the artboard never applied: `שליחה למייל` was a single
    // global footer button under a disclaimer saying only card payments have a receipt.
    // §5.10 issues a חשבונית/קבלה for card payments only.
    renderHistory()
    const rows = screen.getAllByTestId('payment-row')
    expect(within(rows[0]!).getByTestId('email-receipt')).toBeInTheDocument()
    expect(within(rows[1]!).queryByTestId('email-receipt')).not.toBeInTheDocument()
  })

  it('names a cheque payment rather than folding it into cash', () => {
    // §10 — the club's question is 'how much of this year is sitting in undeposited
    // cheques', and a history row that says מזומן cannot answer it. `methodKey`'s final
    // `: 'cash'` is a fallback, so this failure is silent by construction.
    renderHistory({ payments: [payment('p1', 'cheque')] })
    expect(screen.getByTestId('payment-row')).toHaveTextContent('צ׳קים')
  })

  it('has no global email-the-receipts button', () => {
    // The footer button is the false promise D9.3 removed from the title, moved down the
    // screen. `billing.receipt.email` is singular: *a* receipt, on *a* row.
    renderHistory()
    expect(screen.queryByTestId('email-all-receipts')).not.toBeInTheDocument()
  })

  it('scopes the receipt disclaimer to what is true', () => {
    renderHistory()
    expect(screen.getByTestId('receipt-scope')).toHaveTextContent(
      t(LOCALE, 'billing.receipt.cardOnly'),
    )
  })

  it('filters by charge kind and not by a second taxonomy', async () => {
    // D-M6-3, and 12f finding 3. The artboard's `מנויים · ציוד · אירועים` is a third
    // vocabulary for an axis `charge.kind` already names, and two enums for one axis is how
    // a filter starts disagreeing with the rows it filters.
    renderHistory()
    const filters = screen.getByTestId('history-filters')
    expect(within(filters).getByLabelText(t(LOCALE, 'billing.filter.all'))).toBeInTheDocument()
    expect(
      within(filters).getByLabelText(t(LOCALE, 'billing.charge.kind.tuition')),
    ).toBeInTheDocument()
    expect(
      within(filters).getByLabelText(t(LOCALE, 'billing.charge.kind.event')),
    ).toBeInTheDocument()
  })

  it('renders the empty state for a family in their first month', () => {
    // 12f finding 4.
    renderHistory({ payments: [] })
    expect(screen.getByText('עדיין לא נרשמו תשלומים')).toBeInTheDocument()
  })
})

describe('the return from uPay', () => {
  it('says it is verifying and that the window can be closed', () => {
    // §5.10 step 5 — 'the redirect is NEVER the source of truth. A closed tab still produces
    // an IPN.' 1b finding 2 and 12e's own table both record that this state is not drawn
    // anywhere, and it is the one state the whole flow depends on being honest about.
    render(
      <PaymentCompleteScreen locale={LOCALE} status="pending" onOpenPayments={vi.fn()} />,
    )
    expect(screen.getByText(t(LOCALE, 'billing.order.verifying'))).toBeInTheDocument()
    expect(screen.getByText(t(LOCALE, 'billing.order.verifyingHint'))).toBeInTheDocument()
  })

  it('reports an amount mismatch as needing a check, never as a failure', () => {
    // §5.10: the money IS in the merchant account. Telling the parent it failed would be
    // wrong in the direction that costs them a second payment.
    render(
      <PaymentCompleteScreen
        locale={LOCALE}
        status="amount_mismatch"
        onOpenPayments={vi.fn()}
      />,
    )
    expect(screen.getByText(t(LOCALE, 'billing.order.mismatchAlert'))).toBeInTheDocument()
    expect(screen.getByText(t(LOCALE, 'billing.order.mismatchHint'))).toBeInTheDocument()
  })
})

describe('12e — ordering items', () => {
  const PRODUCTS = [
    { id: 'p1', name: 'גי מידה 140', description: null, price_agorot: 18_000, is_active: true },
    { id: 'p2', name: 'חגורה', description: null, price_agorot: 6_000, is_active: true },
  ]

  it('shows no stock count, no availability and says so', () => {
    // §5.10 and §4.3 both: 'no stock counts, no inventory — that is a different product'.
    // D-M6-14 settles the conflict with `11a`, which draws inventory: the spec wins.
    const { container } = render(
      <OrderItemsScreen locale={LOCALE} products={PRODUCTS} onOrder={vi.fn()} />,
    )
    expect(screen.getByTestId('no-stock-hint')).toHaveTextContent(
      'אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד',
    )
    expect(container.textContent).not.toMatch(/במלאי|נותרו|\bN left\b/)
  })

  it('cannot order nothing', () => {
    render(<OrderItemsScreen locale={LOCALE} products={PRODUCTS} onOrder={vi.fn()} />)
    expect(screen.getByTestId('order-button')).toBeDisabled()
  })

  it('totals the selection in agorot', async () => {
    render(<OrderItemsScreen locale={LOCALE} products={PRODUCTS} onOrder={vi.fn()} />)
    await userEvent.click(within(screen.getAllByTestId('product-row')[0]!).getByRole('checkbox'))
    const amounts = [...document.querySelectorAll('.studio-money')]
    expect(amounts[amounts.length - 1]?.textContent).toContain('180')
  })

  it('renders the empty state when the club sells nothing', () => {
    render(<OrderItemsScreen locale={LOCALE} products={[]} onOrder={vi.fn()} />)
    expect(screen.getByText('לא הוגדרו פריטים')).toBeInTheDocument()
  })
})

describe('the student-card payment strip', () => {
  it('shows nothing when the family owes nothing', () => {
    // D2 keeps the debt alert on `1a`. A strip announcing a zero balance is noise on a card
    // about a child.
    const { container } = render(
      <PaymentStrip locale={LOCALE} balanceAgorot={0} onOpenPayments={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the debt through MoneyDisplay when there is one', () => {
    render(<PaymentStrip locale={LOCALE} balanceAgorot={32_000} onOpenPayments={vi.fn()} />)
    expect(screen.getByTestId('payment-strip').querySelector('.studio-money')).not.toBeNull()
  })
})
