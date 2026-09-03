// §5.4b — the shared member onboarding link. The shell (`JoinShell` in `App.tsx`) reads
// the session ONCE and shows its own sign-in wall before this ever mounts (F1/F10) — by
// the time this component exists, the family is already signed in. After sign-in the
// family walks one four-step wizard: welcome + agreements, family, health, payment.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiFetch } from '@studio/core'
import { EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentSetup } from '../billing/PaymentSetup'
import type { PaymentSummaryRow, StandingOrderLink } from '../billing/PaymentSetup'
import type { BillingClient } from '../billing/billingClient'
import {
  firstStudentNeedingDeclaration,
  needsFullDeclaration,
  type GatedStudent,
} from '../health/HealthGate'
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
  const [doneRows, setDoneRows] = useState<PaymentSummaryRow[]>([])
  const [flushing, setFlushing] = useState(false)
  const [flushError, setFlushError] = useState<string | null>(null)
  const [clubTermsAccepted, setClubTermsAccepted] = useState(false)
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

  // Loads `students` once on entering the health step. Deliberately does NOT decide
  // whether to advance to payment here -- under the deferred-submission model the
  // server never learns a kid is done until the final flush (Step 4's "enter the
  // app"), so `students`' own `health_status` stays 'missing' through the whole
  // queue. `handleHealthSigned` below is what decides, from `healthDrafts`.
  useEffect(() => {
    if (step !== 'health' || students.length > 0) return
    // Fetched directly rather than through `refreshStudents` (still used by
    // `handleHealthSigned` below) -- calling a setState-carrying callback from an effect
    // is the same cascading-render risk the fetch above (line 104) already avoids by
    // setting state from its own `.then`, not from a function an effect merely invokes.
    let alive = true
    void loadStudents().then((next) => alive && setStudents(next))
    return () => {
      alive = false
    }
  }, [step, students.length])

  // Save-on-change: every edit to the family form or a kid's health answers persists
  // immediately, so a closed tab loses nothing typed since the last keystroke.
  useEffect(() => {
    saveJoinDraft(token, { family: familyDraft, healthDrafts })
  }, [token, familyDraft, healthDrafts])

  if (info === null) return null

  /** A kid still needing a declaration, by the rule that survives the deferred model:
   *  server truth (`needsFullDeclaration`) says so, AND there is no local draft for
   *  them yet. A signed kid's `health_status` never flips to 'signed' server-side
   *  until the final flush, so server truth alone would loop forever. */
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

  async function acceptClubTermsForFamily(studentId: string) {
    const status = await healthClient.agreementStatus(studentId)
    if (status.terms_accepted) return
    await healthClient.acceptClubTerms(studentId, status.club_terms_version)
  }

  async function submitFamily(payload: JoinFamilyPayload) {
    if (inFlight) return
    setInFlight(true)
    setFailed(null)
    try {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: payload.first_name,
          last_name: payload.last_name,
          phone: payload.phone,
          signer: payload.signer,
          other_parent: payload.other_parent,
          pickup_contacts: payload.pickup_contacts,
          children: payload.children.map((child) => ({
            first_name: child.first_name,
            last_name: child.last_name,
            birthdate: child.birthdate,
            group_ids: child.group_ids,
            self_student: child.self_student,
            national_id: child.national_id,
            grade: child.grade,
          })),
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
      const body = (await response.json()) as { student_ids: string[] }
      if (clubTermsAccepted && body.student_ids[0]) {
        await acceptClubTermsForFamily(body.student_ids[0])
      }
      const nextStudents = await refreshStudents()
      if (firstStudentNeedingDeclaration(nextStudents)) {
        setStep('health')
        return
      }
      setStep('payment')
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

  /** Step 4's "enter the app" — the ONE call site for the deferred submission's actual
   *  `client.submit()` invocations. Every kid's held-in-draft declaration is flushed,
   *  one call per kid, back to back, before the real navigation. A failure leaves the
   *  drafts (and the done screen) exactly as they were -- nothing is lost, and the
   *  family can retry rather than being silently moved on with an unsaved kid. */
  async function handleEnterApp() {
    if (flushing) return
    setFlushing(true)
    setFlushError(null)
    try {
      for (const draft of Object.values(healthDrafts)) {
        // Set the moment the health step's schema loads (JoinHealthStep.tsx) — by the
        // time a draft is signable at all its template has loaded, so a missing id
        // here is a real bug, not a state to paper over silently.
        if (!draft.templateId) throw new Error(`draft for ${draft.studentId} has no templateId`)
        await healthClient.submit(draft.studentId, {
          template_id: draft.templateId,
          answers: draft.answers,
          signature_image_base64: draft.signatureBase64 ?? '',
        })
      }
      clearJoinDraft(token)
      finishWizard()
    } catch {
      setFlushError(t(locale, 'people.join.done.flushFailed'))
    } finally {
      setFlushing(false)
    }
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
        inFlight={inFlight}
        initialValue={familyDraft}
        locale={locale}
        onBack={() => setStep('welcome')}
        onChange={setFamilyDraft}
        onSubmit={(payload) => void submitFamily(payload)}
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
        // No `onBack`: health is complete by construction once this step renders — the
        // effect above only advances here when no student still needs a declaration — so
        // "back" would land on the health step's own effect, which immediately bounces
        // forward again. A button that visibly does nothing is worse than no button.
        position={stepPosition('payment')}
        title={t(locale, 'health.onboarding.step.payment')}
      >
        <PaymentSetup
          client={billingClient}
          locale={locale}
          onFinish={() => setStep('done')}
          onNothingToPay={() => setStep('done')}
          onSummary={setDoneRows}
          standingOrderLinks={standingOrderLinks}
          students={setupChildren}
        />
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
          flushError={flushError}
          flushing={flushing}
          locale={locale}
          onEnterApp={() => void handleEnterApp()}
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
