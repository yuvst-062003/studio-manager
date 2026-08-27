import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two guard tests S1 asks for, held as one class rather than two instances.
 *
 * The defect they close: the staff app shipped with `registerHealthSections` exported
 * and called by nothing, so a coach taking a register saw no health flag on any row —
 * §5.5's coach-facing safety surface, absent from the running app. And its conflict
 * cards registered into `alert-centre`, a container only the DASHBOARD bundle mounts,
 * so §10.5's cards could render in no app at all. Neither failure is visible to a
 * screenshot, a typecheck, or a unit test of the component — both components worked;
 * the wiring did not exist.
 */

const WEB = resolve(new URL('../..', import.meta.url).pathname)
const APPS = ['dashboard', 'parent', 'staff'] as const

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

type Sources = { path: string; text: string }[]

function read(files: string[]): Sources {
  return files.map((path) => ({ path, text: readFileSync(path, 'utf8') }))
}

/** Every app's bundle includes @studio/ui, where the shared containers live. */
const UI_SOURCES = read(sourceFiles(join(WEB, 'packages/ui/src')))

describe.each(APPS)('slot wiring in apps/%s', (app) => {
  const appDir = join(WEB, 'apps', app, 'src')
  const appSources = read(sourceFiles(appDir))
  const bundle = [...appSources, ...UI_SOURCES]

  it('calls every register* function a feature barrel exports', () => {
    const orphans: string[] = []
    for (const { path, text } of appSources) {
      if (!/features\/[^/]+\/index\.ts$/.test(path.replaceAll('\\', '/'))) continue
      for (const match of text.matchAll(/export \{([^}]+)\}/g)) {
        for (const raw of match[1]!.split(',')) {
          const name = raw.trim().split(/\s+as\s+/).pop()!.trim()
          if (!/^register[A-Z]/.test(name)) continue
          const invoked = appSources.some(({ text: other }) =>
            // A definition is `function name(`; anything else followed by `(` is a call.
            new RegExp(`\\b${name}\\(`).test(other.replaceAll(`function ${name}(`, '')),
          )
          if (!invoked) orphans.push(`${name} (exported by ${path.slice(WEB.length + 1)})`)
        }
      }
    }
    // A register* export nothing calls is a fill that exists in no running app.
    expect(orphans).toEqual([])
  })

  it('has a useSlot container in this bundle for every registerSlot target', () => {
    const registered = new Map<string, string[]>()
    const containers = new Set<string>()
    for (const { path, text } of bundle) {
      for (const match of text.matchAll(/registerSlot\s*(?:<[^>]*>)?\s*\(\s*'([a-z][a-z0-9-]*)'/g)) {
        const id = match[1]!
        registered.set(id, [...(registered.get(id) ?? []), path.slice(WEB.length + 1)])
      }
      for (const match of text.matchAll(/useSlot\s*(?:<[^>]*>)?\s*\(\s*'([a-z][a-z0-9-]*)'/g)) {
        containers.add(match[1]!)
      }
    }
    const orphans = [...registered.entries()]
      .filter(([id]) => !containers.has(id))
      .map(([id, files]) => `'${id}' registered by ${files.join(', ')} has no useSlot here`)
    // Slots register at module load inside the bundle that imports the barrel; a target
    // with no container in the SAME bundle renders nowhere, silently.
    expect(orphans).toEqual([])
  })
})
