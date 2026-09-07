// What the תשלומים screen is allowed to say about money, as pure functions.
//
// The screen it serves was rebuilt on 2026-09-07 around three rules, and two of the three
// are arithmetic — which is why they live here, where a test can hold them, rather than
// inside a component where they would only ever be checked by looking:
//
//  1. **The debt never moves.** `debtAgorot` counts every open charge, including the ones
//     some other payment already claims. Choosing a method, or a number of months, cannot
//     change what the family owes — and the old screen's worst moment was a top line
//     reading ₪208.33 above buttons offering ₪500, ₪750 and ₪3,000.
//  2. **The button states the real amount.** `askFor` returns the ONE number the button
//     is about to charge, so nothing on the screen asks a parent to add two figures.
//  3. **When the number jumps, the screen says why.** `settledMonths` and `forwardMonths`
//     come back beside the total, so the line that explains it is read off the same
//     computation rather than re-derived beside it.
//
// Bug #16 added `instalments` to the same `Ask`, for the same reason the two month counts
// are on it: the order request and the line that explains the split must be two readings of
// one computation, never two computations that agree today.
//
// G2 throughout: every amount is an integer count of agorot and nothing here divides.
import { oldestMonths, selectionTotal } from '../billingClient'
import type { ChargeOut } from '../billingClient'

/** The two routes this screen offers. הוראת קבע and צ׳קים moved to פרופיל → תשלומים:
 *  both are set up ONCE, so neither is a monthly decision and neither belongs here. */
export type PayMethod = 'card' | 'cash'

/** §5.10's card chips. The ceiling the club's own rule is measured against. */
export const MONTH_CHIPS = [1, 2, 3, 6] as const

/** §5.10's other chip group, restored for bug #16. `1..3`, not `1..MAX_INSTALLMENTS`:
 *  twelve is what `app/integrations/upay/form.py` will *accept*, and three is what §5.10
 *  offers a parent — the screen this one replaced offered exactly these. */
export const INSTALMENT_CHIPS = [1, 2, 3] as const

export type DebtRow = {
  charge: ChargeOut
  /** The child the month is for. Data, not copy — it is rendered beside the period. */
  studentName: string
  /**
   * Held by a payment this parent cannot take over. After the 2026-09-07 backend change
   * this no longer includes their OWN abandoned card order: that one is replaced rather
   * than refused, so a row the screen greys out is exactly a row the server would decline.
   */
  coveredElsewhere: boolean
}

/** `GET /me/prepay-terms`, narrowed to what this screen uses. The cheque term went to
 *  פרופיל with the cheque route itself. */
export type PayTerms = {
  /** How many months of cash the club collects at a time. The CLUB's number, and the
   *  screen says so out loud rather than presenting it as the parent's choice. */
  cashMonths: number
  /** This payer's own monthly price, summed across their active children. Zero for a
   *  payer with no priced child, which is what makes a month forward unbuyable. */
  monthlyTotalAgorot: number
}

/**
 * What the button is about to do. Every field is read by the screen; none is recomputed.
 *
 * `settledMonths` and `forwardMonths` are separate because they are different promises:
 * a settled month closes a charge that exists, and a forward month buys one that does not
 * yet. The server prices the second half from the payer's monthly total and the surplus
 * becomes the credit the billing run spends as those months are billed.
 */
export type Ask = {
  method: PayMethod
  /** The charges this payment settles, oldest first. May be empty for a pure prepayment. */
  chargeIds: readonly string[]
  settledMonths: number
  forwardMonths: number
  /** What the button charges. The only total on the screen. */
  totalAgorot: number
  /**
   * Bug #16 — how many card payments uPay collects the total in. Always 1 for cash, which
   * is handed over once.
   *
   * **It never changes `totalAgorot`.** A split is how the money is collected, not a
   * smaller thing being bought, and a screen where picking "3" made the headline figure
   * shrink would be the same "two figures to assemble" defect from the other direction.
   */
  instalments: number
}

/** Every open charge, whoever is holding it. The number that never moves. */
export function debtAgorot(debts: readonly DebtRow[]): number {
  return selectionTotal(debts.map((row) => row.charge))
}

/** The part of the debt some other payment already claims, so the screen can name it
 *  rather than leave a greyed-out row contradicting the total above it. */
export function coveredAgorot(debts: readonly DebtRow[]): number {
  return selectionTotal(debts.filter((row) => row.coveredElsewhere).map((row) => row.charge))
}

/** The rows this parent may actually pay right now. */
export function payable(debts: readonly DebtRow[]): readonly ChargeOut[] {
  return debts.filter((row) => !row.coveredElsewhere).map((row) => row.charge)
}

/** The distinct months those rows span — what "3 months" can settle before it starts
 *  buying months forward. */
export function owedMonths(debts: readonly DebtRow[]): number {
  return new Set(
    payable(debts).map((charge) =>
      charge.period_year !== null && charge.period_month !== null
        ? `${charge.period_year}-${charge.period_month}`
        : charge.due_date.slice(0, 7),
    ),
  ).size
}

/**
 * The one computation on the screen.
 *
 * **Card** settles the oldest `months` months first and buys the rest forward, which is
 * what makes the chips mean "months of training covered" rather than "months I happen to
 * owe" — a family in good standing was offered `[1]` and could not hand the club a term
 * by card at all until prepayment reached this route (owner request, 2026-08-30).
 *
 * **Cash** settles everything open and adds the club's own block. The parent chooses
 * nothing here, and the copy beside the number says who did.
 *
 * A payer with no monthly price buys no months forward on either route: the product would
 * be zero, and the server refuses an order for months it cannot price. For them the chips
 * mean exactly what they meant before prepayment existed.
 */
export function askFor(
  method: PayMethod,
  debts: readonly DebtRow[],
  months: number,
  terms: PayTerms,
  instalments = 1,
): Ask {
  const canPrepay = terms.monthlyTotalAgorot > 0
  const open = payable(debts)
  if (method === 'cash') {
    const forwardMonths = canPrepay ? Math.max(0, terms.cashMonths) : 0
    return {
      method,
      chargeIds: open.map((charge) => charge.id),
      settledMonths: owedMonths(debts),
      forwardMonths,
      totalAgorot: selectionTotal(open) + forwardMonths * terms.monthlyTotalAgorot,
      // Cash is counted out once across a counter. A split is a card instruction.
      instalments: 1,
    }
  }
  // Debt first, always. `oldestMonths` caps itself at what exists, so asking it for six
  // months from a family that owes one returns that one.
  const wanted = Math.max(0, months)
  const chosen = oldestMonths(open, wanted)
  const settledMonths = Math.min(wanted, owedMonths(debts))
  const forwardMonths = canPrepay ? wanted - settledMonths : 0
  return {
    method,
    chargeIds: chosen.map((charge) => charge.id),
    settledMonths,
    forwardMonths,
    totalAgorot: selectionTotal(chosen) + forwardMonths * terms.monthlyTotalAgorot,
    instalments: Math.max(1, instalments),
  }
}
