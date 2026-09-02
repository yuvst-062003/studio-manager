// Step 3's per-kid draft state. Every kid's answers and signature accumulate here,
// held only in `JoinFlow`'s state (and, per Phase 5, `sessionStorage`) until the
// deferred flush -- nothing here ever calls `client.submit()`.
//
// **The 4 conditional detail fields become required-when-visible client-side.**
// `chronic_illness_details`/`allergy_details`/`medication_details`/`other_details`
// carry `"required": false` in the seeded template schema despite being visible only
// after their trigger boolean is "yes" -- flipping that in the schema is a migration
// (schema-owning territory, flagged for `main` rather than authored in this lane).
// This enforces the same rule at the client instead: the 4 fields are exactly the
// `type: 'text'` questions with a `visible_if` in template v2 -- every other text
// question (`health_fund`, `restrictions`, `special_notes`) is always-visible with no
// `visible_if` -- so that structural shape identifies them without hardcoding ids.
import { isAnswered, isVisible, unansweredRequired } from '../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../health/healthClient'

export type SubjectHealthDraft = {
  studentId: string
  /** Step 3's inner-step-1 answer, `null` while unanswered. */
  openingAnswer: 'healthy' | 'reporting' | null
  answers: Record<string, AnswerValue>
  signatureBase64: string | null
}

export function emptyHealthDraft(studentId: string): SubjectHealthDraft {
  return {
    studentId,
    openingAnswer: null,
    answers: {},
    signatureBase64: null,
  }
}

function questions(schema: TemplateSchema) {
  return (schema.sections ?? []).flatMap((section) => section.questions ?? [])
}

export function conditionalDetailQuestionIds(schema: TemplateSchema): string[] {
  return questions(schema)
    .filter((question) => question.type === 'text' && question.visible_if !== undefined)
    .map((question) => question.id)
}

export function healthAnswersComplete(schema: TemplateSchema, draft: SubjectHealthDraft): boolean {
  if (draft.signatureBase64 === null) return false
  if (unansweredRequired(schema, draft.answers).length > 0) return false
  const detailIds = conditionalDetailQuestionIds(schema)
  const questionById = new Map(questions(schema).map((question) => [question.id, question]))
  return detailIds.every((id) => {
    const question = questionById.get(id)
    if (!question || !isVisible(question, draft.answers)) return true
    return isAnswered(draft.answers[id]) && String(draft.answers[id]).trim() !== ''
  })
}

/** Ports `DeclarationForm.tsx`'s `markAllHealthy` onto the draft shape: fills every
 *  blank boolean with `false`, touches nothing already answered. */
export function markAllHealthyDraft(
  schema: TemplateSchema,
  draft: SubjectHealthDraft,
): SubjectHealthDraft {
  const next = { ...draft.answers }
  for (const question of questions(schema)) {
    if (question.type === 'boolean' && isVisible(question, draft.answers) && !isAnswered(next[question.id])) {
      next[question.id] = false
    }
  }
  return { ...draft, answers: next }
}
