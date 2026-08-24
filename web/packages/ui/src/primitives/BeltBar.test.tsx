import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../contrast'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { BeltBar } from './BeltBar'

/** The belts the contrast audit measured. Per-studio data, never tokens (D3, §5.9). */
const BELTS = {
  white: '#fffefb',
  yellow: '#d9a800',
  orange: '#c76a1e',
  green: '#1f6b3f',
  blue: '#2f6fa8',
  brown: '#6f4a2f',
  black: '#17150f',
} as const

describe.each(DIRECTIONS)('BeltBar in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is announced by its rank name, not by its colour', () => {
      // SC 1.4.1 — colour is never the only carrier of meaning. A screen reader must say
      // "חגורה כתומה", never "orange rectangle".
      renderIn(<BeltBar colorHex={BELTS.orange} label="חגורה כתומה" />, { locale, theme })
      expect(screen.getByRole('img', { name: 'חגורה כתומה' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('does not mirror with direction — a belt has no inherent direction (§9)', () => {
      renderIn(<BeltBar colorHex={BELTS.blue} label="חגורה כחולה" />, { locale, theme })
      expect(screen.getByRole('img').style.transform).toBe('')
    })

    it('carries the ring in every direction and both themes', () => {
      renderIn(<BeltBar colorHex={BELTS.white} label="חגורה לבנה" />, { locale, theme })
      expect(screen.getByRole('img').style.boxShadow).toContain('var(--belt-ring)')
    })
  })
})

describe('D7/G10 — every belt bar carries a 1px ring, and nothing can turn it off', () => {
  it.each(Object.entries(BELTS))('rings the %s belt', (_name, hex) => {
    renderIn(<BeltBar colorHex={hex} label="belt" />)
    const bar = screen.getByRole('img')
    // Inline, so it is observable here. A stylesheet ring would be asserted nowhere:
    // jsdom applies no CSS rules.
    expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    expect(bar.style.boxShadow).toContain('var(--belt-ring-width)')
    expect(bar.style.boxShadow).toContain('inset')
  })

  it('rings a bi-colour belt too', () => {
    renderIn(<BeltBar colorHex={BELTS.white} label="לבנה-צהובה" secondaryColorHex={BELTS.yellow} />)
    expect(screen.getByRole('img').style.boxShadow).toContain('var(--belt-ring)')
  })

  it('accepts no prop that could produce a fill-only bar', () => {
    // G10: "there is NO fill-only variant to reach for". Only source can be checked for
    // the ABSENCE of a prop; the behavioural half is every other case in this file, where
    // the ring is present for all seven belts, bi-colour, both directions, both themes.
    const signature = /\{([^}]*)\}/.exec(BeltBar.toString())?.[1] ?? ''
    const declared = signature
      .replace(/\s/g, '')
      .split(',')
      .filter(Boolean)
      .sort()
    expect(declared).toEqual(['colorHex', 'label', 'secondaryColorHex'])
  })

  it('carries the fill it was handed, since belt colour is per-studio data', () => {
    renderIn(<BeltBar colorHex="#d9a800" label="צהובה" />)
    // jsdom normalises hex to rgb() in inline styles.
    expect(screen.getByRole('img').style.background).toContain('rgb(217, 168, 0)')
  })

  it('renders a bi-colour belt as two halves of one bar', () => {
    renderIn(<BeltBar colorHex="#fffefb" label="לבנה-צהובה" secondaryColorHex="#d9a800" />)
    const background = screen.getByRole('img').style.background
    expect(background).toContain('linear-gradient')
    expect(background).toContain('rgb(255, 254, 251)')
    expect(background).toContain('rgb(217, 168, 0)')
  })
})

describe('why the ring is unconditional — the numbers, recomputed', () => {
  it('fill alone loses white on light and black on dark', () => {
    expect(contrastRatio(BELTS.white, '#f7f5f1')).toBeLessThan(1.1)
    expect(contrastRatio(BELTS.black, '#141311')).toBeLessThan(1.1)
  })

  it('fill alone loses yellow on light even at the 3:1 non-text threshold', () => {
    expect(contrastRatio(BELTS.yellow, '#f7f5f1')).toBeLessThan(3)
  })

  it('and loses brown and green on dark, which the canvas review never measured', () => {
    expect(contrastRatio(BELTS.brown, '#141311')).toBeLessThan(3)
    expect(contrastRatio(BELTS.green, '#141311')).toBeLessThan(3)
  })
})
