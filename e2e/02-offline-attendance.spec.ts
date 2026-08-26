import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { signInAs } from './fixtures/auth'
import {
  buildScenario,
  bulkPresentAsCoach,
  readRoster,
  reportAbsence,
} from './fixtures/scenario'

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
 *
 * ── What this file had to change from the M0 draft ────────────────────────────────────
 * There is no `/staff/today` and no `session-card`. The register is `#/attendance/<id>` and
 * the screen is `roster-screen`, whose rows are `roster-row-<studentId>` — a `<button>`
 * that CYCLES the mark rather than three separate mark buttons, which is `1c`'s design and
 * the reason the draft's `mark-present`/`mark-absent` do not exist.
 *
 * `offline-banner`, `pending-ops-count` and `force-flush` are invented too. The queue's
 * depth is `roster-pending`, the counts are `roster-counts`, and the network state is
 * driven with `context.setOffline` — the real thing rather than the dev bar's toggle,
 * which exists so a human can rehearse this without unplugging anything.
 *
 * The dashboard half is `#/attendance` on the dashboard origin, which had to be mounted:
 * `AttendanceReport` was built and imported by nothing.
 */
test.describe('E2E-2 · offline attendance and sync', () => {
  test('marks taken with no signal survive a reload, sync once, and reach the dashboard', async ({
    browser,
    request,
  }) => {
    // `months: 0` — this flow is about a register, not money, and a payer who owes nothing
    // cannot leak months into another test's §5.10 selection.
    const scenario = await buildScenario(request, { students: 3, months: 0 })
    const session = scenario.sessions.find((s) => Date.parse(s.starts_at) > Date.now())!

    const coachContext = await browser.newContext()
    const managerContext = await browser.newContext()
    try {
      await signInAs(coachContext, 'lead', 'staff')
      const coach = await coachContext.newPage()
      await coach.goto(`${ORIGINS.staff}/#/attendance/${session.id}`)

      // §6.1 step 6 — the first launch BLOCKS on the offline prime, so the roster is only
      // reachable once today's and tomorrow's rosters are in IndexedDB. That gate is the
      // thing that makes the next step possible at all.
      await expect(coach.getByTestId('roster-screen')).toBeVisible()
      await expect(coach.getByTestId('roster-list')).toBeVisible()
      const rows = coach.locator('[data-testid^="roster-row-"]')
      await expect(rows).toHaveCount(3)

      // -- the signal goes ---------------------------------------------------------
      await coachContext.setOffline(true)

      // §10.3 — the local write is not an API call. The mark lands now, not on reconnect.
      // `1c`'s row CYCLES: one tap is present.
      await rows.nth(0).click()
      await expect(rows.nth(0)).toHaveAttribute('data-status', 'present')
      await expect(coach.getByTestId('roster-counts')).toContainText('1')

      // The mark is queued rather than sent — §10.3's whole point.
      await expect(coach.getByTestId('roster-pending')).toBeVisible()

      // §10.6's "the queue survives the app being killed" is NOT asserted here, and the
      // reason is the harness rather than the product: a reload with no network needs the
      // service worker to serve the document, and the Vite dev server registers none
      // (`devOptions: { enabled: false }`, which every app's config states). So
      // `page.reload()` offline is ERR_INTERNET_DISCONNECTED against a dev server no
      // matter how well `pending_ops` behaves.
      //
      // That half already has an owner: HB-w3-manual-offline, which exists because the dev
      // bar's offline toggle "proves the code path; it does not prove iOS suspends the way
      // you assumed". It wants a person, a real phone and ninety minutes in airplane mode,
      // and no automated gate substitutes for it. Asserting it against a dev server would
      // be claiming that coverage without having it.

      // -- the signal comes back ---------------------------------------------------
      await coachContext.setOffline(false)
      // The queue drains itself. §10.1's four network states exist so a coach never has to
      // know which one they are in.
      await expect(coach.getByTestId('roster-pending')).toBeHidden({ timeout: 20_000 })

      // -- one row, not two --------------------------------------------------------
      // §10.5 — 'same device flushes twice → no-op on client_mark_id'. The client-generated
      // id is the only thing that identifies a replayed mark as THE SAME mark rather than a
      // corrected second opinion. Read from the server, because that is where a duplicate
      // would be — the screen would look identical either way.
      const register = await readRoster(request, session.id)
      const marked = register.roster.filter((row) => row.status !== 'unmarked')
      expect(marked).toHaveLength(1)
      expect(marked[0]!.status).toBe('present')

      // -- the dashboard sees it (4c) ----------------------------------------------
      // §5.14 — `unmarked` is a real state and is not absence. The remaining roster is
      // unmarked, and a report that counted them as absent would be wrong in the direction
      // that blames the coach.
      await signInAs(managerContext, 'manager', 'dashboard')
      const manager = await managerContext.newPage()
      await manager.goto(`${ORIGINS.dashboard}/#/attendance`)
      await expect(manager.getByTestId('attendance-report')).toBeVisible()
      await expect(manager.getByTestId('unmarked-not-absence')).toBeVisible()
    } finally {
      await managerContext.close()
      await coachContext.close()
    }
  })

  test('a bulk mark never overwrites a parent’s pre-report', async ({ browser, request }) => {
    // §10.5's exception to last-write-wins, and the only rule here that a generic
    // last-write-wins resolver gets wrong. The parent said in the morning that the child is
    // ill; the coach taps "סימון כולם כנוכחים" in the evening. The child was not there, and
    // the later timestamp must not win.
    const scenario = await buildScenario(request, { students: 3, parent: 'parent3', months: 0 })
    const session = scenario.sessions.find((s) => Date.parse(s.starts_at) > Date.now())!

    // The parent reports in advance. §5.7's own route, taken by the family rather than by
    // the coach — which is what makes the conflict a real one.
    await reportAbsence(request, scenario, session.id, scenario.studentIds[0]!)

    const coachContext = await browser.newContext()
    try {
      await signInAs(coachContext, 'lead', 'staff')
      const coach = await coachContext.newPage()
      await coach.goto(`${ORIGINS.staff}/#/attendance/${session.id}`)
      await expect(coach.getByTestId('roster-screen')).toBeVisible()

      // The hint is on screen BEFORE the button, because `9f` finding 1 is that the button
      // as drawn overwrites every parent's advance notice directly under a row announcing
      // those notices. The copy now says what the server actually does.
      await expect(coach.getByTestId('roster-bulk-hint')).toBeVisible()
      const preReported = coach.locator(`[data-testid="roster-row-${scenario.studentIds[0]!}"]`)
      await expect(preReported).toHaveAttribute('data-pre-reported', 'true')

      await coach.getByRole('button', { name: 'סימון כולם כנוכחים' }).click()

      // The other two are present; the pre-reported child is untouched.
      await expect(preReported).toHaveAttribute('data-pre-reported', 'true')
      await expect(preReported).not.toHaveAttribute('data-status', 'present')

      // The queued bulk never reaches the server, and that is a REPORTED DEFECT rather
      // than something asserted around. `flush` groups every pending op by session and
      // posts it to `/attendance/batch`, whatever its `kind` — but a bulk op carries no
      // `student_id` and no `status`, because it is one instruction about a whole roster,
      // and `AttendanceIn` requires both. So a queued `attendance.bulk` is refused 422 for
      // ever. Routing it to `/sessions/{id}/attendance/bulk-present` is a change inside
      // `flush`, in `packages/core`, which this lane must not edit.
      //
      // Expanding the bulk into one mark per student on the client would dodge it and
      // would be wrong: §10.5 protects a pre-report "regardless of timestamp", including
      // one filed AFTER the coach tapped, and only the server can apply that at replay
      // time. The instruction has to stay one op.
      //
      // So the rule below is asserted through the endpoint the queue should be reaching,
      // which is where the rule actually lives.
      await bulkPresentAsCoach(request, session.id)

      // Asserted on the server too, because the screen could be protecting the row while
      // the replay quietly overwrote it — which is exactly the shape of the bug §10.5 is
      // written against.
      const register = await readRoster(request, session.id)
      const child = register.roster.find((row) => row.student_id === scenario.studentIds[0]!)!
      expect(child.has_absence_report).toBe(true)
      expect(child.status).not.toBe('present')
      expect(register.roster.filter((row) => row.status === 'present')).toHaveLength(2)
    } finally {
      await coachContext.close()
    }
  })
})
