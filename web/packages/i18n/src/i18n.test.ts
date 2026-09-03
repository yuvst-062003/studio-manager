import { describe, expect, it } from 'vitest'
import { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE, translatePlural, t, translate, bundles } from '../index'
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

describe('plural (register §9 — "1 שיעורים" has no plural rule)', () => {
  // Hebrew's own plural categories: 1 -> 'one', everything else (including 0) -> 'other'.
  // A synthetic bundle rather than the shipped one, same reasoning as the fallback suite
  // above: this pins the RULE, not which keys happen to have a `.one` variant today.
  const synthetic = {
    he: { ...EMPTY, schedule: { 'today.sessionCount': '{{count}} שיעורים', 'today.sessionCount.one': 'שיעור אחד' } },
    en: { ...EMPTY, schedule: { 'today.sessionCount': '{{count}} sessions', 'today.sessionCount.one': '1 session' } },
    ru: { ...EMPTY, schedule: {} },
  }

  it('uses the singular variant for count === 1', () => {
    expect(translatePlural(synthetic, 'he', 'schedule.today.sessionCount', 1)).toBe('שיעור אחד')
    expect(translatePlural(synthetic, 'en', 'schedule.today.sessionCount', 1)).toBe('1 session')
  })

  it('falls back to the base (interpolated) key when no singular variant is defined', () => {
    expect(translatePlural(synthetic, 'he', 'schedule.today.sessionCount', 0)).toBe('0 שיעורים')
    expect(translatePlural(synthetic, 'he', 'schedule.today.sessionCount', 2)).toBe('2 שיעורים')
    expect(translatePlural(synthetic, 'he', 'schedule.today.sessionCount', 5)).toBe('5 שיעורים')
  })

  it('falls back through the locale chain when a locale has no singular variant of its own', () => {
    // ru's schedule bundle is empty above -- both the base key and the .one variant are
    // missing, so this must reach he's base key exactly as `translate` already does,
    // not throw and not return a raw `{{count}}` template.
    expect(translatePlural(synthetic, 'ru', 'schedule.today.sessionCount', 1)).toBe('שיעור אחד')
  })

  it('interpolates extra params alongside count', () => {
    const withName = {
      he: { ...EMPTY, comms: { 'atRisk.body': '{{name}} נעדר {{count}} שיעורים ברצף' } },
      en: EMPTY,
      ru: EMPTY,
    }
    expect(translatePlural(withName, 'he', 'comms.atRisk.body', 3, { name: 'דני' })).toBe(
      'דני נעדר 3 שיעורים ברצף',
    )
  })
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
