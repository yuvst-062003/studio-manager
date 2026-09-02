// Step 3 — the health queue, restructured into exactly 2 inner screens per kid (the
// opening question, then everything else) with submission deferred to the wizard's
// final flush. **Nothing here calls `client.submit()`** -- that is Step 4's job
// (`JoinDoneScreen`, the "enter the app" action), once every kid in the queue has a
// finished draft.
//
// New components rather than a patch to `DeclarationForm.tsx`: that component owns
// its own submit button, tied to one immediate write per kid, which the deferred
// model has no use for. `DeclarationForm.tsx` itself is untouched -- still used by
// `AgreementFlow`/`RegistrationStep` for the other three entrances, out of this
// lane's scope.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Checkbox, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { applicableClause, clauseTextKey, CLAUSE_QUESTION_ID } from '../health/clauses'
import type { AnswerValue, HealthClient, TemplateSchema } from '../health/healthClient'
import { needsFullDeclaration, type GatedStudent } from '../health/HealthGate'
import { SignaturePad } from '../health/SignaturePad'
import {
  emptyHealthDraft,
  healthAnswersComplete,
  markAllHealthyDraft,
  type SubjectHealthDraft,
} from './healthDraft'
import { HealthReviewPopup } from './HealthReviewPopup'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'

const queueStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const pillStyle: CSSProperties = {
  borderRadius: '999px',
  fontSize: 'var(--text-caption)',
  padding: 'var(--space-1) var(--space-2)',
}

const choiceStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

function flatQuestions(schema: TemplateSchema) {
  return (schema.sections ?? []).flatMap((section) => section.questions ?? [])
}

/** One kid's own 2-inner-screen flow. Keyed by studentId at the call site so a fresh
 *  mount -- fresh local `screen`/`popupOpen` state -- happens automatically when the
 *  queue advances, rather than an effect reset that could race the draft handed in. */
function SubjectHealthFlow({
  client,
  locale,
  initialDraft,
  onSigned,
  signerName,
}: {
  client: HealthClient
  locale: Locale
  initialDraft: SubjectHealthDraft
  onSigned: (draft: SubjectHealthDraft) => void
  signerName?: string
}) {
  const [schema, setSchema] = useState<TemplateSchema | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [screen, setScreen] = useState<'opening' | 'main'>(
    initialDraft.openingAnswer ? 'main' : 'opening',
  )
  const [draft, setDraft] = useState<SubjectHealthDraft>(initialDraft)
  const [popupOpen, setPopupOpen] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let live = true
    client
      .template()
      .then((template) => {
        if (!live) return
        setSchema(template.schema as unknown as TemplateSchema)
      })
      .catch(() => live && setLoadFailed(true))
    return () => {
      live = false
    }
  }, [client])

  if (loadFailed) {
    return <Alert iconLabel={t(locale, 'health.declaration.error')} live tone="danger">{t(locale, 'health.declaration.error')}</Alert>
  }
  if (!schema) return <p>{t(locale, 'health.declaration.loading')}</p>

  function chooseOpening(answer: 'healthy' | 'reporting') {
    const withAnswer = { ...draft, openingAnswer: answer }
    setDraft(answer === 'healthy' ? markAllHealthyDraft(schema!, withAnswer) : withAnswer)
    setScreen('main')
  }

  const complete = healthAnswersComplete(schema, draft)
  const clause = applicableClause(schema, draft.answers)
  const clauseConfirmed = draft.answers[CLAUSE_QUESTION_ID] === clause
  const healthFundQuestion = flatQuestions(schema).find((q) => q.id === 'health_fund')
  const emergencyQuestion = flatQuestions(schema).find((q) => q.id === 'emergency_contact')
  const expanded = draft.openingAnswer === 'reporting' || popupOpen

  function updateAnswers(next: Record<string, AnswerValue>) {
    setDraft((previous) => ({ ...previous, answers: next }))
  }

  function sign() {
    setShowErrors(true)
    if (!complete) return
    onSigned(draft)
  }

  if (screen === 'opening') {
    return (
      <Card>
        <div data-testid="health-opening-question" style={choiceStyle}>
          <p style={{ margin: 0 }}>{t(locale, 'health.onboarding.openingQuestion')}</p>
          <Button
            data-testid="health-opening-healthy"
            onClick={() => chooseOpening('healthy')}
            type="button"
            variant="secondary"
          >
            {t(locale, 'health.onboarding.openingHealthy')}
          </Button>
          <Button
            data-testid="health-opening-reporting"
            onClick={() => chooseOpening('reporting')}
            type="button"
            variant="secondary"
          >
            {t(locale, 'health.onboarding.openingReporting')}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div style={choiceStyle}>
      {!expanded ? (
        <Card>
          <div data-testid="health-collapsed-card" style={choiceStyle}>
            <p style={{ margin: 0 }}>{t(locale, 'health.onboarding.allMarkedHealthy')}</p>
            <Button
              data-testid="health-review-open"
              onClick={() => setPopupOpen(true)}
              type="button"
              variant="ghost"
            >
              {t(locale, 'reports.privacy.gate.readFull')}
            </Button>
          </div>
        </Card>
      ) : (
        <HealthReviewPopup
          locale={locale}
          schema={schema}
          answers={draft.answers}
          onChange={updateAnswers}
          onClose={() => setPopupOpen(false)}
        />
      )}

      <Card>
        {healthFundQuestion ? (
          <TextField
            label={healthFundQuestion.label}
            onChange={(event) => updateAnswers({ ...draft.answers, health_fund: event.target.value })}
            value={typeof draft.answers.health_fund === 'string' ? draft.answers.health_fund : ''}
          />
        ) : null}
        {emergencyQuestion ? (
          <TextField
            error={
              showErrors && !draft.answers.emergency_contact
                ? t(locale, 'people.join.required')
                : undefined
            }
            inputMode="tel"
            label={emergencyQuestion.label}
            onChange={(event) =>
              updateAnswers({ ...draft.answers, emergency_contact: event.target.value })
            }
            value={typeof draft.answers.emergency_contact === 'string' ? draft.answers.emergency_contact : ''}
          />
        ) : null}
        <p data-testid="declaration-clause" style={{ color: 'var(--text-secondary)' }}>
          {t(locale, clauseTextKey(clause))}
        </p>
        <Checkbox
          checked={clauseConfirmed}
          label={t(locale, 'health.declaration.clause.confirm')}
          onChange={(event) =>
            updateAnswers({ ...draft.answers, [CLAUSE_QUESTION_ID]: event.target.checked ? clause : '' })
          }
        />
      </Card>

      <SignaturePad
        attestation={signerName ? signerName : undefined}
        error={
          showErrors && draft.signatureBase64 === null
            ? t(locale, 'health.declaration.signatureRequired')
            : undefined
        }
        locale={locale}
        onChange={(signature) => setDraft((previous) => ({ ...previous, signatureBase64: signature }))}
      />

      {showErrors && !complete ? (
        <Alert iconLabel={t(locale, 'health.declaration.answerRequired')} live tone="danger">
          {t(locale, 'health.declaration.answerRequired')}
        </Alert>
      ) : null}

      <Button data-testid="health-sign-continue" onClick={sign} type="button" variant="primary">
        {t(locale, 'health.onboarding.signAndContinue')}
      </Button>
    </div>
  )
}

export type JoinHealthStepProps = {
  client: HealthClient
  drafts: Record<string, SubjectHealthDraft>
  locale: Locale
  onBack: () => void
  /** Fired once per kid, with that kid's finished draft. The caller (`JoinFlow`)
   *  accumulates these into its own `healthDrafts` state -- nothing here decides when
   *  the whole family is done, only when THIS kid is. */
  onSigned: (draft: SubjectHealthDraft) => void
  signerName?: string
  students: readonly GatedStudent[]
}

export function JoinHealthStep({
  client,
  drafts,
  locale,
  onBack,
  onSigned,
  signerName,
  students,
}: JoinHealthStepProps) {
  const queue = students.filter(needsFullDeclaration)
  const current = queue[0] ?? null

  if (!current) return null

  return (
    <div data-testid="join-health-step">
      <OnboardingWizardChrome
        locale={locale}
        onBack={onBack}
        position={stepPosition('health')}
        title={t(locale, 'health.onboarding.step.health')}
      >
        {queue.length > 1 ? (
          <div
            aria-label={t(locale, 'health.onboarding.healthQueue')}
            data-testid="join-health-queue"
            style={queueStyle}
          >
            {queue.map((subject, index) => {
              const active = subject.id === current.id
              const done = Boolean(drafts[subject.id])
              return (
                <span
                  aria-current={active ? 'step' : undefined}
                  data-testid={`join-health-subject-${subject.id}`}
                  key={subject.id}
                  style={{
                    ...pillStyle,
                    background: active
                      ? 'var(--accent)'
                      : done
                        ? 'color-mix(in srgb, var(--paid) 12%, var(--surface))'
                        : 'color-mix(in srgb, var(--pending) 8%, var(--surface))',
                    color: active ? 'var(--surface)' : 'var(--text-muted)',
                  }}
                >
                  <bdi>{subject.display_name}</bdi>
                  {' · '}
                  {index + 1}/{queue.length}
                </span>
              )
            })}
          </div>
        ) : null}

        <p style={{ margin: 0 }}>
          {t(locale, 'health.declaration.forChild')} <bdi>{current.display_name}</bdi>
        </p>

        <SubjectHealthFlow
          client={client}
          initialDraft={drafts[current.id] ?? emptyHealthDraft(current.id)}
          key={current.id}
          locale={locale}
          onSigned={onSigned}
          signerName={signerName}
        />
      </OnboardingWizardChrome>
    </div>
  )
}
