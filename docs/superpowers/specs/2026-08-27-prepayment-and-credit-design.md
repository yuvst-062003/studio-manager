# Prepayment and credit — design

**Date:** 2026-08-27
**Status:** Approved for planning. No implementation has started.
**Covers:** paying for months whose charges do not exist yet — cash three months forward,
twelve cheques for a year — and the credit balance that makes it work.
**Companions:** `2026-08-27-training-plans-design.md` and
`2026-08-27-payment-routes-links-and-cheques-design.md`. This document closes an open item
in both.

---

## 1. The gap both other specs hit from opposite sides

The training-plans spec found it at §11: a family who paid twelve cheques in September
cannot be charged the difference when they upgrade in November, because the money for
November is already in a drawer. The payment-routes spec found it at §14: a promise can
only name charges that already exist, and a year of post-dated cheques covers eleven months
that have not been billed.

Both are the same missing idea. The club sells a monthly subscription and collects it in
lumps — 900 ₪ of cash for three months, twelve cheques for a year — and the ledger has no
way to say "this money is for a month that has not happened yet."

## 2. Credit is a surplus, and the ledger already says so

Nothing new is needed to *hold* the money. `PaymentAllocation`'s docstring in
`app/models/billing.py` already describes the shape:

> allocations totalling less than the payment leave a surplus, which surfaces in the
> reconciliation queue and **can be allocated forward to next month's charge**

A payment of 900 ₪ allocated 300 ₪ to September's tuition leaves 600 ₪ allocated to nothing.
That surplus **is** the credit. It needs no table, no column and no new concept — a
`payment` row and a short allocation list already express it exactly.

What is missing is only that nobody draws it down, nobody can see it, and no parent can
declare that they meant to create it.

### 2.1 `payer_balance` is not changed

`BillingService.payer_balance` deliberately excludes the surplus, and says why:

> `paid` is the sum of ALLOCATIONS, not of payments — an unallocated surplus is money
> received that settles nothing yet, and counting it here would make the balance disagree
> with the charges it is supposedly the balance of.

That reasoning is correct and this feature does not touch it. Folding credit into
`balance_agorot` would make a prepaid family read as having a negative debt, which is not
what a debt figure means. Credit becomes a **sibling number**:

```
credit_agorot(payer) = sum(payment.amount_agorot)
                     - sum(payment_allocation.amount_agorot)
                     over that payer's payments
```

`PayerBalanceOut` gains `credit_agorot`. `balance_agorot` keeps its meaning to the agora.

## 3. The billing run draws it down — step 7

§5.10's run has six steps today. This adds a seventh, **inside the same run and the same
transaction**:

> **Step 7 — apply credit.** After every charge for the period has been raised, allocate
> each payer's available credit to their open charges, oldest first, smallest-period first,
> until the credit is exhausted or no open charge remains. Each allocation is a normal
> `payment_allocation` row; `recompute_charge_status` settles the charge as it would for any
> other payment.

**It must be in the same transaction as steps 1–6.** If the drawdown were a separate job,
every prepaid family in the club would appear in the manager's collections list as a debtor
for as long as the gap lasted, and the parent's app would show a debt they had already paid.
A family who has paid ahead must never, at any instant, read as owing money.

Allocation is oldest-first so a partial credit settles the oldest debt rather than
scattering across several charges and settling none — which is the same rule a manager
would apply by hand.

Nothing about steps 1–6 changes. The run still raises one tuition charge per student at
their plan's amount, still prorates the first month, still skips frozen students, still
charges the registration fee once. Step 7 only spends money that has already arrived.

## 4. Declaring a prepayment

`payment_promise` (from the payment-routes spec — `cash_request` renamed, carrying
`method IN ('cash','cheque')`) gains one column:

| Column | Meaning |
|---|---|
| `prepay_months` | integer, default 0. Whole months of tuition bought forward beyond the charges this promise names. |

A promise therefore has two halves, and they never double-count:

- **`charges[]`** — specific open charges it settles. Unchanged behaviour, including the
  non-tuition ones: a shop item, a registration fee, an event.
- **`prepay_months`** — whole future months, priced at the payer's current monthly total.

```
forward_agorot = prepay_months × Σ (monthly_amount_agorot of each active student's plan)
total_agorot   = Σ (selected charge amounts) + forward_agorot
```

The sum runs across **all** the payer's active students, because a parent with two children
thinks in "three months for both", and credit is payer-level in any case.

`total_agorot` keeps the meaning it already has: *what the parent saw when they raised it* —
display, never settlement. Confirmation recomputes, exactly as the cash path does today, so a
promise raised before a card payment cannot over-collect.

### 4.1 What confirmation does

One `payment` row for the confirmed amount, method `cash` or `cheque`. Allocations to the
named charges, oldest first. **Whatever remains is left unallocated** — and that remainder is
the credit, which step 7 will spend over the coming months. There is no second mechanism and
no "prepayment" row: the surplus already means this.

## 5. The manager sets the terms

The club's rules — cash three months forward, twelve cheques — are studio configuration, not
constants:

| Setting | Default | Where |
|---|---|---|
| `cash_prepay_months` | 3 | `studio.settings` |
| `cheque_prepay_months` | 12 | `studio.settings` |

`studio.settings` is already the JSONB the wizard keeps its progress in, and these are exactly
that kind of value. They are edited in **Dashboard → Settings → Payments** — the same screen
the payment-routes spec puts the הוראת קבע links on, which is the right cohesion: one screen
answers "how may a family pay this club".

Setting a term to `0` removes the forward offer for that route and returns it to
settle-open-charges-only, which is how cash behaves today.

## 6. What the parent sees

**The cash and cheque cards become term-based when the student has a plan.** Today the cash
card offers to settle the open charges. With a plan and a configured term it offers the
club's actual rule:

```
CASH                                           3 months
   September (open)                  300 ₪
   October, November (forward)       600 ₪
   ─────────────────────────────────────────
   Total                             900 ₪
   [I will pay cash]
   The club records the payment when the money arrives.

CHEQUES                                       12 months
   September (open)                  300 ₪
   October – August (forward)      3,300 ₪
   ─────────────────────────────────────────
   Total                           3,600 ₪
   [I will bring cheques]
```

The breakdown is shown rather than a single figure, because 900 ₪ with no explanation is the
kind of number a parent phones about.

**And the credit is what remembers.** Once confirmed, the payments screen shows:

```
PAID AHEAD
   600 ₪ in credit — covers October and November
```

**This is derived, never stored.** A stored `paid_through = 2026-11-30` would become a lie the
moment the family upgrades to 400 ₪, because 600 ₪ no longer reaches the end of November. The
credit balance divided by the current monthly total is always true, recomputes itself after
any plan change, and degrades honestly:

> 600 ₪ in credit — covers October, and 200 ₪ of November

## 7. What the manager sees

- **Collections list** — a payer with credit is not a debtor and must not appear as one. Their
  charges are settled by step 7 before the list is ever read.
- **Household row and payer balance** — `credit_agorot` beside `balance_agorot`, never merged.
  A manager about to phone a family should see "paid ahead 600 ₪" before dialling.
- **Reconciliation queue** — unchanged. It already surfaces surpluses; those from a confirmed
  prepayment promise are expected rather than anomalous and are labelled so, otherwise every
  prepaying family raises a false alert every time they pay.

## 8. Why this closes the plan-change collision

Open item 1 in the training-plans spec — an upgrade colliding with money already collected —
dissolves without any code that knows about upgrades.

A family prepays 900 ₪ for three months at 300 ₪, then upgrades to 400 ₪ from 1 October:

| Run | Charge raised | Credit before | Allocated | Credit after | Parent owes |
|---|---|---|---|---|---|
| September | 300 ₪ | 900 ₪ | 300 ₪ | 600 ₪ | — |
| October | 400 ₪ | 600 ₪ | 400 ₪ | 200 ₪ | — |
| November | 400 ₪ | 200 ₪ | 200 ₪ | 0 ₪ | **200 ₪ open** |

The shortfall appears as an ordinary open charge on the ordinary payments screen, payable by
any route. Nobody computed a difference, nobody prorated anything, and no manager had to work
out what eight undeposited cheques were worth against a new price.

**The standing-order case is the one that still needs a human**, and only that one: the shared
uPay link charges a fixed amount, so an upgrade genuinely requires cancelling the old mandate
and sending the new link. The training-plans spec's §11 manager task narrows from all three
routes to that one.

## 9. The API

| Endpoint | Change |
|---|---|
| `POST /api/v1/me/payment-promises` | body gains `prepay_months` |
| `GET /api/v1/me/balance` | response gains `credit_agorot` |
| `GET /api/v1/payers/{id}/balance` | response gains `credit_agorot` |
| `GET /api/v1/me/prepay-terms` | the studio's configured cash and cheque terms, and the payer's monthly total, so the parent screen can render the breakdown without arithmetic of its own |
| `PATCH /api/v1/studio/settings` | the two term values, manager-only |

Step 7 lives in `app/services/billing/run.py` beside the six steps it follows. The credit
query lives in `BillingService` beside `payer_balance`, because they are the two halves of one
question and splitting them is how they drift apart. M6 remains the only lane that writes a
billing table.

## 10. Testing

- **Step 7 settles forward.** A 900 ₪ cash payment against a 300 ₪ September charge leaves
  600 ₪ credit; the October and November runs settle their charges from it and leave nothing.
- **Step 7 is inside the run's transaction.** A prepaid payer is never observable as having an
  open charge between step 6 and step 7. This is the test that protects the manager's
  collections list.
- **Oldest first.** A credit smaller than the sum of two open charges settles the older one
  fully rather than both partially.
- **The upgrade table in §8 is a test**, row by row, ending with a 200 ₪ open charge.
- **`balance_agorot` is unchanged** by the presence of credit — the existing `payer_balance`
  tests must pass untouched, which is what proves the sibling field did not leak.
- **Derived, not stored** — after a plan change from 300 to 400, the same 600 ₪ credit reports
  "October, and 200 ₪ of November" rather than "through November".
- **A term of 0** returns the route to settling open charges only.
- **Over-collection is impossible** — a promise raised before a card payment confirms for the
  recomputed amount, the existing cash rule, re-run for cheques and for prepayment.
- **Tenancy** — credit is invisible across studios, per invariant 2.
- **Money is agorot throughout**, per G2. `prepay_months × monthly` is integer arithmetic and
  never touches a float.

Database tests fail rather than skip without a local database, per the project rule.

---

## 11. What this deliberately does not deliver

- **No cheque register.** A twelve-cheque promise creates one payment and one credit. The app
  does not hold eleven future cheques, their dates or their deposit status. If the manager
  wants that, it is a different feature and a different table.
- **No refund flow.** A family who leaves with credit is settled by hand. `credit_adjustment`
  already exists in `PAYMENT_METHODS` for exactly this; the workflow around it is §12.
- **No expiry.** Credit does not lapse.
- **No change to steps 1–6.** Proration, closures, frozen students and the registration fee
  behave exactly as they do today.
- **No automated recurring billing.** G8 is unchanged and always will be with this provider.

---

## 12. Open items

1. **Refunds.** A family leaving mid-term with credit needs the money back. The ledger can
   express it as a negative `credit_adjustment`; the flow around it — who may authorise, what
   the parent sees — is unspecified and deliberately out of scope here.
2. **Multiples of a term.** This spec offers the manager's configured term exactly. A parent
   wanting six months of cash rather than three would need a multiplier on the promise. Worth
   asking the manager whether that happens.
3. **Should a prepaid family be offered an upgrade at all?** §8 shows it resolves correctly and
   the parent simply owes the difference later. The alternative — refusing the upgrade until
   the credit runs out — is defensible and worse, and is recorded only so the choice is on the
   record.
4. **Labelling expected surpluses in the reconciliation queue.** §7 says they should be
   distinguishable from genuine anomalies. Whether that is a flag on the payment or a join
   through the promise is an implementation detail left to the plan.
