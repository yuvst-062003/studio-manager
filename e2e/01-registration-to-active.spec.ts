import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { signInAs } from './fixtures/auth'
import {
  acceptPlatformConsents,
  buildScenario,
  completeAgreementsForGuardian,
  signAllDeclarations,
} from './fixtures/scenario'

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
 * the API. A registration that produced the right rows and appeared on no screen is the
 * failure this flow exists to catch.
 *
 * The manager's approval step survives in the FIRST test only, where §5.4a puts it: a
 * trial is converted by a human. The second test's approval queue was deleted on
 * 2026-08-30 along with its only producer — see that test's own header.
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
      // §5.4a ① — 'groups with schedules'. Asserted on the TIMETABLE, which is where the
      // 2026-08-30 Stitch redesign publishes them.
      //
      // Two redesigns have moved this assertion. It first read `landing-group-name` and
      // `landing-group-days` inside `.landing-groups-detail`, desktop furniture that
      // `landing.css` hid under 64rem — resolved but invisible on this project's Pixel 7.
      // It then moved to the `landing-pick-*` row. The Stitch page has neither: the group
      // list and the picker became ONE week grid, and the name and ages now sit INSIDE the
      // slot button, which is rendered at every width. So the desktop-only problem the
      // previous fix worked around no longer exists.
      //
      // Matched by suffix rather than `landing-slot-<day>-<id>`: the group trains on
      // Sunday and Tuesday (scenario.ts pins [0, 2]), and which day it is asserted on is
      // not the point — that it appears on the timetable at all is.
      const slot = stranger
        .locator(`[data-testid^="landing-slot-"][data-testid$="-${scenario.groupId}"]`)
        .first()
      await expect(slot).toBeVisible()
      await expect(slot.getByTestId('landing-group-name')).toBeVisible()
      await expect(slot.getByTestId('landing-group-ages')).toBeVisible()

      // §5.3 — sign-in first. The form does not exist for an anonymous visitor, because a
      // registration nobody can be matched to is a row the manager cannot action.
      //
      // **`landing-start-booking` does not exist and has not since 2026-08-29.** The
      // redesign made the offer one picker and ONE call to action, so the entry is now:
      // choose a group, then press the CTA. `.click()` on a testid that matches nothing
      // does not fail fast — it waits for the element until the whole test times out,
      // which is why this read as a 60s timeout naming no locator.
      //
      // The STICKY bar is the phone's button (`landing.css` hides it at desk widths and
      // hides the in-column `landing-cta` behind a scroll), and this project runs on a
      // Pixel 7. Pressing the control the reader would actually press is also what keeps
      // the sticky bar from silently ceasing to work.
      //
      // No pre-selection step any more: the Stitch page's group choice lives INSIDE the
      // dialog (`booking-group-<n>`, chosen per child, which this test already does
      // below), so the entry is just the one call to action.
      await stranger.getByTestId('landing-sticky-cta').click()
      await expect(stranger.getByTestId('booking-sign-in')).toBeVisible()
      await expect(stranger.getByTestId('booking-children')).toBeHidden()

      // The wall's only control is a link to the provider, and no provider is configured
      // locally — §19.4's route is the way in, and is documented as the only one.
      await signInAs(familyContext, 'none', 'parent', '/t/demo')

      // -- the funnel (12j) ------------------------------------------------------
      const parent = await familyContext.newPage()
      // `?signed_in=1`, because that is where a real sign-in lands the browser.
      //
      // `LandingShell` fires no `/auth/refresh` for an anonymous visitor (L6/P4 — a
      // stranger must not take a 401 on the first page they ever see), so a fresh page
      // load has an empty in-memory token and `signedIn` is false however good the cookie
      // is. The OAuth callback appends this marker for exactly that reason
      // (`app/routers/identity.py`); `signInAs` above sets the cookie over the API and
      // never navigates, so the marker has to come from here. Without it the freshly
      // signed-in parent was shown the sign-in step again — forever, which is the loop the
      // marker was invented to break.
      await parent.goto(`${ORIGINS.parent}/t/demo?signed_in=1`)
      await parent.getByTestId('landing-sticky-cta').click()
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
      // Press the CHIP, not the radio inside it. `SlotChips` hides the real
      // `<input type=radio>` at 1×1 with `clip-path` and puts the whole visible pill on the
      // `<label>`, so a click aimed at the input is intercepted by the wrapping span —
      // "…studio-slot-chips__chip intercepts pointer events", retried until the test timed
      // out. `check({ force: true })` would get past it and would also get past `disabled`,
      // which is how a test comes to book one of §5.4's cancelled slots and stay green.
      await parent.getByTestId('booking-slot-child-0').getByTestId('slot-chip').first().click()
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

      // **`students-row` never existed.** The roster is `Table`, which names the table and
      // the card fallback and no individual row, so this filtered on a testid that matches
      // nothing and could only ever report 0. Found the way a manager finds one child
      // instead — the search box — which also settles the question of which page they are
      // on: the demo studio has enough students to paginate.
      await manager.getByTestId('students-search').fill('דנה')
      const roster = manager.getByTestId('students-table')
      const student = roster.getByRole('button', { name: 'דנה לוי' })
      await expect(student).toHaveCount(1)
      // Booked, not joined. The distinction is the whole funnel: §5.10's billing run
      // charges `active` enrollments, so a trial that counted as active would put a
      // stranger in debt for a club they have not joined.
      await expect(roster).toContainText('שיעור ניסיון')

      await student.click()
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

      // §6.1 step 5 comes FIRST, and it is a hard gate too. `ConsentGate` wraps every routed
      // branch and sits outside the health gate, because the privacy policy is what permits
      // the club to hold a medical record about a child at all — asking for the record first
      // would have the consent doing no work. This spec predates that gate, which is why it
      // has been asserting `health-gate` against the `אישורים` screen.
      await expect(calendar.getByTestId('consent-gate')).toBeVisible()
      await expect(calendar.getByTestId('health-gate')).toHaveCount(0)
      await acceptPlatformConsents(request, 'none')
      await calendar.reload()

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

  test('a parent adds a sibling, and the child is on the roster with nobody to ask', async ({
    browser,
    request,
  }) => {
    // §5.4(c) — the OTHER way a child arrives, and it ENROLS (owner decision, 2026-08-30).
    //
    // **This test used to walk an approval queue that no longer exists.** `+ הוסף ילד`
    // filed a `registration_request` a manager approved, on L6's "conversion is always a
    // human decision" — while §5.4b's onboarding link, one WhatsApp message to the whole
    // club, already created active priced children with no manager at all. A gate on the
    // second door while the first stood open protected nothing. The queue was deleted with
    // its producer; what is asserted now is the outcome the parent is actually promised.
    //
    // The manager is TOLD rather than asked: `people.child_added` reaches the office, so
    // removing them from the path does not remove them from the knowing.
    const scenario = await buildScenario(request, { parent: 'parent1', months: 0 })

    const familyContext = await browser.newContext()
    const managerContext = await browser.newContext()
    try {
      await signInAs(familyContext, scenario.parentPersona, 'parent')
      // §6.1 step 5, satisfied before the screen this test is about. The gate itself is
      // asserted in the first test and walking it twice would only make this one longer —
      // but without it `#/add-child` renders `אישורים`, which is what had this test red.
      await acceptPlatformConsents(request, scenario.parentPersona)
      // §6.1 step 6, the same way the first test satisfies it: the scenario's child holds
      // no declaration, and §5.5 is a hard gate — "no other screen is reachable" — so
      // `#/add-child` is one of the screens it makes unreachable.
      await signAllDeclarations(request)
      await completeAgreementsForGuardian(request, scenario.parentPersona)
      const parent = await familyContext.newPage()
      await parent.goto(`${ORIGINS.parent}/#/add-child`)

      // §6.1's payment step, stood down the way the screen offers — `אחר כך`. It sits
      // inside the two hard gates and in front of every routed branch, so a family who has
      // not yet said how they will pay reaches no other screen; this test is about the door
      // BEHIND it. Pressed rather than seeded, because that button is the product's own
      // answer to "not now" and a test that bypassed it would not notice it breaking.
      // Awaited, not probed. `isVisible()` answers about the DOM as it is right now, and
      // this gate renders after `/me/students` resolves — so the probe said "not there",
      // skipped the click, and the assertion below then waited ten seconds on a screen the
      // gate was covering. A family with an open charge always meets it.
      await parent.getByTestId('setup-later').click()

      await expect(parent.getByTestId('add-sibling')).toBeVisible()
      await parent.getByLabel('שם פרטי').fill('יונתן')
      await parent.getByLabel('שם משפחה').fill('לוי')
      // A CHOICE now, and required: the price is derived from weekly volume across the
      // groups ticked, so a child with none has no volume and therefore no price. The
      // submit button stays disabled until one is picked, which is why this click is not
      // optional decoration.
      await parent.getByTestId(`sibling-group-${scenario.groupId}`).check()
      await parent.getByTestId('sibling-submit').click()

      // A PLACE, not a review. The child is enrolled, priced and charged already; what is
      // left is the health form and the payment method, which is what the copy names.
      await expect(parent.getByTestId('sibling-submitted')).toBeVisible()
      await expect(parent.getByTestId('sibling-pending-hint')).toBeVisible()

      // -- the roster, with nobody having approved anything -----------------------
      await signInAs(managerContext, 'manager', 'dashboard')
      const manager = await managerContext.newPage()

      // The queue is GONE, not merely empty. Asserted, because a deleted panel that
      // quietly comes back is exactly how dead UI returns.
      await manager.goto(`${ORIGINS.dashboard}/#/alerts`)
      await expect(manager.getByTestId('alert-pending-requests')).toHaveCount(0)

      await manager.goto(`${ORIGINS.dashboard}/#/students`)
      await manager.getByTestId('students-search').fill('יונתן')
      const roster = manager.getByTestId('students-table')
      const student = roster.getByRole('button', { name: 'יונתן לוי' })
      // ONE row. The duplicate check is what keeps it at one — a second submission of the
      // same child is refused rather than creating a second student.
      await expect(student).toHaveCount(1)
      await expect(roster).toContainText('פעיל')

      await student.click()
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
