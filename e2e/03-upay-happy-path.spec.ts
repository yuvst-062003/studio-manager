import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { simulateIpn } from './fixtures/api'
import { dismissPaymentSetup, signInAs } from './fixtures/auth'
import {
  buildScenario,
  passFirstRunGates,
  readCharge,
  readOrder,
  recordStandingOrder,
  tryOpenOrder,
} from './fixtures/scenario'

/**
 * SPEC §13, flow 3 — "Parent selects 3 months → uPay order → simulated IPN → charges
 * settled → parent sees paid."
 *
 * **Gate for:** W4. **Filled in by:** M6 Money.
 * **Artboards:** `12f` תשלומים (▲ D9.3) · `1b` תשלומים · `3e` תשלומים וגבייה.
 *
 * **Simulated, not live.** §19.5 ships the IPN simulator precisely so this flow is testable
 * without live money, and round two established there is no uPay sandbox at all — the
 * account is real or it is nothing. The simulator and `app/integrations/upay/callback.py`
 * are tested against the same bytes (`tests/upay/test_callback.py`), so a green run here
 * means the parser agrees with what uPay actually sends rather than with a fixture someone
 * typed.
 *
 * **The redirect is never the source of truth** (§5.10 step 5). The assertions below wait
 * for the *IPN* to settle the charges. A test that accepted the redirect as proof would
 * pass against an implementation that marks charges paid on a URL anyone can visit.
 *
 * ── What this file had to change from the M0 draft ────────────────────────────────────
 * The route is a hash — `#/payments`, not `/parent/payments`. The screen was also
 * unreachable and unmountable until this wave: nothing imported `PaymentsScreen`, and the
 * three reads it needs were all manager-only, so its first fetch 403'd. Both are closed
 * now — see the `/me/` routes in `app/routers/billing.py`.
 *
 * The testid vocabulary was fiction. `method-card`, `months-3`, `selected-charge`, `pay`,
 * `open-debts-total`, `paid-row` and `charge-paid-badge` do not exist. What the screen
 * actually exposes is `payments-screen`, `debt-row`, `route-card`, `route-standing-order`,
 * `route-cash`, `months-control`, `instalments-control`, `instalment-split`, `pay-button`,
 * `covered-elsewhere` and `nothing-selectable`.
 *
 * The IPN is fired over `POST /dev/upay/simulate-ipn` rather than through the dev bar's
 * tool. `IpnSimulatorTool.tsx` hardcodes `expectedAmountAgorot: 32000` and
 * `build_ipn_query` sends that as the amount, so the tool can only settle an order that
 * happens to come to ₪320 — and an `amount_mismatch` fired from it would be off by one
 * agora from ₪320 rather than from the order under test. It is the honest shape anyway: an
 * IPN is uPay's server-to-server callback, not something a person clicks.
 *
 * ── The double-payment test addresses the server directly, and that is the point ──────
 * Since W6, `/me/charges` serves `is_covered_elsewhere` and the screen renders covered
 * rows unselectable — so the UI can no longer be walked into POSTing a claimed charge,
 * which is the protection working, not a gap in it. The test that used to click "pay"
 * twice was really asserting whatever the screen happened to select on the second click,
 * and once scenario charges accumulate on a shared persona that selection is a DIFFERENT
 * set of open months — a legitimate 201, and a red test that named no defect. What §5.10
 * calls the primary guard is the server's, so the second attempt is now the second tab's
 * actual request: the same charge_ids, POSTed directly, expecting 409 (`tryOpenOrder`).
 * The screen's half — covered rows rendered unpayable — is asserted alongside it.
 */
test.describe('E2E-3 · uPay happy path', () => {
  test('three months are selected, one order is created, and the IPN settles them all', async ({
    context,
    page,
    request,
  }) => {
    // Three unpaid months for one family, so "choosing 3" has something to choose.
    const scenario = await buildScenario(request, { months: 3 })
    expect(scenario.chargeIds).toHaveLength(3)

    await signInAs(context, scenario.parentPersona, 'parent')
      // §6.1 steps 5 and 6 wrap every routed branch of the parent app, and both
      // landed after this spec was written — without this it opens on `אישורים`.
      await passFirstRunGates(request, scenario.parentPersona)
    await page.goto(`${ORIGINS.parent}/#/payments`)
    await dismissPaymentSetup(page)

    // -- the parent payments screen (1b / 12f) -----------------------------------
    await expect(page.getByTestId('payments-screen')).toBeVisible()
    // §5.10 selects "the N oldest unpaid tuition charges across EVERY student this person
    // pays for", and the billing run bills the whole studio — so this family may also owe
    // months another scenario's run created for a sibling. That is the rule working, not
    // interference, so the assertions below are about the DELTA rather than about a total.
    const debts = page.getByTestId('debt-row')
    await expect(debts.filter({ hasText: scenario.tag })).toHaveCount(3)
    const owedBefore = await debts.count()

    // §5.10 — all three routes are always visible. Nothing is hidden from this screen, and
    // there is no payment mode stored on a person (C6 deleted the endpoint that implied one).
    await expect(page.getByTestId('route-card')).toBeVisible()
    await expect(page.getByTestId('route-standing-order')).toBeVisible()
    await expect(page.getByTestId('route-cash')).toBeVisible()

    // §5.10 — choosing N months selects the N oldest unpaid tuition charges **across every
    // student this person pays for**, not per child. A per-child order is the bug that
    // makes a two-child family pay twice for one month.
    // The label, not the input. `SegmentedControl` hides the radio under a styled
    // `<span>`, so the input is the accessible control and the label is the hit target —
    // `.check()` on the input reports "<span>3</span> intercepts pointer events", which is
    // the DOM correctly describing what a finger would hit.
    await page.getByTestId('months-control').getByText('3', { exact: true }).click()
    await expect(
      page.getByTestId('months-control').getByRole('radio', { name: '3', exact: true }),
    ).toBeChecked()

    // The order's reference comes from the POST the click makes. There is no list-orders
    // endpoint, deliberately, and watching the request is closer to the truth anyway: it
    // asserts that pressing pay is what created this order.
    const created = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/payment-orders') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('pay-button').click()
    const publicRef = ((await (await created).json()) as { public_ref: string }).public_ref

    // §5.10 step 5 — nothing is settled by pressing pay. The order exists; the money does
    // not. The demo studio has no live form to be redirected to, which is §19.6 working
    // rather than failing, so the order is read back through the API.
    const order = await readOrder(request, publicRef)
    expect(order.status).toBe('pending')
    expect(order.paid_at).toBeNull()
    expect(order.charge_ids).toHaveLength(3)
    expect(order.expected_amount_agorot).toBe(scenario.monthlyAmountAgorot * 3)

    // -- the IPN arrives (§19.5's simulator) --------------------------------------
    const delivery = await simulateIpn(request, {
      shape: 'success',
      orderPublicRef: order.public_ref,
      expectedAmountAgorot: order.expected_amount_agorot,
    })
    expect(delivery.delivered).toBe(true)
    expect(delivery.webhook_status).toBe(200)

    // -- the parent sees it --------------------------------------------------------
    await page.reload()
    await expect(page.getByTestId('payments-screen')).toBeVisible()
    // Three months left the open list — whichever three §5.10 chose as the oldest.
    await expect(debts).toHaveCount(owedBefore - 3)

    // §4.3 — a charge is settled by its allocations summing to `amount_agorot`, and
    // `charge.status` is a derived cache. Both halves are asserted on purpose: a status
    // that says paid with no allocation behind it is the ledger lying.
    for (const chargeId of order.charge_ids) {
      const charge = await readCharge(request, chargeId)
      expect(charge.status).toBe('settled')
      expect(charge.allocated_agorot).toBe(charge.amount_agorot)
    }

    // -- and the ledger agrees ------------------------------------------------------
    // The half a "mark it paid" implementation would fail: a status that says paid with no
    // allocation behind it is the ledger lying.
    const settled = await readOrder(request, publicRef)
    expect(settled.status).toBe('paid')
    expect(settled.paid_at).not.toBeNull()
  })

  test('a charge already covered by an open order cannot be paid for twice', async ({
    context,
    page,
    request,
  }) => {
    // §5.10's primary double-payment guard, and the one that works no matter which route
    // the parent takes. Nothing is hidden from the payments screen, so this is what stops a
    // family paying September twice from two tabs.
    const scenario = await buildScenario(request, { parent: 'parent1', months: 1 })

    await signInAs(context, scenario.parentPersona, 'parent')
      // §6.1 steps 5 and 6 wrap every routed branch of the parent app, and both
      // landed after this spec was written — without this it opens on `אישורים`.
      await passFirstRunGates(request, scenario.parentPersona)
    await page.goto(`${ORIGINS.parent}/#/payments`)
    await dismissPaymentSetup(page)
    await expect(page.getByTestId('debt-row').filter({ hasText: scenario.tag })).toHaveCount(1)

    const first = page.waitForResponse(
      (r) => r.url().includes('/api/v1/payment-orders') && r.request().method() === 'POST',
    )
    await page.getByTestId('pay-button').click()
    const order = ((await (await first).json()) as { public_ref: string }).public_ref
    // Whatever the screen's month chips were set to, the order covers charges this payer
    // actually owes — that is the property, not which particular months they are.
    const covered = (await readOrder(request, order)).charge_ids
    expect(covered.length).toBeGreaterThan(0)

    // The second attempt, from what is effectively a second tab: one that loaded before
    // the order existed still offers these exact charges, and its POST names them
    // verbatim. The charge is still open — an order is not a payment — so the guard has
    // to be the server's.
    expect(await tryOpenOrder(request, scenario, covered)).toBe(409)

    // And the screen's half of the same guard: after a reload the covered months render,
    // but as unpayable — hiding them would leave a parent looking for a month they can
    // see they owe (§5.10).
    await page.reload()
    await expect(page.getByTestId('debt-row').filter({ hasText: scenario.tag })).toHaveCount(1)
    await expect(page.getByTestId('covered-elsewhere').first()).toBeVisible()
  })

  test('an active standing order warns before the card route, and does not block it', async ({
    context,
    page,
    request,
  }) => {
    // §5.10's second guard: 'A **warning, not a block** — the parent decides.' Asserting
    // that the pay button stays enabled is the point of the test. A blocked route would be
    // a reasonable-looking change that quietly stops a family paying at all when the
    // manager's הוראת קבע record is stale.
    const scenario = await buildScenario(request, { parent: 'trial', months: 1 })
    await recordStandingOrder(request, scenario.payerPersonId, scenario.monthlyAmountAgorot)

    await signInAs(context, scenario.parentPersona, 'parent')
      // §6.1 steps 5 and 6 wrap every routed branch of the parent app, and both
      // landed after this spec was written — without this it opens on `אישורים`.
      await passFirstRunGates(request, scenario.parentPersona)
    await page.goto(`${ORIGINS.parent}/#/payments`)
    await dismissPaymentSetup(page)

    await expect(page.getByTestId('payments-screen')).toBeVisible()
    await expect(page.getByText('רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים')).toBeVisible()

    // The whole assertion. G8 makes a mandate something a human records rather than
    // something we can verify, so a stale record must never cost a family the card route.
    await expect(page.getByTestId('pay-button')).toBeEnabled()
  })
})
