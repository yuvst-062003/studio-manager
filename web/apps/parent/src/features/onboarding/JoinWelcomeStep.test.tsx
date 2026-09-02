import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinWelcomeStep } from './JoinWelcomeStep'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => ({
      status: 'signed-in',
      access: { parent: true, staff: false },
      studios: [],
      activeStudioId: null,
      devTools: false,
      actingAsPersonId: null,
      actingAsLabel: null,
      activeStudioName: null,
      displayName: 'מיכל כהן',
      reload: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
    }),
  }
})

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
        token="live-token-123456"
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
        token="live-token-123456"
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
        token="live-token-123456"
      />,
    )
    await screen.findByText('מועדון הדגמה')
    expect(screen.queryByTestId('onboarding-wizard-back')).toBeNull()
  })
})
