import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

function installWakeLock() {
  const sentinel = { release: vi.fn().mockResolvedValue(undefined) }
  const request = vi.fn().mockResolvedValue(sentinel)
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })
  return { request, sentinel }
}

describe('useWakeLock', () => {
  afterEach(() => {
    // `navigator.wakeLock` is not a real property in jsdom — undo the per-test shim so
    // the next test starts from "unsupported" rather than a leftover mock.
    // @ts-expect-error -- test cleanup of a property this suite defines itself.
    delete globalThis.navigator.wakeLock
    vi.restoreAllMocks()
  })

  it('requests a screen lock when active', async () => {
    const { request } = installWakeLock()
    renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
  })

  it('does not request a lock while inactive', async () => {
    const { request } = installWakeLock()
    renderHook(({ active }) => useWakeLock(active), { initialProps: { active: false } })
    // Flush any pending microtasks before asserting the negative.
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()
  })

  it('releases the lock when the caller pauses (active flips to false)', async () => {
    const { request, sentinel } = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    rerender({ active: false })
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1))
  })

  it('releases the lock on unmount', async () => {
    const { request, sentinel } = installWakeLock()
    const { unmount } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    unmount()
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1))
  })

  it('is a silent no-op where the API does not exist', () => {
    // No `installWakeLock()` here — `navigator.wakeLock` is genuinely absent, as on a
    // browser that does not implement it. The hook must not throw.
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
  })

  it('never throws when the browser denies the request', async () => {
    const request = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
  })

  it('re-acquires the lock on visibilitychange when the page returns while still active', async () => {
    const { request } = installWakeLock()
    renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })
})
