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
  /** The payer's own claim that this was already settled outside the app -- purely
   *  informational, changes no arithmetic and settles nothing on its own. The manager's
   *  `confirm` action is still the only thing that ever marks a promise `received`. */
  already_paid: boolean
  charge_ids: string[]
  created_at: string
  decided_at: string | null
}

/**
 * One child's הוראת קבע mandate link, as `/api/v1/me/standing-order/links` returns them.
 *
 * Keyed by `studentId` and not by name: two children can share a first name, and a link
 * matched to the wrong child signs a mandate at the wrong amount — the exact failure the
 * per-child link exists to prevent.
 *
 * **Named `MandateLink`, not `StandingOrderLink`.** `PaymentsScreen.tsx` already exports a
 * `StandingOrderLink` of a DIFFERENT shape (`studentName`/`planName`, for rendering), and
 * for a while both lived in this one folder under one name. This one moved here when
 * `PaymentSetup.tsx` was deleted, and kept the collision would have been a trap laid
 * deliberately.
 */
export type MandateLink = { studentId: string; amountAgorot: number; url: string }

export type BillingClient = {
  openCharges(payerPersonId: string): Promise<ChargeOut[]>
  promises(): Promise<PaymentPromiseOut[]>
  createPromise(
    chargeIds: string[],
    method: PromiseMethod,
    prepayMonths: number,
    alreadyPaid?: boolean,
    /** The plan-claim flow (owner request, 2026-08-30): the payment program the parent
     *  says they already paid for. The server prices a plan claim from the PLAN ROW, so
     *  this names a plan and never an amount -- and it is what lets a promise exist for a
     *  child who has no open charge to promise over (the join wizard's payment step, for
     *  a child register skipped because they were already on the roster). */
    claimedPlanId?: string | null,
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
  /** The payer's own `pending` orders — the way back to a uPay page they opened and left.
   *  `createOrder` is refused while one of these still holds its charges, and the
   *  `public_ref` that would reopen it lived only in React state until this existed. */
  myOpenOrders(): Promise<PaymentOrderOut[]>
  /** The payment page for one ask: the family's OWN open order when it matches, else a
   *  new one. Every card route goes through this — see its implementation for why. */
  orderRefFor(chargeIds: string[], instalments: number, prepayMonths: number): Promise<string>
}

/**
 * The identity of one ask: the charges it settles, the months it buys forward, and how it
 * splits. Two asks with the same key may share one payment order; two with different keys
 * must not — reopening a one-month page for a family who asked for three would charge an
 * amount they did not agree to.
 *
 * **Charge ids are sorted.** A screen builds them oldest-first and the server returns
 * `charge_ids` in its own order; a match that depended on the two happening to agree would
 * work by luck and stop working on a re-order nobody would think to look at.
 *
 * Lives here rather than on a screen because all three card routes key against it, and
 * three spellings of "the same ask" is three chances for one to drift.
 */
export const orderKey = (
  chargeIds: readonly string[],
  forwardMonths: number,
  instalments: number,
): string => `${[...chargeIds].sort().join(',')}|${forwardMonths}|${instalments}`

/**
 * `POST /payment-orders` refused because the family already has an order over these
 * charges that this ask does not match.
 *
 * Thrown rather than returned so a caller cannot forget it: the screen must say something
 * other than its generic failure, because the parent CAN still pay — just not for the
 * amount they have currently selected. `OrderService.create` holds their own pending order
 * for `REPLACE_GRACE_MINUTES`, which is the window in which money may already be moving.
 */
export class OrderConflictError extends Error {
  constructor() {
    super('an open order of this payer already holds these charges')
    this.name = 'OrderConflictError'
  }
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


/* ── The parent's client, moved here 2026-09-08 ───────────────────────────────────────
 *
 * These four lived in `PaymentsSection.tsx` — a SCREEN that `ParentPayments` replaced on
 * 2026-09-07 under the usual "stays on disk until the redesign is accepted" comment. Unlike
 * the shop and profile pair, it was still here a day later, and the reason was not
 * forgetfulness: four of that file's five exports had nothing to do with its screen, and
 * nine files imported them. Deleting the dead half meant moving the live half, which nobody
 * wanted to do inside a feature commit.
 *
 * They belong here. This file is the endpoint layer — `BillingClient`, its wire types and
 * the money helpers — and every one of those nine importers was reaching for exactly that.
 * The note above about there being "deliberately no `makeBillingClient` here any more" was
 * true of the manager-scoped one it named; this is the `/me/`-scoped client the parent app
 * actually ships, and it is now where it says it is.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export class BillingRequestError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'BillingRequestError'
    this.code = code
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code: string | undefined
    try {
      const body: unknown = await response.json()
      const detail = (body as { detail?: unknown } | null)?.detail
      const detailCode = (detail as { code?: unknown } | null)?.code
      if (typeof detailCode === 'string') code = detailCode
    } catch {
      // No JSON body (or already consumed) — code stays undefined, message is all that
      // survives, same as every caller got before this existed.
    }
    throw new BillingRequestError(`${response.status} ${response.url}`, code)
  }
  return (await response.json()) as T
}

/** §19.6's sentinel. See `openOrder` below — it is never a uPay endpoint. */
export const DEMO_SIMULATOR: UpayForm = { action: 'demo:ipn-simulator', fields: {} }

/**
 * §5.10 step 2 — the client builds the POST and auto-submits it. **Fields, not HTML**: the
 * server sends values and this builds the form, so nothing server-authored is ever
 * injected into the document.
 *
 * Exported because §6.1's plan step now opens uPay too (owner correction, 2026-08-30) and
 * a second hand-rolled copy of this is a second place for the hidden-input handling to
 * drift from the one the payments screen uses.
 *
 * `targetName`, added for the in-app payment overlay (2026-09-03 addendum): when given,
 * the form's `target` is set to that name, so the browser navigates a same-named
 * `<iframe>` instead of the top window -- the family never leaves the tab. Omitted, this
 * is the same full-page navigation it has always been.
 */
export function submitUpayForm(form: UpayForm, targetName?: string): void {
  const el = document.createElement('form')
  el.method = 'POST'
  el.action = form.action
  if (targetName) el.target = targetName
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    el.append(input)
  }
  document.body.append(el)
  el.submit()
}

/**
 * The same shape as `makeBillingClient`, against the routes a PAYER may call.
 *
 * The manager-facing reads take `?payer_person_id=`; these take nobody, because the payer
 * is the caller. That is the whole difference, and it is why the screen could not load
 * before: every read it made answered 403.
 */
export function makeParentBillingClient(fetcher: Fetcher): BillingClient {
  // Hoisted out of the object literal because `orderRefFor` calls it: a method reaching
  // for `this` would break the moment a screen destructured the client, and this file is
  // imported by three of them.
  const openOrders = async (): Promise<PaymentOrderOut[]> => {
    // Scoped to the caller by the server; no payer id is sent, for the same reason
    // `createOrder` sends none — a `public_ref` opens a payment page.
    const response = await fetcher('/api/v1/me/payment-orders')
    if (!response.ok) return []
    return (await response.json()).items as PaymentOrderOut[]
  }
  return {
    async openCharges() {
      const response = await fetcher('/api/v1/me/charges?status=open')
      return (await json<{ items: ChargeOut[] }>(response)).items
    },
    async promises() {
      const response = await fetcher('/api/v1/me/payment-promises')
      return (await json<{ items: PaymentPromiseOut[] }>(response)).items
    },
    async createPromise(chargeIds, promiseMethod, prepayMonths, alreadyPaid = false, claimedPlanId) {
      // `method` in the body, not in the path: the two routes are one row and one
      // endpoint, so the server's `PROMISE_METHODS` check is the only place a third
      // method could ever be refused.
      return json<PaymentPromiseOut>(
        await fetcher('/api/v1/me/payment-promises', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            charge_ids: chargeIds,
            method: promiseMethod,
            prepay_months: prepayMonths,
            already_paid: alreadyPaid,
            claimed_plan_id: claimedPlanId ?? null,
          }),
        }),
      )
    },
    async balance() {
      return json<PayerBalanceOut>(await fetcher('/api/v1/me/balance'))
    },
    async payments() {
      return (await json<{ items: PaymentOut[] }>(await fetcher('/api/v1/me/payments'))).items
    },
    async products() {
      // Manager-only, and nothing on `1b` reads it — the catalogue belongs to `3e`. An
      // empty list rather than a 403 the screen would have to know how to survive.
      return []
    },
    async createOrder(chargeIds, maxPayments, prepayMonths = 0) {
      // `max_payments` and `prepay_months` are query parameters and `charge_ids` the body.
      // The payer is never sent: the server takes it from the session, because a
      // body-supplied payer would let anyone open an order over anyone's charges.
      //
      // `prepay_months` is a COUNT. The price of those months is the payer's monthly
      // total, which only the server holds — this screen never posts an amount, and §5.10
      // compares the IPN against the server's own sum for exactly that reason.
      const query = new URLSearchParams({
        max_payments: String(maxPayments),
        prepay_months: String(prepayMonths),
      })
      return json<PaymentOrderOut>(
        await fetcher(`/api/v1/payment-orders?${query.toString()}`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ charge_ids: chargeIds }),
        }),
      )
    },
    async orderForm(publicRef) {
      const response = await fetcher(`/api/v1/payment-orders/${publicRef}/form`)
      if (response.status === 409) {
        // §19.6 — 'upay_form_fields RAISES for a demo studio: it gets no payment form at
        // all, and its payment step renders §19.5's IPN simulator instead.' The backend
        // half of that has always been here; without this branch the screen caught the
        // refusal and rendered a generic error, so the demo studio's payment step was a
        // dead end rather than the simulator the spec describes.
        return DEMO_SIMULATOR
      }
      return json<UpayForm>(response)
    },
    async orderStatus(publicRef) {
      return json<PaymentOrderOut>(await fetcher(`/api/v1/payment-orders/${publicRef}`))
    },
    myOpenOrders: openOrders,
    async orderRefFor(chargeIds, instalments, prepayMonths) {
      // **Ask the server what this family already has, before opening anything new.**
      //
      // `OrderService.create` refuses a charge one of the payer's own pending orders still
      // holds, for `REPLACE_GRACE_MINUTES` — correctly, since uPay's IPN lands about five
      // minutes after a real payment and releasing sooner would offer the same month for a
      // second card payment while money is in flight. So the second attempt after a parent
      // closes the checkout is a 409 unless it reopens the order it already has.
      //
      // Each card route used to remember that `public_ref` itself, in React state
      // (`pendingOrder`) or a ref (`pendingRef`). Both are cleared the moment a form opens
      // and gone entirely when the screen unmounts or the PWA closes — which is exactly the
      // moment a parent walks away from a payment. The server never forgets, so it is asked
      // every time and the local copies are gone.
      const key = orderKey(chargeIds, prepayMonths, instalments)
      const resumable = (await openOrders()).find(
        (order) =>
          // Both carry a server-side default, so the generated client types them optional;
          // an order that names no charges is a forward-only buy, not a reason to skip the
          // comparison.
          orderKey((order.charge_ids ?? []).map(String), order.prepay_months ?? 0, order.max_payments) ===
          key,
      )
      if (resumable) return resumable.public_ref
      const query = new URLSearchParams({
        max_payments: String(instalments),
        prepay_months: String(prepayMonths),
      })
      const response = await fetcher(`/api/v1/payment-orders?${query.toString()}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ charge_ids: chargeIds }),
      })
      // The one refusal a screen must not report as a generic failure: the family has an
      // order open over these charges that this ask does not match, so they can still pay —
      // just not for the amount currently selected.
      if (response.status === 409) throw new OrderConflictError()
      return (await json<PaymentOrderOut>(response)).public_ref
    },
  }
}

