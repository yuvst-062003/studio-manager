// §5.1 -- the five-part sheet, and the orchestration around it.
//
// Four behaviours the prototype does not have:
//   * ENTER does not submit. The prototype wraps all five parts in one <form>, so Enter in
//     any part-1 field fires the save and jumps validation to parts 4 and 5 (§14.2).
//   * A dirty form confirms before it is discarded. Backdrop click in EDIT mode writes no
//     draft, so every edit is lost silently.
//   * The draft expires -- see draft.ts.
//   * The dialog traps focus, closes on Escape and restores focus -- see useDialog.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, HeartPulse, PenTool, Swords, User, X } from 'lucide-react'
import type { TemplateSchema } from '../../health/healthClient'
import { useDialog } from './useDialog'
import { PartDetails } from './parts/PartDetails'
import { PartGroup } from './parts/PartGroup'
import { PartPlan } from './parts/PartPlan'
import { PartHealth } from './parts/PartHealth'
import { PartSignature } from './parts/PartSignature'
import { STUDENT_FORM_COPY } from './content'
import { clearStudentDraft, saveStudentDraft } from './draft'
import { emptyStudent } from './types'
import type { FormPart, StudentDraft, WizardGroup, WizardPlan } from './types'
import { VALIDATION_COPY, fieldError, partErrors } from './validation'
import type { FieldKey } from './validation'

const PART_META: Record<FormPart, { title: string; next: string; tab: string; Icon: typeof User }> = {
  1: { title: STUDENT_FORM_COPY.part1Title, next: STUDENT_FORM_COPY.next1, tab: STUDENT_FORM_COPY.tab1, Icon: User },
  2: { title: STUDENT_FORM_COPY.part2Title, next: STUDENT_FORM_COPY.next2, tab: STUDENT_FORM_COPY.tab2, Icon: Swords },
  3: { title: STUDENT_FORM_COPY.part3Title, next: STUDENT_FORM_COPY.next3, tab: STUDENT_FORM_COPY.tab3, Icon: CreditCard },
  4: { title: STUDENT_FORM_COPY.part4Title, next: STUDENT_FORM_COPY.next4, tab: STUDENT_FORM_COPY.tab4, Icon: HeartPulse },
  5: { title: STUDENT_FORM_COPY.part5Title, next: STUDENT_FORM_COPY.save, tab: STUDENT_FORM_COPY.tab5, Icon: PenTool },
}

const PARTS: readonly FormPart[] = [1, 2, 3, 4, 5]

export type StudentFormSheetProps = {
  initial: StudentDraft | null
  initialPart?: FormPart
  groups: readonly WizardGroup[]
  plans: readonly WizardPlan[]
  healthSchema: TemplateSchema
  /** Applied to a NEW child only, so the family types it once (§5.6). */
  familyDefaults?: Partial<StudentDraft>
  onSave: (student: StudentDraft) => void
  onClose: () => void
}

export function StudentFormSheet({
  initial,
  initialPart = 1,
  groups,
  plans,
  healthSchema,
  familyDefaults,
  onSave,
  onClose,
}: StudentFormSheetProps) {
  const isEditing = initial !== null && initial.firstName !== ''
  const [student, setStudent] = useState<StudentDraft>(
    () => initial ?? emptyStudent(`student-${Date.now()}`, familyDefaults),
  )
  const [part, setPart] = useState<FormPart>(initialPart)
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [attempted, setAttempted] = useState<Partial<Record<FormPart, boolean>>>({})
  const [showWarning, setShowWarning] = useState(false)
  const [dirty, setDirty] = useState(false)

  const questionIds = useMemo(
    () =>
      healthSchema.sections.flatMap((section) =>
        section.questions.filter((question) => question.type === 'boolean').map((q) => q.id),
      ),
    [healthSchema],
  )

  const requestClose = useCallback(() => {
    // A dirty EDIT has no draft behind it, so discarding it loses the work outright.
    if (dirty && isEditing && !window.confirm(STUDENT_FORM_COPY.cancel + '?')) return
    onClose()
  }, [dirty, isEditing, onClose])

  const dialogRef = useDialog(true, requestClose)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Autosave -- ADDING only. Writing a draft while editing an existing child would
  // overwrite the half-finished draft of a different one.
  useEffect(() => {
    if (isEditing || !dirty) return
    saveStudentDraft(student, part)
  }, [student, part, isEditing, dirty])

  const change = (patch: Partial<StudentDraft>) => {
    setDirty(true)
    setStudent((previous) => ({ ...previous, ...patch }))
  }

  const errorFor = (field: FieldKey): string | null => {
    const shown = touched[field] || attempted[part]
    if (!shown) return null
    return fieldError(student, field, questionIds)
  }

  const blurField = (field: FieldKey) => setTouched((previous) => ({ ...previous, [field]: true }))

  const partHasErrors = (target: FormPart) =>
    partErrors(student, target, questionIds).length > 0

  const validate = (target: FormPart): boolean => {
    const errors = partErrors(student, target, questionIds)
    if (errors.length === 0) {
      setShowWarning(false)
      return true
    }
    setAttempted((previous) => ({ ...previous, [target]: true }))
    setShowWarning(true)
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    return false
  }

  const goTo = (target: FormPart) => {
    // Backwards is free; forwards validates. Same rule the step pills follow.
    if (target <= part) {
      setShowWarning(false)
      setPart(target)
      return
    }
    if (!validate(part)) return
    setPart(target)
  }

  const submit = () => {
    for (const target of PARTS) {
      if (!validate(target)) {
        setPart(target)
        return
      }
    }
    if (!isEditing) clearStudentDraft()
    onSave(student)
    onClose()
  }

  const meta = PART_META[part]

  return (
    <div
      className="tw-scope fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? STUDENT_FORM_COPY.editTitle : STUDENT_FORM_COPY.addTitle}
        tabIndex={-1}
        className="relative w-full max-w-[490px] bg-white rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden focus:outline-none"
      >
        <div className="w-12 h-1.5 bg-[#dee2f4] rounded-full mx-auto mt-2.5 sm:hidden" />

        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-[#e9edff]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0d2c6c] text-white flex items-center justify-center shadow-xs shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="text-[18px] font-bold text-[#161b28] truncate">
                {isEditing ? STUDENT_FORM_COPY.editTitle : STUDENT_FORM_COPY.addTitle}
              </h3>
              <span className="text-[12px] text-[#444650] font-medium truncate">{meta.title}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label={STUDENT_FORM_COPY.close}
            className="w-9 h-9 rounded-full bg-[#e9edff] flex items-center justify-center text-[#444650] hover:text-[#161b28] hover:bg-[#dee2f4] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#f2f3ff] px-3 py-2 border-b border-[#e9edff]">
          <div className="grid grid-cols-5 gap-1">
            {PARTS.map((target) => {
              const { Icon, tab } = PART_META[target]
              const failed = attempted[target] && partHasErrors(target)
              return (
                <button
                  key={target}
                  type="button"
                  aria-current={part === target ? 'step' : undefined}
                  onClick={() => goTo(target)}
                  className={`relative flex flex-col items-center gap-1 py-1.5 px-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    part === target
                      ? 'bg-[#0d2c6c] text-white shadow-xs'
                      : part > target
                        ? 'bg-[#0056c5]/15 text-[#0056c5]'
                        : 'bg-white text-[#444650]'
                  }`}
                >
                  {failed ? (
                    <span className="absolute top-1 end-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
                  ) : null}
                  <Icon className="w-4 h-4" />
                  <span className="truncate">{tab}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Not a <form>: Enter must not submit from part 1. */}
        <div ref={bodyRef} className="overflow-y-auto p-4 sm:p-5 flex-1 flex flex-col gap-4">
          {part === 1 ? (
            <PartDetails student={student} onChange={change} errorFor={errorFor} onBlurField={blurField} />
          ) : null}
          {part === 2 ? (
            <PartGroup
              groups={groups}
              selectedId={student.groupId}
              onSelect={(groupId) => change({ groupId })}
              error={errorFor('groupId')}
            />
          ) : null}
          {part === 3 ? (
            <PartPlan
              plans={plans}
              selectedId={student.planId}
              onSelect={(planId) => change({ planId })}
              error={errorFor('planId')}
            />
          ) : null}
          {part === 4 ? (
            <PartHealth
              schema={healthSchema}
              student={student}
              onChange={change}
              presetError={errorFor('healthPreset')}
              answersError={errorFor('healthAnswers')}
            />
          ) : null}
          {part === 5 ? (
            <PartSignature student={student} onChange={change} errorFor={errorFor} onBlurField={blurField} />
          ) : null}

          {showWarning ? (
            <div className="p-3 rounded-xl bg-red-50 border-2 border-red-400 flex items-center gap-2.5 text-red-900" role="alert">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div className="flex flex-col text-[12.5px]">
                <span className="font-bold">{VALIDATION_COPY.stepHasErrorsTitle}</span>
                <span className="text-red-700">{VALIDATION_COPY.stepHasErrorsBody}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-white border-t border-[#e9edff]">
          {part > 1 ? (
            <button
              type="button"
              onClick={() => setPart((previous) => (previous > 1 ? ((previous - 1) as FormPart) : previous))}
              className="h-12 px-4 rounded-xl bg-[#e9edff] text-[#444650] hover:bg-[#dee2f4] text-[14px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
              <span>{STUDENT_FORM_COPY.previous}</span>
            </button>
          ) : null}

          {part < 5 ? (
            <button
              type="button"
              onClick={() => goTo((part + 1) as FormPart)}
              className="flex-1 h-12 rounded-xl bg-[#001849] hover:bg-[#0056c5] text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer"
            >
              <span className="truncate">{meta.next}</span>
              <ChevronLeft className="w-5 h-5 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              className="flex-1 h-12 rounded-xl bg-[#0056c5] hover:bg-[#001849] text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="truncate">{STUDENT_FORM_COPY.save}</span>
            </button>
          )}

          <button
            type="button"
            onClick={requestClose}
            className="h-12 px-3 sm:px-4 rounded-xl bg-[#e9edff] text-[#444650] hover:bg-[#dee2f4] text-[13px] font-medium transition-colors cursor-pointer shrink-0"
          >
            {STUDENT_FORM_COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
