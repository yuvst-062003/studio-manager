// The dashboard's billing endpoints, in one file.
//
// **G2 — every amount crossing this boundary is an integer count of agorot.** Nothing here
// divides by 100. The one place a human types money is `5a`'s price form, and the shekels →
// agorot conversion lives there, next to the input, where a test can see it.
import type { components } from '@studio/api-client'

export type ChargeOut = components['schemas']['ChargeOut']
export type PricePlanOut = components['schemas']['PricePlanOut']
export type ProductOut = components['schemas']['ProductOut']

/**
 * What the items screen and the wizard's step 7 send.
 *
 * `sizes` is a list of labels and its emptiness IS "this item has no sizes" — a חגורה.
 * There is no `hasSizes` here: the toggle on the screen is UI state, and shipping it to
 * the server would create a second field describing one fact.
 */
export type ProductInput = {
  name: string
  priceAgorot: number
  description?: string | null
  sizes: string[]
  isActive?: boolean
}
export type BillingRunOut = components['schemas']['BillingRunOut']
export type UpayIpnRecordOut = components['schemas']['UpayIpnRecordOut']
export type RecurringSubscriptionOut = components['schemas']['RecurringSubscriptionOut']
export type PayerBalanceOut = components['schemas']['PayerBalanceOut']
export type PaymentOut = components['schemas']['PaymentOut']
export type BillingSettingsOut = components['schemas']['BillingSettingsOut']
export type ManagerPlanChangeOut = components['schemas']['ManagerPlanChangeOut']

/**
 * Credit per payer: **payments minus allocations**, the same subtraction
 * `BillingService.payer_credit` makes on the server.
 *
 * Derived here from the payments list the collections screen already reads, rather than
 * asking for one balance per household — a club has tens of families and that would be
 * tens of requests to render one column.
 *
 * A reversed payment is money recorded as never having arrived: its allocations are gone
 * and its amount must not count either, or a bounced cheque reads as credit.
 */
export function creditByPayer(
  payments: readonly {
    payer_person_id: string
    amount_agorot: number
    reversed_at: string | null
    allocations?: readonly { amount_agorot: number }[]
  }[],
): Map<string, number> {
  const credit = new Map<string, number>()
  for (const payment of payments) {
    if (payment.reversed_at !== null) continue
    const allocated = (payment.allocations ?? []).reduce((sum, a) => sum + a.amount_agorot, 0)
    credit.set(
      payment.payer_person_id,
      (credit.get(payment.payer_person_id) ?? 0) + payment.amount_agorot - allocated,
    )
  }
  return credit
}

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type MatchSuggestion = {
  ipn_id: string
  payer_person_id: string
  confidence: number
  amount_agorot: number | null
  card_owner_name: string | null
  four_digits: string | null
}

export type DashboardBillingClient = {
  runBilling(periodYear: number, periodMonth: number): Promise<BillingRunOut>
  recordPayment(input: {
    payerPersonId: string
    amountAgorot: number
    receivedAt: string
    method: 'cash' | 'cheque' | 'bank_transfer' | 'standing_order' | 'credit_adjustment'
    note?: string
  }): Promise<{ allocated: number; unallocatedAgorot: number }>
  unmatched(): Promise<UpayIpnRecordOut[]>
  suggestions(): Promise<{ items: MatchSuggestion[]; never_auto: boolean }>
  confirmMatch(ipnId: string, payerPersonId: string): Promise<void>
  ignoreIpn(ipnId: string): Promise<void>
  pricePlans(): Promise<PricePlanOut[]>
  /** The household drill (2026-08-30): a payer's open charges, labels included — the one
   *  read that shows a parent's shop-order note to a manager. */
  openCharges(payerPersonId: string): Promise<ChargeOut[]>
  payments(): Promise<PaymentOut[]>
  billingSettings(): Promise<BillingSettingsOut>
  saveBillingSettings(patch: Partial<BillingSettingsOut>): Promise<BillingSettingsOut>
  setStandingOrderLink(planId: string, url: string | null): Promise<PricePlanOut>
  closePricePlan(planId: string, closesOn: string, amountAgorot: number): Promise<PricePlanOut>
  createPricePlan(input: {
    name: string
    /** null is open membership — the column's third state, not a missing answer. */
    sessionsPerWeek: number | null
    monthlyAmountAgorot: number
    registrationFeeAgorot: number | null
    activeFrom: string
  }): Promise<PricePlanOut>
  /** `include_inactive` because a retired item is edited back into life on the same
   *  screen — §11.4's shape for a catalogue: retired, never deleted, since charges already
   *  raised for it name it. */
  products(includeInactive?: boolean): Promise<ProductOut[]>
  createProduct(input: ProductInput): Promise<ProductOut>
  /** Partial. Omitting `sizes` leaves them alone; sending `[]` clears them, which is what
   *  "it turned out not to come in sizes" has to be able to save. */
  updateProduct(productId: string, input: Partial<ProductInput>): Promise<ProductOut>
  paymentPromises(status?: string, method?: PromiseMethod): Promise<ManagerPaymentPromiseOut[]>
  planChanges(): Promise<ManagerPlanChangeOut[]>
  settlePlanChange(changeId: string): Promise<void>
  confirmPromise(promiseId: string): Promise<void>
  declinePromise(promiseId: string): Promise<void>
}

/** The two routes a family hands money over by. Mirrors `PROMISE_METHODS` on the server. */
export type PromiseMethod = 'cash' | 'cheque'

/**
 * The manager's view of 'אני אשלם במזומן' / 'אביא צ׳קים' — who, how much, by which route,
 * since when. `method` is a column here rather than two queues, because the two endings
 * are identical: ✓ records the payment over what the charges still owe, ✗ leaves them open.
 */
export type ManagerPaymentPromiseOut = {
  id: string
  status: 'pending' | 'received' | 'declined'
  method: PromiseMethod
  total_agorot: number
  /** Whole months bought forward. Why a 3,600 ₪ promise is 3,600 ₪. */
  prepay_months: number
  payer_person_id: string
  payer_name: string
  charge_count: number
  created_at: string
}

export function makeDashboardBillingClient(fetcher: Fetcher): DashboardBillingClient {
  return {
    async runBilling(periodYear, periodMonth) {
      return json<BillingRunOut>(
        await fetcher('/api/v1/billing-runs', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ period_year: periodYear, period_month: periodMonth }),
        }),
      )
    },
    async recordPayment({ payerPersonId, amountAgorot, receivedAt, method, note }) {
      // **`charge_ids` is empty on purpose** — §5.10's oldest-first allocation is the
      // server's, and a client that chose the charges would be a second implementation of
      // "which months does this money clear".
      const payment = await json<{
        amount_agorot: number
        allocations: { amount_agorot: number }[]
      }>(
        await fetcher('/api/v1/payments', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            payer_person_id: payerPersonId,
            method,
            amount_agorot: amountAgorot,
            received_at: receivedAt,
            charge_ids: [],
            note,
          }),
        }),
      )
      const allocated = payment.allocations.reduce((sum, row) => sum + row.amount_agorot, 0)
      return {
        allocated: payment.allocations.length,
        unallocatedAgorot: payment.amount_agorot - allocated,
      }
    },
    async unmatched() {
      const response = await fetcher('/api/v1/reconciliation/unmatched')
      return (await json<{ items: UpayIpnRecordOut[] }>(response)).items
    },
    async suggestions() {
      return json<{ items: MatchSuggestion[]; never_auto: boolean }>(
        await fetcher('/api/v1/reconciliation/suggestions'),
      )
    },
    async confirmMatch(ipnId, payerPersonId) {
      const response = await fetcher(
        `/api/v1/reconciliation/match?ipn_id=${ipnId}&payer_person_id=${payerPersonId}`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ match_status: 'manual' }) },
      )
      if (!response.ok) throw new Error(`${response.status} ${response.url}`)
    },
    async ignoreIpn(ipnId) {
      const response = await fetcher(`/api/v1/reconciliation/match?ipn_id=${ipnId}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ match_status: 'ignored' }),
      })
      if (!response.ok) throw new Error(`${response.status} ${response.url}`)
    },
    async pricePlans() {
      return (await json<{ items: PricePlanOut[] }>(await fetcher('/api/v1/price-plans'))).items
    },
    /** The household drill (2026-08-30) — a payer's open charges, labels included. The
     *  label is where a parent's shop-order note rides, and this read is the manager's
     *  one way to see it. */
    async openCharges(payerPersonId: string) {
      return (
        await json<{ items: ChargeOut[] }>(
          await fetcher(`/api/v1/charges?payer_person_id=${payerPersonId}&status=open`),
        )
      ).items
    },
    async payments() {
      return (await json<{ items: PaymentOut[] }>(await fetcher('/api/v1/payments'))).items
    },
    async billingSettings() {
      return json<BillingSettingsOut>(await fetcher('/api/v1/billing/settings'))
    },
    // A PARTIAL write. `exclude_unset` on the server is what stops the הגדרות panel's
    // one-field autosave blanking the other settings, and sending a whole object here
    // would defeat it from the client side.
    async saveBillingSettings(patch: Partial<BillingSettingsOut>) {
      return json<BillingSettingsOut>(
        await fetcher('/api/v1/billing/settings', {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(patch),
        }),
      )
    },
    // The ONE in-place edit `price_plan` allows, and it has its own route for that reason:
    // a general `PATCH /price-plans/{id}` would be an invitation to put the amount in it,
    // which is the edit `closePricePlan` exists to prevent. `null` clears the link.
    //
    // The server holds the rules -- https, and a host on the configured allowlist -- so a
    // rejection here is a real answer to render, not a validation this file should
    // duplicate and then disagree with.
    async setStandingOrderLink(planId: string, url: string | null) {
      return json<PricePlanOut>(
        await fetcher(`/api/v1/price-plans/${planId}/standing-order-link`, {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ url }),
        }),
      )
    },
    // The payment-promise decisions (feature pass 2026-08-27): the payer said מזומן or
    // צ׳קים; these are the manager's ✓ and ✗.
    //
    // Both filters go to the SERVER. A `method` filter applied in the browser would mean
    // 'of the rows that happened to load', which is a different answer from the one the
    // manager thinks they asked for.
    async paymentPromises(status?: string, method?: PromiseMethod) {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (method) params.set('method', method)
      const query = params.size > 0 ? `?${params.toString()}` : ''
      return (
        await json<{ items: ManagerPaymentPromiseOut[] }>(
          await fetcher(`/api/v1/payment-promises${query}`),
        )
      ).items
    },
    // §11's queue. Every change lands here and stays until a human closes the money loop:
    // the prepayment design turns the cash and cheque cases into an ordinary open charge,
    // and the standing-order case genuinely needs somebody to cancel the old uPay mandate
    // and send the new link, because G8 says the provider cannot.
    async planChanges() {
      return (await json<{ items: ManagerPlanChangeOut[] }>(await fetcher('/api/v1/plan-changes')))
        .items
    },
    async settlePlanChange(changeId: string) {
      await json(await fetcher(`/api/v1/plan-changes/${changeId}/settle`, { method: 'POST' }))
    },
    async confirmPromise(promiseId: string) {
      await json(await fetcher(`/api/v1/payment-promises/${promiseId}/confirm`, { method: 'POST' }))
    },
    async declinePromise(promiseId: string) {
      await json(await fetcher(`/api/v1/payment-promises/${promiseId}/decline`, { method: 'POST' }))
    },
    async closePricePlan(planId, closesOn, amountAgorot) {
      return json<PricePlanOut>(
        await fetcher(`/api/v1/price-plans/${planId}/close`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            closes_on: closesOn,
            replacement_amount_agorot: amountAgorot,
          }),
        }),
      )
    },
    async createPricePlan(input) {
      return json<PricePlanOut>(
        await fetcher('/api/v1/price-plans', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            name: input.name,
            sessions_per_week: input.sessionsPerWeek,
            monthly_amount_agorot: input.monthlyAmountAgorot,
            registration_fee_agorot: input.registrationFeeAgorot,
            active_from: input.activeFrom,
          }),
        }),
      )
    },
    async products(includeInactive = false) {
      const query = includeInactive ? '?include_inactive=true&limit=200' : '?limit=200'
      return (await json<{ items: ProductOut[] }>(await fetcher(`/api/v1/products${query}`))).items
    },
    async createProduct(input) {
      return json<ProductOut>(
        await fetcher('/api/v1/products', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            name: input.name,
            price_agorot: input.priceAgorot,
            description: input.description ?? null,
            sizes: input.sizes,
          }),
        }),
      )
    },
    async updateProduct(productId, input) {
      // Built key by key rather than dumped: a `sizes: undefined` in the body would be
      // dropped by JSON.stringify, but `is_active: undefined` would not survive a future
      // refactor as reliably, and the server's `exclude_unset` is only as honest as what
      // it is sent.
      const body: Record<string, unknown> = {}
      if (input.name !== undefined) body.name = input.name
      if (input.priceAgorot !== undefined) body.price_agorot = input.priceAgorot
      if (input.description !== undefined) body.description = input.description
      if (input.isActive !== undefined) body.is_active = input.isActive
      if (input.sizes !== undefined) body.sizes = input.sizes
      return json<ProductOut>(
        await fetcher(`/api/v1/products/${productId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      )
    },
  }
}

/**
 * §5.10's ageing buckets: 0–30, 31–60, 60+. `billing.debt.aging.*` names all three and
 * `3e`'s spec records that the artboard shows a per-row chip while the bucket labels exist
 * and nothing uses them. Both can be true — the chip renders the bucket.
 */
export type AgeBucket = '0_30' | '31_60' | '60_plus'

export function ageBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 30) return '0_30'
  if (daysOverdue <= 60) return '31_60'
  return '60_plus'
}

/**
 * §5.10's ladder rung for a charge, from how overdue it is: day 3, day 7, day 14, or none.
 *
 * `3e` finding 4 — `billing.debt.escalation.*` models FOUR rungs and the artboard has ONE
 * undifferentiated reminder button, so a manager cannot see which rung a household is on or
 * advance it. The rung is derived from the same numbers `app/workers/billing.py` escalates
 * on, because two answers to "how overdue is this" is how a screen starts disagreeing with
 * the messages the club actually sent.
 */
export type Rung = 'none' | 'day3' | 'day7' | 'day14'

export function escalationRung(daysOverdue: number): Rung {
  if (daysOverdue >= 14) return 'day14'
  if (daysOverdue >= 7) return 'day7'
  if (daysOverdue >= 3) return 'day3'
  return 'none'
}

/** Whole days between a due date and today. Dates, never times: a charge is due on a day. */
export function daysOverdue(dueDate: string, today: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  return Math.floor((now - due) / 86_400_000)
}
