import { expect, test } from '@playwright/test'

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
 * asserts both fields reach `SessionOut`. Without them the client cannot draw the lock, and
 * this flow is unassertable from the API alone.
 *
 *   **past** — a session that happened has attendance rows against it. Regenerating it
 *   rewrites a register a coach already signed.
 *   **manually edited** — someone moved this one class deliberately, usually because of a
 *   room clash. A rule change that silently undoes that is the product overruling a human
 *   who knew something it did not.
 *   **ad hoc** — a one-off class that no rule created, so no rule may remove it.
 *
 * The impact preview is asserted **before** the confirmation, because §5.6's dialog exists
 * to state what is protected and why, not merely to count rows. A manager who cannot see
 * that the past is safe will not press the button.
 */

test.describe('E2E-5 · a schedule change rewrites only the future', () => {
  test('future sessions move, and past, edited and ad-hoc ones do not', async ({ page }) => {
    test.fixme(true, 'W2 · lane SCHEDULE (M2) fills this in')

    await page.goto('/dashboard/groups/demo-beginners')
    await expect(page.getByTestId('weekly-rules')).toBeVisible()

    // Set the scene the flow is actually about: one session already held, one deliberately
    // moved, one one-off. A test run against a clean group proves nothing, because there is
    // nothing to protect.
    await expect(page.getByTestId('session-row').filter({ hasText: 'הסתיים' })).not.toHaveCount(0)
    const edited = page.getByTestId('session-row').filter({ hasText: 'נערך ידנית' })
    const adHoc = page.getByTestId('session-row').filter({ hasText: 'שיעור חד־פעמי' })
    await expect(edited).not.toHaveCount(0)
    await expect(adHoc).not.toHaveCount(0)
    const editedTime = await edited.first().getByTestId('session-time').textContent()
    const adHocTime = await adHoc.first().getByTestId('session-time').textContent()

    // -- change the rule (6a) -------------------------------------------------------
    await page.getByTestId('rule-row').first().getByTestId('start-time').fill('18:00')
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

    await impact.getByTestId('confirm').click()

    // -- what changed, and what did not ---------------------------------------------
    const future = page.getByTestId('session-row').filter({ hasText: 'מתוכנן' }).first()
    await expect(future.getByTestId('session-time')).toContainText('18:00')

    await expect(edited.first().getByTestId('session-time')).toHaveText(editedTime ?? '')
    await expect(adHoc.first().getByTestId('session-time')).toHaveText(adHocTime ?? '')

    // The past keeps its attendance. §5.14's sessions-held-vs-planned report reads these
    // rows, so a regenerated past session does not merely lose a time — it changes a number
    // the club may already have acted on.
    const held = page.getByTestId('session-row').filter({ hasText: 'הסתיים' }).first()
    await expect(held.getByTestId('attendance-taken')).toBeVisible()
  })

  test('the parent’s calendar shows the new time and keeps the old one for past classes', async ({
    page,
  }) => {
    test.fixme(true, 'W2 · lane SCHEDULE (M2) fills this in')

    // §5.6's change is only real when the family sees it. Artboard `12b` is the screen a
    // parent checks the night before, and a schedule change that updates the dashboard and
    // not the parent app is how a child arrives an hour early.
    await page.goto('/parent/calendar')
    await expect(page.getByTestId('upcoming-session').first().getByTestId('time')).toContainText(
      '18:00',
    )
    await expect(page.getByTestId('past-session').first().getByTestId('time')).not.toContainText(
      '18:00',
    )
  })

  test('a closure cancels sessions and is never applied without the manager ticking it', async ({
    page,
  }) => {
    test.fixme(true, 'W2 · lane SCHEDULE (M2) fills this in')

    // §5.6 — holiday presets are **offered**, never applied. The copy in
    // `he/schedule.ts` is phrased as an offer for this reason, and a preset that applied
    // itself would close a club that trains through the holiday.
    await page.goto('/dashboard/closures')
    await page.getByTestId('holiday-presets').click()
    await expect(page.getByTestId('preset-day')).not.toHaveCount(0)
    await expect(page.getByTestId('preset-day').first()).not.toBeChecked()

    await page.getByTestId('preset-day').first().check()
    await page.getByTestId('apply-presets').click()

    await page.goto('/dashboard/schedule')
    await expect(page.getByTestId('session-row').filter({ hasText: 'בוטל' })).not.toHaveCount(0)
  })
})
