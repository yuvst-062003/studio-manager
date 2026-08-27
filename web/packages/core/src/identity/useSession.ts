// The React binding over ./session.
//
// One refresh on mount, and the result drives §6.1's whole first-run branch. `status` is
// three values rather than a boolean because the difference between "we do not know yet"
// and "nobody is signed in" is a splash screen versus a sign-in screen, and rendering the
// second while the first is true is a flash of the wrong app on every cold start.
import { useCallback, useEffect, useState } from 'react'
import type { AppAccess, SessionState, StudioMembership } from './session'
import { STUDIO_SWITCHED_EVENT, apiUrl, getAccessToken, refresh, signOut, startListeningForPersonaSwitch } from './session'

export type SessionStatus = 'loading' | 'anonymous' | 'signed-in'

export type Session = {
  status: SessionStatus
  access: AppAccess
  studios: StudioMembership[]
  activeStudioId: string | null
  /** §19.4 — whether the dev bar should render. Reported by the server, never asserted. */
  devTools: boolean
  actingAsPersonId: string | null
  actingAsLabel: string | null
  activeStudioName: string | null
  /** The signed-in person's name for the active studio (feature pass 2026-08-27) —
   *  what the sidebar footer and the drawer header render. */
  displayName: string | null
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const NO_ACCESS: AppAccess = { staff: false, parent: false }

export function useSession(): Session {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [state, setState] = useState<SessionState | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [dev, setDev] = useState<{ devTools: boolean; actingAs: string | null; label: string | null }>({
    devTools: false,
    actingAs: null,
    label: null,
  })

  const load = useCallback(async () => {
    const session = await refresh()
    if (session === null) {
      setState(null)
      setStatus('anonymous')
      return
    }
    setState(session)
    setStatus('signed-in')

    // §19.4's flag and the active persona come from /auth/me, which re-derives §6.1's two
    // access queries from the database rather than reading them off the token — §3.1's
    // "a query, not a role check" is only true if something asks.
    try {
      const response = await fetch(apiUrl('/api/v1/auth/me'), {
        credentials: 'include',
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
      })
      if (response.ok) {
        const me = await response.json()
        setState({
          access: me.access ?? { staff: false, parent: false },
          studios: me.studios ?? [],
          activeStudioId: me.active_studio_id ?? null,
        })
        setDev({
          devTools: Boolean(me.dev_tools),
          actingAs: me.acting_as_person_id ?? null,
          label: response.headers.get('X-Acting-As'),
        })
        setDisplayName(me.display_name ?? null)
      }
    } catch {
      // /auth/me failing leaves the refresh's own answer in place. It is the same data,
      // one step staler, and a session that collapsed because a second call failed would
      // be worse than one that is slightly behind.
    }
  }, [])

  useEffect(() => {
    // Guarded rather than fired-and-forgotten. `load` outlives a fast unmount — the
    // refresh is a network round trip — and setting state on a component that is gone is
    // the one way this hook can warn in a test that has nothing to do with it. The flag
    // also satisfies react-hooks/set-state-in-effect, which cannot see that `load`'s
    // first statement is an await and so reads the call as a synchronous setState.
    let alive = true
    void (async () => {
      await load()
      if (!alive) return
    })()
    return () => {
      alive = false
    }
  }, [load])

  // §19.4 — the dev bar dispatches a new token after a persona switch. Attached here
  // rather than at module load, so a production bundle carries no listener for an event
  // that can never fire in it.
  useEffect(() => startListeningForPersonaSwitch(), [])

  // P9 — a studio switch re-reads the whole session, so every /me screen follows the
  // new club without a reload.
  useEffect(() => {
    const handler = () => void load()
    globalThis.addEventListener(STUDIO_SWITCHED_EVENT, handler)
    return () => globalThis.removeEventListener(STUDIO_SWITCHED_EVENT, handler)
  }, [load])

  // `?? []` and not `state?.studios.find(...)`: a response missing `studios` would make
  // that a `.find` on undefined INSIDE a render, which is a white screen rather than an
  // error anyone can act on. `adopt` normalises too; this is the second layer because
  // /auth/me's body reaches state without passing through it.
  const active = (state?.studios ?? []).find((s) => s.studio_id === state?.activeStudioId) ?? null

  return {
    status,
    access: state?.access ?? NO_ACCESS,
    studios: state?.studios ?? [],
    activeStudioId: state?.activeStudioId ?? null,
    devTools: dev.devTools,
    actingAsPersonId: dev.actingAs,
    actingAsLabel: dev.label,
    activeStudioName: active?.studio_name ?? null,
    displayName,
    reload: load,
    signOut: async () => {
      await signOut()
      setState(null)
      setDev({ devTools: false, actingAs: null, label: null })
      setDisplayName(null)
      setStatus('anonymous')
    },
  }
}
