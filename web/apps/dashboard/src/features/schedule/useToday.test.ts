import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { studioDayKey } from '@studio/core'
import { useToday } from './useToday'

const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToday', () => {
  it('returns the current instant', () => {
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-11-03T12:00:00.000Z')
  })

  it('does not change while the studio day has not', () => {
    // The whole point: this value is a dependency of several effects, and one of them
    // answers a change with 1 + 3N requests.
    const { result } = renderHook(() => useToday())
    const first = result.current

    // 18:00Z is 20:00 here and 19:00Z is 21:00 — the same Jerusalem day. Reaching for
    // 21:59Z instead would cross midnight two hours before the UTC date changes, which is
    // the mistake this hook exists to avoid making.
    act(() => {
      vi.setSystemTime(new Date('2026-11-03T18:00:00Z'))
      vi.advanceTimersByTime(MINUTE)
      vi.setSystemTime(new Date('2026-11-03T19:00:00Z'))
      vi.advanceTimersByTime(MINUTE)
    })
    expect(result.current).toBe(first)
    expect(studioDayKey(result.current)).toBe('2026-11-03')
  })

  it('is stable across a re-render of its owner', () => {
    const { result, rerender } = renderHook(() => useToday())
    const first = result.current
    rerender()
    rerender()
    expect(result.current).toBe(first)
  })

  it('re-stamps once the Jerusalem day rolls over', () => {
    // 22:00Z on 3 November is already midnight on the 4th here — winter, UTC+2. A hook
    // that watched the UTC date would be two hours late every night.
    const { result } = renderHook(() => useToday())
    expect(studioDayKey(result.current)).toBe('2026-11-03')

    act(() => {
      vi.setSystemTime(new Date('2026-11-03T22:00:30Z'))
      vi.advanceTimersByTime(MINUTE)
    })
    expect(studioDayKey(result.current)).toBe('2026-11-04')
  })

  it('stops polling when its owner unmounts', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useToday())
    unmount()
    expect(clear).toHaveBeenCalled()
  })
})
