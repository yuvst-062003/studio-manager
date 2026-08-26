import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { signInAs } from './fixtures/auth'
import { buildScenario, readRoster, readSession } from './fixtures/scenario'

/**
 * SPEC §13, flow 5 — "Manager changes a group's schedule → future sessions update, past and
 * manually-edited sessions do not."
 *
 * **Gate for:** W2. **Filled in by:** M2 Schedule.
 * **Artboards:** `6a` עמוד קבוצה + לו״ז שבועי · `3a` לוח שבועי · `9a`/`1d` היום ·
 * `12b` לוח הילד.
 *
 * **Three protections, and each one is a different way to destroy history.** §5.6 makes a
 * rule change rewrite only future sessions, and `session` carries `is_manually_edited` and
 * `is_ad_hoc` for the other two cases — which is why `tests/contracts/test_w2_schemas.py`
 * asserts both fields reach `SessionOut`. Without them the client cannot draw the lock.
 *
 *   **past** — a session that happened has attendance rows against it. Regenerating it
 *   rewrites a register a coach already signed.
 *   **manually edited** — someone moved this one class deliberately, usually because of a
 *   room clash. A rule change that silently undoes that is the product overruling a human
 *   who knew something it did not.
 *   **ad hoc** — a one-off class that no rule created, so no rule may remove it.
 *
 * The impact preview is asserted **before** the confirmation, because §5.6's dialog exists
 * to state what is protected and why, not merely to count rows.
 *
 * ── What this file had to change from the M0 draft ────────────────────────────────────
 * The route is a hash. The draft opened `/dashboard/groups/demo-beginners`; the dashboard
 * routes on `location.hash` and the group page is `#/groups/<uuid>` — there is no slug and
 * no server route behind the path form.
 *
 * The testid vocabulary survived almost intact, which is worth saying because the other
 * four flows' did not: `weekly-rules`, `rule-row`, `start-time`, `save-rules`,
 * `impact-preview`, `impact-subtitle`, `protected-past`, `protected-manual`,
 * `protected-adhoc`, `first-affected-date`, `confirm`, `session-row` and `session-time` are
 * all real. `ImpactDialog` was built to this spec and it shows.
 *
 * The one assertion that had to move is the last: the draft ends on
 * `attendance-taken` for a held session, and no screen renders that because
 * `ScheduleService.project_sessions` hardcodes `attendance_taken=False` — its docstring
 * still says "M5 fills the field" and M5 landed without doing so. The register itself is
 * asserted instead, through `GET /sessions/{id}/attendance`, which is the stronger claim:
 * §5.14's sessions-held-vs-planned report reads those rows, so a regenerated past session
 * does not merely lose a time, it changes a number the club may already have acted on.
 */
test.describe('E2E-5 · a schedule change rewrites only the future', () => {
  test('future sessions move, and past, edited and ad-hoc ones do not', async ({
    context,
    page,
    request,
  }) => {
    const scenario = await buildScenario(request, { withProtections: true })
    const protections = scenario.protections!

    // What the three protected sessions look like BEFORE the change, read from the API so
    // the comparison afterwards is against a recorded fact rather than against the screen
    // agreeing with itself.
    const editedBefore = await readSession(request, protections.manuallyEditedSessionId)
    const adHocBefore = await readSession(request, protections.adHocSessionId)
    const heldBefore = await readSession(request, protections.pastSessionId)
    const registerBefore = await readRoster(request, protections.pastSessionId)
    const markedBefore = registerBefore.roster.filter((row) => row.status !== 'unmarked')
    expect(markedBefore.length).toBeGreaterThan(0)

    await signInAs(context, 'manager', 'dashboard')
    await page.goto(`${ORIGINS.dashboard}/#/groups/${scenario.groupId}`)

    await expect(page.getByTestId('weekly-rules')).toBeVisible()
    // The scene the flow is about: a session already held, one deliberately moved, one
    // one-off. A run against a clean group proves nothing, because there is nothing to
    // protect. Asserted on the screen, because the manager has to be able to see them.
    await expect(page.getByTestId('session-row').filter({ hasText: 'נערך ידנית' })).toHaveCount(1)
    await expect(page.getByTestId('session-row').filter({ hasText: 'שיעור חד־פעמי' })).toHaveCount(1)

    // -- change the rule (6a) -------------------------------------------------------
    // Both times, not just the start. The rule is 17:00–18:00, so moving the start alone
    // to 18:00 makes `end_time <= start_time`, which `ScheduleRuleIn` refuses — the M0
    // draft of this spec did exactly that and would have failed on a 422 rather than on
    // anything to do with §5.6. The class keeps its hour.
    const rule = page.getByTestId('rule-row').first()
    await rule.getByTestId('start-time').fill('18:00')
    await rule.getByTestId('end-time').fill('19:00')
    await page.getByTestId('save-rules').click()

    // -- §5.6's impact preview ------------------------------------------------------
    const impact = page.getByTestId('impact-preview')
    await expect(impact).toBeVisible()
    await expect(impact.getByTestId('impact-subtitle')).toHaveText(
      'השינוי יחול על שיעורים עתידיים בלבד',
    )
    // Named protections, not a single number. "12 sessions will change" tells a manager
    // nothing about whether last month survives.
    await expect(impact.getByTestId('protected-past')).toBeVisible()
    await expect(impact.getByTestId('protected-manual')).toBeVisible()
    await expect(impact.getByTestId('protected-adhoc')).toBeVisible()
    await expect(impact.getByTestId('first-affected-date')).toBeVisible()
    // The counts are the point of naming them: a preview that says nothing is protected,
    // over a group that has a held session and a hand-moved one, is a preview that would
    // let a manager press the button on a lie.
    await expect(impact.getByTestId('protected-past')).not.toContainText('0')
    await expect(impact.getByTestId('protected-manual')).toContainText('1')
    await expect(impact.getByTestId('protected-adhoc')).toContainText('1')

    await impact.getByTestId('confirm').click()
    await expect(impact).toBeHidden()

    // -- what changed, and what did not ---------------------------------------------
    // Read back through the API rather than off the screen: the screen shows Jerusalem
    // wall-clock and the stored value is UTC, and the thing being asserted is that the
    // ROW did or did not move.
    const editedAfter = await readSession(request, protections.manuallyEditedSessionId)
    expect(editedAfter.starts_at).toBe(editedBefore.starts_at)
    expect(editedAfter.is_manually_edited).toBe(true)

    const adHocAfter = await readSession(request, protections.adHocSessionId)
    expect(adHocAfter.starts_at).toBe(adHocBefore.starts_at)
    expect(adHocAfter.status).not.toBe('cancelled')

    const heldAfter = await readSession(request, protections.pastSessionId)
    expect(heldAfter.starts_at).toBe(heldBefore.starts_at)

    // The past keeps its register. This is the assertion the flow exists for.
    const registerAfter = await readRoster(request, protections.pastSessionId)
    const markedAfter = registerAfter.roster.filter((row) => row.status !== 'unmarked')
    expect(markedAfter.map((row) => [row.student_id, row.status])).toEqual(
      markedBefore.map((row) => [row.student_id, row.status]),
    )

    // And a future session really did move to 18:00 Jerusalem. Asserted on the screen,
    // because §5.6's change is only real when the manager can see it.
    await expect(
      page.getByTestId('session-row').filter({ hasText: '18:00' }).first(),
    ).toBeVisible()
  })

  test('the parent’s calendar shows the new time and keeps the old one for past classes', async ({
    browser,
    request,
  }) => {
    // §5.6's change is only real when the family sees it. Artboard `12b` is the screen a
    // parent checks the night before, and a schedule change that updates the dashboard and
    // not the parent app is how a child arrives an hour early.
    // A DIFFERENT parent from the test above. There is one reset per run, so a persona
    // reused across tests accumulates children — and `12b` is a per-family calendar, so
    // this test would then be reading the previous test's lessons alongside its own. §19.3
    // ships four guardian personas precisely so tests can be separate families.
    const scenario = await buildScenario(request, {
      parent: 'parent1',
      withProtections: true,
    })

    // A second context, not a second page. The refresh cookie is host-only and NOT
    // port-scoped, so a manager signed in on :5175 and a parent on :5174 share one jar and
    // the later sign-in takes both. Two people looking at two screens is two contexts.
    const managerContext = await browser.newContext()
    const parentContext = await browser.newContext()
    try {
      await signInAs(managerContext, 'manager', 'dashboard')
      await signInAs(parentContext, scenario.parentPersona, 'parent')

      const manager = await managerContext.newPage()
      await manager.goto(`${ORIGINS.dashboard}/#/groups/${scenario.groupId}`)
      const rule = manager.getByTestId('rule-row').first()
      await rule.getByTestId('start-time').fill('18:00')
      await rule.getByTestId('end-time').fill('19:00')
      await manager.getByTestId('save-rules').click()
      await manager.getByTestId('impact-preview').getByTestId('confirm').click()
      await expect(manager.getByTestId('impact-preview')).toBeHidden()

      const parent = await parentContext.newPage()
      await parent.goto(`${ORIGINS.parent}/#/calendar`)
      await expect(parent.getByTestId('child-calendar')).toBeVisible()

      // `upcoming-session` and `past-session` are real; the M0 draft's nested `time` testid
      // is not — the time is a bare span inside the row — so the row's own text carries it.

      // The past keeps the old hour. Asserted as "still 17:00–18:00", not as "not 18:00"
      // which the draft used: the old slot ENDED at 18:00, so a substring check for it
      // matches the very rows it is meant to exonerate.
      await expect(parent.getByTestId('past-session').first()).toContainText('17:00–18:00')

      // The hand-moved lesson kept its time in the parent app too — a protection the
      // dashboard honours and the parent app does not would send the child at the wrong
      // hour, which is exactly the failure `12b` exists to prevent.
      await expect(
        parent.getByTestId('upcoming-session').filter({ hasText: '19:30–20:30' }),
      ).toHaveCount(1)

      // `12b` is a MONTH view, so the new hour is not on this screen: the change bites from
      // today, and the only session left in this month is the protected one above. The
      // parent turns the page, which is what a parent checking next term actually does.
      await parent.getByTestId('calendar-next').click()
      await expect(parent.getByTestId('calendar-month')).toHaveText('2026-09')
      await expect(
        parent.getByTestId('upcoming-session').filter({ hasText: '18:00–19:00' }).first(),
      ).toBeVisible()
    } finally {
      await parentContext.close()
      await managerContext.close()
    }
  })

  test('a closure cancels sessions and is never applied without the manager ticking it', async ({
    context,
    page,
    request,
  }) => {
    // §5.6 — holiday presets are **offered**, never applied. The copy in `he/schedule.ts`
    // is phrased as an offer for this reason, and a preset that applied itself would close
    // a club that trains through the holiday.
    const scenario = await buildScenario(request)

    await signInAs(context, 'manager', 'dashboard')
    await page.goto(`${ORIGINS.dashboard}/#/closures`)

    await page.getByTestId('holiday-presets').click()
    const presets = page.getByTestId('preset-day')
    await expect(presets.first()).toBeVisible()
    // Offered, not applied: nothing is ticked until the manager ticks it.
    await expect(presets.first()).not.toBeChecked()

    await presets.first().check()
    await page.getByTestId('apply-presets').click()
    await expect(page.getByTestId('closure-row').first()).toBeVisible()

    // -- and a closure really does cancel the lesson ---------------------------------
    // A manual closure over a date this group actually trains on, rather than leaning on a
    // holiday preset: the presets are real Israeli holidays and whether one lands on this
    // group's Sunday or Tuesday is the calendar's business, so a run that happened to miss
    // would report a working cancellation it never observed.
    // The first session after today — the one a closure can still cancel. A past session
    // is protected, which is the same §5.6 rule this whole file is about.
    const upcoming = scenario.sessions.find((s) => Date.parse(s.starts_at) > Date.now())
    expect(upcoming, 'the scenario must have a future session to close').toBeTruthy()
    const closureDay = upcoming!.starts_at.slice(0, 10)

    await page.getByTestId('closure-from').fill(closureDay)
    await page.getByTestId('closure-to').fill(closureDay)
    await page.getByTestId('closure-reason').fill('סגירה לבדיקה')
    await page.getByTestId('add-closure').click()

    await page.goto(`${ORIGINS.dashboard}/#/groups/${scenario.groupId}`)
    await expect(
      page.getByTestId('session-row').filter({ hasText: 'בוטל' }).first(),
    ).toBeVisible()
  })
})
