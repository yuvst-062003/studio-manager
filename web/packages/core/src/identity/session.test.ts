// SPEC §10.3 and §11.7. The storage assertions carry the weight here: the documented trap
// for this milestone is moving the refresh token into IndexedDB to make staging work, and
// this is the file where that would be written.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACT_AS_EVENT,
  apiFetch,
  clearSession,
  getAccessToken,
  refresh,
  setAccessToken,
  signOut,
  startListeningForPersonaSwitch,
} from './session'

const SESSION_BODY = {
  access_token: 'tok-fresh',
  expires_in: 900,
  access: { staff: true, parent: false },
  studios: [],
  active_studio_id: null,
}

beforeEach(() => {
  clearSession()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the access token', () => {
  it('is held in memory and never in storage', () => {
    // §11.7 — an XSS can read every storage API. It cannot read a module-scoped variable.
    setAccessToken('tok-1', 900)
    expect(getAccessToken()).toBe('tok-1')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('is dropped once it has expired, without a network call', () => {
    // §5.2's fifteen minutes. Returning an expired token would produce a 401 the caller
    // has to interpret; returning null makes the refresh path unambiguous.
    vi.useFakeTimers()
    setAccessToken('tok-1', 900)
    vi.advanceTimersByTime(901_000)
    expect(getAccessToken()).toBeNull()
  })

  it('is treated as expired slightly early, so a request in flight does not race it', () => {
    vi.useFakeTimers()
    setAccessToken('tok-1', 900)
    vi.advanceTimersByTime(896_000)
    expect(getAccessToken()).toBeNull()
  })
})

describe('refresh', () => {
  it('sends credentials so the httpOnly cookie is attached', async () => {
    // Without credentials:'include' the cookie is simply not sent, and the failure looks
    // exactly like an expired session — the most confusing bug available here.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(SESSION_BODY), { status: 200 })),
    )
    await refresh()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
  })

  it('returns null on 401 rather than throwing', async () => {
    // §10.3 point 5 — 'A queue is never dropped on an auth failure. There is no code path
    // that discards unsynced work.' A throw here would propagate into whatever the caller
    // was doing, which is how a queue gets dropped.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    expect(await refresh()).toBeNull()
  })

  it('returns null when the network is down, rather than throwing', async () => {
    // §10.1's four network states. Offline is one of them, not an error.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await refresh()).toBeNull()
  })

  it('never writes a token to any storage API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(SESSION_BODY), { status: 200 })),
    )
    await refresh()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('coalesces concurrent callers into one request', async () => {
    // Ten screens hitting a 401 at once must not fire ten refreshes: nine of them would
    // present a token the first has already rotated, and §5.2's reuse detection would
    // read that as theft and kill the family.
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(SESSION_BODY), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([refresh(), refresh(), refresh()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('apiFetch', () => {
  it('attaches the bearer token', async () => {
    setAccessToken('tok-9', 900)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await apiFetch('/api/v1/classes')
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/classes',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-9' }),
      }),
    )
  })

  it('refreshes once on a 401 and replays the request', async () => {
    // §5.2 expires the access token every fifteen minutes by design, so this is the
    // ordinary path and not an error path.
    setAccessToken('stale', 900)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SESSION_BODY), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await apiFetch('/api/v1/classes')
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not loop when the refresh itself fails', async () => {
    // A retry loop on an expired refresh token is an infinite one, and it fires on every
    // screen at once the moment a session ends.
    setAccessToken('stale', 900)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await apiFetch('/api/v1/classes')).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 403', async () => {
    // 403 is "you may not", not "you are stale". Refreshing would hide a permission bug
    // behind an extra round trip and still fail.
    setAccessToken('tok', 900)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await apiFetch('/api/v1/classes')).status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('signOut', () => {
  it('clears the in-memory token even if the server call fails', async () => {
    // A network error must not leave someone looking signed in on a device they just
    // asked to be signed out of.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    setAccessToken('tok', 900)
    await signOut()
    expect(getAccessToken()).toBeNull()
  })
})

describe('the persona switch', () => {
  it('adopts the token the dev bar dispatches', () => {
    // §19.4's switcher lives in @studio/ui and cannot import this package (core does not
    // depend on ui, and reversing that for a dev tool would be the wrong shape), so it
    // dispatches an event and this is what listens.
    const stop = startListeningForPersonaSwitch()
    globalThis.dispatchEvent(
      new CustomEvent(ACT_AS_EVENT, {
        detail: { accessToken: 'tok-persona', personaLabel: 'מיכל מנהלת' },
      }),
    )
    expect(getAccessToken()).toBe('tok-persona')
    stop()
  })

  it('stops listening once detached', () => {
    startListeningForPersonaSwitch()()
    globalThis.dispatchEvent(
      new CustomEvent(ACT_AS_EVENT, {
        detail: { accessToken: 'tok-late', personaLabel: 'x' },
      }),
    )
    expect(getAccessToken()).toBeNull()
  })
})
