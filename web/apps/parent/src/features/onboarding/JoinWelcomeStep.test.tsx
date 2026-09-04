import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinWelcomeStep } from './JoinWelcomeStep'

const LOGO_URL = '/api/v1/public/studios/demo-club/logo'
// An arbitrary, deliberately-not-the-real-CLUB_TERMS_VERSION number: these tests supply
// it as a PROP now, not read off a frontend constant mirroring the backend's, so a value
// distinct from the real one proves the card renders whatever it is handed.
const CLUB_TERMS_TEST_VERSION = 9

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
  // The owner's redesign: three document cards remain (decision 10 -- each still opens
  // its own document, on its own version), but a SINGLE tick now gates continuing, not
  // three. Ticking it once must still be enough, and every document must still be
  // individually openable -- the compact card lost its own per-document checkbox, not
  // its own popup.
  it('gates continue on ONE tick, and every document stays individually openable', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onAccept = vi.fn()

    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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

    // Each document is still its own popup, reachable independent of the tick.
    await user.click(screen.getByTestId('join-welcome-terms-read'))
    await screen.findByTestId('join-welcome-document-popup')
    await user.click(screen.getByTestId('join-welcome-document-close'))
    await waitFor(() =>
      expect(screen.queryByTestId('join-welcome-document-popup')).toBeNull(),
    )
    expect(continueButton).toBeDisabled()

    // One tick, and continuing unlocks -- there is no second or third box left to find.
    expect(screen.queryByTestId('join-welcome-terms-check')).toBeNull()
    expect(screen.queryByTestId('join-welcome-privacy-check')).toBeNull()
    expect(screen.queryByTestId('join-welcome-club-check')).toBeNull()
    await user.click(screen.getByTestId('join-welcome-agree-check'))
    expect(continueButton).not.toBeDisabled()
  })

  // The owner accepted the one-tick screen but explicitly did NOT accept losing
  // per-document version tracking: "a parent who agreed to an older wording of only the
  // privacy policy is re-asked for the privacy policy alone" only holds if terms and
  // privacy are still recorded as separate ledger rows. `grant`'s own contract ("append
  // one decision per entry") is what makes a single network call still write two rows --
  // asserting the exact call, not the UI, is what proves the single tick did not collapse
  // that into one bundled yes. The club card's own version is the THIRD -- carried
  // forward through `onAccept(true)` into the caller's own separately-versioned write
  // (`club_terms_accepted`, stamped with `CLUB_TERMS_VERSION` at submit time), which is
  // this component's documented contract and is exercised end-to-end in
  // `SelfServeJoinFlow.test.tsx`.
  it('one tick still produces three separately-versioned consent grants, not one bundled yes', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onAccept = vi.fn()

    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={onAccept}
      />,
    )

    await screen.findByText('מועדון הדגמה')
    await user.click(screen.getByTestId('join-welcome-agree-check'))
    await user.click(
      await screen.findByRole('button', { name: t('he', 'health.agreement.next') }),
    )

    // Terms and privacy: two rows, both stamped with the version this client actually
    // rendered (3) -- never merged into a single flag.
    await waitFor(() =>
      expect(client.grant).toHaveBeenCalledWith(3, { terms: true, privacy: true }),
    )
    expect(client.grant).toHaveBeenCalledTimes(1)
    // Club terms: the third, carried onward rather than folded into the call above --
    // `onAccept`'s boolean is what the caller turns into its OWN versioned write.
    expect(onAccept).toHaveBeenCalledWith(true)
  })

  // Accessibility is not negotiable: the tick must be a real, focusable, labelled
  // control -- not a styled <span> -- and reachable by keyboard alone, space included.
  it('the single tick is a real checkbox, labelled with all three documents, operable by keyboard', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    const checkbox = screen.getByRole('checkbox', {
      name: t('he', 'people.join.welcome.agreeAll'),
    })
    // The accessible name names all three documents, not a generic "I agree" -- each
    // title is a substring of the one combined name, so a `RegExp` proves "contains"
    // without requiring `toHaveAccessibleName` to match the whole string three ways.
    expect(checkbox).toHaveAccessibleName(new RegExp(t('he', 'reports.privacy.terms.title')))
    expect(checkbox).toHaveAccessibleName(new RegExp(t('he', 'reports.privacy.policy.title')))
    expect(checkbox).toHaveAccessibleName(new RegExp(t('he', 'health.clubTerms.title')))

    const continueButton = await screen.findByRole('button', {
      name: t('he', 'health.agreement.next'),
    })
    expect(continueButton).toBeDisabled()

    checkbox.focus()
    expect(checkbox).toHaveFocus()
    const user = userEvent.setup()
    await user.keyboard(' ')
    expect(checkbox).toBeChecked()
    expect(continueButton).not.toBeDisabled()
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
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')

    const agreeCheck = screen.getByTestId('join-welcome-agree-check')
    await user.click(agreeCheck)

    expect(document.body.style.overflow).not.toBe('hidden')

    await user.click(screen.getByTestId('join-welcome-terms-read'))
    await screen.findByTestId('join-welcome-document-popup')
    expect(document.body.style.overflow).toBe('hidden')

    await user.click(screen.getByTestId('join-welcome-document-close'))
    await waitFor(() =>
      expect(screen.queryByTestId('join-welcome-document-popup')).toBeNull(),
    )
    expect(document.body.style.overflow).not.toBe('hidden')

    // The one tick survived the round trip.
    expect(agreeCheck).toBeChecked()
  })

  // Decision 11 -- the club logo appears on the welcome screen AND in each popup header.
  it("renders the club logo in the step body and in a popup's header when one is available", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
  // consent-status read (both move with POLICY_VERSION), club terms off the
  // `clubTermsVersion` prop (`OnboardingInfoOut.club_terms_version`, server-side).
  it("shows each card's own document version", async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
    expect(clubVersion).toHaveTextContent(String(CLUB_TERMS_TEST_VERSION))
  })

  // F-finding: `clubTermsVersion` is optional and nullable the same way `logoUrl` is --
  // an older cached `OnboardingInfoOut` (or Door A/D's stripped-down welcome, which
  // passes `null` on purpose) must render no version line, not a stale or fabricated
  // number.
  it('renders no club-terms version line when clubTermsVersion is null', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={null}
        logoUrl={null}
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
      />,
    )
    await screen.findByText('מועדון הדגמה')
    expect(screen.queryByTestId('join-welcome-club-version')).toBeNull()
  })

  it("renders no back button -- this is the wizard's first step", async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
        clubTermsVersion={CLUB_TERMS_TEST_VERSION}
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
    expect(screen.getByTestId('join-welcome-agree-check')).toBeInTheDocument()
  })
})
