/**
 * SPEC §3.2's permission matrix, as predicates.
 *
 * **These decide what to render, never what to allow.** The server enforces every one of
 * these independently, and it is authoritative. A button hidden here but unguarded there
 * is still a hole; a button shown here and guarded there is only an ugly error message. So
 * this module is a UX affordance and is written to be obviously so.
 *
 * **`guardian` is not a role.** §3.2: "it is the permission set that applies to a person
 * **for the specific students they are a guardian of**, resolved per-record rather than
 * granted." That is why `can()` takes a scope argument and why guardian capabilities are
 * false without one — "own" always means "only for my own children".
 *
 * **Everything fails closed.** An unknown capability, a missing scope, an unrecognised
 * role: all `false`. The alternative — defaulting to allow when the lookup misses — turns
 * a typo like `billing.veiw` into a coach seeing the debt ledger.
 */

export type Role = 'owner' | 'manager' | 'lead_coach' | 'assistant_coach' | 'guardian'

export interface Actor {
  role: Role
  personId: string
  /** The groups a coach is assigned to. Empty for managers, who see every group. */
  groupIds: string[]
  /** The students a guardian is a guardian of. §3.2's "own children". */
  studentIds?: string[]
}

/** The record a capability is being asked about, where the answer depends on one. */
export interface Scope {
  groupId?: string
  studentId?: string
}

/**
 * §3.2's rows, one capability per row (and one per column where the columns differ).
 *
 * `as const` so `Capability` is a union and a typo is a compile error at the call site
 * rather than a silent `false` at runtime.
 */
export const CAPABILITIES = [
  'studio.manage',
  'structure.manage',
  'staff.manage',
  'student.viewAll',
  'student.viewInGroup',
  'student.view',
  'attendance.write',
  'absence.preReport',
  'session.edit',
  'event.create',
  'belt.recordExam',
  'health.readFlags',
  'health.readFull',
  'billing.view',
  'billing.recordPayment',
  'billing.runReconciliation',
  'billing.managePrices',
  'note.readWrite',
  'announcement.publish',
  'registration.approve',
  'privacy.export',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * §3.2's **hard rule**: "coaches never see money. No charge, payment, debt or price is
 * reachable from any coach-scoped endpoint or screen."
 *
 * Exported as a list rather than left implicit in the table below, so the test can loop
 * over it and a money capability added later is covered the moment it is added here. This
 * is invariant 3's client-side counterpart.
 */
export const MONEY_CAPABILITIES = [
  'billing.view',
  'billing.recordPayment',
  'billing.runReconciliation',
  'billing.managePrices',
] as const satisfies readonly Capability[]

const COACH_ROLES: readonly Role[] = ['lead_coach', 'assistant_coach']

export function isCoach(actor: Actor): boolean {
  return COACH_ROLES.includes(actor.role)
}

/**
 * §3.2 transcribed. A role appears in a capability's list exactly when its column is
 * ticked. `guardian` appearing means "own children only", which `can()` then resolves
 * against the scope — it never means studio-wide.
 */
const MATRIX: Record<Capability, readonly Role[]> = {
  'studio.manage': ['owner', 'manager'],
  'structure.manage': ['owner', 'manager'],
  'staff.manage': ['owner', 'manager'],
  'student.viewAll': ['owner', 'manager'],
  'student.viewInGroup': ['owner', 'manager', 'lead_coach', 'assistant_coach'],
  'student.view': ['owner', 'manager', 'lead_coach', 'assistant_coach', 'guardian'],
  'attendance.write': ['owner', 'manager', 'lead_coach', 'assistant_coach'],
  // §3.2's one guardian-exclusive row. A coach marking a child absent is `attendance.write`
  // — a different capability, with different §10.5 conflict rules.
  'absence.preReport': ['guardian'],
  'session.edit': ['owner', 'manager', 'lead_coach'],
  'event.create': ['owner', 'manager', 'lead_coach'],
  'belt.recordExam': ['owner', 'manager', 'lead_coach'],
  // §5.5 — the ⚠ badge is a coach's entire health surface, and both coach roles get it.
  'health.readFlags': ['owner', 'manager', 'lead_coach', 'assistant_coach', 'guardian'],
  // …and neither coach role gets the declaration itself. Every read is audit-logged.
  'health.readFull': ['owner', 'manager', 'guardian'],
  'billing.view': ['owner', 'manager', 'guardian'],
  'billing.recordPayment': ['owner', 'manager'],
  'billing.runReconciliation': ['owner', 'manager'],
  'billing.managePrices': ['owner', 'manager'],
  'note.readWrite': ['owner', 'manager', 'lead_coach', 'assistant_coach'],
  'announcement.publish': ['owner', 'manager', 'lead_coach'],
  'registration.approve': ['owner', 'manager'],
  'privacy.export': ['owner', 'manager', 'guardian'],
}

/** Capabilities whose answer, for a coach, depends on which group is being asked about. */
const GROUP_SCOPED: readonly Capability[] = ['student.viewInGroup']

/** Capabilities whose answer, for a guardian, depends on which student is being asked about. */
const STUDENT_SCOPED: readonly Capability[] = [
  'student.view',
  'health.readFlags',
  'health.readFull',
  'billing.view',
  'privacy.export',
]

/**
 * May `actor` do `capability`, optionally to the record named by `scope`?
 *
 * Fails closed throughout — see the module docstring.
 */
export function can(actor: Actor, capability: Capability, scope: Scope = {}): boolean {
  const allowed = MATRIX[capability]
  // An unknown capability is a typo at the call site. `undefined` here must not be truthy.
  if (!allowed || !allowed.includes(actor.role)) {
    return false
  }

  // §3.2 — "resolved per-record rather than granted". A guardian holds a capability only
  // for their own children, so without a student in scope the answer is no.
  if (actor.role === 'guardian' && STUDENT_SCOPED.includes(capability)) {
    if (!scope.studentId) return false
    return (actor.studentIds ?? []).includes(scope.studentId)
  }

  // A coach is limited to their own groups; a manager is not.
  if (isCoach(actor) && GROUP_SCOPED.includes(capability)) {
    if (!scope.groupId) return false
    return actor.groupIds.includes(scope.groupId)
  }

  return true
}
