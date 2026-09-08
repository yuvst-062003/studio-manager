import { GROUND_COLOR } from '@studio/ui/theme'
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
  id: '/?app=parent',
  name: 'Gladiator',
  short_name: 'Gladiator',
  description: 'נוכחות, תשלומים והצהרות בריאות',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  dir: 'rtl',
  lang: 'he',
  // The OUTWARD ground: this app wears the club's brand, so its splash screen and its
  // status bar are #fcf9f8, not the staff apps' warm grey. `THEME_COLOR` is the inward
  // record and naming it here is what put a mismatched band behind the installed app.
  theme_color: GROUND_COLOR.outward.light,
  background_color: GROUND_COLOR.outward.light,
  categories: ['sports', 'education', 'productivity'],
  icons,
}
