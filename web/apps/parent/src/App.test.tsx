import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from './App'

// M0's version of this file asserted HelloProof's app name and its display-mode chip.
// M1 replaced that screen with §6.1's real first run, so the assertions moved with it
// rather than being deleted: what this file is for is "the app renders the right screen
// for the state it is in", and that question outlived the screen that used to answer it.
//
// The 2026-08-27 feature pass inverted §6.5's wall: a browser tab is a first-class way
// to use the app, and the install story is a nudge (InstallBanner) plus an on-demand
// walkthrough at #/install. The tests inverted with it.

beforeEach(() => {
  globalThis.localStorage?.clear()
  globalThis.location.hash = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

describe('parent app', () => {
  it('renders the app in a browser tab — no install wall', async () => {
    // jsdom reports display-mode: browser, the exact state that used to hit the wall.
    // The product decision: nobody is forced to install, so the tab gets the real app.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('install-banner')).toBeInTheDocument())
    expect(screen.queryByTestId('install-walkthrough')).toBeNull()
  })

  it('nudges with a reason, and the nudge opens the walkthrough on demand', async () => {
    // §6.5 still gets its pitch — push on iOS exists only for a home-screen app — it
    // just no longer blocks. The banner's CTA routes to #/install, where the original
    // walkthrough (share-sheet steps on iOS, a real prompt on Chromium) still lives.
    render(<App />)
    const cta = await screen.findByRole('button', {
      name: t('he', 'common.install.banner.cta'),
    })
    expect(screen.getByText(t('he', 'common.install.banner.text'))).toBeInTheDocument()
    cta.click()
    await waitFor(() => expect(screen.getByTestId('install-walkthrough')).toBeInTheDocument())
    expect(screen.getByText(t('he', 'common.install.why'))).toBeInTheDocument()
  })

  it('renders the sign-in screen in a tab when nobody is signed in', async () => {
    // The other half of removing the wall: §6.1 step 2 is now reachable from a plain
    // browser tab, which is where every first-time visitor starts.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/auth/refresh')
          ? new Response('', { status: 401 })
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('sign-in')).toBeInTheDocument())
  })

  it('renders no dev bar without a developer identity', () => {
    // §19.4 — 'Rendered only when the authenticated identity has is_developer.'
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
})

describe('the P1 routes — screens that were built and rendered by nothing', () => {
  it('routes #/absence to the absence pre-report', async () => {
    globalThis.location.hash = '#/absence'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('absence-screen')).toBeInTheDocument())
  })

  it('routes #/payments/history to the payment history screen', async () => {
    globalThis.location.hash = '#/payments/history'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/me/balance')
          ? new Response(
              JSON.stringify({
                payer_person_id: 'p1',
                balance_agorot: 0,
                charged_agorot: 0,
                paid_agorot: 0,
                credit_agorot: 0,
                open_charge_count: 0,
              }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    render(<App />)
    // What this asserts is the ROUTE — the part that was missing while
    // PaymentsSection linked here.
    await waitFor(() => expect(screen.getByTestId('payment-history')).toBeInTheDocument())
  })

  it('routes the uPay return leg to the payment-complete screen', async () => {
    globalThis.location.hash = '#/payment-complete/some-ref'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/payment-complete')
          ? new Response(JSON.stringify({ status: 'pending', public_ref: null }), { status: 200 })
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('payment-complete')).toBeInTheDocument())
  })

  it('routes #/student/<id> to the 2c card', async () => {
    globalThis.location.hash = '#/student/s1'
    render(<App />)
    // items: [] means "not this family's child" — the honest refusal, never another
    // family's card. The route resolving to the card's own screen is the assertion.
    await waitFor(() => expect(screen.getByTestId('student-card-missing')).toBeInTheDocument())
  })
})
