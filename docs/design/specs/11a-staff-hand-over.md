# `11a` — מסירת פריטים בשיעור · handing items over

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames**, light and dark |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

Two axes at once: **frame 1 is the scoped list, in light; frame 2 is the single-student confirmation,
in dark.** Screen step and colour mode vary together here, which is a mock convenience — do not read
"list = light, confirm = dark" as a rule.

## Regions

**Frame 1** — device chrome · header (back · title · subtitle naming the class and today's time · a
**scope banner**) · scroll: three labelled groups, each a label over a card — a white-belt group with
two student rows, a judogi group with one out-of-stock row, a "delivered today" group with one
completed row · footer: a **policy disclaimer**, no buttons.

**Frame 2** — device chrome · header (back · title naming the student · subtitle naming the item and
its order date) · scroll: an item-preview card · a settings card of two switch rows · an
**offline banner** · footer: back + confirm.

## How the list is scoped

The scope banner says it outright: *N items are waiting for students who are **present in this
lesson***. Each row's meta line repeats `נוכח בשיעור`.

So the filter is **pending delivery AND marked present in today's attendance for this session** — not
merely enrolled in the class. That is a **cross-lane read**: M6's screen depends on M5's marks for
this session. Write it into the W4 contract; it is not something a lane can add later without M5's
payload carrying it.

## §3.2 — the coach sees no price, and the screen says so

**No amount or currency figure appears in either frame.** Frame 2 states *that* an item was paid and
by whom, with no sum. And the footer disclaimer says the rule aloud:

> `סימון מסירה מעדכן מלאי אצל המנהל. מחיר הפריט אינו מוצג למאמן.`

That is §3.2 written on the screen — the [`9c`](9c-staff-student-card-transfer.md) approach rather
than [`2d`](2d-staff-student-card.md)'s silent omission. **Pick one across the staff app**; see the
README's gap list.

## ▲ The disclaimer's first half contradicts §5.10

> `סימון מסירה מעדכן מלאי אצל המנהל` — *marking a hand-over updates the manager's stock.*

And frame 2 goes further: an **automatic-inventory switch**, on by default, whose helper renders a
live decrement (`7 → 6`), plus a preview line stating how many remain. Frame 1's judogi row is an
**out-of-stock state** — `חסר במלאי — המנהל הזמין` — with its action replaced by a disabled-looking
`ממתין` pill.

§5.10 is explicit: **no stock counts, no inventory — that is a different product.**
`billing.product.noStockHint` ships the sentence `אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד`.
[`12e`](12e-parent-order-items.md) and [`5a`](5a-dashboard-prices-plans.md) both honour it.

**This artboard builds a stock system**: a count, a decrement, an out-of-stock state that blocks an
action, and a re-order notice. That is not a copy fix — it is a feature with a model, and it is
either in scope or it is not. **Settle before M6 builds either version.**

## The flow, as actually drawn — two steps, not three

There is no "pick an item" step. Each present student already has **one specific pre-ordered, paid
item** tied to them, so the list is grouped by item and the coach taps a row.

1. **List** — tap `נמסר` on a row.
2. **Confirm** — a single-student screen: the pre-matched item, two on-by-default switches (notify the
   parent, update stock), an offline banner when applicable, and the confirm button.
3. **Feedback** — **not a toast.** The result persists back into the list as a *delivered today*
   group: a success icon, a timestamp, a "the parent was notified" line, and an **undo**.

Persisted feedback with an undo is better than a toast here, and worth keeping.

## States

| State | What renders |
|---|---|
| **Row — deliverable** | A filled `נמסר` button. |
| **Row — out of stock** | An outline `ממתין` pill, **no pointer** — a blocked state, not a button. |
| **Row — delivered** | In its own group, with a timestamp and an undo. |
| **Both switches** | **On only.** No off state drawn. |
| **Offline** | **Drawn** — frame 2's banner, the closest thing to an edge case on the artboard. |
| **Empty** | **Not drawn** — a lesson with nothing to hand over is the common case. |
| **Loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | cards, the footer, the switch knob |
| Ink | `--fg` | headings, the primary button's fill, icons |
| Secondary text | `--text-secondary` | subtitles, meta lines, the disclaimer, the `ממתין` pill |
| Muted text | `--text-muted` | group headers — **at D8's floor** |
| Semantic — delivered | `--paid` (+ border tint) | the success icon and the delivered card's edge |
| Semantic — out of stock | `--danger` (+ border tint) | the blocked row's text and card edge |
| Border | `--border` / `--border-strong` | hairlines, the dashed avatar placeholder |
| Belt | `belt_rank.color_hex` via `BeltBar` | the row swatches and frame 2's item preview |

The dark frame uses a D8 dark-mode-only grey, which is legal there (G11). **The light frame uses
none of the three retired values** — verified.

> **▲ D7 — ringed, but with the wrong value.** Both belt renderings *do* carry a border, unlike most
> of the canvas — but each is a **translucent tint of the foreground**, where D7 specifies the solid
> current foreground colour. `BeltBar` uses `--belt-ring` at `--belt-ring-width`. **Use the primitive
> rather than reproducing a diluted ring**; a 22%-alpha ring is most of the way to no ring on the
> belt D7 was written for.
>
> The judogi row's accent bar is **not** a belt and carries no ring — correct, but it means the same
> visual shape means two things in one list. Worth a decision.

## RTL

- The **back chevron** points right — correct for RTL, hard-coded, and it must flip for `en`/`ru`.
- The switch knob uses `justify-content: flex-end` — **logical, and correct.** Preserve that in
  `Switch` rather than "fixing" it into a physical offset.
- **Must not mirror:** the times, the order dates, the stock numbers and the `7 → 6` decrement.
- The export's spacing is physical shorthand throughout; per D10, translate to logical.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Belt swatch, item preview | `BeltBar` | With the solid ring. |
| Student rows | `StudentRow` | Name + meta + a trailing action. Needs a **trailing-slot** for the button or pill. |
| Buttons | `Button` | `נמסר`, `חזרה`, `מסירה לרוני`; `ביטול` as `ghost`. |
| Both switches | `Switch` | `stateLabels: {on, off}`. |
| The three card kinds | `Card` | With a **semantic border variant** — neutral, danger, success. |
| Scope banner, offline banner | `Alert` | `tone="pending"` and — the offline one is neutral. **No neutral tone.** README finding 4. |
| `ממתין` | `StatusChip` | `ChipStatus` has `pending`. |
| Empty state | `EmptyState` | Required; not drawn. |
| Avatar placeholder | *gap* | Dashed, single-letter. Fifth artboard. |
| Group header, delivered card, the footer disclaimer | *feature-specific* | |

**`MoneyDisplay` must not appear anywhere on this screen** — §3.2. Its absence is the check.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `פריטים למסירה` | `billing.product.handOut` (`מסירת פריט`) | Wording differs — plural, a list. |
| `ג׳ודו / מתחילים · היום 17:00` | composed | Data. |
| `3 פריטים מחכים לחניכים שנמצאים בשיעור הזה` | — | **No key**, and it states the cross-lane scoping rule. |
| `חגורה לבנה · 2` | `events.belt.rank` + a count | The group header composes a product name with a pending count; **no key**. |
| `הוזמן 09.10 · נוכח בשיעור` | `attendance.roster.present` (`נוכח`) | **Cross-namespace (M5)**; the composed meta has no key. |
| `נמסר` | `billing.product.handedOut` (`הפריט נמסר ונוצר חיוב`) | The key is the **confirmation sentence**; the button needs the verb. **And the key names the consequence — a charge is created — which the button does not.** |
| `חסר במלאי — המנהל הזמין` | — | **▲ No key, and no model.** See above. |
| `ממתין` | `billing.order.status.pending` (`ממתין לאישור`) | Wording differs, and this is a *stock* wait, not a payment one. |
| `נמסר היום` | — | **No key.** |
| `17:04 · ההורה קיבל אישור מסירה` | — | **No key**, and it asserts a **notification to the parent** with no `comms.preferences.kind.*` member for a hand-over. Finding. |
| `ביטול` | `schedule.impact.cancel` | Cross-namespace. Belongs in `common`. **And an undo of a hand-over must reverse a charge** — `billing.charge.status.void` exists; the flow does not. |
| `סימון מסירה מעדכן מלאי אצל המנהל. מחיר הפריט אינו מוצג למאמן.` | `billing.product.noStockHint` **contradicts the first half** | The second half is §3.2 and has no key. |
| `מסירה · רוני ברק` | — | **No key**; interpolates a name. |
| `שולם ב־09.10 על ידי יעל ברק` | `billing.charge.status.settled` | The composed line has no key — **and naming the payer to a coach is a §3.2 edge**: not an amount, but it is billing data. Confirm. |
| `נותרו 7 במלאי המועדון` | — | **No key, no model.** |
| `שליחת אישור להורה` / `הודעה באפליקציה` | `comms.preferences.kind.*` has no hand-over member | **No keys.** |
| `עדכון מלאי אוטומטי` / `7 → 6 חגורות לבנות` | — | **No keys, no model.** |
| `מופעל` | `comms.preferences.on` | Cross-namespace; belongs in `common`. |
| `ללא רשת — המסירה תסונכרן כשתחזור לקליטה` | `attendance.network.offlineHint` | **Cross-namespace (M5)**, same intent. **A hand-over queued offline creates a charge on sync** — that is money going through M5's offline queue, which §10.2 scopes to attendance marks. Finding. |
| `חזרה` / `מסירה לרוני` | — | **No keys**; the second interpolates a name. |

## Findings for the lane

1. **▲ This artboard builds an inventory system that §5.10 says does not exist** — a count, a
   decrement, a blocking out-of-stock state, a re-order notice, and an auto-update switch.
   `billing.product.noStockHint` ships the opposite sentence. **Settle it before M6 builds.**
2. **A hand-over queued offline creates a charge on sync.** §10.2's offline queue is scoped to
   attendance marks. Money in an offline queue is a different risk class.
3. **The undo must void a charge.** `billing.charge.status.void` exists; the flow does not say so.
4. **The list is scoped by M5's attendance for this session** — a cross-lane read, in the W4 contract.
5. **A hand-over notifies the parent** with no notification kind.
6. **`billing.product.handedOut` names the charge; the button does not.** A coach should know that
   tapping this bills a family.
7. **The rings are translucent tints, not D7's solid ring.**
8. **Naming the payer to a coach** is a §3.2 edge worth confirming.
9. **No empty state**, for the common case of a lesson with nothing to hand over.
