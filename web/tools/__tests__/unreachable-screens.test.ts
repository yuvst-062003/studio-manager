import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The P1/S2 guard. The audit found 14 built, tested screens referenced only by their
 * feature's barrel `index.ts` and rendered by nothing — an entire post-lesson surface,
 * the product's only absence-report producer, the parent student card. This fails when
 * a PascalCase component a barrel exports has no reference anywhere else in its app:
 * not routed, not imported by a sibling, not mounted. Tests do not count — every one of
 * the 14 was tested; that is what made them invisible.
 */

const WEB = resolve(new URL('../..', import.meta.url).pathname)
const APPS = ['dashboard', 'parent', 'staff'] as const

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe.each(APPS)('reachability in apps/%s', (app) => {
  it('every component a feature barrel exports is referenced outside the barrel', () => {
    const appDir = join(WEB, 'apps', app, 'src')
    const files = sourceFiles(appDir).map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    const orphans: string[] = []

    for (const { path, text } of files) {
      const posix = path.replaceAll('\\', '/')
      if (!/features\/[^/]+\/index\.ts$/.test(posix)) continue
      for (const match of text.matchAll(/^export \{([^}]+)\} from '([^']+)'/gm)) {
        for (const raw of match[1]!.split(',')) {
          const name = raw.trim().split(/\s+as\s+/).pop()!.trim()
          // Components only: PascalCase values with a lowercase letter — ALL_CAPS
          // constants and camelCase clients/hooks/helpers are not screens.
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(name) || /^[A-Z0-9_]+$/.test(name)) continue
          // A reference is any occurrence that is not the declaration and not a
          // re-export line — so a component that registers ITSELF into a slot from its
          // own file counts as mounted, and one that only declares itself does not.
          const referenced = files.some(({ text: otherText }) => {
            const stripped = otherText
              // Module paths are not references — `from './HandOverSheet'` on a
              // type-only re-export must not make the component count as used.
              .replaceAll(/from\s+'[^']+'/g, 'from ""')
              .replaceAll(new RegExp(`^export \\{[^}]*\\b${name}\\b[^}]*\\}.*$`, 'gm'), '')
              .replaceAll(new RegExp(`export (function|const|class) ${name}\\b`, 'g'), '')
            return new RegExp(`\\b${name}\\b`).test(stripped)
          })
          if (!referenced) orphans.push(`${name} (only ${posix.slice(WEB.length + 1)})`)
        }
      }
    }
    // Built, tested, and rendered by nothing. Route it, mount it, or delete it —
    // exporting it from a barrel is not shipping it.
    expect(orphans).toEqual([])
  })
})
