// FLOW A2 — "דיווח היעדרות לכל הילדים", ported from the prototype's `HomeScreen.tsx`
// (lines 759-887) and opened from the calendar's day card.
//
// ONE BUTTON, N WRITES, AND THE PROTOTYPE NEVER HAS TO ADMIT IT.
//
// `POST /absence-reports` files one report per (session, student). A family of three with
// two lessons each is six writes, and they do NOT all have to succeed: §10.2 puts the
// deadline on the server, so a lesson that has already started comes back `too_late` while
// its siblings are accepted. The prototype flips one boolean and prints
// "היעדרות כל הילדים נרשמה בהצלחה ✓" — which, on a real server, is a sentence that can be
// false about half the day.
//
// So this sheet does not close on submit. It shows a row per lesson with what actually
// happened, the same shape the wizard's step 4 uses for its payment outcomes and for the
// same reason: a screen that says "done" for a batch it only partly wrote leaves a parent
// believing the club was told, and a coach who was not.
import { useState } from 'react'
import { AlertTriangle, Check, Users, X } from 'lucide-react'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { ABSENCE, ABSENCE_REASONS, DAY_ABSENCE } from './content.absence'
import { fill } from './content'

/** What one write came back with. `pending` is "not attempted yet". */
export type DayAbsenceOutcome = {
  sessionId: string
  studentId: string
  studentName: string
  groupName: string
  timeLabel: string
  state: 'pending' | 'recorded' | 'too_late' | 'already_marked' | 'failed'
}

const RESULT_TEXT: Record<Exclude<DayAbsenceOutcome['state'], 'pending'>, string> = {
  recorded: DAY_ABSENCE.resultRecorded,
  too_late: DAY_ABSENCE.resultTooLate,
  already_marked: DAY_ABSENCE.resultAlready,
  failed: DAY_ABSENCE.resultFailed,
}

export function AllDayAbsenceSheet({
  targets,
  childNames,
  dayLabel,
  busy,
  outcomes,
  onSubmit,
  onClose,
}: {
  /** Every lesson this report is about, captured when the sheet opened. Frozen, because a
   *  report that succeeds must not empty the description of what it was about. */
  targets: readonly DayAbsenceOutcome[]
  /** Distinct first names among those lessons, in roster order. */
  childNames: readonly string[]
  dayLabel: string
  busy: boolean
  /** `null` until the submit has been made. Non-null puts the sheet in its results state. */
  outcomes: readonly DayAbsenceOutcome[] | null
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)
  const [reasonKey, setReasonKey] = useState<string>('sick')
  const [note, setNote] = useState('')

  const chosen = ABSENCE_REASONS.find((reason) => reason.key === reasonKey)
  const composed = note.trim() ? `${chosen?.label ?? ''} — ${note.trim()}` : (chosen?.label ?? '')
  const anyFailed = (outcomes ?? []).some((row) => row.state !== 'recorded' && row.state !== 'pending')

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-absence-title"
        tabIndex={-1}
        data-testid="home-day-absence-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300 flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-start">
              <h3 id="day-absence-title" className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight">
                {DAY_ABSENCE.title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{DAY_ABSENCE.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ABSENCE.close}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* WHO and WHEN, from the day's actual lessons — never a hardcoded "כל 3 הילדים". */}
        <div className="bg-red-50/60 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 p-3.5 rounded-2xl text-start flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-slate-50 text-sm">
              {childNames.length === 1
                ? fill(DAY_ABSENCE.targetOne, { names: childNames[0] ?? '' })
                : fill(DAY_ABSENCE.targetMany, {
                    count: childNames.length,
                    names: childNames.join(', '),
                  })}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
              {DAY_ABSENCE.targetNote}
            </div>
          </div>
          <div className="text-[11px] font-semibold text-red-700 dark:text-red-300 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl shadow-xs border border-red-100 dark:border-slate-700 shrink-0">
            {dayLabel}
          </div>
        </div>

        {outcomes === null ? (
          <>
            <fieldset className="space-y-2 text-start border-0 m-0 p-0">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-bold text-slate-800 dark:text-slate-200 p-0">
                  {ABSENCE.reasonLegend}
                </legend>
                <span className="text-[11px] text-slate-400">{ABSENCE.reasonHint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ABSENCE_REASONS.map((reason) => {
                  const isSelected = reasonKey === reason.key
                  return (
                    <label
                      key={reason.key}
                      className={`p-2.5 rounded-2xl text-start transition-all flex items-center justify-between cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5] ${
                        isSelected
                          ? 'border-2 border-[#0056c5] bg-blue-50/80 dark:bg-blue-400/15 shadow-xs'
                          : 'border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          name="day-absence-reason"
                          value={reason.key}
                          checked={isSelected}
                          onChange={() => setReasonKey(reason.key)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`w-8 h-8 rounded-xl ${reason.bg} flex items-center justify-center shrink-0 text-base`}
                        >
                          {reason.icon}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-[#001849] dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'}`}>
                            {reason.label}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{reason.sub}</p>
                        </div>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          isSelected ? 'bg-[#0056c5] text-white' : 'border border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected ? '✓' : ''}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5 text-start">
              <label htmlFor="day-absence-note" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {ABSENCE.noteLabel}
              </label>
              <textarea
                id="day-absence-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ABSENCE.notePlaceholder}
                className="w-full text-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] p-3 text-start transition-all outline-none"
              />
            </div>

            {/* Exactly what is about to be written, before it is written. Six reports from
                one tap is a lot to do on a parent's behalf without showing the list. */}
            <ul className="space-y-1.5 list-none m-0 p-0">
              {targets.map((session) => (
                <li
                  key={`${session.sessionId}:${session.studentId}`}
                  className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800/70 rounded-xl px-3 py-2"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {session.studentName}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 truncate">{session.groupName}</span>
                </li>
              ))}
            </ul>

            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSubmit(composed)}
                disabled={busy || targets.length === 0}
                data-testid="home-day-absence-submit"
                className="flex-1 bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {targets.length === 0
                    ? DAY_ABSENCE.nothingToReport
                    : busy
                      ? DAY_ABSENCE.submitting
                      : DAY_ABSENCE.submit}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-semibold transition-all cursor-pointer"
              >
                {ABSENCE.cancel}
              </button>
            </div>
          </>
        ) : (
          <>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{DAY_ABSENCE.resultsTitle}</h4>
            <ul className="space-y-1.5 list-none m-0 p-0" data-testid="home-day-absence-results">
              {outcomes.map((row) => (
                <li
                  key={`${row.sessionId}:${row.studentId}`}
                  className={`flex items-center justify-between gap-2 text-xs rounded-xl px-3 py-2.5 border ${
                    row.state === 'recorded'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25'
                      : row.state === 'pending'
                        ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                        : 'bg-[#ffdad6] dark:bg-red-500/15 border-red-200 dark:border-red-500/25'
                  }`}
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {row.studentName} · {row.timeLabel}
                  </span>
                  <span
                    className={`shrink-0 font-bold flex items-center gap-1 ${
                      row.state === 'recorded'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : row.state === 'pending'
                          ? 'text-slate-500'
                          : 'text-[#ba1a1a] dark:text-red-300'
                    }`}
                  >
                    {row.state === 'recorded' ? <Check className="w-3.5 h-3.5" /> : null}
                    {row.state !== 'recorded' && row.state !== 'pending' ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : null}
                    <span>{row.state === 'pending' ? DAY_ABSENCE.submitting : RESULT_TEXT[row.state]}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p
              role="status"
              className={`text-xs font-semibold text-start ${
                anyFailed ? 'text-[#ba1a1a] dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {anyFailed ? DAY_ABSENCE.resultsSomeFailed : DAY_ABSENCE.resultsAllOk}
            </p>

            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="w-full bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {DAY_ABSENCE.done}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
