import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs script, no type declarations by design
import { auditManifest } from '../../scripts/check-installability.mjs'

const valid = {
  name: 'סטודיו — צוות',
  short_name: 'צוות',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#f7f5f1',
  background_color: '#f7f5f1',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

describe('auditManifest — the gate must bite, or a green CI run means nothing', () => {
  it('passes a valid manifest', () => {
    expect(auditManifest(valid)).toEqual([])
  })

  it('fails a display mode that would launch in browser chrome', () => {
    expect(auditManifest({ ...valid, display: 'browser' }).join()).toMatch(/display/)
  })

  it('fails a missing 512 icon', () => {
    const icons = valid.icons.filter((i) => i.sizes !== '512x512')
    expect(auditManifest({ ...valid, icons }).join()).toMatch(/512/)
  })

  it('fails a missing maskable icon', () => {
    const icons = valid.icons.filter((i) => !('purpose' in i))
    expect(auditManifest({ ...valid, icons }).join()).toMatch(/maskable/)
  })

  it('fails a start_url outside scope', () => {
    expect(
      auditManifest({ ...valid, start_url: '/elsewhere/', scope: '/app/' }).join(),
    ).toMatch(/scope/)
  })

  it('fails a missing name', () => {
    expect(auditManifest({ ...valid, name: '' }).join()).toMatch(/name/)
  })

  it('fails a missing theme_color, which the install dialog reads', () => {
    expect(auditManifest({ ...valid, theme_color: '' }).join()).toMatch(/theme_color/)
  })
})
