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
import { isVisible } from '../../../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../../../health/healthClient'
import { STUDENT_FORM_COPY } from '../content'
import { needsManagerReview } from '../types'
import type { StudentDraft } from '../types'

export function PartHealth({
  schema,
  student,
  onChange,
  presetError,
  answersError,
}: {
  schema: TemplateSchema
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  presetError: string | null
  answersError: string | null
}) {
  const copy = STUDENT_FORM_COPY
  const flagged = needsManagerReview(student)

  const setAnswer = (id: string, value: AnswerValue) => {
    const answers = { ...student.healthAnswers, [id]: value }
    //: A "yes" anywhere means the family is telling us about a limitation, so the preset
    //: follows the answers rather than fighting them.
    const anyYes = Object.values(answers).some((entry) => entry === true)
    onChange({ healthAnswers: answers, healthyPreset: anyYes ? false : student.healthyPreset })
  }

  const applyPreset = (healthy: boolean) => {
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
      <div className="p-3.5 rounded-xl bg-[#0d2c6c] text-white flex flex-col gap-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-[#dae1ff]" />
          <span className="text-[16px] font-bold">{copy.healthTitle}</span>
        </div>
        <p className="text-[12px] text-[#dee2f4] leading-relaxed">{copy.healthQuestion}</p>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            aria-pressed={student.healthyPreset === true}
            onClick={() => applyPreset(true)}
            className={`py-2 px-3 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              student.healthyPreset === true
                ? 'bg-[#0056c5] text-white shadow-xs ring-2 ring-white/50'
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
                ? 'bg-[#ba1a1a] text-white font-bold ring-2 ring-white/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>{copy.healthNo}</span>
          </button>
        </div>

        {presetError ? (
          <p className="text-[11.5px] bg-[#ba1a1a]/50 text-white px-2.5 py-1 rounded-md" role="alert">
            {presetError}
          </p>
        ) : null}

        {student.healthyPreset === true && !flagged ? (
          <div className="text-[11.5px] bg-[#0056c5]/40 text-white px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-white/10">
            <Check className="w-3.5 h-3.5 text-[#dae1ff] shrink-0" />
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
              <span className="text-[#dee2f4] leading-relaxed">{copy.reviewBody}</span>
            </div>
          </div>
        ) : null}
      </div>

      {schema.sections.map((section, index) => {
        const questions = section.questions.filter((question) =>
          isVisible(question, student.healthAnswers),
        )
        if (questions.length === 0) return null
        return (
          <fieldset
            key={section.id}
            className="p-3.5 rounded-xl bg-[#f2f3ff] border border-[#e9edff] flex flex-col gap-3 border-0"
          >
            <legend className="text-[14px] font-bold text-[#001849] px-0">
              {index + 1}. {section.title}
            </legend>
            <div className="flex flex-col gap-2 text-[13px]">
              {questions.map((question) =>
                question.type === 'boolean' ? (
                  <div
                    key={question.id}
                    className="flex items-center justify-between py-1 border-b border-[#dee2f4]/60 gap-2"
                  >
                    <span className="text-[#161b28]">{question.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {[
                        { value: false, label: copy.answerNo, on: 'bg-[#0056c5] text-white font-bold', off: 'text-[#444650] hover:bg-[#dee2f4]' },
                        { value: true, label: copy.answerYes, on: 'bg-[#ba1a1a] text-white font-bold', off: 'text-[#ba1a1a] hover:bg-[#ffdad6]' },
                      ].map((option) => {
                        const checked = student.healthAnswers[question.id] === option.value
                        return (
                          <label
                            key={String(option.value)}
                            className={`cursor-pointer text-[12px] font-medium flex items-center gap-1 px-2 py-0.5 rounded transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
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
                    <span className="text-[#161b28]">{question.label}</span>
                    <input
                      type={question.type === 'phone' ? 'tel' : 'text'}
                      value={String(student.healthAnswers[question.id] ?? '')}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      className="h-10 px-3 rounded-lg bg-white text-[#161b28] text-[13px] border border-[#c5c6d2] focus:border-[#0056c5] focus:outline-none"
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

      <div className="p-3.5 rounded-xl bg-[#f2f3ff] border border-[#e9edff] flex flex-col gap-2">
        <label htmlFor="medical-notes" className="text-[12px] font-semibold text-[#444650]">
          {copy.notesLabel}
        </label>
        <textarea
          id="medical-notes"
          rows={2}
          value={student.medicalNotes}
          onChange={(event) => onChange({ medicalNotes: event.target.value })}
          placeholder={copy.notesPlaceholder}
          className="w-full p-2.5 rounded-lg bg-white text-[#161b28] text-[13px] border border-[#c5c6d2] focus:border-[#0056c5] focus:outline-none resize-y"
        />
        {/* A note is NOT a review trigger. The prototype flags any non-empty note, so
            "wears glasses during fitness training" suspends a registration (§8.1). */}
        <p className="text-[11px] text-[#757681]">{copy.notesHint}</p>
      </div>
    </div>
  )
}
