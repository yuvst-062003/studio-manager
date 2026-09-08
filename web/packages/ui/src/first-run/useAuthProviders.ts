// The provider list, read once, shared by both sign-in faces.
//
// `SignIn` (parent + dashboard) and `ManagerSignIn` (staff) draw completely different
// screens over the SAME rule: the list comes from GET /auth/providers, which returns only
// providers whose credentials are configured. A button for an unconfigured provider fails
// one step AFTER the user has picked their account — worse than no button, and the reason
// Apple stays invisible until HB-apple-developer closes.
//
// Extracted rather than duplicated because that rule is the load-bearing part. Two copies
// of this effect would be two places for a future provider to be forgotten.
import { useEffect, useState } from 'react'

export type SignInProvider = { name: string; start_url: string }

/**
 * Where the API lives. The same variable `@studio/core` bakes into `apiUrl` — declared
 * again here because ui must not import core (the dependency runs the other way). Empty
 * in development, where the Vite proxy makes relative paths reach the API; absolute in a
 * deployed build, where the start links must navigate to the API's own origin for the
 * callback to set its cookie there.
 */
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? ''

/**
 * `null` while the answer is unknown — which is NOT the same as "there are none". The
 * screens render different copy for the two, so the distinction has to survive the hook.
 */
/** Loading, answered, or asked-and-could-not-tell.
 *
 * **Three states, not two, and the third is why.** `null` used to mean both "still asking"
 * and "the request failed", which was harmless while both rendered the same screen. It
 * stopped being harmless on 2026-09-08, when "still asking" gained a loading screen: a
 * failed fetch would then have held that screen for ever.
 *
 * Collapsing failure into `[]` instead is also wrong, and `ManagerSignIn.test.tsx` says so
 * in as many words — **unknown is not the same as empty**. An empty answer means the server
 * has no provider configured, which is a misconfiguration worth naming on screen. A failed
 * request means we do not know, and the honest screen for that is the ordinary one without
 * its button, not a notice accusing the deployment of something it may not have done.
 */
export type AuthProvidersState =
  | { status: 'loading'; list: readonly SignInProvider[] }
  | { status: 'ready'; list: readonly SignInProvider[] }
  | { status: 'failed'; list: readonly SignInProvider[] }

export function useAuthProviders(): AuthProvidersState {
  const [state, setState] = useState<AuthProvidersState>({ status: 'loading', list: [] })

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await fetch(`${API_ORIGIN}/api/v1/auth/providers`, {
          credentials: 'include',
        })
        if (!response.ok) {
          if (alive) setState({ status: 'failed', list: [] })
          return
        }
        const body = await response.json()
        if (alive) setState({ status: 'ready', list: body.items ?? [] })
      } catch {
        // Offline on the sign-in screen means no buttons, which is the truth. An error
        // banner here would ask somebody to act on something they cannot fix.
        if (alive) setState({ status: 'failed', list: [] })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return state
}

/**
 * The href every provider button carries. A plain `<a href>`, so the browser performs a
 * TOP-LEVEL NAVIGATION — never fetch, never an iframe, never a popup: §5.2 says "OAuth
 * must never run inside a webview. Google returns disallowed_useragent", and an in-page
 * request is the first step toward being one.
 */
export function startUrl(
  provider: SignInProvider,
  app: 'staff' | 'parent' | 'dashboard',
  returnPath: string,
): string {
  return `${API_ORIGIN}${provider.start_url}?app=${app}&return_path=${encodeURIComponent(returnPath)}`
}
