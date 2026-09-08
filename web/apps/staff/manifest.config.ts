import { THEME_COLOR } from '@studio/ui/theme'
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
// short_name is what sits under the home-screen icon. It read 'Coach' until the owner
// pointed out (2026-09-07) that a lone 'Coach' on a phone says nothing about WHICH club
// — it could be any team's app, and the club's own name was the thing missing.
//
// The original reasoning still holds and is why this is not simply 'Gladiator': §6.1 says
// a coach who is also a parent installs BOTH apps, and two icons both labelled 'Gladiator'
// would be indistinguishable. 'Gladiator Coach' keeps the brand first, so the two truncate
// to 'Gladiator' and 'Gladiator C…' — both obviously the club, still telling apart.
export const manifest: AppManifest = {
  id: '/?app=staff',
  name: 'Gladiator Coach',
  short_name: 'Gladiator Coach',
  description: 'ניהול נוכחות, קבוצות ותלמידים',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  dir: 'rtl',
  lang: 'he',
  theme_color: THEME_COLOR.light,
  background_color: THEME_COLOR.light,
  categories: ['sports', 'education', 'productivity'],
  icons,
}
