// Every screen this shell routes to must be reachable from inside the running app.
//
// Ported from the parent app's `routes.reachable.test.ts` — see that file's own header for
// the fuller argument (three of ITS screens shipped mounted and unreachable across two
// waves). This staff-app copy exists for the exact defect that motivated it here too: the
// old NAV pointed `announcements` at a PATH (`/announcements`) nothing routes, and that dead
// link (bug 2.2) is what this file is built to catch the NEXT version of — a hash a shell
// branches on with no `href`/`hash =` anywhere else in the app that leads to it.
//
// A source scan rather than a render walk, on purpose: the defect is the ABSENCE of a link,
// and absence is a property of the whole source tree, not of any one rendered screen.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const APP = join(SRC, 'App.tsx')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return []
    return [path]
  })
}

/**
 * The hashes `App.tsx` branches on.
 *
 * Both shapes it uses: `hash === '#/x'` for a whole-screen route, and
 * `hash.startsWith('#/x/')` for one that carries ids. The prefix form is recorded as
 * `#/x/` so the search below looks for a template literal rather than an exact string.
 */
function routedHashes(source: string): string[] {
  const exact = [...source.matchAll(/hash === '(#\/[a-z-]*(?:\/[a-z-]+)*)'/g)].map((m) => m[1]!)
  const prefixed = [...source.matchAll(/hash\.startsWith\('(#\/[a-z-]+\/)'\)/g)].map((m) => m[1]!)
  return [...new Set([...exact, ...prefixed])].filter((hash) => !EXEMPT.has(hash))
}

/**
 * Routes that are correctly reachable without an in-app link. Each needs a reason, and
 * "nothing links to it" is not one — that is the defect this file exists to catch.
 */
const EXEMPT = new Set([
  // Where an unknown hash falls through to. The tab bar links it anyway (the schedule
  // tab's own href, and the bare-hash home case both land here).
  '#/',
  '#',
  '',
  // S4.3's own redirect target, not a destination. The bare hash exists only so the
  // `useEffect` above can catch it and bounce to `#/schedule` before anything renders —
  // nothing should ever link here on purpose, and a link that did would be a link to a
  // screen the app immediately navigates away from.
  '#/attendance',
])

/** Does anything in the app navigate to this route? `App.tsx` itself does not count. */
function isLinkedFromSomewhere(hash: string, files: string[]): boolean {
  const needle = hash.endsWith('/') ? hash : `${hash}'`
  return files.some((path) => {
    const source = readFileSync(path, 'utf8')
    // Strip the block that MATCHES routes, so App.tsx's own `hash === '#/cash'` and
    // `hash.startsWith('#/events/')` cannot satisfy the route they define.
    const withoutMatching = source
      .replace(/hash === '#\/[^']*'/g, '')
      .replace(/hash\.startsWith\('#\/[^']*'\)/g, '')
      .replace(/hash\.slice\([^)]*\)/g, '')
    if (hash.endsWith('/')) {
      // `#/events/` is reached as `` `#/events/${id}` `` — a template literal.
      return withoutMatching.includes(`${hash}$\{`)
    }
    return (
      withoutMatching.includes(`href="${hash}"`) ||
      withoutMatching.includes(`href='${hash}'`) ||
      withoutMatching.includes(`href: '${hash}'`) ||
      withoutMatching.includes(`href={\`${hash}\`}`) ||
      withoutMatching.includes(needle)
    )
  })
}

describe('every routed screen is reachable from inside the app', () => {
  const files = sourceFiles(SRC)
  const routes = routedHashes(readFileSync(APP, 'utf8'))

  it('found the route table', () => {
    // A guard on the guard: a refactor that renamed `hash` would silently empty the list
    // above and make every assertion below vacuous.
    expect(routes.length).toBeGreaterThan(8)
    expect(routes).toContain('#/cash')
    expect(routes).toContain('#/join-link')
    // §16's operator queue — a subject's access, rectification and erasure rights, per
    // the parent app's own note on why this route is named here rather than left to the
    // sweep below.
    expect(routes).toContain('#/privacy')
    // The redesign's own three new tabs (S3, 2026-09-06). The account tab is where the
    // whole old drawer moved to; a hash the tab bar links to that nothing renders would be
    // the checkpoint's own defect shipping under a different name.
    expect(routes).toContain('#/account')
    expect(routes).toContain('#/timer')
    expect(routes).toContain('#/tasks')
  })

  it.each([...routedHashes(readFileSync(APP, 'utf8'))])(
    '%s is linked from somewhere that is not the route table',
    (hash) => {
      expect(isLinkedFromSomewhere(hash, files)).toBe(true)
    },
  )
})
