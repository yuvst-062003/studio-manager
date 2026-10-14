// How a family's open charges turn into payments, when the family does not pay one way.
//
// **The ledger's rule, not a UI preference**: a payment row carries one payer and one
// method (`app/models/billing.py::PAYMENT_METHODS`), so a family paying cheques for one
// child and cash for the other is two rows — which is also what you want when the cheque
// bounces next week and has to be reversed on its own. The owner's words, 2026-10-14:
// "the same family paid with cheques for one child and cash for the other".
//
// The club already knows which way each child pays: `student.payment_method`, collected by
// the join wizard or set by a manager at conversion, read here through the manager-only
// `GET /payment-methods` (NOT through `GET /students`, which is coach-reachable and which
// SPEC §13's third invariant keeps every financial field off).
import type { OpenCharge } from './cashClient'
import { outstandingAgorot } from './households'

/** The methods a human records by hand. `upay_card` is deliberately absent: a card payment
 *  records itself through uPay's notification, and `ManualPaymentIn` refuses it. */
export const MANUAL_METHODS = ['cash', 'cheque', 'standing_order'] as const
export type ManualMethod = (typeof MANUAL_METHODS)[number]

export const DEFAULT_METHOD: ManualMethod = 'cash'

/** One payment this sheet is about to write: a method, an amount, and the charges it
 *  settles. Named after what it is rather than after the request it becomes, because the
 *  screen shows these lines to a human before anything is sent. */
export type PlannedPayment = {
  method: ManualMethod
  amountAgorot: number
  chargeIds: string[]
  /** Whose charges these are — the label beside the line. Empty for charges with no
   *  student (a manual charge raised against the payer rather than a child). */
  childNames: string[]
}

/** `student_id` → how that child pays. Missing or unknown values fall back to cash rather
 *  than blocking: a child nobody has been asked about still has money handed over for
 *  them, and the sheet lets the manager change the method in one tap. */
export type MethodByStudent = ReadonlyMap<string, string | null>

function manual(method: string | null | undefined): ManualMethod {
  return (MANUAL_METHODS as readonly string[]).includes(method ?? '')
    ? (method as ManualMethod)
    : DEFAULT_METHOD
}

/**
 * Group the chosen charges into one planned payment per method.
 *
 * Order matters and is deliberate: the methods come out in `MANUAL_METHODS` order, not in
 * the order the charges happen to arrive, so the two lines a manager reads before pressing
 * are in the same place every evening.
 */
export function planPayments(
  charges: readonly OpenCharge[],
  methodByStudent: MethodByStudent,
  names: ReadonlyMap<string, string>,
  override?: ManualMethod,
): PlannedPayment[] {
  const byMethod = new Map<ManualMethod, PlannedPayment>()
  for (const charge of charges) {
    const method =
      override ?? manual(charge.student_id ? methodByStudent.get(charge.student_id) : null)
    const line = byMethod.get(method) ?? {
      method,
      amountAgorot: 0,
      chargeIds: [],
      childNames: [],
    }
    line.amountAgorot += outstandingAgorot(charge)
    line.chargeIds.push(charge.id)
    const name = charge.student_id ? names.get(charge.student_id) : undefined
    if (name && !line.childNames.includes(name)) line.childNames.push(name)
    byMethod.set(method, line)
  }
  return MANUAL_METHODS.map((method) => byMethod.get(method)).filter(
    (line): line is PlannedPayment => line !== undefined,
  )
}

/** The charges of one family, grouped by child, in the order the sheet draws them: the
 *  children by name, then anything with no child on it. */
export function groupByChild(
  charges: readonly OpenCharge[],
  names: ReadonlyMap<string, string>,
  methodByStudent: MethodByStudent,
): Array<{ studentId: string | null; name: string; method: ManualMethod; charges: OpenCharge[] }> {
  const groups = new Map<string, OpenCharge[]>()
  for (const charge of charges) {
    const key = charge.student_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), charge])
  }
  return [...groups]
    .map(([key, rows]) => ({
      studentId: key === '' ? null : key,
      name: key === '' ? '' : (names.get(key) ?? ''),
      method: manual(key === '' ? null : methodByStudent.get(key)),
      charges: rows,
    }))
    .sort((a, b) => (a.studentId === null ? 1 : b.studentId === null ? -1 : a.name.localeCompare(b.name, 'he')))
}
