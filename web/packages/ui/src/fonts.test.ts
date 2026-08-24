import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKEN_ROLES } from './tokens.roles'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(readFileSync(resolve(process.cwd(), 'packages/ui/src/fonts.css'), 'utf-8'))
const tokens = strip(readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf-8'))

const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '')
const declared = (block: string, prop: string) =>
  new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? ''

describe('D6/G14 — one family, one loading strategy', () => {
  it('declares exactly one font-family across every @font-face', () => {
    // "One family also means one loading strategy, which matters for a PWA that must work
    // offline (§6.1) — every extra family is another asset to cache before a coach walks
    // into a basement."
    const families = new Set(faces.map((f) => declared(f, 'font-family')))
    expect(families.size).toBe(1)
    expect([...families][0]).toMatch(/Rubik/)
  })

  it('ships the four subsets SPEC §9 needs, and not the ones it does not', () => {
    // Base cyrillic U+0400-045F is where Russian lives — D6's whole argument for Rubik
    // over Heebo, Assistant and the two Noto/Plex families, which carry only
    // cyrillic-ext (U+0460-052F) and would silently fall back for a Russian parent.
    expect(faces).toHaveLength(4)
    const ranges = faces.map((f) => declared(f, 'unicode-range')).join(' ')
    expect(ranges).toMatch(/U\+0590-05FF/i) // hebrew
    expect(ranges).toMatch(/U\+0400-045F/i) // cyrillic, base
    expect(ranges).toMatch(/U\+0000-00FF/i) // latin
    expect(ranges).toMatch(/U\+0100-02BA/i) // latin-ext
    expect(ranges).not.toMatch(/U\+0600-06FF/i) // arabic, deliberately omitted
  })

  it('every weight the token layer names falls inside the declared variable axis', () => {
    // This is the assertion that actually answers "is weight 700 available offline".
    // Counting files would assert something false: Rubik is a VARIABLE font, so one file
    // per subset carries the whole axis and there are not five files to count.
    const weightTokens = Object.keys(TOKEN_ROLES).filter((t) => t.startsWith('--weight-'))
    expect(weightTokens.length).toBeGreaterThan(0)

    const weights = weightTokens.map((t) =>
      Number(new RegExp(`${t}\\s*:\\s*(\\d+);`).exec(tokens)?.[1]),
    )
    expect(weights.every((w) => Number.isFinite(w))).toBe(true)
    // G14 — Rubik 300/400/500/600/700.
    expect(weights.sort((a, b) => a - b)).toEqual([300, 400, 500, 600, 700])

    for (const face of faces) {
      const axis = declared(face, 'font-weight').split(/\s+/).map(Number)
      const [min, max] = axis
      expect(axis, 'a static font-weight would mean the axis is not variable').toHaveLength(2)
      for (const w of weights) {
        expect(w, `weight ${w} is outside the declared axis ${min}-${max}`).toBeGreaterThanOrEqual(
          min as number,
        )
        expect(w).toBeLessThanOrEqual(max as number)
      }
    }
  })

  it('uses font-display: swap on every face, so text is never invisible while loading', () => {
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) expect(declared(face, 'font-display')).toBe('swap')
  })

  it('names the family in --font-sans with real fallbacks behind it', () => {
    const fontSans = declared(css, '--font-sans')
    expect(fontSans).toMatch(/Rubik Variable/)
    expect(fontSans).toMatch(/sans-serif/)
  })
})
