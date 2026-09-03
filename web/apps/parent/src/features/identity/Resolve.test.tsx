// §6.1's parent first-launch branch.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Resolve } from './Resolve'
import type { Session } from '@studio/core'

function studio(id: string, name: string) {
  return {
    studio_id: id,
    studio_name: name,
    studio_is_demo: false,
    person_id: `p-${id}`,
    roles: [] as string[],
    is_guardian: true,
  }
}

function session(over: Partial<Session> = {}): Session {
  return {
    status: 'signed-in',
    access: { staff: false, parent: true },
    studios: [studio('a', 'מועדון א')],
    activeStudioId: 'a',
    devTools: false,
    isPlatformAdmin: false,
    actingAsPersonId: null,
    actingAsLabel: null,
    activeStudioName: 'מועדון א',
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

// §6.1 step 3's refusal (and the invitation-link race in front of it) moved to
// `AccessGate` (2026-09-02) — `AccessGate.test.tsx` carries the tests that used to live
// here. `Resolve` is only ever mounted once `AccessGate` has already confirmed
// `session.access.parent`, so every session built by the `session()` helper below
// defaults to that.
describe('Resolve', () => {
  it('shows the studio picker to a guardian at more than one studio', async () => {
    // §6.1 step 4 — 'only shown if she belongs to more than one studio'.
    render(
      <Resolve
        session={session({
          studios: [studio('a', 'מועדון א'), studio('b', 'מועדון ב')],
          activeStudioId: null,
        })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('studio-picker')).toBeInTheDocument())
  })

  it('skips the picker for a guardian at one studio', () => {
    render(<Resolve session={session()} locale="he" />)
    expect(screen.queryByTestId('studio-picker')).toBeNull()
    expect(screen.getByTestId('parent-home')).toBeInTheDocument()
  })

  it('activates the one studio rather than rendering a home that reads nothing', async () => {
    // A session with memberships but no active studio has no tenant scope, so EVERY
    // tenant-scoped route answers 401 -- and the picker below is skipped at one studio,
    // so this fell straight through to a home whose every read failed, in silence. The
    // server no longer mints such a session (identity.py's `_build_session` activates a
    // sole membership), and this is the screen's own answer if one ever reaches it: with
    // exactly one club there is no choice to offer, so it is chosen.
    // Shaped bodies: the home's own reads run alongside the switch, and a bare `{}` for
    // `/me/students` crashes the trial check on an undefined list — a fixture fault, not
    // a product one.
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"items":[]}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ activeStudioId: null })
    render(<Resolve session={s} locale="he" />)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/switch-studio')),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/auth/switch-studio'),
    )!
    expect(String(call[1]?.body)).toContain('"a"')
    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })
})
