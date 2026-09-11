// The in-app payment overlay -- 2026-09-03 addendum. uPay's checkout (or a standing-
// order mandate link) renders inside an `<iframe>` on the same screen instead of
// navigating the tab away, so a card-paying family never actually leaves the join
// wizard (or, outside onboarding, the ordinary payments screen). Built once, reused by
// both callers, exactly like `submitUpayForm` already was.
//
// **What is proven and what is not.** Loading uPay's real checkout inside an iframe is
// confirmed live (2026-09-03): no `X-Frame-Options`/`frame-ancestors` header blocks it.
// The completion signal below (`postMessage` from `PaymentCompleteSection`, once uPay
// navigates the iframe to our own `returnurl`) is the part that still needs exercising
// end-to-end -- see `PaymentCompleteSection.tsx`'s own header.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { submitUpayForm } from './billingClient'
import type { PaymentOrderOut, UpayForm } from './billingClient'
import { PaymentSettled } from './PaymentSettled'
import { useSettledOrder } from './useSettledOrder'
import type { SettledFor } from './redesign/pay'

export const PAYMENT_OVERLAY_FRAME_NAME = 'upay-payment-overlay'
export const PAYMENT_OVERLAY_MESSAGE_TYPE = 'upay-payment-complete'

export type PaymentOverlayRequest =
  /** uPay's card page, plus the order it is for. The `publicRef` is carried explicitly
   *  rather than read back out of `form.fields.paymentdetails`: that field is the PAYER's
   *  description now and leads with the club's name (2026-09-11), so parsing it here would
   *  couple this component to a string uPay renders to a human. */
  | { kind: 'checkout'; form: UpayForm; publicRef: string; settled?: SettledFor | null }
  /** A standing-order mandate, which is a plain URL uPay hosts and has no order row. */
  | { kind: 'link'; url: string }

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, black 55%, transparent)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 1000,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: 'var(--space-2)',
}

const frameWrapStyle: CSSProperties = {
  flex: '1 1 auto',
  margin: '0 var(--space-3) var(--space-3)',
  background: 'var(--surface)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
}

/** The success moment owns the whole dialog: edge to edge, no margin and no rounding, so
 *  the club's ground reaches every corner the way the launch screen's does. */
const immersiveWrapStyle: CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  overflow: 'hidden',
}

const frameStyle: CSSProperties = {
  inlineSize: '100%',
  blockSize: '100%',
  border: 0,
}

export type PaymentOverlayProps = {
  locale: Locale
  request: PaymentOverlayRequest
  onComplete: (ref: string) => void
  onClose: () => void
  /** Reads one order's status. **Required, including for a mandate link**, so that a new
   *  caller cannot quietly reintroduce the postMessage-only overlay that left a bit payer
   *  watching a white rectangle -- see `useSettledOrder`. */
  orderStatus: (publicRef: string) => Promise<PaymentOrderOut>
}

export function PaymentOverlay({
  locale,
  request,
  onComplete,
  onClose,
  orderStatus,
}: PaymentOverlayProps) {
  const dialogRef = useModalDialog(true, onClose)

  //: What the order resolved to, or null while the parent is still on uPay's page. The
  //: frame does not close on this -- it SHOWS it, and closes when the parent is done
  //: reading. A silent close is fine for a success nobody needed told about and wrong for
  //: `amount_mismatch`, where money arrived at the wrong amount and nothing is settled.
  const [settled, setSettled] = useState<PaymentOrderOut | null>(null)

  // The second way to notice, for every uPay route that does not come back to our origin.
  useSettledOrder({
    publicRef: request.kind === 'checkout' ? request.publicRef : null,
    orderStatus,
    onSettled: (_ref, resolved) => setSettled(resolved),
  })

  //: Dismissing a RESOLVED frame is not the same as dismissing a live one. `paid` is the
  //: only outcome that finished what the parent came to do, so it alone reports
  //: completion; a mismatch, a decline and an expiry all leave them still owing the month,
  //: which is what `onClose` already means everywhere this component is mounted.
  const dismissSettled = () => {
    if (settled?.status === 'paid' && request.kind === 'checkout') onComplete(request.publicRef)
    else onClose()
  }

  //: A success takes the whole overlay: no white frame, no padding and no X, because it is
  //: a moment that ends by itself and there is nothing to close. Every other outcome keeps
  //: the chrome, because those wait for the parent.
  const immersive = settled?.status === 'paid'

  useEffect(() => {
    if (request.kind === 'checkout') {
      submitUpayForm(request.form, PAYMENT_OVERLAY_FRAME_NAME)
    }
  }, [request])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; ref?: string } | null
      if (data?.type !== PAYMENT_OVERLAY_MESSAGE_TYPE || typeof data.ref !== 'string') return
      onComplete(data.ref)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onComplete])

  return (
    <div style={backdropStyle}>
      <div
        aria-label={t(locale, 'billing.overlay.title')}
        aria-modal="true"
        data-testid="payment-overlay"
        ref={dialogRef}
        role="dialog"
        style={{ display: 'flex', flexDirection: 'column', blockSize: '100%' }}
        tabIndex={-1}
      >
        {immersive ? null : (
          <div style={headerStyle}>
            <Button
              data-testid="payment-overlay-close"
              onClick={onClose}
              type="button"
              variant="ghost"
            >
              {t(locale, 'reports.privacy.gate.closeFull')}
            </Button>
          </div>
        )}
        <div style={immersive ? immersiveWrapStyle : frameWrapStyle}>
          {settled === null ? (
            <iframe
              name={PAYMENT_OVERLAY_FRAME_NAME}
              src={request.kind === 'link' ? request.url : undefined}
              style={frameStyle}
              title={t(locale, 'billing.overlay.title')}
            />
          ) : (
            <PaymentSettled
              locale={locale}
              onDismiss={dismissSettled}
              order={settled}
              settled={request.kind === 'checkout' ? request.settled : null}
            />
          )}
        </div>
      </div>
    </div>
  )
}
