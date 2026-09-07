// §4's decision made real: "calendar is a modal inside Home". Ported from the prototype's
// `HomeScreen.tsx` FLOW C (lines 1126-1420), which is where the deleted drawer's `#/calendar`
// entry goes.
//
// WHAT THE PROTOTYPE HARDCODES AND THIS CANNOT. Its grid is August 2026 written out in JSX,
// six leading blank cells included, and its month buttons set a STRING — pressing "next"
// twice shows September twice. The modal has a month navigator, so the very first thing a
// parent does is move to a month with a different shape; `monthGrid` computes it, and
// `derive.test.ts` holds February in a leap year and a common one.
//
// The prototype's month arrows are `ChevronRight` for NEXT and `ChevronLeft` for previous.
// That is correct in a right-to-left document — forward is leftward, so the arrow pointing
// away from the text's flow direction is the one that advances — and it is kept as drawn.
import { Calendar, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react'
import { fill, studioDayKey, weekdayInitials } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { monthGrid } from './derive'
import type { HomeChild, HomeSession } from './types'

export function MonthCalendarModal({
  at,
  locale,
  monthLabel,
  sessions,
  todayKey,
  selectedDayKey,
  childList,
  selectedChildId,
  onSelectChild,
  onSelectDay,
  onShiftMonth,
  onToday,
  onClose,
  timeLabel,
  dayHeadline,
  onReportWholeDay,
  onShowOnHome,
  onReportSession,
}: {
  /** The month on screen. `month` is 1-based, like every other month value here. */
  at: { year: number; month: number }
  locale: Locale
  /** Already formatted, e.g. "אוגוסט 2026" — `formatMonthLabel` does it in the caller. */
  monthLabel: string
  /** EVERY session the family has loaded, not just the selected day's: the grid marks the
   *  whole month, which is the only reason the modal is worth opening. */
  sessions: readonly HomeSession[]
  todayKey: string
  selectedDayKey: string
  childList: readonly HomeChild[]
  selectedChildId: string | null
  onSelectChild: (id: string | null) => void
  onSelectDay: (dayKey: string) => void
  onShiftMonth: (months: number) => void
  onToday: () => void
  onClose: () => void
  timeLabel: (session: HomeSession) => string
  /** The selected day, already formatted — "יום ד׳ • 26 באוגוסט 2026". */
  dayHeadline: string
  /** The prototype's day action bar — one report for every lesson on the day. */
  onReportWholeDay: () => void
  /** The prototype's "הצג במסך הבית": take this day back to the screen behind and close. */
  onShowOnHome: () => void
  /** Per-lesson, the same sheet the home card opens. */
  onReportSession: (session: HomeSession) => void
}) {
  const dialogRef = useDialog(true, onClose)

  const forChild =
    selectedChildId === null
      ? sessions
      : sessions.filter((session) => session.studentId === selectedChildId)
  const { leadingBlanks, cells } = monthGrid(at.year, at.month, forChild, todayKey)
  const agenda = forChild.filter((session) => studioDayKey(session.startsAt) === selectedDayKey)
  // Every lesson on the day already answered — the state the prototype tracks with a single
  // `allKidsReportedForDay26` boolean, derived here from the reports that actually exist.
  const allReported = agenda.length > 0 && agenda.every((session) => session.reportedAbsent)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-modal-title"
        tabIndex={-1}
        data-testid="home-month-modal"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-start border border-slate-100 dark:border-slate-800 no-scrollbar"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="text-start">
              <h3 id="month-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight">
                {t(locale, 'schedule.home.monthTitle')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t(locale, 'schedule.home.monthSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t(locale, 'schedule.home.monthClose')}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month navigator. `aria-live` on the label, because the arrows change it and
            nothing else on screen announces the move. */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/70 p-2 rounded-2xl border border-slate-200/70 dark:border-slate-700">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onShiftMonth(1)}
              title={t(locale, 'schedule.home.monthNext')}
              aria-label={t(locale, 'schedule.home.monthNext')}
              data-testid="month-next"
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span
              aria-live="polite"
              data-testid="month-label"
              className="text-xs font-bold text-slate-900 dark:text-slate-50 px-2"
            >
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => onShiftMonth(-1)}
              title={t(locale, 'schedule.home.monthPrev')}
              aria-label={t(locale, 'schedule.home.monthPrev')}
              data-testid="month-prev"
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onToday}
            data-testid="month-today"
            className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-[#0056c5] dark:text-blue-300 hover:bg-blue-50 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            {t(locale, 'schedule.home.monthToday')}
          </button>
        </div>

        {/* The same child filter the screen behind carries, so opening the modal does not
            silently widen what you were looking at — and hidden on the same rule, so the
            two agree: with one child there is nothing to filter between. */}
        {childList.length > 1 ? (
        <div role="group" aria-label={t(locale, 'schedule.home.allChildren')} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            aria-pressed={selectedChildId === null}
            onClick={() => onSelectChild(null)}
            className={`px-3 py-1.5 rounded-full text-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedChildId === null
                ? 'bg-[#001849] text-white font-semibold shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-medium'
            }`}
          >
            <span>{t(locale, 'schedule.home.allChildren')}</span>
            <span
              className={`text-[10px] px-1.5 rounded-full font-bold ${
                selectedChildId === null ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {childList.length}
            </span>
          </button>
          {childList.map((child) => (
            <button
              key={child.id}
              type="button"
              aria-pressed={selectedChildId === child.id}
              onClick={() => onSelectChild(child.id)}
              className={`px-3 py-1.5 rounded-full text-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                selectedChildId === child.id
                  ? 'bg-[#001849] text-white font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-medium'
              }`}
            >
              <span>{child.firstName}</span>
              {child.beltColorHex ? (
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: child.beltColorHex }}
                />
              ) : null}
            </button>
          ))}
        </div>
        ) : null}

        {/* The grid. A real table would be better for a screen reader, but the prototype
            draws a grid of buttons and the port keeps it — so the group carries a name and
            each day carries `aria-pressed` and its full date as an accessible label. */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-2.5 shadow-xs space-y-2">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 py-1 border-b border-slate-100 dark:border-slate-800">
            {weekdayInitials(locale).map((letter) => (
              <div key={letter}>{letter}</div>
            ))}
          </div>
          <div role="group" aria-label={t(locale, 'schedule.home.monthGridLabel')} className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <div key={`blank-${index}`} className="py-2" />
            ))}
            {cells.map((cell) => {
              const isSelected = cell.dayKey === selectedDayKey
              return (
                <button
                  key={cell.dayKey}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={cell.dayKey}
                  data-testid={`month-day-${cell.dayKey}`}
                  onClick={() => onSelectDay(cell.dayKey)}
                  className={`py-2 rounded-xl transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-[#001849] text-white font-bold'
                      : cell.isToday
                        ? 'bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 font-bold'
                        : cell.hasSessions
                          ? 'text-slate-900 dark:text-slate-100 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800'
                          : 'text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {cell.dayOfMonth}
                  {/* The dot is the whole point of the month view: which days have training.
                      Hidden from the reader — the label already says the date, and "has a
                      dot" means nothing spoken. */}
                  {cell.hasSessions && !isSelected ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 start-0 end-0 mx-auto w-1 h-1 rounded-full bg-[#0056c5] dark:bg-blue-300"
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* The selected day's card: what is on, and the two things you can do about it.
            Both are the prototype's; the first version of this port had neither, and a
            calendar you can only read is a calendar you open once. */}
        <div className="space-y-2.5 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-3xl p-3.5" data-testid="month-agenda">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-50 leading-tight truncate">
                  {dayHeadline}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {agenda.length === 0
                    ? t(locale, 'schedule.home.monthAgendaEmpty')
                    : agenda.length === 1
                      ? t(locale, 'schedule.home.monthDayOneSession')
                      : fill(t(locale, 'schedule.home.monthDaySessions'), { count: agenda.length })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onShowOnHome}
              data-testid="month-show-on-home"
              className="px-2.5 py-1.5 bg-[#0056c5] hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1 transition-all shrink-0 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t(locale, 'schedule.home.monthShowOnHome')}</span>
            </button>
          </div>

          {/* The day action bar. Hidden when there is nothing to report, and when every
              lesson on the day has already been reported — a button that can only tell you
              "already reported" six times is not a button. */}
          {agenda.length > 0 ? (
            allReported ? (
              <p className="w-full py-2.5 px-3 rounded-2xl text-xs font-bold bg-emerald-600 text-white flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t(locale, 'attendance.dayAbsence.openDone')}</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={onReportWholeDay}
                data-testid="month-report-day"
                className="w-full py-2.5 px-3 rounded-2xl text-xs font-bold shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer bg-red-50 dark:bg-red-500/10 hover:bg-red-100/80 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300"
              >
                <Calendar className="w-4 h-4" />
                <span>{t(locale, 'attendance.dayAbsence.openCta')}</span>
              </button>
            )
          ) : null}

          {agenda.length === 0 ? null : (
            agenda.map((session) => (
              <div
                key={`${session.id}:${session.studentId}`}
                className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3 flex items-center justify-between gap-3 border border-slate-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {session.beltColorHex ? (
                    <span
                      className="w-1.5 h-9 rounded-full shrink-0"
                      style={{ backgroundColor: session.beltColorHex }}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      {session.studentName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {session.groupName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {timeLabel(session)}
                  </span>
                  {/* The per-lesson report, opening the SAME sheet the home card opens —
                      the prototype has one here too, and a calendar that can only report a
                      whole day cannot answer "one of my three is ill". */}
                  {session.cancelledReason === null ? (
                    session.reportedAbsent ? (
                      <span
                        className="px-2 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/25 text-[10px] font-bold flex items-center gap-1"
                        data-testid={`month-reported-${session.id}-${session.studentId}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t(locale, 'schedule.home.absentReported')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReportSession(session)}
                        aria-label={`${t(locale, 'schedule.home.absentQuestion')} ${session.studentName}`}
                        data-testid={`month-absence-${session.id}-${session.studentId}`}
                        className="px-2.5 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 border border-red-200 dark:border-red-500/25 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{t(locale, 'schedule.home.absentQuestion')}</span>
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
