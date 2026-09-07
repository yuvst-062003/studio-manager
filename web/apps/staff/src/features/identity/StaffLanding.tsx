// Where a signed-in coach or manager lands. §6.1 step 4 put a 3-screen tour here
// ("כאן השיעורים של היום" · "לחיצה לסימון נוכחות" · "עובד גם בלי אינטרנט"); it was
// removed on 2026-09-07 at the owner's request.
//
// **Why it went rather than got styled.** It shipped as a bare `<section>` holding a naked
// `<p>` and two default `<button>`s — no card, no backdrop, no spotlight on the thing each
// screen described. So a coach signing in met three lines of unstyled text stacked over a
// blank page and pressed `הבא` three times to get past it. It described the app instead of
// showing it, which the five-tab shell already does better in the same three seconds.
//
// **What had to survive it: the routing.** `Resolve`'s non-wizard arm renders this
// component, and the tour was quietly the thing that put a coach on the today screen — its
// own "already seen" path set the hash. Delete it without keeping that and a signed-in
// coach lands on an empty shell with no section chosen.
import { useEffect } from 'react'

/** The schedule section's default view IS the today screen, so this is §6.1's "→ Today". */
const TODAY_ROUTE = '#/schedule'

export function StaffLanding() {
  // In an effect rather than during render: routing is a side effect, and firing one
  // while rendering double-fires under StrictMode. This is the same reason the tour
  // routed from an effect before it.
  useEffect(() => {
    globalThis.location.hash = TODAY_ROUTE
  }, [])

  // An empty marker, like `staff-resolving` above it in `Resolve`. It renders for the one
  // frame before the hash change re-renders `App` into the schedule, and it gives the
  // routing tests something to pin to that is not `staff-today` — which the schedule
  // itself owns, and which would pass even if this arm never ran.
  return <p data-testid="staff-landing" />
}
