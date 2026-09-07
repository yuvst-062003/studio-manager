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
const LANDING = /^\/t\/([a-z0-9-]{1,80})\/?$/

export function matchLandingPath(pathname: string): { slug: string } | null {
  const slug = LANDING.exec(pathname)?.[1]
  // `noUncheckedIndexedAccess` types a capture group as possibly undefined even when
  // the pattern guarantees it. Checking is cheaper than asserting.
  return slug ? { slug } : null
}

/**
 * #25 — the club's shop window at the apex domain.
 *
 * The owner asked for the landing page at `gladiatorclub.co.il` and
 * `www.gladiatorclub.co.il` rather than under `app.`. Pointing DNS at the parent app is
 * not enough on its own: `/` renders the sign-in wall, so the apex would have shown a
 * login box to every stranger who typed the club's name.
 *
 * **`/t/{slug}` stays canonical and stays first.** A flyer QR printed for one club must
 * resolve to that club, never to whichever club the build happened to be configured with.
 * This only answers for the ROOT, and only when a club is named.
 *
 * **Configured at build time, so nothing changes where it is not set.** `app.` and staging
 * pass an empty value and keep the behaviour they have today — the apex is a production
 * deployment concern, and an environment that has not opted in must not silently acquire a
 * public marketing page at its root.
 */
export function landingSlugFor(pathname: string, configuredSlug: string | undefined): string | null {
  const explicit = matchLandingPath(pathname)
  if (explicit) return explicit.slug
  if (pathname !== '/' && pathname !== '') return null
  //: An unset `import.meta.env` read collapses to `''`, and an empty slug must never become
  //: a request: `/t/` 404s against the API and renders a refusal on the one page a stranger
  //: sees first.
  const slug = configuredSlug?.trim()
  return slug ? slug : null
}
