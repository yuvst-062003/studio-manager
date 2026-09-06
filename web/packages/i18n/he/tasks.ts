import type { Bundle } from '../types'

/**
 * Owned by the staff app's five-tab redesign (2026-09-06). Deliberately small — the
 * tasks screen itself lands later and adds its own keys to this file. `NAMESPACES` in
 * `types.ts` and the wiring in `index.ts` are edited once, in the commit that creates
 * this file, so a later lane never has to touch the registry again.
 */
export const tasks: Bundle = {
  'title': 'משימות לטיפול',
  'empty': 'אין משימות פתוחות',
}
