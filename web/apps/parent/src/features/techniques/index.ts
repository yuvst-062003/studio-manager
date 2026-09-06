/** The technique library's public surface.
 *
 * The feature was built while a parallel session owned the shell, so it deliberately
 * mounted nowhere and edited no shared file. Both of those are now spent: the tab is
 * wired (`App.tsx` routes `#/techniques`, `ParentTabBar` carries the fifth slot), the
 * strings live in `@studio/i18n`'s `techniques` namespace, and this is just an index.
 *
 * TWO THINGS THE OLD WIRING NOTE ASKED FOR THAT THE MERGE MADE WRONG, recorded because
 * the reasoning is easier to lose than the code:
 *
 *   - **The `NAV` drawer entry.** There is no drawer. `feat/parent-app-redesign` deleted
 *     it — §4 of that redesign is "four tabs, no side menu" — so the library's only home
 *     is the bar, and it is the fifth tab there.
 *   - **`techniquesTab(locale, active)`.** It built an item for `@studio/ui`'s `TabBar`,
 *     which this app no longer mounts. `ParentTabBar` is a Tailwind port that builds its
 *     own items from records keyed by tab, so the tab is five one-line entries there
 *     rather than an object handed in from here. `TechniqueIcon` still comes from this
 *     feature — see `icon.tsx` for why it did not move into `packages/ui`.
 */
export { TechniquesScreen } from './TechniquesScreen'
export { TechniqueDetail } from './TechniqueDetail'
export { TECHNIQUES, techniqueBySlug, searchTechniques, familiesOf, ijfUrl, videoUrl } from './data'
export type { Category, Subcategory, Technique } from './types'

export type TechniquesRoute = { kind: 'list' } | { kind: 'detail'; slug: string }

/**
 * `#/techniques` and `#/techniques/<slug>`, or null for anything else.
 *
 * A hash, not a path, matching every other screen in this app: `matchLandingPath` accepts
 * only `/t/<slug>`, so a path-shaped route falls through the service worker's
 * `navigateFallback` to index.html and silently returns the parent to home. Four screens
 * shipped with that defect before it was understood.
 *
 * `App.tsx` still names both hashes itself before calling this, and that is not
 * redundancy: `routes.reachable.test.ts` reads the route table out of that file by
 * looking for `hash === '#/…'` and `hash.startsWith('#/…/')`. A route parsed entirely
 * behind a helper is a route the guard cannot see — which is the exact defect it exists
 * to catch. What this function owns is what each hash MEANS, including that a bare
 * `#/techniques/` is the list and not a detail screen for an empty slug.
 */
export function matchTechniquesPath(hash: string): TechniquesRoute | null {
  if (hash === '#/techniques') return { kind: 'list' }
  if (hash.startsWith('#/techniques/')) {
    const slug = hash.slice('#/techniques/'.length)
    return slug ? { kind: 'detail', slug } : { kind: 'list' }
  }
  return null
}
