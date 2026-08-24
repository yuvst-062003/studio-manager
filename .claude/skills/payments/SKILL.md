---
name: payments
description: How payments work in this app — uPay flows, callbacks, reconciliation rules
---
# Payment model

Two paths, deliberately different:

## One-time payments (automated)
1. App creates a unique payment link per order via the provider.
2. Order reference is stored locally with status `pending`.
3. Provider calls our server callback on completion.
4. Callback handler matches on order reference, verifies the payload, sets status `paid`.

Rules:
- The callback must be idempotent. The same notification can arrive more than once.
- Store only non-sensitive metadata. Never card data.
- Never trust an amount from the client — compare against the stored order.
- A callback for an unknown reference is logged and rejected, not auto-created.

## Recurring (הוראת קבע) — manual
The provider cannot create per-customer recurring links programmatically, and a shared
link gives no way to tell who paid. So recurring is tracked in-app by an admin marking
a month as paid — identical flow to bank transfers.

Do not build automated recurring billing. Do not attempt to parse a shared link's
notifications into per-customer records.
