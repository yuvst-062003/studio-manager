import { expect, test } from '@playwright/test'

/**
 * SPEC §13, flow 4 — "Forged/tampered IPN → `amount_mismatch` → charges **not** settled →
 * manager alerted."
 *
 * **Gate for:** W4. **Filled in by:** M6 Money.
 * **Artboards:** `3e` תשלומים וגבייה · `6c` מרכז התראות.
 *
 * **There is no signature to check.** `upay-integration.md` marks "no signature exists on
 * any request, inbound or outbound" [VERIFIED] in both rounds, so anyone who learns the
 * callback URL can send bytes that look exactly like uPay's. §5.10's four mitigations are
 * all this endpoint has, and this flow is the end-to-end proof of each:
 *
 *   forged reference → the ref is a UUIDv4 the server issued
 *   tampered amount  → compared server-side against the order's own row
 *   duplicate        → idempotent on `transactionid`
 *   source IP        → recorded as a signal, and never a gate
 *
 * The tests are asserted from the **outside**: what a manager sees and what the parent's
 * balance says. `tests/upay/test_callback.py` already proves the verdicts as functions —
 * what this file adds is that the verdict actually reaches the ledger and the alert centre.
 *
 * **The most important assertion in this file is a negative one.** §5.10 requires that on a
 * mismatch a `payment` **is** recorded for the real money received, allocated to nothing,
 * while the charges stay open. Both halves have to hold at once: dropping the payment loses
 * money that is in the merchant account, and settling the charges gives a discount to anyone
 * who edits a form field.
 */

test.describe('E2E-4 · forged and tampered IPN', () => {
  test('a tampered amount records the money, settles nothing, and raises an alert', async ({
    page,
  }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    await page.goto('/parent/payments')
    await page.getByTestId('months-1').click()
    const expected = await page.getByTestId('order-total').textContent()
    await page.getByTestId('pay').click()

    // §19.5's `amount_mismatch` shape: off by one agora, the smallest difference the
    // comparison must still catch, and it moves both `amount` and `depositamount`
    // (round two B10) so a parser reading either field reaches the same verdict.
    await page.goto('/dev/upay')
    await page.getByTestId('ipn-shape-amount_mismatch').click()
    await page.getByTestId('fire-ipn').click()

    // -- the charges are NOT settled ------------------------------------------------
    await page.goto('/parent/payments')
    await expect(page.getByTestId('open-debts-total')).toHaveText(expected ?? '')
    await expect(page.getByTestId('paid-row')).toHaveCount(0)

    // -- the money is recorded anyway -----------------------------------------------
    // Half the requirement, and the half a "reject the callback" implementation loses. The
    // parent's card was charged; that money exists whether or not our ledger admits it.
    await page.goto('/dashboard/billing')
    const payment = page.getByTestId('payment-row').first()
    await expect(payment).toBeVisible()
    await expect(payment.getByTestId('allocation-count')).toHaveText('0')

    // -- the manager is alerted, at high priority ------------------------------------
    await page.goto('/dashboard/alerts')
    const alert = page.getByTestId('reconciliation-card').filter({ hasText: 'סכום לא תואם' })
    await expect(alert).toBeVisible()
    await expect(alert).toHaveAttribute('data-priority', 'high')
  })

  test('a forged reference settles nothing and never reaches a real order', async ({ page }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // §19.5's `forged_ref` shape is a **well-formed** UUID that matches no order, so what is
    // being tested is "does an order carry this reference", not "is this parseable". §5.10:
    // a sequential id in this endpoint would let anyone mark any tuition paid.
    await page.goto('/parent/payments')
    await page.getByTestId('months-1').click()
    const expected = await page.getByTestId('order-total').textContent()
    await page.getByTestId('pay').click()

    await page.goto('/dev/upay')
    await page.getByTestId('ipn-shape-forged_ref').click()
    await page.getByTestId('fire-ipn').click()

    await page.goto('/parent/payments')
    await expect(page.getByTestId('open-debts-total')).toHaveText(expected ?? '')

    // §5.10: "Every IPN is persisted verbatim in `upay_ipn_record` whether matched or not."
    // A forged callback that left no trace is one nobody can investigate — and the raw
    // record is what turns every [NOT COVERED] in upay-integration.md into something
    // observed in production rather than pre-guessed.
    await page.goto('/dashboard/billing/ipn-log')
    await expect(page.getByTestId('ipn-row').first()).toHaveAttribute(
      'data-match-status',
      'unmatched',
    )
  })

  test('a duplicate delivery is logged and ignored, and never settles twice', async ({ page }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // §5.10: "Idempotent on `transactionid`. A second delivery is logged and ignored."
    // Retry behaviour is [NOT COVERED] — uPay never confirmed what it does on a non-200 —
    // so idempotence is what makes the answer not matter.
    await page.goto('/dev/upay')
    await page.getByTestId('ipn-shape-success').click()
    await page.getByTestId('fire-ipn').click()
    await page.getByTestId('ipn-shape-duplicate').click()
    await page.getByTestId('fire-ipn').click()

    await page.goto('/dashboard/billing')
    await expect(page.getByTestId('payment-row')).toHaveCount(1)
    await expect(page.getByTestId('overpayment-badge')).toHaveCount(0)
  })

  test('an order that never receives an IPN surfaces on its own', async ({ page }) => {
    test.fixme(true, 'W4 · lane MONEY (M6) fills this in')

    // §5.10's last threat row, and the one with no callback to react to: "Nightly job flags
    // orders `pending` for more than 24h." upay-integration.md is explicit that "no IPN ever
    // arrived" is a failure signal in its own right and the design must not wait for a
    // failure-shaped payload that may not exist.
    await page.goto('/dev/tools')
    await page.getByTestId('time-travel-plus-25h').click()
    await page.getByTestId('run-job-pending-orders').click()

    await page.goto('/dashboard/alerts')
    await expect(page.getByTestId('pending-order-card')).toBeVisible()
  })
})
