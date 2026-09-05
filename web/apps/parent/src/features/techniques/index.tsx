/** The technique library's public surface.
 *
 * Everything the shell needs to mount this feature is exported here, and NOTHING in this
 * feature edits a shared file: not `App.tsx`, not `packages/i18n/index.ts`, not
 * `packages/ui`. Another session owns the shell while this was built, and two sessions in
 * one route table is an afternoon spent on a merge.
 *
 * THE WIRING COMMIT, when the shell is free, is four lines in `App.tsx`:
 *
 *   1. `import { TechniquesScreen, TechniqueDetail, matchTechniquesPath, techniquesTab }`
 *   2. a fifth entry in the `<TabBar items={[…]}>` array — `techniquesTab(locale, active)`
 *   3. a branch on `matchTechniquesPath(hash)` beside the other screens
 *   4. an entry in `NAV` so the drawer reaches it too
 *
 * and three follow-ups it should carry: promote `strings.ts` into
 * `packages/i18n/{he,en,ru}/techniques.ts` (registering the namespace in `types.ts` and
 * `index.ts`), move `TechniqueIcon` into `packages/ui`'s `Icon.tsx`, and check the tab
 * label at a 360px viewport — five tabs share the bar, and `תשלומים` is the long one.
 *
 * `routes.reachable.test.ts` reads its route table out of `App.tsx`, so it stays green
 * while this is unmounted and starts guarding `#/techniques` the moment step 3 lands.
 */
import type { Locale } from '@studio/i18n'
import { TechniqueIcon } from './icon'
import { s } from './strings'

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
 */
export function matchTechniquesPath(hash: string): TechniquesRoute | null {
  if (hash === '#/techniques') return { kind: 'list' }
  if (hash.startsWith('#/techniques/')) {
    const slug = hash.slice('#/techniques/'.length)
    return slug ? { kind: 'detail', slug } : { kind: 'list' }
  }
  return null
}

/** The bar's fifth item, ready to drop into `App.tsx`'s `TabBar` array. */
export function techniquesTab(locale: Locale, active: boolean) {
  return {
    key: 'techniques',
    label: s(locale, 'title'),
    href: '#/techniques',
    icon: <TechniqueIcon size={20} />,
    active,
  }
}
