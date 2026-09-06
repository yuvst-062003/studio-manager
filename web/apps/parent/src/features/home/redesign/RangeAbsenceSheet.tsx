// FLOW B — "דיווח היעדרות תקופתי", ported from the prototype's `HomeScreen.tsx`
// (lines 880-1120): pick the children, pick a range, one report for every lesson inside it.
//
// This is the flow a family going away for a week actually needs, and until now the app's
// answer was `#/absence` — which files ONE report for ONE child at ONE session. The shell
// map said that screen "already does multi-child, multi-session picking"; reading it showed
// that it does not, and a fortnight in Greece was thirty trips through a single-session
// form.
//
// THREE THINGS THE PROTOTYPE'S VERSION DOES NOT DO, because it has no server:
//
//  1. IT FINDS THE LESSONS. The prototype submits a range and shows a toast. A range is not
//     a report: `POST /absence-reports` files one per (session, student), so the range has
//     to be resolved to actual sessions first. The home holds two weeks; a family away for
//     a month would otherwise report nothing at all and be told it worked.
//  2. IT REFUSES A RANGE IT CANNOT MEAN. Backwards is a typo. Very long is almost always a
//     year typed into the month field, and turning that into a hundred writes is the kind
//     of accepted-then-wrong the register warns about — a 422 that names the problem costs
//     one round trip.
//  3. IT REPORTS PER WRITE. `AbsenceResults` carries that reasoning; the short version is
//     that a batch which only half succeeds must not say "done".
//
// The reason cards and the note are the same controls as FLOW A's single-session sheet,
// and deliberately so: it is the same question, asked about more lessons.
import { useState } from 'react'
import { CalendarDays, Check, Users, X } from 'lucide-react'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { ABSENCE_REASONS, reasonForWire, reasonLabel, reasonSub } from './absenceReasons'
import type { ReasonKey } from './absenceReasons'
import { AbsenceResults } from './AbsenceResults'
import type { AbsenceOutcome } from './AbsenceResults'
import type { HomeChild } from './types'

/**
 * The longest range the sheet will resolve.
 *
 * Not a server limit — `GET /sessions` takes any window. It is a guard against a typo:
 * `2027-08-25` in the "to" field is a year of lessons and a hundred writes, and the parent
 * meant next Tuesday. Six weeks covers every real reason a family is away (the summer
 * break, a posting abroad, a long recovery) and nothing beyond it is a range anyone types
 * on purpose.
 */
export const MAX_RANGE_DAYS = 42

export type RangeAbsenceSubmission = {
  from: string
  to: string
  studentIds: readonly string[]
  reason: string
}

/** `YYYY-MM-DD` arithmetic at MIDDAY UTC — see `derive.ts` for the one-day slip midnight
 *  causes in a negative-offset zone. */
function shift(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const at = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** The prototype's three presets, computed from today rather than hard-coded to its own
 *  demo dates (`2026-08-25`, `2026-08-28`). */
function presetRange(kind: 'today' | 'weekend' | 'week', todayKey: string): [string, string] {
  if (kind === 'today') return [todayKey, todayKey]
  if (kind === 'week') return [todayKey, shift(todayKey, 6)]
  // Israel's weekend is Friday and Saturday. `Date.getUTCDay()` is 5 and 6, and the day key
  // is already a Jerusalem calendar day, so no zone maths is needed to ask which day it is.
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay()
  const friday = shift(todayKey, (5 - weekday + 7) % 7)
  return [friday, shift(friday, 1)]
}

export function RangeAbsenceSheet({
  childList,
  locale,
  todayKey,
  busy,
  /** `null` until a submit has been made; non-null puts the sheet in its results state. */
  outcomes,
  /** Set when the range could not be resolved, or when it names nothing. */
  notice,
  onSubmit,
  onClose,
}: {
  childList: readonly HomeChild[]
  locale: Locale
  todayKey: string
  busy: boolean
  outcomes: readonly AbsenceOutcome[] | null
  notice: string | null
  onSubmit: (submission: RangeAbsenceSubmission) => void
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)
  const [chosen, setChosen] = useState<readonly string[]>(() => childList.map((child) => child.id))
  const [from, setFrom] = useState(todayKey)
  const [to, setTo] = useState(todayKey)
  const [reasonKey, setReasonKey] = useState<ReasonKey>('vacation')
  const [note, setNote] = useState('')

  const allChosen = chosen.length === childList.length && childList.length > 0
  const span = daysBetween(from, to)
  // Checked here and not only on submit: a refusal a parent reads while they are still
  // looking at the field costs nothing, and one that appears after a spinner costs a round
  // trip and their confidence in the screen.
  const rangeError =
    span < 0
      ? t(locale, 'attendance.rangeAbsence.rangeBackwards')
      : span + 1 > MAX_RANGE_DAYS
        ? fill(t(locale, 'attendance.rangeAbsence.rangeTooLong'), { days: MAX_RANGE_DAYS })
        : null
  const blocked = chosen.length === 0 || rangeError !== null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="range-absence-title"
        tabIndex={-1}
        data-testid="home-range-absence-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="text-start">
              <h3
                id="range-absence-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight"
              >
                {t(locale, 'attendance.rangeAbsence.title')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t(locale, 'attendance.rangeAbsence.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'attendance.absenceSheet.close')}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {outcomes === null ? (
          <>
            {/* WHO */}
            <fieldset className="space-y-1.5 text-start border-0 m-0 p-0">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-bold text-slate-800 dark:text-slate-200 p-0">
                  {t(locale, 'attendance.rangeAbsence.whoLegend')}
                </legend>
                <button
                  type="button"
                  data-testid="range-absence-toggle-all"
                  onClick={() => setChosen(allChosen ? [] : childList.map((child) => child.id))}
                  className="text-[11px] font-semibold text-[#0056c5] dark:text-blue-300 hover:underline cursor-pointer"
                >
                  {allChosen
                    ? t(locale, 'attendance.rangeAbsence.clearAll')
                    : t(locale, 'attendance.rangeAbsence.selectAll')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {childList.map((child) => {
                  const isChosen = chosen.includes(child.id)
                  return (
                    <label
                      key={child.id}
                      className="flex items-center justify-between p-2.5 border border-slate-200/90 dark:border-slate-700 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors bg-white dark:bg-slate-900 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5]"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: child.beltColorHex ?? '#94a3b8' }}
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {child.firstName}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={isChosen}
                        data-testid={`range-absence-child-${child.id}`}
                        onChange={(event) =>
                          setChosen((current) =>
                            event.target.checked
                              ? [...current, child.id]
                              : current.filter((id) => id !== child.id),
                          )
                        }
                        className="rounded-md accent-[#0056c5]"
                      />
                    </label>
                  )
                })}
              </div>
              {chosen.length === 0 ? (
                <p
                  role="alert"
                  data-testid="range-absence-who-error"
                  className="text-[11px] font-semibold text-[#ba1a1a] dark:text-red-300"
                >
                  {t(locale, 'attendance.rangeAbsence.whoRequired')}
                </p>
              ) : null}
            </fieldset>

            {/* WHEN */}
            <div className="space-y-1.5 text-start">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                {t(locale, 'attendance.rangeAbsence.presetsLegend')}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['today', 'weekend', 'week'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`range-absence-preset-${preset}`}
                    onClick={() => {
                      const [start, end] = presetRange(preset, todayKey)
                      setFrom(start)
                      setTo(end)
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-400/15 hover:text-[#0056c5] dark:hover:text-blue-300 active:scale-95 transition-all text-center cursor-pointer"
                  >
                    {t(
                      locale,
                      `attendance.rangeAbsence.preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}`,
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 text-start">
              <div>
                <label
                  htmlFor="range-absence-from"
                  className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block mb-1"
                >
                  {t(locale, 'attendance.rangeAbsence.from')}
                </label>
                <input
                  id="range-absence-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-invalid={rangeError !== null}
                  aria-describedby={rangeError !== null ? 'range-absence-error' : undefined}
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="range-absence-to"
                  className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block mb-1"
                >
                  {t(locale, 'attendance.rangeAbsence.to')}
                </label>
                <input
                  id="range-absence-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-invalid={rangeError !== null}
                  aria-describedby={rangeError !== null ? 'range-absence-error' : undefined}
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] outline-none"
                />
              </div>
            </div>

            {rangeError !== null ? (
              <p
                id="range-absence-error"
                role="alert"
                data-testid="range-absence-range-error"
                className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 rounded-2xl p-3 text-start"
              >
                {rangeError}
              </p>
            ) : null}

            {/* WHY — the same six cards FLOW A asks with. */}
            <fieldset className="space-y-2 text-start border-0 m-0 p-0">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-bold text-slate-800 dark:text-slate-200 p-0">
                  {t(locale, 'attendance.absenceSheet.reasonLegend')}
                </legend>
                <span className="text-[11px] text-slate-400">
                  {t(locale, 'attendance.absenceSheet.reasonHint')}
                </span>
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
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          name="range-absence-reason"
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
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-bold leading-tight ${
                              isSelected
                                ? 'text-[#001849] dark:text-blue-200'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {reasonLabel(reason.key, locale)}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {reasonSub(reason.key, locale)}
                          </span>
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          isSelected
                            ? 'bg-[#0056c5] text-white'
                            : 'border border-slate-300 dark:border-slate-600'
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
                htmlFor="range-absence-note"
                className="text-xs font-bold text-slate-700 dark:text-slate-300 block"
              >
                {t(locale, 'attendance.absenceSheet.noteLabel')}
              </label>
              <textarea
                id="range-absence-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t(locale, 'attendance.absenceSheet.notePlaceholder')}
                className="w-full text-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] p-3 text-start transition-all outline-none"
              />
            </div>

            {/* The range resolved to nothing, or could not be read. Said in the sheet, above
                the button that caused it — a batch that wrote nothing must never read as a
                batch that worked. */}
            {notice !== null ? (
              <p
                role="alert"
                aria-live="assertive"
                data-testid="range-absence-notice"
                className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 rounded-2xl p-3 text-start"
              >
                {notice}
              </p>
            ) : null}

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={busy || blocked}
                data-testid="range-absence-submit"
                onClick={() =>
                  onSubmit({ from, to, studentIds: chosen, reason: reasonForWire(reasonKey, note) })
                }
                className="flex-1 bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>
                  {busy
                    ? t(locale, 'attendance.rangeAbsence.submitting')
                    : t(locale, 'attendance.rangeAbsence.submit')}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-semibold active:scale-98 transition-all cursor-pointer"
              >
                {t(locale, 'attendance.absenceSheet.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 text-start">
              <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {outcomes.length === 1
                  ? t(locale, 'attendance.rangeAbsence.foundOne')
                  : fill(t(locale, 'attendance.rangeAbsence.foundMany'), {
                      count: outcomes.length,
                    })}
              </span>
            </p>
            <AbsenceResults
              outcomes={outcomes}
              locale={locale}
              busy={busy}
              testId="home-range-absence-results"
              onClose={onClose}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** Exported for its own test. The container needs none of these: it hands the sheet's
 *  range straight to `GET /sessions`, which is what makes them the sheet's business. */
export { shift as shiftDayKey, daysBetween, presetRange }
