// The arithmetic פרופיל does before it draws anything. Pure, and tested, because a
// percentage is the one thing on this screen a parent will quote back at the club.
import type { AttendanceSummary, ProfileChild } from './types'

/** One row of `GET /me/attendance`. */
export type AttendanceRow = {
  student_id: string
  session_id: string
  group_name: string
  starts_at: string
  status: string
}

/**
 * `unmarked` is NOT an absence.
 *
 * The register's four states are `unmarked`, `present`, `absent_excused` and
 * `absent_unexcused`, and `unmarked` means exactly one thing: nobody opened the register.
 * Counting it in the denominator would publish a falling attendance percentage to a family
 * whose only fault is that a coach has not marked Tuesday yet — and the number would drift
 * back up on its own days later, which is the kind of statistic that destroys trust in every
 * other number on the screen.
 *
 * So the denominator is MARKED sessions, and `attendanceHint` says so on the card.
 */
const MARKED = new Set(['present', 'absent_excused', 'absent_unexcused'])

export function summariseAttendance(
  rows: readonly AttendanceRow[],
  children: readonly ProfileChild[],
): AttendanceSummary[] {
  return children.map((child) => {
    const mine = rows.filter((row) => row.student_id === child.id && MARKED.has(row.status))
    const attended = mine.filter((row) => row.status === 'present').length
    const marked = mine.length
    return {
      studentId: child.id,
      attended,
      marked,
      // Integer percent, rounded once. `0/0` is 0 and not NaN — a child with nothing marked
      // has no attendance record, which the card says in words rather than as "NaN%".
      percent: marked === 0 ? 0 : Math.round((attended / marked) * 100),
    }
  })
}

/**
 * The family's surname, for the header — or `null`.
 *
 * The same rule בית's greeting uses, and for the same reason: "משפחת כהן" is a claim about
 * the household, and a blended family with two surnames is one this header cannot name.
 */
export function familyNameOf(surnames: readonly string[]): string | null {
  const distinct = new Set(surnames.filter((name) => name.trim() !== ''))
  return distinct.size === 1 ? [...distinct][0]! : null
}


/** One charge, narrowed to what the coverage question needs. */
export type CoverageCharge = {
  kind: string
  status: string
  period_year?: number | null
  period_month?: number | null
}

/**
 * "Am I straight with the club, and until when?"
 *
 * THIS REPLACED A BOOKKEEPER'S SUMMARY. The first build of תשלומים led with
 * "סך החיובים ₪1,280 / שולם ₪960", and the owner's review said the filling made no sense —
 * correctly, because a family does not think in charged-versus-paid. They think "am I
 * sorted", and the honest answer depends on HOW they pay:
 *
 *   צ׳קים        paid for the season up front — covered until next June, nothing to do
 *   מזומן        three months ahead — covered until December, nothing to do
 *   הוראת קבע    charged automatically each month
 *   אשראי        the only one where an outstanding balance is a thing to act on
 *
 * So the answer is a SENTENCE, and it comes from the tuition charges: the furthest month
 * already settled is the month a family is covered to. `period_year`/`period_month` are on
 * every tuition charge and this is what they are for.
 *
 * `owed` wins over everything: a family with an open balance is not covered, whatever the
 * calendar says, and telling them "משולם עד יוני" above a debt would be the app arguing
 * with itself.
 */
export type Coverage =
  | { kind: 'owed'; balanceAgorot: number; openChargeCount: number }
  | { kind: 'covered'; year: number; month: number }
  | { kind: 'settled' }

export function coverageFrom(
  balanceAgorot: number,
  openChargeCount: number,
  charges: readonly CoverageCharge[],
): Coverage {
  if (balanceAgorot > 0) return { kind: 'owed', balanceAgorot, openChargeCount }

  let best: { year: number; month: number } | null = null
  for (const charge of charges) {
    // Tuition only. A settled registration fee or a גי says nothing about which MONTHS of
    // training are paid for, and counting one would claim coverage a family does not have.
    if (charge.kind !== 'tuition' || charge.status !== 'settled') continue
    const year = charge.period_year
    const month = charge.period_month
    if (typeof year !== 'number' || typeof month !== 'number') continue
    if (best === null || year > best.year || (year === best.year && month > best.month)) {
      best = { year, month }
    }
  }
  // Nothing owed and no settled tuition to point at — a family that has just joined, or one
  // whose club does not raise monthly charges. "Nothing outstanding" is the whole truth.
  return best === null ? { kind: 'settled' } : { kind: 'covered', ...best }
}
