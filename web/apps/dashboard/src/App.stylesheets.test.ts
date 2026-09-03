// A1 — `features/attendance/attendance.css` existed, was 127 lines, and was imported by
// nobody. `App.tsx:40-44` imported five feature stylesheets and this was not one of them,
// and every complaint on `#/attendance` — the bare bullet list, the buttons painting over
// the row above, the staircase indent, the missing dashed card — traced to that one absent
// line. A unit test of `AttendanceSection` cannot catch this: jsdom renders the component
// fine with no stylesheet loaded at all. This is a source scan, on purpose, for the same
// reason `routes.reachable.test.ts` is one — the defect is the ABSENCE of an import, and
// absence is a property of the whole source tree, not of any one rendered screen.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const FEATURES = join(SRC, 'features')

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? allFiles(path) : [path]
  })
}

function sourceFiles(dir: string): string[] {
  return allFiles(dir).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
}

function cssFiles(dir: string): string[] {
  return allFiles(dir).filter((path) => path.endsWith('.css'))
}

/**
 * Every `.css` path any dashboard source file imports, resolved to an absolute path — so
 * `App.tsx`'s `import './features/home/home.css'` and `ReportsSection.tsx`'s own
 * `import './reports.css'` both land as the same kind of path a real module graph would
 * produce, however far from the entry point the import sits.
 *
 * This does not build a real module graph — it does not check that the importing file
 * itself is reachable from `App.tsx`. That is a weaker claim than "loaded when the app
 * runs", but it is the claim that catches THIS bug: a stylesheet whose only `import` is one
 * nobody wrote.
 */
function importedCssFiles(files: string[]): Set<string> {
  const imported = new Set<string>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/import\s+['"](\.[^'"]+\.css)['"]/g)) {
      imported.add(resolve(dirname(file), match[1]!))
    }
  }
  return imported
}

describe('every dashboard feature stylesheet is reachable from an import', () => {
  const stylesheets = cssFiles(FEATURES)
  const imported = importedCssFiles(sourceFiles(SRC))

  it('found the feature stylesheets', () => {
    // A guard on the guard: if this list ever went empty, every assertion below would be
    // vacuously true and this file would stop meaning anything.
    expect(stylesheets.length).toBeGreaterThan(0)
  })

  it.each(stylesheets.map((path) => relative(SRC, path)))(
    '%s is imported by something in the app',
    (rel) => {
      expect(imported.has(resolve(SRC, rel))).toBe(true)
    },
  )
})
