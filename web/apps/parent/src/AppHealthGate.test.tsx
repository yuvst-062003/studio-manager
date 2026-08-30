import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// §6.1 step 6 / §5.5's parent-side hard gate, asserted against the SHELL rather than the
// component: HB-w6-health-gate-unmounted was `HealthGate` fully built, fully tested and
// imported by nothing, so a guardian with an unsigned declaration reached home. A test
// that renders `HealthGate` directly can never notice that again — only one that renders
// `App` can.

const SIGNED_IN = {
  status: 'signed-in' as const,
  access: { staff: false, parent: true },
  studios: [],
  activeStudioId: 'studio-1',
  devTools: false,
  actingAsPersonId: null,
  actingAsLabel: null,
  activeStudioName: 'מועדון הדגמה',
  reload: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => SIGNED_IN,
    // jsdom reports display-mode: browser; the shell under test is the installed one.
    useDisplayMode: () => 'standalone' as const,
  }
})

/** `read_at: null` is unread; anything else has been read. */
function note(id: string, read: boolean) {
  return { id, kind: 'announcement.published', title: 't', body: 'b', payload: {}, created_at: '2026-08-28T06:00:00Z', read_at: read ? '2026-08-28T07:00:00Z' : null }
}

function stubChildren(
  healthStatus: 'missing' | 'trial_signed' | 'signed',
  status: 'trial' | 'active' = 'active',
  unread: ReturnType<typeof note>[] = [],
  /**
   * `הסכם הרשמה`, as `/me/students` reports it.
   *
   * `undefined` is a real wire state, not a test convenience: a response from before this
   * field existed omits it. The default stays `undefined` so every case below keeps
   * exercising the health-only fallback it was written for.
   */
  agreementComplete?: boolean,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/me/students')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'st-1',
                first_name: 'נועה',
                last_name: 'לוי',
                status,
                health_status: healthStatus,
                agreement_complete: agreementComplete,
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/notifications')) {
        return new Response(JSON.stringify({ items: unread }), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('the §6.1 health gate, mounted in the shell', () => {
  it('routes a guardian with a missing declaration to the gate and nowhere else', async () => {
    stubChildren('missing')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('health-gate')).toBeInTheDocument())
    // "No other screen is reachable" — home must not render beside the form.
    expect(screen.queryByTestId('parent-home')).toBeNull()
  })

  it('gates a trial-signed child who has been converted: §5.5 wants the full declaration', async () => {
    stubChildren('trial_signed', 'active')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('health-gate')).toBeInTheDocument())
  })

  it('lets a family still on a trial reach the app — §6.3 draws them a home', async () => {
    // The pair §5.4a's booking funnel actually writes. While the gate blocked it, §6.3's
    // reduced trial home was unreachable: `Resolve` renders `TrialHome` only when every
    // child is `status: 'trial'`, and every such child arrives holding the short form.
    stubChildren('trial_signed', 'trial')
    render(<App />)
    // Waits for a POSITIVE signal first. `queryBy(...).toBeNull()` inside `waitFor` passes
    // on the first tick, while `gatedChildren` is still null and the shell is deliberately
    // rendering nothing at all — so on its own it asserts nothing about the gate.
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('health-gate')).toBeNull()
  })

  it('stands aside once every child is signed', async () => {
    stubChildren('signed')
    render(<App />)
    await waitFor(() => expect(screen.queryByTestId('health-gate')).toBeNull())
  })
})

describe('the tab bar, in the shell where 1a draws it', () => {
  it('badges the messages tab with the unread count', async () => {
    // `2a` §7 — "four tabs, with an unread badge on messages". The count is fetched by the
    // SHELL, not by the inbox: a badge that only appeared once you had already opened the
    // inbox would tell you nothing you did not just find out.
    stubChildren('signed', 'active', [note('n1', false), note('n2', false), note('n3', true)])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-messages-badge')).toHaveTextContent('2'))
  })

  it('shows no badge when everything has been read', async () => {
    stubChildren('signed', 'active', [note('n1', true)])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('tab-messages-badge')).toBeNull()
  })

  it('renders the four tabs on a signed family and none while the gate holds', async () => {
    stubChildren('signed')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    for (const key of ['home', 'payments', 'messages', 'profile']) {
      expect(screen.getByTestId(`tab-${key}`)).toBeInTheDocument()
    }
    cleanup()

    // "No other screen is reachable" (§6.1) includes the bar that reaches them.
    stubChildren('missing')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('health-gate')).toBeInTheDocument())
    expect(screen.queryByTestId('tab-bar')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------
// `הסכם הרשמה` — the SEAM between /me/students and the gate.
//
// **This is the case that shipped broken.** Every test above builds its expectation from
// `health_status`, and the gate's own unit tests construct `GatedStudent` objects by hand
// — so nothing exercised `App.tsx`'s mapping of the response, and it dropped
// `agreement_complete` on the floor. The gate then fell back to the health-only rule and
// decided a family who signed the v1 declaration owed nothing, which is precisely the
// family the club's new form exists to re-ask.
//
// The component was right, the API was right, and the ten lines between them were not.
// These assert the wire, not the component.
// ---------------------------------------------------------------------------------
describe('the registration agreement reaches the gate', () => {
  it('gates a child whose declaration is signed but whose agreement is not complete', async () => {
    stubChildren('signed', 'active', [], false)
    render(<App />)
    expect(await screen.findByTestId('health-gate')).toBeInTheDocument()
  })

  it('lets a family through once the whole agreement is complete', async () => {
    stubChildren('signed', 'active', [], true)
    render(<App />)
    await waitFor(() => expect(screen.queryByTestId('health-gate')).not.toBeInTheDocument())
  })

  it('still gates an unsigned child when the field is absent', async () => {
    // The fallback, asserted rather than assumed: a response that predates the field must
    // not open the gate for somebody who has signed nothing at all.
    stubChildren('missing', 'active', [], undefined)
    render(<App />)
    expect(await screen.findByTestId('health-gate')).toBeInTheDocument()
  })
})
