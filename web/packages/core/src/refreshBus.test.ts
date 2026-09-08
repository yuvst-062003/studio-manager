import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { refreshGeneration, requestRefresh, useRefreshSignal } from './refreshBus'

describe('the refresh signal', () => {
  it('changes for every subscriber when a refresh is requested', () => {
    const a = renderHook(() => useRefreshSignal())
    const b = renderHook(() => useRefreshSignal())
    const before = a.result.current
    expect(b.result.current).toBe(before)

    act(() => {
      requestRefresh()
    })

    // Both, and to the same value: two screens that refreshed at different generations
    // would be two screens showing data from different moments.
    expect(a.result.current).not.toBe(before)
    expect(a.result.current).toBe(b.result.current)
  })

  it('changes again on a second request, so two pulls are two refreshes', () => {
    const { result } = renderHook(() => useRefreshSignal())
    act(() => {
      requestRefresh()
    })
    const once = result.current
    act(() => {
      requestRefresh()
    })
    // If this collapsed, a parent who pulled twice because the first looked wrong would be
    // told nothing happened the second time.
    expect(result.current).not.toBe(once)
  })

  it('stops notifying a subscriber that has unmounted', () => {
    const { result, unmount } = renderHook(() => useRefreshSignal())
    const last = result.current
    unmount()
    act(() => {
      requestRefresh()
    })
    expect(result.current).toBe(last)
  })

  it('hands a late subscriber the current generation, not a private zero', () => {
    // A screen mounted after a refresh must not believe it is already up to date at 0 and
    // then miss the NEXT one because its own first value happened to differ.
    act(() => {
      requestRefresh()
    })
    const { result } = renderHook(() => useRefreshSignal())
    expect(result.current).toBe(refreshGeneration())
  })
})
