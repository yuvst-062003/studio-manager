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
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Button, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { submitUpayForm } from './PaymentsSection'
import type { UpayForm } from './billingClient'

export const PAYMENT_OVERLAY_FRAME_NAME = 'upay-payment-overlay'
export const PAYMENT_OVERLAY_MESSAGE_TYPE = 'upay-payment-complete'

export type PaymentOverlayRequest =
  | { kind: 'checkout'; form: UpayForm }
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
}

export function PaymentOverlay({ locale, request, onComplete, onClose }: PaymentOverlayProps) {
  const dialogRef = useModalDialog(true, onClose)

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
        <div style={frameWrapStyle}>
          <iframe
            name={PAYMENT_OVERLAY_FRAME_NAME}
            src={request.kind === 'link' ? request.url : undefined}
            style={frameStyle}
            title={t(locale, 'billing.overlay.title')}
          />
        </div>
      </div>
    </div>
  )
}
