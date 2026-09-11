// Entrance A, as three steps — declaration, groups and plan, payment (owner, 2026-09-12).
//
// **What this replaces, and why.** `JoinTheClub` was one screen: a group picker, a sentence
// promising that a price would appear somewhere later, and a numbered list announcing that a
// FULL health declaration and a payment method were still to come. So a family answering
// "איך היה?" was shown a list of the work ahead of them, joined at a price nobody had named,
// and was then blocked by §5.5's gate asking the same thirteen medical questions they had
// answered on the booking form an hour earlier.
//
// The three steps are the three things that actually have to happen, in the order they have
// to happen in:
//
//   1. **The declaration.** Shown back, not asked again — `StepDeclaration`. The signature is
//      filed through §5.5's own `POST /students/{id}/health-declaration`, so by the time the
//      join runs the student is `signed` and the gate has nothing left to hold. That is why
//      this step is FIRST and not last: a declaration filed after the join is a family
//      arriving in the app and immediately meeting a blocking form.
//   2. **Groups and plan** — `StepGroups`. Both now travel to the server; see its header.
//   3. **Payment**, which is the app's own payments screen. Joining raises the first charge
//      (`_raise_first_charge`), so there is a real number waiting there and this flow hands
//      the family to it rather than growing a second copy of `PayScreen`.
//
// **The header counts to three even though this component draws two.** The third step is a
// real step a family walks through; that it is served by an existing screen is an
// implementation detail, and a "step 2 of 2" that then demands a payment would be the app
// miscounting its own process.
import { useEffect, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { CLAUSE_QUESTION_ID, applicableClause } from '../../health/clauses'
import type { AnswerValue, HealthClient, TemplateSchema } from '../../health/healthClient'
import type { PeopleClient, StudentSummary } from '../peopleClient'
import { StepDeclaration } from './StepDeclaration'
import { StepGroups } from './StepGroups'
import { loadJoinCatalogue, loadTrialDeclaration } from './joinFromTrialClient'
import type { JoinGroupOption, StoredTrialDeclaration } from './joinFromTrialClient'
import type { WizardPlan } from '../../onboarding/wizard/types'

export type JoinStep = 1 | 2 | 3

const STEP_KEYS: Record<JoinStep, string> = {
  1: 'people.joinClub.step.declaration',
  2: 'people.joinClub.step.groups',
  3: 'people.joinClub.step.payment',
}

/** Where step 3 lives. The payments tab, where the charge the join just raised is. */
export const PAYMENT_HASH = '#/payments'

export function JoinFromTrial({
  locale,
  client,
  healthClient,
  student,
  trialledGroupId = null,
  /** Injected by tests; fetched from the club's public lists otherwise. */
  catalogue,
  onJoined,
}: {
  locale: Locale
  client: PeopleClient
  healthClient: HealthClient
  student: StudentSummary
  trialledGroupId?: string | null
  catalogue?: { groups: readonly JoinGroupOption[]; plans: readonly WizardPlan[] }
  onJoined?: () => void
}) {
  const [step, setStep] = useState<JoinStep>(1)
  const [schema, setSchema] = useState<TemplateSchema | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [stored, setStored] = useState<StoredTrialDeclaration | null>(null)
  const [groups, setGroups] = useState<readonly JoinGroupOption[]>(catalogue?.groups ?? [])
  const [plans, setPlans] = useState<readonly WizardPlan[]>(catalogue?.plans ?? [])

  const [clauseConfirmed, setClauseConfirmed] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  // ONE base team, pre-set to the one they trialled in. See `StepGroups`' header: base
  // training is included in every plan and the plan buys the extra sessions, so this is a
  // single choice and `group_ids` carries exactly one id.
  const [chosenGroupId, setChosenGroupId] = useState(trialledGroupId ?? '')
  const [chosenPlanId, setChosenPlanId] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void Promise.all([
      // The CURRENT full template, for the labels and for the clause rule. The stored
      // answers are already in its id-space — the booking form renders this same template
      // minus its clause — so there is nothing to map between the two.
      healthClient
        .template()
        .then((template) => ({
          schema: template.schema as unknown as TemplateSchema,
          id: template.id,
        }))
        .catch(() => null),
      loadTrialDeclaration(student.id),
      catalogue ? Promise.resolve(null) : loadJoinCatalogue(),
    ]).then(([template, declaration, loaded]) => {
      if (!live) return
      if (template) {
        setSchema(template.schema)
        setTemplateId(template.id)
      }
      setStored(declaration)
      if (loaded) {
        setGroups(loaded.groups)
        setPlans(loaded.plans)
      }
    })
    return () => {
      live = false
    }
  }, [healthClient, student.id, catalogue])

  const answers: Record<string, AnswerValue> = stored?.answers ?? {}

  const submitDeclaration = () => {
    // The clause is only asked when the template has one; a v1 template has none, and a
    // family cannot be held at a confirmation the form never showed them.
    const needsClause = schema !== null && applicableClause(schema, answers) !== null
    if (!signatureDataUrl || (needsClause && !clauseConfirmed)) {
      setShowErrors(true)
      return
    }
    if (!templateId) {
      // Nothing to file the signature against. Skipping forward would join the child and
      // leave §5.5's gate to ask for the declaration afterwards, which is exactly the
      // sequence this flow exists to remove — so it says so instead.
      setFailed(true)
      return
    }
    setSending(true)
    setFailed(false)
    healthClient
      .submit(student.id, {
        template_id: templateId,
        answers: {
          ...answers,
          // The derived clause, never a chosen one. `clauses.ts` holds the rule, and the
          // server re-derives it and refuses a mismatch.
          ...(schema && clauseConfirmed
            ? { [CLAUSE_QUESTION_ID]: applicableClause(schema, answers) }
            : {}),
        },
        signature_image_base64: signatureDataUrl.replace(/^data:image\/\w+;base64,/, ''),
      })
      .then(() => {
        setStep(2)
        setShowErrors(false)
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  const join = () => {
    if (!chosenGroupId) {
      setShowErrors(true)
      return
    }
    setSending(true)
    setFailed(false)
    client
      .joinTheClub(student.id, {
        // A list of one. `StudentJoinIn.group_ids` stays plural — the manager's own convert
        // and door D both enrol into several — and this door sends the single base team.
        group_ids: [chosenGroupId],
        ...(chosenPlanId ? { price_plan_id: chosenPlanId } : {}),
      })
      .then((response) => {
        if (!response.ok) {
          setFailed(true)
          return
        }
        setStep(3)
        onJoined?.()
        globalThis.location.hash = PAYMENT_HASH
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  return (
    <section
      className="tw-scope flex flex-col min-h-[100dvh] bg-[var(--wz-ground)]"
      aria-labelledby="join-club-title"
      data-testid="join-from-trial"
    >
      <header className="sticky top-0 z-20 bg-[var(--wz-ground)]/95 backdrop-blur-xl border-b border-[var(--wz-tint)] px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2.5 mb-2.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => (current === 3 ? 2 : 1))}
              aria-label={t(locale, 'people.joinClub.back')}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[var(--wz-ink)] hover:bg-[var(--wz-tint)] active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1
              id="join-club-title"
              className="text-[17px] font-bold text-[var(--wz-heading)] leading-tight truncate"
            >
              {t(locale, 'people.joinClub.title')}
            </h1>
            <p className="text-[11.5px] text-[var(--wz-secondary)] truncate">
              {t(locale, 'people.joinClub.forWhom')}{' '}
              <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
            </p>
          </div>
        </div>

        {/* Three pills, not a bare percentage: a family mid-conversion can see which of the
            three things is in front of them and which two are not. */}
        <ol className="flex items-center gap-1.5" data-testid="join-stepper">
          {([1, 2, 3] as const).map((n) => {
            const done = n < step
            const current = n === step
            return (
              <li key={n} className="flex-1">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                    current
                      ? 'bg-[var(--wz-btn-bg)] text-white'
                      : done
                        ? 'bg-[var(--wz-tint)] text-[var(--wz-accent)]'
                        : 'bg-[var(--wz-raised)] text-[var(--wz-tertiary)]'
                  }`}
                >
                  {done ? <Check className="w-3 h-3 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{t(locale, STEP_KEYS[n])}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </header>

      <div className="flex-1 px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {step === 1 ? (
          <StepDeclaration
            locale={locale}
            schema={schema}
            answers={answers}
            declaredBy={stored?.declaredBy ?? null}
            declaredAt={stored?.declaredAt ?? null}
            clauseConfirmed={clauseConfirmed}
            signatureDataUrl={signatureDataUrl}
            showErrors={showErrors}
            failed={failed}
            onClause={setClauseConfirmed}
            onSignature={setSignatureDataUrl}
          />
        ) : (
          <StepGroups
            locale={locale}
            groups={groups}
            plans={plans}
            trialledGroupId={trialledGroupId}
            chosenGroupId={chosenGroupId}
            chosenPlanId={chosenPlanId}
            showErrors={showErrors}
            onGroup={setChosenGroupId}
            onPlan={setChosenPlanId}
          />
        )}

        {step === 2 && failed ? (
          <p className="mt-3 text-[12.5px] text-red-600 font-medium" role="alert" data-testid="join-club-error">
            {t(locale, 'people.joinClub.error')}
          </p>
        ) : null}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-[var(--wz-ground)]/95 backdrop-blur-xl border-t border-[var(--wz-tint)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-[480px] mx-auto">
          <button
            type="button"
            onClick={step === 1 ? submitDeclaration : join}
            disabled={sending}
            data-testid="join-club-submit"
            className="w-full min-h-12 rounded-xl bg-[var(--wz-btn-bg)] text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-transform disabled:opacity-60 disabled:active:scale-100 cursor-pointer"
          >
            {sending
              ? t(locale, 'people.joinClub.joining')
              : step === 1
                ? t(locale, 'people.joinClub.continue')
                : t(locale, 'people.joinClub.toPayment')}
          </button>
        </div>
      </div>
    </section>
  )
}
