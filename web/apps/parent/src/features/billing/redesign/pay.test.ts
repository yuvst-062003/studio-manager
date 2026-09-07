// The half of תשלומים a screenshot cannot check: the arithmetic behind the one number on
// the button.
//
// Every case here is a way the screen could look right and charge wrong — a month bought
// twice, a debt counted as though somebody else's claim had settled it, a family in good
// standing sold months at a price nobody holds.
import { describe, expect, it } from 'vitest'
import { askFor, coveredAgorot, debtAgorot, owedMonths, payable } from './pay'
import type { DebtRow, PayTerms } from './pay'
import type { ChargeOut } from '../billingClient'

const MONTHLY = 25_000
const TERMS: PayTerms = { cashMonths: 3, monthlyTotalAgorot: MONTHLY }

function charge(over: Partial<ChargeOut> & { id: string }): ChargeOut {
  return {
    allocated_agorot: 0,
    amount_agorot: MONTHLY,
    created_by: 'billing_run',
    due_date: '2026-09-30',
    is_covered_elsewhere: false,
    kind: 'tuition',
    original_amount_agorot: null,
    payer_person_id: 'payer-1',
    period_month: 9,
    period_year: 2026,
    product_id: null,
    proration_note: null,
    status: 'open',
    student_id: 'kid-1',
    ...over,
  } as ChargeOut
}

function row(over: Partial<ChargeOut> & { id: string }, coveredElsewhere = false): DebtRow {
  return { charge: charge(over), studentName: 'יובל', coveredElsewhere }
}

describe('the number that never moves', () => {
  it('counts a charge somebody else is already paying', () => {
    // The top line is what the FAMILY owes. A charge inside another payment has not
    // settled, and dropping it from the total would show a family a debt that quietly
    // shrinks when a payment nobody on this screen made is opened elsewhere.
    const debts = [row({ id: 'a' }), row({ id: 'b', period_month: 10 }, true)]
    expect(debtAgorot(debts)).toBe(2 * MONTHLY)
    expect(coveredAgorot(debts)).toBe(MONTHLY)
    expect(payable(debts).map((c) => c.id)).toEqual(['a'])
  })

  it('is unchanged by the method or the month count', () => {
    const debts = [row({ id: 'a' })]
    const before = debtAgorot(debts)
    askFor('card', debts, 6, TERMS)
    askFor('cash', debts, 1, TERMS)
    expect(debtAgorot(debts)).toBe(before)
  })
})

describe('what the card button charges', () => {
  it('settles the oldest month first and buys the rest forward', () => {
    // The owner's own case: one month owed, two months asked for. ₪250 of debt and ₪250
    // bought forward — and `forwardMonths` is what the line under the chips reads from,
    // so "חודש אחד קדימה" is not a second calculation beside this one.
    const debts = [row({ id: 'a' })]
    const ask = askFor('card', debts, 2, TERMS)
    expect(ask.chargeIds).toEqual(['a'])
    expect(ask.settledMonths).toBe(1)
    expect(ask.forwardMonths).toBe(1)
    expect(ask.totalAgorot).toBe(2 * MONTHLY)
  })

  it('takes a MONTH at a time, so a two-child family settles both children', () => {
    // `oldestMonths` selects by month key and not by row. Slicing the charge list here
    // would buy September for one child and leave the sibling owed, with nothing on the
    // screen saying which one.
    const debts = [
      row({ id: 'sep-1', student_id: 'kid-1' }),
      row({ id: 'sep-2', student_id: 'kid-2' }),
      row({ id: 'oct-1', period_month: 10, due_date: '2026-10-31' }),
    ]
    const ask = askFor('card', debts, 1, TERMS)
    expect([...ask.chargeIds].sort()).toEqual(['sep-1', 'sep-2'])
    expect(ask.totalAgorot).toBe(2 * MONTHLY)
    expect(ask.forwardMonths).toBe(0)
  })

  it('never counts a charge another payment is holding', () => {
    const debts = [row({ id: 'a' }, true)]
    const ask = askFor('card', debts, 1, TERMS)
    expect(ask.chargeIds).toEqual([])
    // One month asked for, none of it owed here — so the whole of it is bought forward.
    expect(ask.forwardMonths).toBe(1)
    expect(ask.totalAgorot).toBe(MONTHLY)
  })

  it('sells a family in good standing a term', () => {
    // Nothing owed is not nothing to do. Before prepayment reached the card route this
    // family was offered `[1]` and could not hand the club a term by card at all.
    const ask = askFor('card', [], 3, TERMS)
    expect(ask.chargeIds).toEqual([])
    expect(ask.settledMonths).toBe(0)
    expect(ask.forwardMonths).toBe(3)
    expect(ask.totalAgorot).toBe(3 * MONTHLY)
  })

  it('sells no month at all to a payer with no price', () => {
    // A payer with no priced active child has no monthly total, so "3 months" costs
    // nothing and the server refuses the order. Offering it here would open uPay for the
    // debt alone and silently drop the months the family believed they were buying.
    const debts = [row({ id: 'a' })]
    const ask = askFor('card', debts, 6, { cashMonths: 3, monthlyTotalAgorot: 0 })
    expect(ask.forwardMonths).toBe(0)
    expect(ask.totalAgorot).toBe(MONTHLY)
  })
})

describe('what the cash button charges, and who chose it', () => {
  it('settles everything open and adds the CLUB’s block', () => {
    const debts = [row({ id: 'a' }), row({ id: 'b', period_month: 10, due_date: '2026-10-31' })]
    const ask = askFor('cash', debts, 1, TERMS)
    expect([...ask.chargeIds].sort()).toEqual(['a', 'b'])
    // The month chips are the card's; cash ignores them entirely, which is why the screen
    // hides them when cash is picked rather than leaving them looking answerable.
    expect(ask.settledMonths).toBe(2)
    expect(ask.forwardMonths).toBe(3)
    expect(ask.totalAgorot).toBe(2 * MONTHLY + 3 * MONTHLY)
  })

  it('falls back to settling what is owed when the club collects no term', () => {
    const debts = [row({ id: 'a' })]
    const ask = askFor('cash', debts, 1, { cashMonths: 0, monthlyTotalAgorot: MONTHLY })
    expect(ask.forwardMonths).toBe(0)
    expect(ask.totalAgorot).toBe(MONTHLY)
  })
})

describe('the months a debt spans', () => {
  it('counts months and not charges', () => {
    expect(
      owedMonths([row({ id: 'a', student_id: 'k1' }), row({ id: 'b', student_id: 'k2' })]),
    ).toBe(1)
  })

  it('files a charge with no period under its due month', () => {
    // A registration fee or an event charge has no `period_year`/`period_month`. Without
    // the due-date fallback it would land in no bucket at all and the chips would offer a
    // month the family cannot see they owe.
    expect(
      owedMonths([
        row({ id: 'a', period_year: null, period_month: null, due_date: '2026-09-30' }),
        row({ id: 'b', period_year: null, period_month: null, due_date: '2026-10-31' }),
      ]),
    ).toBe(2)
  })
})
