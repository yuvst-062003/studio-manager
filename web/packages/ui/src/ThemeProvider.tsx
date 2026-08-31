import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { GROUND_COLOR, THEME_STORAGE_KEY, resolveTheme, surfaceOf } from './theme'
import type { ResolvedTheme, ThemePreference } from './theme'

type ThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const readStoredPreference = (): ThemePreference => {
  const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(preference, systemPrefersDark)

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    // The surface is read from the same element the stylesheet matches on, so the status
    // bar of an installed PWA follows whichever palette the CSS actually applied.
    const ground = GROUND_COLOR[surfaceOf(document.documentElement)][resolved]
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground)
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
