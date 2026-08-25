import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from './App'

// M0's version of this file asserted HelloProof's app name and its display-mode chip.
// M1 replaced that screen with §6.1's real first run, so the assertions moved with it
// rather than being deleted: what this file is for is "the app renders the right screen
// for the state it is in", and that question outlived the screen that used to answer it.

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('parent app', () => {
  it('renders §6.5 install walkthrough while running in a tab', async () => {
    // jsdom reports display-mode: browser, which is exactly the pre-install state.
    // §6.5: 'first run does not proceed until the app is running in standalone display
    // mode.' For the parent app the cost of skipping it is stated outright — 'an iPhone
    // parent who never installs receives no push at all', and §5.11 permits no email or
    // SMS fallback, so that parent is reachable only by telephone.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('install-walkthrough')).toBeInTheDocument())
  })

  it('says why installing matters rather than only asking for it', async () => {
    // §6.5 makes the install the product's main adoption risk. A prompt with no reason
    // is one a parent dismisses.
    render(<App />)
    await waitFor(() => expect(screen.getByText(t('he', 'common.install.why'))).toBeInTheDocument())
  })

  it('renders no sign-in button before the app is installed', async () => {
    // The gate is in FRONT of §6.1's steps 1 and 2, not beside them.
    render(<App />)
    await waitFor(() => screen.getByTestId('install-walkthrough'))
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders no dev bar without a developer identity', () => {
    // §19.4 — 'Rendered only when the authenticated identity has is_developer.'
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
})
