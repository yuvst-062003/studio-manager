// The pinch-zoom the viewport meta tag cannot reach.
//
// iOS 10 made Safari ignore `user-scalable=no` and `maximum-scale` outright: Apple decided
// a page may not take pinch-zoom away from a reader, and no meta tag has overridden it
// since. The tag IS honoured for a home-screen web app, so the installed PWA — the thing
// §6.5 ships — behaves without this. A parent opening the same URL in a Safari tab does
// not, and that is where most people meet the app first.
//
// WebKit's non-standard `gesture*` events are the remaining door. They fire only for a
// multi-touch scale/rotate, so refusing them removes pinch-zoom and touches nothing else —
// a one-finger drag, a tap, and SignaturePad's drawing never raise them.
//
// **The accessibility trade this makes, and why it is payable here.** Removing pinch-zoom
// is normally indefensible (WCAG 1.4.4). It is defensible in these two apps because they
// carry their own text scaling: `AccessibilityMenu` writes a root font-size and the token
// layer is rem-based throughout, so a reader who needs larger text has a control that
// survives navigation — which browser zoom, reset on every install-mode launch, does not.
// If that menu is ever removed from an app, this must go with it.

const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const

/** How close together in time two taps must be to read as a double-tap rather than as two
 *  deliberate ones. 300ms is the interval Safari itself waits before settling a single tap. */
const DOUBLE_TAP_MS = 300

/** ...and how close together on the glass. **This bound is what makes suppressing the second
 *  tap safe.** Cancelling every quick second tap would cancel a parent tapping two different
 *  buttons in a hurry — and cancelling `touchend` cancels the click the app needed. Two taps
 *  more than a fingertip apart are two taps, whatever their timing. */
const DOUBLE_TAP_PX = 40

/** A hair narrower than `EventTarget` so a test can pass a stub without a DOM. */
export type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/**
 * Refuses WebKit's pinch gestures, and iOS Safari's double-tap zoom, for the life of the
 * document.
 *
 * **The double-tap half was added 2026-09-12**, after the wizard was reported as still
 * zooming on an iPhone. Everything else was already right and verified live: the viewport
 * meta carries `user-scalable=no`, `html` carries `touch-action: pan-x pan-y`, and the three
 * `gesture*` listeners below were confirmed attached and preventing. What none of those
 * reaches is the double tap — `touch-action` is SPECIFIED to suppress it, and Safari has
 * been unreliable about honouring that on the root element for years, which leaves the
 * gesture a page can still feel and cannot otherwise refuse.
 *
 * Returns a disposer. Nothing in the apps calls it — this is installed once from `main.tsx`
 * and lives as long as the page — but a listener with no way off is a listener no test can
 * clean up after, and these are registered on the document itself.
 */
export function lockViewportZoom(target: GestureTarget = document): () => void {
  // `passive: false` is the whole point: a listener the browser believes is passive has its
  // `preventDefault()` ignored with a console warning and the page zooms anyway. Chrome
  // treats touch-family listeners on the document as passive by default, so leaving this
  // off is a silent no-op rather than an error.
  const block = (event: Event) => event.preventDefault()
  for (const type of GESTURES) target.addEventListener(type, block, { passive: false })

  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0
  const blockDoubleTap = (event: Event) => {
    const touch = (event as TouchEvent).changedTouches?.[0]
    if (!touch) return
    const now = Date.now()
    const quick = now - lastTapAt <= DOUBLE_TAP_MS
    const near =
      Math.abs(touch.clientX - lastTapX) <= DOUBLE_TAP_PX &&
      Math.abs(touch.clientY - lastTapY) <= DOUBLE_TAP_PX
    if (quick && near) {
      // Only the SECOND tap of a pair is cancelled, so the first one's click has already
      // been delivered. A double-tap on a button therefore still acts once, which is what
      // a reader who taps twice by accident expects anyway.
      event.preventDefault()
      lastTapAt = 0
      return
    }
    lastTapAt = now
    lastTapX = touch.clientX
    lastTapY = touch.clientY
  }
  target.addEventListener('touchend', blockDoubleTap, { passive: false })

  return () => {
    for (const type of GESTURES) target.removeEventListener(type, block)
    target.removeEventListener('touchend', blockDoubleTap)
  }
}
