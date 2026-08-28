import { describe, expect, it } from 'vitest'
import { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE, t, translate, bundles } from '../index'
import type { Bundle, Namespace } from '../types'

/** Every namespace empty, so a synthetic fixture only has to fill the ones it uses. */
const EMPTY = Object.fromEntries(NAMESPACES.map((ns) => [ns, {}])) as Record<Namespace, Bundle>

describe('locale direction (SPEC §9)', () => {
  it('he is RTL, en and ru are LTR', () => {
    expect(DIRECTION.he).toBe('rtl')
    expect(DIRECTION.en).toBe('ltr')
    expect(DIRECTION.ru).toBe('ltr')
  })
})

describe('Seam 3 — namespaces exist for every vertical in every locale', () => {
  it('lists all nine namespaces', () => {
    expect([...NAMESPACES]).toEqual([
      'common', 'schedule', 'people', 'health',
      'attendance', 'billing', 'events', 'comms', 'reports',
    ])
  })

  it.each(['he', 'en', 'ru'] as const)('%s has a file for every namespace', (locale) => {
    for (const ns of NAMESPACES) {
      expect(bundles[locale][ns], `${locale}/${ns}.ts missing`).toBeDefined()
    }
  })
})

describe('fallback (SPEC §9 — Hebrew is the reference locale)', () => {
  // Tested against synthetic bundles, not the shipped ones. The previous version
  // asserted t('ru', 'common.appName.staff') === t('he', ...), which passed only
  // because that key was untranslated; completing the Russian translation turned it
  // red. A fallback test must not depend on which translations happen to be missing.
  const synthetic = {
    he: { ...EMPTY, common: { greet: 'שלום', only: 'רק בעברית' } },
    en: { ...EMPTY, common: { greet: 'Hello' } },
    ru: { ...EMPTY, common: { greet: 'Привет' } },
  }

  it('returns the Hebrew string when a key is missing in the asked-for locale', () => {
    expect(translate(synthetic, 'ru', 'common.only')).toBe('רק בעברית')
    expect(translate(synthetic, 'en', 'common.only')).toBe('רק בעברית')
  })

  it('prefers the locale over Hebrew when the key is present', () => {
    expect(translate(synthetic, 'ru', 'common.greet')).toBe('Привет')
  })

  it('returns the key when it is absent everywhere, rather than throwing', () => {
    expect(translate(synthetic, 'ru', 'common.nope')).toBe('common.nope')
  })

  it('returns the translated string when present', () => {
    expect(t('en', 'common.hello')).toBe('Hello')
    expect(t('he', 'common.hello')).toBe('שלום')
  })

  it('returns the key itself when absent everywhere, rather than throwing', () => {
    expect(t('he', 'common.nope')).toBe('common.nope')
  })
})

describe('REFERENCE_LOCALE', () => {
  it('is he', () => expect(REFERENCE_LOCALE).toBe('he'))
})

describe('referenced nav labels resolve (regression 2026-08-29)', () => {
  // The manager-only cash item in the staff nav (App.tsx) referenced
  // `billing.cash.manager.title`, which existed in no locale, so the drawer showed the
  // raw key. Parity checks locale-vs-locale; it cannot see a key a component references
  // but nobody defines. This pins the labels the staff manager nav actually uses.
  it.each(LOCALES)('%s translates the manager cash nav item', (locale) => {
    expect(t(locale, 'billing.cash.manager.title')).not.toBe('billing.cash.manager.title')
  })
})

describe('translation completeness (SPEC §9 — reported, not silently tolerated)', () => {
  // Not a parity check — web/scripts/i18n-parity.mjs is that, and it runs in CI and in
  // every lane check. This records the shape the fallback relies on: a locale may be
  // incomplete, but it may never carry a key Hebrew does not have.
  it.each(LOCALES.filter((l) => l !== REFERENCE_LOCALE))(
    '%s carries no key without a Hebrew source',
    (locale) => {
      for (const ns of NAMESPACES) {
        for (const key of Object.keys(bundles[locale][ns])) {
          expect(bundles[REFERENCE_LOCALE][ns], `${locale}/${ns}.${key}`).toHaveProperty(key)
        }
      }
    },
  )
})
