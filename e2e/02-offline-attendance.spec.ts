import { expect, test } from '@playwright/test'

/**
 * SPEC §13, flow 2 — "Coach takes attendance **offline** → reconnects → marks sync →
 * dashboard reflects them."
 *
 * **Gate for:** W3. **Filled in by:** M5 Attendance.
 * **Artboards:** `1c`/`9f` נוכחות בשיעור · `4c` נוכחות — מה לא סומן · `1e` לוח מנהל.
 *
 * **This flow is the reason the offline queue exists, and the reason it is hard.** §10.3:
 * a coach's mark goes to `pending_ops` regardless of auth state, because the local write is
 * not an API call — a basement dojo has no signal and the register still has to work.
 *
 * Three properties are asserted rather than one, because the naive version of this test
 * passes on an implementation that would lose marks in production:
 *
 * 1. The mark is **visible immediately**, offline. A UI that waits for a server round trip
 *    has already failed the coach standing on the mat.
 * 2. The replay is **idempotent on `client_mark_id`** (§10.5). A queue that flushes twice
 *    must not produce two attendance rows, and §4.3 gives that column its own unique index
 *    separately from `(session_id, student_id)` for exactly this.
 * 3. A **parent pre-report is never overwritten by a bulk action**, regardless of timestamp
 *    (§10.5). This is the one conflict rule that is not last-write-wins, and it is the one a
 *    generic sync implementation gets wrong.
 */

test.describe('E2E-2 · offline attendance and sync', () => {
  test('marks taken with no signal survive, sync once, and reach the dashboard', async ({
    page,
    context,
  }) => {
    test.fixme(true, 'W3 · lane ATTENDANCE (M5) fills this in')

    await page.goto('/staff/today')
    await page.getByTestId('session-card').first().click()
    await expect(page.getByTestId('roster')).toBeVisible()

    // -- the signal goes ---------------------------------------------------------
    await context.setOffline(true)
    await expect(page.getByTestId('offline-banner')).toBeVisible()

    // §10.3 — the local write is not an API call. The mark lands now, not on reconnect.
    await page.getByTestId('student-row').nth(0).getByTestId('mark-present').click()
    await page.getByTestId('student-row').nth(1).getByTestId('mark-absent').click()
    await expect(page.getByTestId('student-row').nth(0).getByTestId('status')).toHaveText('נוכח')
    await expect(page.getByTestId('pending-ops-count')).toHaveText('2')

    // §10.6 — the queue must survive the app being killed, which on iOS is routine. A
    // reload with no network is the cheapest honest proxy for that.
    await page.reload()
    await expect(page.getByTestId('pending-ops-count')).toHaveText('2')

    // -- the signal comes back ---------------------------------------------------
    await context.setOffline(false)
    await expect(page.getByTestId('pending-ops-count')).toHaveText('0')
    await expect(page.getByTestId('offline-banner')).toBeHidden()

    // -- the dashboard sees them (1e / 4c) ---------------------------------------
    await page.goto('/dashboard/attendance')
    const session = page.getByTestId('session-attendance').first()
    await expect(session.getByTestId('present-count')).toHaveText('1')
    await expect(session.getByTestId('absent-count')).toHaveText('1')

    // §5.14 — `unmarked` is a real state and is not absence. The remaining roster is
    // unmarked, and a report that counted them as absent would be wrong in the direction
    // that blames the coach.
    await expect(session.getByTestId('unmarked-count')).not.toHaveText('0')
  })

  test('a double flush of the same mark creates one row, not two', async ({ page, context }) => {
    test.fixme(true, 'W3 · lane ATTENDANCE (M5) fills this in')

    // §10.5 — "same device flushes twice → no-op on `client_mark_id`". The replay carries a
    // mark the server may already hold, and the client-generated id is the only thing that
    // identifies it as *the same mark* rather than a corrected second opinion.
    await page.goto('/staff/today')
    await page.getByTestId('session-card').first().click()
    await context.setOffline(true)
    await page.getByTestId('student-row').nth(0).getByTestId('mark-present').click()

    await context.setOffline(false)
    await expect(page.getByTestId('pending-ops-count')).toHaveText('0')
    await page.getByTestId('force-flush').click() // §19.4's dev-bar offline tool

    await page.goto('/dashboard/attendance')
    await expect(page.getByTestId('session-attendance').first().getByTestId('present-count')).toHaveText('1')
  })

  test('a bulk mark never overwrites a parent’s pre-report', async ({ page }) => {
    test.fixme(true, 'W3 · lane ATTENDANCE (M5) fills this in')

    // §10.5's exception to last-write-wins, and the only rule here that a generic
    // last-write-wins resolver gets wrong. The parent said in the morning that the child is
    // ill; the coach taps "כולם נוכחים" in the evening. The child was not there, and the
    // later timestamp must not win.
    await page.goto('/parent/absence')
    await page.getByTestId('report-absence').click()
    await page.getByTestId('absence-submit').click()

    await page.goto('/staff/today')
    await page.getByTestId('session-card').first().click()
    await page.getByTestId('mark-all-present').click()

    const row = page.getByTestId('student-row').filter({ hasText: 'דנה' })
    await expect(row.getByTestId('status')).toHaveText('נעדר')
    await expect(row.getByTestId('source-badge')).toHaveAttribute('data-source', 'parent')
  })
})
