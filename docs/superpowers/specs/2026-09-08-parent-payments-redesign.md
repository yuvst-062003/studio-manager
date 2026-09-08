# Parent payments — the receipt, the ceiling, and where a payment method lives

> Design, 2026-09-08. Nothing here is implemented yet.
>
> Five defects from an owner review of the parent app's תשלומים tab and of
> פרופיל → תשלומים. Four are in the screens; the fifth is a rule that exists in
> nobody's head but the owner's — the server permits what it forbids. Every claim below
> about current behaviour names the file and line it was read from.

## 1. The five defects

| # | Reported as | What it actually is |
|---|---|---|
| D1 | "When a person picked to pay he doesn't have the list to understand what he pays for — an item from the store plus מנוי" | The rebuild of 2026-09-07 dropped the per-charge rows. One total, and a subtitle of "month · child". |
| D2 | "When I press cash I can only pay for 3 months ahead, and not more. What if the person wants 5?" | UI only. `askFor` hardcodes the club's `cash_prepay_months` as the whole answer and offers no chips. The server accepts any non-negative number. |
| D3 | "When I switch to cash the total amount above doesn't change, only the bottom" | Deliberate — rule 1 of the rebuild is "the debt never moves". It fixed the mirror-image bug and created this one. |
| D4 | "Even though I finished the full wizard the payment option didn't get written" | Structural. `payment_promise.method` is constrained to cash / cheque / standing_order. **A card family can never have a promise**, and the profile sheet reads exactly that table. |
| D5 | "The cheques and the הוראת קבע are misplaced — it should be that if you press אמצעי תשלום they show, and I can switch between them" | The אמצעי תשלום row is an inert label. The two routes sit below it as always-open cards. |
| D6 | "Don't allow a user to pay more months if he already paid for a season (12 months)" | **The rule does not exist.** `MAX_PREPAY_MONTHS = 12` is per *order*, not cumulative, so a family may buy twelve months forward and immediately buy twelve more. The promise path checks only for a negative. |

## 2. The surfaces this touches

| File | Role |
|---|---|
| `web/apps/parent/src/features/billing/redesign/PayScreen.tsx` | The תשלומים tab. D1, D2, D3, D6. |
| `web/apps/parent/src/features/billing/redesign/pay.ts` | Its arithmetic. Everything with a number in it lands here. |
| `web/apps/parent/src/features/billing/redesign/ParentPayments.tsx` | The container and its seven reads. |
| `web/apps/parent/src/features/people/redesign/sheets.tsx` | `PaymentsSheet`. D5. |
| `web/apps/parent/src/features/people/redesign/ProfileScreen.tsx` | Where the method label is derived. D4. |
| `web/apps/parent/src/features/onboarding/wizard/submitJoin.ts` | The wizard's write. D4. |
| `app/services/billing/orders.py`, `app/services/billing/payment_promise.py` | D6, on the server, where a rule is a rule. |
| `app/models/people.py` | One new column. |

## 3. The payments screen becomes a receipt

### 3.1 One live total

The headline stops being the debt and becomes **what the button is about to charge**. It
moves the instant a method or a month count changes, so the figure at the top and the
figure on the button are the same figure and always were.

The debt does not disappear from the screen. It becomes a labelled line inside the
arithmetic below the headline. That is the whole of the fix for D3: the two numbers can no
longer disagree, because the smaller one is a *component* of the larger one rather than a
rival to it.

This preserves what rule 1 was protecting. That rule was written after a screen showed
₪208.33 above buttons offering ₪500, ₪750 and ₪3,000 — a reader forced to assemble a total
out of two figures. Freezing the top number was one way to stop that. Showing the sum is
the other, and it is the one that also answers D1.

```
┌──────────────────────────────────┐
│          לתשלום עכשיו            │
│           ₪1,275                 │
│  ──────────────────────────────  │
│  יובל · מנוי · ספטמבר      ₪375  │
│  יובל · חגורה כחולה        ₪120  │
│  3 חודשים מראש             ₪900  │
│  ──────────────────────────────  │
│  סה״כ                    ₪1,275  │
└──────────────────────────────────┘
```

### 3.2 The receipt lines

`receiptLines(ask, debts, terms)` — a pure function in `pay.ts`, beside `askFor`, tested
where a test can hold it. It returns, in order:

1. **One row per charge in the ask**, oldest first. Not per open charge — per charge *this
   payment settles*, so the rows and the total cannot disagree.
2. **One row for the months bought forward**, when there are any, priced at
   `forwardMonths × monthlyTotalAgorot`.
3. **The total**, which is `ask.totalAgorot` and is never recomputed here.

Beyond five charge rows the list collapses behind a הצג הכל toggle. A family six months
behind with three children has eighteen open charges, and a wall of them is a worse answer
to "what am I paying for" than a summary with a way in.

### 3.3 Row labels come from data that already exists

No server change. Each row's label is built in this order:

- `charge.proration_note` when set. This is already the shop item's name — `POST
  /me/orders/items` writes `"<product> ×2 (M) — <the parent's note>"` at
  `app/routers/shop.py:208`, and the coach's hand-over route writes the product name at
  `app/routers/billing.py:1468`. The billing run writes its proration explanation into the
  same column.
- Otherwise `billing.charge.kind.<kind>` — שכר לימוד / דמי הרשמה / אירוע / חיוב ידני. These
  four keys already exist in `web/packages/i18n/he/billing.ts`.

The child's name is prefixed when `charge.student_id` is set, and the month appended when
`period_year`/`period_month` are. A shop order is charged to the payer and names no
student, which is exactly why "item from the store plus מנוי" was indistinguishable before:
the two rows differ in the fields this label rule reads.

**A negative charge renders as a credit**, in the positive colour with its sign, never as a
purchase. §5.10 lets a manager write a negative manual charge for a discount, and
`product_id` is what separates that from a shop order.

### 3.4 The remainder, and what is not in the receipt

When the selection does not cover the whole debt — card, one month, three months owed — one
line says so: **נותר חוב פתוח ₪X**. Without it the receipt would be a complete-looking
document that quietly omits money.

Charges another payment already holds (`is_covered_elsewhere`) stay **out** of the receipt.
They are not being paid. They keep the existing amber note, which already names their
total, and they are counted in the remainder line.

## 4. Cash months — a floor, not a block

The cash route gets chips. The club's `cash_prepay_months` becomes the **minimum**, not the
answer, and the copy keeps naming the club as the one who set it.

The meaning of the cash number does not change: it is months paid **forward**, on top of
settling everything open, which is what "המועדון גובה 3 חודשים מראש" actually says. The card
number keeps its own meaning — months of training covered, oldest debt first. The two are
different questions and the legends will say so; the receipt is what makes the difference
visible rather than something to hold in one's head.

`cashMonthChips(floor, headroom)` in `pay.ts`, from the ladder `1 · 2 · 3 · 6 · 12`.
`headroom` is how many months the family may still buy before the ceiling of §5 stops
them; it is defined once, in §5.1:

```
lo = max(floor, 1)
headroom <= 0  →  no chips at all; cash settles what is open and buys nothing
headroom <  lo →  (ladder ∩ [1 .. headroom]) ∪ {headroom}     — §5.3, the ceiling wins
otherwise      →  (ladder ∩ [lo .. headroom]) ∪ {lo, headroom}
```

sorted and deduped. Worked examples, which become the test table:

| floor | headroom | chips | why |
|---|---|---|---|
| 3 | 12 | 3 · 6 · 12 | the ordinary case |
| 3 | 5 | 3 · 5 | the ceiling contributes the largest chip |
| 3 | 2 | 1 · 2 | ceiling below floor — §5.3 |
| 4 | 12 | 4 · 6 · 12 | a club whose floor is off the ladder |
| 0 | 12 | 1 · 2 · 3 · 6 · 12 | a club that collects no term |

`askFor` gains the chosen month count as a parameter rather than reading
`terms.cashMonths`. That is the whole of D2 on the client, and the server already permits
it — `PaymentPromiseService.create` refuses only a negative.

## 5. The prepayment ceiling — twelve months, rolling

### 5.1 Stated in money, once

A family may never be more than twelve months paid ahead. Measured off the credit they hold
**right now**, so the ceiling releases a month at a time as each month is billed.

The measure already exists and is already on the screen: `BillingService.payer_credit` —
money received minus money allocated to charges, reversals excluded from both sides
(`app/services/billing/service.py:286`). The screen reads it as `creditAgorot` and renders
it as שולם מראש.

```
PREPAY_CEILING_MONTHS = 12

ceiling      = PREPAY_CEILING_MONTHS × monthly_total_agorot
credit_after = credit_agorot + prepay_months × monthly_total_agorot

refuse when   credit_after > ceiling
headroom      = max(0, floor((ceiling − credit_agorot) / monthly_total_agorot))
```

**Floored, not truncated.** A family already past the ceiling — possible after a plan is
re-priced downwards — has a negative numerator, and JavaScript's `Math.trunc` would round
it towards zero while Python's `//` rounds away. `Math.floor` matches `//`, and the outer
`max(0, …)` makes both answer zero. The client and the server must not disagree about a
family at the boundary.

**In money, not months, deliberately.** A family whose plan was re-priced holds credit that
is not a whole number of months; two roundings of that — one on the screen, one on the
server — is how a chip a parent can press becomes an error they cannot read. One
expression, integer throughout (G2), and the two agree by construction:
`prepay_months ≤ headroom` implies `credit_after ≤ ceiling`.

`monthly_total_agorot = 0` — a payer with no priced active child — buys no months forward
on any route today, so the ceiling is moot for them and `headroom` is zero.

### 5.2 Enforced on the server, on both routes

A rule that lives only in the screen is not a rule, and D6 is currently exactly that: not
even the screen has it.

- `OrderService.create` — the existing `prepay_months > MAX_PREPAY_MONTHS` check becomes
  the cumulative one. The per-order cap it replaces was never the rule anyone wanted; it
  simply never counted what was already bought.
- `PaymentPromiseService.create` — the same refusal, beside the existing negative check.
  Both call `monthly_total_agorot` already, and both must call `payer_credit`.

Both raise `RefusedError`, which the routers already turn into a 422 naming the problem.
That follows this repo's own rule — refuse rather than accept when accepting creates a dead
end — and it is what makes the screen's disabled chips a mirror of the server rather than a
second opinion.

### 5.3 The ceiling overrides the club's cash floor

A family with two months of headroom and a club that collects three months at a time is
offered two. The floor exists to stop a family paying one month at a time in cash; a family
already ten months ahead is plainly not that family, and refusing money they are holding
out is the wrong end of the rule. At zero headroom the forward offer disappears entirely
and the cash route settles what is open — the way cash behaved before prepayment existed.

The screen says why, rather than showing chips that are simply absent:
**שולם מראש עד <month>**, derived from the credit and the monthly total.

## 6. The saved payment method

### 6.1 A promise cannot carry it

`payment_promise.method` is constrained to `('cash', 'cheque', 'standing_order')`
(`app/models/payment_promise.py:69`). Card is not a promise method and cannot become one —
a promise is a statement that money will arrive by hand, and a card order is money already
in motion. `submitJoin` reflects this correctly: cash, cheque and standing order write
promises; card writes a `payment_order` and nothing else.

`ProfileScreen` reads `/me/payment-promises` and takes row zero
(`ProfileScreen.tsx:202`). For a card family that list is empty, so the answer is always
לא הוגדר. It is not a bug in the read — the fact is not stored anywhere.

### 6.2 One column

`student.payment_method` — nullable, `String(20)`, with a check constraint on
`('upay_card', 'cash', 'cheque', 'standing_order')`.

**On `student`, per child**, because that is what the wizard already collects
(`methods: Record<draftId, PaymentMethod>`) and what הוראת קבע actually is: a mandate is
signed per child, at that child's own price, which is why
`GET /me/standing-order-links` returns a list rather than a link.

**A column rather than a table**, because `student` already carries `price_plan_id` — a
billing concern, per C11, priced per student — so a second one follows the existing
precedent instead of inventing machinery. Nullable because an existing family has not
answered yet, and a `lead` never will.

**The vocabulary is `payment.method`'s**, not the promise's, so the existing `methodKey`
mapping in `PaymentHistoryScreen.tsx:199` translates it untouched.

One migration, owned by `main` per the repo's rule that lanes never run
`alembic revision`.

### 6.3 Two endpoints

```
GET /me/payment-methods   → { items: [{ student_id, student_name, method | null }] }
PUT /me/payment-methods   ← { items: [{ student_id, method }] }
```

Both scoped to the caller's own children — the payer comes from the session and never from
the body, for the same reason payment orders do it. A student that is not the caller's is a
404, not a 403, so probing ids tells nobody anything. The write is audited via
`AuditService.record`; the method is not health data and carries no personal contents, so
the `diff` may name it.

Saving a method **raises no promise and moves no money.** It is a statement of intent. The
cheque request and the standing-order mandate stay actions, taken deliberately, inside the
picker.

### 6.4 The wizard writes it — and this is the fix

`submitJoin` calls `PUT /me/payment-methods` for **every** child, card included, after
`register` and before the promises. The card path currently records the choice nowhere.

The write is not fatal: a failure leaves the method unset and every outcome the family is
shown on step 4 unchanged. The registration has already landed by then, and losing a
preference is not worth failing a join over.

### 6.5 What the profile line says

`ProfileScreen` reads the new endpoint instead of `/me/payment-promises`:

- every child agrees → that method's word
- children differ → **מעורב**
- nothing set → **לא הוגדר**, as today

## 7. The picker

אמצעי תשלום stops being a label and becomes a button with a chevron. It opens a **second
sheet** over the profile one — matching how `ProfileScreen` already stacks sheets, and
keeping the payments sheet from outgrowing a phone the moment the mandate links and cheque
totals are inside it.

```
┌─ אמצעי תשלום ──────────────── ✕ ─┐
│ יובל סטולין                      │
│ [אשראי] [מזומן] [קבע] [צ׳קים]    │
│   ← the selected method's detail  │
│                                   │
│ נועה סטולין                       │
│ [אשראי] [מזומן] [קבע] [צ׳קים]    │
│                                   │
│         [    שמירה    ]           │
└───────────────────────────────────┘
```

One block per child. A one-child family sees a single block with no heading — the simple
four-way picker, which is the common case. Below the chips, the detail for what is
selected:

| Method | What appears under it |
|---|---|
| **הוראת קבע** | That child's mandate link, at that child's price, from `GET /me/standing-order-links` — the per-child list that already exists. |
| **צ׳קים** | The family-level total and the אביא צ׳קים button, shown **once** when any child is on cheques. Cheques buy a season for the family, not for one child. |
| **מזומן** | The club's `cash_instructions`. |
| **אשראי** | The PCI note, which is true only for them. |

The payments sheet is then: the balance strip, the אמצעי תשלום row, and כל התנועות. The two
always-open cards go away.

## 8. Deliberately not in this

- **The payments tab keeps offering card and cash only.** Those are the two "pay right now"
  routes. הוראת קבע and צ׳קים are set up once and stay in פרופיל — which is what D5 asks
  for, not against.
- **No backfill.** An existing family reads לא הוגדר until they set a method or the wizard
  writes one. Guessing from a past promise or payment would put a word in a family's mouth
  that they can see but did not say.
- **No new read for the ceiling.** `creditAgorot` and `monthlyTotalAgorot` are both already
  fetched by `ParentPayments`.
- **Instalment chips are untouched.** They are a card instruction about how the total is
  collected, not a smaller thing being bought, and bug #16 already settled their copy.

## 9. Testing

Arithmetic lives in `pay.ts` and is tested there, following the existing split.

**`pay.test.ts`**
- `receiptLines` over a mixed debt — a tuition month, a shop item, a manager's negative
  credit — labels each from the rule in §3.3
- the rows sum to `ask.totalAgorot` exactly, for card and for cash
- the remainder line appears only when the selection is short of the debt, and
  `coveredElsewhere` rows are excluded from the rows and counted in the remainder
- `cashMonthChips` against the five-row table in §4
- `headroom` and the refusal predicate agree at the boundary: the largest permitted month
  count lands exactly on the ceiling and the next one over is refused
- a payer with `monthlyTotalAgorot = 0` gets no chips and buys nothing forward

**`PayScreen`**
- switching method moves the headline **and** the button to the same figure — D3, asserted
  as the defect it was
- the receipt names a shop item by its own name and a tuition month by its month — D1
- at zero headroom the forward offer is gone and the paid-ahead line is shown — D6

**Server**
- `OrderService.create` and `PaymentPromiseService.create` each refuse a month count that
  would carry the family past the ceiling, and each accept the one just under it
- the refusal counts *existing* credit, so twelve months bought twice is refused the second
  time — the defect D6 actually names
- `PUT /me/payment-methods` 404s a student who is not the caller's child

**The seam**, per this repo's rule that a field added to an API is not proven by a test that
builds the component's props by hand: the profile method label is asserted through the real
`fetch → state → sheet` path, and `submitJoin` is asserted to write a method for a **card**
child — the exact case that has never been recorded.

## 10. Order of work

1. The column and its migration, then the two endpoints. Nothing on the client can be
   built against them until they answer.
2. The ceiling, server-side, on both routes. It is the only defect here that lets a family
   hand over money the club does not want, so it lands before the screens that expose it.
3. `pay.ts` — `receiptLines`, `cashMonthChips`, `headroom`, `askFor`'s new parameter.
4. `PayScreen` — the receipt, the cash chips, the paid-ahead line.
5. `submitJoin` writes the method.
6. The picker sheet, and `PaymentsSheet` loses its two cards.
7. `ProfileScreen` reads the new endpoint.
