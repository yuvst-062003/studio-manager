// The loading screen's minimum, and the reason it is a minimum rather than a delay.
//
// A fast launch flashed the screen past too quickly to follow: launch image, something, then
// sign-in. Holding it briefly makes that one screen giving way to another. Holding it for
// the two or three seconds first suggested would have made every launch slower for ever to
// fix a glitch that lasts a frame.
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_SPLASH_MS, useSplashHold } from './useSplashHold'

/** `performance.now()` counts from the navigation, which is what the hook measures against. */
function atPageAge(ms: number) {
  vi.spyOn(performance, 'now').mockReturnValue(ms)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the loading screen holds for a minimum', () => {
  it('holds when the app was ready almost immediately', () => {
    atPageAge(50)
    const { result } = renderHook(() => useSplashHold())
    expect(result.current).toBe(true)
  })

  it('lets go once the minimum has passed', () => {
    atPageAge(50)
    const { result } = renderHook(() => useSplashHold())
    expect(result.current).toBe(true)
    act(() => {
      atPageAge(MIN_SPLASH_MS + 1)
      vi.advanceTimersByTime(MIN_SPLASH_MS)
    })
    expect(result.current).toBe(false)
  })

  it('adds NOTHING when the page was already slow', () => {
    // The whole point. A launch that already took two seconds has shown the screen for two
    // seconds; counting again from mount would make a slow phone wait twice.
    atPageAge(2000)
    const { result } = renderHook(() => useSplashHold())
    expect(result.current).toBe(false)
  })

  it('waits only the REMAINDER, not the whole minimum', () => {
    // 600ms of that budget was spent parsing the bundle, on a screen `index.html` had
    // already painted. Only 100ms is left to serve.
    atPageAge(600)
    const { result } = renderHook(() => useSplashHold())
    expect(result.current).toBe(true)
    act(() => {
      atPageAge(MIN_SPLASH_MS)
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(false)
  })

  it('is short enough not to read as stuck', () => {
    // Above roughly a second and a half people tap again because they think it has hung,
    // which is the opposite of the problem being solved. The cost is paid by every fast
    // launch for ever, so the number is deliberately the smallest that works.
    expect(MIN_SPLASH_MS).toBeGreaterThanOrEqual(400)
    expect(MIN_SPLASH_MS).toBeLessThanOrEqual(1000)
  })
})
