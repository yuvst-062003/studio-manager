// The test that would have caught this lane's whole reason for existing.
//
// `ConsentGate` can be perfect and still ship as nothing: HB-w6-health-gate-unmounted was
// exactly that for step 6 — the gate, the form and the signature pad all built and tested
// in W3, and a guardian with an unsigned declaration still reached home, because nothing
// imported them. A unit test of the component cannot see it. Only a test that renders
// `App` can.
//
// It lives under `features/privacy/` rather than beside `App.tsx` on purpose:
// `scripts/lane-check.sh privacy` resolves this lane's frontend tests from
// `web/apps/*/src/features/privacy/`, so a file one directory up is a file this lane's own
// gate never runs.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

const SIGNED_IN = {
  status: 'signed-in' as const,
  access: { staff: false, parent: true },
  studios: [
    {
      studio_id: 'studio-1',
      studio_name: 'מועדון הדגמה',
      studio_is_demo: false,
      person_id: 'person-1',
      roles: [] as string[],
    },
  ],
  activeStudioId: 'studio-1',
  devTools: false,
  actingAsPersonId: null,
  actingAsLabel: null,
  activeStudioName: 'מועדון הדגמה',
  displayName: 'הורה',
  reload: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => SIGNED_IN,
    useDisplayMode: () => 'standalone' as const,
  }
})

function stub({
  outstanding,
  healthStatus = 'signed',
}: {
  outstanding: string[]
  healthStatus?: 'missing' | 'signed'
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/privacy/consents')) {
        return new Response(
          JSON.stringify({
            policy_version: 0,
            policy_version_label: '0.1-draft',
            policy_is_draft: true,
            required: ['terms', 'privacy'],
            outstanding,
            records: [],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/privacy/requests')) {
        return new Response(JSON.stringify({ exports: [], deletions: [] }), { status: 200 })
      }
      if (url.includes('/api/v1/me/students')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'st-1',
                first_name: 'נועה',
                last_name: 'לוי',
                status: 'active',
                health_status: healthStatus,
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
        return new Response(
          JSON.stringify({
            studio_name: 'מועדון הדגמה',
            email: 'parent@example.invalid',
            groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

describe('§6.1 step 5, mounted in the shell', () => {
  it('holds the whole app while terms and privacy are outstanding', async () => {
    stub({ outstanding: ['terms', 'privacy'] })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-home')).toBeNull()
    // §6.1's "no other screen is reachable" includes the bar that reaches them — the same
    // rule the health gate already obeys.
    expect(screen.queryByTestId('tab-bar')).toBeNull()
  })

  it('stands BEFORE the health gate: step 5 precedes step 6', async () => {
    stub({ outstanding: ['terms', 'privacy'], healthStatus: 'missing' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    // Both gates are due. A guardian is asked for the consents first, and is not shown a
    // medical form before they have accepted the policy that governs collecting it.
    expect(screen.queryByTestId('health-gate')).toBeNull()
  })

  it('hands over to the health gate once the consents are in', async () => {
    stub({ outstanding: [], healthStatus: 'missing' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('health-gate')).toBeInTheDocument())
    expect(screen.queryByTestId('consent-gate')).toBeNull()
  })

  it('lets a fully consented, fully signed family reach the app', async () => {
    stub({ outstanding: [] })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('consent-gate')).toBeNull()
  })

  it('renders the privacy screen behind #/privacy', async () => {
    stub({ outstanding: [] })
    globalThis.location.hash = '#/privacy'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('privacy-screen')).toBeInTheDocument())
    cleanup()
  })

  it('does not put the privacy screen in front of the gate', async () => {
    // A hash is typed by whoever is holding the phone. §6.1's gate wraps every routed
    // branch, and this route is no exception — the consents are how the app is allowed to
    // show the family anything at all.
    stub({ outstanding: ['terms', 'privacy'] })
    globalThis.location.hash = '#/privacy'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    expect(screen.queryByTestId('privacy-screen')).toBeNull()
  })

  it('puts the shared join link behind its own welcome+agreements step before the family form can write people', async () => {
    // §6.1's original claim (an external ConsentGate wraps the join wizard) is
    // superseded by the 2026-09 redesign: `JoinFlow`'s own Step 1 now owns both
    // sign-in and consent, and no external ConsentGate mounts for this route at all
    // (ConsentGate.tsx itself is unchanged -- only this route stopped using it). This
    // test asserts the surviving requirement -- the family form is unreachable before
    // agreements are accepted -- against the new step, not the removed wrapper.
    stub({ outstanding: ['terms', 'privacy'] })
    globalThis.history.pushState({}, '', '/join/live-token-123456')

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('join-welcome')).toBeInTheDocument())
    expect(screen.queryByTestId('join-form')).toBeNull()
    expect(screen.queryByTestId('join-family-step')).toBeNull()
    globalThis.history.pushState({}, '', '/')
  })

  it('starts the shared join link on its own welcome+agreements step even when the app would pass the regular gate', async () => {
    // `JoinWelcomeStep` always shows both cards regardless of prior acceptance --
    // the same "forceReview" behavior the old external ConsentGate wrapper enforced --
    // so a family that already holds the current policy at the app level still meets
    // this step on the join link.
    stub({ outstanding: [] })
    globalThis.history.pushState({}, '', '/join/live-token-123456')

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('join-welcome')).toBeInTheDocument())
    expect(screen.queryByTestId('join-family-step')).toBeNull()
    globalThis.history.pushState({}, '', '/')
  })
})
