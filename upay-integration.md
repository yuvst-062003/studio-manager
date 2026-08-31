# uPay Integration — Studio Manager

> **Read [Round three](#round-three--refername-is-an-allowlist-2026-08-31) and then [Round two](#round-two--live-account-testing-2026-08-25) first.** Everything
> before it is round one, written from earlier testing. Round two was done against the
> live account with real charges and **corrects two things that would have reached
> production**: the inbound `amount` format is not the outbound one, and `livesystem=0`
> is not a control this account supports. Where the two sections disagree, round two
> wins.

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
  <input type='hidden' name='refername' value='UPAY'>            <!-- allowlisted; see Round three -->
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

---

# Round two — live account testing, 2026-08-25

Everything above is round one. This section is a second pass done against the **live**
merchant account in Chrome, with real (₪1) charges. Where the two disagree, this section
wins — it was observed, not described.

Each item is labelled as it was reported: **[VERIFIED]** observed directly ·
**[STATED]** told to us by uPay, untested · **[NOT COVERED]** never established.

## The account

| | |
|---|---|
| Merchant email | Held in `UPAY_MERCHANT_EMAIL` (Railway variables). **Not in this repo** — it is the identifier that decides whose account receives money. |
| Status | **[VERIFIED]** live, with real revenue history. Every test charge was real money. |
| Installment cap | **[VERIFIED]** the dashboard dropdown stops at **12**. `MAX_INSTALLMENTS` in `form.py` clamps to it; behaviour above 12 was never tested and now never needs to be. |
| Fee | **[VERIFIED]** ~1%, taken at settlement (₪1.00 gross → ₪0.99 transferred). It is **not** in the IPN — `depositnetamount` came back equal to `depositamount`. |
| Domain registration | **[VERIFIED]** no domain/website field exists on the account. Changing our domain needs nothing on uPay's side. |
| `refername` | **[VERIFIED]** a case-sensitive **allowlist**, not free text — see [Round three](#round-three--refername-is-an-allowlist-2026-08-31). Only `UPAY` (or omitting the field) is accepted on this account. Round two's "free text" reading was wrong and reached production. |
| API key | An API key exists in account settings. Unused — the form path works and needs no API. Noted only so nobody rediscovers it as a surprise. |

## There is no sandbox — and §19.6 was redesigned because of it

**[NOT COVERED], and that is the finding.** `livesystem=0` was never tested, and the
account has no sandbox mode to test it against.

This mattered more than it looks. SPEC §19.6 restriction 5 used to read *"the demo
studio's uPay configuration is pinned to `livesystem=0`"* — a guarantee **delegated to
uPay**. `tests/restrictions/test_05_no_live_money.py` could assert that we *send* `"0"`;
no test could assert that uPay *honours* it. If the flag is a no-op, a demo walkthrough
charges a real card on the live account, and every test stays green while it happens.

A safety property CI cannot verify is not a safety property. So it moved into our code:
`upay_form_fields` now **raises `DemoStudioHasNoLiveForm`** for a demo studio. Not a
weaker form — no form. `livesystem` is the constant `LIVE`, because every form this
module builds is real. The demo studio's payment step renders §19.5's IPN simulator,
which never leaves our origin. `DEMO_UPAY_SETTINGS = {"livesystem": 0}` on the studio row
stays as defence in depth and is no longer what the restriction rests on.

## The IPN contract

**Transport [VERIFIED]:** `GET`, no request body. Arrives asynchronously a few minutes
after payment — "delayed" is verified, the "~5 minutes" figure is approximate. Build the
UI for a delay, never for instant confirmation.

**`paymentdetails` → `productdescription` [VERIFIED], three times out of three.** The
field carrying our order reference *is* renamed between the outbound form and the inbound
callback. This is correct in `form.py` and `ipn.py` and is not a transcription error.

**The amount format [VERIFIED], and it is the trap.** A ₪1 payment returned `amount=1` —
**not** `1.00`. The outbound form field is `1.00` (`form.shekels()`). Reusing that
formatter for the inbound payload is what the simulator used to do, which made the
simulator agree with a string-comparing parser while uPay disagreed with both. §5.10
escalates an `amount_mismatch` to a manager as suspected tampering, so the failure mode
was **a fraud alert on every correct whole-shekel payment** — and every charge in this
product is whole shekels.

Hence two functions in `ipn.py`, and neither is `shekels()`:

- `ipn_amount(agorot)` — renders uPay's inbound format (`100 → "1"`).
- `agorot_from_ipn_amount(text)` — parses `"1"`, `"1.0"`, `"1.00"` to the same integer.
  **M6 compares integers.** An unrecognised format raises rather than coercing, because
  a silent coercion becomes a fraud alert on a good payment.

Fractional amounts have never been observed and the rendering above is a best guess. If
fractional pricing ever lands, re-test rather than trust.

**Tampering [VERIFIED].** An edited `amount=2` against a form hardcoded to `1` came back
as `amount=2` **and** `depositamount=2`, unmodified. Both fields carry the tamper, so a
parser reading either must validate independently. Confirms round one: no signature
exists on any request, inbound or outbound.

**Source IP [VERIFIED] on two of three deliveries** — `84.95.87.35` (Petah Tikva).
Whether it can change is **[NOT COVERED]**. Treat it as a weak signal, never a gate.

**`application=BIT` is a channel label, not a payment method [VERIFIED].** The dashboard
showed "bit" for Visa-paid transactions. Never parse it as the instrument used.

**Receipts [VERIFIED] with a caveat.** A real document is generated and reachable in the
dashboard, but its header reads **קבלה** (receipt) only, not **חשבונית מס** (tax invoice),
despite the account config saying `INVOICEANDRECEIPT`. Whether the per-transaction flags
control this is unresolved. **Do not generate or infer these documents** — store
`transactionid` and link to uPay's own receipt view.

### The full field set — 31 fields

Captured verbatim from a real payment. The list in round one had **eight**;
`ipn.py` now builds all 31, and `tests/dev/test_ipn_simulator.py` asserts the set.

```
providererrorcode  errordescription  providererrordescription  providerconfirmationnumber
amount  depositamount  depositnetamount  commissionreduction
firstpayment  constantpayment  numberpayments
productdescription  transactionid  depositcashierid
fourdigits  cardownername  cardname  cardtype  companytype  clearer  foreign  expirydate
application  merchantnumber  email
paymentdate  actiondate
comment  identitynumber  cellphonenotify  emailnotify
```

Note `email` is the **merchant's** address echoed back, not the payer's, and
`merchantnumber` identifies the account. Either may serve as a weak extra layer, with the
same standing as the source IP: a signal, never proof.

## Still open — and deliberately not blocking

Retries on a non-200 (**[NOT COVERED]**), IPNs for failed or declined payments
(**[NOT COVERED]**), and duplicate delivery (**[NOT COVERED]**) were never established.
None of them blocks M6, because the design does not depend on knowing the answers:

1. **Log every raw callback before parsing** — full query string, headers, timestamp.
   The single highest-value piece of infrastructure here: it turns each unknown above
   into something observed in production with full data, rather than pre-guessed.
2. **Idempotence keyed on `transactionid`** — neutralises retries and duplicates
   whatever uPay actually does.
3. **Return 200 immediately**, after logging and before the heavy work.
4. **`payment_order.status` moves one way**, `pending → paid`, never back.
5. **Always validate the amount server-side** against the order's own row.
6. **Treat "no IPN ever arrived" as a failure signal in its own right** — an order still
   `pending` after N hours goes to the reconciliation queue. Do not wait for a
   failure-shaped payload that may not exist.

## Recurring — unchanged

**[VERIFIED] + [STATED]**, no correction to round one. A recurring IPN is structurally
identical to a one-time one (`constantpayment=0`, `numberpayments=1` regardless of a
12-month plan) and carries no customer identifier. uPay support reconfirmed there is no
way to add one. Recurring stays manual, on the same "mark as paid" flow as bank
transfers.

One new observation: the recurring payment page shows the customer **no
monthly-commitment disclosure** anywhere. If that flow is ever used for real, the
disclosure has to come from our side.


---

# Round three — `refername` is an allowlist, 2026-08-31

One field, one correction, and it is the field round two labelled **[VERIFIED] free text**
while noting in the same sentence that the value we actually ship "has never actually been
submitted". Those two halves should not have been allowed to coexist: the label was applied
to a value nobody had tried.

## What happened

A parent opened the card route on production and paid ₪600. The API did everything right —
`POST /payment-orders` returned 201, `GET /payment-orders/{ref}/form` returned 200, the
browser POSTed to uPay. uPay replied:

```
HTTP/2 200
content-type: text/html; charset=UTF-8
content-length: 33

wronginputrefername STUDIOMANAGER
```

**A rejection delivered as an HTTP 200 with a text/html content type**, so the browser
rendered it: one line of English on a white screen, where the card form should have been.
Nothing in our logs recorded a failure, because on our side nothing failed. The order sat
`pending`, no IPN ever arrived, and `upay_ipn_record` stayed empty.

## The probe

Against the live account the same evening, one field varied at a time, everything else held
at the exact values `form_fields` produced for that parent's order:

| `refername` | Response |
|---|---|
| `UPAY` | **38681 bytes** — the real card page, `סכום לתשלום 600.00 ₪` |
| *(field omitted entirely)* | **38681 bytes** — the same real card page |
| `STUDIOMANAGER` | 33 bytes — `wronginputrefername STUDIOMANAGER` |
| `Gladiator` | 29 bytes — `wronginputrefername Gladiator` |
| `upay` | 24 bytes — `wronginputrefername upay` |

So: an allowlist, **case-sensitive**, with `UPAY` as this merchant account's entry. Whether
the entry is per-account or global is **[NOT COVERED]** — there is one account to ask.

`refername` is the only field this round re-tested. Every other row in round two stands.

## What this changes beyond the literal

`form.py` now sends `REFERNAME = "UPAY"` and `tests/upay/test_form.py` pins it with this
evidence attached, because **no test CI can run reaches uPay**. That is the uncomfortable
part and it is worth stating plainly: the pin is a tripwire on the literal, not a check that
the literal is right. Only a probe against the live account can tell you that. If you change
the value, re-run the probe first.

Two general lessons, both cheap next time:

1. **[VERIFIED] means the exact bytes were sent and the response was read.** Round two
   verified that *`UPAY`* was accepted and then documented the field as free text — a
   generalisation from one sample, recorded at the same confidence as the observation.
   A value that has never been submitted is [NOT COVERED], however plausible it looks.
2. **uPay signals rejection with 200.** There is no status code to key on, inbound or
   outbound. Any future check of an outbound form has to read the body.
