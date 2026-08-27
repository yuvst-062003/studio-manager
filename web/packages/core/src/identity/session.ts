// SPEC §5.2, §10.3 and §11.7 — the client half of the session.
//
// **The access token is a module-scoped variable and nothing else.** Not localStorage,
// not sessionStorage, not IndexedDB. §11.7 puts the refresh token in an httpOnly cookie
// precisely so an XSS cannot reach it, and keeping the access token where an XSS CAN
// reach it would hand most of that back.
//
// **The refresh token never appears in this file, because JavaScript never sees it.** The
// browser attaches it to POST /api/v1/auth/refresh (the cookie's Path) and to nothing
// else. `credentials: 'include'` is what makes that happen across origins.
//
// **The documented trap.** On staging this WILL fail: up.railway.app is on the Public
// Suffix List, so the api host and the app hosts are different *sites*, the cookie is
// third-party across them, and Safari drops it. The fix is the domain (HB-domain), not a
// token in IndexedDB — which contradicts §11.7 and is strictly weaker. See
// infra/railway/README.md § The domain. Do not add storage here to make staging pass;
// session.test.ts asserts none exists.

/** Must equal `REFRESH_COOKIE_PATH` in app/services/identity/refresh.py. */
const AUTH_BASE = '/api/v1/auth'

/**
 * Where the API lives. Empty in development and test: the Vite dev server proxies
 * `/api` to uvicorn (each app's vite.config.ts), so relative paths reach the API and the
 * refresh cookie stays same-origin on localhost. A deployed build has no proxy in front
 * of its static host — every `/api` request would get the SPA shell back as HTML — so the
 * build bakes the API's absolute origin in via `VITE_API_ORIGIN` and calls cross-origin:
 * CORS comes from `app/core/cors.py`'s allowlist, and the cookie flows because the custom
 * domain makes api and app same-SITE (infra/railway/README.md § The domain).
 *
 * `@studio/ui`'s SignIn reads the same variable itself — ui must not import core, and the
 * OAuth start links it renders are top-level navigations to this origin.
 */
// The literal `import.meta.env.VITE_API_ORIGIN` form, deliberately: both Vite's build
// and vitest's transform recognise and replace exactly that expression — a cast or an
// aliased read survives untransformed and evaluates to undefined.
const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? ''

/**
 * Absolute URL for an API path — the one place the origin is prepended. Callers keep
 * writing `/api/v1/...`; in a dev build this returns the path unchanged.
 */
export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`
}

/**
 * §19.4's dev bar dispatches this after a persona switch. Declared here as well as in
 * `@studio/ui` because the two packages must not import each other — `core` does not
 * depend on `ui`, and a dev tool is the last thing that should reverse that. A shared
 * string is the whole contract; `session.test.ts` and `RoleSwitcherTool.test.tsx` both
 * pin it.
 */
export const ACT_AS_EVENT = 'studio:dev-act-as'

/**
 * How early a token is treated as expired. A request that leaves with four seconds of
 * validity can arrive with none, and the resulting 401 would be indistinguishable from a
 * real auth failure — so the client gives up on it first and refreshes deliberately.
 */
const EXPIRY_MARGIN_MS = 5_000

export type AppAccess = { staff: boolean; parent: boolean }

export type StudioMembership = {
  studio_id: string
  studio_name: string
  studio_is_demo: boolean
  person_id: string
  roles: string[]
  is_guardian: boolean
}

export type SessionState = {
  access: AppAccess
  studios: StudioMembership[]
  activeStudioId: string | null
}

let accessToken: string | null = null
let expiresAtMs = 0
let inFlightRefresh: Promise<SessionState | null> | null = null

export function setAccessToken(token: string, expiresInSeconds: number): void {
  accessToken = token
  expiresAtMs = Date.now() + expiresInSeconds * 1000
}

export function getAccessToken(): string | null {
  if (accessToken === null) return null
  if (Date.now() >= expiresAtMs - EXPIRY_MARGIN_MS) {
    accessToken = null
    return null
  }
  return accessToken
}

export function clearSession(): void {
  accessToken = null
  expiresAtMs = 0
  inFlightRefresh = null
}

/**
 * Normalise a session response into the shape callers rely on.
 *
 * Every field is defaulted rather than trusted. The response comes from our own API, so
 * in principle it always carries all five — but "in principle" is doing the work there,
 * and the failure mode of being wrong is a `.find` on `undefined` inside a render, which
 * is a WHITE SCREEN. Being signed out is a recoverable state a person understands; a
 * blank app is neither. An endpoint that changes shape should degrade to "no access",
 * not to nothing at all.
 */
function adopt(body: Partial<{
  access_token: string
  expires_in: number
  access: AppAccess
  studios: StudioMembership[]
  active_studio_id: string | null
}>): SessionState {
  if (body.access_token) setAccessToken(body.access_token, body.expires_in ?? 900)
  return {
    access: body.access ?? { staff: false, parent: false },
    studios: body.studios ?? [],
    activeStudioId: body.active_studio_id ?? null,
  }
}

/**
 * §5.2's rotation, from the client side.
 *
 * Concurrent callers are coalesced into one request. Ten screens hitting a 401 at the
 * same moment must not fire ten refreshes: nine would present a token the first has
 * already rotated, and §5.2's reuse detection would correctly read that as theft and kill
 * the whole family — signing the user out for being efficient.
 *
 * Returns null rather than throwing on every failure, including a dead network. §10.3
 * point 5: "A queue is never dropped on an auth failure. There is no code path that
 * discards unsynced work" — and a throw here propagates into whatever the caller was
 * doing, which is exactly how a queue gets dropped.
 */
export function refresh(): Promise<SessionState | null> {
  if (inFlightRefresh !== null) return inFlightRefresh

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(apiUrl(`${AUTH_BASE}/refresh`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        clearSession()
        return null
      }
      return adopt(await response.json())
    } catch {
      // Offline is one of §10.1's four network states, not an error. The token is left
      // alone: it may still be valid, and the caller may be about to queue work offline.
      return null
    } finally {
      inFlightRefresh = null
    }
  })()

  return inFlightRefresh
}

/**
 * Every call to the API. Attaches the bearer token and replays exactly once through a
 * refresh on a 401.
 *
 * A 403 is deliberately not retried: it means "you may not", not "you are stale", and
 * refreshing would hide a permission bug behind an extra round trip and still fail.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null): Promise<Response> =>
    fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  const first = await send(getAccessToken())
  if (first.status !== 401) return first

  const refreshed = await refresh()
  if (refreshed === null) return first
  return send(getAccessToken())
}

export async function signOut(): Promise<void> {
  try {
    await fetch(apiUrl(`${AUTH_BASE}/logout`), { method: 'POST', credentials: 'include' })
  } catch {
    // A network error must not leave someone looking signed in on a device they just
    // asked to be signed out of. The server-side revocation is what logout is FOR, so
    // this is reported by the session simply ending locally either way.
  } finally {
    clearSession()
  }
}

/**
 * §19.4 — adopt the token the dev bar's role switcher produced.
 *
 * Returns a detach function. Attached by the app, never at module load: a listener
 * registered on import would survive into a production bundle, where the event can never
 * fire but the listener would still be there.
 */
export function startListeningForPersonaSwitch(): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<{ accessToken?: string }>).detail
    if (detail?.accessToken) setAccessToken(detail.accessToken, 900)
  }
  globalThis.addEventListener(ACT_AS_EVENT, handler)
  return () => globalThis.removeEventListener(ACT_AS_EVENT, handler)
}
