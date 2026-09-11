// תשלומים, composed — the container for `PayScreen`, and the rebuild of 2026-09-07.
//
// **Nothing here is a third payment path.** `createOrder`/`orderForm` → `PaymentOverlay`
// is the pair `ClubShop` already opens uPay with, and `createPromise` is the same call
// that raises a cash promise and notifies the managers. Both take charge ids and nothing
// else, which is why one screen can offer both without inventing a route of its own — and
// why this file reaches for `makeParentBillingClient` rather than writing a fetch.
//
// **The reads are the screen's whole vocabulary**, and each one answers a question the
// screen actually asks:
//
//   /me/charges?status=open   what is owed, and which of it another payment holds
//   /me/students              whose month it is — without it every row said only "09/2026"
//   /me/prepay-terms          the club's cash block, and this payer's monthly price
//   /me/balance               the credit behind "שולם מראש"
//   /me/payments              the one line under התשלום האחרון
//   /me/payment-promises      whether a cash request is already with the manager
//   /me/standing-order        §5.10's warning — a warning, never a block
//
// `/me/standing-order-links` is deliberately NOT here: the mandate links moved to
// פרופיל → תשלומים with the route itself.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, formatAgorot, formatDateInStudioZone, formatMonthLabel, useRefreshSignal } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DEMO_SIMULATOR, OrderConflictError, makeParentBillingClient } from '../billingClient'
import { PaymentOverlay } from '../PaymentOverlay'
import type { PaymentOverlayRequest } from '../PaymentOverlay'
import { methodKey } from '../PaymentHistoryScreen'
import type { ChargeOut, PaymentOrderOut, PaymentOut, PaymentPromiseOut } from '../billingClient'
import { PayScreen } from './PayScreen'
import type { LastPayment } from './PayScreen'
import { settledFor } from './pay'
import type { Ask, DebtRow, PayTerms } from './pay'

type WireTerms = {
  cash_prepay_months: number
  cheque_prepay_months: number
  monthly_total_agorot: number
}

type StudentRow = { id: string; first_name: string; last_name: string }

const NO_TERMS: PayTerms = { cashMonths: 0, monthlyTotalAgorot: 0 }

export function ParentPayments({ locale }: { locale: Locale }) {
  const billing = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [debts, setDebts] = useState<readonly DebtRow[] | null>(null)
  const [terms, setTerms] = useState<PayTerms>(NO_TERMS)
  const [creditAgorot, setCreditAgorot] = useState(0)
  const [lastPayment, setLastPayment] = useState<LastPayment | null>(null)
  const [promises, setPromises] = useState<readonly PaymentPromiseOut[]>([])
  const [standingOrder, setStandingOrder] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<PaymentOverlayRequest | null>(null)
  // Bumped to re-read after a payment route is taken. A counter rather than calling the
  // loader directly, so there is exactly one writer for `debts` — two racing writers
  // would leave the screen showing a list nobody asked for.
  const [reloads, setReloads] = useState(0)
  // Pull-to-refresh re-reads in place instead of reloading the document (2026-09-08). It
  // joins the dependency array the loader already has, so this read cannot end up
  // half-subscribed — and the loader never blanks `debts` first, so the screen stays on
  // screen under the spinner instead of flashing back to its skeleton.
  const refreshSignal = useRefreshSignal()
  /**
   * The family's own `pending` payment orders, read WITH the charges rather than when the
   * pay button is pressed.
   *
   * It has to be this read and not a later one, because it decides what the screen counts
   * as payable. Inside `REPLACE_GRACE_MINUTES` the server reports a charge one of these
   * orders holds as `is_covered_elsewhere` — correctly, since `create` would refuse a
   * SECOND order over it — and `payable()` used to drop the row on that alone. The ask then
   * named no charge at all and the card branch turned the month chip into a month bought
   * FORWARD: the parent pressed the same button and paid ₪250 for October instead of
   * ₪208.33 for September, which is not the payment they asked for and left September open.
   *
   * `orderRefFor` reopens the order rather than creating a second one, so a charge one of
   * these holds is not covered — it is resumable, and the two are not the same word.
   */
  const [openOrders, setOpenOrders] = useState<readonly PaymentOrderOut[]>([])
  /** The order the conflict copy offers to reopen. Set only when `orderRefFor` refuses. */
  const [conflictRef, setConflictRef] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const [charges, children, wireTerms, balance, payments, promiseRows, mandate, mine] =
          await Promise.all([
            billing.openCharges(''),
            apiFetch('/api/v1/me/students')
              .then((r) => (r.ok ? (r.json() as Promise<{ items: StudentRow[] }>) : { items: [] }))
              .catch(() => ({ items: [] as StudentRow[] })),
            // A wrong number about money is worse than an error: a failed terms read used
            // to become zeroes, and the screen then priced a forward month at nothing.
            apiFetch('/api/v1/me/prepay-terms').then((r) => {
              if (!r.ok) throw new Error(String(r.status))
              return r.json() as Promise<WireTerms>
            }),
            // Same rule — credit is money, and 0-on-failure is a lie about it.
            billing.balance(''),
            billing.payments('').catch(() => [] as PaymentOut[]),
            billing.promises().catch(() => [] as PaymentPromiseOut[]),
            apiFetch('/api/v1/me/standing-order')
              .then((r) => (r.ok ? (r.json() as Promise<{ active: boolean }>) : { active: false }))
              .catch(() => ({ active: false })),
            // Empty on failure is the safe direction here, and the only one: it makes a
            // charge read as covered rather than payable, so the worst case is the screen
            // greying out a row the parent could have resumed — never one it opens a
            // second payment page over.
            billing.myOpenOrders().catch(() => [] as PaymentOrderOut[]),
          ])
        if (!live) return
        const nameOf = new Map(
          children.items.map((child) => [child.id, `${child.first_name} ${child.last_name}`]),
        )
        setOpenOrders(mine)
        // Which charges one of the family's OWN pending orders holds. `/me/payment-orders`
        // returns only `pending` and only the caller's, so a charge held by a `paid` or
        // `amount_mismatch` order — the two claims a parent genuinely cannot take back —
        // never appears here and stays greyed out.
        const resumable = new Set(mine.flatMap((order) => (order.charge_ids ?? []).map(String)))
        setDebts(
          charges.map((charge: ChargeOut) => ({
            charge,
            studentName: charge.student_id ? (nameOf.get(charge.student_id) ?? '') : '',
            // `is_covered_elsewhere` answers "would `create` refuse a second order over
            // this?" and answers it correctly. It is not the same question as "can this
            // family pay this now": their own open order is a page to REOPEN, and reading
            // the server's flag as a block is what made the button quietly buy next month.
            coveredElsewhere: charge.is_covered_elsewhere && !resumable.has(charge.id),
          })),
        )
        setTerms({
          cashMonths: wireTerms.cash_prepay_months,
          monthlyTotalAgorot: wireTerms.monthly_total_agorot,
        })
        setCreditAgorot(balance.credit_agorot)
        setPromises(promiseRows)
        setStandingOrder(mandate.active)
        // The newest payment that still stands. A reversed one is not the last payment —
        // showing it would tell a family money arrived that the club has since undone.
        const standing = payments
          .filter((row) => row.reversed_at === null)
          .sort((a, b) => b.received_at.localeCompare(a.received_at))
        const newest = standing[0]
        setLastPayment(
          newest
            ? {
                amountAgorot: newest.amount_agorot,
                receivedAt: newest.received_at,
                methodKey: methodKey(newest.method),
              }
            : null,
        )
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [billing, reloads, refreshSignal])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  // A live cash request, and only over charges: a plan CLAIM from the plan picker names no
  // charge and must not lock this route — a family whose claim waits with the manager can
  // still settle open months in cash.
  const pendingCash =
    promises.find(
      (row) => row.status === 'pending' && row.claimed_plan_id === null && row.method === 'cash',
    ) ?? null
  const declinedCash =
    !pendingCash &&
    (promises.find((row) => row.method === 'cash' && row.decided_at !== null)?.status ===
      'declined')

  const pay = useCallback(
    async (ask: Ask) => {
      if (busy) return
      setBusy(true)
      setError(null)
      setConflictRef(null)
      try {
        if (ask.method === 'cash') {
          // `alreadyPaid: false` explicitly — this is "I will pay", not "I already did",
          // and the two are different claims to a manager.
          await billing.createPromise([...ask.chargeIds], 'cash', ask.forwardMonths, false)
          refresh()
          return
        }
        // Bug #16 — the split reaches uPay as `max_payments`, the parameter
        // `app/routers/payments.py` has taken since M6 and which the rebuild hardcoded to
        // 1. It is part of the reuse KEY as well: an order opened for one payment and then
        // handed back for three would put the parent on a uPay page for terms they did not
        // pick, which is the same failure the month count is already keyed against.
        //
        // The whole of "which page do we open" is `orderRefFor`'s, and it asks the SERVER.
        // This screen used to hold the last `public_ref` in state so a failed form fetch
        // could retry against it — but that state is cleared the moment a form opens and
        // dies with the screen, which is exactly when a parent walks away from a checkout.
        const publicRef = await billing.orderRefFor(
          [...ask.chargeIds],
          ask.instalments,
          ask.forwardMonths,
        )
        const form = await billing.orderForm(publicRef)
        if (form.action === DEMO_SIMULATOR.action) {
          // §19.6 — no live form exists in this deployment by design. The order is open
          // and the IPN is what settles it.
          refresh()
          return
        }
        // What this payment settles, captured HERE rather than read back from the order:
        // `debts` carries the child's name and the charge's own note, and the order row
        // carries neither.
        setOverlay({
          kind: 'checkout',
          form,
          publicRef,
          settled: settledFor([...ask.chargeIds], debts ?? []),
        })
      } catch (thrown) {
        if (thrown instanceof OrderConflictError) {
          // Not a failure the family can retry their way out of, and not one to report as
          // "something went wrong": they have a payment page open over these charges for a
          // DIFFERENT ask — one month started, three months now selected — and `create`
          // holds it for `REPLACE_GRACE_MINUTES` because uPay's IPN lands about five
          // minutes after a real payment. Reopening it anyway would charge an amount they
          // did not pick, so the copy names the situation and offers the page they have.
          setConflictRef(
            openOrders.find((order) =>
              (order.charge_ids ?? []).some((id) => ask.chargeIds.includes(String(id))),
            )?.public_ref ?? null,
          )
          setError(t(locale, 'billing.pay.orderAlreadyOpen'))
        } else {
          setError(t(locale, 'billing.pay.failed'))
        }
      } finally {
        setBusy(false)
      }
    },
    // `debts` is read to build the settlement line. Without it here the line would be
    // assembled from whatever this callback closed over on its first render — which for a
    // family whose debts reloaded mid-session names the wrong month.
    [billing, busy, debts, locale, openOrders, refresh],
  )

  /** Open the page the family already has, at the amount it was opened for. */
  const resumeOpenOrder = useCallback(async () => {
    if (conflictRef === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const form = await billing.orderForm(conflictRef)
      if (form.action === DEMO_SIMULATOR.action) {
        refresh()
        return
      }
      setConflictRef(null)
      setOverlay({ kind: 'checkout', form, publicRef: conflictRef })
    } catch {
      setError(t(locale, 'billing.pay.failed'))
    } finally {
      setBusy(false)
    }
  }, [billing, busy, conflictRef, locale, refresh])

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
  if (debts === null) {
    // §7.9 — this gate wraps the whole tab, so a bare `null` here is not a blank section,
    // it is a blank screen for as long as the first read takes.
    return <p data-testid="pay-loading">{t(locale, 'common.setup.loading')}</p>
  }

  return (
    <section aria-label={t(locale, 'billing.pay.title')} data-testid="parent-payments">
      <PayScreen
        locale={locale}
        debts={debts}
        terms={terms}
        creditAgorot={creditAgorot}
        lastPayment={lastPayment}
        hasActiveSubscription={standingOrder}
        pendingCashAgorot={pendingCash ? pendingCash.total_agorot : null}
        cashDeclined={declinedCash}
        busy={busy}
        error={error}
        money={(agorot) => formatAgorot(agorot)}
        dateLabel={(iso) => formatDateInStudioZone(iso, locale)}
        monthLabel={(year, month) => formatMonthLabel(year, month, locale)}
        onPay={pay}
        onResumeOpenOrder={conflictRef === null ? undefined : () => void resumeOpenOrder()}
        onOpenHistory={() => {
          globalThis.location.hash = '#/payments/history'
        }}
      />

      {overlay ? (
        <PaymentOverlay
          locale={locale}
          onClose={() => {
            // `refresh()` on the X too, not only on completion. A bit payer whose frame
            // never closed itself used to shut it and find their debt unchanged on the
            // screen behind -- for a charge that was already settled. The obvious next
            // thing a parent does with an unchanged debt is pay it again.
            setOverlay(null)
            refresh()
          }}
          onComplete={() => {
            setOverlay(null)
            refresh()
          }}
          orderStatus={billing.orderStatus}
          request={overlay}
        />
      ) : null}
    </section>
  )
}
