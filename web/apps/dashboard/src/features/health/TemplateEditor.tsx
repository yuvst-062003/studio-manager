// D11's editor — the screen behind 4e's `עריכת תבנית הצהרה` button.
//
// **This is where D11's caveat lives, and it is not optional.** D11: "A health declaration for
// minors in an Israeli sports club touches insurance and regulatory ground. The bundled template
// is a starting point, and the app must say so **where the manager edits it**. It is not a
// compliance artefact and must not be presented as one." So `template.disclaimer` renders
// unconditionally, above the questions, before any of them can be changed.
//
// **`is_bundled_default` decides whose questions this is showing.** A studio that has reworded
// every one of them is no longer editing ours, and an editor that still called them "the questions
// the app ships with" would be the opposite of the caveat. The marker is dropped by the server on
// first edit, so the two labels swap on their own.
//
// **Edits are a draft.** Nothing a parent signs and nothing a coach sees moves until publish: a
// published version is immutable, because §4.3 puts `template_version` on the declaration so a
// signature records which questions were actually asked.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardHealthClient, EditableQuestion, EditableSchema } from './healthClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: '1px solid var(--border)',
}

/** A new question's id, derived from nothing the manager typed. */
function freshId(schema: EditableSchema): string {
  const existing = new Set(
    schema.sections.flatMap((section) => section.questions.map((question) => question.id)),
  )
  let index = 1
  while (existing.has(`question_${index}`)) index += 1
  return `question_${index}`
}

export function withQuestionLabel(schema: EditableSchema, questionId: string, label: string): EditableSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.id === questionId ? { ...question, label } : question,
      ),
    })),
  }
}

export function withoutQuestion(schema: EditableSchema, questionId: string): EditableSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      questions: section.questions.filter((question) => question.id !== questionId),
    })),
  }
}

export function withNewQuestion(schema: EditableSchema, sectionId: string): EditableSchema {
  const question: EditableQuestion = {
    id: freshId(schema),
    type: 'boolean',
    label: '',
    // Not a flag question by default. A flag puts a ⚠ on a coach's roster, and a question that
    // silently became one because it was the default is a warning nobody chose to raise.
    flag: false,
  }
  return {
    ...schema,
    sections: schema.sections.map((section) =>
      section.id === sectionId ? { ...section, questions: [...section.questions, question] } : section,
    ),
  }
}

export function withFlag(schema: EditableSchema, questionId: string, flag: boolean): EditableSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.id === questionId ? { ...question, flag } : question,
      ),
    })),
  }
}

export type TemplateEditorProps = {
  locale: Locale
  client: DashboardHealthClient
}

export function TemplateEditor({ locale, client }: TemplateEditorProps) {
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [schema, setSchema] = useState<EditableSchema | null>(null)
  const [saved, setSaved] = useState(false)
  const [publishedCount, setPublishedCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    client
      .templates()
      .then((list) => {
        // The highest version is the one being edited: a draft where one exists, otherwise the
        // live version, which the server turns into a draft on the first save.
        const latest = [...list.items].sort((a, b) => b.version - a.version)[0]
        if (!latest) throw new Error('no full template')
        setTemplateId(latest.id)
        return client.template(latest.id)
      })
      .then((template) => setSchema(template.schema as unknown as EditableSchema))
      .catch(() => setFailed(true))
  }, [client])

  useEffect(load, [load])

  const change = (next: EditableSchema) => {
    setSchema(next)
    setSaved(false)
    setPublishedCount(null)
  }

  const save = () => {
    if (!templateId || !schema) return
    client
      .saveDraft(templateId, schema)
      .then((template) => {
        setTemplateId(template.id)
        setSchema(template.schema as unknown as EditableSchema)
        setSaved(true)
      })
      .catch(() => setFailed(true))
  }

  const publish = () => {
    if (!templateId) return
    client
      .publish(templateId)
      .then((result) => {
        setPublishedCount(result.declarations_recomputed)
        setSaved(false)
        load()
      })
      .catch(() => setFailed(true))
  }

  if (failed) {
    return (
      <Alert iconLabel={t(locale, 'health.documents.error')} live tone="danger">
        {t(locale, 'health.documents.error')}
      </Alert>
    )
  }
  if (!schema) return <p>{t(locale, 'health.documents.loading')}</p>

  const bundled = schema.is_bundled_default === true

  return (
    <section aria-labelledby="template-title">
      <h1 id="template-title">{t(locale, 'health.template.title')}</h1>

      {/* D11's caveat. Unconditional, above the questions, before anything can be changed. */}
      <Alert iconLabel={t(locale, 'health.template.title')} tone="pending">
        {t(locale, 'health.template.disclaimer')}
      </Alert>

      <p data-testid="template-provenance" style={{ color: 'var(--text-muted)' }}>
        {bundled ? t(locale, 'health.template.editingBundled') : t(locale, 'health.template.editingYours')}
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
        {t(locale, 'health.template.draftHint')}
      </p>

      {schema.sections.map((section) => (
        <Card key={section.id}>
          <h2>{section.title ?? section.id}</h2>
          {section.questions.map((question) => (
            <div key={question.id} style={rowStyle}>
              <TextField
                label={t(locale, 'health.template.questionText')}
                onChange={(event) => change(withQuestionLabel(schema, question.id, event.target.value))}
                value={question.label}
              />
              <label>
                <input
                  checked={question.flag === true}
                  onChange={(event) => change(withFlag(schema, question.id, event.target.checked))}
                  type="checkbox"
                />
                <span>{t(locale, 'health.template.flagQuestion')}</span>
              </label>
              <Button
                onClick={() => change(withoutQuestion(schema, question.id))}
                type="button"
                variant="secondary"
              >
                {t(locale, 'health.template.removeQuestion')}
              </Button>
            </div>
          ))}
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
            {t(locale, 'health.template.flagQuestionHint')}
          </p>
          <Button
            onClick={() => change(withNewQuestion(schema, section.id))}
            type="button"
            variant="secondary"
          >
            {t(locale, 'health.template.addQuestion')}
          </Button>
        </Card>
      ))}

      <Button onClick={save} type="button" variant="secondary">
        {t(locale, 'health.template.save')}
      </Button>
      <Button onClick={publish} type="button" variant="primary">
        {t(locale, 'health.template.publish')}
      </Button>

      {saved ? <p role="status">{t(locale, 'health.template.saved')}</p> : null}
      {publishedCount !== null ? (
        // The count is reported rather than swallowed: publishing re-derives every declaration's
        // flags, and a publish that said nothing about the roster it just fixed would look
        // identical to one that fixed nothing.
        <p role="status">
          {t(locale, 'health.template.published')} · {publishedCount}{' '}
          {t(locale, 'health.template.recomputed')}
        </p>
      ) : null}
    </section>
  )
}
