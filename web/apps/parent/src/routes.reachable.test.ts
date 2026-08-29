// Every screen this shell routes to must be reachable from inside the running app.
//
// Three screens shipped mounted and unreachable, in two separate waves: `#/payments` and
// `#/announcements` (corrected in W2, and App.tsx still carries the note explaining why the
// `/payments` path form matched nothing), then `#/events` and `#/plan/<studentId>` — both
// built, both tested, both wired into the shell's route table, and neither with a single
// `href` or `location.hash =` anywhere in the app that leads to them. A unit test of the
// screen cannot see this. A test of the shell cannot either: the shell renders them
// perfectly well once the hash is set by hand.
//
// So this reads the route table out of `App.tsx` and asserts that something else in the app
// writes each route. It is a source scan rather than a render walk on purpose — the defect
// is the ABSENCE of a link, and absence is a property of the whole source tree, not of any
// one rendered screen.
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
  // Where an unknown hash falls through to. The tab bar links it anyway.
  '#/',
  '#',
  '',
  // §5.10 step 5 — uPay redirects the browser here after payment, carrying the order's
  // public_ref. The entry point is the payment provider, not this app; a link to it from
  // inside would be a link to a receipt for an order nobody placed.
  '#/payment-complete/',
])

/** Does anything in the app navigate to this route? `App.tsx` itself does not count. */
function isLinkedFromSomewhere(hash: string, files: string[]): boolean {
  const needle = hash.endsWith('/') ? hash : `${hash}'`
  return files.some((path) => {
    const source = readFileSync(path, 'utf8')
    // Strip the block that MATCHES routes, so App.tsx's own `hash === '#/events'` and
    // `hash.startsWith('#/plan/')` cannot satisfy the route they define.
    const withoutMatching = source
      .replace(/hash === '#\/[^']*'/g, '')
      .replace(/hash\.startsWith\('#\/[^']*'\)/g, '')
      .replace(/hash\.slice\([^)]*\)/g, '')
    if (hash.endsWith('/')) {
      // `#/plan/` is reached as `` `#/plan/${id}` `` — a template literal.
      return withoutMatching.includes(`${hash}$\{`)
    }
    return (
      withoutMatching.includes(`href="${hash}"`) ||
      withoutMatching.includes(`href='${hash}'`) ||
      withoutMatching.includes(`href: '${hash}'`) ||
      withoutMatching.includes(`hash = '${hash}'`) ||
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
    expect(routes).toContain('#/payments')
    expect(routes).toContain('#/events')
  })

  it.each([...routedHashes(readFileSync(APP, 'utf8'))])(
    '%s is linked from somewhere that is not the route table',
    (hash) => {
      expect(isLinkedFromSomewhere(hash, files)).toBe(true)
    },
  )
})
