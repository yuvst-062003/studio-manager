// The dashboard's billing endpoints, in one file.
//
// **G2 — every amount crossing this boundary is an integer count of agorot.** Nothing here
// divides by 100. The one place a human types money is `5a`'s price form, and the shekels →
// agorot conversion lives there, next to the input, where a test can see it.
import type { components } from '@studio/api-client'

export type ChargeOut = components['schemas']['ChargeOut']
export type PricePlanOut = components['schemas']['PricePlanOut']
export type ProductOut = components['schemas']['ProductOut']
export type BillingRunOut = components['schemas']['BillingRunOut']
export type UpayIpnRecordOut = components['schemas']['UpayIpnRecordOut']
export type RecurringSubscriptionOut = components['schemas']['RecurringSubscriptionOut']
export type PayerBalanceOut = components['schemas']['PayerBalanceOut']

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
    method: 'cash' | 'bank_transfer' | 'standing_order' | 'credit_adjustment'
    note?: string
  }): Promise<{ allocated: number; unallocatedAgorot: number }>
  unmatched(): Promise<UpayIpnRecordOut[]>
  suggestions(): Promise<{ items: MatchSuggestion[]; never_auto: boolean }>
  confirmMatch(ipnId: string, payerPersonId: string): Promise<void>
  ignoreIpn(ipnId: string): Promise<void>
  pricePlans(): Promise<PricePlanOut[]>
  closePricePlan(planId: string, closesOn: string, amountAgorot: number): Promise<PricePlanOut>
  createPricePlan(input: {
    name: string
    sessionsPerWeek: number
    monthlyAmountAgorot: number
    registrationFeeAgorot: number | null
    activeFrom: string
  }): Promise<PricePlanOut>
  products(): Promise<ProductOut[]>
  cashRequests(status?: string): Promise<ManagerCashRequestOut[]>
  confirmCash(requestId: string): Promise<void>
  declineCash(requestId: string): Promise<void>
}

/** The manager's view of 'אני אשלם במזומן' — who, how much, since when. */
export type ManagerCashRequestOut = {
  id: string
  status: 'pending' | 'received' | 'declined'
  total_agorot: number
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
    // The cash-request decisions (feature pass 2026-08-27): the payer said 'מזומן';
    // these are the manager's ✓ and ✗.
    async cashRequests(status?: string) {
      const query = status ? `?status=${status}` : ''
      return (
        await json<{ items: ManagerCashRequestOut[] }>(await fetcher(`/api/v1/cash-requests${query}`))
      ).items
    },
    async confirmCash(requestId: string) {
      await json(await fetcher(`/api/v1/cash-requests/${requestId}/confirm`, { method: 'POST' }))
    },
    async declineCash(requestId: string) {
      await json(await fetcher(`/api/v1/cash-requests/${requestId}/decline`, { method: 'POST' }))
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
    async products() {
      return (await json<{ items: ProductOut[] }>(await fetcher('/api/v1/products'))).items
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
