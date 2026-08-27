// The container for `1b`/`12f`, and the reason `PaymentsScreen` was unreachable until now.
//
// **Why this file exists rather than an edit to `billingClient.ts`.** `PaymentsScreen` is
// presentational: it takes its `client`, its `debts` and its callbacks as props. That is
// what lets this lane mount it without reopening a screen it does not own — the client
// below satisfies the same `BillingClient` type, against the `/me/` routes a parent can
// actually call. When lane MONEY updates `billingClient.ts` to those routes, this file
// collapses to `makeBillingClient(apiFetch)` and nothing else here changes.
//
// **§5.10 — all three routes are always visible**, and the standing-order warning is a
// warning rather than a block. Both live in the screen; this file only feeds it.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { PaymentsScreen } from './PaymentsScreen'
import type { DebtRow } from './PaymentsScreen'
import type {
  BillingClient,
  CashRequestOut,
  ChargeOut,
  PayerBalanceOut,
  PaymentOrderOut,
  PaymentOut,
  UpayForm,
} from './billingClient'

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/** §19.6's sentinel. See `openOrder` below — it is never a uPay endpoint. */
export const DEMO_SIMULATOR: UpayForm = { action: 'demo:ipn-simulator', fields: {} }

/**
 * The same shape as `makeBillingClient`, against the routes a PAYER may call.
 *
 * The manager-facing reads take `?payer_person_id=`; these take nobody, because the payer
 * is the caller. That is the whole difference, and it is why the screen could not load
 * before: every read it made answered 403.
 */
export function makeParentBillingClient(fetcher: Fetcher): BillingClient {
  return {
    async openCharges() {
      const response = await fetcher('/api/v1/me/charges?status=open')
      return (await json<{ items: ChargeOut[] }>(response)).items
    },
    async cashRequests() {
      const response = await fetcher('/api/v1/me/cash-requests')
      return (await json<{ items: CashRequestOut[] }>(response)).items
    },
    async requestCash(chargeIds) {
      return json<CashRequestOut>(
        await fetcher('/api/v1/me/cash-requests', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ charge_ids: chargeIds }),
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
    async createOrder(chargeIds, maxPayments) {
      // `max_payments` is a query parameter and `charge_ids` the body. The payer is never
      // sent: the server takes it from the session, because a body-supplied payer would
      // let anyone open an order over anyone's charges.
      return json<PaymentOrderOut>(
        await fetcher(`/api/v1/payment-orders?max_payments=${maxPayments}`, {
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
  }
}

export function PaymentsSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [debts, setDebts] = useState<readonly DebtRow[]>([])
  const [standingOrder, setStandingOrder] = useState(false)
  const [cashRequests, setCashRequests] = useState<readonly CashRequestOut[]>([])
  const [loaded, setLoaded] = useState(false)
  // Bumped to re-read after an order opens. A counter rather than calling the loader
  // directly, so there is exactly one place that writes `debts` — `react-hooks`'
  // set-state-in-effect rule is pointing at a real hazard here, since a second writer
  // racing the first would leave the screen showing a list nobody asked for.
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [charges, cash, mandate, children] = await Promise.all([
        client.openCharges(''),
        // The payer's own cash requests, beside the charges: a pending one badges its
        // rows and swaps the cash card's button for a status; a declined one is said
        // out loud rather than left to be inferred from silence.
        client.cashRequests().catch(() => [] as CashRequestOut[]),
        // §5.10's second guard, asked of the person it is a guard for. One request beside
        // the charges rather than after them: the warning has to be on screen the first
        // time the card route is, or it is a warning nobody sees before deciding.
        apiFetch('/api/v1/me/standing-order')
          .then((r) => (r.ok ? (r.json() as Promise<{ active: boolean }>) : { active: false }))
          .catch(() => ({ active: false })),
        // §5.10 renders the period and the CHILD beside each other, and `/me/students` is
        // the payer-facing read that makes the second half possible. Without it every row
        // said only "08/2026", so a two-child family could not tell whose month was whose.
        apiFetch('/api/v1/me/students')
          .then((r) =>
            r.ok
              ? (r.json() as Promise<{ items: { id: string; first_name: string; last_name: string }[] }>)
              : { items: [] },
          )
          .catch(() => ({ items: [] as { id: string; first_name: string; last_name: string }[] })),
      ])
      const nameOf = new Map(
        children.items.map((child) => [child.id, `${child.first_name} ${child.last_name}`]),
      )
      if (!alive) return
      setStandingOrder(mandate.active)
      setCashRequests(cash)
      setDebts(
        charges.map((charge) => ({
          charge,
          studentName: charge.student_id ? (nameOf.get(charge.student_id) ?? '') : '',
          beltColorHex: null,
          // §5.10's primary double-payment guard, now drawn rather than only enforced. The
          // server has always refused a second order over a covered charge with a 409; what
          // it could not do was explain, so a parent who opened an order on another device
          // tapped a live-looking row and got common.error.generic. `is_covered_elsewhere`
          // is computed from the same predicate as the refusal, so a row this screen greys
          // out is exactly a row the server would decline. Closes HB-e2e-parent-billing-api.
          coveredElsewhere: charge.is_covered_elsewhere,
        })),
      )
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [client, reloads])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  if (!loaded) return null

  return (
    <PaymentsScreen
      locale={locale}
      client={client}
      debts={debts}
      hasActiveSubscription={standingOrder}
      // `GET /billing/settings` is manager-only, so the shared uPay mandate link and the
      // studio's own cash instructions have no payer-facing source yet. The screen falls
      // back to the default copy rather than showing a parent a 403; neither blocks a
      // payment, unlike the three reads that used to.
      standingOrderLink={null}
      cashInstructions={null}
      cashRequests={cashRequests}
      onCashRequest={async (chargeIds) => {
        await client.requestCash(chargeIds)
        refresh()
      }}
      onOrderOpened={(form) => {
        if (form.action === DEMO_SIMULATOR.action) {
          // Nothing to submit: no live form exists here by design. The order is open and
          // the IPN is what settles it, which is exactly §5.10 step 5's point.
          refresh()
          return
        }
        // §5.10 step 2 — the client builds the POST and auto-submits it. Fields, not HTML.
        const el = document.createElement('form')
        el.method = 'POST'
        el.action = form.action
        for (const [name, value] of Object.entries(form.fields)) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = name
          input.value = value
          el.append(input)
        }
        document.body.append(el)
        el.submit()
      }}
      onOpenHistory={() => {
        globalThis.location.hash = '#/payments/history'
      }}
    />
  )
}
