import { describe, expect, it } from 'vitest'
import { GROUND_COLOR, THEME_COLOR, resolveTheme, surfaceOf } from './theme'

describe('D4 — light / dark / system', () => {
  it('honours an explicit preference over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system setting when preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('D8 — the light-mode text floor', () => {
  it('exposes ground colours the manifests can name', () => {
    expect(THEME_COLOR.light).toBe('#f7f5f1')
    expect(THEME_COLOR.dark).toBe('#141311')
  })
})

describe('the two surfaces have different grounds', () => {
  it('keeps THEME_COLOR meaning the inward palette, so the staff apps are unmoved', () => {
    expect(THEME_COLOR).toBe(GROUND_COLOR.inward)
  })

  it('gives the outward surface its own ground in both themes', () => {
    // The exact values are asserted against tokens.css itself in tokens.audit.test.ts.
    // What matters here is that they are DIFFERENT — a record that quietly collapsed to
    // one palette would pass every other test in this file.
    expect(GROUND_COLOR.outward.light).not.toBe(GROUND_COLOR.inward.light)
    expect(GROUND_COLOR.outward.dark).not.toBe(GROUND_COLOR.inward.dark)
  })

  it('reads the surface off the element the stylesheet matches on', () => {
    expect(surfaceOf({ dataset: { surface: 'outward' } })).toBe('outward')
    expect(surfaceOf({ dataset: {} })).toBe('inward')
    // An unknown value is inward, not a crash and not outward: the brand is opt-in, and a
    // typo in an index.html should not silently re-skin an app.
    expect(surfaceOf({ dataset: { surface: 'Outward' } })).toBe('inward')
    expect(surfaceOf(null)).toBe('inward')
  })
})
