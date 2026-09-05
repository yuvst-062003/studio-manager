// בית — the redesigned parent home, composed. Checkpoint 2 of the parent-app redesign.
//
// This file owns the screen's STATE and its writes; `HomeTop` and `HomeSchedule` are ported
// markup and own neither. The split is what lets the two halves be verified differently: the
// markup by looking at it beside the prototype, this by `derive.test.ts` and the absence
// tests, because no screenshot can show that a lesson was filed under the wrong day or that
// a refusal was swallowed.
//
// It deliberately does NOT fetch. `Resolve` already reads students, sessions, intents and
// the balance for the old home and is the one place holding `useSession`; a second reader
// here would be a second `/auth/refresh` on every visit and two answers about what the
// family owes.
import { useCallback, useMemo, useState } from 'react'
import { formatMonthLabel, formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { HomeTop } from './HomeTop'
import { HomeSchedule } from './HomeSchedule'
import { AbsenceModal } from './AbsenceModal'
import { MonthCalendarModal } from './MonthCalendarModal'
import { AllDayAbsenceSheet } from './AllDayAbsenceSheet'
import type { DayAbsenceOutcome } from './AllDayAbsenceSheet'
import type { AbsenceFailure } from './AbsenceModal'
import { ReminderSheet, readReminders, writeReminder } from './ReminderSheet'
import type { LeadTime } from './ReminderSheet'
import { MONTH_NAME, WEEKDAY_LETTER } from './content'
import {
  buildWeekStrip,
  dayOfMonthOf,
  durationMinutesOf,
  expandSessions,
  headlineFor,
  monthOf,
  shiftMonth,
  weekdayOf,
} from './derive'
import type { Intents, Lesson } from './derive'
import type { HomeChild, HomeSession, HomeUrgent } from './types'

/** The writes בית makes. One narrow interface so the screen can be tested without a fetch. */
export type HomeWriter = {
  reportAbsence: (sessionId: string, studentId: string, reason: string) => Promise<void>
}

export function HomeScreen({
  locale,
  clubName,
  familyName,
  childList,
  lessons,
  lessonsFailed,
  intents,
  urgent,
  debtLabel,
  unreadCount,
  todayKey,
  writer,
  cancelReasonLabel,
  onAbsenceReported,
  onRetry,
}: {
  locale: Locale
  clubName: string
  familyName: string | null
  /** `null` while the roster is still loading — not `[]`, which is a family with no
   *  children and draws a legitimately empty screen. */
  childList: readonly HomeChild[] | null
  lessons: readonly Lesson[] | null
  lessonsFailed: boolean
  intents: Intents
  urgent: HomeUrgent
  debtLabel: string | null
  unreadCount: number
  /** `YYYY-MM-DD` in the studio's zone. Passed in rather than read from the clock here, so
   *  a test can put the screen on a Tuesday without stubbing `Date`. */
  todayKey: string
  writer: HomeWriter
  cancelReasonLabel: (reason: string | null) => string
  onAbsenceReported: () => void
  onRetry: () => void
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayKey)
  const [absenceTarget, setAbsenceTarget] = useState<HomeSession | null>(null)
  const [absenceBusy, setAbsenceBusy] = useState(false)
  const [absenceFailure, setAbsenceFailure] = useState<AbsenceFailure>(null)
  const [reminderTarget, setReminderTarget] = useState<HomeSession | null>(null)
  // §4: "calendar is a modal inside Home". `null` is closed; otherwise the month on screen,
  // which is NOT the same as the selected day's month once the arrows have been used.
  const [monthOpen, setMonthOpen] = useState<{ year: number; month: number } | null>(null)
  // The whole-day report: which day it is for, and what each of its writes came back with.
  const [dayAbsenceFor, setDayAbsenceFor] = useState<string | null>(null)
  const [dayTargets, setDayTargets] = useState<readonly DayAbsenceOutcome[]>([])
  const [dayOutcomes, setDayOutcomes] = useState<readonly DayAbsenceOutcome[] | null>(null)
  const [dayBusy, setDayBusy] = useState(false)
  const [reminders, setReminders] = useState<Record<string, LeadTime>>(() => readReminders())

  const allSessions = useMemo(
    () =>
      childList === null || lessons === null
        ? []
        : expandSessions(lessons, childList, intents, cancelReasonLabel),
    [lessons, childList, intents, cancelReasonLabel],
  )

  const strip = useMemo(() => buildWeekStrip(todayKey, allSessions), [todayKey, allSessions])

  // The day AND the child filter, in that order. `selectedChildId === null` is "all".
  const visible = useMemo(
    () =>
      allSessions.filter(
        (session) =>
          studioDayKey(session.startsAt) === selectedDayKey &&
          (selectedChildId === null || session.studentId === selectedChildId),
      ),
    [allSessions, selectedDayKey, selectedChildId],
  )

  /**
   * What the whole-day report is about — CAPTURED WHEN THE SHEET OPENS, not derived.
   *
   * It used to be a `useMemo` over the current sessions, which is correct right up until the
   * writes land: each reported lesson then drops out of its own filter, the list empties,
   * and the sheet's header announced "כל 0 הילדים" above two successful reports. The set a
   * batch was about does not change because the batch succeeded.
   */
  const openDayAbsence = useCallback(
    (dayKey: string) => {
      setDayOutcomes(null)
      setDayAbsenceFor(dayKey)
      setDayTargets(
        allSessions
          .filter(
            (session) =>
              studioDayKey(session.startsAt) === dayKey &&
              (selectedChildId === null || session.studentId === selectedChildId) &&
              !session.reportedAbsent &&
              session.cancelledReason === null,
          )
          .map((session) => ({
            sessionId: session.id,
            studentId: session.studentId,
            studentName: session.studentName,
            groupName: session.groupName,
            timeLabel: formatTimeInStudioZone(session.startsAt, locale),
            state: 'pending' as const,
          })),
      )
    },
    [allSessions, selectedChildId, locale],
  )

  const state: 'ready' | 'loading' | 'failed' = lessonsFailed
    ? 'failed'
    : childList === null || lessons === null
      ? 'loading'
      : 'ready'

  const submitAbsence = useCallback(
    (reason: string) => {
      const target = absenceTarget
      if (!target) return
      setAbsenceBusy(true)
      setAbsenceFailure(null)
      // §10.2 — no queue, and the offline case is answered BEFORE the request rather than
      // as a network error, because refusing is the designed behaviour and not a fallback.
      if (globalThis.navigator?.onLine === false) {
        setAbsenceBusy(false)
        setAbsenceFailure('offline')
        return
      }
      void writer
        .reportAbsence(target.id, target.studentId, reason)
        .then(() => {
          setAbsenceBusy(false)
          setAbsenceTarget(null)
          // The list is re-read rather than flipped locally: the server is what a coach
          // sees, and an optimistic tick the server later refused is the dead end §10.2
          // exists to prevent.
          onAbsenceReported()
        })
        .catch((error: unknown) => {
          setAbsenceBusy(false)
          const code = (error as { code?: string } | null)?.code
          setAbsenceFailure(
            code === 'too_late' || code === 'already_marked' ? code : 'unknown',
          )
        })
    },
    [absenceTarget, writer, onAbsenceReported],
  )

  /**
   * One tap, one write per (lesson, child) — and a result for each.
   *
   * SEQUENTIAL, not `Promise.all`. Each report is a POST that the server can refuse on its
   * own terms, and firing six at once at a rate-limited endpoint turns one late lesson into
   * six ambiguous failures. In order also means the list fills top to bottom, which is what
   * makes the progress legible while it runs.
   */
  const submitDayAbsence = useCallback(
    (reason: string) => {
      const targets = dayTargets
      if (targets.length === 0) return
      setDayBusy(true)
      if (globalThis.navigator?.onLine === false) {
        setDayBusy(false)
        setDayOutcomes(targets.map((row) => ({ ...row, state: 'failed' as const })))
        return
      }
      setDayOutcomes(targets)
      void (async () => {
        const done: DayAbsenceOutcome[] = []
        for (const target of targets) {
          try {
            await writer.reportAbsence(target.sessionId, target.studentId, reason)
            done.push({ ...target, state: 'recorded' })
          } catch (error: unknown) {
            const code = (error as { code?: string } | null)?.code
            done.push({
              ...target,
              state:
                code === 'too_late' || code === 'already_marked'
                  ? code
                  : ('failed' as const),
            })
          }
          // Published after every write, so the sheet shows the run rather than a spinner.
          setDayOutcomes([...done, ...targets.slice(done.length)])
        }
        setDayBusy(false)
        onAbsenceReported()
      })()
    },
    [dayTargets, writer, onAbsenceReported],
  )

  return (
    // The landmark and the testid `ParentHome` carried, kept deliberately. Two tests assert
    // `parent-home` is what rendered — one that a single-studio guardian skips the picker,
    // one that an unknown hash still lands on home — and both are about ROUTING, not about
    // which arrangement of home won. A fragment here would have quietly made them vacuous.
    <section aria-label={t(locale, 'common.home.title')} data-testid="parent-home">
      <HomeTop
        clubName={clubName}
        familyName={familyName}
        childList={childList ?? []}
        selectedChildId={selectedChildId}
        onSelectChild={setSelectedChildId}
        urgent={urgent}
        debtLabel={debtLabel}
        onUrgentAction={() => {
          // The banner's two halves have two destinations and the debt is the one with a
          // deadline, so it wins when both are outstanding.
          globalThis.location.hash = urgent.debtAgorot !== null ? '#/payments' : '#/'
        }}
        onReportAbsence={() => {
          globalThis.location.hash = '#/absence'
        }}
        unreadCount={unreadCount}
        onOpenNotifications={() => {
          // The prototype opens a coach-notifications modal. This product has one inbox and
          // it is a whole tab (§4), so the bell goes there rather than to a second, emptier
          // copy of it. Flagged at the checkpoint.
          globalThis.location.hash = '#/announcements'
        }}
      />

      <HomeSchedule
        days={strip}
        selectedDayKey={selectedDayKey}
        onSelectDay={setSelectedDayKey}
        onOpenMonth={() => setMonthOpen(monthOf(selectedDayKey))}
        headline={headlineFor(selectedDayKey)}
        sessions={visible}
        state={state}
        onRetry={onRetry}
        hasReminder={(session) => reminders[`${session.id}:${session.studentId}`] !== undefined}
        onOpenReminder={setReminderTarget}
        onOpenAbsence={(session) => {
          setAbsenceFailure(null)
          setAbsenceTarget(session)
        }}
        onReportAbsenceRange={() => {
          globalThis.location.hash = '#/absence'
        }}
        timeLabel={(session) => formatTimeInStudioZone(session.startsAt, locale)}
        durationMinutes={durationMinutesOf}
      />

      {absenceTarget ? (
        <AbsenceModal
          session={absenceTarget}
          dayLabel={dayLabelFor(studioDayKey(absenceTarget.startsAt))}
          timeLabel={formatTimeInStudioZone(absenceTarget.startsAt, locale)}
          busy={absenceBusy}
          failure={absenceFailure}
          onSubmit={submitAbsence}
          onClose={() => setAbsenceTarget(null)}
        />
      ) : null}

      {monthOpen ? (
        <MonthCalendarModal
          at={monthOpen}
          monthLabel={formatMonthLabel(monthOpen.year, monthOpen.month, locale)}
          // EVERY loaded session, not the day's: the grid's whole job is marking the month.
          sessions={allSessions}
          todayKey={todayKey}
          selectedDayKey={selectedDayKey}
          childList={childList ?? []}
          selectedChildId={selectedChildId}
          onSelectChild={setSelectedChildId}
          onSelectDay={(dayKey) => {
            setSelectedDayKey(dayKey)
            // The month follows the day, so picking the 1st from a trailing row does not
            // leave the grid on the month you just left.
            setMonthOpen(monthOf(dayKey))
          }}
          onShiftMonth={(months) => setMonthOpen((at) => (at ? shiftMonth(at, months) : at))}
          onToday={() => {
            setSelectedDayKey(todayKey)
            setMonthOpen(monthOf(todayKey))
          }}
          onClose={() => setMonthOpen(null)}
          timeLabel={(session) => formatTimeInStudioZone(session.startsAt, locale)}
          dayHeadline={headlineFor(selectedDayKey)}
          onReportWholeDay={() => openDayAbsence(selectedDayKey)}
          onShowOnHome={() => setMonthOpen(null)}
          onReportSession={(session) => {
            setAbsenceFailure(null)
            setAbsenceTarget(session)
          }}
        />
      ) : null}

      {dayAbsenceFor ? (
        <AllDayAbsenceSheet
          targets={dayTargets}
          childNames={[...new Set(dayTargets.map((row) => row.studentName))]}
          dayLabel={dayLabelFor(dayAbsenceFor)}
          busy={dayBusy}
          outcomes={dayOutcomes}
          onSubmit={submitDayAbsence}
          onClose={() => {
            setDayAbsenceFor(null)
            setDayOutcomes(null)
            setDayTargets([])
          }}
        />
      ) : null}

      {reminderTarget ? (
        <ReminderSheet
          session={reminderTarget}
          locale={locale}
          current={reminders[`${reminderTarget.id}:${reminderTarget.studentId}`] ?? null}
          onChoose={(lead) => {
            const key = `${reminderTarget.id}:${reminderTarget.studentId}`
            setReminders(writeReminder(key, lead))
          }}
          onClose={() => setReminderTarget(null)}
        />
      ) : null}
    </section>
  )
}

/** `2026-08-25` → `25 באוגוסט`, the short form the absence sheet's date pill prints. */
function dayLabelFor(dayKey: string): string {
  return `${dayOfMonthOf(dayKey)} ב${MONTH_NAME[Number(dayKey.slice(5, 7)) - 1] ?? ''}`
}

/** Re-exported so `Resolve` can build a headline without importing two modules. */
export { headlineFor, weekdayOf, WEEKDAY_LETTER }
export type { HomeSession }
