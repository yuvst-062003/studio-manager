import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { PrivacyClient } from '../privacy/privacyClient'
import { CLUB_TERMS_DISPLAY_VERSION, JoinWelcomeStep } from './JoinWelcomeStep'

const LOGO_URL = '/api/v1/public/studios/demo-club/logo'

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
  // Decision 10 -- three cards of identical shape (one document · one link · one popup ·
  // one tick), replacing the old shape where terms+privacy shared a single card and a
  // single tick.
  it('renders three cards, each with its own checkbox -- continuing requires all three, not two', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onAccept = vi.fn()

    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
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

    await user.click(screen.getByTestId('join-welcome-terms-check'))
    expect(continueButton).toBeDisabled()
    await user.click(screen.getByTestId('join-welcome-privacy-check'))
    expect(continueButton).toBeDisabled()
    await user.click(screen.getByTestId('join-welcome-club-check'))
    expect(continueButton).not.toBeDisabled()

    await user.click(continueButton)

    await waitFor(() =>
      expect(client.grant).toHaveBeenCalledWith(3, { terms: true, privacy: true }),
    )
    expect(onAccept).toHaveBeenCalledWith(true)
  })

  // F3 -- the club card used to print its clauses inline, with no link and no popup, a
  // different shape from the other two cards. Now it is the same shape: the three
  // clauses live ONLY behind "קריאת המסמך המלא", not duplicated in the card body too.
  it("moves the club card's three payment clauses into its popup -- not printed in the card body", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    // Not visible before the popup opens.
    expect(screen.queryByTestId('health.clubTerms.payment.cheques')).toBeNull()

    await user.click(screen.getByTestId('join-welcome-club-read'))

    const popup = await screen.findByTestId('join-welcome-document-popup')
    expect(within(popup).getByTestId('health.clubTerms.payment.cheques')).toBeInTheDocument()
    expect(within(popup).getByTestId('health.clubTerms.payment.cancellation')).toBeInTheDocument()
    expect(within(popup).getByTestId('health.clubTerms.payment.proRata')).toBeInTheDocument()
  })

  // F4 -- "קריאת המסמך המלא" used to append the document inline, below the page, pushing
  // the accept button a screen and a half down. The popup must now be a true overlay: it
  // locks the page underneath it while open, and closing it changes nothing else --
  // every tick already made survives.
  it('does not scroll the page underneath an open popup, and preserves every tick on close', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    const termsCheck = screen.getByTestId('join-welcome-terms-check')
    const privacyCheck = screen.getByTestId('join-welcome-privacy-check')
    const clubCheck = screen.getByTestId('join-welcome-club-check')
    await user.click(termsCheck)
    await user.click(privacyCheck)
    await user.click(clubCheck)

    expect(document.body.style.overflow).not.toBe('hidden')

    await user.click(screen.getByTestId('join-welcome-terms-read'))
    await screen.findByTestId('join-welcome-document-popup')
    expect(document.body.style.overflow).toBe('hidden')

    await user.click(screen.getByTestId('join-welcome-document-close'))
    await waitFor(() =>
      expect(screen.queryByTestId('join-welcome-document-popup')).toBeNull(),
    )
    expect(document.body.style.overflow).not.toBe('hidden')

    // The three ticks survived the round trip.
    expect(termsCheck).toBeChecked()
    expect(privacyCheck).toBeChecked()
    expect(clubCheck).toBeChecked()
  })

  // Decision 11 -- the club logo appears on the welcome screen AND in each popup header.
  it("renders the club logo in the step body and in a popup's header when one is available", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={LOGO_URL}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    const bodyLogo = screen.getByTestId('join-welcome-logo')
    expect(bodyLogo).toHaveAttribute('src', expect.stringContaining(LOGO_URL))

    await user.click(screen.getByTestId('join-welcome-privacy-read'))
    const popup = await screen.findByTestId('join-welcome-document-popup')
    const popupLogo = within(popup).getByTestId('join-welcome-popup-logo')
    expect(popupLogo).toHaveAttribute('src', expect.stringContaining(LOGO_URL))
  })

  it('renders no logo at all when the studio has none', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')
    expect(screen.queryByTestId('join-welcome-logo')).toBeNull()
  })

  // Each card carries its OWN version -- terms and privacy come off the same
  // consent-status read (both move with POLICY_VERSION), club terms off the constant
  // this file mirrors from CLUB_TERMS_VERSION.
  it("shows each card's own document version", async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    const termsVersion = await screen.findByTestId('join-welcome-terms-version')
    const privacyVersion = screen.getByTestId('join-welcome-privacy-version')
    const clubVersion = screen.getByTestId('join-welcome-club-version')

    expect(termsVersion).toHaveTextContent('v3')
    expect(privacyVersion).toHaveTextContent('v3')
    expect(clubVersion).toHaveTextContent(String(CLUB_TERMS_DISPLAY_VERSION))
  })

  it("renders no back button -- this is the wizard's first step", async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        logoUrl={null}
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
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('sign-in')).toBeNull()
    // The agreements content is there immediately -- no async "which screen am I"
    // resolution stands between mount and the real content.
    expect(screen.getByTestId('join-welcome-terms-check')).toBeInTheDocument()
  })
})
