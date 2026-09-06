// What a redesigned tab says when its fetch failed.
//
// The four ported screens do NOT use `@studio/ui`'s `LoadFailed` primitive, and that is
// deliberate: the primitive draws an `Alert` and a `Button` from the design system, and
// dropping either into a Tailwind port would be a design-system panel sitting inside a
// screen the owner approved from a prototype. Each screen keeps its own markup — its own
// heading weight, its own retry button — and the tab's own `*.loadFailed` copy.
//
// WHAT THE PRIMITIVE CARRIES THAT THE PORTS DID NOT, and this restores: the offline
// distinction. `LoadFailed` reads `navigator.onLine` and swaps to "אין חיבור לרשת" —
// P8's second item, answered at the primitive on 2026-08-30: "the app never tells a parent
// they are offline while reading". A parent in a dojo doorway was being told the club's
// schedule was broken. The retry itself the ports already had; this was the half missing,
// and `tools/__tests__/load-failed-recovery.test.ts` is the guard that noticed.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * `screenKey` is the tab's own message — `schedule.home.loadFailed`, `billing.shop.loadFailed`.
 * It is used only when the browser believes it is online; offline gets the shared copy,
 * because "we couldn't load your sessions" is not what went wrong.
 *
 * `navigator.onLine === true` is not proof of a working connection (a captive portal says
 * yes), which is why the tab's own message is the fallback rather than a network one.
 */
export function resolveLoadFailedText(locale: Locale, screenKey: string): string {
  const offline = !(globalThis.navigator?.onLine ?? true)
  return t(locale, offline ? 'common.loadFailed.offline' : screenKey)
}
