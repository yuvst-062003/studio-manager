// The one thing the prototype does not have and this screen must (§4.5): "a screen wake
// lock. A timer whose screen sleeps mid-round is not a timer."
//
// `navigator.wakeLock.request('screen')` while `active`, released the moment it is not —
// on pause, on finish (the engine sets `isRunning` false there too) and on unmount, via the
// same effect cleanup — and re-acquired on `visibilitychange` if the page comes back while
// still active. The spec is explicit that a user agent releases every held wake lock the
// instant a document's visibility state becomes hidden, and does NOT re-grant it on its
// own once the page is visible again — without the listener below, a coach who glanced at
// another app mid-round would return to a screen that can sleep for the rest of the
// workout, silently, with nothing on screen saying so.
//
// Every call is wrapped in try/catch: `request()` rejects on denial (no user activation,
// battery saver, an unsupported browser) and this must never throw into a render or an
// event handler over a feature that is a convenience, not a requirement — the timer still
// runs correctly with the screen free to sleep, which is exactly today's behaviour.
import { useCallback, useEffect, useRef } from 'react'

/** Structural, not `WakeLockSentinel` from lib.dom — that type is not in every TS target
 *  this repo compiles against, and the only member this file touches is `release()`. */
type WakeLockSentinelLike = { release: () => Promise<void> }
type NavigatorWithWakeLock = {
  wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

function supportsWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  const release = useCallback(() => {
    const sentinel = sentinelRef.current
    sentinelRef.current = null
    if (!sentinel) return
    try {
      void sentinel.release().catch(() => {})
    } catch {
      // A sentinel that throws synchronously on release is not one this screen can do
      // anything about; the reference is already cleared above.
    }
  }, [])

  const acquire = useCallback(async () => {
    if (!supportsWakeLock()) return
    try {
      const sentinel = await (navigator as unknown as NavigatorWithWakeLock).wakeLock.request(
        'screen',
      )
      sentinelRef.current = sentinel
    } catch {
      // Denied or unsupported for this gesture. The timer keeps running either way.
    }
  }, [])

  useEffect(() => {
    if (active) void acquire()
    else release()
    return release
  }, [active, acquire, release])

  useEffect(() => {
    if (!supportsWakeLock()) return

    function onVisibilityChange(): void {
      if (!active || document.visibilityState !== 'visible') return
      // The browser already invalidated whatever we were holding the moment the page went
      // hidden — `release()` on that stale reference is a harmless no-op — so a fresh
      // request is the only way to actually be holding a lock again.
      release()
      void acquire()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [active, acquire, release])
}
