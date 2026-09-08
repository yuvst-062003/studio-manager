import { useEffect, useState } from 'react'

/**
 * How long the loading screen stays up at minimum, measured from when the page began
 * loading rather than from when this hook mounted.
 *
 * **A minimum, never a delay.** If the app is ready after two seconds the screen has
 * already been up for two seconds and nothing here adds to that. It only matters when the
 * app is ready FAST, and what it buys there is a launch that reads as one screen giving way
 * to another instead of a flash somebody cannot follow (owner, 2026-09-08).
 *
 * **700ms, and not the two or three seconds first suggested.** Long enough for the eye to
 * register a screen — the threshold is around a quarter of a second — and short enough that
 * nobody feels held up. Past roughly a second and a half people start tapping again because
 * they think it is stuck, which is the opposite of the problem being solved. The cost is
 * paid by every fast launch, forever, so it is deliberately the smallest number that works.
 */
export const MIN_SPLASH_MS = 700

/**
 * Whether the loading screen should still be held.
 *
 * Measured from `performance.now()`, which counts from the navigation itself — so a launch
 * where the bundle took 600ms to parse holds for 100ms more, not 700ms more. The screen a
 * person saw during that parse is the same screen, painted by `index.html` before any of
 * this ran; continuing to count from mount would double the wait they had already served.
 */
export function useSplashHold(ms: number = MIN_SPLASH_MS): boolean {
  const [holding, setHolding] = useState(() => performance.now() < ms)

  useEffect(() => {
    if (!holding) return
    const remaining = ms - performance.now()
    if (remaining <= 0) {
      setHolding(false)
      return
    }
    const timer = setTimeout(() => setHolding(false), remaining)
    return () => clearTimeout(timer)
  }, [holding, ms])

  return holding
}
