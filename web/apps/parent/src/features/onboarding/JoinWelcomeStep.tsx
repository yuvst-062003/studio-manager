// Step 1 — Welcome + Agreements. C1, rebuilt against
// docs/superpowers/specs/2026-09-03-onboarding-doors-and-wizard.md §4 "Step 1 —
// agreements" and decisions 10 and 11. It reuses ConsentGate's and ClubTermsStep's own
// strings and `PolicyDocument` piece rather than changing either of those components:
// `ConsentGate.tsx` is also used at `App.tsx`'s regular first-run gate, which must not
// change shape as a side effect of this redesign, and `ClubTermsStep` has no other
// caller so its exported clause list is safe to reuse directly.
//
// **This step no longer decides sign-in-or-not (F1).** §3's redirect rule puts that
// fork in the SHELL (`JoinShell` in `App.tsx`): not signed in shows the shell's own
// sign-in wall, above the whole wizard; signed in shows the wizard, starting here. This
// component is never rendered for a signed-out visitor, so it calls no `useSession()`
// of its own -- the bug F1 names is exactly a step component re-deciding "am I signed
// in?" for itself, which used to remount on back-navigation, restart at
// `status: 'loading'`, and flash the sign-in wall for ~120ms before flipping back.
//
// **Three cards, not two (decision 10, closing F3).** Terms of use, privacy policy and
// the club's own terms-and-payment terms are each their own card, own version, own
// "קריאת המסמך המלא" popup and own tick -- identical shape across all three. Continuing
// needs all three, not two. Submitting records the app-level consent grant (the same
// call `ConsentGate` makes, for the SAME two documents this screen shows two of the
// three cards for) -- the club-level acceptance is what `JoinFlow`'s `onAccept` carries
// forward as local state, finished once a student exists at step 4's single write (B2).
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiUrl } from '@studio/core'
import { Alert, Button, Card, Checkbox, PolicyDocument, useModalDialog } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PAYMENT_CLAUSE_KEYS } from '../health/ClubTermsStep'
import type { ConsentState, PrivacyClient } from '../privacy/privacyClient'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

/** Mirrors `app/services/health/club_terms.py`'s `CLUB_TERMS_VERSION`. There is no
 *  parent-readable field carrying this number yet: §6's API-changes table adds
 *  `slug`/`logo_url` to `OnboardingInfoOut` but not `club_terms_version`, unlike
 *  `policy_version` (read live off `GET /privacy/consents`, which this screen already
 *  calls). Until that gap is closed server-side, this constant is the honest stopgap --
 *  it must be bumped by hand alongside the backend one, and is exported so a test (or a
 *  future caller) reads the same number rather than a second copy of it. */
export const CLUB_TERMS_DISPLAY_VERSION = 2

type WelcomeDoc = PolicyDoc | 'club'

const cardHeadStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'space-between',
}

const summaryStyle: CSSProperties = {
  color: 'var(--text-secondary)',
}

const versionStyle: CSSProperties = {
  color: 'var(--text-muted)',
  flex: 'none',
  fontSize: 'var(--text-caption)',
}

const chipStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
  borderRadius: '999px',
  color: 'var(--accent)',
  display: 'inline-block',
  fontSize: 'var(--text-caption)',
  fontWeight: 500,
  padding: 'var(--space-1) var(--space-3)',
}

const clauseStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  marginBlockEnd: 'var(--space-3)',
}

const logoStyle: CSSProperties = {
  blockSize: '2.5rem',
  inlineSize: 'auto',
  objectFit: 'contain',
}

// F4 -- a TRUE overlay, not another `<Card>` dropped into the page flow: fixed over the
// whole viewport so reading a long document never pushes the accept button down a
// screen and a half, and `useModalDialog` (below) traps focus and closes on Escape.
// Deliberately local rather than a new `@studio/ui` primitive -- `BookingDialog.tsx`
// states the house convention already: "NOT a Dialog primitive; a primitive is a shared
// contract that wants its own artboard". `useModalDialog` IS the shared piece here, the
// same hook `PaymentOverlay`/`BookingDialog`/`ConfirmDialog` each build their own
// backdrop around.
const backdropStyle: CSSProperties = {
  alignItems: 'flex-start',
  background: 'color-mix(in srgb, black 55%, transparent)',
  display: 'flex',
  inset: 0,
  justifyContent: 'center',
  overflowY: 'auto',
  padding: 'var(--space-4)',
  position: 'fixed',
  zIndex: 1000,
}

const popupPanelStyle: CSSProperties = {
  inlineSize: '100%',
  maxInlineSize: '32rem',
}

const popupHeaderStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
}

export type JoinWelcomeStepProps = {
  locale: Locale
  studioName: string
  /** §6's `OnboardingInfoOut.logo_url` -- same API path both the sign-in wall
   *  (`App.tsx`'s `JoinShell`) and this screen read, an unauthenticated
   *  `GET /public/studios/{slug}/logo`. Null when the studio has no uploaded logo. */
  logoUrl: string | null
  privacyClient: PrivacyClient
  /** Always called with `true` -- reached only once all three cards are checked. The
   *  boolean keeps the call site symmetrical with `JoinFlow`'s existing
   *  `clubTermsAccepted` state rather than hardcoding `true` two files apart. */
  onAccept: (clubTermsAccepted: boolean) => void
}

function popupTitle(locale: Locale, doc: WelcomeDoc): string {
  if (doc === 'terms') return t(locale, 'reports.privacy.terms.title')
  if (doc === 'policy') return t(locale, 'reports.privacy.policy.title')
  return t(locale, 'health.clubTerms.title')
}

export function JoinWelcomeStep({
  locale,
  studioName,
  logoUrl,
  privacyClient,
  onAccept,
}: JoinWelcomeStepProps) {
  const [state, setState] = useState<ConsentState | null | undefined>(undefined)
  const [accepted, setAccepted] = useState({ terms: false, privacy: false, club: false })
  const [openDoc, setOpenDoc] = useState<WelcomeDoc | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void privacyClient
      .consents()
      .then((next) => alive && setState(next))
      .catch(() => alive && setState(null))
    return () => {
      alive = false
    }
  }, [privacyClient])

  // F4 -- locks the page underneath the popup for exactly as long as it is open. A
  // fixed-position backdrop already blocks pointer scroll on the page beneath it, but a
  // wheel/touch event over the popup's OWN scroll container would still bubble to the
  // document if `overflow` were left alone -- this is what stops that, and it is what a
  // test can assert directly rather than inferring from CSS positioning.
  useEffect(() => {
    if (!openDoc) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [openDoc])

  const dialogRef = useModalDialog(openDoc !== null, () => setOpenDoc(null))

  const allThree = accepted.terms && accepted.privacy && accepted.club
  const policyVersionLine = state
    ? `${t(locale, 'reports.privacy.doc.version')} ${state.policy_version_label}`
    : null
  const clubVersionLine = `${t(locale, 'reports.privacy.doc.version')} ${CLUB_TERMS_DISPLAY_VERSION}`

  async function submit() {
    if (!allThree || saving) return
    setSaving(true)
    setFailed(false)
    try {
      // A failed `state` read (network blip) still lets a family continue -- there is
      // nothing to record the version against, and standing this screen up forever on
      // a read failure would lock a family out of the club's own link over a fault
      // that has nothing to do with them.
      if (state) {
        await privacyClient.grant(state.policy_version, { terms: true, privacy: true })
      }
      onAccept(true)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const logo = logoUrl ? (
    <img alt={studioName} data-testid="join-welcome-logo" src={apiUrl(logoUrl)} style={logoStyle} />
  ) : null

  const popupLogo = logoUrl ? (
    <img
      alt={studioName}
      data-testid="join-welcome-popup-logo"
      src={apiUrl(logoUrl)}
      style={logoStyle}
    />
  ) : null

  return (
    <div data-testid="join-welcome">
      <OnboardingWizardChrome
        locale={locale}
        position={stepPosition('welcome')}
        title={t(locale, 'health.onboarding.step.welcome')}
      >
        <div className="studio-page-header">
          {logo}
          <h1>{studioName}</h1>
        </div>
        <h2 style={{ margin: 0 }}>{t(locale, 'people.join.welcome.heading')}</h2>
        <p style={{ margin: 0 }}>{t(locale, 'people.join.welcome.subtitle')}</p>

        {/* No sign-in fork here (F1) -- the shell renders this component only once
            `session.status === 'signed-in'`, so there is nothing to branch on. */}

        <Card>
          <div style={cardHeadStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'reports.privacy.terms.title')}</h3>
            {policyVersionLine ? (
              <span data-testid="join-welcome-terms-version" style={versionStyle}>
                {policyVersionLine}
              </span>
            ) : null}
          </div>
          <p style={summaryStyle}>{t(locale, 'reports.privacy.gate.termsSummary')}</p>
          <Button
            data-testid="join-welcome-terms-read"
            onClick={() => setOpenDoc('terms')}
            type="button"
            variant="ghost"
          >
            {t(locale, 'reports.privacy.gate.readFull')}
          </Button>
          <Checkbox
            block
            checked={accepted.terms}
            data-testid="join-welcome-terms-check"
            label={t(locale, 'reports.privacy.gate.acceptTerms')}
            onChange={(event) =>
              setAccepted((prev) => ({ ...prev, terms: event.target.checked }))
            }
          />
        </Card>

        <Card>
          <div style={cardHeadStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'reports.privacy.policy.title')}</h3>
            {policyVersionLine ? (
              <span data-testid="join-welcome-privacy-version" style={versionStyle}>
                {policyVersionLine}
              </span>
            ) : null}
          </div>
          <p style={summaryStyle}>{t(locale, 'reports.privacy.gate.privacySummary')}</p>
          <Button
            data-testid="join-welcome-privacy-read"
            onClick={() => setOpenDoc('policy')}
            type="button"
            variant="ghost"
          >
            {t(locale, 'reports.privacy.gate.readFull')}
          </Button>
          <Checkbox
            block
            checked={accepted.privacy}
            data-testid="join-welcome-privacy-check"
            label={t(locale, 'reports.privacy.gate.acceptPrivacy')}
            onChange={(event) =>
              setAccepted((prev) => ({ ...prev, privacy: event.target.checked }))
            }
          />
        </Card>

        {/* The club card -- same shape as the two above it (decision 10). The three
            payment clauses live ONLY inside its popup now; "the three payment clauses
            ARE that document" (spec §2 decision 10), so nothing is duplicated between
            the card body and the popup. */}
        <Card>
          <div style={cardHeadStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'health.clubTerms.title')}</h3>
            <span data-testid="join-welcome-club-version" style={versionStyle}>
              {clubVersionLine}
            </span>
          </div>
          <span style={chipStyle}>{t(locale, 'health.clubTerms.onceForFamily')}</span>
          <p style={summaryStyle}>{t(locale, 'health.clubTerms.summary')}</p>
          <Button
            data-testid="join-welcome-club-read"
            onClick={() => setOpenDoc('club')}
            type="button"
            variant="ghost"
          >
            {t(locale, 'reports.privacy.gate.readFull')}
          </Button>
          <Checkbox
            block
            checked={accepted.club}
            data-testid="join-welcome-club-check"
            label={t(locale, 'health.clubTerms.accept')}
            onChange={(event) =>
              setAccepted((prev) => ({ ...prev, club: event.target.checked }))
            }
          />
        </Card>

        {failed ? (
          <Alert iconLabel={t(locale, 'people.join.title')} live tone="danger">
            {t(locale, 'common.error.generic')}
          </Alert>
        ) : null}

        <WizardNavButtons
          forwardDisabled={!allThree || saving || state === undefined}
          forwardLabel={saving ? t(locale, 'reports.privacy.gate.working') : undefined}
          forwardTestId="join-welcome-continue"
          locale={locale}
          onForward={() => void submit()}
        />
      </OnboardingWizardChrome>

      {openDoc ? (
        <div style={backdropStyle}>
          <div
            aria-label={popupTitle(locale, openDoc)}
            aria-modal="true"
            data-testid="join-welcome-document-popup"
            ref={dialogRef}
            role="dialog"
            style={popupPanelStyle}
            tabIndex={-1}
          >
            <Card>
              <div style={popupHeaderStyle}>
                {popupLogo}
                <h2 style={{ flex: '1 1 auto', margin: 0 }}>{popupTitle(locale, openDoc)}</h2>
              </div>
              {openDoc === 'club' ? (
                <>
                  <h3>{t(locale, 'health.clubTerms.payment.title')}</h3>
                  {PAYMENT_CLAUSE_KEYS.map((key) => (
                    <p data-testid={key} key={key} style={clauseStyle}>
                      {t(locale, key)}
                    </p>
                  ))}
                </>
              ) : state ? (
                <PolicyDocument
                  isDraft={state.policy_is_draft}
                  locale={locale}
                  only={openDoc}
                  versionLabel={state.policy_version_label}
                />
              ) : null}
              <Button
                data-testid="join-welcome-document-close"
                onClick={() => setOpenDoc(null)}
                type="button"
                variant="ghost"
              >
                {t(locale, 'reports.privacy.gate.closeFull')}
              </Button>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
