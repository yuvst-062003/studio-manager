import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDisplayMode, isInstalled } from './useDisplayMode'

const mockMatchMedia = (mode: string | null) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mode !== null && query.includes(mode),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('getDisplayMode', () => {
  it('reports browser when no display-mode query matches', () => {
    mockMatchMedia(null)
    expect(getDisplayMode()).toBe('browser')
    expect(isInstalled()).toBe(false)
  })

  it('reports standalone from the display-mode media query', () => {
    mockMatchMedia('standalone')
    expect(getDisplayMode()).toBe('standalone')
    expect(isInstalled()).toBe(true)
  })

  it('reports fullscreen in preference to standalone', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(getDisplayMode()).toBe('fullscreen')
  })

  // §6.5 — on iOS the home-screen web app is the only context with Web Push,
  // so detecting it correctly is load-bearing, and iOS before 16.4 exposes
  // only the non-standard navigator.standalone.
  it('trusts navigator.standalone on iOS even when matchMedia disagrees', () => {
    mockMatchMedia(null)
    vi.stubGlobal('navigator', { standalone: true })
    expect(getDisplayMode()).toBe('standalone')
  })
})
