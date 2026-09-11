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

/**
 * How far ahead a family may ever be (owner review, 2026-09-08 — "don't allow a user to
 * pay more months if he already paid for a season").
 *
 * **The same twelve `app/services/billing/prepay_ceiling.py` refuses on**, and the client
 * half exists so a parent is never offered a chip the server would decline. It is not the
 * authority: `refuse_past_ceiling` is, and this is its mirror.
 */
export const PREPAY_CEILING_MONTHS = 12

/** The values a cash term is drawn from. Not `MONTH_CHIPS`: cash buys months FORWARD and
 *  a club may collect a year of them, which the card's ladder stops short of. */
const CASH_LADDER = [1, 2, 3, 6, 12] as const

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

/**
 * One line of the receipt under the headline.
 *
 * Three kinds because they are three different promises: a `charge` closes something that
 * exists, a `forward` month buys one that does not, and a `remainder` is what this payment
 * deliberately leaves behind. A single `{label, amount}` shape would have the screen
 * deciding which is which by reading the label back out.
 */
export type ReceiptLine =
  | {
      kind: 'charge'
      id: string
      /** What the charge is. Built by the caller, which is the only place `t` lives. */
      label: string
      /** Beside the label, never inside it: one carrier per fact, so the component can
       *  align a name where a name goes instead of parsing it out of a sentence. */
      studentName: string
      amountAgorot: number
    }
  | { kind: 'forward'; months: number; amountAgorot: number }
  | { kind: 'remainder'; amountAgorot: number }

/**
 * How many more months this payer may buy forward.
 *
 * The mirror of `prepay_headroom_months` on the server, **in money and not in months** for
 * the reason that one gives: a family whose plan was re-priced holds credit that is not a
 * whole number of months, and two roundings of that is how a chip a parent can press
 * becomes an error they cannot read.
 */
export function prepayHeadroomMonths(creditAgorot: number, monthlyTotalAgorot: number): number {
  if (monthlyTotalAgorot <= 0) return 0
  const ceiling = PREPAY_CEILING_MONTHS * monthlyTotalAgorot
  // `Math.floor` and NOT `Math.trunc`. A family past the ceiling has a negative numerator,
  // where `trunc` rounds towards zero and `//` in Python rounds away — the two would then
  // disagree about exactly the family this rule exists for.
  return Math.max(0, Math.floor((ceiling - creditAgorot) / monthlyTotalAgorot))
}

/**
 * The cash terms this family may choose from.
 *
 * The club's number is a **floor** rather than the answer (owner review: "what if the
 * person wants 5 months?"). The screen used to present it as the whole offer, so a family
 * who wanted longer had no way to say so.
 *
 * **The ceiling outranks the floor.** A family two months from the ceiling is offered two,
 * not turned away because the club collects three at a time — that rule exists to stop a
 * family paying one month at a time in cash, and a family ten months ahead is plainly not
 * that family. At zero headroom there is no forward offer at all and cash returns to
 * settling what is open, which is how it behaved before prepayment existed.
 */
export function cashMonthChips(floor: number, headroom: number): readonly number[] {
  if (headroom <= 0) return []
  const lo = Math.max(floor, 1)
  const ladder = (low: number) => CASH_LADDER.filter((month) => month >= low && month <= headroom)
  // `headroom` joins the chips so the largest offer is always the most they may actually
  // buy — a floor of 3 with 5 months of room offers 3 and 5, not 3 alone.
  const chips = headroom < lo ? [...ladder(1), headroom] : [...ladder(lo), lo, headroom]
  return [...new Set(chips)].sort((a, b) => a - b)
}

/**
 * The rows under the headline — what this payment is actually for.
 *
 * The screen this replaced showed one figure and a subtitle of "month · child", so a debt
 * of a shop item plus a month of tuition was a single number with no way to tell the two
 * apart. That is the defect; these are the rows.
 *
 * Walks `ask.chargeIds` — the charges THIS payment settles, not every open one — so the
 * rows and the total cannot disagree. It never recomputes the total: the caller renders
 * `ask.totalAgorot`, which is still the one number computed in one place.
 */
export function receiptLines(
  ask: Ask,
  debts: readonly DebtRow[],
  terms: PayTerms,
  /** What to call a charge. Injected because the label needs `t(locale, …)` and this
   *  module is deliberately free of i18n — the same reason `money` is a prop on the
   *  screen rather than an import inside it. */
  labelOf: (charge: ChargeOut) => string,
): readonly ReceiptLine[] {
  const byId = new Map(debts.map((row) => [row.charge.id, row]))
  const lines: ReceiptLine[] = []
  let settled = 0
  for (const id of ask.chargeIds) {
    const row = byId.get(id)
    if (row === undefined) continue
    settled += row.charge.amount_agorot
    lines.push({
      kind: 'charge',
      id,
      label: labelOf(row.charge),
      studentName: row.studentName,
      amountAgorot: row.charge.amount_agorot,
    })
  }
  if (ask.forwardMonths > 0) {
    lines.push({
      kind: 'forward',
      months: ask.forwardMonths,
      amountAgorot: ask.forwardMonths * terms.monthlyTotalAgorot,
    })
  }
  // Everything still open that this payment does not touch — including the rows another
  // payment holds, which are left out above on purpose. Without it the receipt is a
  // complete-looking document that quietly omits money the family still owes.
  const remainder = debtAgorot(debts) - settled
  if (remainder > 0) lines.push({ kind: 'remainder', amountAgorot: remainder })
  return lines
}

/**
 * What a payment settled, as data rather than a sentence.
 *
 * The confirmation moment has to say what was paid for — a parent who sees only "שולם" and
 * a number has been told the least useful half of the event (owner, 2026-09-11). The
 * sentence itself is built in `PaymentSettled`, because the charge KIND needs `t(locale,
 * …)` and this module is deliberately free of i18n, for the same reason `money` is a prop
 * on the screen rather than an import inside it.
 *
 * `proration_note` is where both shop routes write the item's name and where the billing
 * run writes its explanation, so it is the label whenever it is there — and the kind is
 * the floor for a charge nothing ever named.
 */
export type SettledFor = {
  /** The first charge's own note, when it has one. */
  note: string | null
  /** Its kind, for the i18n key when there is no note. */
  kind: string
  /** Distinct children this payment covered, in the order the charges were selected. */
  students: readonly string[]
  /** How many charges beyond the first, so the line can say so without listing them. */
  extra: number
}

export function settledFor(
  chargeIds: readonly string[],
  debts: readonly DebtRow[],
): SettledFor | null {
  const byId = new Map(debts.map((row) => [row.charge.id, row]))
  const rows = chargeIds.map((id) => byId.get(id)).filter((row) => row !== undefined)
  const first = rows[0]
  if (first === undefined) return null
  return {
    note: first.charge.proration_note ?? null,
    kind: first.charge.kind,
    // A two-child family paying one month is two charges and two names; the same name
    // twice is one child with a shop item beside their tuition.
    students: [...new Set(rows.map((row) => row.studentName).filter(Boolean))],
    extra: Math.max(0, rows.length - 1),
  }
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
  /** How many months forward the family chose on the CASH route. Defaulted to the club's
   *  own number so every existing caller keeps its behaviour: before the owner's review
   *  the club's floor was the whole offer, and a family who wanted five months of cash
   *  had no control on the screen to say so. Ignored by the card route, whose months mean
   *  something else — months of training covered, oldest debt first. */
  cashMonths = terms.cashMonths,
): Ask {
  const canPrepay = terms.monthlyTotalAgorot > 0
  const open = payable(debts)
  if (method === 'cash') {
    const forwardMonths = canPrepay ? Math.max(0, cashMonths) : 0
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
