import { describe, expect, it } from 'vitest'
import { CAPABILITIES, MONEY_CAPABILITIES, can, isCoach } from './permissions'
import type { Actor } from './permissions'

/**
 * SPEC §3.2's matrix, as predicates.
 *
 * The client half. The server is authoritative and every endpoint enforces this
 * independently — these predicates decide what to *render*, never what to *allow*. A
 * button hidden here and unguarded there is still a hole; a button shown here and guarded
 * there is only an ugly error message.
 */

const owner: Actor = { role: 'owner', personId: 'p-owner', groupIds: [] }
const manager: Actor = { role: 'manager', personId: 'p-manager', groupIds: [] }
const leadCoach: Actor = { role: 'lead_coach', personId: 'p-lead', groupIds: ['g1'] }
const assistant: Actor = { role: 'assistant_coach', personId: 'p-asst', groupIds: ['g1'] }
const guardian: Actor = {
  role: 'guardian',
  personId: 'p-parent',
  groupIds: [],
  studentIds: ['s1'],
}

describe('§3.2 — the hard rule: coaches never see money', () => {
  /**
   * **Invariant 3, on the client.** "No charge, payment, debt or price is reachable from
   * any coach-scoped endpoint or screen."
   *
   * Written as a loop over every money capability rather than one assertion per row, so a
   * capability added later is covered the moment it is added to `MONEY_CAPABILITIES`.
   */
  it.each(MONEY_CAPABILITIES)('refuses %s to a lead coach', (capability) => {
    expect(can(leadCoach, capability)).toBe(false)
  })

  it.each(MONEY_CAPABILITIES)('refuses %s to an assistant coach', (capability) => {
    expect(can(assistant, capability)).toBe(false)
  })

  it('allows money capabilities to a manager and an owner', () => {
    // The other half. A rule tightened until it refuses everyone is not a rule.
    for (const capability of MONEY_CAPABILITIES) {
      expect(can(manager, capability)).toBe(true)
      expect(can(owner, capability)).toBe(true)
    }
  })

  it('has a non-empty money list, so the loops above are not vacuous', () => {
    expect(MONEY_CAPABILITIES.length).toBeGreaterThan(0)
  })
})

describe('§3.2 — health', () => {
  it('lets every coach read derived flags', () => {
    // §5.5 — the ⚠ badge on the roster is the coach's entire health surface.
    expect(can(leadCoach, 'health.readFlags')).toBe(true)
    expect(can(assistant, 'health.readFlags')).toBe(true)
  })

  it('refuses the full declaration to every coach', () => {
    // §3.2 — full declarations are owner/manager only, and every read is audit-logged.
    expect(can(leadCoach, 'health.readFull')).toBe(false)
    expect(can(assistant, 'health.readFull')).toBe(false)
    expect(can(manager, 'health.readFull')).toBe(true)
  })
})

describe('§3.2 — where lead and assistant coaches differ', () => {
  it('lets only a lead coach edit a session', () => {
    expect(can(leadCoach, 'session.edit')).toBe(true)
    expect(can(assistant, 'session.edit')).toBe(false)
  })

  it('lets only a lead coach record belt exam results', () => {
    expect(can(leadCoach, 'belt.recordExam')).toBe(true)
    expect(can(assistant, 'belt.recordExam')).toBe(false)
  })

  it('lets both take attendance', () => {
    expect(can(leadCoach, 'attendance.write')).toBe(true)
    expect(can(assistant, 'attendance.write')).toBe(true)
  })
})

describe('§3.2 — guardian is resolved per record, not granted', () => {
  it('lets a guardian see their own child', () => {
    expect(can(guardian, 'student.view', { studentId: 's1' })).toBe(true)
  })

  it('refuses a guardian another family’s child', () => {
    expect(can(guardian, 'student.view', { studentId: 's2' })).toBe(false)
  })

  it('refuses a guardian the studio-wide student list', () => {
    // "own" in the guardian column always means "only for my own children".
    expect(can(guardian, 'student.viewAll')).toBe(false)
    expect(can(manager, 'student.viewAll')).toBe(true)
  })

  it('lets only a guardian pre-report an absence', () => {
    // §3.2 — the one capability that is guardian-only. A coach marking a child absent is
    // attendance, which is a different capability with different §10.5 conflict rules.
    expect(can(guardian, 'absence.preReport')).toBe(true)
    expect(can(leadCoach, 'absence.preReport')).toBe(false)
    expect(can(manager, 'absence.preReport')).toBe(false)
  })

  it('lets a guardian see their own child’s charges but not the studio’s', () => {
    expect(can(guardian, 'billing.view', { studentId: 's1' })).toBe(true)
    expect(can(guardian, 'billing.view', { studentId: 's2' })).toBe(false)
    expect(can(guardian, 'billing.recordPayment')).toBe(false)
  })
})

describe('§3.2 — group scoping', () => {
  it('limits a coach to their own groups', () => {
    expect(can(leadCoach, 'student.viewInGroup', { groupId: 'g1' })).toBe(true)
    expect(can(leadCoach, 'student.viewInGroup', { groupId: 'g2' })).toBe(false)
  })

  it('does not limit a manager, who sees every group', () => {
    expect(can(manager, 'student.viewInGroup', { groupId: 'g2' })).toBe(true)
  })

  it('refuses a scoped capability when no scope is supplied', () => {
    // Fail closed. An omitted scope is a bug at the call site, and defaulting to "allow"
    // would render a coach every group in the studio.
    expect(can(leadCoach, 'student.viewInGroup')).toBe(false)
  })
})

describe('isCoach', () => {
  it('is true for both coach roles and false for everyone else', () => {
    expect(isCoach(leadCoach)).toBe(true)
    expect(isCoach(assistant)).toBe(true)
    expect(isCoach(manager)).toBe(false)
    expect(isCoach(guardian)).toBe(false)
  })
})

describe('the capability list', () => {
  it('rejects an unknown capability rather than allowing it', () => {
    // Fail closed on a typo. `can(actor, 'billing.veiw')` must not be `true`.
    // @ts-expect-error — deliberately not a Capability
    expect(can(owner, 'billing.veiw')).toBe(false)
  })

  it('is exported so a screen can enumerate what it may offer', () => {
    expect(CAPABILITIES.length).toBeGreaterThan(0)
  })
})
