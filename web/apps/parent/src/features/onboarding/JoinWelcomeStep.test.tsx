import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinWelcomeStep } from './JoinWelcomeStep'

function makeClient(): PrivacyClient {
  return {
    consents: vi.fn(async () => ({
      outstanding: ['terms', 'privacy'],
      policy_version: 3,
      policy_version_label: 'v3',
      policy_is_draft: false,
    })),
    grant: vi.fn(async () => ({
      outstanding: [],
      policy_version: 3,
      policy_version_label: 'v3',
      policy_is_draft: false,
    })),
  } as unknown as PrivacyClient
}

describe('JoinWelcomeStep', () => {
  it('requires both cards checked before continuing, then grants consent once', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onAccept = vi.fn()

    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={onAccept}
      />,
    )

    await screen.findByText('מועדון הדגמה')
    const continueButton = await screen.findByRole('button', {
      name: t('he', 'health.agreement.next'),
    })
    expect(continueButton).toBeDisabled()

    await user.click(screen.getByTestId('join-welcome-app-check'))
    expect(continueButton).toBeDisabled()
    await user.click(screen.getByTestId('join-welcome-club-check'))
    expect(continueButton).not.toBeDisabled()

    await user.click(continueButton)

    await waitFor(() =>
      expect(client.grant).toHaveBeenCalledWith(3, { terms: true, privacy: true }),
    )
    expect(onAccept).toHaveBeenCalledWith(true)
  })

  it('shows the club terms clauses inline, with no links', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByTestId('health.clubTerms.payment.cheques')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders no back button -- this is the wizard\'s first step', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')
    expect(screen.queryByTestId('onboarding-wizard-back')).toBeNull()
  })

  // F1 -- this step no longer owns "am I signed in?" at all: it takes no `token` prop
  // (nothing here needs a `returnPath` any more) and mounts no `useSession()`, so there
  // is nothing to remount, nothing to restart at `status: 'loading'`, and nothing that
  // could ever render a sign-in wall from inside this component. The shell is the sole
  // authority on that fork now (§3's redirect rule) -- proven here as the ABSENCE of any
  // sign-in affordance, immediately, on a component that received no session at all.
  it('never renders a sign-in wall itself -- the shell owns that fork (F1)', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('sign-in')).toBeNull()
    // The agreements content is there immediately -- no async "which screen am I"
    // resolution stands between mount and the real content.
    expect(screen.getByTestId('join-welcome-app-check')).toBeInTheDocument()
  })
})
