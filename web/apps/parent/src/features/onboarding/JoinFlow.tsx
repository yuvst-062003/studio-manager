// §5.4b — the shared member onboarding link. The shell (`JoinShell` in `App.tsx`) reads
// the session ONCE and shows its own sign-in wall before this ever mounts (F1/F10) — by
// the time this component exists, the family is already signed in. After sign-in the
// family walks one four-step wizard: welcome + agreements, family, health, payment.
//
// **B2 — nothing is written until step 4's final button (§2 decision 2).** Steps 1-3
// only ever touch local state (`familyPayload`, `healthDrafts`, both mirrored into
// `localStorage` by `joinDraftStorage`). The single write — consent, club terms, the
// parent, the students, the enrolments, the plans, the first charge and every health
// declaration — fires from `submitRegistration` below, wired to the confirm gate at the
// top of the `payment` step. Before this, `submitFamily` posted `/register` the moment
// step 2 was submitted, and health was flushed separately, one call per kid, from the
// done screen's "enter the app" — two write points where the spec names one.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiFetch, refresh } from '@studio/core'
import { Alert, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentSetup } from '../billing/PaymentSetup'
import type { PaymentSummaryRow, StandingOrderLink } from '../billing/PaymentSetup'
import type { BillingClient } from '../billing/billingClient'
import { needsFullDeclaration, type GatedStudent } from '../health/HealthGate'
import type { HealthClient } from '../health/healthClient'
import type { PrivacyClient } from '../privacy/privacyClient'
import type { FamilyPayloadState } from './familyDraft'
import type { SubjectHealthDraft } from './healthDraft'
import { JoinDoneScreen } from './JoinDoneScreen'
import { JoinFamilyStep, type JoinFamilyPayload } from './JoinFamilyStep'
import { JoinHealthStep } from './JoinHealthStep'
import { JoinWelcomeStep } from './JoinWelcomeStep'
import { clearJoinDraft, loadJoinDraft, saveJoinDraft } from './joinDraftStorage'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

type JoinGroup = { id: string; name: string; weekdays: number[] }
type JoinInfo = { studio_name: string; groups: JoinGroup[]; email: string | null }

type JoinStep = 'welcome' | 'family' | 'health' | 'payment' | 'done'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
  padding: 'var(--space-4)',
}

const confirmStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

async function loadStudents(): Promise<GatedStudent[]> {
  const response = await apiFetch('/api/v1/me/students')
  if (!response.ok) return []
  const body = (await response.json()) as {
    items: {
      id: string
      first_name: string
      last_name: string
      status: string
      health_status: GatedStudent['health_status']
      agreement_complete?: boolean | null
    }[]
  }
  return body.items.map((student) => ({
    id: student.id,
    display_name: `${student.first_name} ${student.last_name}`,
    status: student.status,
    health_status: student.health_status,
    agreement_complete: student.agreement_complete,
  }))
}

/** Steps 2-3's own placeholder students, before anything server-side exists.
 *
 * **Keyed by position, not a server id** (spec §4: "health drafts are keyed by the
 * local student row id ... this removes the need to ask the server 'list my children'
 * mid-wizard"). `payload.children` is built from `familyDraft.ts`'s `SubjectRow[]` in
 * the same order every time (rows are appended, never reordered), so `local-<index>`
 * is stable across a save-to-draft/restore-from-draft round trip -- the health drafts
 * keyed against it in `localStorage` still line up with the right child after a closed
 * tab is reopened. */
function localStudentsFromPayload(payload: JoinFamilyPayload): GatedStudent[] {
  return payload.children.map((child, index) => ({
    id: `local-${index}`,
    display_name: `${child.first_name} ${child.last_name}`.trim(),
    status: 'active',
    health_status: 'missing',
    agreement_complete: false,
  }))
}

export function JoinFlow({
  billingClient,
  displayName,
  healthClient,
  locale,
  onComplete,
  privacyClient,
  standingOrderLinks,
  token,
}: {
  billingClient: BillingClient
  //: The signed-in caller's own name, read ONCE by the shell (F1/F10) and passed down --
  //: this component no longer calls `useSession()` itself.
  displayName: string | null
  healthClient: HealthClient
  locale: Locale
  onComplete?: () => void
  privacyClient: PrivacyClient
  standingOrderLinks: readonly StandingOrderLink[]
  token: string
}) {
  const [info, setInfo] = useState<JoinInfo | null | 'invalid'>(null)
  const [step, setStep] = useState<JoinStep>('welcome')
  // Local placeholders (`local-0`, `local-1`, ...) until `submitRegistration` succeeds,
  // real server rows after -- see `localStudentsFromPayload` above.
  const [students, setStudents] = useState<readonly GatedStudent[]>([])
  // Restore-on-mount lives in these two lazy initializers rather than an effect: `token`
  // does not change over this component's lifetime, so reading the saved draft is a
  // one-time, synchronous part of the first render, not a synchronization with an
  // external system that changes later (the case an effect is actually for).
  const [healthDrafts, setHealthDrafts] = useState<Record<string, SubjectHealthDraft>>(
    () => loadJoinDraft(token)?.healthDrafts ?? {},
  )
  const [familyDraft, setFamilyDraft] = useState<FamilyPayloadState | null>(
    () => loadJoinDraft(token)?.family ?? null,
  )
  // The validated, wire-shaped payload step 2 produced -- held here rather than
  // re-derived at write time, because the write happens two steps later, at step 4's
  // button, and `familyDraft`'s own shape is the pre-validation working state.
  const [familyPayload, setFamilyPayload] = useState<JoinFamilyPayload | null>(null)
  const [doneRows, setDoneRows] = useState<PaymentSummaryRow[]>([])
  const [clubTermsAccepted, setClubTermsAccepted] = useState(false)
  // Whether the ONE write (`submitRegistration`) has succeeded yet -- gates the
  // `payment` step between its confirm gate (nothing written) and `PaymentSetup`
  // (which needs real, server-created student ids and charges to read).
  const [registered, setRegistered] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/public/onboarding/${token}`)
      .then(async (response) => {
        if (!alive) return
        if (!response.ok) {
          setInfo('invalid')
          return
        }
        setInfo((await response.json()) as JoinInfo)
      })
      .catch(() => alive && setInfo('invalid'))
    return () => {
      alive = false
    }
    // `token` only. This used to also depend on `session.status`, back when this
    // component read its own session and re-fetched as sign-in resolved -- the shell now
    // gates rendering this component until `status === 'signed-in'` (F1/F10), so by the
    // time this effect first runs sign-in has already happened and there is no later
    // status change to react to.
  }, [token])

  const refreshStudents = useCallback(async () => {
    const next = await loadStudents()
    setStudents(next)
    return next
  }, [])

  const setupChildren = useMemo(
    () =>
      students.map((student) => {
        const [first_name = '', last_name = ''] = student.display_name.split(' ')
        return { id: student.id, first_name, last_name }
      }),
    [students],
  )

  // Save-on-change: every edit to the family form or a kid's health answers persists
  // immediately, so a closed tab loses nothing typed since the last keystroke.
  useEffect(() => {
    saveJoinDraft(token, { family: familyDraft, healthDrafts })
  }, [token, familyDraft, healthDrafts])

  if (info === null) return null

  /** A kid still needing a declaration: locally-known truth only. Under "nothing is
   *  written until step 4" there is no server read to defer to any more -- steps 1-3
   *  never created these students, so there is nothing for the server to have an
   *  opinion about yet. A kid already holding a local draft is done from this queue's
   *  point of view. */
  function stillNeedsDeclaration(
    list: readonly GatedStudent[],
    drafts: Record<string, SubjectHealthDraft>,
  ) {
    return list.filter(needsFullDeclaration).filter((student) => !drafts[student.id])
  }

  function handleHealthSigned(draft: SubjectHealthDraft) {
    const nextDrafts = { ...healthDrafts, [draft.studentId]: draft }
    setHealthDrafts(nextDrafts)
    if (stillNeedsDeclaration(students, nextDrafts).length === 0) {
      setStep('payment')
    }
  }

  /** Step 2's submit. Writes nothing -- decision 2. Builds this run's local student
   *  placeholders, decides (from what is already locally known) whether anyone still
   *  needs a declaration, and moves on. */
  function handleFamilySubmit(payload: JoinFamilyPayload) {
    setFailed(null)
    setFamilyPayload(payload)
    const localStudents = localStudentsFromPayload(payload)
    setStudents(localStudents)
    setStep(stillNeedsDeclaration(localStudents, healthDrafts).length === 0 ? 'payment' : 'health')
  }

  /** Step 4's final button ("אישור ומעבר לתשלום") — the ONE write. Carries the parent,
   *  the students, their enrolments and plans, the club-terms tick from step 1, and
   *  every health declaration collected in step 3, together, in this one request. */
  async function submitRegistration() {
    if (!familyPayload || inFlight) return
    setInFlight(true)
    setFailed(null)
    try {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: familyPayload.first_name,
          last_name: familyPayload.last_name,
          phone: familyPayload.phone,
          signer: familyPayload.signer,
          other_parent: familyPayload.other_parent,
          pickup_contacts: familyPayload.pickup_contacts,
          club_terms_accepted: clubTermsAccepted,
          children: familyPayload.children.map((child, index) => {
            const draft = healthDrafts[`local-${index}`]
            return {
              first_name: child.first_name,
              last_name: child.last_name,
              birthdate: child.birthdate,
              group_ids: child.group_ids,
              self_student: child.self_student,
              national_id: child.national_id,
              grade: child.grade,
              health:
                draft && draft.templateId
                  ? {
                      template_id: draft.templateId,
                      answers: draft.answers,
                      signature_image_base64: draft.signatureBase64 ?? '',
                    }
                  : null,
            }
          }),
        }),
      })
      if (!response.ok) {
        let code: string | undefined
        try {
          const errorBody = (await response.json()) as { detail?: { code?: string } }
          code = errorBody.detail?.code
        } catch {
          code = undefined
        }
        setFailed(
          code === 'national_id_invalid'
            ? t(locale, 'people.join.nationalIdInvalid')
            : t(locale, 'common.error.generic'),
        )
        return
      }
      // F9 -- reload the session BEFORE asking `/me/students`. The write above just
      // created this family's first membership in this studio; the access token still
      // in memory is the one minted at sign-in, carrying no active studio at all
      // (nobody belonged to a club yet). `refresh()` re-mints it from the httpOnly
      // cookie, and `_build_session` (app/routers/identity.py) falls back to the sole
      // membership once exactly one exists -- so the token that comes back is scoped
      // to the studio this write just joined. Without this, `/me/students` below 401s
      // "no active studio", and the wizard would see zero children: no health step
      // needed, nothing to pay, done -- a family registered but never signing or
      // paying. Decision 4: "reloads the session, so the home screen draws at once and
      // one API request fills in the live schedule behind it."
      await refresh()
      await refreshStudents()
      // Decision 3 -- "cleared the moment the submit succeeds." Everything the draft
      // held is now on the server; there is nothing left worth re-typing from it.
      clearJoinDraft(token)
      setRegistered(true)
    } catch {
      setFailed(t(locale, 'common.error.generic'))
    } finally {
      setInFlight(false)
    }
  }

  function finishWizard() {
    if (onComplete) {
      onComplete()
      return
    }
    globalThis.location.assign('/')
  }

  // F5 -- every step's content is computed here and wrapped exactly ONCE, below, in
  // `pageStyle`'s padded container. Before this, `welcome` and `family` returned their
  // step component bare (no padding), so their primary button landed flush in the
  // corner, underneath the accessibility FAB, and Playwright could not click it. Adding
  // the wrapper to those two branches would have fixed today's symptom and left the same
  // trap for the next step anyone adds; a single wrap point means a step CANNOT be
  // rendered unwrapped.
  let content: ReactNode
  let testId: string | undefined
  if (info === 'invalid') {
    testId = 'join-invalid'
    content = (
      <EmptyState
        title={t(locale, 'people.join.expired')}
        description={t(locale, 'people.join.expiredHint')}
      />
    )
  } else if (step === 'welcome') {
    content = (
      <JoinWelcomeStep
        locale={locale}
        privacyClient={privacyClient}
        studioName={info.studio_name}
        onAccept={(accepted) => {
          setClubTermsAccepted(accepted)
          setStep('family')
        }}
      />
    )
  } else if (step === 'family') {
    content = (
      <JoinFamilyStep
        displayName={displayName ?? ''}
        email={info.email}
        error={failed}
        groups={info.groups}
        initialValue={familyDraft}
        locale={locale}
        onBack={() => setStep('welcome')}
        onChange={setFamilyDraft}
        onSubmit={handleFamilySubmit}
      />
    )
  } else if (step === 'health') {
    content = (
      <JoinHealthStep
        client={healthClient}
        drafts={healthDrafts}
        locale={locale}
        onBack={() => setStep('family')}
        onSigned={handleHealthSigned}
        signerName={displayName ?? undefined}
        students={students}
      />
    )
  } else if (step === 'payment') {
    testId = 'join-payment-step'
    content = (
      <OnboardingWizardChrome
        locale={locale}
        // Back only before the write: once `registered`, health and the family form are
        // complete by construction (the write already happened), so "back" would land on
        // a step whose own effects immediately bounce forward again. A button that
        // visibly does nothing is worse than no button.
        onBack={registered ? undefined : () => setStep('health')}
        position={stepPosition('payment')}
        title={t(locale, 'health.onboarding.step.payment')}
      >
        {registered ? (
          <PaymentSetup
            client={billingClient}
            locale={locale}
            onFinish={() => setStep('done')}
            onNothingToPay={() => setStep('done')}
            onSummary={setDoneRows}
            standingOrderLinks={standingOrderLinks}
            students={setupChildren}
          />
        ) : (
          // The wizard's one write point (decision 2). Everything typed in steps 1-3
          // lives only in `familyPayload`/`healthDrafts` until this button is pressed --
          // wave D's actual prices-and-methods summary layout lands on top of this same
          // gate later; this piece is the mechanism underneath it, not that screen.
          <div data-testid="join-confirm-step" style={confirmStyle}>
            {failed ? (
              <Alert iconLabel={t(locale, 'people.join.title')} live tone="danger">
                {failed}
              </Alert>
            ) : null}
            <WizardNavButtons
              forwardDisabled={inFlight}
              forwardLabel={
                inFlight
                  ? t(locale, 'reports.privacy.gate.working')
                  : t(locale, 'people.join.confirmAndPay')
              }
              forwardTestId="join-confirm-submit"
              locale={locale}
              onForward={() => void submitRegistration()}
            />
          </div>
        )}
      </OnboardingWizardChrome>
    )
  } else {
    testId = 'join-done-step'
    content = (
      <OnboardingWizardChrome
        locale={locale}
        position={stepPosition('payment')}
        title={t(locale, 'health.onboarding.step.payment')}
      >
        <JoinDoneScreen
          flushError={null}
          flushing={false}
          locale={locale}
          onEnterApp={finishWizard}
          rows={doneRows}
        />
      </OnboardingWizardChrome>
    )
  }

  return (
    <div style={pageStyle} data-testid={testId}>
      {content}
    </div>
  )
}

/** `/join/<token>` → the token, or null. A real path, not a hash: the URL lives in a
 *  WhatsApp message and must survive being tapped cold. */
export function matchJoinPath(pathname: string): string | null {
  const match = /^\/join\/([A-Za-z0-9_-]{16,})$/.exec(pathname)
  return match ? (match[1] ?? null) : null
}
