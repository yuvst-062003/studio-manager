// Door A's health declaration, collapsed into one press.
//
// **Why it is on this page at all.** Spec §2: the questionnaire already has a "הכל תקין"
// preset that answers every question in one press, so only a family with something to
// declare ever sees the thirteen questions. That is cheap enough to belong on the booking
// form rather than a screen of its own -- and putting it under the same button as the rest
// closes the gap that loses leads today, where the write fires only after a signature pad
// three screens in.
//
// **No signature pad, settled by the owner 2026-09-08.** A trial writes
// `health_status = 'trial_signed'`, whose own comment in `app/services/people/trials.py`
// says it "records that it is not the full one. Converting requires the full form." So the
// press is recorded here with the parent's name and the date -- both already on this page --
// and `signature_image_base64` is always `''`. `SignaturePad` is deliberately not imported
// by anything in this feature, and the page's seam test asserts the empty string, so the pad
// cannot creep back in unnoticed.
//
// **The clause question is not rendered and not answered.** `type: 'clause'` is the club's
// signed legal sentence and `clauses.ts` is explicit that choosing one on a family's behalf
// would have the app make a legal statement for them. The sentence this page DOES show is
// `bookTrial.health.confirmed`, in the family's sight, above their own press. The drawn
// signature and the clause both stay in the join wizard's full declaration, at conversion.
//
// **The questions are data, not copy.** `TemplateQuestion.label` is the manager's own
// wording (see `healthClient.ts`) -- a studio that rewrote its questionnaire in Russian has
// a Russian questionnaire. Only the answers and the chrome come from i18n.
import { AlertCircle, Check, CheckCircle2, HeartPulse } from 'lucide-react'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isVisible } from '../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../health/healthClient'

/** What a press means. `null` is "nobody has answered yet", which is neither of the two
 *  and is what the page's own `error.health` refuses at submit. */
export type HealthPreset = 'allGood' | 'report'

export type TrialHealthState = {
  preset: HealthPreset | null
  answers: Record<string, AnswerValue>
}

/**
 * The one press, expanded into an answer for every boolean question the template holds.
 *
 * Mirrors `PartHealth`'s own `applyPreset`, including its two halves: `הכל תקין` answers
 * every question "no", and `יש מה לדווח` CLEARS them, so each is then answered
 * deliberately rather than inheriting a "no" the family never gave.
 */
export function answersForPreset(
  schema: TemplateSchema,
  preset: HealthPreset,
  previous: Record<string, AnswerValue>,
): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {}
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (question.type === 'boolean') {
        answers[question.id] = preset === 'allGood' ? false : null
        continue
      }
      // A typed answer -- the emergency number, a free note -- survives a change of
      // preset. It is not a declaration, it is a fact the family already gave us.
      if (question.type !== 'clause' && previous[question.id] !== undefined) {
        answers[question.id] = previous[question.id]!
      }
    }
  }
  return answers
}

export function TrialHealthBlock({
  locale,
  index,
  traineeName,
  declaredBy,
  declaredAt,
  schema,
  loadFailed,
  onRetry,
  state,
  onChange,
  error,
}: {
  locale: Locale
  index: number
  /** For `health.confirmed`'s `{name}` -- the sentence names who it is about. */
  traineeName: string
  /** For `health.declaredBy`'s `{name}`. Empty for a signed-in caller, who typed no name
   *  on this form; the line then carries the date alone. */
  declaredBy: string
  declaredAt: Date
  schema: TemplateSchema | null
  loadFailed: boolean
  onRetry: () => void
  state: TrialHealthState
  onChange: (next: TrialHealthState) => void
  error: string | null
}) {
  const press = (preset: HealthPreset) => {
    if (!schema) return
    onChange({ preset, answers: answersForPreset(schema, preset, state.answers) })
  }

  const setAnswer = (id: string, value: AnswerValue) => {
    onChange({ ...state, answers: { ...state.answers, [id]: value } })
  }

  return (
    <section
      aria-labelledby={`trial-health-title-${index}`}
      className="p-3.5 rounded-xl bg-[#0d2c6c] text-white flex flex-col gap-2.5 shadow-sm"
      data-testid={`trial-health-${index}`}
    >
      <div className="flex items-center gap-2">
        <HeartPulse aria-hidden className="w-5 h-5 text-[#dae1ff]" />
        <h4 className="text-[16px] font-bold" id={`trial-health-title-${index}`}>
          {t(locale, 'people.bookTrial.health.title')}
        </h4>
      </div>
      <p className="text-[12px] text-[#dee2f4] leading-relaxed">
        {t(locale, 'people.bookTrial.health.lede')}
      </p>

      {loadFailed ? (
        <div className="flex flex-col gap-2" data-testid={`trial-health-failed-${index}`}>
          <p className="text-[12.5px] bg-[#ba1a1a]/50 text-white px-2.5 py-1 rounded-md" role="alert">
            {t(locale, 'health.declaration.error')}
          </p>
          <button
            className="self-start px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[13px] font-bold transition-colors cursor-pointer"
            data-testid={`trial-health-retry-${index}`}
            onClick={onRetry}
            type="button"
          >
            {t(locale, 'common.loadFailed.retry')}
          </button>
        </div>
      ) : !schema ? (
        <p className="text-[12.5px] text-[#dee2f4]">{t(locale, 'health.declaration.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <button
              aria-pressed={state.preset === 'allGood'}
              className={`py-2.5 px-3 rounded-lg text-[13.5px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                state.preset === 'allGood'
                  ? 'bg-[#0056c5] text-white shadow-xs ring-2 ring-white/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              data-testid={`trial-health-allgood-${index}`}
              onClick={() => press('allGood')}
              type="button"
            >
              <CheckCircle2 aria-hidden className="w-4 h-4" />
              <span>{t(locale, 'people.bookTrial.health.allGood')}</span>
            </button>
            <button
              aria-pressed={state.preset === 'report'}
              className={`py-2.5 px-3 rounded-lg text-[13.5px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                state.preset === 'report'
                  ? 'bg-[#ba1a1a] text-white font-bold ring-2 ring-white/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              data-testid={`trial-health-report-${index}`}
              onClick={() => press('report')}
              type="button"
            >
              <AlertCircle aria-hidden className="w-4 h-4" />
              <span>{t(locale, 'people.bookTrial.health.report')}</span>
            </button>
          </div>

          {state.preset === 'allGood' ? (
            <p
              className="text-[12px] bg-[#0056c5]/40 text-white px-2.5 py-1.5 rounded-md flex items-center gap-1.5 border border-white/10"
              data-testid={`trial-health-confirmed-${index}`}
            >
              <Check aria-hidden className="w-3.5 h-3.5 text-[#dae1ff] shrink-0" />
              <span>
                {t(locale, 'people.bookTrial.health.confirmed').replace('{name}', traineeName)}
              </span>
            </p>
          ) : null}

          {/* The thirteen questions, on screen only for a family that has something to
              declare. `isVisible` keeps the template's own progressive disclosure -- a
              detail field appears under the "yes" that reveals it. */}
          {state.preset === 'report' ? (
            <div className="flex flex-col gap-2.5" data-testid={`trial-health-questions-${index}`}>
              {(schema.sections ?? []).map((section) => {
                const questions = (section.questions ?? []).filter(
                  (question) =>
                    question.type !== 'clause' && isVisible(question, state.answers),
                )
                if (questions.length === 0) return null
                return (
                  <div
                    className="rounded-xl bg-white/10 border border-white/10 p-3 flex flex-col gap-2"
                    key={section.id}
                  >
                    {section.title ? (
                      <p className="text-[13px] font-bold text-[#dae1ff]">{section.title}</p>
                    ) : null}
                    {questions.map((question) =>
                      question.type === 'boolean' ? (
                        <fieldset
                          className="flex items-center justify-between gap-2 py-1 border-b border-white/10 last:border-b-0"
                          key={question.id}
                        >
                          <legend className="sr-only">{question.label}</legend>
                          <span aria-hidden className="text-[13px]">
                            {question.label}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {[
                              { value: false, label: t(locale, 'health.declaration.no') },
                              { value: true, label: t(locale, 'health.declaration.yes') },
                            ].map((option) => {
                              const checked = state.answers[question.id] === option.value
                              return (
                                <label
                                  className={`cursor-pointer text-[12.5px] font-semibold px-2.5 py-1 rounded-md transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white ${
                                    checked
                                      ? 'bg-white text-[#0d2c6c]'
                                      : 'bg-white/10 text-white hover:bg-white/20'
                                  }`}
                                  key={String(option.value)}
                                >
                                  <input
                                    checked={checked}
                                    className="sr-only"
                                    name={`trial-health-${index}-${question.id}`}
                                    onChange={() => setAnswer(question.id, option.value)}
                                    type="radio"
                                  />
                                  {option.label}
                                </label>
                              )
                            })}
                          </div>
                        </fieldset>
                      ) : (
                        <label className="flex flex-col gap-1 py-1" key={question.id}>
                          <span className="text-[12.5px] text-[#dee2f4]">{question.label}</span>
                          <input
                            className="h-10 px-3 rounded-lg bg-white text-[#161b28] text-[13px] border border-transparent focus:border-[#0056c5] focus:outline-none"
                            dir={question.type === 'phone' ? 'ltr' : undefined}
                            onChange={(event) => setAnswer(question.id, event.target.value)}
                            type={question.type === 'phone' ? 'tel' : 'text'}
                            value={String(state.answers[question.id] ?? '')}
                          />
                        </label>
                      ),
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Who declared it and when, in place of a drawn signature. Rendered only when a
              name was typed on this form: a signed-in caller declares under the identity
              the server verified, and a line that opened with a bare `·` would be reading
              as though a name had gone missing. */}
          {state.preset !== null && declaredBy !== '' ? (
            <p
              className="text-[11.5px] text-[#dee2f4]"
              data-testid={`trial-health-declared-${index}`}
            >
              {t(locale, 'people.bookTrial.health.declaredBy')
                .replace('{name}', declaredBy)
                .replace('{date}', formatDateInStudioZone(declaredAt, locale))}
            </p>
          ) : null}
        </>
      )}

      {error ? (
        <p
          className="text-[12px] bg-[#ba1a1a]/50 text-white px-2.5 py-1 rounded-md"
          data-testid={`trial-health-error-${index}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
