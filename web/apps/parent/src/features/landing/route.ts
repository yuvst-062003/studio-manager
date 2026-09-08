// §5.4a ① — 'A public LANDING PAGE at /t/{studio-slug}'.
//
// A real path, not a hash. The other two apps route on `location.hash` because their links
// live in a nav drawer; this URL goes in an Instagram bio and on a flyer QR, and a hash is
// invisible to a link preview and awkward in a printed code. Vite's PWA config already sets
// `navigateFallback: 'index.html'`, so a deep link resolves to the app.
//
// No router library — .claude/rules/ui-rtl-a11y.md says not to add a UI dependency without
// asking, and one regex is not worth one.
//
// The character class is deliberately narrow. The slug is interpolated into an API path, so
// anything that could contain a `/`, a `.` or an escape would let a crafted link address a
// different endpoint entirely.
//
// **The optional segment names a VIEW, and it is a path for the same reasons the landing
// page is.** The trial booking form and the legal documents used to be a dialog and a popup
// — no address, nothing to link to, nothing for the back button to return to. They are now
// `/t/{slug}/trial` and `/t/{slug}/legal`: the form is what a club's advertisement points
// at, and the documents are what its footer and the consent tick point at, so both have to
// survive being copied into a message, a printed QR and a browser's history. A hash would
// carry none of that, and it is the argument the landing page itself already makes above.
//
// **The two literals are exhaustive on purpose.** An unrecognised segment returns `null`
// rather than falling back to the landing page: a stale or mistyped link that quietly
// renders something plausible hides the mistake from whoever printed it. And the literals
// are the *only* thing allowed to follow a slug, so the view segment widens nothing — the
// slug's character class still decides what may reach an API path.
const LANDING = /^\/t\/([a-z0-9-]{1,80})(?:\/(trial|legal))?\/?$/

/** The three pages this feature serves. The landing page is the one with no segment. */
export type LandingView = 'landing' | 'trial' | 'legal'

/** Which club, and which of its three public pages. */
export type LandingRoute = { slug: string; view: LandingView }

//: The regex already restricts the segment to the two literals, so this only re-states in
//: types what the pattern guarantees. Narrowing is cheaper than asserting, and it keeps
//: `LandingView` the single place a fourth page would have to be added.
function viewFrom(segment: string | undefined): LandingView {
  return segment === 'trial' || segment === 'legal' ? segment : 'landing'
}

export function matchLandingPath(pathname: string): LandingRoute | null {
  const match = LANDING.exec(pathname)
  const slug = match?.[1]
  // `noUncheckedIndexedAccess` types a capture group as possibly undefined even when
  // the pattern guarantees it. Checking is cheaper than asserting.
  return slug ? { slug, view: viewFrom(match?.[2]) } : null
}

//: The same three views at the root of a configured landing host: `/`, `/trial`, `/legal`.
//: Kept a separate pattern rather than folded into `LANDING`, because these paths carry no
//: slug and must therefore stay gated on the host — see `landingSlugFor`. The empty string
//: is accepted for the same reason `/` is: both are what a bare host resolves to.
const LANDING_HOST_ROOT = /^\/?(?:(trial|legal)\/?)?$/

/**
 * #25 — the club's shop window at the apex domain.
 *
 * The owner asked for the landing page at `gladiatorclub.co.il` and
 * `www.gladiatorclub.co.il` rather than under `app.`. Pointing DNS at the parent app is
 * not enough on its own: `/` renders the sign-in wall, so the apex would have shown a
 * login box to every stranger who typed the club's name.
 *
 * **Keyed on the HOST, and that is not incidental.** One Railway service answers for both
 * `app.` and the apex from a single build, so a rule that claimed every root would turn
 * `app.gladiatorclub.co.il/` into a marketing page for parents who are already members.
 * The sign-in state cannot decide it either: `App()` resolves the public routes *before*
 * any session hook runs — deliberately, so an anonymous landing visit does not open with a
 * 401 — and the in-memory token is empty on a cold load even for a returning parent, so
 * that test would show the club's advertisement to a member every time they opened the app
 * fresh.
 *
 * **`/t/{slug}` stays canonical and stays first**, on every host. A flyer QR printed for
 * one club must resolve to that club, never to whichever club the build was configured
 * with.
 *
 * **Both halves are build-time configuration, so nothing changes where they are unset.**
 * Staging and development pass empty values and keep the behaviour they have today; the
 * apex is a production deployment concern, and an environment that has not opted in must
 * not silently acquire a public marketing page at its root.
 *
 * **`/trial` and `/legal` are claimed on the same terms as `/`.** The apex is where the
 * club's own links point, so its call to action would otherwise have to send a visitor to
 * a second domain to book. The host gate is what keeps that safe: on `app.` those two paths
 * still resolve to nothing here, so the parent app keeps them for itself.
 */
export function landingSlugFor(
  pathname: string,
  configuredSlug: string | undefined,
  landingHosts: readonly string[],
  hostname: string,
): LandingRoute | null {
  const explicit = matchLandingPath(pathname)
  if (explicit) return explicit
  const root = LANDING_HOST_ROOT.exec(pathname)
  if (!root) return null
  //: An unset build variable collapses to `''`, and an empty slug must never become a
  //: request: `/t/` 404s against the API and would render a refusal on the one page a
  //: stranger sees first.
  const slug = configuredSlug?.trim()
  if (!slug) return null
  //: Case-insensitive, because a hostname is. A port is never part of `location.hostname`,
  //: so there is nothing to strip.
  const host = hostname.toLowerCase()
  if (!landingHosts.some((candidate) => candidate.trim().toLowerCase() === host)) return null
  return { slug, view: viewFrom(root[1]) }
}

/** The hosts whose ROOT is the club's landing page, from build-time configuration.
 *  Comma-separated so one variable carries the apex and `www.` together. */
export function landingHostsFrom(configured: string | undefined): string[] {
  return (configured ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
}

/**
 * Where to send a visitor for one of this feature's three views, from wherever they are
 * standing now.
 *
 * The same page is served under two shapes — `/t/{slug}/…` on any host, and `/…` at the
 * root of a configured landing host — so a link cannot be a constant. It is derived from
 * the CURRENT path instead: a visitor who arrived by the canonical `/t/{slug}` link keeps
 * that prefix, and one who arrived at the club's own domain stays on the short form. A
 * fixed `/trial` would have thrown the first group off their club's link and onto whichever
 * club the build happens to be configured with.
 *
 * Deliberately a real `href` and not a click handler: the call to action is an `<a>`, so
 * it is middle-clickable, copyable and reachable from the keyboard for free.
 */
export function landingViewHref(pathname: string, view: LandingView): string {
  //: `matchLandingPath` is what knows whether this path carries a slug — including when it
  //: is already a `/trial` or `/legal` under one, which is how the legal page's own "back
  //: to the form" link stays inside the right club.
  const current = matchLandingPath(pathname)
  const base = current ? `/t/${current.slug}` : ''
  return view === 'landing' ? base || '/' : `${base}/${view}`
}
