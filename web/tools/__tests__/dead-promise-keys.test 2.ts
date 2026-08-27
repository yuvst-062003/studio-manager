import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundles } from '@studio/i18n'

/**
 * The F8/P10 guard. Eleven screens told the manager a feature was coming that had
 * shipped waves ago — the worst self-contradicting on the same screen that registered
 * the promised sections. The mechanical rule that keeps the class closed: a `*Later` /
 * `*ComesLater` i18n key that no component references is dead and must be deleted.
 * (A referenced one may still be honest — the calendar's line was honest for a wave —
 * but an unreferenced one is pure debris.)
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

describe('promises that outlived their feature', () => {
  it('every *Later i18n key is referenced by a component', () => {
    const corpus = ROOTS.flatMap((root) => sourceFiles(join(WEB, root)))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    const dead: string[] = []
    for (const [ns, bundle] of Object.entries(bundles.he)) {
      for (const key of Object.keys(bundle)) {
        if (!/Later/.test(key)) continue
        if (!corpus.includes(`${ns}.${key}`)) dead.push(`${ns}.${key}`)
      }
    }
    expect(dead).toEqual([])
  })
})
