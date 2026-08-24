import { describe, expect, it } from 'vitest'
import { THEME_COLOR, resolveTheme } from './theme'

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
