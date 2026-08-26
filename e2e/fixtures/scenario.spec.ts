import { expect, test } from '@playwright/test'

import { buildScenario } from './scenario'

/**
 * The scenario builder's own gate, for the same reason `fixtures.spec.ts` exists: every
 * flow reads through this, so a break here should be named here rather than surfacing as a
 * missing charge three files away.
 */
test.describe('the scenario builder', () => {
  test('reaches a materialized schedule and open tuition charges owned by a persona', async ({
    request,
  }) => {
    const scenario = await buildScenario(request)

    // Two rules a week from 2026-09-01 to the end of the training year. The exact count is
    // the calendar's business; what this asserts is that materialization ran at all.
    expect(scenario.sessionIds.length).toBeGreaterThan(10)

    // §5.10's run charges every `active` enrollment, so a charge here proves the whole
    // chain behind it: group, schedule, price plan, trial booking, conversion, enrollment.
    expect(scenario.chargeIds.length).toBeGreaterThan(0)
    expect(scenario.monthlyAmountAgorot).toBe(32000)

    // The payer is a persona this suite can sign in as. That is the property the whole
    // fixture exists for — a charge owned by a person with no login is a charge no parent
    // app can ever show.
    expect(scenario.payerPersonId).toBe(scenario.parentPersonId)
  })

  test('builds an isolated scenario each time it is called', async ({ request }) => {
    // There is one reset per run (see global-setup.ts), so isolation is by construction:
    // two scenarios must share no group, no student and no charge, or two tests asserting
    // on "the" roster would be asserting on each other's.
    const first = await buildScenario(request)
    const second = await buildScenario(request)

    expect(second.groupId).not.toBe(first.groupId)
    expect(second.studentId).not.toBe(first.studentId)
    expect(second.chargeIds).not.toEqual(first.chargeIds)
  })
})
