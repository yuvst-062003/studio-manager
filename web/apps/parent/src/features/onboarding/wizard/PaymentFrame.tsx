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
import {
  PAYMENT_OVERLAY_FRAME_NAME,
  PAYMENT_OVERLAY_MESSAGE_TYPE,
} from '../../billing/PaymentOverlay'
import { submitUpayForm } from '../../billing/PaymentsSection'
import type { UpayForm } from '../../billing/billingClient'
import { useDialog } from './useDialog'
import { PAYMENT_FRAME_COPY } from './content'

export type PaymentFrameRequest =
  /** uPay's card page: a POST of hidden fields into the named frame. */
  | { kind: 'checkout'; form: UpayForm }
  /** A standing-order mandate, which is a plain URL uPay hosts. */
  | { kind: 'link'; url: string }

export type PaymentFrameProps = {
  request: PaymentFrameRequest
  onComplete: (publicRef: string) => void
  onClose: () => void
}

export function PaymentFrame({ request, onComplete, onClose }: PaymentFrameProps) {
  const copy = PAYMENT_FRAME_COPY
  const dialogRef = useDialog(true, onClose)
  const [loaded, setLoaded] = useState(false)

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
        className="w-full max-w-[960px] h-[100dvh] sm:h-[94vh] bg-[#0d2c6c] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
              <Lock className="w-4 h-4" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-bold text-white truncate">{copy.title}</span>
              <span className="text-[11px] text-[#b3c5ff] truncate">{copy.secure}</span>
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

        <div className="flex-1 mx-2 mb-2 sm:mx-3 sm:mb-3 bg-white rounded-xl sm:rounded-2xl overflow-hidden relative">
          {!loaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#444650]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0056c5]" />
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
        </div>
      </div>
    </div>
  )
}
