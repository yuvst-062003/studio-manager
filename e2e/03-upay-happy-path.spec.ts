import { expect, test } from '@playwright/test'

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
 * for the *IPN* to settle the charges, and the return page is only asserted to say
 * "מאמת תשלום…". A test that accepted the redirect as proof would pass against an
 * implementation that marks charges paid on a URL anyone can visit.
 */

test.describe('E2E-3 · uPay happy path', () => {
  test('three months are selected, one order is created, and the IPN settles them all', async ({
    page,
  }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // -- the parent payments screen (12f) ----------------------------------------
    await page.goto('/parent/payments')

    // §5.10 — all three routes are always visible. Nothing is hidden from this screen, and
    // there is no payment mode stored on a person (C6 deleted the endpoint that implied one).
    await expect(page.getByTestId('method-card')).toBeVisible()
    await expect(page.getByTestId('method-standing-order')).toBeVisible()
    await expect(page.getByTestId('method-cash')).toBeVisible()

    // §5.10 — choosing N months selects the N oldest unpaid tuition charges **across every
    // student this person pays for**, not per child. A per-child order is the bug that
    // makes a two-child family pay twice for one month.
    await page.getByTestId('months-3').click()
    await expect(page.getByTestId('selected-charge')).toHaveCount(3)
    const total = await page.getByTestId('order-total').textContent()

    await page.getByTestId('pay').click()

    // §5.10 step 5 — the return page verifies, it does not confirm.
    await expect(page.getByTestId('payment-verifying')).toBeVisible()
    await expect(page.getByTestId('charge-paid-badge')).toHaveCount(0)

    // -- the IPN arrives (§19.5's simulator) --------------------------------------
    await page.goto('/dev/upay')
    await page.getByTestId('ipn-shape-success').click()
    await page.getByTestId('fire-ipn').click()

    // -- the parent sees it --------------------------------------------------------
    await page.goto('/parent/payments')
    await expect(page.getByTestId('open-debts-total')).toHaveText('0₪')
    await expect(page.getByTestId('paid-row')).toHaveCount(3)

    // D9.3 — the receipt affordance exists on card rows and only there. §5.10 issues a tax
    // document for card payments only, and offering it on a cash row promises a receipt the
    // studio's bookkeeper, not this system, has to produce.
    const paid = page.getByTestId('paid-row').first()
    await expect(paid.getByTestId('email-receipt')).toBeVisible()

    // -- the manager's ledger agrees ------------------------------------------------
    await page.goto('/dashboard/billing')
    await expect(page.getByTestId('payment-row').first().getByTestId('amount')).toHaveText(
      total ?? '',
    )
    // §4.3 — a charge is settled by its allocations summing to `amount_agorot`, and
    // `charge.status` is a derived cache. Both halves are visible here on purpose: a status
    // that says paid with no allocation behind it is the ledger lying.
    await expect(page.getByTestId('allocation-row')).toHaveCount(3)
  })

  test('a charge already covered by an open order cannot be selected again', async ({ page }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // §5.10's primary double-payment guard, and the one that works no matter which route
    // the parent takes. Nothing is hidden from the payments screen, so this is what stops a
    // family paying September twice from two tabs.
    await page.goto('/parent/payments')
    await page.getByTestId('months-1').click()
    await page.getByTestId('pay').click()

    await page.goto('/parent/payments')
    await expect(page.getByTestId('selected-charge')).toHaveCount(0)
    await expect(page.getByTestId('charge-row').first()).toHaveAttribute(
      'data-selectable',
      'false',
    )
  })

  test('an active standing order warns before the card route, and does not block it', async ({
    page,
  }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // §5.10, second guard: "A **warning, not a block** — the parent decides." Asserting the
    // pay button stays enabled is the point of the test. A blocked route would be a
    // reasonable-looking change that quietly stops a family paying at all when the manager's
    // הוראת קבע record is stale.
    await page.goto('/parent/payments')
    await expect(page.getByTestId('standing-order-warning')).toBeVisible()
    await expect(page.getByTestId('pay')).toBeEnabled()
  })
})
