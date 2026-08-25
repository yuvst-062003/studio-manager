# `12e` — הזמנת פריטים · ordering, paid by card

| | |
|---|---|
| **Surface** | Parent app · 390×844 · **two frames** |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

**Frame 1** is the catalogue; **frame 2** is a per-item configurator reached from it. A browse screen
and a checkout, not a theme pair.

## Regions

**Frame 1** — device chrome · header (title + a one-line subtitle) · scroll: an amber promotion
prompt · three product rows (thumbnail · title · a variant/spec line · price) · a `ההזמנות שלי`
label and one order-history card · tab bar.

**Frame 2** — device chrome · header (back · title) · scroll: a large belt-colour preview panel ·
`למי` and a three-way child selector · `צבע — לפי הדרגה של דנה` and a five-swatch colour picker ·
`מידה` with an inline helper and a four-way size selector · a delivery-info row · a **sticky footer**:
price · a payment-method caption · the CTA.

Everything in frame 2 arrives **pre-selected from context** — the child, the colour derived from her
current rank, the size the coach recommends. The parent confirms rather than composes.

## §5.10's no-inventory rule — held

Each product row shows a thumbnail, a title, one spec line and a price. **No stock count, no "N left",
no availability indicator appears anywhere.** §5.10 is explicit — no stock counts, no inventory, that
is a different product — and this artboard does not break it.

**But `11a`, the coach's hand-over screen, does**: it shows an out-of-stock state and a live
inventory decrement. See [`11a`](11a-staff-hand-over.md). The two artboards disagree about whether
this product has inventory, and only one of them can be right.

## The card-payment flow

| Stage | What renders |
|---|---|
| **Before** | Frame 2, fully. Price, method caption and CTA together in the footer. |
| **During** | **Not drawn.** No redirect interstitial, no spinner, no embedded provider frame. |
| **After** | **Not drawn as a confirmation.** The only "after" artefact is frame 1's order-history card — and it shows a *different, earlier* order, not the one frame 2 configures. There is no toast, no success screen, no "you're back". |

§5.10 makes the return page never the source of truth and says a closed tab still pays.
`billing.order.verifying` and `verifyingHint` exist for exactly that state and **nothing draws it.**

## States

| State | What renders |
|---|---|
| **Child selector** | One selected (filled), two unselected. Each carries a small colour accent. |
| **Colour picker** | One selected — a selection ring plus an inset highlight; the rest a faint hairline. |
| **Size selector** | One selected (filled), three unselected, with a coach-recommendation helper above. |
| **CTA** | Default only. No disabled, no in-flight. |
| **Empty catalogue / empty orders** | **Not drawn.** `billing.product.empty` exists. |
| **Loading / error** | **Not drawn**, including for the payment step. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | product rows, the order card, frame 2's headers and footer, the tab bar |
| Ink | `--fg` | titles, the selected pill's fill, the CTA's fill |
| On-ink | `--on-fg` | those labels |
| Secondary text | `--text-secondary` | row spec lines, the method caption, the delivery line |
| Muted text | `--text-muted` | the screen subtitle, section labels, inactive tabs — **at D8's floor** |
| Semantic — promotion / pending | `--pending` (+ tint) | the promotion banner's icon and text, the order-status caption |
| Belt | `belt_rank.color_hex` via `BeltBar` | the preview panel and the belt row's thumbnail |

**No error or success semantic appears at all** — on a screen that takes money.
No D8-retired grey.

> **▲ D7 — two belt fills, both bare.** Frame 2's large preview panel and frame 1's belt-row
> thumbnail are plain coloured rectangles with no ring. `BeltBar` rings unconditionally; route both
> through it.
>
> The **five-swatch colour picker is a different control** — a selection surface, not a belt bar.
> Its selected swatch already carries a ring for *selection*; the unselected ones carry only a
> hairline. Do not conflate a selection ring with D7's contrast ring; a picker that is also a set of
> belt fills arguably wants both.

## RTL

- **Money must not mirror.** Four prices, all short. Render through `MoneyDisplay` and let it own the
  format — do not hand-build `{n}₪`, and never wrap it in an explicit direction.
- The **back chevron** is directional and hard-coded.
- **Must not mirror:** the sizes, the delivery time.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every price | `MoneyDisplay` | Four. |
| Back, CTA | `Button` | |
| Size selector | `SegmentedControl` | Four options, single-select. Exact fit. |
| Child selector | `SegmentedControl` **or feature** | Three options, but **each carries a colour accent** and `options` is `{value,label}`. Same shape as [`12a`](12a-parent-report-absence.md)'s child chips — build it once for the parent app. |
| Promotion banner | `Alert` | `tone="pending"`, with `iconLabel`. |
| Delivery-info row | `Alert` | Neutral — **and `AlertTone` has no neutral member.** See the README's finding 4. |
| Cards | `Card` | |
| Belt preview, belt thumbnail | `BeltBar` | See above. |
| **Colour picker** | *gap* | Five swatches, single-select. Semantically `Radio`; visually nothing like it. **The same control is on [`5b`](5b-dashboard-belt-system.md), where the belt system is defined.** Build `ColourSwatchPicker` once, there. |
| Product row, order-history row | *feature-specific* | **Not `StudentRow`** — these are products and orders. |
| Order status | `StatusChip`? | Drawn as plain coloured text. |
| Header, footer, tab bar | *app shell* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `ציוד` | `billing.product.title` (`פריטים למכירה`) | **Wording differs, and so does the framing** — *equipment* vs *items for sale*. And `12f`'s filter chip says `ציוד` too, so the parent-facing word is settled; the key is not. |
| `מזמינים כאן, מקבלים מהמאמן בשיעור` | `billing.product.handOut` (`מסירת פריט`) is the action | **No key** for the promise. |
| `דנה קודמה לחגורה ירוקה — כדאי להזמין חגורה חדשה` | `events.belt.awarded` (`הדרגה הוענקה`) | **No key**, **cross-namespace (M7)**, and it interpolates a name and a rank. **A promotion triggering a purchase prompt is a real cross-lane behaviour** with no notification kind and no §-line. Finding. |
| `חגורה` / `ג׳ודוגי` / `תיק מועדון` | `billing.product.name` labels the field | The names are **catalogue data**, not copy. |
| `כל הצבעים · מידות 000–4` etc. | — | Data. |
| `ההזמנות שלי` | `billing.product.order` (`הזמנת פריטים`) | Wording differs — *my orders* vs *ordering items*. |
| `שולם 14.10 · ממתין למסירה בשיעור` | `billing.charge.status.settled` + `billing.product.handedOut` | **The composed status has no key**, and `handedOut` is `הפריט נמסר ונוצר חיוב` — the coach's side. **A parent-facing "awaiting hand-over" state has no key**, and it is a real state of an order. Finding. |
| `למי` | — | **No key.** Third artboard needing a child-selection label. |
| `צבע — לפי הדרגה של דנה` | `events.belt.color` (`צבע`) | **Cross-namespace (M7)**; the derived-from-rank half has no key. |
| `מידה` | — | **No key.** A product **variant axis** — and `billing.product.*` has `name` and `price` and nothing about variants. §5.10 does not model a sized product. Finding. |
| `המאמן ממליץ: 2` | — | **No key.** A coach recommending a size implies a per-student field that §4.3 does not carry. Finding. |
| `המאמן ימסור בשיעור הקרוב — א׳ 17:00` | — | **No key**; the session is data. |
| `תשלום בכרטיס` | `billing.method.card` (`כרטיס אשראי`) | Near. |
| `הזמנה ותשלום` | `billing.card.pay` (`לתשלום`) | Wording differs — this one both orders and pays. |
| Tab labels | — | **No keys.** |

`billing.product.noStockHint` (`אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד`) exists, is manager-facing,
and is the sentence [`11a`](11a-staff-hand-over.md) contradicts.

## Findings for the lane

1. **Products have variants — size and colour — and the model does not.** `billing.product.*` carries
   a name and a price. A judogi in sizes 120–160 and a belt in sizes 000–4 need a variant axis.
2. **A coach-recommended size implies a per-student field** §4.3 does not carry.
3. **A belt promotion prompts a purchase.** Cross-lane (M7 → M6), no key, no notification kind.
4. **"Awaiting hand-over" is a real order state with no key.**
5. **Nothing is drawn between pressing pay and being back**, and `billing.order.verifying` exists.
6. **No error state on a screen that takes money.**
7. **Two bare belt fills.**
8. **The colour picker is `5b`'s control.** Build it once.
9. **`11a` shows inventory; this screen and §5.10 say there is none.**
