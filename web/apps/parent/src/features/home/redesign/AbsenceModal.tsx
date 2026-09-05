// Ported from the prototype's `HomeScreen.tsx` FLOW A (lines 619-757) — the sheet the
// card's "נעדר/ת?" button opens.
//
// THREE THINGS THE PROTOTYPE HAS NO CONCEPT OF, because it has no server:
//
//  1. THE REFUSAL. §10.2 puts the deadline on the SERVER — a device an hour behind would
//     otherwise file a pre-report for a lesson already in progress — so the submit can come
//     back `too_late` or `already_marked`. The prototype's button always succeeds and closes.
//     Here the sheet stays open and says which one happened, because a sheet that closes on
//     a refusal leaves a parent believing they told the club when they did not. That is the
//     exact dead end the project's own rule names: refuse rather than accept.
//  2. BEING OFFLINE. Also §10.2: a pre-report "requires a connection on purpose ... The app
//     says so rather than queuing it into the void." Nothing here queues.
//  3. THE MODAL MECHANICS. The prototype's modal is a positioned <div> with a backdrop and
//     nothing else — no focus trap, no Escape, no scroll lock, no focus restore. `useDialog`
//     is the hook the wizard wrote for exactly this, and porting the markup means porting
//     the responsibility @studio/ui was carrying for the rest of the app.
import { useState } from 'react'
import { Calendar, Check, X } from 'lucide-react'
// Lives under the wizard because that is where the first ported modals were. It is not
// wizard-specific and should move to a shared home once that work lands; importing it is
// still better than a second copy of a focus trap.
import { useDialog } from '../../onboarding/wizard/useDialog'
import { ABSENCE, ABSENCE_REASONS } from './content.absence'
import type { HomeSession } from './types'

/** What the submit can come back with. `null` is "nothing has gone wrong yet". */
export type AbsenceFailure = 'too_late' | 'already_marked' | 'offline' | 'unknown' | null

export function AbsenceModal({
  session,
  dayLabel,
  timeLabel,
  busy,
  failure,
  onSubmit,
  onClose,
}: {
  session: HomeSession
  /** e.g. "25 באוגוסט" — formatted by the caller, in the studio's zone. */
  dayLabel: string
  timeLabel: string
  busy: boolean
  failure: AbsenceFailure
  /** The composed reason string, exactly as it will be stored. */
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)
  const [reasonKey, setReasonKey] = useState<string>('sick')
  const [note, setNote] = useState('')

  const chosen = ABSENCE_REASONS.find((reason) => reason.key === reasonKey)

  // ONE free-text field is what `POST /absence-reports` stores, and what a coach reads on
  // the mat. The prototype's six cards are a nicer way to ask the same question, so the
  // label and the note are composed into that one string rather than a code the server has
  // no column for and no coach could read.
  const composed = note.trim() ? `${chosen?.label ?? ''} — ${note.trim()}` : (chosen?.label ?? '')

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="absence-modal-title"
        tabIndex={-1}
        data-testid="home-absence-modal"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="text-start">
              <h3
                id="absence-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight"
              >
                {ABSENCE.title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{ABSENCE.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ABSENCE.close}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Which lesson this is about. The prototype's belt bar is `beltColor`; ours can be
            absent, and then there is no bar rather than a black one. */}
        <div className="bg-gradient-to-r from-blue-50/70 to-slate-50 dark:from-blue-400/10 dark:to-slate-800/60 p-3.5 rounded-2xl border border-blue-100/60 dark:border-slate-700 text-start flex items-center justify-between">
          <div className="flex items-center gap-2">
            {session.beltColorHex ? (
              <span
                className="w-2 h-10 rounded-full shrink-0"
                style={{ backgroundColor: session.beltColorHex }}
              />
            ) : null}
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-50 text-sm">
                {session.studentName}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                {session.groupName} • {timeLabel}
              </div>
            </div>
          </div>
          <div className="text-[11px] font-semibold text-[#0056c5] dark:text-blue-300 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl shadow-xs border border-blue-100 dark:border-slate-700">
            {dayLabel}
          </div>
        </div>

        {/* Real radios, not clickable divs — the house style the wizard set. Arrow-key
            navigation, the roving tab stop and "1 of 6" all come free, and none of it can
            be re-implemented correctly on a <button> grid. */}
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
                  // `has-[:focus-visible]` puts the ring on the LABEL when the visually
                  // hidden radio inside it takes focus. Without it the control is keyboard
                  // reachable and invisible while focused, which fails the project's own
                  // WCAG rule — the cost of `sr-only` on a real input, paid here.
                  className={`p-2.5 rounded-2xl text-start transition-all flex items-center justify-between cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5] ${
                    isSelected
                      ? 'border-2 border-[#0056c5] bg-blue-50/80 dark:bg-blue-400/15 shadow-xs'
                      : 'border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="radio"
                      name="absence-reason"
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
                      <p
                        className={`text-xs font-bold leading-tight ${
                          isSelected ? 'text-[#001849] dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
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
          <label
            htmlFor="absence-note"
            className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between"
          >
            <span>{ABSENCE.noteLabel}</span>
            <span className="text-[10px] font-normal text-slate-400">
              {reasonKey === 'other' ? ABSENCE.noteRecommended : ''}
            </span>
          </label>
          <textarea
            id="absence-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={ABSENCE.notePlaceholder}
            className="w-full text-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] p-3 text-start transition-all outline-none"
          />
        </div>

        {/* The refusal, in the sheet, above the button that caused it. `aria-live` because
            it appears without the focus moving. */}
        {failure ? (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="home-absence-error"
            className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 rounded-2xl p-3 text-start"
          >
            {ABSENCE.failure[failure]}
          </p>
        ) : null}

        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSubmit(composed)}
            disabled={busy}
            data-testid="home-absence-submit"
            className="flex-1 bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{busy ? ABSENCE.submitting : ABSENCE.submit}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-semibold active:scale-98 transition-all cursor-pointer"
          >
            {ABSENCE.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
