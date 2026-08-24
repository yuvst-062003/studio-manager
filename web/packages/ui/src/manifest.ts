/**
 * The shape of a Web App Manifest as the three apps declare it.
 *
 * Typed here rather than inferred per-app so that a dropped field is a
 * compile error. §6.5 makes the install the product's main adoption risk —
 * there is no store listing to fall back on — so the manifest is a contract,
 * not a config blob.
 */
export type ManifestIcon = {
  src: string
  sizes: string
  type: 'image/png'
  purpose?: 'any' | 'maskable' | 'monochrome'
}

export type AppManifest = {
  id: string
  name: string
  short_name: string
  description: string
  /** Relative, so the domain (§15 item 5) is not baked into a build. */
  start_url: string
  scope: string
  display: 'standalone' | 'fullscreen' | 'minimal-ui'
  orientation: 'portrait' | 'landscape' | 'any'
  dir: 'rtl' | 'ltr'
  lang: string
  theme_color: string
  background_color: string
  categories: string[]
  icons: ManifestIcon[]
}
