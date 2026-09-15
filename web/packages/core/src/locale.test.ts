// §6.1 step 1's language choice, made to survive a reload.
//
// The choice was a `useState('he')` in three places in each app, so a Russian-speaking
// parent who picked Русский got Hebrew back on their next visit — and on the visit AFTER
// the wizard, which is the one that matters most. These tests hold the three properties
// that fix costs nothing and gets wrong easily: the value round-trips, a junk value is
// ignored rather than trusted, and a browser that refuses storage still renders an app.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY, readStoredLocale, storeLocale } from './locale'

describe('the stored locale', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
  })

  it('round-trips a choice', () => {
    storeLocale('ru')
    expect(readStoredLocale()).toBe('ru')
  })

  it('is null before anyone has chosen, so the gate knows to ask', () => {
    expect(readStoredLocale()).toBeNull()
  })

  it('ignores a value that is not one of the three locales', () => {
    // Hand-edited storage, a stale key from an older build, or another app on the origin.
    // Trusting it would render `t(locale, …)` against a bundle that does not exist.
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, 'fr')
    expect(readStoredLocale()).toBeNull()
  })

  it('survives a browser that throws on read', () => {
    // Private windows and "block site data" both throw on ACCESS, not just return null.
    // An app that cannot open because storage is off is worse than one that forgets.
    const spy = vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readStoredLocale()).toBeNull()
    spy.mockRestore()
  })

  it('survives a browser that throws on write', () => {
    const spy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => storeLocale('en')).not.toThrow()
    spy.mockRestore()
  })
})
