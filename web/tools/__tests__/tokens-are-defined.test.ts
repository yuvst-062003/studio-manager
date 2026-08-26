// Every `var(--token)` in the tree names a token some stylesheet actually defines.
//
// **Why this needed a test rather than a lint rule.** An undefined custom property is not
// an error anywhere: CSS calls it "invalid at computed-value time" and falls back to the
// inherited value, or to the initial value if the property does not inherit. So the page
// renders, nothing logs, and the failure is silent and typed.
//
// It had already happened seven times when this was written, and the worst of them was
// `--scrim`. `NavDrawer` set `background: var(--scrim)` on its modal backdrop; `background`
// does not inherit, so the declaration resolved to `transparent` and the drawer opened over
// a fully legible page with nothing dimming it. A reviewer reading the source sees a scrim.
// A user never had one.
//
// The rest were a second naming scheme leaking in: `--radius-1`/`--radius-2` against a scale
// that reads xs/sm/md/lg/xl, and `--text`/`--text-sm` against `--fg` and `--text-caption`.
// Those were rewritten to the real tokens rather than aliased — a design system with two
// names for one value has stopped being a system.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = join(import.meta.dirname, '..', '..')
const SELF = join(import.meta.dirname, 'tokens-are-defined.test.ts')
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.vite'])
const SOURCE = /\.(ts|tsx|css)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    // The generated API client is 500 KB of types with no CSS in it, and reading it on
    // every run costs more than it could ever catch.
    // This file is excluded from its own scan: it has to WRITE `var(--…)` in prose and in
    // its regexes to explain and to do its job, and a scanner that flags its own examples
    // is a scanner nobody can document.
    else if (SOURCE.test(entry) && !entry.endsWith('schema.d.ts') && full !== SELF) {
      out.push(full)
    }
  }
  return out
}

const FILES = walk(WEB)

function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const file of FILES) {
    if (!file.endsWith('.css')) continue
    for (const match of readFileSync(file, 'utf8').matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
      // The capture group is non-optional in the pattern, but `noUncheckedIndexedAccess`
      // types every index access as possibly-undefined and a match with no group 1 cannot
      // occur. Skipping is cheaper than asserting.
      if (match[1]) defined.add(match[1])
    }
  }
  return defined
}

describe('CSS custom properties', () => {
  it('defines every token the tree references', () => {
    const defined = definedTokens()
    const undefinedUses: string[] = []

    for (const file of FILES) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
        const token = match[1]
        if (!token) continue
        // A token assembled at runtime — `var(--space-${n})` — reaches this regex as the
        // literal prefix `--space-`. It is not a reference to a token of that name, and
        // the interpolated result cannot be checked statically.
        if (token.endsWith('-')) continue
        if (!defined.has(token)) undefinedUses.push(`${relative(WEB, file)} → ${token}`)
      }
    }

    expect(undefinedUses).toEqual([])
  })

  it('gives the theme-sensitive tokens a value in BOTH themes', () => {
    // A token defined only on `:root` silently keeps its light value in dark mode. That is
    // correct for a structural token — a radius does not have a theme — and wrong for
    // anything that carries colour, which is why the list is explicit rather than inferred.
    const tokens = readFileSync(join(WEB, 'packages/ui/src/tokens.css'), 'utf8')
    const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'))
    expect(dark.length).toBeGreaterThan(0)

    for (const token of ['--scrim', '--surface-raised', '--surface', '--ground', '--fg']) {
      expect(dark, `${token} has no dark-mode value`).toContain(`${token}:`)
    }
  })
})
