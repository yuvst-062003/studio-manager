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
// walkthrough at #/install. §10.6's stake (pending_ops and Safari's 7-day cap) is why
// the nudge exists at all — and why it is a pitch, not a gate.

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

describe('staff app', () => {
  it('renders the app in a browser tab — no install wall', async () => {
    // jsdom reports display-mode: browser, the exact state that used to hit the wall.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('install-banner')).toBeInTheDocument())
    expect(screen.queryByTestId('install-walkthrough')).toBeNull()
  })

  it('nudges with a reason, and the nudge opens the walkthrough on demand', async () => {
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

  it('redirects a bare #/attendance to the schedule rather than falling through (S4.3)', async () => {
    // S4.3 — the deep-link prefix with no session id used to fall through in silence to
    // whatever Resolve rendered. The date picker on the schedule screen is where a coach
    // picks a session, so that is where the bare hash now lands, explicitly.
    globalThis.location.hash = '#/attendance'
    render(<App />)
    await waitFor(() => expect(globalThis.location.hash).toBe('#/schedule'))
  })

  it('renders no dev bar without a developer identity', () => {
    // §19.4 — 'Rendered only when the authenticated identity has is_developer.'
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
})
