# `1b` — תשלומים · the parent's pay screen

| | |
|---|---|
| **Surface** | Parent app · 390×844 · light only |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

## `1b` vs `12f` — they are not the same screen

Both are titled `תשלומים` and both are reachable from the same tab. **They are two different screens
and the canvas does not say which the tab renders.**

| | `1b` | [`12f`](12f-parent-payments-history.md) |
|---|---|---|
| Purpose | **pay now** — open debts, then choose a route | **history** — a year's ledger, filterable |
| Top block | an itemised open-debt list + a total | a summary card: paid this year · open balance |
| Filters | none | four category chips |
| Payment routes | **all three**, card interactive | none — one row's pay button routes away |
| Receipt affordance | none | a footer email button + per-row icons |
| Extra region | — | a sticky footer above the tab bar |

**Decide and record it.** Most likely `1b` is the tab and `12f` is a history view reached from it, or
the two merge — but D9 settles neither, and a parent landing on a ledger when they came to pay is a
worse outcome than the reverse.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance and the page title.
3. **Scroll body**
   1. `חובות פתוחים` label, then a **list card**: four debt rows (an accent bar · `month · child` · an
      amount) and a **total row**, set off with a faint tint.
   2. `איך תרצה לשלם?` heading.
   3. **Card route** — icon + title · a months chip group · an instalments chip group · a divider ·
      the pay button with a computed total and split beside it.
   4. **Standing-order route** — icon + title · a link row with a chevron · an **inline warning box**.
   5. **Cash route** — icon + title + one instruction line. No button.
4. **Tab bar** — four tabs, payments active.

## The debt display, and where D2's banner actually lives

**D2's `⚠ חוב של 320₪` banner is not on this screen.** It is on `1a` — the parent's home, M1's
artboard — as a single-item, icon-led `Alert` with a pay CTA. Here the debt is an **itemised table**:
four rows plus a total, first thing under the header, with the amounts in `--debt` and **no warning
icon anywhere** on the list.

That is right for a pay screen and worth writing down, because the two are easy to conflate: the
**alert** lives on home, the **ledger** lives here, and only the alert is what D2 protects.

## States

| State | What renders |
|---|---|
| **Months chips** | Selected (ink fill) and unselected. Default: two months. |
| **Instalments chips** | Same. Default: one. |
| **Pay button** | Default only. **Its handler is a no-op in the export**, and no disabled or in-flight state is drawn. |
| **Standing-order link row** | **No handler and no pointer**, though it has a chevron. |
| **Empty — no open debts** | **Not drawn**, and `billing.openDebts.empty` exists. The goal state. Use `EmptyState`. |
| **Loading / error** | **Not drawn.** |
| **Return from the provider** | **Not drawn**, and `billing.order.verifying` / `verifyingHint` exist — §5.10 makes the return page never the source of truth, and says a closed tab still pays. That state has to exist somewhere. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | all four cards |
| Ink | `--fg` | primary text, the active chip's fill, the pay button's fill |
| On-ink | `--on-fg` | the active chip's and pay button's labels |
| Secondary text | `--text-secondary` | chip-group labels, the cash instruction, the computed split |
| Muted text | `--text-muted` | the `חובות פתוחים` heading, inactive tabs — **at D8's floor** |
| Semantic — debt | `--debt` | every row amount and the total; **and, on tint, the warning box's text** |
| Semantic — debt tint | `--debt-tint` | the warning box's fill and border |
| Border | `--border` / `--border-strong` | hairlines, the total row's tint |
| Belt | *see below* | the debt rows' accent bars |

No D8-retired grey.

> **▲ D7 — the debt rows' accent bars are belt fills, and they carry no ring.**
> The two colours are exactly the belt colours for the two children in the artboard's own data.
> D7 covers **anywhere `belt_rank.color_hex` is rendered as a fill** — not only the contexts the
> audit measured. `BeltBar` rings unconditionally. Route these through it.
>
> (Contrast `12i`, `12j` and `12a`, where the same-looking bars are per-child **identity** colours
> with no belt behind them. Here they *are* belts. That two visually identical bars mean different
> things across the parent app is itself worth settling — see the README's gap list.)

## RTL

- **Money must not mirror.** Every amount is `{digits}₪` with tabular figures. Digits are strong-LTR
  and resolve correctly on their own — **so the danger is the fix, not the bug**: a `direction: ltr`
  wrapper or a mirroring transform would flip it to `₪1,280`. Render through `MoneyDisplay` and let
  it own the grouping (the export builds totals with an `en-US` grouping, which belongs in the
  primitive, not in a screen).
- The **back chevron** points right — correct for RTL, and a hard-coded path. Feed the icon layer a
  logical direction, or it will not reverse for `en`/`ru` (D6 ships all three).
- **Must not mirror:** the month names, the chip numerals.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All four cards | `Card` | |
| Months and instalments groups | `SegmentedControl` | **Two instances.** Exact fit — mutually exclusive, filled-vs-outlined. |
| Every amount | `MoneyDisplay` | `agorot`, `tone="debt"`. **Never a hand-built `₪` string** (G2). |
| The standing-order warning | `Alert` | `tone="danger"`, with `iconLabel`. |
| Pay button | `Button` | `variant="primary"`. |
| Accent bars | `BeltBar` | See above. |
| Empty state | `EmptyState` | Required; not drawn. |
| Debt row | `StudentRow`? | Accent + label + a trailing amount. Worth checking whether `StudentRow` has a trailing slot; if not, a feature row. |
| Standing-order link row | *gap* | Another `ActionRow` — see the README's gap list. |
| Header, tab bar | *app shell* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `תשלומים` | `billing.title` | exact — **and it is D9.3's retitle, already in the key.** |
| `חובות פתוחים` | `billing.openDebts.title` | exact |
| `ספטמבר 2026 · דנה` | `billing.openDebts.forStudent` (`עבור {{name}}`) | The key interpolates a name; **the period half has no key** and is data. |
| `סה"כ חוב` | `billing.openDebts.total` | exact |
| `איך תרצה לשלם?` | `billing.howToPay.title` | exact |
| `כרטיס אשראי` | `billing.method.card` | exact |
| `בחר חודשים` | `billing.card.selectMonths` | exact |
| `תשלומים בכרטיס` | `billing.card.installments` | exact |
| `לתשלום` | `billing.card.pay` | exact |
| the computed total | `billing.card.total` (`סה״כ`) | The label exists; the composed string does not. |
| the computed split | — | **No key.** `X תשלומים × Y₪` and `תשלום אחד · N חודשים` are two different shapes with two plural rules. Finding. |
| `הוראת קבע` | `billing.method.standingOrder` | exact |
| `קישור להקמת הוראת קבע` | `billing.standingOrder.link` | exact |
| `רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים` | `billing.standingOrder.activeWarning` | **exact.** The best-matched string on the artboard, and the most important — it is a *warning*, never a block; the parent decides. |
| `מזומן` | `billing.method.cash` | exact |
| `שלמו למאמן בתחילת החודש` | `billing.cash.instructions` | exact |
| Tab labels | — | **No keys.** README finding 6. |

**`billing` covers this screen better than any other namespace covers its artboard** — nine exact
matches. Three keys exist and are unused here and matter: `card.coveredElsewhere`,
`card.nothingSelectable`, and `card.oldestFirst` (`נבחרים החיובים הוותיקים ביותר, לכל הילדים שאתם
משלמים עבורם`). The last states how the selection actually works, and the screen does not say it.

## Findings for the lane

1. **`1b` and `12f` both own the payments tab.** Decide.
2. **The pay button has no handler and no in-flight state**, and `billing.order.verifying` /
   `verifyingHint` exist for the return from uPay. §5.10: the return page is never the source of
   truth. That state must exist.
3. **No empty state**, and it is the goal state.
4. **The debt rows' accent bars are belt fills without D7's ring** — and elsewhere in the parent app
   the same bar shape is a non-belt identity colour.
5. **`billing.card.oldestFirst` is unused** and explains the selection rule the screen leaves implicit.
6. **The instalment split has no key** and needs two plural shapes.
7. **The standing-order link row has a chevron and no handler.**
8. **Money grouping belongs in `MoneyDisplay`**, not in a screen.
