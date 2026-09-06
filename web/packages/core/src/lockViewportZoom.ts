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

/** A hair narrower than `EventTarget` so a test can pass a stub without a DOM. */
export type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/**
 * Refuses WebKit's pinch gestures for the lifetime of the document.
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
  return () => {
    for (const type of GESTURES) target.removeEventListener(type, block)
  }
}
