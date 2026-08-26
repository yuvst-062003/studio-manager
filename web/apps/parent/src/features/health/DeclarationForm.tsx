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
// **`כן` binds to `--accent`, never `--paid`** (12c finding 8). They hold the same light-mode
// value and different meanings, and D12 moved `--paid` in dark mode deliberately. A health answer
// is not a payment.
//
// **D11's caveat is on this screen too.** 12c finding 3 asks whether a parent signing a medical
// attestation should see it; they should. It costs one line and the alternative is a family
// signing something the app privately describes as a starting point.
//
// **G7.** No answer is logged, and nothing here is put anywhere but the request body.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { SignaturePad } from './SignaturePad'
import { isVisible, unansweredRequired } from './healthClient'
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
  }, [client])

  const missing = useMemo(() => (schema ? unansweredRequired(schema, answers) : []), [schema, answers])
  const complete = missing.length === 0 && signature !== null

  const answer = (question: TemplateQuestion, value: AnswerValue) => {
    setAnswers((previous) => {
      const next = { ...previous, [question.id]: value }
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
    return (
      <Alert iconLabel={t(locale, 'health.declaration.error')} live tone="danger">
        {t(locale, 'health.declaration.error')}
      </Alert>
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
        {/* D11's caveat, on the screen the parent signs. 12c finding 3. */}
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
          {t(locale, 'health.template.disclaimer')}
        </p>
      </Card>

      <Card>
        <p style={{ color: 'var(--text-secondary)' }}>{t(locale, 'health.declaration.intro')}</p>
        {(schema.sections ?? []).map((section) => (
          <section key={section.id}>
            {section.title ? <h3>{section.title}</h3> : null}
            {(section.questions ?? [])
              .filter((question) => isVisible(question, answers))
              .map((question) => {
                const value = answers[question.id]
                const unanswered = value === undefined || value === null || value === ''
                if (question.type === 'boolean') {
                  return (
                    <div key={question.id} style={rowStyle}>
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
