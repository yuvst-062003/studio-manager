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

/** 'אני אשלם במזומן' over specific charges — raised here, decided by a manager. */
export type CashRequestOut = {
  id: string
  status: 'pending' | 'received' | 'declined'
  total_agorot: number
  charge_ids: string[]
  created_at: string
  decided_at: string | null
}

export type BillingClient = {
  openCharges(payerPersonId: string): Promise<ChargeOut[]>
  cashRequests(): Promise<CashRequestOut[]>
  requestCash(chargeIds: string[]): Promise<CashRequestOut>
  balance(payerPersonId: string): Promise<PayerBalanceOut>
  payments(payerPersonId: string): Promise<PaymentOut[]>
  products(): Promise<ProductOut[]>
  createOrder(chargeIds: string[], maxPayments: number): Promise<PaymentOrderOut>
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
 * §5.10's card route: 'Choosing N months selects the N oldest unpaid tuition charges across
 * every student this person is the payer for.'
 */
export function oldestMonths(charges: readonly ChargeOut[], months: number): ChargeOut[] {
  // Sorted here even though `/me/charges` now orders by (due_date, id) server-side
  // (ship-audit B5): this slice decides which months a family's money settles, and a
  // bare slice turns any upstream reordering — a cache, a merge, a regression — into
  // silently paying the wrong months. ISO dates compare lexicographically; the id
  // breaks ties so a re-render selects the same rows.
  return [...charges]
    .sort((a, b) =>
      a.due_date === b.due_date
        ? a.id.localeCompare(b.id)
        : a.due_date.localeCompare(b.due_date),
    )
    .slice(0, months)
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
