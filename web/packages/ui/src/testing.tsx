import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { DIRECTION } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ThemeProvider } from './ThemeProvider'
import { THEME_STORAGE_KEY } from './theme'
import type { ResolvedTheme } from './theme'

/**
 * SPEC §13: "Every component rendered in both `he` (RTL) and `en` (LTR)". SPEC §9: the UI
 * is genuinely bidirectional, not RTL-only with LTR bolted on. Every primitive test runs
 * this matrix, so a physical property or a hard-coded direction fails at the component
 * that introduced it rather than during M10's sweep.
 *
 * Deliberately NOT exported from index.ts: it pulls in @testing-library/react, which must
 * never reach an app bundle.
 */
export const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

export const THEMES = ['light', 'dark'] as const

/**
 * Renders inside the REAL ThemeProvider rather than stubbing the theme onto the root. The
 * theme is forced through localStorage, which is the provider's own input — a test that
 * set `data-theme` directly would keep passing even if the provider stopped working.
 */
export function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}
