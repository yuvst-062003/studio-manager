// §4 -- the family list. Thin by design: the work happens in the sheet it opens.
import { useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit2,
  Mail,
  Plus,
  School,
  ShieldCheck,
  Swords,
  Trash2,
  Users,
} from 'lucide-react'
import type { TemplateSchema } from '../../health/healthClient'
import { StudentFormSheet } from './StudentFormSheet'
import { GRADE_OPTIONS, BELT_OPTIONS, STEP2_COPY } from './content'
import { clearStudentDraft, isResumable, loadStudentDraft } from './draft'
import { ageFrom, isMinor, needsManagerReview } from './types'
import type { FormPart, StudentDraft, WizardGroup, WizardPlan } from './types'

const labelFrom = (
  options: readonly { value: string; label: string }[],
  value: string,
): string => options.find((option) => option.value === value)?.label ?? ''

const formatBirthDate = (value: string) =>
  value ? value.split('-').reverse().join('/') : ''

export type Step2TraineesProps = {
  students: readonly StudentDraft[]
  onStudentsChange: (students: StudentDraft[]) => void
  groups: readonly WizardGroup[]
  plans: readonly WizardPlan[]
  healthSchema: TemplateSchema
  onBack: () => void
  onContinue: () => void
}

export function Step2Trainees({
  students,
  onStudentsChange,
  groups,
  plans,
  healthSchema,
  onBack,
  onContinue,
}: Step2TraineesProps) {
  const copy = STEP2_COPY
  const [sheet, setSheet] = useState<{ initial: StudentDraft | null; part: FormPart } | null>(null)
  const [draft, setDraft] = useState(() => loadStudentDraft())
  const [removeError, setRemoveError] = useState<string | null>(null)

  const showDraftCard = draft !== null && isResumable(draft.student) && sheet === null

  const save = (saved: StudentDraft) => {
    const exists = students.some((student) => student.id === saved.id)
    onStudentsChange(
      exists
        ? students.map((student) => (student.id === saved.id ? saved : student))
        : [...students, saved],
    )
    setDraft(null)
  }

  const remove = (id: string) => {
    if (students.length <= 1) {
      // Inline, not `alert()`. The prototype uses a browser dialog for this.
      setRemoveError(copy.cannotRemoveLast)
      return
    }
    setRemoveError(null)
    onStudentsChange(students.filter((student) => student.id !== id))
  }

  return (
    <div className="tw-scope flex flex-col w-full pb-28" data-testid="join-family-step">
      <div className="flex flex-col gap-1.5 mt-2 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e3e7fa] text-[#0d2c6c] text-[12px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#0056c5]" />
            <span>{copy.seasonPill}</span>
          </div>
        </div>
        <h2 className="text-[22px] sm:text-[24px] font-bold text-[#161b28] tracking-tight mt-1">
          {copy.heading}
        </h2>
        <p className="text-[14px] text-[#444650] leading-relaxed">{copy.lead}</p>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold text-[#161b28]">{copy.registered}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#dae1ff] text-[#001849] text-[12px] font-bold">
              {students.length}
            </span>
          </div>
          {students.length > 0 ? (
            <span className="text-[12px] text-[#0056c5] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {copy.readyForNext}
            </span>
          ) : null}
        </div>

        {students.map((student) => {
          const minor = isMinor(student.birthDate)
          const age = ageFrom(student.birthDate)
          const flagged = needsManagerReview(student)
          return (
            <div
              key={student.id}
              className="relative overflow-hidden rounded-xl bg-white p-4 shadow-xs border border-[#dee2f4] hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl bg-[#e3e7fa] flex items-center justify-center shrink-0 text-[#0d2c6c]">
                    <Swords className="w-6 h-6" />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[17px] font-bold text-[#161b28] truncate">
                        {student.firstName} {student.lastName}
                      </h3>
                      {student.beltId ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#e9edff] text-[#0056c5] text-[11px] font-semibold">
                          {labelFrom(BELT_OPTIONS, student.beltId)}
                        </span>
                      ) : null}
                      {flagged ? (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-700" />
                          <span>{copy.awaitingReview}</span>
                        </span>
                      ) : (
                        // The number, formatted once. The prototype's helper returns
                        // " (בן 11)" and the caller wraps it again — `קטין (גיל  (בן 11))`.
                        <span className="px-2 py-0.5 rounded-md bg-[#d9e2ff] text-[#001945] text-[11px] font-semibold">
                          {minor ? copy.minor : copy.adult}
                          {Number.isFinite(age) ? ` (${copy.age} ${age})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-[#444650] text-[12px] flex-wrap">
                      {student.grade ? (
                        <>
                          <span className="flex items-center gap-1">
                            <School className="w-3.5 h-3.5 text-[#0056c5]" />
                            <span>{labelFrom(GRADE_OPTIONS, student.grade)}</span>
                          </span>
                          <span aria-hidden>•</span>
                        </>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#0056c5]" />
                        <span>{formatBirthDate(student.birthDate)}</span>
                      </span>
                      <span aria-hidden>•</span>
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-[#0056c5]" />
                        <span>
                          {copy.nationalIdShort} {student.nationalId}
                        </span>
                      </span>
                      {student.email ? (
                        <>
                          <span aria-hidden>•</span>
                          <span className="flex items-center gap-1 text-[#0056c5]" dir="ltr">
                            <Mail className="w-3.5 h-3.5" />
                            <span>{student.email}</span>
                          </span>
                        </>
                      ) : null}
                    </div>

                    {flagged ? (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{copy.awaitingReviewNote}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`${copy.edit}: ${student.firstName}`}
                    onClick={() => setSheet({ initial: student, part: 1 })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#444650] hover:bg-[#e9edff] hover:text-[#001849] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${copy.remove}: ${student.firstName}`}
                    onClick={() => remove(student.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#444650] hover:bg-[#ffdad6] hover:text-[#ba1a1a] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {minor ? (
                <div className="mt-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#f2f3ff] p-2.5 rounded-lg text-[#161b28] text-[12px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Users className="w-4 h-4 text-[#0056c5] shrink-0" />
                    <span className="text-[#444650]">{copy.guardian}:</span>
                    <span className="font-semibold truncate">
                      {student.guardianFirstName} {student.guardianLastName}
                      {student.guardianPhone ? ` (${student.guardianPhone})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-[#0056c5] shrink-0" />
                    <span className="text-[#444650]">{copy.pickup}:</span>
                    <span className="font-semibold truncate">
                      {student.pickup.parentOnly ? copy.pickupParentsOnly : student.pickup.extraName}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 bg-[#f2f3ff] p-2.5 rounded-lg text-[#001849] text-[12px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#0056c5] shrink-0" />
                    <span className="font-semibold">{copy.adultRow}</span>
                  </div>
                  <span className="text-[#0056c5] font-bold">18+</span>
                </div>
              )}
            </div>
          )
        })}

        {removeError ? (
          <p className="text-[12px] text-[#ba1a1a] font-medium px-1" role="alert">
            {removeError}
          </p>
        ) : null}

        {showDraftCard && draft ? (
          <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-[#e9edff] border border-emerald-300/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[13px] shadow-xs mt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[#161b28] font-bold">{copy.draftTitle}</span>
                <span className="text-[12px] text-[#444650]">
                  {draft.student.firstName || '—'} • {draft.part}/5
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSheet({ initial: draft.student, part: draft.part })}
                className="px-3.5 py-1.5 bg-[#0056c5] hover:bg-[#0d2c6c] text-white rounded-lg text-[12px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                {copy.draftResume}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearStudentDraft()
                  setDraft(null)
                }}
                className="px-2.5 py-1.5 text-[#ba1a1a] hover:bg-red-100/50 rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
              >
                {copy.draftDiscard}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setSheet({ initial: null, part: 1 })}
          className="group w-full py-3.5 px-4 rounded-xl text-[#0056c5] border-2 border-dashed bg-white hover:bg-[#f2f3ff] border-[#0056c5]/30 hover:border-[#0056c5] flex items-center justify-center gap-2.5 transition-all duration-200 mt-1 shadow-2xs active:scale-[0.99] cursor-pointer"
        >
          <span className="w-7 h-7 rounded-full bg-[#d9e2ff] flex items-center justify-center text-[#0056c5] group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4 stroke-[3]" />
          </span>
          <span className="text-[15px] font-bold">{copy.addStudent}</span>
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#faf8ff]/95 backdrop-blur-md border-t border-[#dee2f4] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] py-3 px-4">
        <div className="max-w-[480px] mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-12 px-4 rounded-xl bg-[#e9edff] hover:bg-[#dee2f4] text-[#001849] text-[15px] font-semibold flex items-center justify-center gap-1 transition-colors shrink-0 cursor-pointer"
          >
            {copy.back}
          </button>
          <button
            type="button"
            disabled={students.length === 0}
            onClick={onContinue}
            className={`flex-1 h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99] ${
              students.length === 0
                ? 'bg-[#dee2f4] text-[#757681] cursor-not-allowed'
                : 'bg-[#001849] hover:bg-[#0056c5] text-white shadow-md cursor-pointer'
            }`}
          >
            <span>{copy.continueToStep3}</span>
          </button>
        </div>
      </div>

      {sheet ? (
        <StudentFormSheet
          initial={sheet.initial}
          initialPart={sheet.part}
          groups={groups}
          plans={plans}
          healthSchema={healthSchema}
          familyDefaults={
            students[0]
              ? {
                  // §5.6 — asked once, applied to every child, overridable per child.
                  emergencyPhone: students[0].emergencyPhone,
                  guardianFirstName: students[0].guardianFirstName,
                  guardianLastName: students[0].guardianLastName,
                  guardianNationalId: students[0].guardianNationalId,
                  guardianPhone: students[0].guardianPhone,
                  guardianEmail: students[0].guardianEmail,
                  address: students[0].address,
                  city: students[0].city,
                }
              : undefined
          }
          onSave={save}
          onClose={() => {
            setSheet(null)
            setDraft(loadStudentDraft())
          }}
        />
      ) : null}
    </div>
  )
}
