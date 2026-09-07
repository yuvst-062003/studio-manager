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
import { apiFetch, formatAgorot, formatDateInStudioZone, formatMonthLabel } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DEMO_SIMULATOR, makeParentBillingClient } from '../PaymentsSection'
import { PaymentOverlay } from '../PaymentOverlay'
import type { PaymentOverlayRequest } from '../PaymentOverlay'
import { methodKey } from '../PaymentHistoryScreen'
import type { ChargeOut, PaymentOut, PaymentPromiseOut } from '../billingClient'
import { PayScreen } from './PayScreen'
import type { LastPayment } from './PayScreen'
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
  /**
   * A card order opened but not yet handed to the overlay, and the ask it was opened for.
   *
   * If the FORM fetch is what failed, the order still exists — so a retry that called
   * `createOrder` again used to 409 on charges its own first attempt had claimed, and the
   * parent could neither pay nor cancel. Reused only for the SAME ask: a different month
   * count means the family wants a different order, not the stuck one, and reusing it
   * there would open a payment page for the wrong amount.
   */
  const [pendingOrder, setPendingOrder] = useState<{ publicRef: string; key: string } | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const [charges, children, wireTerms, balance, payments, promiseRows, mandate] =
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
          ])
        if (!live) return
        const nameOf = new Map(
          children.items.map((child) => [child.id, `${child.first_name} ${child.last_name}`]),
        )
        setDebts(
          charges.map((charge: ChargeOut) => ({
            charge,
            studentName: charge.student_id ? (nameOf.get(charge.student_id) ?? '') : '',
            // Computed by the server from exactly the predicate its own refusal uses, so a
            // row this screen greys out is a row the server would decline. Since
            // 2026-09-07 that no longer includes the payer's OWN abandoned order.
            coveredElsewhere: charge.is_covered_elsewhere,
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
  }, [billing, reloads])

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
        const key = `${ask.chargeIds.join(',')}|${ask.forwardMonths}|${ask.instalments}`
        const publicRef =
          pendingOrder?.key === key
            ? pendingOrder.publicRef
            : (
                await billing.createOrder(
                  [...ask.chargeIds],
                  ask.instalments,
                  ask.forwardMonths,
                )
              ).public_ref
        setPendingOrder({ publicRef, key })
        const form = await billing.orderForm(publicRef)
        setPendingOrder(null)
        if (form.action === DEMO_SIMULATOR.action) {
          // §19.6 — no live form exists in this deployment by design. The order is open
          // and the IPN is what settles it.
          refresh()
          return
        }
        setOverlay({ kind: 'checkout', form })
      } catch {
        setError(t(locale, 'billing.pay.failed'))
      } finally {
        setBusy(false)
      }
    },
    [billing, busy, locale, pendingOrder, refresh],
  )

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
    </section>
  )
}
