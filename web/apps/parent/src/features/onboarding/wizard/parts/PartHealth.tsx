// §5.5 -- part 4, and the part that carries the manager-review gate.
//
// **Template-driven, not thirteen literals.** `HealthFormTemplate` holds a per-studio JSONB
// schema with a version, and `HealthDeclaration` stamps `template_id` + `template_version`
// onto every signed row. Hard-coding the questions would break every studio but one and
// silently void that version trail. `TemplateSection` already carries a title, so the
// prototype's three cards map straight onto sections.
//
// **Nothing is pre-answered.** `healthyPreset` starts `null` and every question starts
// unanswered. The prototype defaults the preset to "healthy" and all thirteen answers to
// "no", so the whole safety declaration completes itself by pressing Next five times.
import { AlertCircle, Check, CheckCircle2, Clock, HeartPulse } from 'lucide-react'
import type { Locale } from '@studio/i18n'
import { t } from '@studio/i18n'
import { isVisible } from '../../../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../../../health/healthClient'
import { applicableClause, clauseTextKey, CLAUSE_QUESTION_ID } from '../../../health/clauses'
import { studentFormCopy } from '../copy'
import { needsManagerReview } from '../types'
import type { StudentDraft } from '../types'

/**
 * Template questions the WIZARD asks itself, and which must therefore not be drawn here
 * as well (owner-reported 2026-09-07: "הערות בריאות מיוחדות is repeated twice and the
 * emergency number and קופת חולים is asked twice").
 *
 * They are not merely duplicated on screen — `adapters.ts` OVERWRITES the template's
 * answer with the wizard's own field when it builds the payload, so whatever a parent
 * typed into these three here was thrown away at submit. Asking twice and keeping the
 * second answer is the worst of both.
 *
 * The wizard's own controls are kept rather than these because they are the better and
 * the validated ones: `healthFund` is a select of the four funds rather than free text,
 * `emergencyPhone` is checked for a real number, and step 5 lists both as required.
 * `questionIds` in `StudentFormSheet` deliberately excludes text questions from
 * validation, so leaving these to the template would drop their required check entirely.
 */
const WIZARD_OWNED_QUESTIONS = new Set(['health_fund', 'emergency_contact', 'special_notes'])

export function PartHealth({
  locale,
  schema,
  student,
  onChange,
  presetError,
  answersError,
  clauseError,
}: {
  locale: Locale
  schema: TemplateSchema
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  presetError: string | null
  answersError: string | null
  /** The club's declaration, unconfirmed. Its own prop rather than a second use of
   *  `answersError`, because the two say different things to a family that is stuck. */
  clauseError: string | null
}) {
  const copy = studentFormCopy(locale)
  const flagged = needsManagerReview(student)

  const setAnswer = (id: string, value: AnswerValue) => {
    const answers = { ...student.healthAnswers, [id]: value }
    //: **A confirmed clause does not survive a change to what it was confirmed against.**
    //: The two clauses are alternatives and which one applies is DERIVED from the answers,
    //: so a family who confirms "no limitations", then answers `כן` to asthma, would
    //: otherwise submit a false statement under a real signature. Same rule the old
    //: `DeclarationForm` carried; `verify_clause` is the server half that refuses it.
    if (id !== CLAUSE_QUESTION_ID) {
      const confirmed = answers[CLAUSE_QUESTION_ID]
      if (confirmed && confirmed !== applicableClause(schema, answers)) {
        answers[CLAUSE_QUESTION_ID] = ''
      }
    }
    //: A "yes" anywhere means the family is telling us about a limitation, so the preset
    //: follows the answers rather than fighting them.
    const anyYes = Object.values(answers).some((entry) => entry === true)
    onChange({ healthAnswers: answers, healthyPreset: anyYes ? false : student.healthyPreset })
  }

  const applyPreset = (healthy: boolean) => {
    //: Starts from `{}`, so a clause confirmed before the preset was pressed is dropped
    //: along with the answers it was derived from. Stated rather than incidental.
    const answers: Record<string, AnswerValue> = {}
    for (const section of schema.sections) {
      for (const question of section.questions) {
        if (question.type !== 'boolean') continue
        //: "Fit and well" is a shortcut for answering every question "no". "There is a
        //: limitation" clears them so each is answered deliberately -- it is not itself an
        //: answer, which is why `needsManagerReview` reads the answers and not this flag.
        answers[question.id] = healthy ? false : null
      }
    }
    onChange({ healthyPreset: healthy, healthAnswers: answers })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="p-3.5 rounded-xl bg-[var(--wz-accent-deep)] text-white flex flex-col gap-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-[var(--wz-tint-2)]" />
          <span className="text-[16px] font-bold">{copy.healthTitle}</span>
        </div>
        <p className="text-[12px] text-[var(--wz-line)] leading-relaxed">{copy.healthQuestion}</p>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            aria-pressed={student.healthyPreset === true}
            onClick={() => applyPreset(true)}
            className={`py-2 px-3 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              student.healthyPreset === true
                ? 'bg-[var(--wz-accent)] text-white shadow-xs ring-2 ring-white/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{copy.healthYes}</span>
          </button>
          <button
            type="button"
            aria-pressed={student.healthyPreset === false}
            onClick={() => applyPreset(false)}
            className={`py-2 px-3 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              student.healthyPreset === false
                ? 'bg-[var(--wz-danger)] text-white font-bold ring-2 ring-white/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>{copy.healthNo}</span>
          </button>
        </div>

        {presetError ? (
          <p className="text-[11.5px] bg-[var(--wz-danger)]/50 text-white px-2.5 py-1 rounded-md" role="alert">
            {presetError}
          </p>
        ) : null}

        {student.healthyPreset === true && !flagged ? (
          <div className="text-[11.5px] bg-[var(--wz-accent)]/40 text-white px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-white/10">
            <Check className="w-3.5 h-3.5 text-[var(--wz-tint-2)] shrink-0" />
            <span>{copy.healthAllClear}</span>
          </div>
        ) : null}

        {/* §8 — the review gate, stated where the family answers rather than sprung on
            them at the payment screen. */}
        {flagged ? (
          <div className="bg-amber-500/25 border border-amber-400/50 rounded-xl p-3 flex items-start gap-2.5 text-white mt-1">
            <Clock className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5 text-[12px]">
              <span className="font-bold text-amber-200">{copy.reviewTitle}</span>
              <span className="text-[var(--wz-line)] leading-relaxed">{copy.reviewBody}</span>
            </div>
          </div>
        ) : null}
      </div>

      {schema.sections.map((section, index) => {
        const questions = section.questions.filter(
          (question) =>
            isVisible(question, student.healthAnswers) && !WIZARD_OWNED_QUESTIONS.has(question.id),
        )
        if (questions.length === 0) return null
        return (
          <fieldset
            key={section.id}
            className="p-3.5 rounded-xl bg-[var(--wz-raised)] border border-[var(--wz-tint)] flex flex-col gap-3 border-0"
          >
            <legend className="text-[14px] font-bold text-[var(--wz-heading)] px-0">
              {index + 1}. {section.title}
            </legend>
            <div className="flex flex-col gap-2 text-[13px]">
              {questions.map((question) =>
                //: **The clause is DERIVED, never typed.** `PartHealth` used to fall
                //: through to the text input below for this question type, so the family
                //: saw a box, typed nothing a server would accept, and the whole
                //: registration was refused at the final button with `answers_incomplete:
                //: clause_confirmed`. The old `DeclarationForm` rendered it correctly; this
                //: is that behaviour brought across, and it is why the wizard could not
                //: complete a registration against the real template at all.
                question.type === 'clause' ? (
                  (() => {
                    const clause = applicableClause(schema, student.healthAnswers)
                    const confirmed = student.healthAnswers[CLAUSE_QUESTION_ID] === clause
                    return (
                      // The input is a SIBLING of its label, associated by id — never
                      // nested inside it. A control nested in its own label is activated
                      // twice by one click (the control's own click, then the label
                      // forwarding it), so the box ticked and immediately unticked and the
                      // family could not get past this step at all. The radio answers above
                      // are nested and safe only because a radio ignores the second
                      // activation; a checkbox does not.
                      <div
                        key={question.id}
                        className="flex items-start gap-2 py-1"
                        data-testid="wizard-declaration-clause"
                      >
                        <input
                          id={`clause-${student.id}`}
                          type="checkbox"
                          checked={confirmed}
                          onChange={(event) =>
                            setAnswer(CLAUSE_QUESTION_ID, event.target.checked ? clause : '')
                          }
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`clause-${student.id}`}
                            className="text-[var(--wz-ink)] leading-relaxed cursor-pointer"
                          >
                            {t(locale, clauseTextKey(clause))}
                          </label>
                          {clauseError ? (
                            <span className="text-[12px] text-red-600 font-medium" role="alert">
                              {clauseError}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })()
                ) : question.type === 'boolean' ? (
                  <div
                    key={question.id}
                    className="flex items-center justify-between py-1 border-b border-[var(--wz-line)]/60 gap-2"
                  >
                    <span className="text-[var(--wz-ink)]">{question.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {[
                        { value: false, label: copy.answerNo, on: 'bg-[var(--wz-accent)] text-white font-bold', off: 'text-[var(--wz-secondary)] hover:bg-[var(--wz-line)]' },
                        { value: true, label: copy.answerYes, on: 'bg-[var(--wz-danger)] text-white font-bold', off: 'text-[var(--wz-danger)] hover:bg-[var(--wz-danger-tint)]' },
                      ].map((option) => {
                        const checked = student.healthAnswers[question.id] === option.value
                        return (
                          <label
                            key={String(option.value)}
                            className={`cursor-pointer text-[12px] font-medium flex items-center gap-1 px-2 py-0.5 rounded transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--wz-accent)] ${
                              checked ? option.on : option.off
                            }`}
                          >
                            <input
                              type="radio"
                              name={`health-${question.id}`}
                              checked={checked}
                              onChange={() => setAnswer(question.id, option.value)}
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <label key={question.id} className="flex flex-col gap-1 py-1">
                    <span className="text-[var(--wz-ink)]">{question.label}</span>
                    <input
                      type={question.type === 'phone' ? 'tel' : 'text'}
                      value={String(student.healthAnswers[question.id] ?? '')}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      className="h-10 px-3 rounded-lg bg-[var(--wz-surface)] text-[var(--wz-ink)] text-[13px] border border-[var(--wz-line-strong)] focus:border-[var(--wz-accent)] focus:outline-none"
                    />
                  </label>
                ),
              )}
            </div>
          </fieldset>
        )
      })}

      {answersError ? (
        <p className="text-[12px] text-red-600 font-medium" role="alert">
          {answersError}
        </p>
      ) : null}

      <div className="p-3.5 rounded-xl bg-[var(--wz-raised)] border border-[var(--wz-tint)] flex flex-col gap-2">
        <label htmlFor="medical-notes" className="text-[12px] font-semibold text-[var(--wz-secondary)]">
          {copy.notesLabel}
        </label>
        <textarea
          id="medical-notes"
          rows={2}
          value={student.medicalNotes}
          onChange={(event) => onChange({ medicalNotes: event.target.value })}
          placeholder={copy.notesPlaceholder}
          className="w-full p-2.5 rounded-lg bg-[var(--wz-surface)] text-[var(--wz-ink)] text-[13px] border border-[var(--wz-line-strong)] focus:border-[var(--wz-accent)] focus:outline-none resize-y"
        />
        {/* A note is NOT a review trigger. The prototype flags any non-empty note, so
            "wears glasses during fitness training" suspends a registration (§8.1). */}
        <p className="text-[11px] text-[var(--wz-tertiary)]">{copy.notesHint}</p>
      </div>
    </div>
  )
}
