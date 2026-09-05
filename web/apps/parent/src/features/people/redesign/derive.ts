// The arithmetic פרופיל does before it draws anything. Pure, and tested, because a
// percentage is the one thing on this screen a parent will quote back at the club.
import type { AttendanceSummary, ProfileChild, PurchaseRow } from './types'

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
 * A shop order's charges, newest first.
 *
 * `created_by === 'manual'` is what the shop's order endpoint writes — "one manual charge
 * per line", per §4.3. Tuition comes from a billing run and an event charge from an event,
 * so neither belongs in a purchase history; a family scanning what they BOUGHT should not
 * have to read past twelve months of fees to find a גי.
 */
export function purchasesFrom(
  charges: readonly {
    id: string
    label?: string | null
    amount_agorot: number
    due_date: string
    status: string
    created_by: string
  }[],
): PurchaseRow[] {
  return charges
    .filter((charge) => charge.created_by === 'manual')
    .map((charge) => ({
      id: charge.id,
      label: charge.label ?? '',
      amountAgorot: charge.amount_agorot,
      dueDate: charge.due_date,
      status: charge.status,
    }))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
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
