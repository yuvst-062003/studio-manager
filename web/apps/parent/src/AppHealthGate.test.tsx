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

function stubChildren(
  healthStatus: 'missing' | 'trial_signed' | 'signed',
  status: 'trial' | 'active' = 'active',
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
              },
            ],
          }),
          { status: 200 },
        )
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
