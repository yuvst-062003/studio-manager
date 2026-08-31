import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AA_TEXT, NON_TEXT, contrastRatio } from './contrast'
import { GROUND_COLOR } from './theme'
import { GROUND_TOKENS, TIERS, TOKEN_ROLES } from './tokens.roles'

// Read from cwd rather than import.meta.url: the jsdom environment rewrites
// import.meta.url to a non-file scheme. Same reason as tokens.test.ts.
const raw = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf-8')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Only source can be checked here: these are declared values in a stylesheet, and jsdom
 * resolves no custom properties across a cascade. The behavioural half — that a
 * primitive actually reaches for the token — is asserted in each primitive's own test.
 */
function readTokenBlock(selector: string): Record<string, string> {
  // EVERY block matching the selector, merged in document order so the cascade's "last
  // one wins" holds. Reading only the first is a real hole: a token added in a second
  // `:root { }` further down the file was invisible to this audit, and the plant that
  // proved the gate fires passed straight through it. Found by planting exactly that.
  //
  // The prelude is compared WHOLE, not by substring. `[data-theme="dark"]` is a prefix of
  // `[data-theme="dark"] [data-surface="outward"]`, so a substring match merged the
  // outward block's navy into the plain dark palette and audited neither one as itself —
  // both would have gone green while describing a stylesheet nobody wrote.
  const out: Record<string, string> = {}
  let blocks = 0
  let cursor = 0
  for (;;) {
    const open = css.indexOf('{', cursor)
    if (open === -1) break
    const close = css.indexOf('}', open)
    if (close === -1) break
    // The prelude runs from the end of the previous rule to this rule's brace. Commas
    // make one rule serve several selectors, so each is compared on its own.
    const prelude = css.slice(cursor, open).trim()
    const selectors = prelude
      .split(',')
      .map((s) => s.replaceAll(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (selectors.includes(selector)) {
      blocks += 1
      for (const match of css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
        const [, name, value] = match
        if (name && value) out[name] = value.trim()
      }
    }
    cursor = close + 1
  }
  if (blocks === 0) throw new Error(`tokens.css has no ${selector} block`)
  return out
}

const LIGHT = readTokenBlock(':root')
const DARK = readTokenBlock('[data-theme="dark"]')

/**
 * The outward-facing surface — the landing page and the parent app, which wear the club's
 * brand where the staff tools wear the neutral working palette (see
 * `docs/design/decisions.md`). One token block, so every `@studio/ui` primitive re-skins
 * without being forked.
 *
 * **This gate lands BEFORE the values it audits, and that is the point.** A second token
 * block the audit does not read is not a theme, it is a fork that rots silently: every
 * token added to `tokens.css` afterwards inherits a warm value into a navy screen, and
 * nothing fails.
 */
const OUTWARD_SELECTOR = '[data-surface="outward"]'
const OUTWARD_DARK_SELECTOR = '[data-theme="dark"] [data-surface="outward"]'
const OUTWARD = readTokenBlock(OUTWARD_SELECTOR)
const OUTWARD_DARK = readTokenBlock(OUTWARD_DARK_SELECTOR)

/** What a token actually resolves to on each of the four surface-and-theme combinations. */
const EFFECTIVE = {
  light: LIGHT,
  dark: { ...LIGHT, ...DARK },
  'outward light': { ...LIGHT, ...OUTWARD },
  // Both layers, in cascade order: the plain dark override first, then the outward one.
  'outward dark': { ...LIGHT, ...DARK, ...OUTWARD, ...OUTWARD_DARK },
} as const

describe('the roles table and tokens.css are in exact bijection', () => {
  it('finds a non-trivial number of tokens in each block, so a parse failure cannot pass silently', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(30)
    expect(Object.keys(DARK).length).toBeGreaterThan(10)
  })

  it('declares no custom property outside the four audited blocks', () => {
    // The backstop for the parser itself. A token declared inside `html { }`, inside a
    // media query, or in a second `:root { }` would otherwise never reach TOKEN_ROLES
    // and would be audited by nothing at all.
    const declared = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]).filter((n): n is string => !!n),
    )
    const audited = new Set([
      ...Object.keys(LIGHT),
      ...Object.keys(DARK),
      ...Object.keys(OUTWARD),
      ...Object.keys(OUTWARD_DARK),
    ])
    expect([...declared].filter((t) => !audited.has(t))).toEqual([])
  })

  it('every token declared in :root has a role', () => {
    const unclassified = Object.keys(LIGHT).filter((t) => !(t in TOKEN_ROLES))
    expect(
      unclassified,
      'add these to TOKEN_ROLES — an unclassified token is an unaudited one',
    ).toEqual([])
  })

  it('every token declared in the dark block has a role', () => {
    const unclassified = Object.keys(DARK).filter((t) => !(t in TOKEN_ROLES))
    expect(unclassified).toEqual([])
  })

  it('every role in the table names a token that actually exists', () => {
    const orphans = Object.keys(TOKEN_ROLES).filter((t) => !(t in LIGHT))
    expect(orphans, 'a role with no token is a stale entry — delete it or add the token').toEqual(
      [],
    )
  })

  it('every token the dark block overrides also exists in the light block', () => {
    // The dark block is an override layer, not a second palette. A token that existed
    // only in dark would be undefined in light mode and inherit from nowhere.
    const darkOnly = Object.keys(DARK).filter((t) => !(t in LIGHT))
    expect(darkOnly).toEqual([])
  })

  it('every colour-bearing token is overridden in the dark block', () => {
    // A colour NOT re-declared in dark keeps its light value on a dark ground, which is
    // exactly how a palette silently half-converts.
    const missing = Object.keys(TOKEN_ROLES).filter(
      (t) => TOKEN_ROLES[t]?.obligation.kind !== 'none' && !(t in DARK),
    )
    expect(missing, 'these carry colour and must have a dark value').toEqual([])
  })
})

describe('the outward surface is a theme, not a fork', () => {
  it('finds a non-trivial number of tokens in each outward block', () => {
    expect(Object.keys(OUTWARD).length).toBeGreaterThan(8)
    expect(Object.keys(OUTWARD_DARK).length).toBeGreaterThan(8)
  })

  it('overrides only tokens that already exist in :root', () => {
    // An override layer, not a second palette. A token defined only here would be
    // undefined on every inward screen and inherit from nowhere.
    const invented = [...Object.keys(OUTWARD), ...Object.keys(OUTWARD_DARK)].filter(
      (t) => !(t in LIGHT),
    )
    expect(invented, 'the outward block may re-value a token, never introduce one').toEqual([])
  })

  it('gives every token it overrides a role', () => {
    const unclassified = [...Object.keys(OUTWARD), ...Object.keys(OUTWARD_DARK)].filter(
      (t) => !(t in TOKEN_ROLES),
    )
    expect(unclassified).toEqual([])
  })

  it('re-values every colour it takes in light for dark as well', () => {
    // The failure this catches is precise: a navy screen keeping a warm light value on a
    // dark ground, because the outward block re-coloured only half the pair.
    const missing = Object.keys(OUTWARD).filter(
      (t) => TOKEN_ROLES[t]?.obligation.kind !== 'none' && !(t in OUTWARD_DARK),
    )
    expect(missing, 'these carry colour on the outward surface and need a dark value').toEqual([])
  })

  it('never touches the semantic band — D2, and the reason the debt banner survives a brand', () => {
    // Decision 2 of the redesign spec: the brand's palette is carried in, the semantic
    // band stays untouchable. The landing's crimson is a BRAND colour; red in this app
    // means a family owes money, and a club branding itself red still gets a working
    // debt banner only because these nine are out of reach.
    const semantic = [...Object.keys(OUTWARD), ...Object.keys(OUTWARD_DARK)].filter(
      (t) => TOKEN_ROLES[t]?.tier === 'semantic',
    )
    expect(semantic, 'the outward surface may not re-value a semantic token').toEqual([])
  })

  it('is the source of GROUND_COLOR, so a manifest cannot drift from the stylesheet', () => {
    // `theme.ts` promises these four ARE `--ground`. Nothing enforced it, and the promise
    // was already false for the parent app the moment the outward block landed: its
    // manifest and its status bar named the inward grey while the page painted navy-warm.
    // Asserted against the parsed CSS rather than restated, so the stylesheet stays the
    // one place a ground colour is decided.
    expect(GROUND_COLOR.inward.light).toBe(LIGHT['--ground'])
    expect(GROUND_COLOR.inward.dark).toBe(DARK['--ground'])
    expect(GROUND_COLOR.outward.light).toBe(OUTWARD['--ground'])
    expect(GROUND_COLOR.outward.dark).toBe(OUTWARD_DARK['--ground'])
  })

  it('derives its ramp from --brand-primary rather than adding brand tokens', () => {
    // `brandOverridesFor` is the one guarded path a studio colour takes into the token
    // layer. Six brand tokens would let a studio set six colours badly instead of one.
    const brand = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'brand')
      .map(([t]) => t)
    expect(brand.sort()).toEqual(['--brand-on-primary', '--brand-primary'])
    expect(OUTWARD).toHaveProperty('--brand-primary')
  })
})

describe('D2 — the three tiers, and nothing else', () => {
  it('classifies every token into exactly one of D2s three tiers', () => {
    expect(TIERS).toEqual(['brand', 'semantic', 'structural'])
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      expect(TIERS as readonly string[], `${token} has tier ${role.tier}`).toContain(role.tier)
    }
  })

  it('carries exactly D2s six semantic tokens, plus their tints — no more, no fewer', () => {
    const semantic = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'semantic')
      .map(([t]) => t)
      .sort()
    expect(semantic).toEqual(
      [
        '--cancelled',
        '--cancelled-tint',
        '--danger',
        '--danger-tint',
        '--debt',
        '--debt-tint',
        '--focus-ring',
        '--paid',
        '--pending',
      ].sort(),
    )
  })

  it('D1 — the brand tier exists but is only the hue and its on-colour', () => {
    const brand = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'brand')
      .map(([t]) => t)
      .sort()
    expect(brand).toEqual(['--brand-on-primary', '--brand-primary'])
  })

  it('every exemption states the success criterion that grants it', () => {
    // An exemption with no reason is indistinguishable from a token someone gave up on.
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      if (role.obligation.kind === 'exempt') {
        expect(role.obligation.why, `${token} is exempt but says nothing about why`).toMatch(
          /SC \d/,
        )
      }
    }
  })

  it('every ground named by an obligation is itself a declared ground token', () => {
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      if (role.obligation.kind === 'text' || role.obligation.kind === 'non-text') {
        for (const ground of role.obligation.on) {
          expect(GROUND_TOKENS as readonly string[], `${token} is measured against ${ground}`).toContain(
            ground,
          )
          expect(LIGHT).toHaveProperty(ground)
        }
      }
    }
  })
})

// Each block is an override LAYER, so an effective palette is the light block with the
// later ones laid over it. Auditing DARK alone would silently skip every token dark does
// not override — and auditing the outward blocks alone would skip far more, since the
// outward surface re-values a palette and inherits the whole type and spacing scale.
const MODES = [
  { name: 'light', tokens: EFFECTIVE.light },
  { name: 'dark', tokens: EFFECTIVE.dark },
  { name: 'outward light', tokens: EFFECTIVE['outward light'] },
  { name: 'outward dark', tokens: EFFECTIVE['outward dark'] },
] as const

const valueOf = (tokens: Record<string, string>, token: string): string => {
  const value = tokens[token]
  if (!value) throw new Error(`${token} is not declared — the bijection test should have caught this`)
  return value
}

describe.each(MODES)('$name mode — every token meets its own obligation', ({ tokens }) => {
  for (const [token, role] of Object.entries(TOKEN_ROLES)) {
    const { obligation } = role
    if (obligation.kind !== 'text' && obligation.kind !== 'non-text') continue
    const threshold = obligation.kind === 'text' ? AA_TEXT : NON_TEXT

    for (const ground of obligation.on) {
      it(`${token} on ${ground} reaches ${threshold}:1`, () => {
        const fg = valueOf(tokens, token)
        const bg = valueOf(tokens, ground)
        const ratio = contrastRatio(fg, bg)
        expect(
          ratio,
          `${token} (${fg}) on ${ground} (${bg}) is ${ratio.toFixed(2)}:1. ${role.note}`,
        ).toBeGreaterThanOrEqual(threshold)
      })
    }
  }
})

describe('D8 — the light-mode text floor is a computed floor, not a named hex', () => {
  it('no light-mode text token is lighter than #6f6b62 against the ground', () => {
    // Stated as a ratio rather than as a list of banned hexes, so a NEW too-light grey is
    // caught as well as the three D8 happened to name.
    const floor = contrastRatio('#6f6b62', valueOf(LIGHT, '--ground'))
    expect(floor).toBeCloseTo(4.88, 2)

    const offenders = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.obligation.kind === 'text')
      // --on-fg / --on-accent / --brand-on-primary are measured against their own fill,
      // not against the page, so the page ground says nothing about them.
      .filter(([token]) => !token.startsWith('--on-') && !token.startsWith('--brand-on-'))
      .map(([token]) => [token, contrastRatio(valueOf(LIGHT, token), valueOf(LIGHT, '--ground'))] as const)
      .filter(([, ratio]) => ratio < floor)
      .map(([token, ratio]) => `${token} at ${ratio.toFixed(2)}:1`)

    expect(offenders, 'these sit below D8’s #6f6b62 floor').toEqual([])
  })

  it('the three retired greys are gone from light mode, and two survive in dark only', () => {
    const lightValues = Object.values(LIGHT)
    expect(lightValues).not.toContain('#a8a49a')
    expect(lightValues).not.toContain('#8f8b82')
    expect(lightValues).not.toContain('#7a766d')

    const darkValues = Object.values(DARK)
    expect(darkValues).toContain('#a8a49a')
    expect(darkValues).toContain('#8f8b82')
    // #7a766d is retired outright — neither mode. At 4.16:1 it never passed.
    expect(darkValues).not.toContain('#7a766d')
  })

  it('the ground stays #f7f5f1 — D8 forbids fixing a grey by lightening it', () => {
    expect(LIGHT['--ground']).toBe('#f7f5f1')
  })
})

/**
 * D7 / G10. Belt colours are per-studio DATA (belt_rank.color_hex, SPEC §5.9), not
 * tokens — so this fixture is the set the contrast audit measured, kept here to prove the
 * ring is what rescues them. BeltBar takes a hex prop; it never reads these.
 */
const BELTS = {
  white: '#fffefb',
  yellow: '#d9a800',
  orange: '#c76a1e',
  green: '#1f6b3f',
  blue: '#2f6fa8',
  brown: '#6f4a2f',
  black: '#17150f',
} as const

describe('D7 — fill alone is not enough, which is why the ring is unconditional', () => {
  it('white belt is invisible on the light ground at 1.08:1', () => {
    expect(contrastRatio(BELTS.white, valueOf(LIGHT, '--ground'))).toBeCloseTo(1.08, 2)
  })

  it('black belt is invisible on the dark ground at 1.02:1', () => {
    expect(contrastRatio(BELTS.black, valueOf(DARK, '--ground'))).toBeCloseTo(1.02, 2)
  })

  it('yellow belt fails even the 3:1 non-text threshold on the light ground at 2.02:1', () => {
    const ratio = contrastRatio(BELTS.yellow, valueOf(LIGHT, '--ground'))
    expect(ratio).toBeCloseTo(2.02, 2)
    expect(ratio).toBeLessThan(NON_TEXT)
  })

  it('dark mode loses three more belts to fill alone, which the canvas review never covered', () => {
    // canvas-review.md audited belts against the LIGHT ground only. Recorded here so
    // nobody reads D7 as a three-case patch and adds a fill-only variant "just for dark".
    for (const belt of ['black', 'brown', 'green'] as const) {
      expect(contrastRatio(BELTS[belt], valueOf(DARK, '--ground'))).toBeLessThan(NON_TEXT)
    }
  })

  it.each(Object.entries(BELTS))('the %s belt bar is visible in BOTH modes', (_name, fill) => {
    // The real D7 claim: whatever the fill does, the BAR is distinguishable from the page,
    // because the ring is the current foreground colour. Five of these seven fail on fill
    // alone in one mode or the other.
    for (const { tokens } of MODES) {
      const ground = valueOf(tokens, '--ground')
      const byFill = contrastRatio(fill, ground)
      const byRing = contrastRatio(valueOf(tokens, '--belt-ring'), ground)
      expect(Math.max(byFill, byRing)).toBeGreaterThanOrEqual(NON_TEXT)
    }
  })

  it('the ring itself is what carries that, at 16.76 on light and 18.41 on dark', () => {
    expect(contrastRatio(valueOf(LIGHT, '--belt-ring'), valueOf(LIGHT, '--ground'))).toBeCloseTo(16.76, 2)
    expect(contrastRatio(valueOf(DARK, '--belt-ring'), valueOf(DARK, '--ground'))).toBeCloseTo(18.41, 2)
  })

  it('D7 says one pixel — a token, so no component can quietly drop it to zero', () => {
    expect(LIGHT['--belt-ring-width']).toBe('1px')
  })
})
