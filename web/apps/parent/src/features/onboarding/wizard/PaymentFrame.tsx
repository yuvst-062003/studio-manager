// The uPay checkout, inside the wizard rather than navigating the tab away.
//
// **The mechanics are NOT reimplemented.** `submitUpayForm` and the frame name and
// message type all come from the shipped `features/billing` module, which was confirmed
// live on 2026-09-03: uPay's checkout loads in an iframe, no `X-Frame-Options` or
// `frame-ancestors` blocks it. Only the chrome is Tailwind here, so the overlay matches
// the screen it opens over. A second copy of the POST-into-a-named-frame trick is exactly
// where the two would drift.
//
// **There is no uPay sandbox.** `app/integrations/upay/form.py`: the merchant account has
// no test mode, `livesystem` is the constant LIVE, and a demo studio is refused a form
// outright rather than given a weaker one -- `GET /me/payment-orders/{ref}/form` answers
// 409 `demo_studio_has_no_live_form` and points at §19.5's IPN simulator. So every form
// this frame can legitimately load is a REAL one against a real merchant account. The
// preview harness therefore posts to a local stand-in; see `upayStub` in the preview.
import { useEffect, useState } from 'react'
import { Loader2, Lock, X } from 'lucide-react'
import type { Locale } from '@studio/i18n'
import {
  PAYMENT_OVERLAY_FRAME_NAME,
  PAYMENT_OVERLAY_MESSAGE_TYPE,
} from '../../billing/PaymentOverlay'
import { submitUpayForm } from '../../billing/billingClient'
import type { PaymentOrderOut, UpayForm } from '../../billing/billingClient'
import { PaymentSettled } from '../../billing/PaymentSettled'
import { useSettledOrder } from '../../billing/useSettledOrder'
import { useDialog } from './useDialog'
import { paymentFrameCopy } from './copy'

export type PaymentFrameRequest =
  /** uPay's card page: a POST of hidden fields into the named frame. */
  | { kind: 'checkout'; form: UpayForm; publicRef: string | null }
  /** A standing-order mandate, which is a plain URL uPay hosts and has no order row. */
  | { kind: 'link'; url: string }

export type PaymentFrameProps = {
  locale: Locale
  request: PaymentFrameRequest
  onComplete: (publicRef: string) => void
  onClose: () => void
  /** Reads one order's status. Required, for the reason `PaymentOverlay`'s copy of this
   *  prop is required: the postMessage is not the only way a payment ends. */
  orderStatus: (publicRef: string) => Promise<PaymentOrderOut>
}

export function PaymentFrame({
  locale,
  request,
  onComplete,
  onClose,
  orderStatus,
}: PaymentFrameProps) {
  const copy = paymentFrameCopy(locale)
  const dialogRef = useDialog(true, onClose)
  const [loaded, setLoaded] = useState(false)
  const [settled, setSettled] = useState<PaymentOrderOut | null>(null)

  //: The wizard's half of the bit fix. Without it a family joining the club and paying
  //: with bit sat on a white frame, pressed the X, and `dismissFrame` put them in
  //: `awaitingPayment` -- told to pay again for something they had already paid for.
  useSettledOrder({
    publicRef: request.kind === 'checkout' ? request.publicRef : null,
    orderStatus,
    onSettled: (_ref, resolved) => setSettled(resolved),
  })

  //: `onComplete` advances the wizard to step 4, so only `paid` may call it. A mismatch or
  //: a decline leaves the family still owing the month, and `onClose` is the path that
  //: already says so -- `dismissFrame` holds the checkout open for another attempt.
  const dismissSettled = () => {
    if (settled?.status === 'paid' && request.kind === 'checkout' && request.publicRef !== null) {
      onComplete(request.publicRef)
    } else {
      onClose()
    }
  }

  useEffect(() => {
    if (request.kind === 'checkout') submitUpayForm(request.form, PAYMENT_OVERLAY_FRAME_NAME)
  }, [request])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      //: Same-origin only. The message is posted by our OWN return page once uPay
      //: navigates the frame to `returnurl`; uPay's own origin never posts to us, and
      //: accepting a cross-origin one would let any framed page claim a payment landed.
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; ref?: string } | null
      if (data?.type !== PAYMENT_OVERLAY_MESSAGE_TYPE || typeof data.ref !== 'string') return
      onComplete(data.ref)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onComplete])

  return (
    <div className="tw-scope fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        tabIndex={-1}
        className="w-full max-w-[960px] h-[100dvh] sm:h-[94vh] bg-[var(--wz-accent-deep)] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
              <Lock className="w-4 h-4" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-bold text-white truncate">{copy.title}</span>
              <span className="text-[11px] text-[var(--wz-on-navy)] truncate">{copy.secure}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 mx-2 mb-2 sm:mx-3 sm:mb-3 bg-[var(--wz-surface)] rounded-xl sm:rounded-2xl overflow-hidden relative">
          {settled !== null ? (
            <PaymentSettled locale={locale} onDismiss={dismissSettled} order={settled} />
          ) : (
            <>
              {!loaded ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--wz-secondary)]">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--wz-accent)]" />
                  <span className="text-[13px]">{copy.loading}</span>
                </div>
              ) : null}
              <iframe
                name={PAYMENT_OVERLAY_FRAME_NAME}
                src={request.kind === 'link' ? request.url : undefined}
                title={copy.title}
                onLoad={() => setLoaded(true)}
                className="w-full h-full border-0"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
