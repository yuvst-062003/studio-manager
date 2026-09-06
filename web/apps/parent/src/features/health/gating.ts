// Who still owes a health declaration — the two predicates, without the gate.
//
// **Extracted from `HealthGate.tsx` when §6.1's blocking gate became the join wizard**
// (2026-09-06). The gate COMPONENT is gone: consent, registration, the declaration and the
// club's terms are four steps of one wizard now, mounted in front of the app by `App.tsx`
// and written by the one `POST /me/students/register` that already adopts children who
// exist. These predicates outlived it because three other callers ask the same question —
// `Resolve`, פרופיל's trainee cards and door A's booking flow — and the reason they share
// ONE predicate has not changed: two spellings of "does this child still owe something" is
// how a screen comes to disagree with the screen it links to.
//
// SPEC §5.5 is why the answer matters: "A guardian cannot use the parent app for a student
// until that student's declaration is signed." And its other half, which these keep: a
// missing declaration never blocks anything on the mat.
import type { HealthStatus } from './healthClient'

export type GatedStudent = {
  id: string
  display_name: string
  /** §5.4a's funnel state. `'trial'` is the one value that changes what the gate does with
   *  a short-form declaration — see the header. Optional so a caller that genuinely has no
   *  status (a test fixture, a shape from before this field) is treated as enrolled, which
   *  is the safe direction: it gates. */
  status?: string
  health_status: HealthStatus
  /**
   * `הסכם הרשמה` — registration, health and the club's terms, all three, computed by the
   * server on `/me/students`.
   *
   * **Optional, and `undefined` falls back to the health-only rule.** A caller that predates
   * this field (a test fixture, a cached response) still gates correctly on the declaration
   * rather than sailing past on a value it never sent. Defaulting the other way would open
   * the gate for exactly the callers that know least.
   */
  agreement_complete?: boolean | null
}

/**
 * The first student still owing a full declaration, or `null` when nobody does.
 *
 * **First, not all.** §6.1's first run is a sequence a parent walks once, and a screen that asked
 * for three children's declarations at once is a screen nobody finishes. The gate reappears for
 * the next child on submit, which is the same routing decision made again.
 */
export function needsFullDeclaration(student: GatedStudent): boolean {
  // The short form covers a child for as long as they are still trying the club out. Checked
  // FIRST, and before the agreement: §5.4a's trial funnel asked three questions on a phone an
  // hour ago, and sending that family into a three-step registration agreement is exactly the
  // over-strictness this function was fixed for once already.
  if (student.health_status === 'trial_signed' && student.status === 'trial') return false

  // `הסכם הרשמה`: the club's own form asks for registration details and its `תקנון` as well
  // as the health declaration, and its single signature covers all three. A family that signed
  // the declaration but never gave a ת.ז. has not signed the club's agreement.
  if (typeof student.agreement_complete === 'boolean') return !student.agreement_complete

  // No agreement status in this shape — fall back to the health-only rule, which gates.
  return student.health_status !== 'signed'
}

export function firstStudentNeedingDeclaration(students: readonly GatedStudent[]): GatedStudent | null {
  return students.find(needsFullDeclaration) ?? null
}
