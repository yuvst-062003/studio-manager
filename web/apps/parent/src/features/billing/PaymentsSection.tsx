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
  const [loaded, setLoaded] = useState(false)
  // Bumped to re-read after an order opens. A counter rather than calling the loader
  // directly, so there is exactly one place that writes `debts` — `react-hooks`'
  // set-state-in-effect rule is pointing at a real hazard here, since a second writer
  // racing the first would leave the screen showing a list nobody asked for.
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const charges = await client.openCharges('')
      if (!alive) return
      setDebts(
        charges.map((charge) => ({
          charge,
          // The child's own name needs `GET /students/{id}`, which is manager-only. §5.10
          // renders the period and the child beside each other, so until a payer-facing
          // read exists this is the period alone rather than a name this app cannot fetch.
          studentName: '',
          beltColorHex: null,
          // §5.10's primary double-payment guard is enforced by the server, which refuses
          // a second order over a covered charge with a 409. It cannot be drawn here:
          // `ChargeOut` carries no field saying a charge already sits inside an open
          // order, so the screen has nothing to read. See HB-e2e-parent-billing-api.
          coveredElsewhere: false,
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
      // Manager-only reads (`GET /recurring-subscriptions`, `GET /billing/settings`), so
      // the screen degrades to "no warning, no link, default instructions" rather than
      // showing a parent a 403. §5.10's warning is a nicety; its absence blocks nothing.
      hasActiveSubscription={false}
      standingOrderLink={null}
      cashInstructions={null}
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
