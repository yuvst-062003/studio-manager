// §5.4b's join wizard, running against the real API.
//
// Replaces `JoinFlow`'s four screens with the redesigned ones. What it deliberately keeps
// from that module, because they are the parts that were got right:
//
//   * **Nothing is written until step 3's final button** (decision B2). Steps 1 and 2 touch
//     local state and localStorage only; the parent, the students, the enrolments, the
//     plans, the first charge and every health declaration go in one POST.
//   * **The sign-in wall is above this.** `JoinShell` reads the session once, so by the
//     time this mounts the family is signed in.
//   * The same endpoints: `/public/onboarding/{token}` for the studio and its groups,
//     `/public/onboarding/{token}/price-plans` for the plans, `healthClient.template()`
//     for the declaration, and `/onboarding/{token}/register` for the write.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { HealthClient, TemplateSchema } from '../../health/healthClient'
import type { PlanOption } from '../familyDraft'
import { Step1Agreements } from './Step1Agreements'
import { Step2Trainees } from './Step2Trainees'
import { Step3Payment } from './Step3Payment'
import { Step4Done } from './Step4Done'
import { WizardHeader } from './WizardHeader'
import type { WizardStep } from './WizardHeader'
import { toRegisterPayload, toWizardGroup, toWizardPlan } from './adapters'
import type { ApiGroup } from './adapters'
import { clearStudentDraft } from './draft'
import { WIZARD_FLOW_COPY } from './content'
import type { PaymentMethod, StudentDraft, WizardGroup, WizardPlan } from './types'

// **The studio gates the wizard; the catalogue gates step 2.**
//
// The first version blocked all four screens on three requests, so a slow or failing
// price-plan read left a family staring at an error on the AGREEMENTS screen -- which
// needs the club's name and nothing else. Step 1 now renders as soon as the studio is
// known, and only the screen that actually needs plans and the health template waits for
// them.
type StudioState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; studioName: string; logoUrl: string | null; groups: WizardGroup[] }

type CatalogueState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; plans: WizardPlan[]; schema: TemplateSchema; templateId: string }

export type WizardJoinFlowProps = {
  /** The join token from `/join/{token}`. */
  token: string
  healthClient: HealthClient
  /** Where "enter the app" goes once the family is registered. */
  onEnterApp: () => void
}

export function WizardJoinFlow({ token, healthClient, onEnterApp }: WizardJoinFlowProps) {
  const copy = WIZARD_FLOW_COPY
  const [studio, setStudio] = useState<StudioState>({ status: 'loading' })
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'loading' })
  const [step, setStep] = useState<WizardStep>(1)
  const [agreed, setAgreed] = useState(false)
  const [students, setStudents] = useState<StudentDraft[]>([])
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    //: The club itself -- everything step 1 needs.
    void (async () => {
      try {
        const response = await apiFetch(`/api/v1/public/onboarding/${token}`)
        if (!response.ok) throw new Error(String(response.status))
        const info = (await response.json()) as {
          studio_name: string
          logo_url: string | null
          groups: ApiGroup[]
        }
        if (!live) return
        setStudio({
          status: 'ready',
          studioName: info.studio_name,
          logoUrl: info.logo_url ?? null,
          groups: (info.groups ?? []).map(toWizardGroup),
        })
      } catch {
        if (live) setStudio({ status: 'failed' })
      }
    })()

    //: The catalogue -- what step 2's group, plan and health parts read. Its own request
    //: and its own failure, so it cannot take the agreements screen down with it.
    void (async () => {
      try {
        const [plansResponse, template] = await Promise.all([
          apiFetch(`/api/v1/public/onboarding/${token}/price-plans`),
          healthClient.template(),
        ])
        if (!plansResponse.ok) throw new Error(String(plansResponse.status))
        const body = (await plansResponse.json()) as { items?: PlanOption[] } | PlanOption[]
        const planList = Array.isArray(body) ? body : (body.items ?? [])
        if (!live) return
        setCatalogue({
          status: 'ready',
          plans: planList.map(toWizardPlan),
          schema: template.schema as unknown as TemplateSchema,
          templateId: template.id,
        })
      } catch {
        if (live) setCatalogue({ status: 'failed' })
      }
    })()

    return () => {
      live = false
    }
  }, [token, healthClient])

  //: Forward navigation from the header pills obeys the same gate the buttons do. The
  //: prototype's pills navigate unconditionally, which walks straight past step 1's
  //: agreement (§14.2).
  const navigate = useCallback(
    (target: WizardStep) => {
      if (target <= step) {
        setStep(target)
        return
      }
      if (step === 1 && !agreed) return
      if (step === 2 && students.length === 0) return
      setStep(target)
    },
    [step, agreed, students.length],
  )

  const registrationRef = useMemo(() => null as string | null, [])

  async function submit() {
    if (catalogue.status !== 'ready' || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          toRegisterPayload(students, {
            templateId: catalogue.templateId,
            clubTermsAccepted: agreed,
          }),
        ),
      })
      if (!response.ok) throw new Error(String(response.status))
      //: The draft has served its purpose; leaving it would offer a family the child they
      //: have just registered (§5.7 rule 4).
      clearStudentDraft()
      setStep(4)
    } catch {
      setSubmitError(copy.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  if (studio.status === 'loading') {
    return (
      <div className="tw-scope min-h-screen bg-[#faf8ff] flex items-center justify-center p-6">
        <p className="text-[14px] text-[#444650]">{copy.loading}</p>
      </div>
    )
  }

  if (studio.status === 'failed') {
    return (
      <div className="tw-scope min-h-screen bg-[#faf8ff] flex items-center justify-center p-6">
        <p className="text-[14px] text-[#ba1a1a] font-medium" role="alert">
          {copy.loadFailed}
        </p>
      </div>
    )
  }

  //: Step 4 owns the whole screen -- no wizard header above it (§2).
  if (step === 4) {
    return (
      <Step4Done
        students={students}
        groups={studio.groups}
        registrationRef={registrationRef ?? undefined}
        clubLogoUrl={studio.logoUrl}
        onEnterApp={onEnterApp}
      />
    )
  }

  return (
    <div className="tw-scope min-h-screen bg-[#faf8ff] text-[#161b28] flex flex-col">
      <WizardHeader
        currentStep={step}
        studioName={studio.studioName}
        logoUrl={studio.logoUrl}
        onNavigate={navigate}
        onBack={() => setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current))}
      />
      <main className="flex-1 flex flex-col w-full mx-auto pt-32 px-4 max-w-[480px]">
        {step === 1 ? (
          <Step1Agreements
            emblemUrl={studio.logoUrl}
            agreed={agreed}
            onAgreedChange={setAgreed}
            onContinue={() => setStep(2)}
          />
        ) : null}

        {step === 2 && catalogue.status === 'loading' ? (
          <p className="text-[14px] text-[#444650] py-8 text-center">{copy.loadingCatalogue}</p>
        ) : null}
        {step === 2 && catalogue.status === 'failed' ? (
          <p className="text-[14px] text-[#ba1a1a] font-medium py-8 text-center" role="alert">
            {copy.catalogueFailed}
          </p>
        ) : null}
        {step === 2 && catalogue.status === 'ready' ? (
          <Step2Trainees
            students={students}
            onStudentsChange={setStudents}
            groups={studio.groups}
            plans={catalogue.plans}
            healthSchema={catalogue.schema}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? (
          <>
            {submitError ? (
              <p
                className="mb-3 p-3 rounded-xl bg-red-50 border border-red-300 text-[13px] text-red-800 font-medium"
                role="alert"
              >
                {submitError}
              </p>
            ) : null}
            <Step3Payment
              students={students}
              plans={catalogue.status === 'ready' ? catalogue.plans : []}
              methods={methods}
              onMethodChange={(id, method) =>
                setMethods((previous) => ({ ...previous, [id]: method }))
              }
              onBack={() => setStep(2)}
              onSubmit={() => void submit()}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}
