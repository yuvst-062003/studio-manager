import { expect, test } from '@playwright/test'

/**
 * SPEC §13, flow 1 — "Public registration → health declaration → manager approval →
 * student active."
 *
 * **Gate for:** W2 (as E2E-1a, without the health step) and W3 (complete, with it).
 * **Filled in by:** M3 People & funnel, then M4 Health.
 * **Artboards:** `13a`/`13c` דף נחיתה · `12j` הרשמה ראשונה · `13b` אחרי השליחה ·
 * `12c` הצהרת בריאות · `6c` מרכז התראות · `4a` כרטיס חניך.
 *
 * This is the only flow that starts with a stranger. Everything about it is shaped by
 * §5.3's rule that **the parent signs in before filling anything in**: an anonymous form
 * would create a person nobody can later prove owns the record, and §5.2's account linking
 * exists precisely so the same Google account resolves to the same guardian next term.
 *
 * The assertions are deliberately about **state transitions a manager can see**, not about
 * the API. A registration that produced the right rows and never appeared in the approval
 * queue is the failure this flow exists to catch.
 */

test.describe('E2E-1 · registration to active student', () => {
  test('a stranger registers, signs the declaration, and a manager makes them active', async ({
    page,
  }) => {
    test.fixme(true, 'W2 · lane PEOPLE (M3) and W3 · lane HEALTH (M4) fill this in')

    // -- the public landing page (13a / 13c) ------------------------------------
    await page.goto('/register/demo-studio')
    await expect(page.getByTestId('landing-title')).toBeVisible()

    // §5.3 — sign-in first. The form does not exist for an anonymous visitor, because a
    // registration nobody can be matched to is a row the manager cannot action.
    await expect(page.getByTestId('registration-form')).toBeHidden()
    await page.getByTestId('sign-in-google').click()

    // -- the form (12j) ---------------------------------------------------------
    await page.getByTestId('child-first-name').fill('דנה')
    await page.getByTestId('child-last-name').fill('כהן')
    await page.getByTestId('child-birthdate').fill('2016-04-12')
    await page.getByTestId('group-select').selectOption({ label: 'ג׳ודו/מתחילים' })
    await page.getByTestId('registration-submit').click()

    // -- after the send (13b) ---------------------------------------------------
    // §5.3: the parent is told what happens next. "Submitted" with no next step is where a
    // funnel leaks — the parent does not know whether to wait or to phone the club.
    await expect(page.getByTestId('registration-received')).toBeVisible()
    await expect(page.getByTestId('next-step-health-declaration')).toBeVisible()

    // -- the health declaration (12c) -------------------------------------------
    await page.getByTestId('start-health-declaration').click()
    await page.getByTestId('health-question-asthma-no').click()
    await page.getByTestId('health-question-allergy-yes').click()
    await page.getByTestId('health-allergy-detail').fill('אגוזים')
    await page.getByTestId('signature-pad').click() // drawn signature, §5.5
    await page.getByTestId('health-submit').click()
    await expect(page.getByTestId('health-signed')).toBeVisible()

    // -- the manager approves (6c → 4a) -----------------------------------------
    await page.goto('/dashboard/alerts')
    const request = page.getByTestId('approval-card').filter({ hasText: 'דנה כהן' })
    await expect(request).toBeVisible()
    await request.getByTestId('approve').click()

    // §5.4 — approval is what makes a student `active`. Until then they are a lead, and
    // §5.10's billing run must not have charged them.
    await page.goto('/dashboard/students')
    const row = page.getByTestId('student-row').filter({ hasText: 'דנה כהן' })
    await expect(row.getByTestId('student-status')).toHaveText('פעיל')

    // §5.5's privacy split, asserted on the screen a coach actually sees: the flag is
    // visible, the answer that produced it is not.
    await expect(row.getByTestId('health-badge')).toHaveAttribute('data-status', 'signed')
    await expect(page.getByText('אגוזים')).toBeHidden()
  })

  test('an unapproved registration is never billed', async ({ page }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) closes this half')

    // §5.10 step 1: the run charges "every `active` enrollment". A lead that gets a tuition
    // charge is a stranger receiving a debt reminder for a club they never joined — the
    // single most damaging bug this flow can hide, and it is invisible from the funnel
    // screens because everything there looks correct.
    await page.goto('/dashboard/billing/runs')
    await page.getByTestId('run-now').click()
    await expect(page.getByTestId('run-status')).toHaveText('הסתיימה')

    await page.goto('/dashboard/billing/debt')
    await expect(page.getByTestId('debt-row').filter({ hasText: 'דנה כהן' })).toHaveCount(0)
  })
})
