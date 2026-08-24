import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
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
  const out: Record<string, string> = {}
  let cursor = 0
  let blocks = 0
  for (;;) {
    const start = css.indexOf(selector, cursor)
    if (start === -1) break
    const open = css.indexOf('{', start)
    const close = css.indexOf('}', open)
    if (open === -1 || close === -1) break
    blocks += 1
    for (const match of css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const [, name, value] = match
      if (name && value) out[name] = value.trim()
    }
    cursor = close + 1
  }
  if (blocks === 0) throw new Error(`tokens.css has no ${selector} block`)
  return out
}

const LIGHT = readTokenBlock(':root')
const DARK = readTokenBlock('[data-theme="dark"]')

describe('the roles table and tokens.css are in exact bijection', () => {
  it('finds a non-trivial number of tokens in each block, so a parse failure cannot pass silently', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(30)
    expect(Object.keys(DARK).length).toBeGreaterThan(10)
  })

  it('declares no custom property outside the two audited blocks', () => {
    // The backstop for the parser itself. A token declared inside `html { }`, inside a
    // media query, or in a second `:root { }` would otherwise never reach TOKEN_ROLES
    // and would be audited by nothing at all.
    const declared = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]).filter((n): n is string => !!n),
    )
    const audited = new Set([...Object.keys(LIGHT), ...Object.keys(DARK)])
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
