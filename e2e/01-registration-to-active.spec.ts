import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { signInAs } from './fixtures/auth'
import { buildScenario, signAllDeclarations } from './fixtures/scenario'

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
 *
 * ── What this file had to change from the M0 draft ────────────────────────────────────
 * The landing page is `/t/<slug>` and not `/register/<slug>` — a real path, deliberately,
 * because the URL goes in a bio and on a printed QR, and it is the only path-shaped route
 * in the product. `matchLandingPath` accepts exactly that shape.
 *
 * The draft signs in with a `sign-in-google` button. §5.4a's wall is
 * `booking-sign-in`, whose only control is a link to the provider — and no provider is
 * configured on a developer's machine, so the button that would exist in production does
 * not render at all. §19.4's `/dev/sign-in-as` is the door the suite uses, which is what it
 * was built for: "This route is the only way into the apps in that state."
 *
 * The rest of the vocabulary was invented. `registration-form`, `child-first-name`,
 * `group-select`, `registration-submit`, `registration-received`,
 * `next-step-health-declaration`, `approval-card`, `approve`, `student-row`,
 * `student-status` and `health-badge` do not exist. The funnel is four named steps —
 * `booking-sign-in` → `booking-children` → `booking-health` → `booking-slot` — and the
 * queue is `alert-pending-requests` with `alert-request-row`.
 *
 * §5.4a's trial declaration is the SHORT form, taken at booking, and it is a confirmation
 * checkbox per child rather than `12c`'s full declaration with a drawn signature. The full
 * one is M4's app gate and belongs to the flow only once a lead converts, which is why the
 * draft's `signature-pad` step is not here.
 */
test.describe('E2E-1 · registration to active student', () => {
  test('a stranger books a trial, and a manager makes them an active student', async ({
    browser,
    request,
  }) => {
    // A club with a group to join and a session to book. §5.4a's funnel offers "the next N
    // upcoming sessions of each chosen group", so a group with no future session offers a
    // stranger nothing to pick.
    const scenario = await buildScenario(request)

    // Two people, two contexts — see `auth.ts`. The refresh cookie is not port-scoped, so
    // a parent on :5174 and a manager on :5175 in one context would leave the later
    // sign-in holding both.
    const familyContext = await browser.newContext()
    const managerContext = await browser.newContext()
    try {
      // -- the public landing page (13a / 13c) ----------------------------------
      // Anonymous first. §5.4a ① — the shop window is a marketing asset on the open
      // internet and renders ahead of every gate, including the install walkthrough: a
      // stranger tapping a link must see the club, not an install prompt for an app they
      // have no reason to want yet.
      const stranger = await familyContext.newPage()
      await stranger.goto(`${ORIGINS.parent}/t/demo`)
      await expect(stranger.getByTestId('public-landing')).toBeVisible()
      // The club's own name, not `landing-headline` — that one renders only when a studio
      // has set a headline, and it is the club the stranger came to see either way.
      await expect(stranger.getByRole('heading', { name: 'מועדון הדגמה' })).toBeVisible()
      await expect(stranger.getByTestId('landing-group-name').first()).toBeVisible()
      await expect(stranger.getByTestId('landing-group-days').first()).toBeVisible()

      // §5.3 — sign-in first. The form does not exist for an anonymous visitor, because a
      // registration nobody can be matched to is a row the manager cannot action.
      await stranger.getByTestId('landing-start-booking').click()
      await expect(stranger.getByTestId('booking-sign-in')).toBeVisible()
      await expect(stranger.getByTestId('booking-children')).toBeHidden()

      // The wall's only control is a link to the provider, and no provider is configured
      // locally — §19.4's route is the way in, and is documented as the only one.
      await signInAs(familyContext, 'none', 'parent', '/t/demo')

      // -- the funnel (12j) ------------------------------------------------------
      const parent = await familyContext.newPage()
      await parent.goto(`${ORIGINS.parent}/t/demo`)
      await parent.getByTestId('landing-start-booking').click()
      await expect(parent.getByTestId('booking-children')).toBeVisible()

      await parent.getByLabel('שם פרטי').first().fill('דנה')
      await parent.getByLabel('שם משפחה').first().fill('לוי')
      await parent.getByTestId('booking-children').getByRole('combobox').selectOption({
        index: 1,
      })
      await parent.getByTestId('booking-to-health').click()

      // §5.4a step 3 — the SHORT trial declaration, one confirmation per child. The full
      // form with a drawn signature is M4's app gate and comes after conversion.
      await expect(parent.getByTestId('booking-health')).toBeVisible()
      await parent.getByTestId('booking-health').getByRole('checkbox').first().check()
      await parent.getByTestId('booking-to-slot').click()

      // §5.4a step 4 — one pick per child, from that child's own group.
      await expect(parent.getByTestId('booking-slot')).toBeVisible()
      await parent.getByTestId('booking-slot-child-0').getByRole('radio').first().check()
      await parent.getByTestId('booking-submit').click()

      // -- after the send (13b) --------------------------------------------------
      // §5.4a: the parent is told what happens next. "Submitted" with no next step is where
      // a funnel leaks — the parent does not know whether to wait or to phone the club.
      await expect(parent.getByTestId('booking-confirmed')).toBeVisible()
      await expect(parent.getByTestId('booked-bring')).toBeVisible()
      await expect(parent.getByTestId('booked-install')).toBeVisible()

      // -- the manager converts (4a) ---------------------------------------------
      // §5.4a step 5 — 'Manager converts → picks group, sets price, status=active'. NOT the
      // approval queue: a trial booking creates its `registration_request` already
      // `approved`, because it is a record of the trial declaration rather than a decision
      // waiting to be taken. The child exists from the moment they book, as a `trial`.
      // §5.4a is explicit that conversion is always a human decision, and this is it.
      await signInAs(managerContext, 'manager', 'dashboard')
      const manager = await managerContext.newPage()
      await manager.goto(`${ORIGINS.dashboard}/#/students`)
      await expect(manager.getByTestId('students-screen')).toBeVisible()

      const student = manager.getByTestId('students-row').filter({ hasText: 'דנה לוי' })
      await expect(student).toHaveCount(1)
      // Booked, not joined. The distinction is the whole funnel: §5.10's billing run
      // charges `active` enrollments, so a trial that counted as active would put a
      // stranger in debt for a club they have not joined.
      await expect(student).toContainText('שיעור ניסיון')

      await student.getByRole('button').first().click()
      await expect(manager.getByTestId('student-detail')).toBeVisible()

      await manager.getByTestId('detail-convert').click()
      await manager.getByTestId('detail-convert-group').selectOption({ index: 1 })
      await manager.getByTestId('detail-convert-submit').click()

      // §5.4 — conversion is what makes a student `active`, and it writes the enrollment
      // in the same decision.
      await expect(manager.getByTestId('student-detail')).toContainText('פעיל')
      await expect(manager.getByTestId('detail-enrollment')).toHaveCount(1)

      // The status history is what §5.4a's funnel report is computed from, so the
      // transition has to be a recorded fact and not just a column that changed.
      await expect(
        manager.getByTestId('detail-history').filter({ hasText: 'שיעור ניסיון' }),
      ).toHaveCount(1)

      // -- §6.1 step 6, now that the child trains regularly ----------------------
      // Conversion is the moment §5.4 stops accepting the SHORT trial form: "the manager
      // never chases paper — the parent completes the full health declaration through
      // the app gate (§5.5)". So the family's next visit is the gate and nothing else —
      // this is the "with health" half of W3's E2E-1 gate, asserted against the shell
      // rather than against a component nothing mounted (HB-w6-health-gate-unmounted).
      const calendar = await familyContext.newPage()
      await calendar.goto(`${ORIGINS.parent}/#/calendar`)
      await expect(calendar.getByTestId('health-gate')).toBeVisible()
      await expect(calendar.getByTestId('child-calendar')).not.toBeVisible()

      // The form's own walk — three answer states, the drawn signature, the unanswered
      // guards — is ParentHealth.test.tsx's job; what E2E owns is the ROUTING on both
      // sides of the signature. The manager files it (§5.1's sanctioned path, the same
      // door the fixture uses), and the app opens.
      await signAllDeclarations(request)
      await calendar.reload()

      // And the family sees it, which is the half a manager cannot check for themselves.
      await expect(calendar.getByTestId('child-calendar')).toBeVisible()
      await expect(calendar.getByTestId('upcoming-session').first()).toBeVisible()
      expect(scenario.groupId).toBeTruthy()
    } finally {
      await managerContext.close()
      await familyContext.close()
    }
  })

  test('a parent adds a sibling, and the manager approves it from the queue', async ({
    browser,
    request,
  }) => {
    // §5.4(c) — the OTHER way a child arrives, and the one with a real approval queue
    // behind it. §5.4: 'This creates a registration_request with source = parent_app and
    // matched_person_id set — a request, not an enrollment. The manager approves it,
    // consistent with (b): conversion is always a human decision.'
    //
    // Everything this test walks was broken until this wave. The approval raised a 500 for
    // any guardian whose Person row carried no address, which in the demo studio is all of
    // them; and the queue's approve button had no handler at all, so a manager could see
    // pending requests and act on none of them.
    const scenario = await buildScenario(request, { parent: 'parent1', months: 0 })

    const familyContext = await browser.newContext()
    const managerContext = await browser.newContext()
    try {
      await signInAs(familyContext, scenario.parentPersona, 'parent')
      const parent = await familyContext.newPage()
      await parent.goto(`${ORIGINS.parent}/#/add-child`)

      await expect(parent.getByTestId('add-sibling')).toBeVisible()
      await parent.getByLabel('שם פרטי').fill('יונתן')
      await parent.getByLabel('שם משפחה').fill('לוי')
      await parent.getByTestId('sibling-submit').click()

      // L6 — the promise is REVIEW, never a place. A parent told "done" would turn up to a
      // lesson their child is not on a roster for.
      await expect(parent.getByTestId('sibling-submitted')).toBeVisible()
      await expect(parent.getByTestId('sibling-pending-hint')).toBeVisible()

      // -- the queue (6c) --------------------------------------------------------
      await signInAs(managerContext, 'manager', 'dashboard')
      const manager = await managerContext.newPage()
      await manager.goto(`${ORIGINS.dashboard}/#/alerts`)

      const row = manager.getByTestId('alert-request-row').filter({ hasText: 'יונתן לוי' })
      await expect(row).toHaveCount(1)
      await expect(row.getByTestId('alert-request-source')).toHaveText('מאפליקציית ההורים')
      // §5.4a — matching is on a verified address, so the copy never claims certainty. The
      // parent is signed in, so the request carries `matched_person_id` and the queue says
      // it may be the same parent rather than announcing a new family.
      await expect(row.getByTestId('alert-request-matched')).toBeVisible()

      // §5.4 — the group is chosen on the DECISION, not read from the submission.
      await row.getByTestId(/^alert-request-approve-/).click()
      await manager.getByTestId('alert-request-group').selectOption({ index: 1 })
      await manager.getByTestId('alert-request-approve-confirm').click()

      await expect(
        manager.getByTestId('alert-request-row').filter({ hasText: 'יונתן לוי' }),
      ).toHaveCount(0)

      // Approved into the club, and attached to the parent who asked rather than to a
      // duplicate of them — which is what the 500 was hiding.
      await manager.goto(`${ORIGINS.dashboard}/#/students`)
      const student = manager.getByTestId('students-row').filter({ hasText: 'יונתן לוי' })
      await expect(student).toHaveCount(1)
      await expect(student).toContainText('פעיל')

      await student.getByRole('button').first().click()
      await expect(manager.getByTestId('student-detail')).toBeVisible()
      // §5.4a: 'No second invitation, no second account, no second login.' One guardian,
      // and she is the one who is signed in on the other context.
      await expect(manager.getByTestId('detail-guardian')).toHaveCount(1)
    } finally {
      await managerContext.close()
      await familyContext.close()
    }
  })
})
