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
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentOverlay } from './PaymentOverlay'
import type { PaymentOverlayRequest } from './PaymentOverlay'
import { PaymentsScreen } from './PaymentsScreen'
import type { DebtRow, PrepayTerms, StandingOrderLink } from './PaymentsScreen'
import type {
  BillingClient,
  ChargeOut,
  PaymentPromiseOut,
  PayerBalanceOut,
  PaymentOrderOut,
  PaymentOut,
  UpayForm,
} from './billingClient'

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** `GET /me/standing-order-links` on the wire. Snake case here, camel at the screen. */
type WireLink = { student_name: string; plan_name: string; amount_agorot: number; url: string }

/** `GET /me/prepay-terms`. Zeroes when the read fails, which is the settle-open-charges
 *  behaviour cash had before prepayment existed — a card that cannot price a forward term
 *  must not offer one. */
type WireTerms = {
  cash_prepay_months: number
  cheque_prepay_months: number
  monthly_total_agorot: number
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * F15, cause 2's proper fix. `json()` used to discard a non-ok response body entirely —
 * `Error(\`${status} ${url}\`)` and nothing else — so a caller that wanted to tell one
 * failure apart from another had nothing to read except the message string. That pushed
 * an earlier attempt at this into regex-matching `/^503\b/` on the message, which is a
 * private detail of THIS module (the exact wording) standing in for the thing that
 * actually varies (the server's `detail.code`) — a reformat of the message would silently
 * break the check while every test kept passing.
 *
 * `code` carries `detail.code` when the body has one (every structured error this API
 * sends, e.g. `merchant_account_unconfigured` — `app/routers/payments.py`). It is
 * `undefined` for anything else: a network failure that never reached `json()`, a body
 * that is not JSON, or a body with no `detail.code` — those callers still only have the
 * message, exactly as before this existed.
 */
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
  }
}

export function PaymentsSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [debts, setDebts] = useState<readonly DebtRow[]>([])
  const [standingOrder, setStandingOrder] = useState(false)
  const [promises, setPromises] = useState<readonly PaymentPromiseOut[]>([])
  const [standingOrderLinks, setStandingOrderLinks] = useState<readonly StandingOrderLink[]>([])
  const [prepayTerms, setPrepayTerms] = useState<PrepayTerms>({
    cashMonths: 0,
    chequeMonths: 0,
    monthlyTotalAgorot: 0,
  })
  const [creditAgorot, setCreditAgorot] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // Bumped to re-read after an order opens. A counter rather than calling the loader
  // directly, so there is exactly one place that writes `debts` — `react-hooks`'
  // set-state-in-effect rule is pointing at a real hazard here, since a second writer
  // racing the first would leave the screen showing a list nobody asked for.
  const [reloads, setReloads] = useState(0)
  const [failed, setFailed] = useState(false)
  // The in-app payment overlay's current request, or none. 2026-09-03 addendum: a real
  // (non-demo) card order opens here instead of navigating the tab away, the same
  // change PaymentSetup.tsx's join-wizard card button already got.
  const [overlay, setOverlay] = useState<PaymentOverlayRequest | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
      const [charges, promiseRows, mandate, children, links, terms, balance] = await Promise.all([
        client.openCharges(''),
        // The payer's own promises, both routes, beside the charges: a pending one badges
        // its rows and swaps its card's button for a status; a declined one is said out
        // loud rather than left to be inferred from silence.
        client.promises().catch(() => [] as PaymentPromiseOut[]),
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
        // Payment-routes §6/§7 -- the הוראת קבע links for THIS payer's own children, read
        // LIVE on every visit to the screen. Deliberately not part of any precache or
        // offline bootstrap: a stale roster is an inconvenience, a stale payment link
        // sends a family to sign a mandate at the wrong amount and nobody finds out until
        // the reconciliation queue disagrees months later. `vite.config.ts` declares no
        // `runtimeCaching`, and ParentBilling.test.tsx asserts that at the source.
        apiFetch('/api/v1/me/standing-order-links')
          .then((r) => (r.ok ? (r.json() as Promise<{ items: WireLink[] }>) : { items: [] }))
          .catch(() => ({ items: [] as WireLink[] })),
        // The club's own prepayment rules and this payer's monthly price. Read here rather
        // than computed in the screen: `months x monthly` is integer arithmetic on money
        // (G2), and the server is the one place that knows both numbers.
        // P8's named silent degradation, closed: a failed terms read used to become
        // NO_TERMS, so the "paid ahead" line computed against a real-looking zero. A
        // wrong number about money is worse than an error — the read now fails the
        // screen into LoadFailed instead of into data.
        apiFetch('/api/v1/me/prepay-terms').then((r) => {
          if (!r.ok) throw new Error(String(r.status))
          return r.json() as Promise<WireTerms>
        }),
        // `credit_agorot` beside `balance_agorot`, never merged: the "paid ahead" line is
        // derived from it and the monthly price, so a plan change re-answers it with
        // nothing stored to become wrong.
        // Same rule: credit is money, and 0-on-failure is a lie about it.
        client.balance(''),
      ])
      const nameOf = new Map(
        children.items.map((child) => [child.id, `${child.first_name} ${child.last_name}`]),
      )
      if (!alive) return
      setStandingOrder(mandate.active)
      setPromises(promiseRows)
      setPrepayTerms({
        cashMonths: terms.cash_prepay_months,
        chequeMonths: terms.cheque_prepay_months,
        monthlyTotalAgorot: terms.monthly_total_agorot,
      })
      setCreditAgorot(balance.credit_agorot)
      setStandingOrderLinks(
        links.items.map((link) => ({
          studentName: link.student_name,
          planName: link.plan_name,
          amountAgorot: link.amount_agorot,
          url: link.url,
        })),
      )
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
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [client, reloads])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          refresh()
        }}
      />
    )
  }
  if (!loaded) {
    // §7.9 -- this gate wraps the whole app, so a bare `null` here was not a blank
    // section, it was a blank screen for as long as the first read took.
    return <p data-testid="payments-section-loading">{t(locale, 'common.setup.loading')}</p>
  }

  return (
    <>
      <PaymentsScreen
        locale={locale}
        client={client}
        debts={debts}
        hasActiveSubscription={standingOrder}
        standingOrderLinks={standingOrderLinks}
        prepayTerms={prepayTerms}
        creditAgorot={creditAgorot}
        // `GET /billing/settings` is manager-only, so the studio's own cash instructions
        // still have no payer-facing source. The screen falls back to the default copy
        // rather than showing a parent a 403. The standing-order link no longer falls back
        // to anything: it has a source of its own now, one per plan, per §13's refusal to
        // have a single studio-wide link at one amount.
        cashInstructions={null}
        promises={promises}
        onPaymentPromise={async (chargeIds, promiseMethod, prepayMonths) => {
          await client.createPromise(chargeIds, promiseMethod, prepayMonths)
          refresh()
        }}
        onOrderOpened={(form) => {
          if (form.action === DEMO_SIMULATOR.action) {
            // Nothing to submit: no live form exists here by design. The order is open and
            // the IPN is what settles it, which is exactly §5.10 step 5's point.
            refresh()
            return
          }
          setOverlay({ kind: 'checkout', form })
        }}
        onOpenHistory={() => {
          globalThis.location.hash = '#/payments/history'
        }}
      />
      {overlay ? (
        <PaymentOverlay
          locale={locale}
          onClose={() => setOverlay(null)}
          onComplete={() => {
            setOverlay(null)
            refresh()
          }}
          request={overlay}
        />
      ) : null}
    </>
  )
}
