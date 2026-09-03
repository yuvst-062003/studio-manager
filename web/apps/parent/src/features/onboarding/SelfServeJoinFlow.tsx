// §3 Doors C (`/?invite=<token>`) and D (`#/add-child`) -- the two doors reached by a
// caller who ALREADY belongs to this studio, so there is no join token anywhere in this
// component: groups and price plans are resolved from the studio's own SLUG
// (`/api/v1/public/studios/{slug}/*`, the same public reads the landing page uses), and
// the one write is `POST /me/students/register` (Door B/C's `OnboardingService.register`,
// reached with no token -- see `app/routers/onboarding.py`).
//
// **"Door C is Door B with one row pre-filled, not a separate step list"** (§3): this is
// deliberately the SAME step list Door B/`JoinFlow.tsx` uses (welcome → family → health →
// payment), built from the same pieces (`JoinWelcomeStep`, `JoinFamilyStep`,
// `JoinHealthStep`, `JoinDoneScreen`) -- what differs between the two doors is only what
// `prefillFirstRowName` seeds the first row with (empty for Door D, the manager's stub
// name for Door C) and whether `door === 'addChild'` turns on `JoinFamilyStep`'s per-row
// trial fork (decision: "member or trial is a control inside that panel", Door D only).
//
// **Decision 1's mechanism, not a hardcoded branch**: `doorSteps.ts`'s `startingStep`
// reads `GET /me/onboarding-status` once and decides whether this run opens at
// 'welcome' or skips straight past it to 'family' -- "the agreements step is skipped,
// not absent... reappears only when a version has moved" (§3 Door D).
//
// **F19/decision 6**: exactly like `JoinFlow.tsx`, health and payment are scoped to the
// student ids THIS run's write actually created -- never the whole family. See
// `submitRegistration` below.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiFetch, refresh } from '@studio/core'
import { Alert } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentSetup } from '../billing/PaymentSetup'
import type { PaymentSummaryRow, StandingOrderLink } from '../billing/PaymentSetup'
import type { BillingClient } from '../billing/billingClient'
import { needsFullDeclaration, type GatedStudent } from '../health/HealthGate'
import type { HealthClient } from '../health/healthClient'
import type { PrivacyClient } from '../privacy/privacyClient'
import type { Door, OnboardingStatus } from './doorSteps'
import { DOOR_STEPS, startingStep } from './doorSteps'
import { emptySubjectRow, type FamilyPayloadState } from './familyDraft'
import type { SubjectHealthDraft } from './healthDraft'
import { JoinDoneScreen } from './JoinDoneScreen'
import { JoinFamilyStep, type JoinFamilyPayload } from './JoinFamilyStep'
import type { TrialChildPayload } from './familyDraft'
import { JoinHealthStep } from './JoinHealthStep'
import { JoinWelcomeStep } from './JoinWelcomeStep'
import { clearJoinDraft, loadJoinDraft, saveJoinDraft } from './joinDraftStorage'
import { OnboardingWizardChrome, stepPosition, type WizardStepKey } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

type Group = { id: string; name: string; weekdays: number[] }

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

/** Local placeholders for the students THIS run's family-step submit produced -- member
 *  rows AND trial rows both get one, keyed the same way `JoinFlow.tsx` keys Door B's
 *  (`local-<index>`), health drafts included -- a trial child gets the exact same real
 *  health form as a member child (decision 7), which is what closes F21 for Door D's own
 *  trial fork too. */
function localStudentsFrom(
  payload: JoinFamilyPayload,
  trialChildren: readonly TrialChildPayload[],
): GatedStudent[] {
  const member = payload.children.map((child, index) => ({
    id: `local-m${index}`,
    display_name: `${child.first_name} ${child.last_name}`.trim(),
    status: 'active',
    health_status: 'missing' as const,
    agreement_complete: false,
  }))
  const trial = trialChildren.map((child, index) => ({
    id: `local-t${index}`,
    display_name: `${child.first_name} ${child.last_name}`.trim(),
    status: 'active',
    health_status: 'missing' as const,
    agreement_complete: false,
  }))
  return [...member, ...trial]
}

export type SelfServeJoinFlowProps = {
  billingClient: BillingClient
  /** Door C's "one row pre-filled" (§3): the manager-created stub's name, read by the
   *  caller from `/me/students` before mounting this (there is exactly one such student
   *  right after the invite is redeemed). `undefined`/empty for Door D, which always
   *  opens on one blank panel. */
  prefillFirstRowName?: string
  displayName: string | null
  door: Door
  healthClient: HealthClient
  locale: Locale
  onComplete?: () => void
  /** F16 -- fired once the single write has RETURNED, so the shell can re-read
   *  `/me/standing-order-links`. `AuthedApp` fetches those on mount (`[]` deps), long
   *  before Door D's write creates the child they belong to, so without this the
   *  mandate queue on the done screen is always empty (decision 15, F16). */
  onRegistered?: () => void
  privacyClient: PrivacyClient
  standingOrderLinks: readonly StandingOrderLink[]
}

type FlowStep = 'loading' | 'welcome' | 'family' | 'health' | 'payment' | 'done'

//: `SelfServeJoinFlow` has no join TOKEN, so the draft key (§2 decision 3) is the door
//: name itself -- one draft per door, not per token, which is the closest equivalent
//: this door has to "keyed per token" when there is no token to key by.
function draftKey(door: Door): string {
  return `self-serve:${door}`
}

export function SelfServeJoinFlow({
  billingClient,
  prefillFirstRowName,
  displayName,
  door,
  healthClient,
  locale,
  onComplete,
  onRegistered,
  privacyClient,
  standingOrderLinks,
}: SelfServeJoinFlowProps) {
  const token = draftKey(door)
  const [slug, setSlug] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [step, setStep] = useState<FlowStep>('loading')
  const [students, setStudents] = useState<readonly GatedStudent[]>([])
  const [healthDrafts, setHealthDrafts] = useState<Record<string, SubjectHealthDraft>>(
    () => loadJoinDraft(token)?.healthDrafts ?? {},
  )
  const [familyDraft, setFamilyDraft] = useState<FamilyPayloadState | null>(
    () => loadJoinDraft(token)?.family ?? null,
  )
  const [familyPayload, setFamilyPayload] = useState<JoinFamilyPayload | null>(null)
  const [trialChildren, setTrialChildren] = useState<readonly TrialChildPayload[]>([])
  const [doneRows, setDoneRows] = useState<PaymentSummaryRow[]>([])
  const [clubTermsAccepted, setClubTermsAccepted] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const createdStudentIdsRef = useRef<readonly string[] | null>(null)

  const wizardSteps: readonly WizardStepKey[] = DOOR_STEPS[door]

  // Studio slug -> groups + price plans, the public reads AddSibling.tsx already uses
  // for the same "no manager session, just an active studio" shape.
  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/me/studio')
      .then(async (response) => (response.ok ? ((await response.json()) as { slug: string }).slug : null))
      .then((resolved) => {
        if (alive) setSlug(resolved)
      })
      .catch(() => alive && setSlug(null))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!slug) return
    let alive = true
    void apiFetch(`/api/v1/public/studios/${slug}/groups`)
      .then(async (response) => (response.ok ? ((await response.json()) as { items: Group[] }).items : []))
      .then((items) => alive && setGroups(items))
      .catch(() => alive && setGroups([]))
    return () => {
      alive = false
    }
  }, [slug])

  // Decision 1's mechanism -- read once, decide the starting step, never re-read mid-run
  // (a status computed from EXISTING family state has nothing new to say once the wizard
  // is already open on a run that has not written anything yet).
  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/me/onboarding-status')
      .then(async (response) => (response.ok ? ((await response.json()) as OnboardingStatus) : null))
      .then((result) => {
        if (!alive) return
        setStep(startingStep(door, result))
      })
      .catch(() => alive && setStep(startingStep(door, null)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `door` is a mount-time prop.
  }, [])

  const refreshStudents = useCallback(async () => {
    const next = await loadStudents()
    const scope = createdStudentIdsRef.current
    const scoped = scope === null ? next : next.filter((student) => scope.includes(student.id))
    setStudents(scoped)
    return scoped
  }, [])

  useEffect(() => {
    saveJoinDraft(token, { family: familyDraft, healthDrafts })
  }, [token, familyDraft, healthDrafts])

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

  /** §3 Door D: "the name-and-birthdate check fires as soon as the panel is saved... So
   *  the name-and-birthdate check fires as soon as the panel is saved" -- run here,
   *  right after the students step's own submit and well before health or payment, so a
   *  refusal never arrives after the parent has filled a declaration or picked a method
   *  (CLAUDE.md: refuse rather than accept, when accepting creates a dead end). */
  async function checkDuplicates(
    candidates: readonly { first_name: string; last_name: string; birthdate: string | null }[],
  ): Promise<boolean> {
    for (const candidate of candidates) {
      const params = new URLSearchParams({
        first_name: candidate.first_name,
        last_name: candidate.last_name,
      })
      if (candidate.birthdate) params.set('birthdate', candidate.birthdate)
      try {
        const response = await apiFetch(`/api/v1/me/students/duplicate-check?${params.toString()}`)
        if (response.ok) {
          const body = (await response.json()) as { duplicate: boolean }
          if (body.duplicate) return true
        }
      } catch {
        // A failed check is not a refusal -- the FINAL write's own duplicate guard
        // (`add_child`'s `DuplicateStudentError`) is still there as a backstop; this
        // read only makes the common case fail fast, in the panel.
      }
    }
    return false
  }

  async function handleFamilySubmit(payload: JoinFamilyPayload, trial: TrialChildPayload[]) {
    setFailed(null)
    const memberCandidates = payload.children
      .filter((child) => !child.self_student)
      .map((child) => ({
        first_name: child.first_name,
        last_name: child.last_name,
        birthdate: child.birthdate,
      }))
    const trialCandidates = trial.map((child) => ({
      first_name: child.first_name,
      last_name: child.last_name,
      birthdate: child.birthdate,
    }))
    setInFlight(true)
    const isDuplicate = await checkDuplicates([...memberCandidates, ...trialCandidates])
    setInFlight(false)
    if (isDuplicate) {
      setFailed(t(locale, 'people.sibling.duplicate'))
      return
    }
    setFamilyPayload(payload)
    setTrialChildren(trial)
    const localStudents = localStudentsFrom(payload, trial)
    setStudents(localStudents)
    setStep(stillNeedsDeclaration(localStudents, healthDrafts).length === 0 ? 'payment' : 'health')
  }

  /** The one write, split by fork (§3 Door D: "member path writes the student,
   *  enrolments, plan, first charge and the declaration; a trial path writes the
   *  student as trial, the booking and the declaration, and raises no charge") -- both
   *  run, in whichever combination this submission has, before the session reloads. */
  async function submitRegistration() {
    if ((!familyPayload || familyPayload.children.length === 0) && trialChildren.length === 0) return
    if (inFlight) return
    setInFlight(true)
    setFailed(null)
    try {
      const createdIds: string[] = []

      if (familyPayload && familyPayload.children.length > 0) {
        const response = await apiFetch('/api/v1/me/students/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            club_terms_accepted: clubTermsAccepted,
            children: familyPayload.children.map((child, index) => {
              const draft = healthDrafts[`local-m${index}`]
              return {
                first_name: child.first_name,
                last_name: child.last_name,
                birthdate: child.birthdate,
                group_ids: child.group_ids,
                self_student: child.self_student,
                national_id: child.national_id,
                grade: child.grade,
                price_plan_id: child.price_plan_id,
                other_parent: child.other_parent,
                pickup_contacts: child.pickup_contacts,
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
            code = ((await response.json()) as { detail?: { code?: string } }).detail?.code
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
        const body = (await response.json()) as { student_ids?: string[] }
        createdIds.push(...(body.student_ids ?? []))
      }

      if (trialChildren.length > 0) {
        const response = await apiFetch('/api/v1/trial-bookings/self', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            children: trialChildren.map((child) => ({
              first_name: child.first_name,
              last_name: child.last_name,
              birthdate: child.birthdate,
              group_id: child.group_id,
              session_id: child.session_id,
            })),
            // F21, closed here as everywhere: the REAL per-child declaration, never a
            // hardcoded literal -- `trial-mt<index>` matches `localStudentsFrom`'s own
            // keying of the trial rows above.
            trial_health_declarations: trialChildren.map((_child, index) => {
              const draft = healthDrafts[`local-t${index}`]
              return draft && draft.templateId
                ? {
                    template_id: draft.templateId,
                    answers: draft.answers,
                    signature_image_base64: draft.signatureBase64 ?? '',
                  }
                : {}
            }),
          }),
        })
        if (!response.ok) {
          setFailed(t(locale, 'common.error.generic'))
          return
        }
        const body = (await response.json()) as { students?: { id: string }[] }
        createdIds.push(...(body.students ?? []).map((row) => row.id))
      }

      createdStudentIdsRef.current = createdIds
      await refresh()
      await refreshStudents()
      clearJoinDraft(token)
      setRegistered(true)
      // F16 -- only now can the mandate links exist. See `onRegistered`'s own note.
      onRegistered?.()
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

  const setupChildren = students.map((student) => {
    const [first_name = '', last_name = ''] = student.display_name.split(' ')
    return { id: student.id, first_name, last_name }
  })

  let content: ReactNode
  let testId: string | undefined
  if (step === 'loading') {
    content = <p data-testid="self-serve-loading">{t(locale, 'common.setup.loading')}</p>
  } else if (step === 'welcome') {
    content = (
      <JoinWelcomeStep
        locale={locale}
        clubTermsVersion={null}
        logoUrl={null}
        privacyClient={privacyClient}
        studioName=""
        onAccept={(accepted) => {
          setClubTermsAccepted(accepted)
          setStep('family')
        }}
      />
    )
  } else if (step === 'family') {
    content = (
      <JoinFamilyStep
        allowTrialFieldSet={door === 'addChild'}
        displayName={displayName ?? ''}
        email={null}
        error={failed}
        groups={groups}
        inFlight={inFlight}
        autoOpenSoleRow
        initialValue={
          familyDraft ?? {
            signerNationalId: '',
            address: '',
            city: '',
            phone: '',
            relation: 'mother',
            // §3 Door D: "It opens straight into the wizard, at the students step...
            // with one empty panel already open." Door C's is the same panel,
            // pre-filled with the manager's stub name instead of blank.
            rows: [{ ...emptySubjectRow('child'), firstName: prefillFirstRowName ?? '' }],
          }
        }
        locale={locale}
        onBack={() => setStep('welcome')}
        onChange={setFamilyDraft}
        onSubmit={(payload, trial) => void handleFamilySubmit(payload, trial)}
        pricePlansPath={slug ? `/api/v1/public/studios/${slug}/price-plans` : undefined}
        showSignerDetails={false}
        steps={wizardSteps}
        token={token}
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
    testId = 'self-serve-payment-step'
    content = (
      <OnboardingWizardChrome
        locale={locale}
        onBack={registered ? undefined : () => setStep('health')}
        position={stepPosition('payment', wizardSteps)}
        steps={wizardSteps}
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
          <div data-testid="self-serve-confirm-step" style={confirmStyle}>
            {failed ? (
              <Alert iconLabel={t(locale, 'people.join.title')} live tone="danger">
                {failed}
              </Alert>
            ) : null}
            <WizardNavButtons
              forwardDisabled={inFlight}
              forwardLabel={
                inFlight ? t(locale, 'reports.privacy.gate.working') : t(locale, 'people.join.confirmAndPay')
              }
              forwardTestId="self-serve-confirm-submit"
              locale={locale}
              onForward={() => void submitRegistration()}
            />
          </div>
        )}
      </OnboardingWizardChrome>
    )
  } else {
    testId = 'self-serve-done-step'
    content = (
      <OnboardingWizardChrome
        locale={locale}
        position={stepPosition('payment', wizardSteps)}
        steps={wizardSteps}
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
