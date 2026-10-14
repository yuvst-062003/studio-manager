// Open charges, grouped the way a manager collects: by the person who pays.
//
// **One row per payer, not per child** — the rule §5.10 already states for the dashboard's
// collections list: a family with two children owes one balance and is asked for it once,
// at one door, by one person. The staff app does this on the device over one page of
// charges rather than asking the server for a shape it does not have, which also means the
// grouping and the family sheet read the identical rows.
import type { OpenCharge } from './cashClient'

/** What the list needs of a student: who they are and who pays for them.
 *  `guardian_display_names` is primary-first, so the first one is the payer in every
 *  family this product actually has. */
export type NamedStudent = {
  id: string
  first_name: string
  last_name: string
  guardian_display_names?: string[]
}

export type Household = {
  payerPersonId: string
  /** The guardian's name, or the children's when no guardian is on file — never an empty
   *  row. A manager chasing a debt with no name on it is the defect this replaces. */
  title: string
  studentNames: string[]
  /** `amount - allocated`, summed. §4.3 settles a charge by its allocations, so a part-paid
   *  charge contributes what is left of it and not its face value. */
  owedAgorot: number
  charges: OpenCharge[]
  /** The oldest unpaid period, as `YYYY-MM`, or null for charges with no period at all
   *  (a handed-over judogi has none). "Three months behind" is a different conversation
   *  from "this month", which is the whole reason this is on the row. */
  oldestPeriod: string | null
  monthsOwed: number
}

export function outstandingAgorot(charge: OpenCharge): number {
  return Math.max(0, charge.amount_agorot - (charge.allocated_agorot ?? 0))
}

function periodKey(charge: OpenCharge): string | null {
  if (charge.period_year === null || charge.period_month === null) return null
  return `${charge.period_year}-${String(charge.period_month).padStart(2, '0')}`
}

export function householdsFrom(
  charges: readonly OpenCharge[],
  students: readonly NamedStudent[] = [],
): Household[] {
  const studentById = new Map(students.map((student) => [student.id, student]))
  const byPayer = new Map<string, OpenCharge[]>()
  for (const charge of charges) {
    if (outstandingAgorot(charge) === 0) continue
    const rows = byPayer.get(charge.payer_person_id) ?? []
    rows.push(charge)
    byPayer.set(charge.payer_person_id, rows)
  }

  const households = [...byPayer].map(([payerPersonId, rows]) => {
    const family = [...new Set(rows.map((row) => row.student_id).filter((id) => id !== null))]
      .map((id) => studentById.get(id as string))
      .filter((student): student is NamedStudent => student !== undefined)
    const studentNames = family.map((student) => `${student.first_name} ${student.last_name}`.trim())
    const guardian = family.flatMap((student) => student.guardian_display_names ?? [])[0]
    const periods = rows.map(periodKey).filter((key): key is string => key !== null)
    return {
      payerPersonId,
      title: guardian ?? studentNames[0] ?? '',
      studentNames,
      owedAgorot: rows.reduce((sum, row) => sum + outstandingAgorot(row), 0),
      // Oldest first inside a family: the sheet is read top to bottom and the months a
      // manager ticks are the old ones.
      charges: [...rows].sort((a, b) => a.due_date.localeCompare(b.due_date)),
      oldestPeriod: periods.length > 0 ? periods.reduce((a, b) => (a < b ? a : b)) : null,
      monthsOwed: new Set(periods).size,
    }
  })

  // Biggest debt first — the list is a queue of conversations, and the longest one is the
  // one worth having before the evening ends.
  return households.sort((a, b) => b.owedAgorot - a.owedAgorot)
}

/** The methods that reach this club BY HAND (owner, 2026-10-14): "recording a payment is
 *  only cash or cheques and also standing order, because credit card you see in the app".
 *  A card payment records itself through uPay's notification, and the server refuses it on
 *  the manual route — `ManualPaymentIn` accepts every method except `upay_card`. */
export const COLLECTED_BY_HAND = ['cash', 'cheque', 'standing_order'] as const

/** What came in during the month `when` falls in, by hand. The one number a manager wants
 *  at the end of an evening, summed on the device from rows already read; card income is
 *  real income and is counted on `סיכום כספי`, which says total and splits it by method. */
export function collectedInMonth(
  payments: readonly RecordedPaymentLike[],
  now: Date,
  methods: readonly string[] = COLLECTED_BY_HAND,
): number {
  const year = now.getFullYear()
  const month = now.getMonth()
  return payments
    .filter((payment) => methods.includes(payment.method))
    .filter((payment) => {
      const at = new Date(payment.received_at)
      return at.getFullYear() === year && at.getMonth() === month
    })
    .reduce((sum, payment) => sum + payment.amount_agorot, 0)
}

type RecordedPaymentLike = { method: string; amount_agorot: number; received_at: string }


/** The name this had before standing orders joined it (2026-10-14). Kept so the first
 *  tests written against it still say what they meant. */
export const cashThisMonth = collectedInMonth
