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
import { apiFetch, refresh } from '@studio/core'
import type { Locale } from '@studio/i18n'
import type { BillingClient } from '../../billing/billingClient'
import type { MandateLink } from '../../billing/billingClient'
import type { TemplateSchema } from '../../health/healthClient'
import { Step1Agreements } from './Step1Agreements'
import { Step2Trainees } from './Step2Trainees'
import { Step3Payment } from './Step3Payment'
import { Step4Done } from './Step4Done'
import { WizardHeader } from './WizardHeader'
import type { WizardStep } from './WizardHeader'
import { toRegisterPayload } from './adapters'
import { clearStudentDraft, clearWizardDraft, loadWizardDraft, saveWizardDraft } from './draft'
import { wizardFlowCopy } from './copy'
import { submitJoin } from './submitJoin'
import type { SubmitJoinResult } from './submitJoin'
import type { PaymentMethod, StudentDraft, WizardBelt, WizardGroup, WizardPlan } from './types'
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
      /** Bug #10 -- the club's own belt ladder, threaded to the student form's picker and
       *  to the athlete card. Empty for a club with no ladder, which hides the field. */
      belts: WizardBelt[]
      /** Task 10 item 3 -- threaded down to step 2's "try a trial lesson first" link. */
      slug: string | null
      /** The club's cash/cheque arrangements as months bought FORWARD. `{0,0}` on the
       *  doors that cannot say — see `WizardStudio.prepayMonths`. */
      prepayMonths: { cash: number; cheque: number }
    }

type CatalogueState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; plans: WizardPlan[]; schema: TemplateSchema; templateId: string }

/**
 * What a failed read looks like here: the message, and a way out of it.
 *
 * **Both halves, because the message alone was a dead end.** Until 2026-09-06 each of the
 * two failures below rendered as a bare red paragraph. A family whose first request lost
 * the connection had a join link, a sign-in behind them and nothing to press -- and a
 * browser refresh is not the escape it looks like, because this app registers a service
 * worker that may hand back the same failure from cache. That is exactly the class
 * `tools/__tests__/load-failed-recovery.test.ts` exists to stop, and it had been reporting
 * it: the guard names `copy.ts`, the file where the string lives, and the defect was here,
 * where the string is drawn.
 *
 * Not `@studio/ui`'s `LoadFailed` primitive, for the reason `features/shell/loadFailed.ts`
 * records for the four redesigned tabs: it draws an `Alert` and a design-system `Button`,
 * and dropping either into a Tailwind port puts a panel from another design in the middle
 * of a screen the owner approved from a prototype. The two things the primitive carries
 * that a bare paragraph did not -- the retry, and the offline wording -- are both here.
 */
function WizardLoadFailed({
  message,
  retryLabel,
  onRetry,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4" data-testid="wizard-load-failed">
      <p className="text-[14px] text-[var(--wz-danger)] font-medium text-center" role="alert">
        {message}
      </p>
      <button
        className="rounded-full border border-[var(--wz-heading)] px-5 py-2 text-[14px] font-bold text-[var(--wz-heading)] dark:border-blue-400 dark:text-blue-400"
        data-testid="wizard-load-retry"
        onClick={onRetry}
        type="button"
      >
        {retryLabel}
      </button>
    </div>
  )
}

export type JoinWizardProps = {
  locale: Locale
  /** What this door reads and writes. See `wizardSources.ts`. The effects below key on
   *  this object's IDENTITY, not its contents, so a caller MUST hand this a stable
   *  reference -- build it with `useMemo` at the call site, never inline. */
  source: JoinWizardSource
  billingClient: BillingClient
  /** `GET /me/standing-order-links`. Read after the write -- the children it names do
   *  not exist before it. */
  standingOrderLinks: () => Promise<readonly MandateLink[]>
  /** Door C's "one row pre-filled": the manager's stub name, seeded into the FIRST child
   *  the family adds and nowhere else. Undefined on every other door. */
  prefillFirstRowName?: string
  /** The step this run opens on. Doors C and D skip the agreements screen when the
   *  family's consents are already current -- `doorSteps.ts::startingStep` decides it
   *  from `GET /me/onboarding-status`. Door B always opens at 1. */
  startAtStep?: WizardStep
  /** Where "enter the app" goes once the family is registered. */
  onEnterApp: () => void
  /** Children who ALREADY exist and are being re-opened in the wizard rather than created.
   *
   *  §5.5's gate uses this. A family blocked for a missing הסכם הרשמה used to get a second,
   *  older five-step flow of its own; there is one wizard now, so the gate sends them here
   *  with their children loaded instead of an empty form asking them to re-type a child the
   *  club has had for weeks. Used only when no resumable draft exists -- a half-finished
   *  run the family was in the middle of always wins over a fresh seed.
   *
   *  `/me/students/register` skips a child already on the account rather than duplicating
   *  them, and submits their declaration either way, so re-submitting these is safe and is
   *  what clears the gate. */
  seedStudents?: readonly StudentDraft[]
  /** Which door's resumable draft this run owns -- door B's token, or `'me'` for the
   *  signed-in doors. A shared family phone can open one join link, abandon it and open
   *  another; restoring the first family's children into the second's wizard would be
   *  worse than losing them, so the draft records its scope and refuses a mismatch. */
  draftScope?: string
}

export function JoinWizard({
  locale,
  source,
  billingClient,
  standingOrderLinks,
  prefillFirstRowName,
  startAtStep,
  onEnterApp,
  draftScope = 'me',
  seedStudents,
}: JoinWizardProps) {
  const copy = wizardFlowCopy(locale)
  const [studio, setStudio] = useState<StudioState>({ status: 'loading' })
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'loading' })
  //: **Read once, during the first render.** Restoring in an effect instead would paint an
  //: empty step 1 and then jump, which reads as the wizard having lost the work before it
  //: gives it back -- exactly the moment this is meant to remove.
  const restored = useMemo(() => loadWizardDraft(draftScope), [draftScope])

  const [step, setStep] = useState<WizardStep>(
    (restored?.step as WizardStep | undefined) ?? startAtStep ?? 1,
  )
  // The agreements step was SKIPPED because the family HAS agreed -- that is the whole
  // meaning of `startAtStep` being past 1 -- so the register payload must say so from the
  // start, not only once a family that opened on step 1 ticks the box. Re-sending it is
  // safe and deliberate: `AgreementService.accept_club_terms` returns `None` when the
  // person already holds the current version, and its own docstring calls a re-signature
  // reaching it a duplicate rather than a mistake.
  const [agreed, setAgreed] = useState(() => restored?.agreed ?? (startAtStep ?? 1) > 1)
  //: The resumed draft wins over the seed: a family halfway through their own run must not
  //: have it replaced by the roster they started from.
  const [students, setStudents] = useState<StudentDraft[]>(() =>
    restored ? [...restored.students] : [...(seedStudents ?? [])],
  )
  //: Sanitised rather than cast. `localStorage` is writable by anything on the origin, and
  //: a junk value reaching `submitJoin`'s method bucketing would be billed, not rejected --
  //: so anything that is not one of the four known methods is dropped, which leaves that
  //: child simply unanswered and holds the button.
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>(() => {
    const known: readonly string[] = ['credit', 'cash', 'cheque', 'standing_order']
    const seed: Record<string, PaymentMethod> = {}
    for (const [id, value] of Object.entries(restored?.methods ?? {})) {
      if (known.includes(value)) seed[id] = value as PaymentMethod
    }
    return seed
  })
  //: Step 3's own "כן, התשלום כבר הוסדר מראש" choice, lifted here because `submitJoin`
  //: needs it and step 3 does not call `submitJoin` itself.
  const [alreadyArranged, setAlreadyArranged] = useState(restored?.alreadyArranged ?? false)
  const [submitResult, setSubmitResult] = useState<SubmitJoinResult | null>(null)

  //: **Saved on every change, not on a timer or on unload.** A reclaimed tab never runs an
  //: unload handler -- that is precisely the case this exists for -- so the only write that
  //: can be relied on is the one that already happened.
  //:
  //: Stops once the registration has landed: `submitResult` means the family exists, and
  //: `submit()` has already cleared the draft. Re-saving here would put it straight back and
  //: offer a finished registration as resumable work (§5.7 rule 4).
  useEffect(() => {
    if (submitResult !== null) return
    saveWizardDraft({ scope: draftScope, step, agreed, students, methods, alreadyArranged })
  }, [draftScope, step, agreed, students, methods, alreadyArranged, submitResult])
  //: Bumped by `WizardLoadFailed`'s retry. The effect below keys on it as well as on
  //: `source`, which is what turns two one-shot reads into two retryable ones -- a counter
  //: rather than a hand-rolled re-fetch, so the retry path is the SAME code as the first
  //: attempt and cannot drift from it.
  const [reloads, setReloads] = useState(0)
  //: Both states go back to `loading` HERE and not at the top of the effect, which is where
  //: this was first written: `react-hooks/set-state-in-effect` refuses a synchronous
  //: setState in an effect body, and it is right to -- a handler is where a press belongs,
  //: and the effect stays a pure reaction to `reloads` changing. Without the reset the
  //: button looked broken: the failure it was pressed on stayed on screen until the
  //: network answered.
  const retry = useCallback(() => {
    setStudio({ status: 'loading' })
    setCatalogue({ status: 'loading' })
    setReloads((n) => n + 1)
  }, [])

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
    //: `reloads` is the retry. `source` is the door -- see its prop docstring for why this
    //: keys on its identity.
  }, [source, reloads])

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
      //: The SAME figure step 3 put in front of the family. Read off the studio rather than
      //: recomputed, so the screen and the write cannot arrive at different totals.
      prepayMonths: studio.status === 'ready' ? studio.prepayMonths : { cash: 0, cheque: 0 },
      templateId,
      deps: {
        register: () =>
          source.register(toRegisterPayload(students, { templateId, clubTermsAccepted: agreed })),
        refreshSession: async () => {
          await refresh()
        },
        billing: billingClient,
        standingOrderLinks,
        //: How the family says they will pay. A `PUT` and not a promise, because
        //: `payment_promise.method` has no card and this must record all four routes --
        //: see `SubmitJoinDeps.savePaymentMethods` for the defect it closes.
        savePaymentMethods: async (items) => {
          const response = await apiFetch('/api/v1/me/payment-methods', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: items.map((row) => ({ student_id: row.studentId, method: row.method })),
            }),
          })
          //: `submitJoin` swallows a rejection here on purpose; throwing is what makes the
          //: failure reach that decision rather than passing silently as a resolved write.
          if (!response.ok) throw new Error(String(response.status))
        },
        //: The children trying a lesson instead of joining. One request for all of them.
        //: `group_id` per child and no `session_id`: the endpoint requires a group, which
        //: step 2 already collected, and treats the lesson as optional — the club picks it
        //: and calls. A signed-in caller needs no `guardian` block; the server prefers the
        //: provider-verified identity over anything a client could type.
        bookTrial: async (children) => {
          const response = await apiFetch('/api/v1/trial-bookings/self', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              children: children.map((child) => ({
                first_name: child.firstName,
                last_name: child.lastName,
                //: `birthdate`, one word — `StudentCreate`'s own spelling. `birth_date`
                //: would be dropped by Pydantic and the child booked with no age.
                birthdate: child.birthDate,
                group_id: child.groupId,
              })),
              //: One per child, same order — the endpoint's own rule
              //: (`_one_declaration_per_child`). Sent only when every child has one, since
              //: a partial list is rejected outright rather than filled in.
              ...(children.every((child) => child.health !== null)
                ? { trial_health_declarations: children.map((child) => child.health) }
                : {}),
            }),
          })
          if (!response.ok) throw new Error(String(response.status))
        },
      },
    })

    //: Both drafts have served their purpose; leaving either would offer a family the
    //: children they have just registered (§5.7 rule 4).
    clearStudentDraft()
    clearWizardDraft()
    return result
  }

  if (studio.status === 'loading') {
    return (
      <div className="tw-scope min-h-[100dvh] bg-[var(--wz-ground)] flex items-center justify-center p-6">
        <p className="text-[14px] text-[var(--wz-secondary)]">{copy.loading}</p>
      </div>
    )
  }

  if (studio.status === 'failed') {
    return (
      <div className="tw-scope min-h-[100dvh] bg-[var(--wz-ground)] flex items-center justify-center p-6">
        <WizardLoadFailed message={copy.loadFailed} onRetry={retry} retryLabel={copy.retry} />
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
        belts={studio.belts}
        outcomes={submitResult?.outcomes ?? []}
        clubLogoUrl={studio.logoUrl}
        onEnterApp={onEnterApp}
      />
    )
  }

  return (
    <div className="tw-scope min-h-[100dvh] bg-[var(--wz-ground)] text-[var(--wz-ink)] flex flex-col">
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
            agreed={agreed}
            onAgreedChange={setAgreed}
            onContinue={() => setStep(2)}
          />
        ) : null}

        {step === 2 && catalogue.status === 'loading' ? (
          <p className="text-[14px] text-[var(--wz-secondary)] py-8 text-center">{copy.loadingCatalogue}</p>
        ) : null}
        {step === 2 && catalogue.status === 'failed' ? (
          //: Retrying re-reads the studio too. Both are cheap, the family is stuck on this
          //: screen either way, and one button that fixes whichever request failed beats
          //: two that each fix one and leave the other to guess at.
          <div className="py-8">
            <WizardLoadFailed
              message={copy.catalogueFailed}
              onRetry={retry}
              retryLabel={copy.retry}
            />
          </div>
        ) : null}
        {step === 2 && catalogue.status === 'ready' ? (
          <Step2Trainees
            locale={locale}
            students={students}
            onStudentsChange={setStudents}
            groups={studio.groups}
            belts={studio.belts}
            plans={catalogue.plans}
            healthSchema={catalogue.schema}
            firstStudentDefaults={firstStudentDefaults}
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
            prepayMonths={studio.status === 'ready' ? studio.prepayMonths : undefined}
            onIntentChange={setAlreadyArranged}
            onBack={() => setStep(2)}
            onSubmit={submit}
            orderStatus={billingClient.orderStatus}
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
