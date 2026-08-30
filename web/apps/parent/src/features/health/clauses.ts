// The club's two health clauses, and the rule that picks between them.
//
// `טופס הרשמה` block 5 is not a question with two answers — it is two **alternative
// declarations**, and the paper form expects one signature under one of them:
//
//   1. `אין מגבלות רפואיות/רגישויות כלשהן` — plus an undertaking to report any that arise
//   2. `למרות המגבלות הרפואיות המצוינות לעיל, ... מסוגל לעמוד במאמץ הדרוש`
//
// **This file is the client half of a rule the server also enforces**
// (`app/services/health/clauses.py`). It is duplicated deliberately rather than fetched: the
// parent must SEE the sentence they are signing while they are signing it, and a round trip to
// find out which one applies would put a spinner in the middle of a legal attestation. The
// server re-derives it on submit and refuses a mismatch, so this copy being wrong is a 422 and
// never a false declaration.
//
// Both failure modes this guards against are real and opposite:
//   * choosing silently would have the app make a legal statement on a family's behalf;
//   * leaving it open would let a family declare "no medical limitations of any kind" on the
//     same form where they answered yes to asthma.
import type { AnswerValue, TemplateQuestion, TemplateSchema } from './healthClient'

export const CLAUSE_NONE = 'none'
export const CLAUSE_LIMITED = 'limited'

export type ClauseId = typeof CLAUSE_NONE | typeof CLAUSE_LIMITED

/** The `clause` question's id in template v2. */
export const CLAUSE_QUESTION_ID = 'clause_confirmed'

/**
 * Questions whose answers say nothing about fitness to train.
 *
 * Named rather than inferred, so adding a question that SHOULD move the clause is the default
 * and exempting one is a visible diff. `special_notes` is `הערות בריאות מיוחדות` — a free note
 * where "מרכיב משקפיים" is a normal thing to write and is not a declaration that a child cannot
 * train. Answering a *question* moves the clause; annotating the form does not.
 *
 * Mirrors `_NEUTRAL_QUESTIONS` in `app/services/health/clauses.py`.
 */
const NEUTRAL_QUESTIONS = new Set(['special_notes', 'emergency_contact', 'health_fund'])

function questions(schema: TemplateSchema): TemplateQuestion[] {
  return (schema.sections ?? []).flatMap((section) => section.questions ?? [])
}

/**
 * Whether anything answered amounts to a medical limitation.
 *
 * Deliberately broader than the flag questions. A flag raises a coach's ⚠ badge; this decides
 * which legal sentence a parent signs, and `chest_pain` produces no badge while plainly
 * contradicting "no medical limitations of any kind". The conservative direction is the safe
 * one: over-reporting sends a family to clause 2, which is true either way.
 */
export function declaresALimitation(
  schema: TemplateSchema,
  answers: Readonly<Record<string, AnswerValue>>,
): boolean {
  return questions(schema).some((question) => {
    if (NEUTRAL_QUESTIONS.has(question.id) || question.id === CLAUSE_QUESTION_ID) return false
    const value = answers[question.id]
    if (question.type === 'boolean') return value === true
    // A free-text medical field with content in it. Whitespace is not content: a space bar
    // pressed by accident is not a medical limitation.
    return typeof value === 'string' && value.trim() !== ''
  })
}

/** Which of the two sentences this family is entitled to sign. */
export function applicableClause(
  schema: TemplateSchema,
  answers: Readonly<Record<string, AnswerValue>>,
): ClauseId {
  return declaresALimitation(schema, answers) ? CLAUSE_LIMITED : CLAUSE_NONE
}

/** The i18n key for the sentence itself. */
export function clauseTextKey(clause: ClauseId): string {
  return clause === CLAUSE_LIMITED
    ? 'health.declaration.clause.limited'
    : 'health.declaration.clause.none'
}
