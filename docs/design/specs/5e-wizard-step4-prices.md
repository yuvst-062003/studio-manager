# `5e` — אשף · שלב 4 · first prices and items

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **container is M1's; this step's content is M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | **`setup-wizard`** (`web/packages/ui/src/slots.ts`) |

One step of §5.1's six-step wizard. **The chrome belongs to M1 and the content to M6** — which is
exactly why `setup-wizard` is a slot. See [`5d`](5d-wizard-step2-belts.md) for step 2, whose content
is M7's.

## Chrome — the container's, and it disagrees with `5d`

1. **Header bar** — brand mark + wordmark · spacer · a step counter · a save-and-exit button.
2. **Progress region** — a thin determinate bar, filled to this step's fraction.
3. **Footer nav** — a primary next, a secondary back, and a **step-local defer link**.

> **▲ The two wizard exports disagree about the progress region.**
> [`5d`](5d-wizard-step2-belts.md) draws the bar **and** a six-node step list — numbered circles with
> labels, done / current / upcoming. **`5e` draws only the bar.** One of the two is the design.
> The step list is strictly more informative; pick it, and make the chrome render it on every step.

Two further facts the container's owner needs:

- **The footer nav sits inside the step's own centred content column**, not full-bleed like the
  header. Its position is coupled to the content width. Decide whether that is intended.
- **The next button's label and the defer link's label are step-supplied strings**, not fixed chrome
  copy — `המשך לצוות` names the *next* step, `אקבע מחירים אחר כך` names *this* one. The chrome takes
  them as props; it must not hardcode "Next" and "Skip".

## Can the step be deferred?

**Yes, two ways, and they are different.** `אקבע מחירים אחר כך` defers *this step*;
`שמירה ויציאה` leaves the *whole wizard* to resume later. `5d` has only the second — belt setup is
required. So **deferability is per-step**, and the chrome must model it as such.

## Step content

1. Heading and a subheading.
2. **A subscription-plan card** — a three-column field grid (name · price per month · billing day),
   then a sibling-discount row (label · helper · a percent field · a state label · a `Switch`), then a
   dashed add-another-plan affordance.
3. **A one-off items card** — a title with a helper, a 2×2 grid of catalogue rows (checkbox · label ·
   price), each independently checked, then a dashed add-your-own affordance.

## States

| State | What renders |
|---|---|
| **Name field** | Emphasised border — focused or filled; the artboard does not disambiguate. |
| **Other fields** | Default border. |
| **Sibling-discount switch** | **On only**, with its state label. |
| **Catalogue rows** | Two checked, two unchecked. Both states documented — good. |
| **Empty / loading / error / validation** | **Not drawn**, anywhere. |
| **Next disabled** | **Not drawn**, and a wizard step with a deferral link ought to have one. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, both cards |
| Ink | `--fg` | the heading, the primary button's fill, the checked checkbox, the progress fill, the focused field's border |
| On-ink | `--on-fg` | the primary button's label |
| Secondary text | `--text-secondary` | the subheading, helper copy, the defer link |
| Muted text | `--text-muted` | field labels, the step counter — **at D8's floor** |
| Semantic — on | `--paid` | the state label and the switch's track |
| Border | `--border` / `--border-strong` | hairlines and control outlines. **The dashed add-affordances are control boundaries and must reach 3:1** (D12, SC 1.4.11) — they are the only way to see the affordance. |
| Belt | — none on this step. |

No D8-retired grey. **No physical CSS property in `5e`'s own range** — the switch uses
`justify-content: flex-end`, which is logical and correct.

## RTL

- **The progress fill runs right-to-left**: it is the first and only flex child in a `dir="rtl"` row,
  so it anchors at the reading start and grows toward the end. The inventory annotates step 1's
  progress the same way. **Let `dir` do it; never hard-code a side.**
- The next button's arrow points toward the reading direction. It is a **content choice**, not a CSS
  mechanism — so if `Button` auto-mirrors icons by direction, this glyph must not double-flip.
- **Must not mirror:** the step counter's two numbers, the price, the percent, the billing day.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Progress bar | `ProgressBar` | `label`, `value`, `max`. |
| All buttons | `Button` | Save-and-exit and back as `secondary`, next as `primary`. The defer link wants `ghost`. |
| Both cards | `Card` | |
| Fields | `TextField` | Name, price, discount percent. |
| Sibling-discount toggle | `Switch` | `stateLabels: {on, off}`. |
| Catalogue rows | `Checkbox` | |
| Prices | `MoneyDisplay` | **But the card's helper says the price is editable**, so these are money *inputs*, not displays. `MoneyDisplay` renders; a price field is a `TextField` with agorot behind it. Do not conflate. |
| **Billing day** | *gap* | A day-of-month enum. Not `DateRangePicker`, not free text. **No select primitive.** Fourth artboard. |
| **Step list** (on `5d`) | *gap* | A discrete stepper. **Not `ProgressBar`.** Third artboard (see `3c`, `12j`). |
| Dashed add-affordances | *gap* | Sixth artboard. |
| Step header, both cards' compositions | *feature-specific* | Chrome is M1's; the cards are M6's. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `Studio Manager` | `common.appName.dashboard` (`סטודיו — ניהול`) | **The wordmark is Latin and untranslated**; the key is Hebrew. Decide whether the brand mark localises. |
| `שלב 4 מתוך 6` | — | **No key.** Two interpolated numbers, and it is shared with `5c`, `5d`, `5f` and [`12j`](12j-parent-first-registration.md). Chrome's. |
| `שמירה ויציאה` | — | **No key.** Chrome's. |
| `המשך לצוות` | — | **No key**, and it names the *next* step — so it is one key per step, or one key with the step name interpolated. |
| `חזרה` | — | **No key.** Chrome's. |
| `אקבע מחירים אחר כך` | — | **No key**, step-supplied. |
| `כמה עולה להתאמן אצלכם?` | — | **No key.** |
| `מספיק מסלול אחד כדי להתחיל. פריטים חד-פעמיים אפשר להוסיף מתי שרוצים.` | — | **No key.** |
| `מסלול מנוי` | `billing.plan.title` (`מחירים ומסלולים`) | Wording differs. |
| `שם` | `billing.plan.name` (`שם המסלול`) | Near. |
| `מחיר לחודש` | `billing.plan.monthlyAmount` | exact |
| `יום חיוב` | — | **No key.** Same gap as [`5a`](5a-dashboard-prices-plans.md). |
| `הנחת אח/ות` / `תחול אוטומטית על הילד השני ואילך באותו משק בית` / `10%` | — | **▲ No keys, no model.** **The fourth artboard to state the sibling discount** — after `12g`, `3c` and `5a` — and the only one that spells out the rule: *automatically, from the second child in the same household*. That is a specific, implementable rule stated only in a mockup. Finding. |
| `מופעל` | `comms.preferences.on` | **Cross-namespace (M8).** Belongs in `common`. |
| `+ מסלול נוסף` | `billing.plan.add` (`מסלול חדש`) | Wording differs. |
| `פריטים חד-פעמיים` | `billing.product.title` (`פריטים למכירה`) | Wording differs. |
| `סמנו מה רלוונטי — אפשר לערוך מחיר` | — | **No key.** |
| `ג׳ודוגי` / `מבחן חגורה` / `חגורה` / `דמי רישום שנתיים` | `billing.charge.kind.registration` covers the last | **The first three are seeded catalogue data**, not copy — the same question as [`12c`](12c-parent-health-declaration.md)'s seeded questions. **Are they translated or are they data?** They arrive from a migration and the manager edits them, which argues data; a Russian-speaking manager (§6.1) argues copy. Finding. |
| `פריט משלכם` | `billing.product.add` (`פריט חדש`) | Wording differs. |

## Findings for the lane

1. **The two wizard exports disagree about the progress region.** `5d` has the step list; `5e` does
   not. The chrome must render one thing on every step.
2. **▲ The sibling discount's rule is stated here and nowhere else** — automatic, from the second
   child in a household. Fourth artboard, still no key and no model.
3. **The seeded catalogue is data or copy, and it cannot be both.** Same question as the health
   questionnaire.
4. **Deferability is per-step**: `5e` defers, `5d` does not. The chrome takes it as a prop.
5. **The next label and the defer label are step-supplied**, not chrome copy.
6. **The footer nav is inside the content column**, not the frame.
7. **Four primitive gaps**: a stepper, a select for the billing day, a dashed add-affordance, an
   icon-only button.
8. **Prices here are inputs, not displays.** `MoneyDisplay` is the wrong primitive for a price field.
