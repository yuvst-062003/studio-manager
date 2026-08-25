# `12f` — תשלומים · payment history

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

> ## ▲ D9.3 — half applied, and the half that is missing is the structural one
>
> D9.3 does two things: **retitle** the screen from `קבלות ותשלומים` to `תשלומים`, and **scope the
> email affordance to card rows only** — because §5.10 has uPay issue a חשבונית/קבלה for **card
> payments only**, and the system issues no tax document for cash, bank transfer or הוראת קבע.
>
> **Verified directly against the export in this worktree:**
>
> | Half | State |
> |---|---|
> | **Retitle** | **applied.** The artboard reads `תשלומים`. `קבלות ותשלומים` appears nowhere. |
> | **The disclaimer copy** | **present**: `קבלה מונפקת לתשלומי כרטיס בלבד — אפשר לשלוח למייל`. |
> | **Email scoped to card rows** | **not applied.** `שליחה למייל` occurs **exactly once**, as a **single global button in the sticky footer** — not per row. And of the three rows carrying a receipt icon, only two are card payments; the third is labelled `· הסעה`. |
>
> So the **copy** was updated and the **mechanism** was not. A global "email the receipts" button
> under a disclaimer saying only card payments have one is the same false promise D9.3 removed from
> the title, moved down the screen.
>
> **What ships:** the email affordance belongs **on card rows and nowhere else**, gated on the
> payment method — not on a footer, and not on a row whose method is not card. `billing.receipt.email`
> and `billing.receipt.cardOnly` both exist for exactly this.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance · title · a subtitle naming the household and the year.
3. **Scroll body**
   1. **Summary card** — two label/value rows over a divider: paid this year, open balance.
   2. **Filter chip row** — four: all (selected) · subscriptions · equipment · events.
   3. **History card** — four rows.
4. **Sticky footer** — the disclaimer, then the email button. (Above the tab bar; `1b` has no such bar.)

## The rows

| Row | Method | Receipt icon |
|---|---|---|
| a subscription | **card**, with the last four digits | yes |
| an item | **card**, with the last four digits | yes |
| a training session | **`הסעה`** — *transport*, which is **not a payment method** | **yes — and this is the bug** |
| a subscription | **unpaid**, `לא שולם · N ימי פיגור`, danger-tinted row | no — a **pay** button instead |

Row three's meta line names a *thing bought*, not how it was paid. Either the row is mislabelled or
the icon is ungated. Both need fixing; the icon needs gating regardless.

## States

| State | What renders |
|---|---|
| **Filter chips** | One selected, three unselected. |
| **Overdue row** | Danger text and a danger-tinted row background, plus a pay button. |
| **Empty — no payments yet** | **Not drawn**, and `billing.history.empty` (`עדיין לא נרשמו תשלומים`) exists. A family in their first month sees this. |
| **Filtered to zero** | **Not drawn.** |
| **Loading / error** | **Not drawn.** |
| **Email sent** | **Not drawn**, and there is no confirmation for an action whose entire result is off-screen. |
| **Hover / focus / disabled** | Not drawn anywhere. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the summary card, the history card, the footer |
| Ink | `--fg` | primary text, the pay button's fill, the selected chip's outline |
| On-ink | `--on-fg` | the pay button's label |
| Secondary text | `--text-secondary` | the method lines, chip text, the disclaimer |
| Muted text | `--text-muted` | the subtitle, the receipt icon |
| Semantic — debt | `--debt` (+ `--debt-tint`) | the open balance, the overdue text and amount, the row's tint |
| Border | `--border` / `--border-strong` | hairlines, chip outlines |
| Belt | — none. |

No D8-retired grey.

## RTL

- **Money must not mirror.** Six amounts, all `{digits}₪` with tabular figures. As on
  [`1b`](1b-parent-payments-pay.md), the hazard is an over-eager fix: never wrap the pair in an
  explicit direction or a transform. Render through `MoneyDisplay`.
- **Must not mirror:** the dates, the masked card digits, the overdue day count.
- The **back chevron** is directional and hard-coded.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every amount | `MoneyDisplay` | Six of them. `tone="debt"` on the balance and the overdue row. |
| Both cards | `Card` | |
| Pay, email | `Button` | `primary` and `secondary`. |
| Filter chips | `SegmentedControl` | Four options, single-select. The drawn shape is separate pills rather than one connected track — a variant question, not a different primitive. |
| Overdue status | `StatusChip`? | Drawn as **inline text plus a row tint**, not a pill. `ChipStatus` has `debt`; if the design wants a chip, use it — do not build a second one. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Payment row** | *feature-specific* | Title · method line · amount · an optional receipt icon · an optional pay button. **Not `StudentRow`** — it is a transaction, not a person. |
| Receipt icon | *gap* | An icon-only affordance. `ButtonVariant` has no icon-only member. Same gap as `9b`, `9c`. |
| Header, footer bar | *app shell* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `תשלומים` | `billing.title` | **exact — D9.3's retitle, already in the key.** |
| `משפחת כהן · 2026` | — | **No key**; household name and year are data. §5.3's household again has no label — see [`4a`](4a-dashboard-student-card.md) finding 5. |
| `שולם השנה` | — | **No key.** `billing.charge.status.settled` is `שולם`; a year-to-date total has none. |
| `יתרה פתוחה` | `billing.openDebts.total` (`סה״כ חוב`) | Wording differs — *balance* vs *total debt*. |
| `הכל` | — | **No "all" key.** Fifth artboard. |
| `מנויים` / `ציוד` / `אירועים` | `billing.charge.kind.tuition` (`שכר לימוד`) / `billing.product.title` (`פריטים למכירה`) / `billing.charge.kind.event` (`אירוע`) | Three different wordings across two key families. **The filter taxonomy and the charge-kind enum do not line up** — `charge.kind` has `tuition`, `registration`, `event`, `manual`; the filters have subscriptions, equipment, events. Finding. |
| `מנוי אוגוסט · דנה, יוסי` | — | Data — **and it interpolates a list of children.** Same formatter gap as [`12j`](12j-parent-first-registration.md) finding 4. |
| `01.08 · כרטיס אשראי ****4471` | `billing.method.card` | The composed meta line has no key; the mask is data. |
| `· הסעה` | — | **Not a payment method.** See above. |
| `לא שולם · 42 ימי פיגור` | `billing.charge.overdue` (`באיחור`) | The label exists; **the day count has no key** and needs a plural. Fifth artboard wanting a relative-time formatter. |
| `תשלום` | `billing.card.pay` (`לתשלום`) | Near-exact. |
| `קבלה מונפקת לתשלומי כרטיס בלבד — אפשר לשלוח למייל` | `billing.receipt.cardOnly` (`קבלה ממוחשבת מונפקת לתשלומי כרטיס אשראי בלבד`) | **The key carries the first half exactly.** The second half — "can be sent by email" — is what turns a scoping statement into a global promise. **Ship the key, drop the second half, and put the email on the card rows.** |
| `שליחה למייל` | `billing.receipt.email` (`שליחת קבלה במייל`) | Near-exact — **and the key is singular: *a* receipt, on *a* row.** The key already encodes D9.3's intent. |

`billing.receipt.externalNumber` exists and nothing here uses it — a receipt number issued outside
the system has no home on this screen.

## Findings for the lane

1. **▲ D9.3's structural half is not applied.** The email affordance is a global footer button, not a
   card-row affordance, and one non-card row carries the receipt icon. Both keys already exist.
2. **`billing.receipt.email` is singular** and the artboard uses it as a bulk action.
3. **The filter taxonomy does not match `charge.kind`.** Two enums for one axis.
4. **No empty state**, and `billing.history.empty` exists for a family's first month.
5. **No confirmation after emailing**, for an action whose whole effect is off-screen.
6. **`1b` and `12f` both claim the payments tab.** See [`1b`](1b-parent-payments-pay.md) finding 1.
7. **A children-list formatter** is needed in `core`. Second artboard.
8. **The overdue day count needs a plural** and a relative-time formatter.
