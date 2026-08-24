import { useEffect, useState } from 'react'

export type DisplayMode = 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser'

/** Checked most-specific-first; a fullscreen app also matches standalone. */
const MODES = ['fullscreen', 'standalone', 'minimal-ui'] as const

type IosNavigator = Navigator & { standalone?: boolean }

/**
 * §6.5 — on iOS, Web Push exists only for a home-screen web app, so this is the
 * check that decides whether a parent can be reached at all. iOS before 16.4 does
 * not answer the display-mode media query, hence the navigator.standalone branch.
 */
export function getDisplayMode(): DisplayMode {
  if ((globalThis.navigator as IosNavigator | undefined)?.standalone === true) {
    return 'standalone'
  }
  for (const mode of MODES) {
    if (globalThis.matchMedia?.(`(display-mode: ${mode})`).matches) return mode
  }
  return 'browser'
}

export function isInstalled(): boolean {
  return getDisplayMode() !== 'browser'
}

/**
 * M1's onboarding gate and M8's install reporting both read this, which is why it
 * lives in core rather than in an app.
 */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>(getDisplayMode)

  useEffect(() => {
    const queries = MODES.map((m) => globalThis.matchMedia?.(`(display-mode: ${m})`)).filter(
      (q): q is MediaQueryList => Boolean(q),
    )
    const onChange = () => setMode(getDisplayMode())
    queries.forEach((q) => q.addEventListener('change', onChange))
    return () => queries.forEach((q) => q.removeEventListener('change', onChange))
  }, [])

  return mode
}
