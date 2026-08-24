import { describe, expect, it } from 'vitest'
import { THEME_COLOR } from '@studio/ui/theme'
import { manifest } from '../manifest.config'

describe('staff manifest (§6.5 — the install is the product, not boilerplate)', () => {
  it('declares standalone display so the app launches without browser chrome', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('names the app in Hebrew, with a short_name that fits under a home-screen icon', () => {
    expect(manifest.name).toBe('סטודיו — צוות')
    expect(manifest.short_name).toBe('צוות')
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('uses relative start_url and scope so the domain is not baked in', () => {
    // §15 item 5 is still open; a hardcoded origin would need a rebuild to change.
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('takes theme and background colours from the D2 token layer, not literals', () => {
    expect(manifest.theme_color).toBe(THEME_COLOR.light)
    expect(manifest.background_color).toBe(THEME_COLOR.light)
  })

  it('declares RTL and Hebrew, so the install dialog is not mirrored wrong', () => {
    expect(manifest.dir).toBe('rtl')
    expect(manifest.lang).toBe('he')
  })

  it('ships the icon sizes Chromium requires for installability', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('ships a maskable icon so Android does not letterbox the mark', () => {
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('declares png mime types', () => {
    expect(manifest.icons.every((i) => i.type === 'image/png')).toBe(true)
  })
})
