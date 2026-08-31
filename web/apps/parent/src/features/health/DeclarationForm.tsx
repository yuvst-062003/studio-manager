// Parent artboard 12c — הצהרת בריאות · filling it in and signing.
//
// D11's flow: a structured question set, seeded by migration and editable by the manager,
// answered and signed by the parent. **Not a PDF with a signature over it** — §5.5 needs
// structured answers because `derived_flags` is what a coach's ⚠ badge comes from, and a
// signature over an image yields none.
//
// **Three answer states, not two.** 12c finding 5 calls this the most consequential gap on the
// artboard: "a declaration that defaults every question to no and gets signed is a health record
// nobody actually answered", and "a two-position `Switch` cannot express one". So a boolean
// question is a `SegmentedControl` with neither option selected until the parent picks — the
// primitive already exists, and this lane does not write a second one.
//
// **The shortcut does not weaken that.** Template v2 asks thirteen booleans, and for most
// families every answer is `לא` — thirteen taps on a phone to say "nothing is wrong". The
// `אין בעיות בריאות ידועות` button fills the ones still blank, and that is a different thing
// from a default: nothing is preselected on load, the parent presses it themselves, and it
// leaves alone every question they already answered — overwriting a `כן` would silently
// delete a medical answer a family had given. It does not tick the clause; see below.
//
// **`כן` binds to `--accent`, never `--paid`** (12c finding 8). They hold the same light-mode
// value and different meanings, and D12 moved `--paid` in dark mode deliberately. A health answer
// is not a payment.
//
// **D11's caveat used to be on this screen.** 12c finding 3 asked whether a parent signing a
// medical attestation should see the app's own disclaimer; they should have, while the questions
// were ours. Template v2's declaration section is the CLUB's own `טופס הרשמה`, signed alongside
// the club's own תקנון, so the sentence became false and was removed. What a parent reads before
// signing now is the club's own clause — rendered below, and derived rather than chosen.
//
// **G7.** No answer is logged, and nothing here is put anywhere but the request body.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, Checkbox, LoadFailed, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { SignaturePad } from './SignaturePad'
import { applicableClause, clauseTextKey, CLAUSE_QUESTION_ID } from './clauses'
import { isAnswered, isVisible, unansweredRequired } from './healthClient'
import type { AnswerValue, HealthClient, TemplateQuestion, TemplateSchema } from './healthClient'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: '1px solid var(--border)',
}

const quickFillStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-1)',
  paddingBlockEnd: 'var(--space-3)',
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

export type DeclarationFormProps = {
  locale: Locale
  client: HealthClient
  studentId: string
  studentName: string
  /** Signed and dated by whoever is holding the phone (12c's attestation caption). */
  signerName?: string
  today?: string
  onSubmitted?: () => void
}

/** 12c's `כן` / `לא`, plus the third state the artboard does not draw. */
function booleanOptions(locale: Locale): readonly { value: string; label: string }[] {
  return [
    { value: 'yes', label: t(locale, 'health.declaration.yes') },
    { value: 'no', label: t(locale, 'health.declaration.no') },
  ]
}

export function DeclarationForm({
  locale,
  client,
  studentId,
  studentName,
  signerName,
  today,
  onSubmitted,
}: DeclarationFormProps) {
  const [schema, setSchema] = useState<TemplateSchema | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [signature, setSignature] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let live = true
    client
      .template()
      .then((template) => {
        if (!live) return
        setTemplateId(template.id)
        setSchema(template.schema as unknown as TemplateSchema)
      })
      .catch(() => {
        if (live) setLoadFailed(true)
      })
    return () => {
      live = false
    }
  }, [client, attempt])

  const missing = useMemo(() => (schema ? unansweredRequired(schema, answers) : []), [schema, answers])
  const complete = missing.length === 0 && signature !== null

  /** The yes/no questions on screen with nothing chosen yet — what the shortcut would fill. */
  const blankBooleans = useMemo(
    () =>
      (schema?.sections ?? [])
        .flatMap((section) => section.questions ?? [])
        .filter(
          (question) =>
            question.type === 'boolean' &&
            isVisible(question, answers) &&
            !isAnswered(answers[question.id]),
        ),
    [schema, answers],
  )

  const answer = (question: TemplateQuestion, value: AnswerValue) => {
    setAnswers((previous) => {
      const next = { ...previous, [question.id]: value }
      // **A confirmed clause does not survive a change to what it was confirmed against.**
      // A parent can tick "no medical limitations", then go back and answer yes to asthma. The
      // confirmation would still be sitting there, and they would sign a sentence that had
      // become false without ever seeing it change. The server refuses that submission — but a
      // 422 at the end of a long form is a worse way to learn it than the checkbox clearing.
      if (question.id !== CLAUSE_QUESTION_ID && schema) {
        const confirmed = next[CLAUSE_QUESTION_ID]
        if (typeof confirmed === 'string' && confirmed !== applicableClause(schema, next)) {
          delete next[CLAUSE_QUESTION_ID]
        }
      }
      // A `no` hides the detail field AND clears it. Leaving the text behind would submit an
      // answer to a question that is no longer on screen — and for a health record, a stale
      // free-text note about a child is worse than none.
      if (question.type === 'boolean' && value === false) {
        for (const section of schema?.sections ?? []) {
          for (const candidate of section.questions ?? []) {
            if (candidate.visible_if && Object.keys(candidate.visible_if).includes(question.id)) {
              delete next[candidate.id]
            }
          }
        }
      }
      return next
    })
  }

  /**
   * The one tap. Answers `לא` everywhere nothing was chosen, and nothing else.
   *
   * It cannot invalidate a clause already confirmed: `declaresALimitation` reads a `כן` or a
   * non-empty medical note, and neither is what this writes — so which sentence applies is the
   * same before and after. The clause question itself is untouched on purpose. It is the
   * attestation the family signs under, and a button that ticked it would make a legal
   * statement on their behalf, which is exactly what `clauses.ts` exists to prevent.
   *
   * Detail fields stay put too: they are `visible_if: {x: true}`, so a question this fills was
   * already hidden and has nothing behind it to clear.
   */
  const markAllHealthy = () => {
    setAnswers((previous) => {
      const next = { ...previous }
      for (const question of blankBooleans) next[question.id] = false
      return next
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (!complete || !templateId || !signature) return
    setSending(true)
    setFailed(false)
    client
      .submit(studentId, {
        template_id: templateId,
        answers,
        signature_image_base64: signature,
      })
      .then(() => {
        setSubmitted(true)
        onSubmitted?.()
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  if (loadFailed) {
    // F1a/P8 — this is §6.1's BLOCKING gate: a dead end here locks the family out of
    // the whole app, which is the one place retry matters most.
    return (
      <LoadFailed
        detail={t(locale, 'health.declaration.error')}
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!schema) return <p>{t(locale, 'health.declaration.loading')}</p>
  if (submitted) {
    return (
      <>
        {/* `paid` is the only green AlertTone there is. 4e's spec already raises this as a
          finding — "--paid renders 'this charge is settled' and 'this declaration is valid'",
          the same green for two concepts — and it needs deciding in the token layer, not by a
          feature inventing a fourth tone here. */}
        <Alert iconLabel={t(locale, 'health.declaration.submitted')} live tone="paid">
          {t(locale, 'health.declaration.submitted')} · {t(locale, 'health.declaration.noExpiry')}
        </Alert>
      </>
    )
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <header>
        {/* h2, not h1. `HealthGate` renders its own <h1> and then renders this form directly
            beneath it, so an <h1> here produced two top-level headings on one screen and a
            screen-reader user skipping by heading level heard the page start twice. The
            section titles below are h3 for the same reason: the outline has to descend. */}
        <h2>{t(locale, 'health.declaration.title')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'health.declaration.forChild')} <bdi>{studentName}</bdi>
        </p>
        {/* §5.5 — declarations do not expire. The subtitle says so rather than showing a
            validity the model does not have (12c finding 1, the seventh artboard to assume one). */}
        <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'health.declaration.noExpiry')}</p>
      </header>

      <Card>
        <p style={{ color: 'var(--text-secondary)' }}>{t(locale, 'health.declaration.attestation')}</p>
      </Card>

      <Card>
        <p style={{ color: 'var(--text-secondary)' }}>{t(locale, 'health.declaration.intro')}</p>
        {/* Hidden once there is nothing left to fill: a shortcut that would change nothing is a
            button that does nothing when pressed. `type="button"` because a bare <button> inside
            a <form> submits it, and submitting here is the opposite of the point. */}
        {blankBooleans.length > 0 ? (
          <div style={quickFillStyle}>
            <Button onClick={markAllHealthy} type="button" variant="secondary">
              {t(locale, 'health.declaration.markAllHealthy')}
            </Button>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
              {t(locale, 'health.declaration.markAllHealthyHint')}
            </span>
          </div>
        ) : null}
        {(schema.sections ?? []).map((section) => (
          <section key={section.id}>
            {section.title ? <h3>{section.title}</h3> : null}
            {(section.questions ?? [])
              .filter((question) => isVisible(question, answers))
              .map((question) => {
                const value = answers[question.id]
                const unanswered = value === undefined || value === null || value === ''
                if (question.type === 'clause') {
                  // Not a free choice between two sentences: the answers above already decide
                  // which one this family may sign, and the parent confirms THAT one. Rendering
                  // both as options would be offering a family a false statement to pick.
                  const clause = applicableClause(schema, answers)
                  const confirmed = value === clause
                  return (
                    <div key={question.id} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                      <p
                        data-testid="declaration-clause"
                        style={{ color: 'var(--text-secondary)', marginBlockEnd: 'var(--space-2)' }}
                      >
                        {t(locale, clauseTextKey(clause))}
                      </p>
                      {/* The `Checkbox` primitive, not a bare input: it owns the label
                          association and the focus ring, and .claude/rules/ui-rtl-a11y.md
                          requires both on every interactive element. */}
                      <Checkbox
                        checked={confirmed}
                        label={t(locale, 'health.declaration.clause.confirm')}
                        onChange={(event) => answer(question, event.target.checked ? clause : '')}
                      />
                      {showErrors && !confirmed ? (
                        <span
                          data-testid={`unanswered-${question.id}`}
                          style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}
                        >
                          {t(locale, 'health.declaration.clause.required')}
                        </span>
                      ) : null}
                    </div>
                  )
                }
                if (question.type === 'boolean') {
                  return (
                    <div key={question.id} style={rowStyle}>
                      {/* The SegmentedControl's legend is sr-only; without this span a
                          sighted parent sees a bare כן/לא row with no question. aria-hidden
                          because the legend already names the group for assistive tech. */}
                      <span aria-hidden="true">{question.label}</span>
                      <SegmentedControl
                        legend={question.label}
                        onValueChange={(next) => answer(question, next === 'yes')}
                        options={booleanOptions(locale)}
                        // '' selects neither: the third state 12c finding 5 says must exist.
                        value={value === true ? 'yes' : value === false ? 'no' : ''}
                      />
                      {showErrors && unanswered && question.required !== false ? (
                        <span
                          data-testid={`unanswered-${question.id}`}
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: 'var(--text-caption)',
                          }}
                        >
                          {t(locale, 'health.declaration.unanswered')}
                        </span>
                      ) : null}
                    </div>
                  )
                }
                return (
                  <div key={question.id} style={rowStyle}>
                    <label style={{ inlineSize: '100%' }}>
                      <span>{question.label}</span>
                      {/* A native textarea: `TextField` has no multiline mode. Four artboards
                          want one (12c, 9g, 7b, 4f) and the primitive is not this lane's file. */}
                      <textarea
                        onChange={(event) => answer(question, event.target.value)}
                        rows={question.type === 'phone' ? 1 : 2}
                        style={detailStyle}
                        value={typeof value === 'string' ? value : ''}
                      />
                    </label>
                  </div>
                )
              })}
          </section>
        ))}
      </Card>

      <SignaturePad
        attestation={signerName && today ? `${signerName} · ${today}` : undefined}
        error={
          showErrors && signature === null ? t(locale, 'health.declaration.signatureRequired') : undefined
        }
        locale={locale}
        onChange={setSignature}
      />

      {showErrors && missing.length > 0 ? (
        <Alert iconLabel={t(locale, 'health.declaration.answerRequired')} live tone="danger">
          {t(locale, 'health.declaration.answerRequired')}
        </Alert>
      ) : null}
      {failed ? (
        <Alert iconLabel={t(locale, 'health.declaration.error')} live tone="danger">
          {t(locale, 'health.declaration.error')}
        </Alert>
      ) : null}

      <Button disabled={sending} type="submit" variant="primary">
        {sending ? t(locale, 'health.declaration.submitting') : t(locale, 'health.declaration.submit')}
      </Button>
    </form>
  )
}
