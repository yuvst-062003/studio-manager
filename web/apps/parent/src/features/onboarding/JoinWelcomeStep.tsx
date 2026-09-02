// Step 1 — Welcome + Agreements. Composes ConsentGate's document-rendering pieces and
// ClubTermsStep's clause list into one screen local to the join wizard, rather than
// changing either of those components: `ConsentGate.tsx` is also used at `App.tsx`'s
// regular first-run gate, which must not change shape as a side effect of this
// redesign, and `ClubTermsStep` has no other caller so its exported clause list is
// safe to reuse directly.
//
// Two inner panels under one step number: welcome (sign-in if needed) then agreements
// (both cards), not two separate wizard steps. Submitting records both consent grants
// -- the app-level `client.grant(...)` (the same call `ConsentGate` makes) and the
// club-level acceptance the caller finishes once a student exists -- from one combined
// action.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from '@studio/core'
import { Alert, Button, Card, Checkbox, PolicyDocument, SignIn } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PAYMENT_CLAUSE_KEYS } from '../health/ClubTermsStep'
import type { ConsentState, PrivacyClient } from '../privacy/privacyClient'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

const clauseStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  marginBlockEnd: 'var(--space-3)',
}

export type JoinWelcomeStepProps = {
  locale: Locale
  studioName: string
  privacyClient: PrivacyClient
  /** Always called with `true` -- reached only once both cards are checked. The
   *  boolean keeps the call site symmetrical with `JoinFlow`'s existing
   *  `clubTermsAccepted` state rather than hardcoding `true` two files apart. */
  onAccept: (clubTermsAccepted: boolean) => void
  token: string
}

export function JoinWelcomeStep({
  locale,
  studioName,
  privacyClient,
  onAccept,
  token,
}: JoinWelcomeStepProps) {
  const session = useSession()
  const [state, setState] = useState<ConsentState | null | undefined>(undefined)
  const [accepted, setAccepted] = useState({ app: false, club: false })
  const [openDoc, setOpenDoc] = useState<PolicyDoc | null>(null)
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

  const both = accepted.app && accepted.club

  async function submit() {
    if (!both || saving) return
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

  return (
    <div data-testid="join-welcome">
      <OnboardingWizardChrome
        locale={locale}
        position={stepPosition('welcome')}
        title={t(locale, 'health.onboarding.step.welcome')}
      >
        <div className="studio-page-header">
          <h1>{studioName}</h1>
        </div>
        <p style={{ margin: 0 }}>{t(locale, 'health.onboarding.title')}</p>

        {session.status !== 'signed-in' ? (
          <SignIn locale={locale} app="parent" returnPath={`/join/${token}`} />
        ) : (
          <>
            <Card>
              <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.welcome.appCardTitle')}</h2>
              <Checkbox
                block
                checked={accepted.app}
                data-testid="join-welcome-app-check"
                label={t(locale, 'people.join.welcome.appCardLabel')}
                onChange={(event) =>
                  setAccepted((prev) => ({ ...prev, app: event.target.checked }))
                }
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  data-testid="join-welcome-read-terms"
                  onClick={() => setOpenDoc('terms')}
                  type="button"
                  variant="ghost"
                >
                  {t(locale, 'reports.privacy.terms.title')} · {t(locale, 'reports.privacy.gate.readFull')}
                </Button>
                <Button
                  data-testid="join-welcome-read-privacy"
                  onClick={() => setOpenDoc('policy')}
                  type="button"
                  variant="ghost"
                >
                  {t(locale, 'reports.privacy.policy.title')} · {t(locale, 'reports.privacy.gate.readFull')}
                </Button>
              </div>
            </Card>

            {openDoc && state ? (
              <Card>
                <div data-testid="join-welcome-document-sheet">
                  <Button onClick={() => setOpenDoc(null)} type="button" variant="ghost">
                    {t(locale, 'reports.privacy.gate.closeFull')}
                  </Button>
                  <PolicyDocument
                    isDraft={state.policy_is_draft}
                    locale={locale}
                    only={openDoc}
                    versionLabel={state.policy_version_label}
                  />
                </div>
              </Card>
            ) : null}

            {/* The club card -- per the 2026-09-03 correction, this is exactly
                ClubTermsStep's own shape (inline clauses, one checkbox, no links), not
                the "two links" phrasing the original spec text used before the
                correction was found against the actual component. */}
            <Card>
              <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'health.clubTerms.title')}</h2>
              {PAYMENT_CLAUSE_KEYS.map((key) => (
                <p data-testid={key} key={key} style={clauseStyle}>
                  {t(locale, key)}
                </p>
              ))}
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
              forwardDisabled={!both || saving || state === undefined}
              forwardLabel={saving ? t(locale, 'reports.privacy.gate.working') : undefined}
              forwardTestId="join-welcome-continue"
              locale={locale}
              onForward={() => void submit()}
            />
          </>
        )}
      </OnboardingWizardChrome>
    </div>
  )
}
