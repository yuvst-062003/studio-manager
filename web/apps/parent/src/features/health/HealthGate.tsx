// §5.5's gate — **a hard block in the PARENT app only.**
//
// SPEC §5.5, first line: "This is a hard gate. A guardian cannot use the parent app for a student
// until that student's declaration is signed. On first login, if any linked student has
// `health_status = missing`, the app routes to the declaration flow and no other screen is
// reachable."
//
// **And nothing on the mat is ever blocked.** The same section: "A missing declaration never
// blocks anything in the app. The roster shows a ⚠ … The coach can still mark them present." The
// two rules are not in tension — this component is in `web/apps/parent/`, there is no equivalent
// in the staff app, and there is deliberately no `block_attendance_without_health` setting for
// either to read.
//
// **`trial_signed` gates once the child is no longer on a trial, and not before.** §5.5 names
// the condition twice — "if any linked student has `health_status = missing`" (SPEC:688) and
// "one per child with health_status = missing" (SPEC:1315) — and SPEC:626 supplies the other
// half: "The trial declaration is not sufficient for enrollment … converting requires the full
// form." So a converted child holding the short form is gated, which is the case the gate is
// for; a child who is still ON the trial is not, because three questions on a phone is exactly
// what §5.4a asked of them an hour ago.
//
// This used to gate everything short of `signed`, which is stricter than either sentence, and
// the extra strictness had a concrete cost: §5.4a's booking funnel writes `status='trial'` +
// `health_status='trial_signed'` (app/services/people/trials.py), and §6.3's reduced trial home
// renders only when every child is `status: 'trial'`. The two conditions could never both hold,
// so `TrialHome` was unreachable in a running app — the `dev+trial` persona walked into a full
// declaration form instead of the screen it exists to exercise.
//
// Chasing is a different question from blocking, and `app/workers/health_reminders.py` is right
// to keep nagging a `trial_signed` family for the full form.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
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

export type HealthGateProps = {
  students: readonly GatedStudent[]
  children: ReactNode
  /**
   * The one join wizard, opened on this family.
   *
   * **A render function, and a prop rather than an import.** Until 2026-09-12 this gate
   * rendered `AgreementFlow` — a second, five-step onboarding flow with its own chrome,
   * its own rail and its own registration and declaration screens. A manager who joined
   * through the redesigned three-step wizard and then opened the app was thrown into it,
   * and reasonably reported the app had reverted to an older version. It had not; there
   * were simply two flows, and the gate rendered the older one.
   *
   * There is one now. The gate's job is the DECISION — who is blocked, and when the app
   * opens again — and that is all that is left here. What to show is the shell's, which is
   * where the wizard's client, source and billing dependencies already live; passing a
   * node would construct it on every render of an unblocked app, so it is a function.
   */
  wizard: (blocked: GatedStudent) => ReactNode
}

export function HealthGate({ students, children, wizard }: HealthGateProps) {
  const blocked = useMemo(() => firstStudentNeedingDeclaration(students), [students])

  if (!blocked) return <>{children}</>

  return (
    // `children` is not rendered at all — not hidden, not disabled, not behind an overlay. §5.5
    // says "no other screen is reachable", and a screen that is merely covered is one CSS bug
    // away from being reachable.
    //
    // No card, no heading and no explanatory paragraph above it any more: the wizard opens on
    // its own step 1 and says who it is for. The old pair — a gate card AND a flow that
    // re-introduced itself underneath — was two headings for one task.
    <div data-testid="health-gate">{wizard(blocked)}</div>
  )
}
