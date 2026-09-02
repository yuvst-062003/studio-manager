// §5.10 step 5 — the uPay return leg, behind `#/payment-complete/<ref>` (P1).
//
// The backend's `GET /api/v1/payment-complete?ref=` reports the order's CURRENT status
// and marks nothing paid ('the redirect is never the source of truth — a closed tab
// still produces an IPN'). Until this route existed, uPay's returnurl pointed the
// parent's browser at that JSON endpoint directly — a paying parent landed on raw JSON.
// The service now redirects here; this container polls the status and renders the
// screen that is honest about not knowing yet.
//
// **2026-09-03 addendum — the payment overlay's completion signal.** `returnurl` is
// hardcoded server-side to `#/payment-complete/{ref}`, our own origin -- so when a
// family pays through the in-app overlay (`PaymentOverlay.tsx`), uPay eventually
// navigates the overlay's `<iframe>` to THIS route, same-origin with the parent frame
// again. `window.top !== window.self` is how this component tells "I am the iframe"
// from "I am the ordinary standalone page" -- both are real, live paths (a family can
// still land here directly, e.g. from a saved link or the non-overlay flow), so this
// branches rather than assuming one or the other. When embedded, once the status read
// resolves, this posts the completion message to the parent frame instead of (or
// alongside) rendering the normal screen -- the overlay is about to close it, so a
// minimal render is enough. **Only proven with a synthetic `MessageEvent` so far**; the
// manual walkthrough (plan Phase 6) is what confirms a real iframe navigation here
// actually reaches `window.top` in a live browser.
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PAYMENT_OVERLAY_MESSAGE_TYPE } from './PaymentOverlay'
import { PaymentCompleteScreen } from './PaymentCompleteScreen'
import type { PaymentOrderOut } from './billingClient'

export function PaymentCompleteSection({ locale, publicRef }: { locale: Locale; publicRef: string }) {
  const [status, setStatus] = useState<PaymentOrderOut['status'] | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by retry; the effect below re-runs on it. The re-fetch is a REAL one — a
  // browser refresh may serve the same failure from the service worker's cache.
  const [attempt, setAttempt] = useState(0)
  const posted = useRef(false)

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

  useEffect(() => {
    if (status === null || posted.current) return
    if (window.top === window.self) return
    posted.current = true
    window.top?.postMessage(
      { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: publicRef },
      window.location.origin,
    )
  }, [publicRef, status])

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
