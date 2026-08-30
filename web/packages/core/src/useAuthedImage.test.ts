// The club logo is served by a route the API guards with the session token, so a bare
// <img src> fails twice on split origins: the relative path resolves against the app's
// host instead of the API's, and the tag cannot send the Authorization header at all.
// This hook is the fix (2026-08-30): fetch through apiFetch, hand the tag a blob URL.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthedImage } from './useAuthedImage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAuthedImage', () => {
  it('fetches the path through the API client and yields an object URL', async () => {
    // **The body is a string, and `new Blob([...])` never worked here at all.**
    //
    // Under `environment: 'jsdom'` the two halves of that expression come from different
    // realms: `Blob` is jsdom's, `Response` is Node's undici — and undici does not accept
    // a foreign Blob as a BodyInit. Measured, not assumed: on Node 24
    // `await new Response(new Blob(['png-bytes'])).text()` is the literal string
    // `"[object Blob]"`. The bytes this test believed it was serving were never in the
    // response, and it passed anyway because the hook only needs SOME blob back.
    //
    // Node 22's converter is stricter and throws instead of stringifying, so there the
    // constructor rejected, `apiFetch` rejected, the hook's own `.catch` swallowed it and
    // `result.current` stayed null. That is the CI failure — a vacuous pass on one Node
    // and a hard failure on the other, from the same wrong line.
    //
    // Nothing here needs a Blob going IN. What is under test is that bytes coming BACK
    // become an object URL, and `response.blob()` produces one from a string body.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('png-bytes', { status: 200 })))
    const createObjectURL = vi.fn(() => 'blob:local-1')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))

    const { result } = renderHook(() => useAuthedImage('/api/v1/studio/logo?v=7'))
    await waitFor(() => expect(result.current).toBe('blob:local-1'))
    expect(fetch).toHaveBeenCalledWith('/api/v1/studio/logo?v=7', expect.anything())
  })

  it('yields null for no path and for a refused fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    const none = renderHook(() => useAuthedImage(null))
    expect(none.result.current).toBeNull()

    const refused = renderHook(() => useAuthedImage('/api/v1/studio/logo'))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(refused.result.current).toBeNull()
  })
})
