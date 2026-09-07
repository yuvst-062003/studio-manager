// Ported from the AI Studio prototype's HomeScreen.tsx (lines 391-614): the weekly day
// strip, the day's headline and session list, and the floating absence button. See
// docs/superpowers/specs/2026-09-03-onboarding-doors-and-wizard.md's sibling prompt for the
// porting rules this file follows — Tailwind classes kept as written, physical directional
// utilities turned logical, every string from `content.ts`, no date math.
//
// The prototype knows two card states (scheduled, reported_absent). This screen adds two:
// CANCELLED, when the club calls the lesson off (`session.cancelledReason` is a resolved
// sentence, not a flag) — a cancelled lesson is never drawn as an absence — and EVENT,
// §5.12's competitions and gradings folded in beside the lessons as §4 asks. An event card
// leads with an RSVP link rather than the absence button: it is a different answer to a
// different question, and the prototype has no events at all to draw one from.
import {
  Bell,
  Calendar,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  Trophy,
} from 'lucide-react'
import { fill, weekdayInitials } from '@studio/core'
import { t } from '@studio/i18n'
import { resolveLoadFailedText } from '../../shell/loadFailed'
import type { Locale } from '@studio/i18n'
import type { HomeSession, StripDay } from './types'

export function HomeSchedule({
  days,
  locale,
  selectedDayKey,
  onSelectDay,
  onOpenMonth,
  headline,
  sessions,
  state,
  onRetry,
  hasReminder,
  onOpenReminder,
  onOpenAbsence,
  onReportAbsenceRange,
  timeLabel,
  durationMinutes,
}: {
  days: readonly StripDay[]
  locale: Locale
  selectedDayKey: string
  onSelectDay: (dayKey: string) => void
  onOpenMonth: () => void
  /** Already formatted by the caller, e.g. "יום ג׳ • 25 באוגוסט 2026". No date maths in
   *  this file — timestamps are UTC and are rendered in the studio's zone by the caller. */
  headline: string
  /** Already filtered to the selected day and the selected child. */
  sessions: readonly HomeSession[]
  state: 'ready' | 'loading' | 'failed'
  onRetry: () => void
  hasReminder: (session: HomeSession) => boolean
  onOpenReminder: (session: HomeSession) => void
  onOpenAbsence: (session: HomeSession) => void
  onReportAbsenceRange: () => void
  /** e.g. "18:00" — studio zone, computed by the caller. */
  timeLabel: (session: HomeSession) => string
  /** e.g. 75. `null` when the session has no end time. */
  durationMinutes: (session: HomeSession) => number | null
}) {
  // `Intl`'s own initials, Sunday first — the order is `group_schedule_rule.weekday`'s and
  // deliberately not the locale's first-day-of-week, which is Monday for ru and would
  // rotate this row out of step with the days under it.
  const initials = weekdayInitials(locale)
  const countLabel =
    sessions.length === 0
      ? t(locale, 'schedule.home.noSessionsPlanned')
      : sessions.length === 1
        ? t(locale, 'schedule.home.oneSessionPlanned')
        : fill(t(locale, 'schedule.home.manySessionsPlanned'), { count: sessions.length })

  return (
    <>
      {/* Weekly Calendar Strip Container */}
      <div
        data-testid="home-week-strip"
        className="bg-white dark:bg-slate-900 rounded-3xl p-2.5 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1"
      >
        {/* Monthly Trigger Button */}
        <button
          type="button"
          onClick={onOpenMonth}
          data-testid="home-open-month"
          className="flex flex-col items-center justify-center p-2 rounded-2xl bg-blue-50 text-[#0056c5] hover:bg-blue-100/70 active:scale-95 transition-all border border-blue-100/80 w-14 shrink-0 cursor-pointer"
          title={t(locale, 'schedule.home.monthButtonTitle')}
        >
          <CalendarDays className="w-5 h-5 text-[#0056c5]" />
          <span className="text-[11px] font-medium mt-0.5">{t(locale, 'schedule.home.monthButton')}</span>
        </button>

        <div className="h-9 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0"></div>

        {/* Days Horizontal Strip — a single-choice control, so the group carries the
            selection semantics and each chip reports its own pressed state. */}
        <div
          role="group"
          aria-label={t(locale, 'schedule.home.weekStripLabel')}
          className="grid grid-cols-7 gap-1 flex-1 text-center"
        >
          {days.map((day) => {
            const isSelected = day.dayKey === selectedDayKey
            return (
              <button
                key={day.dayKey}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectDay(day.dayKey)}
                data-testid={`home-day-${day.dayKey}`}
                className={`day-chip flex flex-col items-center py-1.5 rounded-2xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#001849] text-white shadow-xs font-semibold'
                    : 'hover:bg-slate-50 text-slate-800 dark:text-slate-50'
                }`}
              >
                <span
                  className={`text-[10px] leading-tight ${
                    isSelected ? 'text-white/90' : 'text-slate-500 font-medium'
                  }`}
                >
                  {day.isToday ? (
                    <>
                      {t(locale, 'schedule.home.today')}
                      <br />
                      {initials[day.weekday]}
                    </>
                  ) : (
                    initials[day.weekday]
                  )}
                </span>
                <span
                  className={`text-sm font-bold ${
                    isSelected
                      ? 'text-white text-base mt-0.5'
                      : `mt-0.5 ${day.hasSessions ? 'text-slate-800 dark:text-slate-50' : 'text-slate-400 dark:text-slate-600'}`
                  }`}
                >
                  {day.dayOfMonth}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* BEGIN: Main Content */}
      <main className="px-4 flex-1">
        {/* Date Headline & Schedule Count */}
        <div className="flex items-center justify-between mb-3 px-1 mt-1">
          <div className="text-start">
            <h2 data-testid="home-headline" className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
              {headline}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">{countLabel}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0056c5] flex items-center justify-center">
            <Clock className="w-4 h-4 text-[#0056c5]" />
          </div>
        </div>

        {/* Training Session Cards List */}
        <div className="space-y-3" data-testid="home-sessions">
          {state === 'loading' ? (
            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 mt-3 p-6">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/70 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-slate-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mt-2">{t(locale, 'schedule.home.loading')}</h4>
            </div>
          ) : state === 'failed' ? (
            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 mt-3 p-6">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/70 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-slate-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mt-2">{resolveLoadFailedText(locale, 'schedule.home.loadFailed')}</h4>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0056c5] bg-blue-50 px-3.5 py-2 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <span>{t(locale, 'schedule.home.retry')}</span>
              </button>
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => {
              const isEvent = session.kind === 'event'
              const isCancelled = session.cancelledReason !== null
              const isAbsent = !isCancelled && session.reportedAbsent
              const location =
                session.locationName !== null && session.coachName !== null
                  ? `${session.locationName}${t(locale, 'schedule.home.urgentSeparator')}${session.coachName}`
                  : (session.locationName ?? session.coachName)
              const duration = durationMinutes(session)
              const reminderOn = hasReminder(session)
              const reminderLabel = reminderOn ? t(locale, 'schedule.home.reminderSet') : t(locale, 'schedule.home.reminderUnset')
              const absenceLabel = isAbsent ? t(locale, 'schedule.home.absentReported') : t(locale, 'schedule.home.absentQuestion')

              return (
                <div
                  key={`${session.id}:${session.studentId}`}
                  data-testid={`home-session-${session.id}-${session.studentId}`}
                  className="session-card bg-white dark:bg-slate-900 rounded-3xl p-3.5 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 relative overflow-hidden transition-all duration-300"
                >
                  {/* THE LEADING ACTION, which is not the same question on both kinds.
                      A lesson asks "נעדר/ת?" and writes an absence report; an event asks
                      for an RSVP, stored in a different table and answered on §5.12's own
                      screen where the fee and the consent text are. Sending an event id to
                      `POST /absence-reports` would 404, so this is a branch and not a
                      relabelled button. */}
                  {isEvent ? (
                    <a
                      href="#/events"
                      data-testid={`home-event-rsvp-${session.id}-${session.studentId}`}
                      aria-label={`${t(locale, 'schedule.home.eventOpen')} ${session.studentName}`}
                      className={`flex flex-col items-center justify-center p-2 rounded-2xl w-16 shrink-0 border transition-all cursor-pointer ${
                        session.rsvp === 'yes'
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                          : session.rsvp === 'no'
                            ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                            : 'bg-blue-50 dark:bg-blue-400/15 border-blue-100 dark:border-blue-400/25 text-[#0056c5] dark:text-blue-300'
                      }`}
                    >
                      <Trophy className="w-4 h-4" aria-hidden="true" />
                      <span className="text-[10px] font-bold mt-0.5 text-center leading-tight">
                        {session.rsvp === 'yes'
                          ? t(locale, 'schedule.home.eventRsvpYes')
                          : session.rsvp === 'no'
                            ? t(locale, 'schedule.home.eventRsvpNo')
                            : t(locale, 'schedule.home.eventPending')}
                      </span>
                    </a>
                  ) : (
                  <button
                    type="button"
                    disabled={isAbsent || isCancelled}
                    onClick={() => onOpenAbsence(session)}
                    data-testid={`home-absence-${session.id}`}
                    aria-label={`${absenceLabel} ${session.studentName}`}
                    className={`absence-action-btn flex flex-col items-center justify-center p-2 rounded-2xl w-16 shrink-0 border transition-all cursor-pointer ${
                      isAbsent
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700 cursor-default'
                        : isCancelled
                          ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 cursor-default'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100 active:scale-95 border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    {isAbsent ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700 mt-0.5">{t(locale, 'schedule.home.absentReported')}</span>
                      </>
                    ) : isCancelled ? (
                      <>
                        <CalendarX className="w-4 h-4 text-slate-400 dark:text-slate-400" />
                        <span className="text-[11px] font-medium mt-0.5">{t(locale, 'schedule.home.absentQuestion')}</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        <span className="text-[11px] font-medium mt-0.5">{t(locale, 'schedule.home.absentQuestion')}</span>
                      </>
                    )}
                  </button>
                  )}

                  {/* Middle Info Details */}
                  <div className="flex-1 text-start">
                    <div className="flex items-center justify-start gap-2">
                      {/* THE FAST PATH TO A CHILD'S CARD (owner review, 2026-09-06). The
                          alternative was a side menu; the answer is that the name is
                          already on screen at the moment a parent is thinking about that
                          child, so it is the link. Profile → המתאמנים → the child still
                          works; this is one tap from the screen they open every day. */}
                      <a
                        href={`#/student/${session.studentId}`}
                        data-testid={`home-child-${session.studentId}`}
                        className="font-bold text-base text-slate-900 dark:text-slate-50 hover:underline underline-offset-2 cursor-pointer"
                      >
                        {session.studentName}
                      </a>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          isCancelled
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            : isEvent
                              ? 'bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 font-semibold'
                              : isAbsent
                              ? 'bg-amber-100 text-amber-900 font-semibold'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isCancelled
                          ? t(locale, 'schedule.home.statusCancelled')
                          : isEvent
                            ? t(locale, 'schedule.home.eventBadge')
                            : isAbsent
                              ? t(locale, 'schedule.home.statusReported')
                              : t(locale, 'schedule.home.statusScheduled')}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-50 mt-0.5">{session.groupName}</p>
                    {isCancelled ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{session.cancelledReason}</p>
                    ) : null}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5 gap-2 flex-wrap">
                      {location !== null ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#0056c5] shrink-0" />
                          <span>{location}</span>
                        </div>
                      ) : null}

                      {/* Personal Device Calendar Reminder Button */}
                      {isCancelled ? null : (
                        <button
                          type="button"
                          onClick={() => onOpenReminder(session)}
                          data-testid={`home-reminder-${session.id}`}
                          aria-label={`${reminderLabel} ${session.studentName}`}
                          title={t(locale, 'schedule.home.reminderTitle')}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                            reminderOn
                              ? 'bg-blue-50 text-[#0056c5] border-blue-200 shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-[#0056c5] border-slate-200/80 dark:border-slate-700'
                          }`}
                        >
                          <Bell className={`w-3 h-3 ${reminderOn ? 'fill-blue-600 text-blue-600' : 'text-slate-400'}`} />
                          <span>{reminderLabel}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Time & Belt Rank Bar */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-end">
                      <div className="text-base font-bold text-slate-900 dark:text-slate-50 leading-none">{timeLabel(session)}</div>
                      {duration !== null ? (
                        <div className="text-[11px] text-slate-400 dark:text-slate-400 font-medium mt-1">
                          {duration} {t(locale, 'schedule.home.minutesShort')}
                        </div>
                      ) : null}
                    </div>
                    {/* Belt Rank Bar */}
                    {session.beltColorHex !== null ? (
                      <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: session.beltColorHex }}></div>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            /* Empty State Container */
            <div
              data-testid="home-empty"
              className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 mt-3 p-6"
            >
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/70 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-slate-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mt-2">{t(locale, 'schedule.home.emptyTitle')}</h4>
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">{t(locale, 'schedule.home.emptyBody')}</p>
              <button
                type="button"
                onClick={onOpenMonth}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0056c5] bg-blue-50 px-3.5 py-2 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" />
                <span>{t(locale, 'schedule.home.emptyCta')}</span>
              </button>
            </div>
          )}
        </div>
      </main>
      {/* END: Main Content */}

      {/* Floating Action Button. The prototype's own document is ALSO `dir="rtl"`
          (index.html), and it still writes the physical `left-4` — CSS `left`/`right` never
          respond to `dir`, so that button sits at the screen's true left edge regardless.
          Under `dir="rtl"`, Tailwind's logical `start-*` resolves to the RIGHT
          (inset-inline-start) and `end-*` resolves to the LEFT (inset-inline-end) — so
          `start-4` would flip the button to the opposite corner from the prototype. `end-4`
          is the one that lands it on the same physical left edge. */}
      {/* `bottom-20` was 80px, measured from the viewport bottom — and the tab bar is 66px
          in a browser but ~100px on a notched iPhone once `env(safe-area-inset-bottom)` is
          added to it (2026-09-06). So this button sat ~20px BEHIND the bar and read as
          missing. The clearance now grows with the bar instead of being a number that was
          true on the day it was written. */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] end-4 z-30">
        <button
          type="button"
          onClick={onReportAbsenceRange}
          data-testid="home-fab"
          className="flex items-center gap-2 bg-[#001849] text-white px-4 py-3 rounded-full shadow-lg hover:bg-[#0d2c6c] active:scale-95 transition-all text-sm font-semibold tracking-wide cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>{t(locale, 'schedule.home.reportAbsence')}</span>
        </button>
      </div>
    </>
  )
}
