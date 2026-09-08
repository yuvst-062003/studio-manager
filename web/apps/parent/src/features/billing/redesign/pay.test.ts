// The half of תשלומים a screenshot cannot check: the arithmetic behind the one number on
// the button.
//
// Every case here is a way the screen could look right and charge wrong — a month bought
// twice, a debt counted as though somebody else's claim had settled it, a family in good
// standing sold months at a price nobody holds.
import { describe, expect, it } from 'vitest'
import {
  PREPAY_CEILING_MONTHS,
  askFor,
  cashMonthChips,
  coveredAgorot,
  debtAgorot,
  owedMonths,
  payable,
  prepayHeadroomMonths,
  receiptLines,
} from './pay'
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

// ── the receipt, the cash floor and the ceiling (owner review, 2026-09-08) ──────────
//
// Three defects, and each one is arithmetic before it is layout:
//
//  D1  a total with no list — "an item from the store plus מנוי" was one figure
//  D2  cash offered the club's block and nothing else, so five months was unaskable
//  D6  twelve months could be bought twice, because nobody counted what was held

describe('what a family may still buy', () => {
  it('is nothing for a payer with no monthly price', () => {
    // They buy no months forward on any route, so a chip here would be one the server
    // then refuses — the screen must not offer it at all.
    expect(prepayHeadroomMonths(50_000, 0)).toBe(0)
  })

  it('counts the months already held against the ceiling', () => {
    expect(prepayHeadroomMonths(10 * MONTHLY, MONTHLY)).toBe(2)
  })

  it('is the full season for a family holding nothing', () => {
    expect(prepayHeadroomMonths(0, MONTHLY)).toBe(PREPAY_CEILING_MONTHS)
  })

  it('floors rather than truncating for a family already past it', () => {
    // A plan re-priced downwards. `Math.trunc` would answer -1 here and let a chip
    // through that the server's `//` would refuse — the two must round the same way.
    expect(prepayHeadroomMonths(13 * MONTHLY, MONTHLY)).toBe(0)
  })

  it('ignores a part-month of credit rather than rounding it up into a chip', () => {
    // 11 months and a bit. The eleventh is bought and the twelfth is not, so one month
    // of room remains — rounding the part-month up would refuse a month they may have.
    expect(prepayHeadroomMonths(11 * MONTHLY + 1, MONTHLY)).toBe(0)
    expect(prepayHeadroomMonths(11 * MONTHLY, MONTHLY)).toBe(1)
  })
})

describe('the cash chips', () => {
  // The club's number is a FLOOR, not the answer (D2) — but the ceiling outranks it.
  it.each([
    [3, 12, [3, 6, 12]],
    [3, 5, [3, 5]],
    [3, 2, [1, 2]],
    [4, 12, [4, 6, 12]],
    [0, 12, [1, 2, 3, 6, 12]],
    [3, 0, []],
  ])('a floor of %i with %i months of room offers %j', (floor, headroom, expected) => {
    expect(cashMonthChips(floor, headroom)).toEqual(expected)
  })

  it('never offers a chip the ceiling would refuse', () => {
    for (let headroom = 0; headroom <= 14; headroom += 1) {
      for (const chip of cashMonthChips(3, headroom)) {
        expect(chip).toBeLessThanOrEqual(headroom)
      }
    }
  })
})

describe('the receipt', () => {
  const label = (c: ChargeOut) => c.proration_note ?? `kind:${c.kind}`

  it('names a shop item by its own name and a month by its kind', () => {
    // D1. `proration_note` is where BOTH shop routes write the item's name, which is what
    // makes "חגורה כחולה" distinguishable from "מנוי" with no new field on the wire.
    const debts = [
      row({ id: 'a' }),
      row({ id: 'b', kind: 'manual', proration_note: 'חגורה כחולה', amount_agorot: 12_000, period_month: null, period_year: null, student_id: null }),
    ]
    const ask = askFor('card', debts, 6, TERMS)
    const lines = receiptLines(ask, debts, TERMS, label)
    expect(lines.filter((l) => l.kind === 'charge').map((l) => l.label)).toEqual([
      'kind:tuition',
      'חגורה כחולה',
    ])
  })

  it('sums to exactly what the button charges', () => {
    // The whole point of the rebuild: nothing on the screen asks a parent to add two
    // figures, so the rows and the total cannot be two computations that agree today.
    const debts = [row({ id: 'a' }), row({ id: 'b', period_month: 10 })]
    for (const ask of [askFor('card', debts, 6, TERMS), askFor('cash', debts, 0, TERMS, 1, 5)]) {
      const summed = receiptLines(ask, debts, TERMS, label)
        .filter((line) => line.kind !== 'remainder')
        .reduce((total, line) => total + line.amountAgorot, 0)
      expect(summed).toBe(ask.totalAgorot)
    }
  })

  it('shows a remainder only when the selection is short of the debt', () => {
    const debts = [row({ id: 'a' }), row({ id: 'b', period_month: 10 }), row({ id: 'c', period_month: 11 })]
    const one = receiptLines(askFor('card', debts, 1, TERMS), debts, TERMS, label)
    expect(one).toContainEqual({ kind: 'remainder', amountAgorot: 2 * MONTHLY })

    const all = receiptLines(askFor('card', debts, 3, TERMS), debts, TERMS, label)
    expect(all.some((line) => line.kind === 'remainder')).toBe(false)
  })

  it('leaves a charge another payment holds out of the rows and inside the remainder', () => {
    // A greyed row beside a total that counts it is a contradiction. It is not being
    // paid, so it is not a line — but it is still owed, so it is in the remainder.
    const debts = [row({ id: 'a' }), row({ id: 'b', period_month: 10 }, true)]
    const lines = receiptLines(askFor('card', debts, 6, TERMS), debts, TERMS, label)
    expect(lines.some((line) => line.kind === 'charge' && line.id === 'b')).toBe(false)
    expect(lines.find((line) => line.kind === 'remainder')?.amountAgorot).toBe(MONTHLY)
  })

  it('prices the forward months off the payer’s own monthly total', () => {
    const debts = [row({ id: 'a' })]
    const lines = receiptLines(askFor('cash', debts, 0, TERMS, 1, 5), debts, TERMS, label)
    expect(lines).toContainEqual({ kind: 'forward', months: 5, amountAgorot: 5 * MONTHLY })
  })
})

describe('what the cash button charges', () => {
  it('takes the chosen month count rather than the club’s floor', () => {
    // D2: five months, from a club that collects three.
    const debts = [row({ id: 'a' })]
    const ask = askFor('cash', debts, 0, TERMS, 1, 5)
    expect(ask.forwardMonths).toBe(5)
    expect(ask.totalAgorot).toBe(MONTHLY + 5 * MONTHLY)
  })

  it('still falls back to the club’s floor when nothing was chosen', () => {
    const debts = [row({ id: 'a' })]
    expect(askFor('cash', debts, 0, TERMS).forwardMonths).toBe(3)
  })
})
