# Parent Payments Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The parent's payments screen states what it is charging for, cash is a floor rather than a block, a family cannot pay past twelve months ahead, and the payment method they picked in the wizard is stored and changeable.

**Architecture:** Six defects, six tasks, in dependency order. The server changes land first because two of them are rules the server does not have (the prepayment ceiling, the stored method), and a screen cannot be built against an endpoint that does not answer. All new arithmetic goes in `web/apps/parent/src/features/billing/redesign/pay.ts` as pure functions, following that module's existing split — a component never computes money.

**Tech Stack:** FastAPI · SQLAlchemy · Alembic · PostgreSQL · React 19 + TypeScript · Vitest · pytest

**Spec:** `docs/superpowers/specs/2026-09-08-parent-payments-redesign.md`

## Global Constraints

- **Money is integer agorot.** Nothing in this plan divides outside a formatter (G2).
- **`.venv/bin/` prefix on every Python command.** A bare `python3`/`pytest` resolves to a 3.8 interpreter earlier on PATH.
- **No inline user-facing strings.** Every string goes in `web/packages/i18n/<locale>/<namespace>.ts` for **all three** of `he`, `en`, `ru` — `web/apps/parent/src/i18nKeys.test.ts` fails on a key present in one locale and missing from another. Never edit `web/packages/i18n/index.ts`.
- **The migrations directory is protected** by `.claude/hooks/block-protected.sh`. Ask the user before writing the revision. Current head is `0025`; this plan adds `0026`.
- **Tenancy:** any new model inherits `TenantMixin`. This plan adds no model, only a column to an existing one.
- **Routers stay thin.** Parse, call a service, return.
- **`app/main.py` and `app/models/__init__.py` mount by discovery.** Never edit them to register anything.
- **The vocabulary for a stored payment method is `payment.method`'s:** `upay_card` · `cash` · `cheque` · `standing_order`. Not the promise's, which has no card.
- **`PREPAY_CEILING_MONTHS = 12`**, and the ceiling is expressed in agorot, never in months — see spec §5.1.

---

### Task 1: `student.payment_method` and the two endpoints

The wizard's choice is currently recorded nowhere for a card family, because
`payment_promise.method` is constrained to cash/cheque/standing_order. This task
creates the place it lives.

**Files:**
- Modify: `app/models/people.py` — `Student`, add the column and its check constraint
- Create: the `0026` revision (ASK FIRST — the directory is protected)
- Create: `app/routers/payment_methods.py`
- Test: `tests/billing/test_payment_methods.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `Student.payment_method: Mapped[str | None]`
  - `GET /api/v1/me/payment-methods` → `{"items": [{"student_id": str, "student_name": str, "method": str | None}]}`
  - `PUT /api/v1/me/payment-methods` ← `{"items": [{"student_id": str, "method": str}]}` → the same shape as GET

- [ ] **Step 1: Write the failing tests**

```python
# tests/billing/test_payment_methods.py
def test_a_parent_reads_a_method_per_child(client, parent_with_two_children):
    body = client.get("/api/v1/me/payment-methods").json()
    assert [row["method"] for row in body["items"]] == [None, None]

def test_a_parent_sets_one_childs_method(client, parent_with_two_children):
    first = client.get("/api/v1/me/payment-methods").json()["items"][0]
    client.put(
        "/api/v1/me/payment-methods",
        json={"items": [{"student_id": first["student_id"], "method": "upay_card"}]},
    )
    body = client.get("/api/v1/me/payment-methods").json()
    assert body["items"][0]["method"] == "upay_card"

def test_a_card_method_is_storable_though_no_promise_can_carry_it(client, parent_with_two_children):
    """D4's root cause, asserted directly: payment_promise.method has no 'upay_card'."""
    first = client.get("/api/v1/me/payment-methods").json()["items"][0]
    response = client.put(
        "/api/v1/me/payment-methods",
        json={"items": [{"student_id": first["student_id"], "method": "upay_card"}]},
    )
    assert response.status_code == 200

def test_someone_elses_child_is_not_found(client, parent_with_two_children, other_family_student_id):
    response = client.put(
        "/api/v1/me/payment-methods",
        json={"items": [{"student_id": str(other_family_student_id), "method": "cash"}]},
    )
    # 404 and not 403: probing ids must tell nobody whether the student exists.
    assert response.status_code == 404

def test_an_unknown_method_is_refused(client, parent_with_two_children):
    first = client.get("/api/v1/me/payment-methods").json()["items"][0]
    response = client.put(
        "/api/v1/me/payment-methods",
        json={"items": [{"student_id": first["student_id"], "method": "bitcoin"}]},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/billing/test_payment_methods.py -q`
Expected: FAIL — 404 on both routes, which do not exist yet.

- [ ] **Step 3: Add the column**

In `app/models/people.py`, on `Student`, beside `price_plan_id` — a billing concern
already lives there, which is why this is a column and not a table:

```python
    #: How this child's family pays for them. Per CHILD because that is what the join
    #: wizard collects and what הוראת קבע is: a mandate is signed per child, at that
    #: child's own price, which is why `GET /me/standing-order-links` returns a list.
    #:
    #: `payment.method`'s vocabulary and NOT `payment_promise.method`'s. The promise has
    #: no card — a promise is a statement that money will arrive by hand, and a card order
    #: is money already in motion — so a card family could never have a method recorded
    #: and the profile screen said `לא הוגדר` to them for ever.
    #:
    #: Nullable: an existing family has not answered yet, and a `lead` never will.
    payment_method: Mapped[str | None] = mapped_column(String(20))
```

and in `__tenant_table_args__`:

```python
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN "
            "('upay_card', 'cash', 'cheque', 'standing_order')",
            name="student_payment_method",
        ),
```

- [ ] **Step 4: Write the migration (ASK THE USER FIRST — the path is protected)**

`.venv/bin/alembic revision --autogenerate -m "student payment method"`, then read the
generated file and confirm it contains exactly the `add_column` and the
`create_check_constraint`, nothing else. Then `.venv/bin/alembic upgrade head`.

- [ ] **Step 5: Write the router**

`app/routers/payment_methods.py`. Mounted by discovery — do not edit `app/main.py`.

```python
"""`GET`/`PUT /me/payment-methods` — which route a family pays each child by.

**A statement of intent, not money.** Saving raises no promise and opens no order; the
cheque request and the standing-order mandate stay deliberate actions elsewhere. This
endpoint exists because `payment_promise.method` cannot carry a card, so the wizard's
choice for a card family was recorded nowhere at all.
"""
PAYMENT_METHODS = ("upay_card", "cash", "cheque", "standing_order")


class PaymentMethodIn(BaseModel):
    student_id: uuid.UUID
    method: Literal["upay_card", "cash", "cheque", "standing_order"]


class PaymentMethodListIn(BaseModel):
    items: list[PaymentMethodIn]


class PaymentMethodOut(BaseModel):
    student_id: uuid.UUID
    student_name: str
    method: str | None
```

Both handlers resolve the caller's children through `Guardian.person_id == _caller(request)`
— the payer comes from the session and never from the body, for the same reason payment
orders do it. A student not in that set raises 404. The `PUT` audits via
`AuditService.record(action="student.payment_method", ...)`; the method is not health data
and carries no personal contents, so it may appear in `diff`.

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest tests/billing/test_payment_methods.py -q`
Expected: PASS, 5 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app/models/people.py app/routers/payment_methods.py tests/billing/test_payment_methods.py
git commit -m "feat(billing): a family's payment method has somewhere to live"
```

---

### Task 2: The rolling prepayment ceiling

`MAX_PREPAY_MONTHS = 12` is enforced per *order*. Twelve months bought twice is
twenty-four months paid ahead, and nothing anywhere notices. This task makes the
twelve cumulative, on both routes.

**Files:**
- Modify: `app/services/billing/orders.py:299-306`
- Modify: `app/services/billing/payment_promise.py:99-100`
- Create: `app/services/billing/prepay_ceiling.py`
- Test: `tests/billing/test_prepayment.py` (append)

**Interfaces:**
- Consumes: `BillingService.payer_credit`, `PaymentPromiseService.monthly_total_agorot`
- Produces: `prepay_headroom_months(session, payer_person_id) -> int` and
  `refuse_past_ceiling(session, payer_person_id, prepay_months) -> None` (raises `RefusedError`)

- [ ] **Step 1: Write the failing tests**

```python
# tests/billing/test_prepayment.py
def test_twelve_months_bought_twice_is_refused_the_second_time(session, payer, monthly_300):
    """D6. The defect the owner actually named: the per-order cap counts nothing."""
    OrderService(session).create(studio_id, payer, charge_ids=[], max_payments=1, prepay_months=12, at=now())
    pay_that_order_in_full(session, payer)
    with pytest.raises(RefusedError, match="ahead"):
        OrderService(session).create(studio_id, payer, charge_ids=[], max_payments=1, prepay_months=1, at=now())

def test_the_month_that_lands_exactly_on_the_ceiling_is_accepted(session, payer, monthly_300):
    credit_the_payer(session, payer, agorot=300_00 * 10)   # ten months ahead
    order = OrderService(session).create(studio_id, payer, charge_ids=[], max_payments=1, prepay_months=2, at=now())
    assert order is not None

def test_the_month_past_the_ceiling_is_refused(session, payer, monthly_300):
    credit_the_payer(session, payer, agorot=300_00 * 10)
    with pytest.raises(RefusedError):
        OrderService(session).create(studio_id, payer, charge_ids=[], max_payments=1, prepay_months=3, at=now())

def test_a_cash_promise_is_held_to_the_same_ceiling(session, payer, monthly_300):
    credit_the_payer(session, payer, agorot=300_00 * 12)
    with pytest.raises(RefusedError):
        PaymentPromiseService(session).create(
            studio_id, payer_person_id=payer, charge_ids=[], at=now(), method="cash", prepay_months=1
        )

def test_headroom_is_zero_for_a_payer_with_no_monthly_price(session, payer_without_plan):
    assert prepay_headroom_months(session, payer_without_plan) == 0

def test_headroom_floors_rather_than_truncates_for_a_payer_past_the_ceiling(session, payer, monthly_300):
    credit_the_payer(session, payer, agorot=300_00 * 13)   # re-priced downwards
    assert prepay_headroom_months(session, payer) == 0
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/billing/test_prepayment.py -q -k "ceiling or headroom or twice"`
Expected: FAIL — the first passes twelve twice, and `prepay_headroom_months` does not exist.

- [ ] **Step 3: Write the shared rule**

`app/services/billing/prepay_ceiling.py`. One module because two services enforce it and
a rule stated twice is a rule that drifts.

```python
#: Spec §5.1. A family may never be more than twelve months paid ahead, measured off the
#: credit they hold RIGHT NOW — so the ceiling releases a month at a time as each month is
#: billed, rather than being a boundary in the calendar the club has no setting for.
PREPAY_CEILING_MONTHS = 12


def prepay_headroom_months(session: Session, payer_person_id: uuid.UUID) -> int:
    """How many more months this payer may buy. Zero for a payer with no monthly price:
    they buy no months forward on any route, so the ceiling never binds on them."""
    monthly = PaymentPromiseService(session).monthly_total_agorot(payer_person_id)
    if monthly <= 0:
        return 0
    credit = BillingService(session).payer_credit(payer_person_id)
    ceiling = PREPAY_CEILING_MONTHS * monthly
    # Floor division on a possibly-negative numerator: a family past the ceiling (their
    # plan was re-priced downwards) must come out at zero and not at minus one.
    return max(0, (ceiling - credit) // monthly)


def refuse_past_ceiling(session: Session, payer_person_id: uuid.UUID, prepay_months: int) -> None:
    """**In money, not months.** A family whose plan was re-priced holds credit that is not
    a whole number of months, and two roundings of that — one on the screen, one here — is
    how a chip a parent can press becomes an error they cannot read."""
    if prepay_months <= 0:
        return
    monthly = PaymentPromiseService(session).monthly_total_agorot(payer_person_id)
    if monthly <= 0:
        return  # The caller's own "no monthly price" refusal is the better message.
    credit = BillingService(session).payer_credit(payer_person_id)
    ceiling = PREPAY_CEILING_MONTHS * monthly
    if credit + prepay_months * monthly > ceiling:
        raise RefusedError(
            f"prepay_months={prepay_months}: this payer is already paid ahead, and at most "
            f"{PREPAY_CEILING_MONTHS} months may be covered at once"
        )
```

- [ ] **Step 4: Call it from both routes**

In `orders.py`, replace the per-order cap at lines 299-306:

```python
        if prepay_months < 0:
            raise RefusedError("prepay_months cannot be negative")
        # Was `prepay_months > MAX_PREPAY_MONTHS` — a cap on ONE order, which counted
        # nothing already bought, so twelve months twice was twenty-four and silent.
        refuse_past_ceiling(self._session, payer_person_id, prepay_months)
```

In `payment_promise.py`, beside the existing negative check at line 99:

```python
        if prepay_months < 0:
            raise RefusedError("prepay_months cannot be negative")
        refuse_past_ceiling(self._session, payer_person_id, prepay_months)
```

Leave `MAX_PREPAY_MONTHS` exported if anything else imports it — grep first
(`grep -rn MAX_PREPAY_MONTHS app/ tests/`) and delete it only if this was its only reader.

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/billing/test_prepayment.py tests/billing/test_orders.py tests/billing/test_payment_promises.py -q`
Expected: PASS. Existing tests that bought twelve months on a clean payer still pass —
the ceiling binds on accumulated credit, and a payer with none has twelve months of room.

- [ ] **Step 6: Commit**

```bash
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app/services/billing/ tests/billing/test_prepayment.py
git commit -m "fix(billing): twelve months paid ahead is a ceiling, not a per-order cap"
```

---

### Task 3: `pay.ts` — the receipt, the cash chips, the headroom

All the arithmetic, where a test can hold it. No component changes in this task.

**Files:**
- Modify: `web/apps/parent/src/features/billing/redesign/pay.ts`
- Test: `web/apps/parent/src/features/billing/redesign/pay.test.ts` (append)

**Interfaces:**
- Consumes: `ChargeOut`, `oldestMonths`, `selectionTotal` from `../billingClient`
- Produces:
  ```ts
  export type ReceiptLine =
    | { kind: 'charge'; id: string; label: string; studentName: string; amountAgorot: number }
    | { kind: 'forward'; months: number; amountAgorot: number }
    | { kind: 'remainder'; amountAgorot: number }
  export function receiptLines(ask: Ask, debts: readonly DebtRow[], terms: PayTerms, labelOf: (c: ChargeOut) => string): readonly ReceiptLine[]
  export function prepayHeadroomMonths(creditAgorot: number, monthlyTotalAgorot: number): number
  export function cashMonthChips(floor: number, headroom: number): readonly number[]
  export function chargeNoteOrKind(charge: ChargeOut): { note: string } | { kindKey: string }
  export function askFor(method, debts, months, terms, instalments?, cashMonths?): Ask   // cashMonths is new
  export const PREPAY_CEILING_MONTHS = 12
  ```
  `labelOf` is injected rather than built here because the label needs `t(locale, …)` and
  `pay.ts` is deliberately free of i18n — the same reason `money` is a prop on `PayScreen`.

- [ ] **Step 1: Write the failing tests**

```ts
// pay.test.ts
describe('prepayHeadroomMonths', () => {
  it('is zero for a payer with no monthly price', () => {
    expect(prepayHeadroomMonths(50_000, 0)).toBe(0)
  })
  it('counts the months already covered against the ceiling', () => {
    expect(prepayHeadroomMonths(300_00 * 10, 300_00)).toBe(2)
  })
  it('floors rather than truncates for a payer already past it', () => {
    // Re-priced downwards: `Math.trunc` would answer -1 and let a chip through.
    expect(prepayHeadroomMonths(300_00 * 13, 300_00)).toBe(0)
  })
})

describe('cashMonthChips', () => {
  // Spec §4's table, verbatim.
  it.each([
    [3, 12, [3, 6, 12]],
    [3, 5, [3, 5]],
    [3, 2, [1, 2]],       // the ceiling overrides the club's floor — §5.3
    [4, 12, [4, 6, 12]],
    [0, 12, [1, 2, 3, 6, 12]],
    [3, 0, []],           // no forward offer at all
  ])('floor %i, headroom %i → %j', (floor, headroom, expected) => {
    expect(cashMonthChips(floor, headroom)).toEqual(expected)
  })
})

describe('receiptLines', () => {
  it('names a shop item by its own name and a tuition month by its month', () => {
    const lines = receiptLines(ask, debts, terms, labelOf)
    expect(lines.filter((l) => l.kind === 'charge').map((l) => l.label))
      .toEqual(['מנוי · ספטמבר 2026', 'חגורה כחולה'])
  })
  it('sums to the ask exactly', () => {
    const lines = receiptLines(ask, debts, terms, labelOf)
    const summed = lines
      .filter((l) => l.kind !== 'remainder')
      .reduce((total, line) => total + line.amountAgorot, 0)
    expect(summed).toBe(ask.totalAgorot)
  })
  it('shows a remainder only when the selection is short of the debt', () => {
    const partial = askFor('card', debtsOfThreeMonths, 1, terms)
    expect(receiptLines(partial, debtsOfThreeMonths, terms, labelOf))
      .toContainEqual({ kind: 'remainder', amountAgorot: 750_00 })
  })
  it('leaves charges another payment holds out of the rows and inside the remainder', () => {
    const lines = receiptLines(ask, debtsWithOneCoveredElsewhere, terms, labelOf)
    expect(lines.some((l) => l.kind === 'charge' && l.id === coveredChargeId)).toBe(false)
    expect(lines.find((l) => l.kind === 'remainder')?.amountAgorot).toBe(375_00)
  })
})

describe('chargeNoteOrKind', () => {
  // Spec §3.3. The DECISION lives here where a test holds it; only the string assembly
  // (which needs `t` and `monthLabel`) is left to the component.
  it('prefers the note, which is where the shop writes the item name', () => {
    expect(chargeNoteOrKind({ ...tuition, proration_note: 'חגורה כחולה' }))
      .toEqual({ note: 'חגורה כחולה' })
  })
  it('falls back to the kind when nothing named the charge', () => {
    expect(chargeNoteOrKind({ ...tuition, proration_note: null }))
      .toEqual({ kindKey: 'tuition' })
  })
})

describe('askFor, cash', () => {
  it('takes the chosen month count rather than the club floor', () => {
    // D2: five months, from a club that collects three.
    expect(askFor('cash', debts, 0, { cashMonths: 3, monthlyTotalAgorot: 300_00 }, 1, 5).forwardMonths).toBe(5)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run web/apps/parent/src/features/billing/redesign/pay.test.ts --reporter=dot`
Expected: FAIL — none of the three new functions exist.

- [ ] **Step 3: Implement**

```ts
export const PREPAY_CEILING_MONTHS = 12
const CASH_LADDER = [1, 2, 3, 6, 12] as const

/** Spec §5.1, and the SAME expression `refuse_past_ceiling` uses on the server — in money,
 *  so a re-priced family is not rounded two different ways by the two of them. */
export function prepayHeadroomMonths(creditAgorot: number, monthlyTotalAgorot: number): number {
  if (monthlyTotalAgorot <= 0) return 0
  const ceiling = PREPAY_CEILING_MONTHS * monthlyTotalAgorot
  // `Math.floor` and not `Math.trunc`: a negative numerator must round away from zero to
  // match Python's `//`, or a family past the ceiling gets one chip the server refuses.
  return Math.max(0, Math.floor((ceiling - creditAgorot) / monthlyTotalAgorot))
}

/** The club's number is a FLOOR, not the answer (D2) — but the ceiling outranks it (§5.3):
 *  a family two months from the ceiling is offered two, not turned away for owing the club
 *  a three-month block they have no room for. */
export function cashMonthChips(floor: number, headroom: number): readonly number[] {
  if (headroom <= 0) return []
  const lo = Math.max(floor, 1)
  const within = (low: number) => CASH_LADDER.filter((m) => m >= low && m <= headroom)
  const chips = headroom < lo ? [...within(1), headroom] : [...within(lo), lo, headroom]
  return [...new Set(chips)].sort((a, b) => a - b)
}
```

```ts
/** Spec §3.3. `proration_note` is where BOTH shop routes write the item's name
 *  (`shop.py:208`, `billing.py:1468`) and where the billing run writes its proration
 *  explanation. The kind is the floor for a charge nothing ever named. */
export function chargeNoteOrKind(charge: ChargeOut): { note: string } | { kindKey: string } {
  const note = charge.proration_note
  return note ? { note } : { kindKey: charge.kind }
}

/** The rows under the headline. Walks `ask.chargeIds` — the charges THIS payment settles,
 *  not every open one — so the rows and the total cannot disagree. Never recomputes the
 *  total: the caller renders `ask.totalAgorot`. */
export function receiptLines(
  ask: Ask,
  debts: readonly DebtRow[],
  terms: PayTerms,
  labelOf: (charge: ChargeOut) => string,
): readonly ReceiptLine[] {
  const byId = new Map(debts.map((row) => [row.charge.id, row]))
  const lines: ReceiptLine[] = []
  let settled = 0
  for (const id of ask.chargeIds) {
    const row = byId.get(id)
    if (!row) continue
    settled += row.charge.amount_agorot
    lines.push({
      kind: 'charge',
      id,
      label: labelOf(row.charge),
      // Beside the label, not inside it: one carrier per fact, and the component aligns
      // the name where a name goes rather than parsing it back out of a sentence.
      studentName: row.studentName,
      amountAgorot: row.charge.amount_agorot,
    })
  }
  if (ask.forwardMonths > 0) {
    lines.push({
      kind: 'forward',
      months: ask.forwardMonths,
      amountAgorot: ask.forwardMonths * terms.monthlyTotalAgorot,
    })
  }
  // Everything still open that this payment does not touch — including the rows another
  // payment holds, which are left out of the lines above on purpose. Without it the
  // receipt is a complete-looking document that quietly omits money.
  const remainder = debtAgorot(debts) - settled
  if (remainder > 0) lines.push({ kind: 'remainder', amountAgorot: remainder })
  return lines
}
```

`askFor` gains a sixth parameter `cashMonths` defaulting to `terms.cashMonths`, used in
place of `terms.cashMonths` on the cash branch. Defaulted so no existing caller breaks.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run web/apps/parent/src/features/billing/redesign/pay.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/billing/redesign/pay.ts web/apps/parent/src/features/billing/redesign/pay.test.ts
git commit -m "feat(payments): the arithmetic behind a receipt, a cash floor and a ceiling"
```

---

### Task 4: `PayScreen` — the receipt, the cash chips, the paid-ahead line

**Files:**
- Modify: `web/apps/parent/src/features/billing/redesign/PayScreen.tsx`
- Modify: `web/apps/parent/src/features/billing/redesign/ParentPayments.tsx` (pass `creditAgorot` into the chips; it already fetches it)
- Modify: `web/packages/i18n/{he,en,ru}/billing.ts`
- Test: `web/apps/parent/src/features/billing/redesign/ParentPayments.test.tsx` (append)

**Interfaces:**
- Consumes: `receiptLines`, `cashMonthChips`, `prepayHeadroomMonths`, `askFor`'s new `cashMonths` parameter
- Produces: no new exports; `PayScreenProps` is unchanged except that `creditAgorot` is now load-bearing rather than decorative

- [ ] **Step 1: Add the i18n keys, all three locales**

```ts
// he/billing.ts, beside the existing pay.* block
'pay.nowTitle': 'לתשלום עכשיו',
'pay.receiptTotal': 'סה״כ',
'pay.remainder': 'נותר חוב פתוח {{total}}',
'pay.showAll': 'הצג הכל',
'pay.cashMonthsTitle': 'כמה חודשים מראש?',
'pay.cashFloor': 'המועדון גובה {{count}} חודשים לפחות',
'pay.cashFloor.one': 'המועדון גובה חודש אחד לפחות',
'pay.paidAheadUntil': 'שולם מראש עד {{month}}',
'pay.forwardLine': '{{count}} חודשים מראש',
'pay.forwardLine.one': 'חודש אחד מראש',
```

`en/billing.ts` and `ru/billing.ts` get the same keys. `i18nKeys.test.ts` fails otherwise.

- [ ] **Step 2: Write the failing tests**

```tsx
it('moves the headline and the button to the same figure when the method changes', async () => {
  // D3, as the defect it was: ₪375 at the top above a button charging ₪1,275.
  render(<ParentPayments locale={LOCALE} />)
  fireEvent.click(await screen.findByTestId('pay-method-cash'))
  const headline = screen.getByTestId('pay-now-amount').textContent
  expect(screen.getByTestId('pay-button')).toHaveTextContent(headline!.replace(/[^\d,.]/g, ''))
})

it('names a shop item by its own name in the receipt', async () => {
  render(<ParentPayments locale={LOCALE} />)
  expect(await screen.findByTestId('pay-receipt')).toHaveTextContent('חגורה כחולה')
})

it('offers cash months above the club floor', async () => {
  render(<ParentPayments locale={LOCALE} />)
  fireEvent.click(await screen.findByTestId('pay-method-cash'))
  expect(screen.getByTestId('pay-cash-months-6')).toBeInTheDocument()
})

it('drops the forward offer entirely at the ceiling', async () => {
  // credit = 12 × monthly on the fixture
  render(<ParentPayments locale={LOCALE} />)
  fireEvent.click(await screen.findByTestId('pay-method-cash'))
  expect(screen.queryByTestId('pay-cash-months')).not.toBeInTheDocument()
  expect(screen.getByTestId('pay-paid-ahead-until')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run web/apps/parent/src/features/billing/redesign/ParentPayments.test.tsx --reporter=dot`
Expected: FAIL — `pay-now-amount`, `pay-receipt`, `pay-cash-months-6` do not exist.

- [ ] **Step 4: Rebuild the card**

The `pay-owed` section becomes `pay-now`: `t('billing.pay.nowTitle')` over
`money(ask.totalAgorot)` in `data-testid="pay-now-amount"`, then a `<dl>` of
`receiptLines(...)` in `data-testid="pay-receipt"`, then the total row. Rows past the
fifth sit behind a `הצג הכל` toggle. The `debt > 0` / clear-state branch keeps its existing
copy, now driven by `debtAgorot(debts)` rather than by the headline.

The cash branch gains a `fieldset` of `cashMonthChips(terms.cashMonths, headroom)`,
`data-testid="pay-cash-months"` with `pay-cash-months-<n>` per chip, defaulting to the
first chip at or above the floor. `headroom = prepayHeadroomMonths(creditAgorot, terms.monthlyTotalAgorot)`.
An empty chip list renders `pay-paid-ahead-until` instead.

The card branch disables a month chip whose forward part exceeds the headroom —
`chip - Math.min(chip, owedMonths(debts)) > headroom` — so the chips mirror the server's
refusal rather than offering a second opinion.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run web/apps/parent/src/features/billing/redesign/ParentPayments.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint
git add web/apps/parent/src/features/billing/redesign/ web/packages/i18n/
git commit -m "feat(payments): the screen says what it is charging for, and the total is one number"
```

---

### Task 5: The wizard writes the method

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/wizard/submitJoin.ts`
- Modify: `web/apps/parent/src/features/onboarding/wizard/JoinWizard.tsx` (supply the real dep)
- Test: `web/apps/parent/src/features/onboarding/wizard/submitJoin.test.ts` (append)

**Interfaces:**
- Consumes: `PUT /api/v1/me/payment-methods` from Task 1
- Produces: `SubmitJoinDeps` gains `savePaymentMethods: (items: readonly {studentId: string; method: string}[]) => Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
it('records the method for a CARD child, which no promise can carry', async () => {
  // D4's exact case. Cash, cheque and standing order have always written a promise;
  // card wrote an order and nothing else, so the profile said `לא הוגדר` for ever.
  const saved: unknown[] = []
  await submitJoin({ ...input, methods: { [draft.id]: 'credit' },
    deps: { ...deps, savePaymentMethods: async (items) => { saved.push(...items) } } })
  expect(saved).toEqual([{ studentId: 'student-1', method: 'upay_card' }])
})

it('does not fail the join when the method write fails', async () => {
  // The registration has already landed. Losing a preference is not worth failing over.
  const result = await submitJoin({ ...input,
    deps: { ...deps, savePaymentMethods: async () => { throw new Error('offline') } } })
  expect(result.outcomes[0]!.state).toBe('card_pending')
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run web/apps/parent/src/features/onboarding/wizard/submitJoin.test.ts --reporter=dot`
Expected: FAIL — `savePaymentMethods` is not called.

- [ ] **Step 3: Implement**

After the `active` rows are built and before the promise loop, map the wizard's vocabulary
onto the stored one (`credit → upay_card`, the other three unchanged) and call
`deps.savePaymentMethods` inside a `try`/`catch` that swallows. Wire the real
implementation in `JoinWizard.tsx` as an `apiFetch` PUT.

- [ ] **Step 4: Run, then commit**

```bash
npx vitest run web/apps/parent/src/features/onboarding/wizard/submitJoin.test.ts --reporter=dot
npm run typecheck
git add web/apps/parent/src/features/onboarding/wizard/
git commit -m "fix(onboarding): the wizard records a card family's method too"
```

---

### Task 6: The picker sheet, wired

**Files:**
- Create: `web/apps/parent/src/features/people/redesign/PaymentMethodSheet.tsx`
- Modify: `web/apps/parent/src/features/people/redesign/sheets.tsx` — `PaymentsSheet` loses its two always-open cards and gains a tappable row
- Modify: `web/apps/parent/src/features/people/redesign/ProfileScreen.tsx` — read `/me/payment-methods`, open the new sheet
- Modify: `web/packages/i18n/{he,en,ru}/people.ts`
- Test: `web/apps/parent/src/features/people/redesign/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /me/payment-methods` (Task 1), `MandateLinkRow` and `ChequeRoute` (existing, moved)
- Produces: `PaymentMethodSheet` — props `{ rows, mandateLinks, cheque, cashInstructions, locale, busy, onSave, onClose }`

- [ ] **Step 1: Add the i18n keys, all three locales**

```ts
// he/people.ts
'profile.paymentMethodMixed': 'מעורב',
'profile.paymentMethodEdit': 'שינוי אמצעי תשלום',
'profile.paymentMethodSave': 'שמירה',
```

- [ ] **Step 2: Write the failing seam test**

Per this repo's rule that a field added to an API is not proven by a test that builds the
component's props by hand — this asserts `fetch → state → sheet`:

```tsx
it('reads the method through the real client and not from a promise', async () => {
  // The old derivation read `/me/payment-promises` row zero, so a card family always
  // read `לא הוגדר`. This fixture returns a method and NO promises.
  fetchMock.get('/api/v1/me/payment-methods', { items: [{ student_id: 's1', student_name: 'יובל', method: 'upay_card' }] })
  fetchMock.get('/api/v1/me/payment-promises', { items: [] })
  render(<ProfileScreen {...props} />)
  fireEvent.click(await screen.findByTestId('menu-payments'))
  expect(screen.getByTestId('sheet-payments-method')).toHaveTextContent(t(LOCALE, 'billing.method.card'))
})

it('says מעורב when the children do not agree', async () => {
  fetchMock.get('/api/v1/me/payment-methods', {
    items: [
      { student_id: 's1', student_name: 'יובל', method: 'upay_card' },
      { student_id: 's2', student_name: 'נועה', method: 'standing_order' },
    ],
  })
  render(<ProfileScreen {...props} />)
  fireEvent.click(await screen.findByTestId('menu-payments'))
  expect(screen.getByTestId('sheet-payments-method'))
    .toHaveTextContent(t(LOCALE, 'people.profile.paymentMethodMixed'))
})

it('opens the picker and saves a change', async () => {
  render(<ProfileScreen {...props} />)
  fireEvent.click(await screen.findByTestId('menu-payments'))
  fireEvent.click(screen.getByTestId('sheet-payments-method'))
  fireEvent.click(await screen.findByTestId('method-s1-cash'))
  fireEvent.click(screen.getByTestId('method-save'))
  expect(fetchMock.lastCall('/api/v1/me/payment-methods')?.[1]?.method).toBe('PUT')
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run web/apps/parent/src/features/people/redesign/ProfileScreen.test.tsx --reporter=dot`
Expected: FAIL.

- [ ] **Step 4: Build the sheet**

One block per child — a single-child family gets no heading, which is the common case and
the simple four-way picker the owner described. Four method chips per child. Below them,
the detail for the selected method: that child's mandate link for `standing_order` (from
the `mandateLinks` this screen already fetches), the family-level cheque total and request
button **once** for `cheque`, the club's cash instructions for `cash`, the PCI note for
`upay_card`.

- [ ] **Step 5: Strip `PaymentsSheet`**

Delete the `sheet-payments-standing-order` and `sheet-payments-cheque` sections. What
remains is the balance strip, the now-tappable `sheet-payments-method` row with a chevron,
and `כל התנועות`. `ChequeRoute` and `MandateLinkRow` move to the new file with their
docstrings intact.

- [ ] **Step 6: Rewire `ProfileScreen`**

Replace the `methodLabel` derivation at lines 195-207. The promises read stays — the cheque
route still needs it — but it no longer decides the label. All children agree → that word;
they differ → `profile.paymentMethodMixed`; none set → `profile.paymentMethodNone`.

- [ ] **Step 7: Run everything this can reach, then commit**

```bash
npx vitest run web/apps/parent/src/features/people --reporter=dot
npm run typecheck && npm run lint
git add web/apps/parent/src/features/people/ web/packages/i18n/
git commit -m "feat(profile): אמצעי תשלום is a choice you can change, and the two routes live inside it"
```

---

## Final verification

Scoped to what these six tasks can reach — not the whole suite.

```bash
.venv/bin/pytest tests/billing -q
npx vitest run web/apps/parent/src/features/billing web/apps/parent/src/features/people web/apps/parent/src/features/onboarding --reporter=dot
npm run typecheck && .venv/bin/mypy app && npm run lint
```

Then tick the piece in `docs/plan/state.yaml` in the same commit as the work, and — per this
repo's rule that if it renders you render it and look — run the parent app and look at the
payments screen and the picker on a phone-width viewport before calling it done.
