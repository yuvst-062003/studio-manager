import { describe, expect, it } from 'vitest'
import { DIRECTION, NAMESPACES, REFERENCE_LOCALE, t, bundles } from '../index'

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
  it('returns the Hebrew string when a key is missing in ru', () => {
    expect(t('ru', 'common.appName.staff')).toBe(t('he', 'common.appName.staff'))
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
