// The birthday section above the task list — decision reversed 2026-09-06. This was
// previously left unbuilt on the grounds that the prototype's own list
// (`~/Downloads/staff-app/src/components/TasksView.tsx`'s `birthdayStudents`) is
// hand-authored and one of its entries carries a name and an id belonging to two
// different children. That was a defect in the PROTOTYPE'S FIXTURE, not a reason to skip
// the feature — the owner reversed the call, and `StudentSummaryOut.birthdate` is real
// data the students tab already fetches (`peopleClient.search`), so "whose birthday falls
// this week" needs no new endpoint and no backend work.
//
// Pure and locale-aware, the same shape every other function in `deriveTasks.ts` takes —
// but deliberately NOT a `TaskCard` and not exported alongside them: §4.4's central rule
// is "nothing is stored as a task", and a birthday is not a task in the first place (no
// one "completes" a birthday). It gets its own type, its own section, and its own file so
// that rule is not something a reviewer has to check by memory.
import { studioDayKey } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StudentSummary } from '../people'

export type BirthdayRow = {
  studentId: string
  name: string
  /** `group_names` joined, falling back to a "no group" sentence — never blank, the same
   *  courtesy `metaLine` (`StudentsSearch.tsx`) already extends a student with no class. */
  groupLabel: string
  /** The age this birthday turns them, not their current age. */
  turningAge: number
  isToday: boolean
  /** Already localized — "היום!", "מחר", or "בעוד N ימים". */
  dayLabel: string
  /** How many days from `today` this occurrence falls — 0..6 inside the window this
   *  module selects for. Kept alongside `dayLabel` for sorting; nothing renders it raw. */
  daysUntil: number
  /** The calendar year THIS occurrence falls in — what the greeted tick is keyed on
   *  (`birthdayGreetings.ts`), so marking a child greeted this week does not silently
   *  suppress their row again next year. */
  occursYear: number
}

const DAY_MS = 86_400_000
/** "The coming week" — today plus the next six days, inclusive. A birthday that already
 *  passed this week is not shown; the prototype's fixture mixed in "חגג אתמול" (a day
 *  already gone), which is a hand-authored artefact of that mock, not a rule to carry
 *  forward into real data. */
const WINDOW_DAYS = 7

/** `YYYY-MM-DD` for `month`/`day` in `year`, in UTC at noon so the result never drifts a
 *  day from a DST edge (the same technique `TodayScreen.tsx`'s `shiftDayKey` uses). A
 *  birthdate of February 29 in a non-leap `year` has no such day — `Date` would otherwise
 *  roll over into March, so this rolls back to the 28th instead: a day early beats a
 *  birthday silently relocating to a different month. */
function dayKeyAt(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCMonth() !== month - 1) {
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return date.toISOString().slice(0, 10)
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T12:00:00Z`)
  const to = Date.parse(`${toKey}T12:00:00Z`)
  return Math.round((to - from) / DAY_MS)
}

/** The next occurrence of `month`/`day` on or after `todayKey`. Checks THIS year first and
 *  rolls into next year for a birthday that already passed — a December 29th looking at a
 *  January 2nd birthday is 4 days out, not -362; without this a birthday early in the
 *  calendar year would never be found from late December, which is exactly when "the
 *  coming week" needs it most. */
function nextOccurrence(
  todayKey: string,
  month: number,
  day: number,
): { key: string; year: number; daysUntil: number } {
  const todayYear = Number(todayKey.slice(0, 4))
  for (const year of [todayYear, todayYear + 1]) {
    const key = dayKeyAt(year, month, day)
    const daysUntil = daysBetween(todayKey, key)
    if (daysUntil >= 0) return { key, year, daysUntil }
  }
  // Unreachable: next year's occurrence is always non-negative from any `todayKey`. Kept
  // as a typed fallback rather than a non-null assertion.
  const key = dayKeyAt(todayYear + 1, month, day)
  return { key, year: todayYear + 1, daysUntil: daysBetween(todayKey, key) }
}

function dayLabel(locale: Locale, daysUntil: number): string {
  if (daysUntil === 0) return t(locale, 'tasks.birthday.today')
  return plural(locale, 'tasks.birthday.inDays', daysUntil)
}

/** One row per student whose birthday falls inside the coming week, soonest first. A
 *  student with no `birthdate` on file (the field is nullable — a family that never gave
 *  one) is silently excluded rather than raised as a gap; there is no "missing birthdate"
 *  task and this section is a courtesy reminder, not an audit. */
export function upcomingBirthdays(
  students: StudentSummary[],
  todayIso: string,
  locale: Locale,
): BirthdayRow[] {
  const todayKey = studioDayKey(todayIso)
  const rows: BirthdayRow[] = []

  for (const student of students) {
    if (!student.birthdate) continue
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(student.birthdate)
    if (!match) continue
    const [, yearText, monthText, dayText] = match
    const birthYear = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)

    const occurrence = nextOccurrence(todayKey, month, day)
    if (occurrence.daysUntil >= WINDOW_DAYS) continue

    const groups = student.group_names ?? []
    rows.push({
      studentId: student.id,
      name: `${student.first_name} ${student.last_name}`,
      groupLabel: groups.length > 0 ? groups.join(' · ') : t(locale, 'tasks.birthday.noGroup'),
      turningAge: occurrence.year - birthYear,
      isToday: occurrence.daysUntil === 0,
      dayLabel: dayLabel(locale, occurrence.daysUntil),
      daysUntil: occurrence.daysUntil,
      occursYear: occurrence.year,
    })
  }

  return rows.sort((a, b) => a.daysUntil - b.daysUntil)
}
