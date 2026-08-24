import { describe, expect, it } from 'vitest'
import { BRAND_TOKENS, applyBrand, brandOverridesFor } from './brand'
import { TOKEN_ROLES } from './tokens.roles'

describe('D2 — the brand tier is exactly the hue and its on-colour (D1)', () => {
  it('names only brand-tier tokens', () => {
    expect([...BRAND_TOKENS].sort()).toEqual(['--brand-on-primary', '--brand-primary'])
  })

  it('is derived from the roles table, so the two can never drift apart', () => {
    const fromRoles = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'brand')
      .map(([t]) => t)
      .sort()
    expect([...BRAND_TOKENS].sort()).toEqual(fromRoles)
  })
})

describe('a studio-supplied value cannot reach a semantic or structural token', () => {
  it('drops every semantic token D2 lists', () => {
    const hostile = {
      '--debt': '#00ff00',
      '--paid': '#00ff00',
      '--pending': '#00ff00',
      '--cancelled': '#00ff00',
      '--danger': '#00ff00',
      '--focus-ring': '#00ff00',
      '--brand-primary': '#123456',
    }
    expect(brandOverridesFor(hostile)).toEqual({ '--brand-primary': '#123456' })
  })

  it('drops structural tokens — type scale, spacing, radii, motion, and the belt ring', () => {
    const hostile = {
      '--fg': '#00ff00',
      '--ground': '#00ff00',
      '--belt-ring': 'transparent',
      '--belt-ring-width': '0',
      '--radius-md': '40px',
      '--text-body': '40px',
      '--motion-base': '9999ms',
    }
    expect(brandOverridesFor(hostile)).toEqual({})
  })

  it('drops anything that is not a token at all, including a CSS injection attempt', () => {
    const hostile = {
      color: 'red',
      '--brand-primary; --debt': '#00ff00',
      '--unknown-token': '#00ff00',
    }
    expect(brandOverridesFor(hostile)).toEqual({})
  })

  it('reads only own properties, so a prototype-polluted object cannot smuggle one in', () => {
    const hostile = Object.create({ '--brand-primary': '#00ff00' }) as Record<string, string>
    expect(brandOverridesFor(hostile)).toEqual({})
  })
})

describe('applyBrand writes only through that gate', () => {
  it('leaves --debt at its stylesheet value when a studio tries to set it', () => {
    const el = document.createElement('div')
    el.style.setProperty('--debt', '#b3261e')

    applyBrand(el, { '--debt': '#00ff00', '--brand-primary': '#123456' })

    // The behavioural assertion: the element's own --debt is untouched and the brand hue
    // did land. A test over the filter function alone would not catch applyBrand
    // bypassing it.
    expect(el.style.getPropertyValue('--debt')).toBe('#b3261e')
    expect(el.style.getPropertyValue('--brand-primary')).toBe('#123456')
  })

  it('writes nothing at all when a studio supplies only forbidden tokens', () => {
    const el = document.createElement('div')
    applyBrand(el, { '--focus-ring': '#00ff00', '--fg': '#00ff00' })
    expect(el.getAttribute('style')).toBeNull()
  })
})
