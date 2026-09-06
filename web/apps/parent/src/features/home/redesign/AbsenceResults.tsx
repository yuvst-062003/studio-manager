// What N absence writes actually did, one row each.
//
// `POST /absence-reports` files ONE report per (session, student). A family of three away
// for a week is thirty writes, and they do not all have to succeed: §10.2 puts the deadline
// on the server, so a lesson that has already started comes back `too_late` while its
// siblings are accepted. The prototype flips one boolean and prints
// "היעדרות כל הילדים נרשמה בהצלחה ✓" — a sentence that, on a real server, can be false
// about half the batch.
//
// Written once and shared by both sheets that batch: FLOW A2's whole-day report and
// FLOW B's date range. They differ in what they SELECT and not at all in what they then
// have to admit, and two copies of "what actually happened" is one copy that eventually
// stops matching.
import { AlertTriangle, Check } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** What one write came back with. `pending` is "not attempted yet". */
export type AbsenceOutcome = {
  sessionId: string
  studentId: string
  studentName: string
  groupName: string
  /** Already formatted by the caller, in the studio's zone. FLOW B puts the DATE in here
   *  as well as the time: a row reading only "18:00" in a week-long batch names nothing. */
  timeLabel: string
  state: 'pending' | 'recorded' | 'too_late' | 'already_marked' | 'failed'
}

/** What one row's outcome says. A function rather than a constant map: the strings are
 *  translated, and a module-level table would freeze the first language loaded. */
export function resultText(
  state: Exclude<AbsenceOutcome['state'], 'pending'>,
  locale: Locale,
): string {
  const key = {
    recorded: 'resultRecorded',
    too_late: 'resultTooLate',
    already_marked: 'resultAlready',
    failed: 'resultFailed',
  }[state]
  return t(locale, `attendance.dayAbsence.${key}`)
}

export function AbsenceResults({
  outcomes,
  locale,
  busy,
  testId,
  onClose,
}: {
  outcomes: readonly AbsenceOutcome[]
  locale: Locale
  busy: boolean
  testId: string
  onClose: () => void
}) {
  const anyFailed = outcomes.some((row) => row.state !== 'recorded' && row.state !== 'pending')
  return (
    <>
      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{t(locale, 'attendance.dayAbsence.resultsTitle')}</h4>
      <ul className="space-y-1.5 list-none m-0 p-0" data-testid={testId}>
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
              <span>
                {row.state === 'pending'
                  ? t(locale, 'attendance.dayAbsence.submitting')
                  : resultText(row.state, locale)}
              </span>
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
        {anyFailed
          ? t(locale, 'attendance.dayAbsence.resultsSomeFailed')
          : t(locale, 'attendance.dayAbsence.resultsAllOk')}
      </p>

      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="w-full bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md transition-all cursor-pointer"
      >
        {t(locale, 'attendance.dayAbsence.done')}
      </button>
    </>
  )
}
