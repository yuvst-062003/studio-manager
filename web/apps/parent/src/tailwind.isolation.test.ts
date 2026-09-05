// §9 — the contract that lets two styling systems share one app.
//
// This app loads Tailwind for the onboarding wizard while every other screen is drawn by
// @studio/ui. That is only safe because of one asymmetry, and this file is what keeps it
// true: Tailwind's UTILITIES cannot collide with @studio/ui (different namespaces), but
// its PREFLIGHT is element selectors -- `*`, `h1`-`h6`, `a`, `button`, `ol`, `img` -- and
// loading those globally silently restyles every screen in the app.
//
// The failure this guards is invisible in a diff and obvious on a screen: someone writes
// `@import "tailwindcss"` because that is what every Tailwind tutorial says, the app still
// compiles, every test still passes, and the manager's roster loses its list bullets.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(readFileSync(resolve(process.cwd(), 'apps/parent/src/tailwind.css'), 'utf-8'))

//: Every preflight rule that is an element selector. If one of these ever appears
//: unscoped, it reaches the whole app.
const PREFLIGHT_ELEMENT_SELECTORS = [
  'h1',
  'h2',
  'a',
  'b',
  'ol',
  'ul',
  'menu',
  'img',
  'svg',
  'button',
  'input',
  'select',
  'textarea',
  'table',
]

describe('§9 — Tailwind coexists with @studio/ui', () => {
  it('never imports "tailwindcss" wholesale, because that carries preflight', () => {
    // The one line that would undo all of this.
    expect(css).not.toMatch(/@import\s+["']tailwindcss["']/)
  })

  it('imports theme and utilities, and not preflight', () => {
    expect(css).toMatch(/@import\s+["']tailwindcss\/theme\.css["']\s+layer\(theme\)/)
    expect(css).toMatch(/@import\s+["']tailwindcss\/utilities\.css["']\s+layer\(utilities\)/)
    expect(css).not.toMatch(/preflight/)
  })

  it('orders the layers so a utility still beats the scoped reset', () => {
    // Scoping costs specificity: `.tw-scope *` is (0,1,0) and would tie with a utility
    // and win on source order. Layer order is what settles it instead, so this ordering
    // is load-bearing rather than decorative.
    expect(css).toMatch(/@layer\s+theme\s*,\s*base\s*,\s*components\s*,\s*utilities\s*;/)
  })

  it('gives .tw-scope back the ten variables both systems name', () => {
    // Tailwind's theme defines 419 custom properties; ten are also design-system tokens.
    // tokens.css/fonts.css are UNLAYERED so they win at :root and the rest of the app is
    // safe — but that leaves the wizard's own utilities resolving to the studio's scale
    // rather than the one the ported markup was drawn against. This is the counterweight.
    //
    // Checked because the first pass compared CLASS names (which cannot collide) and never
    // compared variable names (which do).
    const shared = [
      'leading-tight',
      'leading-snug',
      'leading-normal',
      'leading-relaxed',
      'radius-xs',
      'radius-sm',
      'radius-md',
      'radius-lg',
      'radius-xl',
    ]
    const block = /\.tw-scope\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    for (const name of shared) {
      expect(block).toMatch(new RegExp(`--${name}\\s*:`))
    }
  })

  it('does not override --font-sans, which both systems agree on', () => {
    // The prototype asks for Rubik and fonts.css already provides it. Overriding here
    // would be a second owner for one value.
    const block = /\.tw-scope\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).not.toMatch(/--font-sans/)
  })

  it('scopes every reset rule to .tw-scope', () => {
    const base = /@layer\s+base\s*\{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? ''
    expect(base).not.toBe('')

    // Selector lists only -- the text before each `{`.
    const selectors = [...base.matchAll(/(^|\})\s*([^{}]+)\{/g)]
      .map((m) => (m[2] ?? '').trim())
      .filter(Boolean)
      .flatMap((list) => list.split(',').map((s) => s.trim()))
      .filter(Boolean)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector.startsWith('.tw-scope')).toBe(true)
    }
  })

  it('leaves no preflight element selector unscoped', () => {
    for (const element of PREFLIGHT_ELEMENT_SELECTORS) {
      // `\n button {` or `, h1 {` at the start of a selector, with no `.tw-scope` ahead
      // of it on that line.
      const unscoped = new RegExp(`(^|[,\\n])\\s*${element}\\s*[,{]`, 'm')
      const match = unscoped.exec(css)
      if (match) {
        const line = css.slice(0, match.index).split('\n').length
        expect(
          `${element} is unscoped at line ${line}; every reset must start with .tw-scope`,
        ).toBe('')
      }
    }
  })

  it('does not re-declare what tokens.css already provides globally', () => {
    // box-sizing on `*`, `body { margin: 0 }` and `font-family: inherit` on form controls
    // are already set app-wide and compatibly. Repeating them here would be two owners
    // for one rule, which is how they drift.
    expect(css).not.toMatch(/\.tw-scope\s+body/)
    // `font: inherit` inside the scope is deliberate and different from tokens.css's
    // family-only rule -- see the comment there. Assert it is present, so a future
    // "tidy-up" that aligns them does not silently resize every control in the wizard.
    expect(css).toMatch(/font:\s*inherit/)
  })
})
