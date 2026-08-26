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

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/** The uPay form as data: an action and hidden fields the client posts. */
export type UpayForm = { action: string; fields: Record<string, string> }

export type BillingClient = {
  openCharges(payerPersonId: string): Promise<ChargeOut[]>
  balance(payerPersonId: string): Promise<PayerBalanceOut>
  payments(payerPersonId: string): Promise<PaymentOut[]>
  products(): Promise<ProductOut[]>
  createOrder(chargeIds: string[], maxPayments: number): Promise<PaymentOrderOut>
  orderForm(publicRef: string): Promise<UpayForm>
  orderStatus(publicRef: string): Promise<PaymentOrderOut>
}

export function makeBillingClient(fetcher: Fetcher): BillingClient {
  return {
    async openCharges(payerPersonId) {
      const response = await fetcher(
        `/api/v1/charges?payer_person_id=${payerPersonId}&status=open`,
      )
      return (await json<{ items: ChargeOut[] }>(response)).items
    },
    async balance(payerPersonId) {
      return json<PayerBalanceOut>(await fetcher(`/api/v1/payers/${payerPersonId}/balance`))
    },
    async payments(payerPersonId) {
      const response = await fetcher(`/api/v1/payments?payer_person_id=${payerPersonId}`)
      return (await json<{ items: PaymentOut[] }>(response)).items
    },
    async products() {
      return (await json<{ items: ProductOut[] }>(await fetcher('/api/v1/products'))).items
    },
    async createOrder(chargeIds, maxPayments) {
      // `max_payments` is a query parameter and `charge_ids` the body: `PaymentOrderCreateIn`
      // is W4's contract shape and carries only the ids. The payer is never sent — the
      // server takes it from the session, because a body-supplied payer would let anyone
      // open an order over anyone's charges.
      return json<PaymentOrderOut>(
        await fetcher(`/api/v1/payment-orders?max_payments=${maxPayments}`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ charge_ids: chargeIds }),
        }),
      )
    },
    async orderForm(publicRef) {
      return json<UpayForm>(await fetcher(`/api/v1/payment-orders/${publicRef}/form`))
    },
    async orderStatus(publicRef) {
      return json<PaymentOrderOut>(await fetcher(`/api/v1/payment-orders/${publicRef}`))
    },
  }
}

/**
 * §5.10's card route: 'Choosing N months selects the N oldest unpaid tuition charges across
 * every student this person is the payer for.'
 *
 * The charges arrive oldest-first from the server, so this is a `slice` and not a sort — a
 * second ordering here would be a second answer to "which months am I paying for", and the
 * one the server used is the one the order will actually cover.
 */
export function oldestMonths(charges: readonly ChargeOut[], months: number): ChargeOut[] {
  return charges.slice(0, months)
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
