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
// "קריאת המסמך המלא" popup -- identical shape across all three. Submitting records the
// app-level consent grant (the same call `ConsentGate` makes, for the SAME two documents
// this screen shows two of the three cards for) -- the club-level acceptance is what
// `JoinFlow`'s `onAccept` carries forward as local state, finished once a student exists
// at step 4's single write (B2).
//
// **One tick, not three (owner request, 2026-09-03).** The three cards above kept their
// own version and their own popup, but only ONE control gates continuing now -- a real
// `Checkbox` whose label names all three documents, so agreeing once is still informed
// consent rather than a blind bundle. This is a UI change only: `submit` below still
// calls `privacyClient.grant` with BOTH `terms` and `privacy` (two ledger rows, per
// `grant`'s own "append one decision per entry" contract) and still calls `onAccept(true)`
// for the caller's own separately-versioned club-terms write. The owner accepted a
// simpler screen, not a coarser consent record.
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiUrl } from '@studio/core'
import { Alert, Button, Card, Checkbox, Icon, PolicyDocument, useModalDialog } from '@studio/ui'
import type { PolicyDoc } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PAYMENT_CLAUSE_KEYS } from '../health/ClubTermsStep'
import type { ConsentState, PrivacyClient } from '../privacy/privacyClient'
import { OnboardingWizardChrome, stepPosition, type WizardStepKey } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

type WelcomeDoc = PolicyDoc | 'club'

// The redesigned card (owner: "too heavy" -- the old shape put the tick on its own row
// and read the full-document link as a bordered `<Button>`, making each card roughly
// twice the height it needed). `<Card>` itself (`web/packages/ui/src/primitives/Card.tsx`
// + its CSS) is not this component's to change -- its 18px/20px padding and 14px radius
// are shared by every other screen that uses it, and the owner asked for THIS screen
// alone. So these three cards are plain, locally-styled elements instead, built from the
// same tokens `<Card>` itself reads.
const compactCardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
}

const cardHeadStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
}

const cardTitleStyle: CSSProperties = {
  flex: '1 1 auto',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

// The decorative mirror of the ONE real tick (below, decision: "a single control that
// agrees to all three documents at once"). It is `aria-hidden` and never in the tab
// order on purpose -- the accessible, focusable, labelled control is the single
// `Checkbox` under the three cards, and duplicating it visually here as three MORE
// checkbox-shaped things a screen reader could land on would be the exact "<span> that
// only looks like one" the redesign was told not to build. This is purely the artboard's
// "filled accent square with a ✓ when on" look, kept per-card because the cards
// themselves stayed three.
const tickMarkStyle: CSSProperties = {
  blockSize: '1.0625rem',
  border: 'var(--border-width-strong) solid var(--border-strong)',
  borderRadius: 'var(--radius-xs)',
  color: 'var(--surface)',
  display: 'grid',
  flex: 'none',
  inlineSize: '1.0625rem',
  placeItems: 'center',
}

const tickMarkOnStyle: CSSProperties = {
  ...tickMarkStyle,
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
}

const versionPillStyle: CSSProperties = {
  border: 'var(--border-width-hairline) solid var(--border-strong)',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--text-muted)',
  flex: 'none',
  fontSize: 'var(--text-micro)',
  padding: '1px var(--space-2)',
}

const summaryStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  lineHeight: 'var(--leading-relaxed)',
  margin: 0,
}

const chipStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--accent)',
  display: 'inline-block',
  fontSize: 'var(--text-caption)',
  fontWeight: 500,
  padding: 'var(--space-1) var(--space-3)',
}

// The artboard's "קריאת המסמך המלא ›" -- accent-coloured text, not a bordered button.
// `Button`'s `ghost` variant IS a bordered button (`.studio-btn[data-variant="ghost"]`
// in `web/packages/ui/src/primitives/primitives.css`), which is exactly the shape the
// owner rejected -- a plain, unstyled `<button>` with an inline style is what stays a
// real, keyboard-operable control without inheriting that border.
const readLinkStyle: CSSProperties = {
  alignItems: 'center',
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)',
  gap: 'var(--space-1)',
  padding: 0,
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
  /** `OnboardingInfoOut.club_terms_version`, live off the server's own
   *  `app/services/health/club_terms.py::CLUB_TERMS_VERSION` -- not a frontend constant
   *  hand-mirrored from it, which is what this field replaced (nothing kept the two in
   *  step). Null the same way `logoUrl` is: an older cached response, or a caller (a
   *  test, Door A/D's stripped-down welcome) that never had the number, renders no
   *  version line rather than a stale or fabricated one. */
  clubTermsVersion: number | null
  privacyClient: PrivacyClient
  /** Always called with `true` -- reached only once the single tick is checked. The
   *  boolean keeps the call site symmetrical with `JoinFlow`'s existing
   *  `clubTermsAccepted` state rather than hardcoding `true` two files apart. */
  onAccept: (clubTermsAccepted: boolean) => void
  /** Door A (wave E, `/t/<slug>`): an anonymous caller can never reach the
   *  authenticated `POST /privacy/consents` this step normally writes through on
   *  submit -- `true` skips that write entirely and calls `onAccept` the moment the
   *  tick is checked, leaving the caller to carry it into its OWN write
   *  (`agreements_accepted` on the trial booking). `false` (the default) is every other
   *  door's existing behaviour, unchanged. */
  deferAcceptance?: boolean
  /** Wave E's door → step-list mapping. Defaults to the full 4-step list -- Doors
   *  B/C/D's existing rail, unchanged; Door A passes its own 3-step list. */
  steps?: readonly WizardStepKey[]
}

function popupTitle(locale: Locale, doc: WelcomeDoc): string {
  if (doc === 'terms') return t(locale, 'reports.privacy.terms.title')
  if (doc === 'policy') return t(locale, 'reports.privacy.policy.title')
  return t(locale, 'health.clubTerms.title')
}

/** "Onward" is leftward in Hebrew and rightward in English (see
 *  `web/packages/ui/src/primitives/DetailRow.tsx`'s own chevron) -- CSS has no logical
 *  transform for this, and that file's rotation lives in
 *  `web/packages/ui/src/primitives/primitives.css`, which is not this component's file
 *  to add a rule to. Same two rotations, computed locally instead. */
function chevronRotation(locale: Locale): CSSProperties {
  return { transform: locale === 'he' ? 'rotate(90deg)' : 'rotate(-90deg)' }
}

type DocumentCardProps = {
  agreed: boolean
  chip?: ReactNode
  locale: Locale
  onRead: () => void
  readTestId: string
  summary: string
  testIdPrefix: string
  title: string
  versionLine: string | null
}

/** One card, one document, one popup -- the shape decision 10 fixed and this redesign
 *  keeps. What changed is the tick: it used to be each card's OWN `Checkbox`, and is now
 *  a purely decorative mark (see `tickMarkStyle`'s own note) that mirrors the single real
 *  control below all three cards. */
function DocumentCard({
  agreed,
  chip,
  locale,
  onRead,
  readTestId,
  summary,
  testIdPrefix,
  title,
  versionLine,
}: DocumentCardProps) {
  return (
    <div style={compactCardStyle}>
      <div style={cardHeadStyle}>
        <span aria-hidden="true" style={agreed ? tickMarkOnStyle : tickMarkStyle}>
          {agreed ? <Icon name="check" size={11} /> : null}
        </span>
        <h3 style={cardTitleStyle}>{title}</h3>
        {versionLine ? (
          <span data-testid={`${testIdPrefix}-version`} style={versionPillStyle}>
            {versionLine}
          </span>
        ) : null}
      </div>
      {chip}
      <p style={summaryStyle}>{summary}</p>
      <button data-testid={readTestId} onClick={onRead} style={readLinkStyle} type="button">
        {t(locale, 'reports.privacy.gate.readFull')}
        <Icon name="chevronDown" size={12} style={chevronRotation(locale)} />
      </button>
    </div>
  )
}

export function JoinWelcomeStep({
  locale,
  studioName,
  logoUrl,
  clubTermsVersion,
  privacyClient,
  onAccept,
  deferAcceptance = false,
  steps,
}: JoinWelcomeStepProps) {
  const [state, setState] = useState<ConsentState | null | undefined>(undefined)
  // One tick, not three (owner request) -- see this file's header comment. `submit`
  // below still writes three separately-versioned records; this boolean only decides
  // whether the button that triggers that write is enabled.
  const [agreed, setAgreed] = useState(false)
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

  const policyVersionLine = state
    ? `${t(locale, 'reports.privacy.doc.version')} ${state.policy_version_label}`
    : null
  const clubVersionLine =
    clubTermsVersion !== null
      ? `${t(locale, 'reports.privacy.doc.version')} ${clubTermsVersion}`
      : null

  async function submit() {
    if (!agreed || saving) return
    // Door A (wave E): an anonymous caller has no authenticated route to record this
    // through, and the deferred model carries the tick into its OWN write instead
    // (`agreements_accepted`) -- never a network call from this step at all.
    if (deferAcceptance) {
      onAccept(true)
      return
    }
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
        position={stepPosition('welcome', steps)}
        steps={steps}
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

        <DocumentCard
          agreed={agreed}
          locale={locale}
          onRead={() => setOpenDoc('terms')}
          readTestId="join-welcome-terms-read"
          summary={t(locale, 'reports.privacy.gate.termsSummary')}
          testIdPrefix="join-welcome-terms"
          title={t(locale, 'reports.privacy.terms.title')}
          versionLine={policyVersionLine}
        />

        <DocumentCard
          agreed={agreed}
          locale={locale}
          onRead={() => setOpenDoc('policy')}
          readTestId="join-welcome-privacy-read"
          summary={t(locale, 'reports.privacy.gate.privacySummary')}
          testIdPrefix="join-welcome-privacy"
          title={t(locale, 'reports.privacy.policy.title')}
          versionLine={policyVersionLine}
        />

        {/* The club card -- same shape as the two above it (decision 10). The three
            payment clauses live ONLY inside its popup now; "the three payment clauses
            ARE that document" (spec §2 decision 10), so nothing is duplicated between
            the card body and the popup. */}
        <DocumentCard
          agreed={agreed}
          chip={<span style={chipStyle}>{t(locale, 'health.clubTerms.onceForFamily')}</span>}
          locale={locale}
          onRead={() => setOpenDoc('club')}
          readTestId="join-welcome-club-read"
          summary={t(locale, 'health.clubTerms.summary')}
          testIdPrefix="join-welcome-club"
          title={t(locale, 'health.clubTerms.title')}
          versionLine={clubVersionLine}
        />

        {/* The ONE real control (owner request) -- a native `Checkbox`, not the three
            cards' own decorative marks, so it stays a focusable, labelled, keyboard-
            operable control per §a11y rather than three lookalike spans. Its label
            names all three documents so agreeing once is still informed. */}
        <Checkbox
          block
          checked={agreed}
          data-testid="join-welcome-agree-check"
          label={t(locale, 'people.join.welcome.agreeAll')}
          onChange={(event) => setAgreed(event.target.checked)}
        />

        {failed ? (
          <Alert iconLabel={t(locale, 'people.join.title')} live tone="danger">
            {t(locale, 'common.error.generic')}
          </Alert>
        ) : null}

        <WizardNavButtons
          forwardDisabled={!agreed || saving || state === undefined}
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
