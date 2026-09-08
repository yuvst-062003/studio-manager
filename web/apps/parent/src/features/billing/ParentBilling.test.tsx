// Parent artboards `12f` and `12e`, and the selection arithmetic under them.
//
// **What used to be here and is not.** Five `1b` describes rendered `PaymentsScreen`,
// deleted 2026-09-08 with the container beside it. They are not ported, because the ground
// they covered is covered on the screen that replaced them: `ParentPayments.test.tsx` holds
// twenty-nine tests over the routes, the month chips, the club's floor, the twelve-month
// ceiling, the instalment split and the uPay seam — and the mandate and cheque routes moved
// to `ProfileScreen.test.tsx` when the routes themselves did.
//
// What survives is what still has a screen behind it.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PaymentHistoryScreen } from './PaymentHistoryScreen'
import { PaymentCompleteScreen } from './PaymentCompleteScreen'
import { instalmentSplit, oldestMonths, selectionTotal } from './billingClient'
import type { ChargeOut, PaymentOut } from './billingClient'

const LOCALE = 'he' as const

function charge(id: string, month: number, amount = 25_000, isCoveredElsewhere = false): ChargeOut {
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
    expect(oldestMonths(charges, 1).map((c) => c.id)).toEqual(['a1', 'a2'])
  })

  it("takes every child's charge for each month — §5.10's own worked example", () => {
    // §5.10 draws a family with two children owing September and October, and states the
    // card total for [2] months as 1,280₪ — all FOUR charges. Selecting by charge COUNT
    // returns two of them: September settles for דנה and stays owed for יוסי, and the
    // parent has no way to see which of their children they just half-paid for.
    //
    // A month is the unit the chip names, so a month is the unit this selects.
    const charges = [
      charge('sep-dana', 9, 32_000),
      charge('sep-yossi', 9, 32_000),
      charge('oct-dana', 10, 32_000),
      charge('oct-yossi', 10, 32_000),
    ]
    expect(oldestMonths(charges, 2).map((c) => c.id)).toEqual([
      'sep-dana',
      'sep-yossi',
      'oct-dana',
      'oct-yossi',
    ])
    expect(selectionTotal(oldestMonths(charges, 2))).toBe(128_000)
  })

  it('one month buys the whole month, for every child', () => {
    const charges = [charge('sep-dana', 9), charge('sep-yossi', 9), charge('oct-dana', 10)]
    expect(oldestMonths(charges, 1).map((c) => c.id)).toEqual(['sep-dana', 'sep-yossi'])
  })

  it('counts DISTINCT months, so asking for more months than exist takes what there is', () => {
    const charges = [charge('sep-dana', 9), charge('sep-yossi', 9)]
    expect(oldestMonths(charges, 6)).toHaveLength(2)
  })

  it('groups by the due month and not by the row order', () => {
    // Two children whose charges arrive interleaved and shuffled. One month must still be
    // exactly one month.
    const charges = [
      charge('oct-b', 10),
      charge('sep-b', 9),
      charge('oct-a', 10),
      charge('sep-a', 9),
    ]
    expect(oldestMonths(charges, 1).map((c) => c.id)).toEqual(['sep-a', 'sep-b'])
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

  function settling(id: string, method: PaymentOut['method'], kind: string): PaymentOut {
    return {
      ...payment(id, method),
      allocations: [
        { id: `a-${id}`, payment_id: id, charge_id: `c-${id}`, amount_agorot: 25_000, kind },
      ],
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

  it('says which screen this is, and how to get back to paying', () => {
    // The screen had NO heading of any kind and no way back: a parent who tapped
    // "היסטוריה" from the payments screen landed somewhere with the same tab highlighted,
    // no title, and a summary card. Its one title string was being spent on a hidden
    // fieldset legend.
    renderHistory()
    expect(
      screen.getByRole('heading', { name: t(LOCALE, 'billing.history.title') }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('history-back')).toHaveAttribute('href', '#/payments')
  })

  it('dates every payment', () => {
    // A history of amounts with no dates is not a history. `received_at` was on the wire
    // the whole time and the row simply never rendered it.
    renderHistory()
    expect(screen.getAllByTestId('payment-date')[0]).toHaveTextContent('2026')
  })

  it('filters on the kind of charge each payment settled', () => {
    // The filter was `(payment.allocations?.length ?? 0) > 0 && filter === 'tuition'` — a
    // constant dressed as a predicate. שכר לימוד matched every allocated payment whatever
    // it settled, and חיוב ידני and אירוע matched NOTHING, ever: two of the four chips were
    // dead controls. A payment has a method, not a kind, so `PaymentAllocationOut.kind` now
    // carries the kind of the charge each allocation settled.
    renderHistory({
      payments: [settling('p1', 'upay_card', 'tuition'), settling('p2', 'cash', 'event')],
    })
    expect(screen.getAllByTestId('payment-row')).toHaveLength(2)
    fireEvent.click(screen.getByLabelText(t(LOCALE, 'billing.charge.kind.event')))
    const rows = screen.getAllByTestId('payment-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('מזומן')
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
    render(<PaymentCompleteScreen locale={LOCALE} status="pending" onOpenPayments={vi.fn()} />)
    expect(screen.getByText(t(LOCALE, 'billing.order.verifying'))).toBeInTheDocument()
    expect(screen.getByText(t(LOCALE, 'billing.order.verifyingHint'))).toBeInTheDocument()
  })

  it('reports an amount mismatch as needing a check, never as a failure', () => {
    // §5.10: the money IS in the merchant account. Telling the parent it failed would be
    // wrong in the direction that costs them a second payment.
    render(
      <PaymentCompleteScreen locale={LOCALE} status="amount_mismatch" onOpenPayments={vi.fn()} />,
    )
    expect(screen.getByText(t(LOCALE, 'billing.order.mismatchAlert'))).toBeInTheDocument()
    expect(screen.getByText(t(LOCALE, 'billing.order.mismatchHint'))).toBeInTheDocument()
  })

  it('reports a failed payment honestly, rather than as still verifying', () => {
    // §7.4 — `failed`, `expired` and `pending` all fell into the same catch-all branch, so
    // a parent whose card was declined kept reading "מאמת תשלום…" forever. The label
    // already existed (`billing.order.status.failed`) with no call site anywhere.
    render(<PaymentCompleteScreen locale={LOCALE} status="failed" onOpenPayments={vi.fn()} />)
    expect(screen.getByTestId('order-failed')).toHaveTextContent(
      t(LOCALE, 'billing.order.status.failed'),
    )
    expect(screen.queryByText(t(LOCALE, 'billing.order.verifying'))).not.toBeInTheDocument()
  })

  it('reports an expired payment honestly, rather than as still verifying', () => {
    render(<PaymentCompleteScreen locale={LOCALE} status="expired" onOpenPayments={vi.fn()} />)
    expect(screen.getByTestId('order-expired')).toHaveTextContent(
      t(LOCALE, 'billing.order.status.expired'),
    )
    expect(screen.queryByText(t(LOCALE, 'billing.order.verifying'))).not.toBeInTheDocument()
  })
})

