# Payment routes — standing-order links and cheques

**Date:** 2026-08-27
**Status:** Approved for planning. No implementation has started.
**Covers:** two gaps on the same screen — a manager-set הוראת קבע link per price plan, and
cheques as a payment route alongside cash.
**Companions:** `2026-08-27-training-plans-design.md` defines the plans; this one defines
how a parent pays for one. `2026-08-27-prepayment-and-credit-design.md` **closes open
item 1 below** — it is what lets a promise cover months not yet billed. Independent;
any may ship first.

---

## 1. Why these two are one document

Both live on the parent payments screen, both are routes by which money reaches the club
without the app being able to confirm it, and both end at the same place: a manager
confirming by hand. §5.10 already says all three routes are always visible. Today one of
them renders a dead section and the other does not exist.

The manager's own letter lists three ways to pay: standing order by credit card *("links
attached below")*, twelve cheques made out to the association, and cash three months
forward. The app can serve the first and the third. It cannot serve the second at all.

---

# Part A — the standing-order link

## 2. The seam already exists and is wired to nothing

`web/apps/parent/src/features/billing/PaymentsScreen.tsx` already renders the link:

```tsx
{standingOrderLink ? (
  <a href={standingOrderLink} data-testid="standing-order-link">
    {t(locale, 'billing.standingOrder.link')}
  </a>
) : null}
```

The prop is typed, the Hebrew string `billing.standingOrder.link` exists in
`web/packages/i18n/he/billing.ts`, and a test in `ParentBilling.test.tsx` already passes a
URL through it. And then `PaymentsSection.tsx` hardcodes `standingOrderLink={null}`, so no
parent has ever seen it.

This is not a missing feature so much as a missing **source**. Nothing in the schema holds
a payment link. That is what Part A adds.

## 3. Where the link lives

**`price_plan.standing_order_link_url`** — nullable text.

It belongs to the plan and not to the studio because uPay cannot create a per-payer
mandate. G8 in `app/models/billing.py` already spells this out: the tiers are *shared
links*, one per amount, and `recurring_subscription` is only the manager's note of who is
on which. The manager's letter says "links", plural, for exactly this reason. One link per
plan is what the club already has.

It is named `standing_order_link_url` rather than `payment_link_url` because it is
specifically the link that opens a הוראת קבע. Cheques and cash have no link, and a general
name would invite someone to reuse this column for a one-off payment page, which is what
`payment_order` is for.

### 3.1 The one mutable column on an immutable table

`price_plan` is versioned by `active_from` / `active_to` and **never edited in place** —
that is what lets a charge raised last year still be explicable by the plan that raised it.
This column is the deliberate exception, and the reason it is safe is that a URL explains
nothing about a historical charge. The immutability rule protects `monthly_amount_agorot`,
`sessions_per_week`, `active_from` and `active_to`; a link is an operational pointer to a
page that may be re-created at any time, and a typo in it must be fixable without inventing
a price change that never happened.

The docstring says so explicitly, and every write goes through `AuditService.record` so the
history lives in `audit_log` rather than in extra plan rows.

### 3.2 A successor plan does not inherit the link

When a plan is closed and a successor opened — the yearly rollover in §5.15, or any price
change — **`standing_order_link_url` is left NULL on the successor, never copied.**

This is the most important rule in Part A. A uPay shared link carries a fixed amount. Copying
the 300 ₪ link onto a 320 ₪ successor would send every parent to sign a mandate for the old
amount, and the club would under-collect all year without a single error appearing anywhere.
Leaving it NULL degrades exactly the way the screen already degrades today: the standing-order
card renders with its instructions and without a link, which is a visible, harmless prompt
for the manager to paste the new one.

The rollover's prices step (`web/apps/dashboard/src/features/rollover/PricesStep.tsx`) and the
price-plan list both show a **"link missing"** badge for any active plan with a NULL link.

## 4. Validation, and why the host is restricted

This URL is shown to parents as the club's official payment page, so a bad value here is a
phishing page with the club's name on it. Two rules:

1. **`https://` only.** A plaintext link to a payment form is refused.
2. **The host must be on a configured allowlist**, defaulting to uPay's domains, read from
   settings the way every other integration constant is. A manager who genuinely needs a
   different host asks for a configuration change; that is a deliberately higher bar than a
   text field.

The dashboard shows the **full URL**, not a "link set" checkmark, so a typo is visible
without clicking. The value is not a secret and needs no scrubbing, but it is also never
interpolated into a log message — payloads go in `extra=`, per the project rule.

## 5. Where the manager sets it

**Two surfaces, one field, no new wizard step.** `WIZARD_STEPS` in
`app/services/structure/setup.py` is `("studio", "belts", "groups", "prices", "staff",
"students")` — `prices` is already step 4, and that tuple is a contract this feature does not
touch.

| Surface | Behaviour |
|---|---|
| Setup wizard, `prices` step | The link sits beside the amount on each plan as it is created. Optional — leaving it blank does not block the step, because a club may not have its links yet on day one. |
| Dashboard → Settings → Payments | The canonical editor. Every **active** plan, its amount, and its link, editable in place. Closed plans are not listed; their links are dead by definition. |
| Dashboard → Billing → Price plans | Read-only display plus the "link missing" badge, so the gap is visible where prices are reviewed. |

`web/apps/dashboard/src/features/settings/SettingsScreen.tsx` gains the section;
`PricePlansScreen.tsx` and `PricesSection.tsx` gain the badge.

## 6. What the parent sees — and why it is a list

A payer may have two children on different plans. One link is the wrong shape: a parent with
a child on 300 ₪ and a child on 400 ₪ needs both, labelled, or they will sign one mandate and
underpay for the other child every month.

So `PaymentsScreen`'s prop changes:

```ts
- standingOrderLink: string | null
+ standingOrderLinks: StandingOrderLink[]      // { studentName, planName, amountAgorot, url }
```

One row per child who has a plan with a link. An empty array renders exactly what renders
today — the card, the instructions, no anchor — so the null case is not a special case. A
parent only ever sees links for **their own children's plans**; the full catalogue is never
exposed, or a 300 ₪ payer could sign the 550 ₪ mandate by accident.

The existing `billing.standingOrder.activeWarning` still applies unchanged: it is a warning
that a mandate is already on file, never a block, and the parent decides.

## 7. "When he updates it, the parent app shows the new link"

The link is read live from the API on every visit to the payments screen. It is **not** part
of the service-worker precache and **not** part of any offline bootstrap payload.

This is worth stating because the parent app is an installed PWA and the rest of this screen
is cache-friendly. A stale payment link is not a stale roster: it sends a family to sign a
mandate at the wrong amount, and neither they nor the manager would find out until the
reconciliation queue disagreed months later. If the screen is ever served from cache, the
link section revalidates before it renders an anchor.

---

# Part B — cheques

## 8. Cheques are cash with a different word on the payment

The manager collects twelve post-dated cheques made out to the association. Mechanically
that is identical to what `cash_request` already does, and the docstring on
`app/models/cash.py` describes the shape exactly:

> a parent says "I'm bringing cash" over specific open charges, with exactly two endings — a
> manager confirms and the charges settle through `BillingService`'s one writer, or declines
> and the parent is told rather than left guessing.

Replace "cash" with "cheques" and every sentence stays true: the snapshot is display and
never settlement, confirmation recomputes from the charges' outstanding amounts, and a
pending promise does not claim its charges.

So Part B builds no new mechanism. It generalises the one that exists.

## 9. The rename, and why now

`cash_request` becomes **`payment_promise`**, with a `method` column constrained to
`('cash', 'cheque')`. `cash_request_charge` becomes `payment_promise_charge`.

| Before | After |
|---|---|
| `cash_request` | `payment_promise` + `method` |
| `cash_request_charge` | `payment_promise_charge` |
| `POST /api/v1/me/cash-requests` | `POST /api/v1/me/payment-promises` (body carries `method`) |
| `GET /api/v1/me/cash-requests` | `GET /api/v1/me/payment-promises` |
| `GET /api/v1/cash-requests` | `GET /api/v1/payment-promises?method=` |
| `POST /api/v1/cash-requests/{id}/confirm` | `POST /api/v1/payment-promises/{id}/confirm` |
| `POST /api/v1/cash-requests/{id}/decline` | `POST /api/v1/payment-promises/{id}/decline` |

`status` keeps its three values, but `received` is the honest word for both routes and stays.
`CashService` becomes `PaymentPromiseService`; `CashRequestsPanel.tsx` becomes
`PaymentPromisesPanel.tsx` with a method column and a method filter.

**Why rename rather than add a `method` column to a table called `cash_request`.** The table
shipped in this same feature pass and carries no production history worth protecting, so this
is the cheapest this rename will ever be. The alternative leaves every future reader of
`cash_request.method = 'cheque'` doing a double-take, and this codebase's naming is
deliberately literal — `Class` is `Class` because `class` is a keyword, `from_date` is
`from_date` because `from` is reserved. A table whose name contradicts its rows would be the
odd one out.

The cheaper path — keep `cash_request` and add `method` — is a legitimate call if the wave is
tight. It is recorded in §13.

## 10. `PAYMENT_METHODS` gains `cheque`

```python
PAYMENT_METHODS = (
    "upay_card", "standing_order", "bank_transfer", "cash", "cheque", "credit_adjustment",
)
```

Without it, a confirmed cheque records as `bank_transfer` — which is what would happen today —
and the club loses the ability to answer "how much of this year is sitting in undeposited
cheques". Only `upay_card` arrives automatically; `cheque` joins the human-recorded group and
changes nothing else about how `BillingService` writes a payment.

`PaymentHistoryScreen.tsx` maps `'cheque'` to a new `billing.method.cheque` string, beside
the `standing_order` mapping it already has.

## 11. What the parent and the manager see

**Parent** — the payments screen gains a fourth card beside card, standing order and cash,
using the same "I will pay by…" affordance the cash card already uses. Picking it raises a
promise over the selected open charges and tells the parent plainly that the club records the
payment when the cheques arrive — the same expectation-setting as
`billing.standingOrder.notConfirmable`.

**Manager** — the existing promises panel gains a method column and filter. Confirm and
decline are unchanged. Nothing new to learn: it is the queue that already exists, with one
more word in it.

---

## 12. Testing

**Part A**
- The link renders in the parent app when set and the card renders without an anchor when not.
- `http://` is refused; a host off the allowlist is refused; the allowlist is configurable.
- **A successor plan is created with a NULL link.** This is the test that protects the club's
  revenue and it gets the most explicit name in the suite.
- A payer with two children on two plans receives two labelled links; a payer receives no link
  for a plan none of their children hold.
- Every write records an audit entry; the URL never appears interpolated in a log message.
- Tenancy: a plan's link is invisible from another studio, per invariant 2.

**Part B**
- A cheque promise confirms and settles through `BillingService`, recording method `cheque`.
- A declined promise leaves the charges open and the parent informed.
- Confirmation recomputes from outstanding amounts — a promise raised before a partial card
  payment cannot over-collect. This is the existing cash test, re-run for cheques.
- The method filter returns only what it says.
- Existing cash tests pass unchanged against the renamed service, which is what proves the
  rename was a rename.

Database tests fail rather than skip without a local database, per the project rule.

---

## 13. What this deliberately does not deliver

- **No mandate automation.** G8 is unchanged: uPay cannot create a per-payer mandate, the
  recurring IPNs carry no customer identifier, and reconciliation stays human-confirmed. This
  feature hands the parent a link; it does not pretend to know what happens after they click.
- **No cheque tracking.** A promise for twelve cheques settles the charges it names. The app
  does not hold eleven future cheques, their dates, or their deposit status. The manager's
  letter describes a year of post-dated cheques, and representing that properly means
  prepayment against charges that do not exist yet — see §14.
- **No per-plan link for cash or cheques.** They have no link. The column is named for the one
  route that does.
- **No studio-level fallback link.** A single link would be a link at one amount, which is the
  bug this design exists to avoid.

---

## 14. Open items

1. **Prepayment against future charges — now specified elsewhere.** Both real-world routes are
   prepaid, and `payment_promise_charge` can only name charges that already exist.
   `2026-08-27-prepayment-and-credit-design.md` resolves it: the promise gains a
   `prepay_months` column, the surplus becomes credit, and a new step 7 in the billing run
   draws it down. Read the two together before planning either.
2. **Cheque count on a promise.** "Twelve cheques" is information the manager would like to see
   in the queue. One nullable integer, and only worth adding if he confirms he wants it.
3. **Keep `cash_request` and add `method` instead of renaming.** §9 recommends the rename and
   explains why now is the cheapest moment. The cheaper path is available if the wave is tight.
4. **Whether the wizard should require a link before the `prices` step completes.** This spec
   makes it optional so a club can finish setup before it has its uPay links. If the manager
   would rather be stopped, it is one condition.
