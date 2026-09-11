// Watching one payment order resolve, for the frame that uPay's checkout opens in.
//
// **Why this exists, and what it replaces.** `PaymentOverlay` and the wizard's
// `PaymentFrame` both closed on exactly one signal: a same-origin `postMessage`, posted by
// our own `#/payment-complete/<ref>` screen once uPay navigated the iframe there. That
// signal is real and still wired — but it only fires on the route that comes back to our
// origin. The first live payment this product ever took (2026-09-11) went through **bit**,
// which ends on `app.upay.co.il/API6/bit/return.php` instead: the message never came, the
// frame went blank, and the overlay sat on a white rectangle indefinitely. There was no
// timeout and no second way to notice, in any of the three places the frame is mounted.
//
// So the frame no longer depends on where uPay happens to send the browser. It asks the
// one authority that is true on every route — our own order row, which the IPN settles —
// and closes when that row stops saying `pending`. §5.10's rule is untouched: the redirect
// is still never the source of truth, and neither is this. The IPN is. This only watches.
//
// **Not `pending` is not the same as `paid`.** `amount_mismatch` means real money arrived
// at the wrong amount and a manager has to look; `failed` means an outcome code nobody has
// observed. Both resolve the frame, because in both the parent is done standing in front
// of uPay and must not be left watching a blank rectangle while a human investigates.
import { useEffect, useRef } from 'react'
import type { PaymentOrderOut } from './billingClient'

/** How often the order is asked about. The one live IPN so far landed 77 seconds after the
 *  order was created, which is a handful of polls, not a handful of hundreds. */
export const SETTLE_POLL_MS = 3000

/** When to stop asking. Longer than bit's own nine-minute payment window, so a family who
 *  is slow still gets the close; short enough that a tab left open over a weekend is not
 *  quietly issuing a request every three seconds until the battery runs out. An order
 *  abandoned past this is reached again through `#/payment-complete/<ref>` or the open
 *  orders list, both of which already exist. */
export const SETTLE_POLL_CEILING_MS = 15 * 60 * 1000

/**
 * The statuses that end a checkout. **An allowlist, not `!== 'pending'`.**
 *
 * The difference only shows up when the read returns something unexpected — an error body
 * shaped like an order, a field renamed upstream, a cached 200 with no status at all. With
 * a negative test every one of those closes the payment window the moment it opens, and
 * the family never reaches uPay's card page at all. With this list they are simply not an
 * answer, so the next poll asks again.
 *
 * `amount_mismatch` and `failed` are here beside `paid` deliberately: the parent is done
 * standing in front of uPay in all three, and only the first means they owe nothing.
 */
const RESOLVED = new Set(['paid', 'failed', 'amount_mismatch', 'expired'])

export type UseSettledOrder = {
  /** The order to watch, or null when there is nothing to watch — a mandate link carries
   *  no order, and neither does a closed frame. */
  publicRef: string | null
  orderStatus: (publicRef: string) => Promise<PaymentOrderOut>
  /** Handed the WHOLE order, not merely that there was an outcome. The frame draws five
   *  different things and one of them says the amount out loud, so a callback carrying
   *  only a status would have every caller fetch the same row a second time to find out
   *  what it should say. */
  onSettled: (publicRef: string, order: PaymentOrderOut) => void
}

export function useSettledOrder({ publicRef, orderStatus, onSettled }: UseSettledOrder): void {
  // Both callbacks are held in refs and neither is a dependency below. Every caller passes
  // an inline arrow, so a dependency on them would clear and restart the interval on each
  // render — and a poll that restarts more often than it fires never fires at all. The
  // effect depends on `publicRef` alone, which is the only thing that identifies the work.
  const settled = useRef(onSettled)
  const ask = useRef(orderStatus)
  useEffect(() => {
    settled.current = onSettled
    ask.current = orderStatus
  }, [onSettled, orderStatus])

  useEffect(() => {
    if (publicRef === null) return undefined
    let live = true
    const startedAt = Date.now()
    const stop = () => {
      live = false
      clearInterval(timer)
    }
    const check = () => {
      if (Date.now() - startedAt > SETTLE_POLL_CEILING_MS) {
        stop()
        return
      }
      void ask
        .current(publicRef)
        .then((order) => {
          // `live` is re-checked after the await: the frame may have been closed while
          // this request was in flight, and reporting a completion into an unmounted
          // screen is how a wizard advances a step nobody is looking at.
          if (!live || !RESOLVED.has(order.status)) return
          stop()
          settled.current(publicRef, order)
        })
        .catch(() => {
          // A dropped request is not a failed payment. The next tick asks again; the IPN
          // has already settled the money either way.
        })
    }
    const timer = setInterval(check, SETTLE_POLL_MS)
    // **Asked once on mount, before the first interval.** A frame is not always opened
    // over a fresh order: both the payments screen and the shop reopen the order a family
    // already has, and that one may have been paid since they last looked. Waiting a full
    // interval to notice would put them back in front of uPay for money already taken.
    check()
    return stop
  }, [publicRef])
}
