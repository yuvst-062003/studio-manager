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
  Sparkles,
  Swords,
  Trash2,
  Users,
} from 'lucide-react'
import type { Locale } from '@studio/i18n'
import type { TemplateSchema } from '../../health/healthClient'
import { StudentFormSheet } from './StudentFormSheet'
import { gradeOptions, beltOptions, step2Copy } from './copy'
import { clearStudentDraft, isResumable, loadStudentDraft } from './draft'
import { ageFrom, isMinor, needsManagerReview } from './types'
import type { FormPart, StudentDraft, WizardBelt, WizardGroup, WizardPlan } from './types'

const labelFrom = (
  options: readonly { value: string; label: string }[],
  value: string,
): string => options.find((option) => option.value === value)?.label ?? ''

const formatBirthDate = (value: string) =>
  value ? value.split('-').reverse().join('/') : ''

export type Step2TraineesProps = {
  locale: Locale
  students: readonly StudentDraft[]
  onStudentsChange: (students: StudentDraft[]) => void
  groups: readonly WizardGroup[]
  /** Bug #10 — the club's own belt ladder. Threaded to the form sheet, and read here for
   *  the chip on each trainee row. */
  belts: readonly WizardBelt[]
  plans: readonly WizardPlan[]
  healthSchema: TemplateSchema
  /** Seeds the FIRST child this run adds -- door C's manager-supplied stub name. Applied
   *  only while the list is empty and no saved draft is being resumed: it is a starting
   *  point for the first row, never a value that reappears on the second child. */
  firstStudentDefaults?: Partial<StudentDraft>
  /** Task 10 item 4 -- threaded straight through to the student form's save.
   *  `undefined` on door B, which has no session for the `/me/*` read it needs. */
  checkDuplicate?: (firstName: string, lastName: string, birthDate: string) => Promise<boolean>
  onBack: () => void
  onContinue: () => void
}

export function Step2Trainees({
  locale,
  students,
  onStudentsChange,
  groups,
  plans,
  belts,
  healthSchema,
  firstStudentDefaults,
  checkDuplicate,
  onBack,
  onContinue,
}: Step2TraineesProps) {
  const copy = step2Copy(locale)
  const BELT_OPTIONS = beltOptions(belts)
  const GRADE_OPTIONS = gradeOptions(locale)
  //: `intent` rides on the sheet because it is chosen by WHICH button opened it — a
  //: child added through "שיעור ניסיון" is a trial from the first keystroke, rather
  //: than a member who is asked at the payment step how they would like to pay for
  //: something that costs nothing (owner's correction, 2026-09-11).
  const [sheet, setSheet] = useState<{
    initial: StudentDraft | null
    part: FormPart
    intent?: 'join' | 'trial'
  } | null>(null)
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
    <div className="tw-scope flex flex-col w-full pb-[calc(7rem+env(safe-area-inset-bottom,0px))]" data-testid="join-family-step">
      <div className="flex flex-col gap-1.5 mt-2 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--wz-tint-4)] text-[var(--wz-chip-fg)] text-[12px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--wz-accent)]" />
            <span>{copy.seasonPill}</span>
          </div>
        </div>
        <h2 className="text-[22px] sm:text-[24px] font-bold text-[var(--wz-ink)] tracking-tight mt-1">
          {copy.heading}
        </h2>
        <p className="text-[14px] text-[var(--wz-secondary)] leading-relaxed">{copy.lead}</p>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold text-[var(--wz-ink)]">{copy.registered}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--wz-tint-2)] text-[var(--wz-heading)] text-[12px] font-bold">
              {students.length}
            </span>
          </div>
          {students.length > 0 ? (
            <span className="text-[12px] text-[var(--wz-accent)] font-semibold flex items-center gap-1">
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
              className="relative overflow-hidden rounded-xl bg-[var(--wz-surface)] p-4 shadow-xs border border-[var(--wz-line)] hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl bg-[var(--wz-tint-4)] flex items-center justify-center shrink-0 text-[var(--wz-chip-fg)]">
                    <Swords className="w-6 h-6" />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[17px] font-bold text-[var(--wz-ink)] truncate">
                        {student.firstName} {student.lastName}
                      </h3>
                      {student.beltId ? (
                        <span className="px-2 py-0.5 rounded-md bg-[var(--wz-tint)] text-[var(--wz-accent)] text-[11px] font-semibold">
                          {labelFrom(BELT_OPTIONS, student.beltId)}
                        </span>
                      ) : null}
                      {/* Said on the child's own row, because it is the one fact that
                          changes what happens to them: no plan is charged and step 3
                          never asks about them. */}
                      {student.intent === 'trial' ? (
                        <span
                          className="px-2 py-0.5 rounded-md bg-[var(--wz-tint-3)] text-[var(--wz-chip-fg)] text-[11px] font-bold flex items-center gap-1"
                          data-testid="step2-trial-chip"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{copy.trialChip}</span>
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
                        <span className="px-2 py-0.5 rounded-md bg-[var(--wz-tint-3)] text-[var(--wz-chip-fg)] text-[11px] font-semibold">
                          {minor ? copy.minor : copy.adult}
                          {Number.isFinite(age) ? ` (${copy.age} ${age})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-[var(--wz-secondary)] text-[12px] flex-wrap">
                      {student.grade ? (
                        <>
                          <span className="flex items-center gap-1">
                            <School className="w-3.5 h-3.5 text-[var(--wz-accent)]" />
                            <span>{labelFrom(GRADE_OPTIONS, student.grade)}</span>
                          </span>
                          <span aria-hidden>•</span>
                        </>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[var(--wz-accent)]" />
                        <span>{formatBirthDate(student.birthDate)}</span>
                      </span>
                      <span aria-hidden>•</span>
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-[var(--wz-accent)]" />
                        <span>
                          {copy.nationalIdShort} {student.nationalId}
                        </span>
                      </span>
                      {student.email ? (
                        <>
                          <span aria-hidden>•</span>
                          <span className="flex items-center gap-1 text-[var(--wz-accent)]" dir="ltr">
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
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--wz-secondary)] hover:bg-[var(--wz-tint)] hover:text-[var(--wz-heading)] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${copy.remove}: ${student.firstName}`}
                    onClick={() => remove(student.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--wz-secondary)] hover:bg-[var(--wz-danger-tint)] hover:text-[var(--wz-danger)] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {minor ? (
                <div className="mt-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[var(--wz-raised)] p-2.5 rounded-lg text-[var(--wz-ink)] text-[12px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Users className="w-4 h-4 text-[var(--wz-accent)] shrink-0" />
                    <span className="text-[var(--wz-secondary)]">{copy.guardian}:</span>
                    <span className="font-semibold truncate">
                      {student.guardianFirstName} {student.guardianLastName}
                      {student.guardianPhone ? ` (${student.guardianPhone})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-[var(--wz-accent)] shrink-0" />
                    <span className="text-[var(--wz-secondary)]">{copy.pickup}:</span>
                    <span className="font-semibold truncate">
                      {student.pickup.parentOnly ? copy.pickupParentsOnly : student.pickup.extraName}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 bg-[var(--wz-raised)] p-2.5 rounded-lg text-[var(--wz-heading)] text-[12px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[var(--wz-accent)] shrink-0" />
                    <span className="font-semibold">{copy.adultRow}</span>
                  </div>
                  <span className="text-[var(--wz-accent)] font-bold">18+</span>
                </div>
              )}
            </div>
          )
        })}

        {removeError ? (
          <p className="text-[12px] text-[var(--wz-danger)] font-medium px-1" role="alert">
            {removeError}
          </p>
        ) : null}

        {showDraftCard && draft ? (
          <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-[var(--wz-tint)] border border-emerald-300/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[13px] shadow-xs mt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[var(--wz-ink)] font-bold">{copy.draftTitle}</span>
                <span className="text-[12px] text-[var(--wz-secondary)]">
                  {draft.student.firstName || '—'} • {draft.part}/5
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSheet({ initial: draft.student, part: draft.part })}
                className="px-3.5 py-1.5 bg-[var(--wz-accent)] hover:bg-[var(--wz-accent-deep)] text-white rounded-lg text-[12px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                {copy.draftResume}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearStudentDraft()
                  setDraft(null)
                }}
                className="px-2.5 py-1.5 text-[var(--wz-danger)] hover:bg-red-100/50 rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
              >
                {copy.draftDiscard}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          data-testid="step2-add-student"
          onClick={() => setSheet({ initial: null, part: 1, intent: 'join' })}
          className="group w-full py-3.5 px-4 rounded-xl text-[var(--wz-accent)] border-2 border-dashed bg-[var(--wz-surface)] hover:bg-[var(--wz-raised)] border-[var(--wz-accent)]/30 hover:border-[var(--wz-accent)] flex items-center justify-center gap-2.5 transition-all duration-200 mt-1 shadow-2xs active:scale-[0.99] cursor-pointer"
        >
          <span className="w-7 h-7 rounded-full bg-[var(--wz-tint-3)] flex items-center justify-center text-[var(--wz-accent)] group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4 stroke-[3]" />
          </span>
          <span className="text-[15px] font-bold">{copy.addStudent}</span>
        </button>

        {/* The alternative for a family not ready to commit — as a SENTENCE, not a door.
            It used to be `<a href="/t/{slug}">`, a hard navigation to the public booking
            page: a parent who wanted one child enrolled and one trying a lesson pressed it
            and lost the wizard, every answer they had typed, and their place in the flow
            (reported 2026-09-11). The choice now lives per child at step 3, where every
            other per-child decision is made, so the two children travel together. */}
        {/* The second door, and the reason this is a BUTTON rather than the link it used
            to be. `href="/t/{slug}"` navigated the parent to the public booking page and
            took the wizard with it, so a family enrolling one child and trying another
            could not do both. Adding a child here marks them a trial from the start: they
            never reach step 3, raise no charge, and are booked through
            `POST /trial-bookings/self` when the family submits. */}
        <button
          type="button"
          data-testid="step2-add-trial"
          onClick={() => setSheet({ initial: null, part: 1, intent: 'trial' })}
          className="group w-full py-3 px-4 rounded-xl text-[var(--wz-secondary)] border border-dashed bg-transparent hover:bg-[var(--wz-raised)] border-[var(--wz-line-strong)] hover:border-[var(--wz-accent)] flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.99] cursor-pointer"
        >
          <span className="w-6 h-6 rounded-full bg-[var(--wz-tint)] flex items-center justify-center text-[var(--wz-accent)] shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <span className="text-[13.5px] font-semibold">{copy.tryFirst}</span>
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-[var(--wz-ground)]/95 backdrop-blur-md border-t border-[var(--wz-line)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] px-4">
        <div className="max-w-[480px] mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-12 px-4 rounded-xl bg-[var(--wz-tint)] hover:bg-[var(--wz-line)] text-[var(--wz-heading)] text-[15px] font-semibold flex items-center justify-center gap-1 transition-colors shrink-0 cursor-pointer"
          >
            {copy.back}
          </button>
          <button
            type="button"
            disabled={students.length === 0}
            onClick={onContinue}
            className={`flex-1 h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99] ${
              students.length === 0
                ? 'bg-[var(--wz-line)] text-[var(--wz-tertiary)] cursor-not-allowed'
                : 'bg-[var(--wz-btn-bg)] hover:bg-[var(--wz-accent)] text-white shadow-md cursor-pointer'
            }`}
          >
            <span>{copy.continueToStep3}</span>
          </button>
        </div>
      </div>

      {sheet ? (
        <StudentFormSheet
          locale={locale}
          initial={sheet.initial}
          initialPart={sheet.part}
          groups={groups}
          plans={plans}
          belts={belts}
          healthSchema={healthSchema}
          checkDuplicate={checkDuplicate}
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
              : // Door C's stub name (task 3a): a starting point for the FIRST row only --
                // never while resuming a saved draft (`sheet.initial` is that draft's
                // student, not `null`, when resuming), and it cannot collide with the
                // branch above, which only applies once a first child already exists.
                sheet.initial === null
                ? firstStudentDefaults
                : undefined
          }
          //: Which button opened the sheet. `undefined` while EDITING an existing child,
          //: so re-opening a member's form never silently turns them into a trial.
          intent={sheet.intent}
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
