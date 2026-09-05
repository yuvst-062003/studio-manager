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
//
// Task 3a moved this door's differences -- the token, the three endpoints, `healthClient`
// -- out into an injected `JoinWizardSource` (`wizardSources.ts`), so this same shell can
// serve doors B, C and D. What each door reads and writes now lives there; what the wizard
// draws, validates, persists and submits stays exactly here, unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { refresh } from '@studio/core'
import type { Locale } from '@studio/i18n'
import type { BillingClient } from '../../billing/billingClient'
import type { StandingOrderLink } from '../../billing/PaymentSetup'
import type { TemplateSchema } from '../../health/healthClient'
import { Step1Agreements } from './Step1Agreements'
import { Step2Trainees } from './Step2Trainees'
import { Step3Payment } from './Step3Payment'
import { Step4Done } from './Step4Done'
import { WizardHeader } from './WizardHeader'
import type { WizardStep } from './WizardHeader'
import { toRegisterPayload } from './adapters'
import { clearStudentDraft } from './draft'
import { wizardFlowCopy } from './copy'
import { submitJoin } from './submitJoin'
import type { SubmitJoinResult } from './submitJoin'
import type { PaymentMethod, StudentDraft, WizardGroup, WizardPlan } from './types'
import type { JoinWizardSource } from './wizardSources'

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
  | {
      status: 'ready'
      studioName: string
      logoUrl: string | null
      groups: WizardGroup[]
      clubTermsVersion: number | null
      /** Task 10 item 3 -- threaded down to step 2's "try a trial lesson first" link. */
      slug: string | null
    }

type CatalogueState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; plans: WizardPlan[]; schema: TemplateSchema; templateId: string }

export type JoinWizardProps = {
  locale: Locale
  /** What this door reads and writes. See `wizardSources.ts`. The effects below key on
   *  this object's IDENTITY, not its contents, so a caller MUST hand this a stable
   *  reference -- build it with `useMemo` at the call site, never inline. */
  source: JoinWizardSource
  billingClient: BillingClient
  /** `GET /me/standing-order-links`. Read after the write -- the children it names do
   *  not exist before it. */
  standingOrderLinks: () => Promise<readonly StandingOrderLink[]>
  /** Door C's "one row pre-filled": the manager's stub name, seeded into the FIRST child
   *  the family adds and nowhere else. Undefined on every other door. */
  prefillFirstRowName?: string
  /** The step this run opens on. Doors C and D skip the agreements screen when the
   *  family's consents are already current -- `doorSteps.ts::startingStep` decides it
   *  from `GET /me/onboarding-status`. Door B always opens at 1. */
  startAtStep?: WizardStep
  /** Where "enter the app" goes once the family is registered. */
  onEnterApp: () => void
}

export function JoinWizard({
  locale,
  source,
  billingClient,
  standingOrderLinks,
  prefillFirstRowName,
  startAtStep,
  onEnterApp,
}: JoinWizardProps) {
  const copy = wizardFlowCopy(locale)
  const [studio, setStudio] = useState<StudioState>({ status: 'loading' })
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'loading' })
  const [step, setStep] = useState<WizardStep>(startAtStep ?? 1)
  // The agreements step was SKIPPED because the family HAS agreed -- that is the whole
  // meaning of `startAtStep` being past 1 -- so the register payload must say so from the
  // start, not only once a family that opened on step 1 ticks the box. Re-sending it is
  // safe and deliberate: `AgreementService.accept_club_terms` returns `None` when the
  // person already holds the current version, and its own docstring calls a re-signature
  // reaching it a duplicate rather than a mistake.
  const [agreed, setAgreed] = useState(() => (startAtStep ?? 1) > 1)
  const [students, setStudents] = useState<StudentDraft[]>([])
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({})
  //: Step 3's own "כן, התשלום כבר הוסדר מראש" choice, lifted here because `submitJoin`
  //: needs it and step 3 does not call `submitJoin` itself.
  const [alreadyArranged, setAlreadyArranged] = useState(false)
  const [submitResult, setSubmitResult] = useState<SubmitJoinResult | null>(null)

  //: Door C's "one row pre-filled" (§3): the manager's stub name, split into the two
  //: fields `StudentDraft` actually stores. `undefined` on every door but C, so
  //: `Step2Trainees` seeds nothing extra for B/D.
  const firstStudentDefaults = useMemo<Partial<StudentDraft> | undefined>(() => {
    if (!prefillFirstRowName) return undefined
    const [firstName = '', ...rest] = prefillFirstRowName.trim().split(' ')
    return { firstName, lastName: rest.join(' ') }
  }, [prefillFirstRowName])

  useEffect(() => {
    let live = true

    //: The club itself -- everything step 1 needs.
    void (async () => {
      try {
        const info = await source.loadStudio()
        if (!live) return
        setStudio({ status: 'ready', ...info })
      } catch {
        if (live) setStudio({ status: 'failed' })
      }
    })()

    //: The catalogue -- what step 2's group, plan and health parts read. Its own request
    //: and its own failure, so it cannot take the agreements screen down with it.
    void (async () => {
      try {
        const info = await source.loadCatalogue()
        if (!live) return
        setCatalogue({ status: 'ready', ...info })
      } catch {
        if (live) setCatalogue({ status: 'failed' })
      }
    })()

    return () => {
      live = false
    }
  }, [source])

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

  //: The whole write, handed to step 3 as `onSubmit`. Register, then let `submitJoin`
  //: read back the charges and act on every child's payment choice -- see that module's
  //: own header for why it cannot be one phase. Rejects ONLY when `register` itself
  //: rejects, which is the one failure step 3 keeps the family able to retry from.
  async function submit(): Promise<SubmitJoinResult> {
    if (catalogue.status !== 'ready') throw new Error('catalogue not ready')
    const templateId = catalogue.templateId
    const plans = catalogue.plans

    const result = await submitJoin({
      students,
      plans,
      methods,
      alreadyArranged,
      deps: {
        register: () =>
          source.register(toRegisterPayload(students, { templateId, clubTermsAccepted: agreed })),
        refreshSession: async () => {
          await refresh()
        },
        billing: billingClient,
        standingOrderLinks,
      },
    })

    //: The draft has served its purpose; leaving it would offer a family the child they
    //: have just registered (§5.7 rule 4).
    clearStudentDraft()
    return result
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
        locale={locale}
        students={students}
        groups={studio.groups}
        outcomes={submitResult?.outcomes ?? []}
        clubLogoUrl={studio.logoUrl}
        onEnterApp={onEnterApp}
      />
    )
  }

  return (
    <div className="tw-scope min-h-screen bg-[#faf8ff] text-[#161b28] flex flex-col">
      <WizardHeader
        locale={locale}
        currentStep={step}
        studioName={studio.studioName}
        logoUrl={studio.logoUrl}
        onNavigate={navigate}
        onBack={() => setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current))}
      />
      <main className="flex-1 flex flex-col w-full mx-auto pt-32 px-4 max-w-[480px]">
        {step === 1 ? (
          <Step1Agreements
            locale={locale}
            emblemUrl={studio.logoUrl}
            clubTermsVersion={studio.clubTermsVersion}
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
            locale={locale}
            students={students}
            onStudentsChange={setStudents}
            groups={studio.groups}
            plans={catalogue.plans}
            healthSchema={catalogue.schema}
            firstStudentDefaults={firstStudentDefaults}
            slug={studio.slug}
            checkDuplicate={source.checkDuplicate}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? (
          <Step3Payment
            locale={locale}
            students={students}
            plans={catalogue.status === 'ready' ? catalogue.plans : []}
            methods={methods}
            onMethodChange={(id, method) =>
              setMethods((previous) => ({ ...previous, [id]: method }))
            }
            onIntentChange={setAlreadyArranged}
            onBack={() => setStep(2)}
            onSubmit={submit}
            onDone={(result) => {
              setSubmitResult(result)
              setStep(4)
            }}
          />
        ) : null}
      </main>
    </div>
  )
}
