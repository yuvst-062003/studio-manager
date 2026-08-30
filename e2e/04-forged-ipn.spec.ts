import { expect, test } from '@playwright/test'

import { ORIGINS } from './origins'
import { simulateIpn } from './fixtures/api'
import { dismissPaymentSetup, signInAs } from './fixtures/auth'
import { buildScenario, openOrderFor, passFirstRunGates, readOrder } from './fixtures/scenario'

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
 * money that is in the merchant account, and settling the charges gives a discount to
 * anyone who edits a form field.
 *
 * ── What this file had to change from the M0 draft ────────────────────────────────────
 * The order is opened through the API rather than by clicking pay. Not a shortcut: the
 * thing under test here is the CALLBACK's verdict, and E2E-3 already walks the parent
 * pressing pay. Opening four orders through the UI would test that flow four more times
 * and this one no better.
 *
 * `/dev/upay` does not exist. §19.5's simulator is a dev-bar tool and an endpoint; the
 * endpoint is what a spec can aim at an order of a known amount — see `fixtures/api.ts`.
 *
 * `/dashboard/billing`, `ipn-row`, `data-match-status`, `payment-row`, `allocation-count`,
 * `reconciliation-card` and `pending-order-card` are all invented. `3e` is `#/billing`,
 * §5.10's queue is `#/billing/reconciliation` with `unmatched-row`, `card-owner`,
 * `raw-amount` and `four-digits`, and `6c`'s money section is `billing-alert`.
 */
test.describe('E2E-4 · forged and tampered IPN', () => {
  test('a tampered amount records the money, settles nothing, and raises an alert', async ({
    context,
    page,
    request,
  }) => {
    const scenario = await buildScenario(request, { parent: 'both' })
    const order = await openOrderFor(request, scenario)

    // §19.5's `amount_mismatch` shape: off by one agora, the smallest difference the
    // comparison must still catch, and it moves both `amount` and `depositamount`
    // (round two B10) so a parser reading either field reaches the same verdict.
    await simulateIpn(request, {
      shape: 'amount_mismatch',
      orderPublicRef: order.public_ref,
      expectedAmountAgorot: order.expected_amount_agorot,
    })

    // -- the charges are NOT settled ------------------------------------------------
    const after = await readOrder(request, order.public_ref)
    expect(after.status).toBe('amount_mismatch')
    expect(after.paid_at).toBeNull()

    await signInAs(context, scenario.parentPersona, 'parent')
      // §6.1 steps 5 and 6 wrap every routed branch of the parent app, and both
      // landed after this spec was written — without this it opens on `אישורים`.
      await passFirstRunGates(request, scenario.parentPersona)
    await page.goto(`${ORIGINS.parent}/#/payments`)
    await dismissPaymentSetup(page)
    // Still owed, and still offered. A family whose payment was rejected must be able to
    // try again; a screen that hid the month would strand them. Filtered to this family's
    // rows — the payer personas are shared between tests and `/me/charges` is per payer.
    await expect(page.getByTestId('debt-row').filter({ hasText: scenario.tag })).toHaveCount(
      scenario.chargeIds.length,
    )

    // -- the money is recorded anyway -----------------------------------------------
    // Half the requirement, and the half a "reject the callback" implementation loses. The
    // parent's card was charged; that money exists whether or not our ledger admits it.
    const payments = await request.get(
      `${ORIGINS.parent}/api/v1/payments?payer_person_id=${scenario.payerPersonId}`,
      { headers: { Authorization: `Bearer ${await managerToken(request)}` } },
    )
    expect(payments.ok()).toBe(true)
    // Scoped to THIS order. The payer personas are shared between tests, so the payer's
    // full history is not this test's subject — `payment_order_id` is what ties the money
    // to the callback that carried it.
    const recorded = (
      (await payments.json()) as {
        items: { payment_order_id: string | null; allocations: unknown[] }[]
      }
    ).items.filter((row) => row.payment_order_id === order.id)
    expect(recorded).toHaveLength(1)
    // Allocated to NOTHING. §5.10: the payment is recorded, the charges stay open, and the
    // reconciliation queue is where a human decides what happened.
    expect(recorded[0]!.allocations).toHaveLength(0)
  })

  test('a forged reference settles nothing and is kept for someone to investigate', async ({
    context,
    page,
    request,
  }) => {
    // §19.5's `forged_ref` shape is a **well-formed** UUID that matches no order, so what
    // is being tested is "does an order carry this reference", not "is this parseable".
    // §5.10: a sequential id in this endpoint would let anyone mark any tuition paid.
    const scenario = await buildScenario(request, { parent: 'none' })
    const order = await openOrderFor(request, scenario)

    await simulateIpn(request, {
      shape: 'forged_ref',
      orderPublicRef: order.public_ref,
      expectedAmountAgorot: order.expected_amount_agorot,
    })

    // The real order never hears about it.
    const after = await readOrder(request, order.public_ref)
    expect(after.status).toBe('pending')
    expect(after.paid_at).toBeNull()

    // §5.10: "Every IPN is persisted verbatim in `upay_ipn_record` whether matched or not."
    // A forged callback that left no trace is one nobody can investigate — and the raw
    // record is what turns every [NOT COVERED] in upay-integration.md into something
    // observed in production rather than pre-guessed.
    await signInAs(context, 'manager', 'dashboard')
    await page.goto(`${ORIGINS.dashboard}/#/billing/reconciliation`)
    await expect(page.getByTestId('reconciliation')).toBeVisible()

    const row = page.getByTestId('unmatched-row').first()
    await expect(row).toBeVisible()
    // Kept verbatim: the card owner and the raw amount string as uPay sent them, which is
    // the evidence a manager reads when deciding whose payment this was.
    await expect(row.getByTestId('card-owner')).toHaveText('ישראל ישראלי')
    await expect(row.getByTestId('raw-amount')).toBeVisible()

    // §5.10 — matching is never automatic. The queue says so on its own face.
    await expect(page.getByTestId('never-auto')).toBeVisible()
  })

  test('a duplicate delivery is logged and ignored, and never settles twice', async ({
    request,
  }) => {
    // §5.10: "Idempotent on `transactionid`. A second delivery is logged and ignored."
    // Retry behaviour is [NOT COVERED] — uPay never confirmed what it does on a non-200 —
    // so idempotence is what makes the answer not matter.
    const scenario = await buildScenario(request, { parent: 'owner' })
    const order = await openOrderFor(request, scenario)

    const transactionId = `E2E-DUP-${order.public_ref.slice(0, 8)}`
    for (const shape of ['success', 'duplicate'] as const) {
      const delivery = await simulateIpn(request, {
        shape,
        orderPublicRef: order.public_ref,
        expectedAmountAgorot: order.expected_amount_agorot,
        transactionId,
      })
      // Both answer 200. A duplicate is not an error — treating it as one is what makes a
      // provider retry for ever.
      expect(delivery.webhook_status).toBe(200)
    }

    const settled = await readOrder(request, order.public_ref)
    expect(settled.status).toBe('paid')

    const payments = await request.get(
      `${ORIGINS.parent}/api/v1/payments?payer_person_id=${scenario.payerPersonId}`,
      { headers: { Authorization: `Bearer ${await managerToken(request)}` } },
    )
    const recorded = (
      (await payments.json()) as { items: { payment_order_id: string | null }[] }
    ).items.filter((row) => row.payment_order_id === order.id)
    // One payment for one card charge, however many times uPay says so.
    expect(recorded).toHaveLength(1)
  })

  test('the manager is alerted about a mismatch, at high priority', async ({
    context,
    page,
    request,
  }) => {
    // §5.10 — 'a high-priority manager alert is raised'. Asserted on `6c`, because an alert
    // that exists in the database and never reaches the alert centre is not an alert.
    const scenario = await buildScenario(request, { parent: 'assistant' })
    const order = await openOrderFor(request, scenario)
    await simulateIpn(request, {
      shape: 'amount_mismatch',
      orderPublicRef: order.public_ref,
      expectedAmountAgorot: order.expected_amount_agorot,
    })

    await signInAs(context, 'manager', 'dashboard')
    await page.goto(`${ORIGINS.dashboard}/#/alerts`)

    await expect(page.getByTestId('alert-centre')).toBeVisible()
    const alert = page.getByTestId('billing-alert')
    await expect(alert).toBeVisible()
    // `Alert` sets role="alert" only when `live` is true, and `DebtAlert` sets it for the
    // mismatch precisely because it appears in response to something that just happened.
    await expect(alert.getByRole('alert')).toContainText('סכום')
  })
})

/** A manager bearer token, for the two reads that are manager-only by design. */
async function managerToken(request: Parameters<typeof simulateIpn>[0]): Promise<string> {
  await request.get(`${ORIGINS.parent}/api/v1/dev/sign-in-as/manager`, {
    params: { app: 'dashboard', return_path: '/' },
    maxRedirects: 0,
  })
  const refreshed = await request.post(`${ORIGINS.parent}/api/v1/auth/refresh`)
  return ((await refreshed.json()) as { access_token: string }).access_token
}
