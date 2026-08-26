import { expect, test } from '@playwright/test'

import { buildScenario, readRoster, readSession } from './scenario'

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

  test('sets up §5.6’s three protections when asked', async ({ request }) => {
    const scenario = await buildScenario(request, { withProtections: true })
    const protections = scenario.protections!

    expect(protections.pastSessionId).toBeTruthy()
    expect(protections.manuallyEditedSessionId).toBeTruthy()
    expect(protections.adHocSessionId).toBeTruthy()

    // Asserted through the API before any screen reads them, because
    // `tests/contracts/test_w2_schemas.py` puts both flags on `SessionOut` precisely so
    // the client can draw the lock — if they are not true here, E2E-5 is unassertable and
    // the reason is the fixture rather than the UI.
    const moved = await readSession(request, protections.manuallyEditedSessionId)
    expect(moved.is_manually_edited).toBe(true)

    const adHoc = await readSession(request, protections.adHocSessionId)
    expect(adHoc.is_ad_hoc).toBe(true)

    // The held session is asserted by its REGISTER and not by `attendance_taken`, which is
    // hardcoded `False` in `ScheduleService.project_sessions` — its docstring still says
    // "`attendance_taken` is False for every row in W2 ... M5 fills the field", and M5 has
    // landed (`app/models/_pending/` is empty, `app/models/attendance.py` is real) without
    // filling it. So the flag is false for every session in the product, and asserting it
    // would be asserting a bug.
    //
    // The register is the better assertion anyway: §5.14's sessions-held-vs-planned report
    // reads these rows, so a regenerated past session does not merely lose a time, it
    // changes a number the club may already have acted on. That is the thing to protect.
    const roster = await readRoster(request, protections.pastSessionId)
    expect(roster.roster.filter((entry) => entry.status !== 'unmarked').length).toBeGreaterThan(0)
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
