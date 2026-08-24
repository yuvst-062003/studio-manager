import { THEME_COLOR } from '@studio/ui'
import type { AppManifest, ManifestIcon } from '@studio/ui'

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
export const manifest: AppManifest = {
  id: '/?app=staff',
  name: 'סטודיו — צוות',
  short_name: 'צוות',
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
