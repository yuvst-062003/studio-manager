// §6.1 step 1's language choice, persisted.
//
// **Why this module exists at all.** The choice lived in a `useState<Locale>('he')` — three
// of them in the parent app, one in staff — so it was forgotten on every reload. §6.1 puts
// language BEFORE login precisely because "a Russian-speaking parent cannot read a Hebrew
// consent screen"; a choice that does not survive the reload between finishing the wizard
// and opening the app defeats the whole ordering.
//
// **Per device, deliberately.** This is `localStorage`, not `person.locale`. The column
// exists and nothing writes it, and wiring the server round-trip would mean a preference
// that is wrong until the session resolves — which on first run is exactly when it matters.
// The honest behaviour is: this browser remembers. A second device asks again, which costs
// one tap and is never wrong.
//
// Same shape as `ThemeProvider`'s storage, including the `globalThis.localStorage?.` guard
// — except that every access here is also wrapped, because a private window and a browser
// set to block site data both THROW on access rather than returning null, and an app that
// cannot open because storage is off is worse than one that forgets.
import { useCallback, useState } from 'react'
import type { Locale } from './datetime'

export const LOCALE_STORAGE_KEY = 'studio.locale'

const LOCALES: readonly Locale[] = ['he', 'en', 'ru']

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** The stored choice, or `null` when nobody has made one yet.
 *
 * `null` is load-bearing: it is what tells the first-run gate to ask. A default of `'he'`
 * here would make "chose Hebrew" and "has not been asked" the same state, and the gate
 * would never open for anybody.
 *
 * A value that is not one of the three is treated as absent rather than trusted — a stale
 * key, a hand-edited value or another app on the same origin would otherwise be handed
 * straight to `t(locale, …)` against a bundle that does not exist.
 */
export function readStoredLocale(): Locale | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    return isLocale(raw) ? raw : null
  } catch {
    return null
  }
}

/** Remember the choice. Silent on failure — see the module header. */
export function storeLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* storage refused; the app keeps the choice in memory for this visit */
  }
}

/** The locale, the setter that persists it, and whether anyone has chosen yet.
 *
 * One hook rather than a `useState` plus a call site that remembers to persist, because the
 * call site that forgets is the account drawer — where a parent changes their language once
 * and then finds it reverted next week. `setLocale` is the ONLY writer, so there is no path
 * that changes the language without recording it.
 */
export function useStoredLocale(fallback: Locale = 'he'): {
  locale: Locale
  setLocale: (next: Locale) => void
  hasChosen: boolean
} {
  const [stored, setStored] = useState<Locale | null>(readStoredLocale)

  const setLocale = useCallback((next: Locale) => {
    setStored(next)
    storeLocale(next)
  }, [])

  return { locale: stored ?? fallback, setLocale, hasChosen: stored !== null }
}
