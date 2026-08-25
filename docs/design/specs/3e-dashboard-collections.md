# `3e` — תשלומים וגבייה · debt by household, not by child

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="payments"`.
2. **Header bar** — title · a period indicator · spacer · export-to-the-accountant · **generate this
   month's charges** (primary).
3. **KPI row** — four stat cards: open debt · collected this month · active standing orders · failed charges.
4. **Section toolbar** — `חובות פתוחים` · spacer · a sort control · a **bulk reminder** button carrying a count.
5. **Table header** — a select-all checkbox and five columns.
6. **Table body** — five household rows.

## Household, not child — how it is expressed

**Nothing on the screen says so in words.** It is structural:

- the **row unit is a household**, not a student;
- `חניכים` is a narrow secondary column *inside* that row — a summary of which children the debt
  covers, never a row key;
- months-in-debt and the balance are **one value per household**, not one per child.

**A household row does not expand.** No chevron, no disclosure, no accordion — the children column is
a flat summary and that is all. Whether a manager can drill into which charge belongs to which child
is undecided, and it is the first thing they will ask when a parent disputes an amount.

## ▲ "Record a cash payment" must go through allocation, never a flag

Each row carries `רישום תשלום מזומן` **beside the household's aggregate balance**, with no charge
picker and no way to split an amount across several open charges or children.

§5.10 is explicit: **a charge is settled by allocation, never mutated.** `billing` says the same in
three places — `payment.allocatedOldestFirst`, `charge.status.settled` documented as *a derived
cache*, and the namespace header noting that no string invites a manager to "mark as paid" on a
charge itself.

The **label is right** — it records a payment, it does not mark a charge paid. But a one-click,
one-row, one-aggregate affordance is exactly the shape that invites the shortcut implementation the
spec forbids. Build it as: create a `payment`, allocate oldest-first, show what it settled.
`billing.payment.record`, `payment.date`, `payment.amount`, `payment.note`,
`payment.allocatedOldestFirst` and `payment.unallocated` all exist for that dialogue, and **none of
them is drawn.**

## Reconciliation — absent

**No unmatched-payment area appears.** The nearest thing is the failed-charges KPI, which is a
counter, not a queue. §5.10's step 5 and the whole `billing.reconciliation.*` family — eighteen keys,
including `neverAuto` (`שיוך נרשם רק לאחר אישור אנושי`) — have **no artboard anywhere in the canvas.**
That screen has to be designed from the spec, not ported.

## Debt ageing

One column, `ותק החוב`, rendered as a **severity-coloured chip**, plus a sort control defaulting to
it — ageing is the triage axis. `billing.debt.aging.*` gives three buckets (0–30, 31–60, 60+) and the
artboard shows a chip per row rather than the buckets; both can be true, but the bucket labels exist
and nothing uses them.

## Reminders — one tier, not a ladder

Two controls, both called *reminder*: a bulk button carrying the household count, and a per-row one.
**There is no second tier** — no final notice, no escalation.

But `billing.debt.escalation.*` models a **ladder**: `day3` (first reminder), `day7` (second),
`day14` (final notice), `none`. **Four states, one button.** A manager cannot see which rung a
household is on, and the artboard's single action cannot advance it.

## States

| State | What renders |
|---|---|
| **Checkboxes** | Unchecked only — no checked, no indeterminate. |
| **Sort control** | Closed only; the open dropdown is not drawn. |
| **Bulk reminder** | Default only. Its label carries a count, which implies a disabled-at-zero state that is not drawn. |
| **Empty — no debt in the club** | **Not drawn**, and `billing.debt.empty` (`אין חובות פתוחים במועדון`) exists. The goal state. |
| **Loading / error** | **Not drawn**, including for the charge-generation run — which is the single most consequential button on the dashboard. |
| **Run in progress** | **Not drawn**, and `billing.run.status.running` / `completed` / `failed` all exist. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, KPI cards, rows, the footer |
| Ink | `--fg` | title, the primary button's fill |
| Secondary text | `--text-secondary` | the children and months columns, the sort chevron |
| Muted text | `--text-muted` | the period line, column headers, the result count |
| Semantic — debt | `--debt` | the open-debt KPI and every row balance |
| Semantic — collected | `--paid` | the collected KPI |
| Semantic — failed | `--pending` | the failed-charges KPI, **always with a dashed border** |
| Semantic — neutral | `--border` | the standing-orders KPI — informational, deliberately uncoloured |
| Border | `--border` / `--border-strong` | drawn as ink alpha; use the tokens |
| Belt | — none. |

No D8-retired grey. **No physical CSS property appears in `3e`'s own range** — spacing is symmetric
shorthand and `gap`, and `justify-content: flex-start` is logical. One of the cleanest dashboard
artboards.

## RTL

- Nav on the right; every row is plain flex under `dir`, with no `row-reverse`.
- **Must not mirror:** all four KPI figures, every balance, the months count, the ageing chip, the percentage.
- Money renders through `MoneyDisplay`; never a hand-built `₪` string (G2).

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All buttons | `Button` | Two header actions, the bulk reminder, and two per row. |
| KPI cards | `Card` + feature content | Label · a large figure · a subnote · a semantic border. **The same stat-tile shape as `6a`, `4a`, `4c`, `1c`, `9g`.** Extract once across the dashboard. |
| Every money figure | `MoneyDisplay` | Two KPIs and every row balance. |
| Checkboxes | `Checkbox` | Needs checked and indeterminate. |
| Ageing chip | `StatusChip` | Severity-driven. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Household row** | *feature-specific* | **Not `StudentRow`** — the row is a household. Compose `Checkbox` + `StatusChip` + `MoneyDisplay` + `Button`. |
| **Sort control** | *gap* | A label plus a chevron opening a menu. **No select or dropdown primitive exists.** Third artboard. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `תשלומים וגבייה` | `billing.debt.title` | exact |
| `אוקטובר 2026` | `billing.run.period` (`חודש החיוב`) | The label exists; the value is data. |
| `ייצוא לרו"ח` | `reports.export` / `attendance.report.export` | **Cross-namespace, twice over**, and neither says *for the accountant*. **No key.** |
| `הפקת חיובים לחודש` | `billing.run.runNow` (`הרצה עכשיו`) | Wording differs. **And `billing.run.idempotentHint` (`הרצה חוזרת לאותו חודש לא תיצור חיובים כפולים`) is invariant 5 written on the very button the manager is about to press — and it is not drawn.** Finding. |
| `חוב פתוח` / `12 משקי בית` | `billing.debt.total` (`סה״כ חוב פתוח`) + `debt.byHousehold` | Both exist; the composed subnote does not. |
| `נגבה החודש` / `79% מהצפוי` | `reports.financial.collected` + `financial.collectedVsExpected` | **Cross-namespace (M9)** — the two headline finance figures on M6's screen resolve to M9's keys. Finding. |
| `הוראות קבע פעילות` / `68% מהחניכים` | `billing.subscription.title` (`הוראות קבע`) + `subscription.status.active` | Near; the percentage subnote has no key. |
| `חיובים שנכשלו` / `כרטיס פג תוקף · 5` | `billing.order.status.failed` (`נכשל`) | **No key** for either, and "expired card" is a failure reason with no enum. Finding. |
| `חובות פתוחים` | `billing.openDebts.title` | exact |
| `מיון: ותק החוב` | `billing.debt.aging.title` (`גיל החוב`) | Wording differs — *seniority* vs *age*. There is **no sort-label key**. |
| `שליחת תזכורת ל־12 משקי בית` | `billing.debt.sendReminder` (`שליחת תזכורת`) | The label exists; **the count wrapper does not.** |
| `משק בית` | `billing.debt.byHousehold` (`חוב לפי משק בית`) | The **bare household label has no key** — third artboard (see `4a`, `12f`). |
| `חניכים` | `people.student.plural` | **Cross-namespace (M3)**. |
| `חודשים בחוב` | — | **No key.** |
| `ותק החוב` | `billing.debt.aging.title` | Wording differs. |
| `יתרה` | — | **No key.** Second artboard (see `3b`). |
| `תזכורת` | `billing.debt.sendReminder` | Near. **And `debt.reminderSent` exists with no drawn state.** |
| `רישום תשלום מזומן` | `billing.payment.record` (`רישום תשלום`) + `billing.method.cash` | Both halves exist; the composed label does not. |

## Findings for the lane

1. **▲ The cash-payment affordance must create a payment and allocate it**, never flag a charge.
   Six `billing.payment.*` keys exist for that dialogue and none is drawn.
2. **`billing.run.idempotentHint` is invariant 5 in words**, written for the charge-generation button,
   and the artboard does not show it. That button is the most consequential on the dashboard and it
   has no confirmation, no in-progress state and no result.
3. **Reconciliation has eighteen keys and no artboard anywhere.** Design it from §5.10.
4. **The escalation ladder has four rungs and the screen has one button.** A manager cannot see or
   advance the rung.
5. **A household row does not expand**, so a disputed amount cannot be traced to a child.
6. **The two headline finance figures resolve to `reports.*` keys.** M6's screen, M9's namespace.
   Decide in the W4 contract.
7. **No empty state**, and it is the goal state.
8. **No select/dropdown primitive** for the sort control.
9. **`יתרה` and `משק בית` still have no keys**, on their third artboard each.
