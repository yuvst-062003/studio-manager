import { SPLASH_GROUND, THEME_COLOR } from '@studio/ui/theme'
import type { AppManifest, ManifestIcon } from '@studio/ui/manifest'

const icons: ManifestIcon[] = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

/**
 * §6.5 — this app installs from an invitation link and nothing else: no store
 * listing, and on iOS no way to trigger the install at all. start_url and scope
 * stay relative so the domain (§15 item 5, still open) is not baked into a build.
 */
// The club's brand, and it stays Latin in every locale — a brand name is not
// translated. `dir: 'rtl'` and `lang: 'he'` below still hold: they govern the
// DESCRIPTION, which is Hebrew, and the install dialog that renders it.
//
// short_name is what sits under the home-screen icon, and §6.1 says a coach who is
// also a parent installs BOTH apps. Two labels reading 'Gladiator' would be
// indistinguishable there, so only the parent app — the one most people install —
// carries the bare brand.
export const manifest: AppManifest = {
  id: '/?app=dashboard',
  name: 'Gladiator Manager',
  short_name: 'Manager',
  description: 'לוח ניהול, דוחות ולוח שנה',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  dir: 'rtl',
  lang: 'he',
  theme_color: THEME_COLOR.light,
  // **The OS paints this before any JavaScript runs**, and the app's own loading screen
  // paints the instant React mounts. When the two differed, opening the installed app
  // showed two loading screens in two colours, one after the other (owner, 2026-09-08).
  // `SPLASH_GROUND` is the one value; `splash.contract.test.ts` keeps the stylesheet on it.
  //
  // `theme_color` is deliberately NOT changed: it is the app's chrome, the app is not navy,
  // and `ThemeProvider` rewrites it live on mount anyway.
  background_color: SPLASH_GROUND.dashboard,
  categories: ['sports', 'education', 'productivity'],
  icons,
}
