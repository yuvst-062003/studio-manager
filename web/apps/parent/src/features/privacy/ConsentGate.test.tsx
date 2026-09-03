// §6.1 step 5 — `5  אישורים  →  terms of service + privacy policy`, the BLOCKING gate.
//
// SPEC:1327: "Steps 5 and 6 are the only hard gates." Step 6 shipped in M4 and step 5 did
// not, so no guardian had ever accepted a privacy policy and no record existed that they
// had. `Resolve.tsx:9` records the reason: "Steps 5 and 6 … are M4's, and this file
// deliberately does NOT pre-build a seam for them."
//
// These test the COMPONENT. The shell-level test lives beside them
// (`ConsentGateMounted.test.tsx`) and is the one that catches the failure this whole
// feature is a case of — a gate that is built, tested and imported by nothing.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { ConsentGate } from './ConsentGate'
import type { ConsentState, PrivacyClient } from './privacyClient'

/** Every method a `Mock`, so a test can assert on the call AND pass it where the real
 *  client is expected. `as never` gave the first and cost the second. */
type MockedPrivacyClient = { [K in keyof PrivacyClient]: Mock } & PrivacyClient

const DRAFT: ConsentState = {
  policy_version: 0,
  policy_version_label: '0.1-draft',
  policy_is_draft: true,
  required: ['terms', 'privacy'],
  outstanding: ['terms', 'privacy'],
  records: [],
}

function accepted(): ConsentState {
  return { ...DRAFT, outstanding: [] }
}

function client(overrides: Partial<Record<keyof PrivacyClient, Mock>> = {}): MockedPrivacyClient {
  return {
    consents: vi.fn(async () => DRAFT),
    grant: vi.fn(async () => accepted()),
    requests: vi.fn(async () => ({ exports: [], deletions: [] })),
    requestExport: vi.fn(async () => ({})),
    requestDeletion: vi.fn(async () => ({})),
    ...overrides,
  } as unknown as MockedPrivacyClient
}

describe('the §6.1 step 5 consent gate', () => {
  it('does not render its children at all while a consent is outstanding', async () => {
    render(
      <ConsentGate client={client()} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    // Not hidden, not disabled, not behind an overlay — the same rule `HealthGate` states:
    // "a screen that is merely covered is one CSS bug away from being reachable."
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('shows the draft notice, because nobody has reviewed this wording', async () => {
    render(
      <ConsentGate client={client()} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('policy-draft-notice')).toBeInTheDocument())
  })

  it('will not submit until BOTH consents are ticked', async () => {
    const c = client()
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    const submit = screen.getByTestId('consent-accept')
    expect(submit).toBeDisabled()

    await userEvent.click(screen.getByTestId('consent-check-terms'))
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByTestId('consent-check-privacy'))
    expect(submit).toBeEnabled()
  })

  it('records BOTH consents at the version it rendered, and then stands aside', async () => {
    const c = client()
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('consent-check-terms'))
    await userEvent.click(screen.getByTestId('consent-check-privacy'))
    await userEvent.click(screen.getByTestId('consent-accept'))

    await waitFor(() => expect(screen.getByTestId('the-app')).toBeInTheDocument())
    // The version posted back is the one the screen SHOWED, not a client constant: the
    // server 409s a mismatch, which is what stops a stale tab recording an agreement to
    // wording nobody was shown.
    expect(c.grant).toHaveBeenCalledWith(0, { terms: true, privacy: true })
  })

  it('keeps the gate up and says so when the write fails', async () => {
    const c = client({
      grant: vi.fn(async () => {
        throw new Error('500')
      }),
    })
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('consent-check-terms'))
    await userEvent.click(screen.getByTestId('consent-check-privacy'))
    await userEvent.click(screen.getByTestId('consent-accept'))

    await waitFor(() => expect(screen.getByTestId('consent-error')).toBeInTheDocument())
    // An acceptance that was not recorded is not an acceptance. The app stays closed.
    expect(screen.queryByTestId('the-app')).toBeNull()
  })

  it('renders nothing at all while the answer is still in flight', () => {
    // A home screen that flashes before the gate is a gate a fast finger gets past — the
    // reason the shell renders null until `gatedChildren` arrives for step 6 as well.
    const c = client({ consents: vi.fn(() => new Promise<ConsentState>(() => {})) })
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    expect(screen.queryByTestId('the-app')).toBeNull()
    expect(screen.queryByTestId('consent-gate')).toBeNull()
  })

  it('stands aside when the read itself fails', async () => {
    // Same posture `HealthGate` documents for step 6: first login cannot happen offline,
    // and a network blip that locked a family out of their installed PWA would punish
    // exactly the parent §6.5 worked hardest to keep. A gate that fails CLOSED on a
    // network error is a gate that bricks the app on a bad train.
    const c = client({
      consents: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('the-app')).toBeInTheDocument())
  })

  it('stands aside when nothing is outstanding', async () => {
    const c = client({ consents: vi.fn(async () => accepted()) })
    render(
      <ConsentGate client={c} locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('the-app')).toBeInTheDocument())
    expect(screen.queryByTestId('consent-gate')).toBeNull()
  })

  it('can be forced visible for a join-link wizard without recording duplicate consent', async () => {
    const c = client({ consents: vi.fn(async () => accepted()) })
    render(
      <ConsentGate client={c} forceReview locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())
    expect(screen.queryByTestId('the-app')).toBeNull()

    await userEvent.click(screen.getByTestId('consent-check-terms'))
    await userEvent.click(screen.getByTestId('consent-check-privacy'))
    await userEvent.click(screen.getByTestId('consent-accept'))

    await waitFor(() => expect(screen.getByTestId('the-app')).toBeInTheDocument())
    expect(c.grant).not.toHaveBeenCalled()
  })

  it('opens after one forced-review submit when consent was genuinely outstanding', async () => {
    const c = client()
    render(
      <ConsentGate client={c} forceReview locale="he">
        <p data-testid="the-app" />
      </ConsentGate>,
    )
    await waitFor(() => expect(screen.getByTestId('consent-gate')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('consent-check-terms'))
    await userEvent.click(screen.getByTestId('consent-check-privacy'))
    await userEvent.click(screen.getByTestId('consent-accept'))

    await waitFor(() => expect(screen.getByTestId('the-app')).toBeInTheDocument())
    expect(c.grant).toHaveBeenCalledWith(0, { terms: true, privacy: true })
  })
})
