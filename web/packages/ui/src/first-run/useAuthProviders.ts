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
export function useAuthProviders(): SignInProvider[] | null {
  const [providers, setProviders] = useState<SignInProvider[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await fetch(`${API_ORIGIN}/api/v1/auth/providers`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const body = await response.json()
        if (alive) setProviders(body.items ?? [])
      } catch {
        // Offline on the sign-in screen means no buttons, which is the truth. An error
        // banner here would ask someone to act on something they cannot fix.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return providers
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
