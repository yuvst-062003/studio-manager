// The parent app's billing endpoints, in one file. A screen with a fetch in it is a screen a
// test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client) — §8.2 regenerates it from
// openapi.json and fails CI on a stale copy, so a hand-written shape here would be a second
// definition nothing keeps in step.
//
// **G2 — every amount crossing this boundary is an integer count of agorot.** Nothing here
// divides by 100. `MoneyDisplay` renders, `@studio/core`'s `formatAgorot` formats, and a
// screen that did its own arithmetic would be the second place money is rounded.
import type { components } from '@studio/api-client'

export type ChargeOut = components['schemas']['ChargeOut']
export type PaymentOut = components['schemas']['PaymentOut']
export type PaymentOrderOut = components['schemas']['PaymentOrderOut']
export type ProductOut = components['schemas']['ProductOut']
export type PayerBalanceOut = components['schemas']['PayerBalanceOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** The uPay form as data: an action and hidden fields the client posts. */
export type UpayForm = { action: string; fields: Record<string, string> }

/**
 * 'אני אשלם במזומן' / 'אביא צ׳קים' over specific charges — raised here, decided by a
 * manager. One shape for both routes, because they are one row with a `method` on it:
 * the payment-routes spec §8's point is that cheques are cash with a different word on
 * the payment, and a second type here would be the place the two drift apart.
 *
 * Hand-written rather than taken from `@studio/api-client` for the same reason `UpayForm`
 * is: this file is imported by `PaymentsScreen`, which a test renders without a server
 * shape. `PaymentPromiseOut` in the generated client is the wire contract and this is
 * structurally identical to it — `web/scripts/…` regenerates that one, and a drift shows
 * up as a type error at `makeParentBillingClient`, which is where it should.
 */
export type PromiseMethod = 'cash' | 'cheque' | 'standing_order'

export type PaymentPromiseOut = {
  id: string
  status: 'pending' | 'received' | 'declined'
  method: PromiseMethod
  total_agorot: number
  /** Whole months bought forward beyond the charges named below. 0 is the ordinary
   *  settle-what-is-owed promise. */
  prepay_months: number
  /** The payment program a plan claim is about, or null for an ordinary promise. What
   *  lets the payments screen leave its cash/cheque cards usable while a plan claim from
   *  the plan picker is still with the manager. */
  claimed_plan_id: string | null
  charge_ids: string[]
  created_at: string
  decided_at: string | null
}

export type BillingClient = {
  openCharges(payerPersonId: string): Promise<ChargeOut[]>
  promises(): Promise<PaymentPromiseOut[]>
  createPromise(
    chargeIds: string[],
    method: PromiseMethod,
    prepayMonths: number,
  ): Promise<PaymentPromiseOut>
  balance(payerPersonId: string): Promise<PayerBalanceOut>
  payments(payerPersonId: string): Promise<PaymentOut[]>
  products(): Promise<ProductOut[]>
  /** `prepayMonths` buys months that have no charge yet — the card's half of the
   *  prepayment the cash and cheque cards have offered since 2026-08-27. Priced by the
   *  SERVER from the payer's monthly total; nothing here sends an amount. */
  createOrder(
    chargeIds: string[],
    maxPayments: number,
    prepayMonths?: number,
  ): Promise<PaymentOrderOut>
  orderForm(publicRef: string): Promise<UpayForm>
  orderStatus(publicRef: string): Promise<PaymentOrderOut>
}

// There is deliberately no `makeBillingClient` here any more (ship-audit D5). The one
// this module used to export called `/charges?payer_person_id=` and `/payers/{id}/balance`
// — manager-only routes a parent answers 403 from — and was mounted by nothing; the
// screen ships on `makeParentBillingClient` (PaymentsSection.tsx), which reads the
// `/me/*` routes. A loaded trap with the same shape as the real client is exactly the
// import autocomplete reaches for first.

/**
 * The month a charge belongs to. `period_year`/`period_month` when the charge has one —
 * that is the month the chip names and the month the parent thinks in — and the due date's
 * month otherwise, so a registration or event charge still lands in exactly one bucket
 * rather than in none.
 */
export function chargeMonthKey(charge: ChargeOut): string {
  if (charge.period_year !== null && charge.period_month !== null) {
    return `${charge.period_year}-${String(charge.period_month).padStart(2, '0')}`
  }
  return charge.due_date.slice(0, 7)
}

/** The distinct months a set of charges spans. What `[1] [2] [3] [6]` may legally offer. */
export function distinctMonths(charges: readonly ChargeOut[]): number {
  return new Set(charges.map(chargeMonthKey)).size
}

/**
 * §5.10's card route: 'Choosing N months selects the N oldest unpaid tuition charges across
 * every student this person is the payer for.'
 *
 * **A month, not a charge.** §5.10's own worked example is a two-child family owing
 * September and October, and it states the card total for `[2]` months as 1,280₪ — all
 * four rows. This used to be `.slice(0, months)` over the charge list, which is the same
 * thing only while a family has exactly one child: with three children, "2 months" bought
 * two of September's three charges and left the third child owed, and nothing on the screen
 * said which one. That also made the summary card ("סה״כ חוב 1,250₪") and the cash card
 * ("חיובים פתוחים 850₪") disagree with each other on the same screen.
 */
export function oldestMonths(charges: readonly ChargeOut[], months: number): ChargeOut[] {
  // Sorted here even though `/me/charges` now orders by (due_date, id) server-side
  // (ship-audit B5): this decides which months a family's money settles, and trusting an
  // upstream ordering turns any reordering — a cache, a merge, a regression — into
  // silently paying the wrong months. ISO dates compare lexicographically; the id
  // breaks ties so a re-render selects the same rows in the same order.
  const sorted = [...charges].sort((a, b) =>
    a.due_date === b.due_date ? a.id.localeCompare(b.id) : a.due_date.localeCompare(b.due_date),
  )
  // The oldest N month keys, in the order the sort met them. A Set preserves insertion
  // order, so this is "the first N distinct months" without a second sort.
  const wanted = new Set([...new Set(sorted.map(chargeMonthKey))].slice(0, Math.max(0, months)))
  return sorted.filter((charge) => wanted.has(chargeMonthKey(charge)))
}

/** The total a selection comes to, in agorot. Integers throughout (G2). */
export function selectionTotal(charges: readonly ChargeOut[]): number {
  return charges.reduce((sum, charge) => sum + charge.amount_agorot, 0)
}

/**
 * §5.10's instalment split, as two shapes with two plural rules — `1b` finding 6.
 *
 * The remainder rides on the FIRST instalment rather than being spread, which is what card
 * processors do and what a parent checking their statement will see. Integer arithmetic, so
 * the parts always sum back to the total exactly.
 */
export function instalmentSplit(
  totalAgorot: number,
  instalments: number,
): { first: number; rest: number; count: number } {
  const base = Math.floor(totalAgorot / instalments)
  return { first: base + (totalAgorot - base * instalments), rest: base, count: instalments }
}
