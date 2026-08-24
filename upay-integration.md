# uPay Integration — Studio Manager

## Overview

uPay is the fixed payment provider (no alternative vendor option). This document covers two distinct flows:

- **One-time payments** — fully automated
- **Recurring payments (הוראות קבע)** — manual, cannot be automated with uPay

---

## 1. One-Time Payments — Full Flow

### Database schema

The existing `Order` model covers everything needed. No schema changes required.

```
Order
├── id                    (internal order reference — doubles as the reference sent to uPay)
├── amount                (decimal — expected charge amount)
├── status                (enum: pending / paid / failed)
├── paid_at               (timestamp, null until paid)
└── external_payment_ref  (uPay's transactionid, null until paid)
```

### Step-by-step flow

**1. Order creation (backend)**
When a parent needs to pay for something (tuition, a one-off item), the backend creates an `Order` row with `status=pending` and `amount=<price>`.

**2. Generate the payment form (backend, no uPay dashboard needed)**
The backend renders the raw HTML POST form dynamically per order — this is the undocumented-but-usable integration path (no official API needed):

```html
<form action='https://app.upay.co.il/API6/clientsecure/redirectpage.php' method='post'>
  <input type='hidden' name='email' value='your-merchant-email'>
  <input type='hidden' name='amount' value='{{ order.amount }}'>
  <input type='hidden' name='returnurl' value='https://yourapp.com/payment-complete?order_id={{ order.id }}'>
  <input type='hidden' name='ipnurl' value='https://yourapp.com/webhooks/upay?order_id={{ order.id }}'>
  <input type='hidden' name='paymentdetails' value='{{ order.id }}'>
  <input type='hidden' name='maxpayments' value='1'>
  <input type='hidden' name='livesystem' value='1'>
  <input type='hidden' name='createinvoiceandreceipt' value='1'>
  <input type='hidden' name='refername' value='STUDIOMANAGER'>
  <input type='hidden' name='lang' value='HE'>
  <input type='hidden' name='currency' value='NIS'>
  <input type='image' src='...payment-button.png'>
</form>
```

Key point: `amount` and `paymentdetails` are set per-order, dynamically, server-side. No manual dashboard step.

**3. Customer pays**
The parent clicks the button, lands on uPay's hosted page, and enters their card there. Card data never touches your servers — PCI-compliant by design.

**4. uPay notifies your server (IPN)**
~5 minutes after a successful payment, uPay's server sends an async `GET` request to your `ipnurl`, with the order ID embedded in the URL (`?order_id=...`) plus a query string payload:

```
errordescription=SUCCESS
providererrorcode=0
amount=<charged amount>
transactionid=<uPay's unique ID>
productdescription=<your order.id, echoed back>
cardownername=<payer's name>
fourdigits=<last 4 digits>
paymentdate=2026-08-20
```

**5. Backend reconciliation**

```python
order = Order.get(id=request.args['order_id'])  # or parse from productdescription
assert order.amount == float(request.args['amount'])   # verify — no signature exists, don't trust blindly
order.status = 'paid'
order.paid_at = now()
order.external_payment_ref = request.args['transactionid']
order.save()
```

**6. Return redirect (UX only, not the source of truth)**
The customer's browser is also redirected to `returnurl` with the same payload — useful for a "thanks, payment received" page. The IPN remains the authoritative signal (a closed tab means no redirect, but the IPN still arrives).

### ⚠️ Important caveat: no signature

The form has **no cryptographic signature or hash** on any field:

- Nothing stops a client from tampering with `amount` before submission (confirmed in testing — a manually edited amount was accepted and charged as-is)
- The backend **must** independently validate that the IPN's `amount` matches what was expected for that specific `order_id` — never trust the client-submitted value
- Optionally, check the source IP of the IPN request (`84.95.87.35` in testing) as an extra, non-sufficient layer

---

## 2. Recurring Payments (הוראות קבע) — Why It Can't Be Automated

### What was confirmed through testing + uPay support

1. **Link creation is dashboard-only.** Unlike one-time payments, there is no raw form/API equivalent for creating a recurring mandate — someone must manually open the uPay dashboard, select "הוראת קבע," pick the number of monthly charges, and generate the link by hand.

2. **The link is shared and fixed, not per-customer.** uPay confirmed a new recurring link cannot be dynamically generated per parent with a specific price/reference baked in, the way one-time links can. In practice: one link, one fixed amount, given to every parent.

3. **No way to distinguish which customer paid.** Tested directly — when multiple people pay through the same shared recurring link, uPay confirmed there is **no field in the IPN or return payload that identifies which specific customer made a given payment.** The IPN for a recurring charge is structurally identical to a one-time payment (`constantpayment=0`, `numberpayments=1` regardless of how many months are configured), and carries no reliable, unique-per-customer data — only the card owner's typed name and last 4 digits, which aren't sufficient for automated matching.

4. **No customizable identification field.** uPay confirmed there's no way to add a free-text field (e.g. student name) to the payment page for the customer to fill in.

### Practical consequence for the schema

Since there's no reliable programmatic signal, recurring payments **cannot flow into the automated `Order` reconciliation pipeline** the way one-time payments do.

- Recurring enrollment is tracked in its own schema, e.g.:
  ```
  RecurringSubscription
  ├── parent_id
  ├── amount
  ├── start_date
  └── status   (active / cancelled)
  ```
- No automatic `paid`/`unpaid` status per month — instead, this reuses the **same manual "mark as paid" screen** already planned for bank transfers
- The raw IPN log (name, last 4 digits, date, amount) from the shared link is kept as a **reference/audit trail** to support manual monthly reconciliation, but it is not wired into automatic status updates

### Summary

| | One-time payment | Recurring (הוראת קבע) |
|---|---|---|
| Link creation | Automated, in code | Manual, dashboard only |
| Payment identification | Automatic via IPN | Manual — no reliable signal |
| Reconciliation | Fully automated | Same manual flow as bank transfers |
| Source of truth | `transactionid` + `productdescription` | Manual verification against raw IPN log |
