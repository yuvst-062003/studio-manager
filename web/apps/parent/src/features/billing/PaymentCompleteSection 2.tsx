// §5.10 step 5 — the uPay return leg, behind `#/payment-complete/<ref>` (P1).
//
// The backend's `GET /api/v1/payment-complete?ref=` reports the order's CURRENT status
// and marks nothing paid ('the redirect is never the source of truth — a closed tab
// still produces an IPN'). Until this route existed, uPay's returnurl pointed the
// parent's browser at that JSON endpoint directly — a paying parent landed on raw JSON.
// The service now redirects here; this container polls the status and renders the
// screen that is honest about not knowing yet.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentCompleteScreen } from './PaymentCompleteScreen'
import type { PaymentOrderOut } from './billingClient'

export function PaymentCompleteSection({ locale, publicRef }: { locale: Locale; publicRef: string }) {
  const [status, setStatus] = useState<PaymentOrderOut['status'] | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by retry; the effect below re-runs on it. The re-fetch is a REAL one — a
  // browser refresh may serve the same failure from the service worker's cache.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void apiFetch(`/api/v1/payment-complete?ref=${encodeURIComponent(publicRef)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return (await response.json()) as { status: PaymentOrderOut['status'] }
      })
      .then((body) => live && setStatus(body.status))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [publicRef, attempt])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (status === null) {
    return <p data-testid="payment-complete-loading">{t(locale, 'common.setup.loading')}</p>
  }
  return (
    <PaymentCompleteScreen
      locale={locale}
      onOpenPayments={() => {
        globalThis.location.hash = '#/payments'
      }}
      status={status}
    />
  )
}
