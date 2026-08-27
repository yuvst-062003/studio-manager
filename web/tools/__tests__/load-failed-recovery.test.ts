import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The F1a/P8/S11 guard, two rules for two observed failure classes:
 *
 * 1. A screen that renders a `*.loadFailed` string must do it through the `LoadFailed`
 *    primitive — the copy without the retry is a dead end, and a browser refresh is not
 *    an escape because these apps register a service worker that may serve the same
 *    failure from cache.
 * 2. `.catch(… setLoaded(true))` is banned: a failed load that reports itself as loaded
 *    renders the EMPTY state — "no messages", "no events", an empty belt ladder — which
 *    is a lie about the club told by the network. Six screens shipped with it.
 */

const WEB = resolve(new URL('../..', import.meta.url).pathname)
const ROOTS = ['apps/dashboard/src', 'apps/parent/src', 'apps/staff/src', 'packages/ui/src']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const FILES = ROOTS.flatMap((root) => sourceFiles(join(WEB, root))).map((path) => ({
  path: path.slice(WEB.length + 1),
  text: readFileSync(path, 'utf8'),
}))

describe('recovery is a rule, not a favour', () => {
  it('every loadFailed string is rendered through the LoadFailed primitive', () => {
    const offenders = FILES.filter(
      ({ path, text }) =>
        !path.includes('primitives/LoadFailed') &&
        !path.includes('packages/i18n') &&
        /\.loadFailed'/.test(text) &&
        !text.includes('LoadFailed'),
    ).map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('no load failure masquerades as loaded-and-empty', () => {
    const offenders = FILES.filter(({ text }) =>
      /\.catch\([^)]*setLoaded\(true\)/.test(text),
    ).map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
