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
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { HOME, WEEKDAY_LETTER } from './content'
import { monthGrid } from './derive'
import type { HomeChild, HomeSession } from './types'

export function MonthCalendarModal({
  at,
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
}: {
  /** The month on screen. `month` is 1-based, like every other month value here. */
  at: { year: number; month: number }
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
}) {
  const dialogRef = useDialog(true, onClose)

  const forChild =
    selectedChildId === null
      ? sessions
      : sessions.filter((session) => session.studentId === selectedChildId)
  const { leadingBlanks, cells } = monthGrid(at.year, at.month, forChild, todayKey)
  const agenda = forChild.filter((session) => session.startsAt.slice(0, 10) === selectedDayKey)

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
                {HOME.monthTitle}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{HOME.monthSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={HOME.monthClose}
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
              title={HOME.monthNext}
              aria-label={HOME.monthNext}
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
              title={HOME.monthPrev}
              aria-label={HOME.monthPrev}
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
            {HOME.monthToday}
          </button>
        </div>

        {/* The same child filter the screen behind carries, so opening the modal does not
            silently widen what you were looking at. */}
        <div role="group" aria-label={HOME.allChildren} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
            <span>{HOME.allChildren}</span>
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

        {/* The grid. A real table would be better for a screen reader, but the prototype
            draws a grid of buttons and the port keeps it — so the group carries a name and
            each day carries `aria-pressed` and its full date as an accessible label. */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-2.5 shadow-xs space-y-2">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 py-1 border-b border-slate-100 dark:border-slate-800">
            {WEEKDAY_LETTER.map((letter) => (
              <div key={letter}>{letter}</div>
            ))}
          </div>
          <div role="group" aria-label={HOME.monthGridLabel} className="grid grid-cols-7 gap-1 text-center text-xs">
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

        {/* The selected day's agenda. */}
        <div className="space-y-2" data-testid="month-agenda">
          {agenda.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
              {HOME.monthAgendaEmpty}
            </p>
          ) : (
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
                <span className="text-sm font-bold text-slate-900 dark:text-slate-50 shrink-0">
                  {timeLabel(session)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
