import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsAA, meetsNonText, relativeLuminance } from './contrast'

/**
 * Every expected value below is quoted from the contrast audit at the bottom of
 * docs/design/canvas-review.md. This test's job is to prove our arithmetic agrees with
 * the audit that D7 and D8 were decided from — if it ever disagrees, one of the two is
 * wrong and the decisions need rereading, not a tolerance bump.
 */
const LIGHT_GROUND = '#f7f5f1'
const LIGHT_SURFACE = '#fffefb'
const DARK_GROUND = '#141311'

const LIGHT_CASES: readonly (readonly [string, number, string])[] = [
  ['#17150f', 16.76, 'ink'],
  ['#55524a', 7.16, 'secondary'],
  ['#6f6b62', 4.88, 'tertiary — the D8 floor'],
  ['#7a766d', 4.16, 'retired grey'],
  ['#8f8b82', 3.12, 'retired grey'],
  ['#a8a49a', 2.28, 'retired grey'],
  ['#b3261e', 6.0, 'debt red'],
  ['#1f6b3f', 5.97, 'paid green'],
  ['#8a5a00', 5.44, 'pending amber'],
]

const DARK_CASES: readonly (readonly [string, number])[] = [
  ['#fffefb', 18.41],
  ['#a8a49a', 7.46],
  ['#8f8b82', 5.47],
]

const BELT_CASES: readonly (readonly [string, number, string])[] = [
  ['#6f4a2f', 7.15, 'brown'],
  ['#2f6fa8', 4.87, 'blue'],
  ['#c76a1e', 3.5, 'orange'],
  ['#d9a800', 2.02, 'yellow — fails even the 3:1 non-text threshold'],
]

describe('contrastRatio reproduces the published light-mode audit', () => {
  it.each(LIGHT_CASES)('%s on the light ground is %s:1 (%s)', (hex, expected) => {
    expect(contrastRatio(hex, LIGHT_GROUND)).toBeCloseTo(expected, 2)
  })

  it('#a8a49a is 2.47 on the lighter card ground — still failing', () => {
    expect(contrastRatio('#a8a49a', LIGHT_SURFACE)).toBeCloseTo(2.47, 2)
  })
})

describe('contrastRatio reproduces the published dark-mode audit', () => {
  it.each(DARK_CASES)('%s on the dark ground is %s:1', (hex, expected) => {
    expect(contrastRatio(hex, DARK_GROUND)).toBeCloseTo(expected, 2)
  })
})

describe('contrastRatio reproduces the published belt audit', () => {
  it.each(BELT_CASES)('%s on the light ground is %s:1 (%s)', (hex, expected) => {
    expect(contrastRatio(hex, LIGHT_GROUND)).toBeCloseTo(expected, 2)
  })
})

describe('the ratio is symmetric and bounded, as WCAG defines it', () => {
  it('does not care which colour is named first', () => {
    expect(contrastRatio('#17150f', LIGHT_GROUND)).toBeCloseTo(
      contrastRatio(LIGHT_GROUND, '#17150f'),
      10,
    )
  })

  it('is 1 for a colour against itself and 21 for black against white', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 10)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
  })

  it('anchors relative luminance at the two extremes', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 10)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
  })
})

describe('the two thresholds are named, so no caller writes a bare number', () => {
  it('meetsAA is the 4.5:1 normal-text threshold (SC 1.4.3)', () => {
    expect(meetsAA('#6f6b62', LIGHT_GROUND)).toBe(true) // 4.88
    expect(meetsAA('#7a766d', LIGHT_GROUND)).toBe(false) // 4.16
  })

  it('meetsNonText is the 3:1 graphical-object threshold (SC 1.4.11)', () => {
    expect(meetsNonText('#c76a1e', LIGHT_GROUND)).toBe(true) // 3.50
    expect(meetsNonText('#d9a800', LIGHT_GROUND)).toBe(false) // 2.02
  })
})

describe('input handling', () => {
  it('accepts three-digit shorthand and is case-insensitive', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 10)
    expect(contrastRatio('#AbCdEf', '#abcdef')).toBeCloseTo(1, 10)
  })

  it('throws on anything that is not a hex colour, rather than returning a plausible number', () => {
    // A silent NaN here would make every downstream contrast assertion pass vacuously,
    // which is the failure mode this whole file exists to prevent.
    expect(() => contrastRatio('var(--fg)', '#fff')).toThrow(/hex colour/i)
    expect(() => contrastRatio('#12345', '#fff')).toThrow(/hex colour/i)
    expect(() => contrastRatio('rebeccapurple', '#fff')).toThrow(/hex colour/i)
  })
})
