// The second half of the money tab: what a family still owes, and the act of taking notes
// for it at the door. `promiseClient.ts` is the first half — a parent's request waiting for
// a manager to say the money arrived — and this file deliberately does not touch it.
//
// MANAGER-ONLY BY ROUTE. Every path here is `ManagerOrOwner` on the server, and SPEC §13's
// third invariant is why it can never be widened to a coach: financial fields do not travel
// on coach-scoped endpoints. `StaffTabBar` draws no cash tab for them either, so the two
// rules agree rather than one catching what the other let through.
import { apiFetch } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** One open line of what a family owes. Mirrors `app/schemas/billing.py::ChargeOut`,
 *  narrowed to what a door conversation needs.
 *
 *  `allocated_agorot` travels with every row because §4.3 settles a charge by summing its
 *  allocations — a screen rendering `amount_agorot` alone shows a part-paid charge as if
 *  nothing had been paid. */
export type OpenCharge = {
  id: string
  payer_person_id: string
  student_id: string | null
  kind: string
  period_year: number | null
  period_month: number | null
  amount_agorot: number
  allocated_agorot: number
  /** The catalogue item this charge paid for, or null for tuition and manual charges —
   *  what lets the sheet call a judogi a judogi instead of "charge". */
  product_id?: string | null
  due_date: string
  status: string
}

/** A payment as the month's total reads it. The tab shows one number — what has come in as
 *  cash and cheques this month — and that is a sum of rows, not a new endpoint. */
export type RecordedPayment = {
  id: string
  payer_person_id: string
  method: string
  amount_agorot: number
  received_at: string
}

/** How one child pays, from the manager-only `GET /payment-methods`. Not from
 *  `GET /students`: that list is coach-reachable and SPEC §13's third invariant keeps every
 *  financial field off it — the first attempt put it there and the invariant refused it. */
export type StudentMethod = {
  student_id: string
  student_name: string
  method: string | null
}

export type CashClient = {
  /** Every open charge in the club. Paged through to the end: a club is tens of families,
   *  and a manager at a door needs the family in front of them to be on the list. */
  openCharges(): Promise<OpenCharge[]>
  /** The studio's payments, newest first, for this month's total. */
  payments(): Promise<RecordedPayment[]>
  /** How each child pays. With a payer, only that family's children — which is what the
   *  family sheet needs to group a family's charges by child. Without one, the whole club,
   *  which is what `רישום מרוכז` needs to pre-tick everybody on a method. */
  methods(payerPersonId?: string): Promise<StudentMethod[]>
  /** §5.10's manual payment — the same act as a bank transfer or a הוראת קבע marked by
   *  hand, which our provider cannot create and the app has always recorded this way.
   *  Naming the charges allocates to exactly those. */
  recordCash(input: {
    payerPersonId: string
    amountAgorot: number
    chargeIds: string[]
    receivedAt: string
    method?: 'cash' | 'cheque' | 'standing_order'
    /** Idempotency key. A batch retried after a half-finished run must not pay twice for
     *  the families that already went through. */
    key?: string
  }): Promise<void>
}

const PAGE = 200
const MAX_PAGES = 25

async function readAll<T>(fetcher: Fetcher, base: string): Promise<T[]> {
  const items: T[] = []
  let after: string | null = null
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = after ? `${base}&after=${encodeURIComponent(after)}` : base
    const response = await fetcher(url)
    if (!response.ok) throw new Error(String(response.status))
    const body = (await response.json()) as { items: T[]; next_cursor: string | null }
    items.push(...body.items)
    const next = body.next_cursor ?? null
    // A cursor that repeats is a server bug, and following it is an infinite loop on a
    // screen somebody is standing at a door holding money in front of.
    if (next === null || seen.has(next)) break
    seen.add(next)
    after = next
  }
  return items
}

export function makeCashClient(fetcher: Fetcher = apiFetch): CashClient {
  return {
    openCharges: () => readAll<OpenCharge>(fetcher, `/api/v1/charges?status=open&limit=${PAGE}`),
    payments: () => readAll<RecordedPayment>(fetcher, `/api/v1/payments?limit=${PAGE}`),
    async methods(payerPersonId) {
      const url = payerPersonId
        ? `/api/v1/payment-methods?payer_person_id=${encodeURIComponent(payerPersonId)}`
        : '/api/v1/payment-methods'
      const response = await fetcher(url)
      if (!response.ok) throw new Error(String(response.status))
      return ((await response.json()) as { items: StudentMethod[] }).items
    },
    async recordCash({ payerPersonId, amountAgorot, chargeIds, receivedAt, method = 'cash', key }) {
      const response = await fetcher('/api/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: JSON.stringify({
          payer_person_id: payerPersonId,
          method,
          amount_agorot: amountAgorot,
          received_at: receivedAt,
          charge_ids: chargeIds,
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
    },
  }
}
