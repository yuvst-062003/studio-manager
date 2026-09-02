// Step 3's shared review popup -- one component, seeded two ways by its caller
// (Task 3.3): all-false for the "healthy" collapsed card's "open" link, blank for
// "something to report". Lists every section's boolean and its conditional detail
// field, plus `restrictions` (no positive trigger, stays in its own orthopaedic
// context) -- everything except `health_fund`, the phone question and the clause
// itself, which the caller renders separately below/around this popup (per the
// spec's "below either version, unchanged: קופת חולים + טלפון חירום, the derived
// clause, and the signature pad").
//
// `special_notes` is pulled out of its natural section position and rendered last,
// in its own labeled callout -- "surfaced... prominently" is the requirement, and a
// manager already reads it whenever they open the full declaration (§11-logged); this
// popup just needs to make it visible, not build a new notification.
import type { CSSProperties } from 'react'
import { Button, Card, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isVisible } from '../health/healthClient'
import type { AnswerValue, TemplateQuestion, TemplateSchema } from '../health/healthClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: '1px solid var(--border)',
}

const detailStyle: CSSProperties = {
  inlineSize: '100%',
  padding: 'var(--space-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  font: 'inherit',
}

const EXCLUDED_IDS = new Set(['health_fund'])
const SPECIAL_NOTES_ID = 'special_notes'

function booleanOptions(locale: Locale) {
  return [
    { value: 'yes', label: t(locale, 'health.declaration.yes') },
    { value: 'no', label: t(locale, 'health.declaration.no') },
  ]
}

export type HealthReviewPopupProps = {
  locale: Locale
  schema: TemplateSchema
  answers: Record<string, AnswerValue>
  onChange: (next: Record<string, AnswerValue>) => void
  onClose: () => void
}

export function HealthReviewPopup({
  locale,
  schema,
  answers,
  onChange,
  onClose,
}: HealthReviewPopupProps) {
  function answer(question: TemplateQuestion, value: AnswerValue) {
    const next = { ...answers, [question.id]: value }
    if (question.type === 'boolean' && value === false) {
      for (const section of schema.sections ?? []) {
        for (const candidate of section.questions ?? []) {
          if (candidate.visible_if && Object.keys(candidate.visible_if).includes(question.id)) {
            delete next[candidate.id]
          }
        }
      }
    }
    onChange(next)
  }

  const specialNotesQuestion = (schema.sections ?? [])
    .flatMap((section) => section.questions ?? [])
    .find((question) => question.id === SPECIAL_NOTES_ID)

  return (
    <Card>
      <div data-testid="health-review-popup">
        <Button data-testid="health-review-close" onClick={onClose} type="button" variant="ghost">
          {t(locale, 'reports.privacy.gate.closeFull')}
        </Button>

        {(schema.sections ?? []).map((section) => (
          <section key={section.id}>
            {section.title ? <h3>{section.title}</h3> : null}
            {(section.questions ?? [])
              .filter(
                (question) =>
                  (question.type === 'boolean' || question.type === 'text') &&
                  question.id !== SPECIAL_NOTES_ID &&
                  !EXCLUDED_IDS.has(question.id) &&
                  isVisible(question, answers),
              )
              .map((question) => {
                const value = answers[question.id]
                if (question.type === 'boolean') {
                  return (
                    <div key={question.id} style={rowStyle}>
                      <span aria-hidden="true">{question.label}</span>
                      <SegmentedControl
                        legend={question.label}
                        onValueChange={(next) => answer(question, next === 'yes')}
                        options={booleanOptions(locale)}
                        value={value === true ? 'yes' : value === false ? 'no' : ''}
                      />
                    </div>
                  )
                }
                return (
                  <div key={question.id} style={rowStyle}>
                    <label style={{ inlineSize: '100%' }}>
                      <span>{question.label}</span>
                      <textarea
                        onChange={(event) => answer(question, event.target.value)}
                        rows={2}
                        style={detailStyle}
                        value={typeof value === 'string' ? value : ''}
                      />
                    </label>
                  </div>
                )
              })}
          </section>
        ))}

        {specialNotesQuestion ? (
          <div data-testid="health-review-special-notes" style={{ ...rowStyle, borderBlockEnd: 'none' }}>
            <label style={{ inlineSize: '100%' }}>
              <strong>{specialNotesQuestion.label}</strong>
              <textarea
                onChange={(event) => answer(specialNotesQuestion, event.target.value)}
                rows={3}
                style={detailStyle}
                value={typeof answers[SPECIAL_NOTES_ID] === 'string' ? (answers[SPECIAL_NOTES_ID] as string) : ''}
              />
            </label>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
