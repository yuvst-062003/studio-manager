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
