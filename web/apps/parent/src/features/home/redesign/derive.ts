// Everything בית has to work out before it can draw anything. Pure functions in their own
// module, with no React and no `fetch`, because this is where the prototype's fiction meets
// the API and it is the half that can actually be wrong.
//
// `HomeTop` and `HomeSchedule` are presentational and take finished values. That split is
// deliberate: the markup is a port and is verified by looking at it, and this is verified by
// tests, because no screenshot can show that a lesson was filed under the wrong day.
import { studioDayKey } from '@studio/core'
import { MONTH_NAME, WEEKDAY_LETTER } from './content'
import type { HomeChild, HomeSession, StripDay } from './types'

/** A lesson as `GET /sessions` returns it, narrowed to the fields בית reads. */
export type Lesson = {
  id: string
  groupName: string
  startsAt: string
  endsAt?: string | null
  locationName?: string | null
  coachName?: string | null
  status?: 'scheduled' | 'cancelled' | 'completed'
  cancelReason?: string | null
}

/** What the family has already told the club, keyed `<sessionId>:<studentId>`. The same
 *  shape `Resolve` already builds from `GET /me/attendance-intents`. */
export type Intents = Readonly<Record<string, 'coming' | 'not_coming'>>

/**
 * `YYYY-MM-DD` → the weekday index `WEEKDAY_LETTER` is indexed by (Sunday = 0).
 *
 * Parsed at MIDDAY UTC, never midnight. `new Date('2026-08-25')` is midnight UTC, which is
 * still 24 August in a negative-offset zone and 25 August in Jerusalem — the same one-day
 * slip `studioDayKey`'s own note describes, arrived at from the other direction. Midday has
 * no offset anywhere that can move the date.
 */
export function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay()
}

/** `YYYY-MM-DD` → the day of the month, as an integer. */
export function dayOfMonthOf(dayKey: string): number {
  return Number(dayKey.slice(8, 10))
}

/** `YYYY-MM-DD` + n → the key n days later. Midday arithmetic, for the reason above. */
export function shiftDay(dayKey: string, days: number): string {
  const at = new Date(`${dayKey}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * One lesson becomes one row PER MATCHING CHILD.
 *
 * The join is by group NAME because that is the only one the API offers: `/me/students`
 * returns `group_names` and `GET /sessions` returns `group_name`, neither carries the
 * other's id. `ParentHome` already matches this way.
 *
 * A lesson that matches none of the family's children is dropped rather than shown
 * unattributed — `GET /sessions?scope=mine` narrows to the groups the family is enrolled
 * in, so a non-match means the child left the group mid-season and the row is stale.
 */
export function expandSessions(
  lessons: readonly Lesson[],
  children: readonly HomeChild[],
  intents: Intents,
  cancelReasonLabel: (reason: string | null) => string,
): HomeSession[] {
  const rows: HomeSession[] = []
  for (const lesson of lessons) {
    for (const child of children) {
      if (!child.groupNames.includes(lesson.groupName)) continue
      rows.push({
        id: lesson.id,
        studentId: child.id,
        // The FULL name, not the first — the prototype's cards and its absence sheet both
        // print "דנה כהן". Only the filter chips are first-name-only, because a chip is a
        // short label in a row of them and the surname is the same on all three.
        studentName: child.displayName,
        groupName: lesson.groupName,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt ?? null,
        locationName: lesson.locationName ?? null,
        coachName: lesson.coachName ?? null,
        beltColorHex: child.beltColorHex,
        reportedAbsent: intents[`${lesson.id}:${child.id}`] === 'not_coming',
        cancelledReason:
          lesson.status === 'cancelled' ? cancelReasonLabel(lesson.cancelReason ?? null) : null,
      })
    }
  }
  // Earliest first. Two children in one group tie on `startsAt`, so the name breaks it and
  // the order stops depending on which child the roster happened to list first.
  return rows.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.studentName.localeCompare(b.studentName),
  )
}

/**
 * The seven-day strip, positioned exactly as the prototype draws it: **today is the third
 * chip**, with two days behind and four ahead.
 *
 * Two behind and not zero, because the prototype's strip shows them and because a parent
 * checking "did I report yesterday" is the reason the strip exists at all. Four ahead
 * rather than six so the week the chips cover is the one the schedule read below actually
 * fetched.
 */
export function buildWeekStrip(todayKey: string, sessions: readonly HomeSession[]): StripDay[] {
  const withSessions = new Set(sessions.map((session) => studioDayKey(session.startsAt)))
  return Array.from({ length: 7 }, (_, index) => {
    const dayKey = shiftDay(todayKey, index - 2)
    return {
      dayKey,
      dayOfMonth: dayOfMonthOf(dayKey),
      weekday: weekdayOf(dayKey),
      isToday: dayKey === todayKey,
      hasSessions: withSessions.has(dayKey),
    }
  })
}

/** `2026-08-25` → `יום ג׳ • 25 באוגוסט 2026`, which is what the prototype prints. */
export function headlineFor(dayKey: string): string {
  const month = MONTH_NAME[Number(dayKey.slice(5, 7)) - 1] ?? ''
  return `יום ${WEEKDAY_LETTER[weekdayOf(dayKey)]} • ${dayOfMonthOf(dayKey)} ב${month} ${dayKey.slice(0, 4)}`
}

/** A session's length in whole minutes, or `null` when it has no end. */
export function durationMinutesOf(session: HomeSession): number | null {
  if (!session.endsAt) return null
  const minutes = Math.round(
    (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000,
  )
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null
}

/**
 * The family's surname, for the greeting — or `null`.
 *
 * `null` unless EVERY child shares one surname. "משפחת כהן" is a claim about the household,
 * and a blended family with two surnames is a household this greeting cannot name; the
 * screen then says שלום alone, which is true. Guessing from the first child would put one
 * parent's name on the other parent's phone.
 */
export function familyNameOf(surnames: readonly string[]): string | null {
  const distinct = new Set(surnames.filter((name) => name.trim() !== ''))
  return distinct.size === 1 ? [...distinct][0]! : null
}

/** The children whose declaration the urgent banner has to name, by first name. */
export function childrenNeedingDeclaration<T extends { firstName: string }>(
  children: readonly T[],
  needsOne: (child: T) => boolean,
): string[] {
  return children.filter(needsOne).map((child) => child.firstName)
}

/** One cell of the month grid. `null` days are the blanks before the 1st. */
export type MonthCell = {
  dayKey: string
  dayOfMonth: number
  hasSessions: boolean
  isToday: boolean
}

/**
 * The month grid the calendar modal draws: the blanks before the 1st, then every day.
 *
 * The prototype hardcodes August 2026 and its six leading blanks in the JSX. Computing it
 * is not a liberty — the modal has a month navigator, so the very first thing a parent does
 * is move to a month whose shape is different.
 *
 * `month` is 1-BASED, like `charge.period_month` and `formatMonthLabel` and every other
 * month value in this codebase except JS `Date`'s — which is the one this signature keeps
 * callers away from.
 */
export function monthGrid(
  year: number,
  month: number,
  sessions: readonly HomeSession[],
  todayKey: string,
): { leadingBlanks: number; cells: MonthCell[] } {
  const withSessions = new Set(sessions.map((session) => studioDayKey(session.startsAt)))
  const mm = String(month).padStart(2, '0')
  const firstKey = `${year}-${mm}-01`
  // Days in the month, without a leap-year table: day 0 of the NEXT month is the last day
  // of this one. Midday UTC, for the reason `weekdayOf` gives.
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate()

  const cells: MonthCell[] = []
  for (let day = 1; day <= lastDay; day += 1) {
    const dayKey = `${year}-${mm}-${String(day).padStart(2, '0')}`
    cells.push({
      dayKey,
      dayOfMonth: day,
      hasSessions: withSessions.has(dayKey),
      isToday: dayKey === todayKey,
    })
  }
  return { leadingBlanks: weekdayOf(firstKey), cells }
}

/** `2026-08-25` → `{ year: 2026, month: 8 }`, month 1-based. */
export function monthOf(dayKey: string): { year: number; month: number } {
  return { year: Number(dayKey.slice(0, 4)), month: Number(dayKey.slice(5, 7)) }
}

/** Move a `{year, month}` by n months, keeping month 1-based and wrapping the year. */
export function shiftMonth(
  at: { year: number; month: number },
  months: number,
): { year: number; month: number } {
  const zeroBased = at.year * 12 + (at.month - 1) + months
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}
