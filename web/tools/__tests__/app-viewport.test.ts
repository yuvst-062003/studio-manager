// "The PWA should feel like a real app" (owner, 2026-09-06) — asserted at the WIRING, the
// way HB-w6-health-gate-unmounted taught us to.
//
// Removing zoom takes three separate mechanisms, in three different files, none of which
// fails visibly when it is missing: the page simply zooms, on one platform, in a way no
// test environment reproduces. jsdom has no pinch, no viewport scale and no iOS. So this
// file asserts that each mechanism is CONNECTED, and each behaviour is argued in the file
// that implements it.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (path: string) => readFileSync(resolve(WEB, path), 'utf8')

/** §6.5's two installable phone apps. The dashboard is the manager's desktop tool. */
const PHONE_APPS = ['parent', 'staff'] as const

describe('the viewport meta lock', () => {
  it.each(PHONE_APPS)('%s asks the browser for a fixed scale', (app) => {
    const viewport = /<meta\s+name="viewport"[\s\S]*?content="([^"]*)"/.exec(
      read(`apps/${app}/index.html`),
    )?.[1]
    expect(viewport, `apps/${app}/index.html has no viewport meta`).toBeTruthy()
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('maximum-scale=1')
    // The lock must not cost the notch inset the redesign lays out against.
    expect(viewport).toContain('viewport-fit=cover')
  })

  it('leaves the dashboard zoomable, and that is the decision — not an oversight', () => {
    // A manager reads dense tables there, often on a tablet, and pinching into a column of
    // numbers is a thing they should keep being able to do. Written as an assertion so
    // "why didn't the dashboard get this?" has an answer in the repo rather than in a
    // chat log.
    expect(read('apps/dashboard/index.html')).not.toContain('user-scalable=no')
  })
})

describe('the stylesheet reaches the apps that need it and no others', () => {
  it.each(PHONE_APPS)('%s imports it from its entry point', (app) => {
    expect(read(`apps/${app}/src/main.tsx`)).toContain("import '@studio/ui/app-viewport.css'")
  })

  it('is not in the @studio/ui barrel, which the dashboard also imports', () => {
    expect(read('packages/ui/src/index.ts')).not.toContain('app-viewport')
  })

  it('is exported as a subpath, or the alias map cannot resolve it in a lane worktree', () => {
    // tools/workspace-aliases.ts derives the map from `exports`. A stylesheet reachable
    // only through the package root would resolve to main's copy from a worktree — the
    // exact failure that file's header describes.
    const manifest = JSON.parse(read('packages/ui/package.json'))
    expect(manifest.exports['./app-viewport.css']).toBe('./src/app-viewport.css')
  })

  // The sheet wins two different cascade contests by two different mechanisms, and each
  // has its own silent failure. Comments are stripped first: the header explains both and
  // names `@layer utilities` while doing it, and a guard that reads its own explanation as
  // a violation is a guard nobody trusts.
  const styles = () =>
    read('packages/ui/src/app-viewport.css').replace(/\/\*[\s\S]*?\*\//g, '')

  it('stays UNLAYERED, which is what beats Tailwind\'s utilities', () => {
    // `text-[14px]` on an input lives in `@layer utilities`; an unlayered normal
    // declaration outranks every layer. Wrapped in a layer this would still parse, still
    // lint and still ship — losing to the utility with nothing on screen to say so.
    expect(styles()).not.toContain('@layer')
    expect(styles()).toContain('touch-action')
  })

  it('keeps !important on the floor, which is what beats a component\'s own class', () => {
    // Layering settles Tailwind and nothing else. `.studio-field__input` is a class at
    // (0,1,0) declaring 14px against this rule's (0,0,1) — so without !important the
    // design system's own fields keep zooming iOS while the wizard's stop, which is the
    // worst kind of half-fix: it looks fixed on the screen you tested.
    expect(styles()).toMatch(/font-size:\s*max\(16px,[^;]*\)\s*!important/)
  })

  it('imports AFTER tailwind.css in the parent, which is where the layers come from', () => {
    const main = read('apps/parent/src/main.tsx')
    expect(main.indexOf("'@studio/ui/app-viewport.css'")).toBeGreaterThan(
      main.indexOf("'./tailwind.css'"),
    )
  })
})

describe('the gesture lock', () => {
  it.each(PHONE_APPS)('%s calls lockViewportZoom() at module scope', (app) => {
    const main = read(`apps/${app}/src/main.tsx`)
    expect(main).toMatch(/^lockViewportZoom\(\)$/m)
  })

  it.each(PHONE_APPS)('%s installs it before React mounts', (app) => {
    // In an effect it would run after first paint, leaving a window in which a pinch zooms
    // a page nothing then un-zooms — and on a cold start over a slow connection that
    // window is the part of the session a parent actually touches.
    const main = read(`apps/${app}/src/main.tsx`)
    expect(main.indexOf('lockViewportZoom()')).toBeLessThan(main.indexOf('createRoot('))
  })
})
