# `5a` — מחירים ומסלולים · plans and one-off items

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M6 Money** |
| **i18n namespace** | `billing` |
| **Slot** | none |

## ▲ §5.10's versioning is not on this artboard

§5.10 says plans are **versioned, never edited in place**, so history stays explicable.
`billing.plan.versionedHint` ships the sentence: *changing a price closes the current plan and opens
a new one; earlier charges are preserved.* `billing.plan.closeCurrent`, `plan.activeFrom` and
`plan.activeTo` exist alongside it.

**The artboard draws none of them.** The edit panel mutates one plan object in place:

- **no effective-from field.** The only date-shaped input is a recurring *billing day*.
- **no "close the current plan" action.**
- **no version history rendered.** There is a `היסטוריית שינויים` button in the header whose contents
  are never drawn — it could be a version log or a generic audit trail; the artboard does not say.
- instead, a toggle — `עדכון מחיר לחניכים קיימים`, currently off, with the helper *if off, the new
  price applies to new signups only*. **That is grandfathering by a boolean on a mutable row**, not a
  date-effective version anyone can query later.

The warning banner — *a price change affects 68 students in the next billing run* — confirms the
model: edits apply forward at the next run.

**Build the versioned model.** A boolean cannot answer "what did this family agree to pay in March",
which is the question a billing dispute is made of. The keys already exist.

## Regions

1. **DashNav** — imported, `active="payments"`.
2. **Header bar** — title · subtitle (discipline · a VAT note) · spacer · change-history · new-item (primary).
3. **Tab row** — three: subscription plans (active) · one-off items · discounts.
4. **Content splitter**
   - **List column** — a plans table (header + four rows), then a one-off items card (four rows + an add row).
   - **Edit panel** (fixed width, far side) — name · price + billing day · an auto-discount chip row ·
     two switch rows · a spacer · the warning banner · cancel + save.

**Both tables render together while the plans tab shows as active**, and the one-off tab never gates
anything. Whether this is one scrolling page or genuinely tabbed is undecided.

## No inventory — held

The one-off rows carry a name, a price and a category. **No quantity, no stock, no availability.**
§5.10 held — and note that [`11a`](11a-staff-hand-over.md) contradicts it. This artboard and
[`12e`](12e-parent-order-items.md) agree; `11a` is the outlier.

## States

| State | What renders |
|---|---|
| **Plan row — active** | Full-colour, a `פעיל` chip, an edit and a delete icon. |
| **Plan row — off** | Every cell muted, a neutral chip, **and no action icons at all** — an inactive plan loses its inline edit and delete. |
| **Plan row — being edited** | Its price cell renders as a bordered, emphasised box. |
| **Standing-order switch** | **On only.** |
| **Existing-students switch** | **Off only.** So between the two, both states are documented — but not on one control. |
| **Empty — no plans** | **Not drawn**, and `billing.plan.empty` exists. A studio before its first plan is the setup wizard's exit state. |
| **Empty — no products** | **Not drawn**, and `billing.product.empty` exists. |
| **Loading / error / validation** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, tabs, both cards, the edit panel |
| Ink | `--fg` | title, primary buttons, the edited price's border |
| Secondary text | `--text-secondary` | row values, inactive tabs, category tags, the muted off-row |
| Muted text | `--text-muted` | subtitle, column headers, field labels, the off state label |
| Semantic — active / on | `--paid` | the `פעיל` chip, the on switch's track and label |
| Semantic — destructive | `--danger` | the delete icons only — **no danger text or chip on this artboard** |
| Semantic — warning | `--pending` (+ tint) | the price-change banner |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | — none. |

No D8-retired grey. **The banner's text and the artboard's other ambers are two slightly different
values** — one is the on-tint variant of the other. Use `--pending` for both and let
`tokens.audit.test.ts` decide; D12 added exactly that audit.

## RTL

- Nav on the right; the list column at the reading start, the edit panel at the far side.
- **▲ The edit panel's divider is a physical `border-right`.** It faces the list only because of
  where the panel falls; mirrored to LTR it becomes the panel's outer edge. → `border-inline-start`.
- **Prices are rendered two different ways** on this artboard: one row splits the number and the `₪`
  into separate elements, the rest concatenate. **Neither belongs in a component** — `MoneyDisplay`
  owns the order, the grouping and the bidi behaviour.
- **Must not mirror:** every price, the billing day, the affected-student count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All buttons | `Button` | Two header, two footer, plus icon-only edit and delete per row — **and `ButtonVariant` has no icon-only member.** Fourth artboard. |
| Cards, panel | `Card` | |
| Status chips | `StatusChip` | `paid` and `cancelled`. |
| Both switches | `Switch` | `stateLabels: {on, off}`. |
| Every price | `MoneyDisplay` | Table, panel, and the item rows. Agorot in (G2). |
| Fields | `TextField` | Name, price, billing day. **Billing day is a day-of-month, not free text** — no select primitive. |
| Warning banner | `Alert` | `tone="pending"`. |
| Tab row | *gap* | **No `Tabs` primitive.** The drawn style is underline tabs, not a segmented pill. Second artboard (see `6a`). |
| **Discount chips** | *gap* | Applied · available · add-new. Ninth artboard wanting a chip-select. |
| **Dashed add-row / add-chip** | *gap* | Used twice here, and on `5b`, `5e`, `6b`, `7b`, `4f`. A repeated affordance with no primitive. |
| Plan row, item row, the edit panel | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מחירים ומסלולים` | `billing.plan.title` | exact |
| `מחירון המועדון · כל המחירים כוללים מע״מ` | — | **No key**, and **the VAT claim is a legal statement** with no §5.10 basis. Israeli VAT on a children's sports subscription is a real question and the answer belongs in the model, not in a subtitle. Finding. |
| `היסטוריית שינויים` | — | **No key**, and see the versioning section — it is either the version log §5.10 wants or something else. |
| `פריט חדש` | `billing.product.add` (`פריט חדש`) | exact |
| `מסלולי מנוי` / `פריטים חד-פעמיים` / `הנחות` | `billing.plan.title` · `billing.product.title` · — | **`הנחות` — discounts — has no key and no model.** `billing` has no discount family at all, and a sibling discount and a scholarship have now appeared on `12g`, `3c` and here. Finding. |
| `מסלול` / `תדירות חיוב` / `מחיר` / `קבוצות` / `מצב` | `billing.plan.name` · — · `plan.monthlyAmount` · `plan.appliesTo` · — | **Billing frequency and status have no key** — and `plan.monthlyAmount` is monthly, while the table shows one-off and seasonal plans. Finding. |
| `כל 1 לחודש` / `חד-פעמי · ספטמבר` / `יולי–אוגוסט` | — | **No keys.** Three billing frequencies with no enum: monthly-on-a-day, one-off-in-a-month, a date range. §5.10 models a monthly run. Finding. |
| `פעיל` / `כבוי` | `billing.subscription.status.active` (`פעילה`) / `comms.preferences.off` | Gender differs on the first (the key agrees with *הוראה*, feminine; a plan is masculine); the second is **cross-namespace** and belongs in `common`. |
| `נוספים לחשבון ההורה כשורה נפרדת` | — | **No key.** |
| item names and categories | `billing.product.name` labels the field | Data — **and the categories (`ציוד`, `אירוע`, `מנהלה`) are an enum with no keys and no model.** |
| `הוספת פריט — שם, מחיר וקטגוריה` | `billing.product.add` | The composed hint has no key. |
| `עריכת מסלול` | `billing.plan.title` | **No edit-panel key.** |
| `שם המסלול` | `billing.plan.name` | exact |
| `יום חיוב` | `billing.charge.dueDate` (`לתשלום עד`) | **Different concept** — a due date on a charge vs a recurring billing day on a plan. **No key.** |
| `הנחות שחלות אוטומטית` / `אח/ות 10%` / `מלגה` / `+ הנחה` | — | **No keys, no model.** See above. |
| `חיוב אוטומטי בהוראת קבע` / `להורים שהקימו הרשאה` | `billing.subscription.managerRecordHint` (`רישום של המועדון בלבד — ההורה אינו מגדיר אותו`) | **▲ The key and the toggle disagree.** The key says a standing order is *the club's record only* and cannot be created in code — CLAUDE.md's gotcha. The toggle says *automatic billing by standing order*, as if the system charges it. **Automated recurring billing is exactly what G8 forbids.** Finding. |
| `עדכון מחיר לחניכים קיימים` / `אם כבוי — …` | `billing.plan.versionedHint` **supersedes both** | See the versioning section. |
| `שינוי מחיר משפיע על 68 חניכים בחיוב הבא (1.11).` | — | **No key**, and it is the right instinct — an impact preview — with the wrong model behind it. |
| `ביטול` / `שמירת מסלול` | `schedule.impact.cancel` / — | Cross-namespace; and no save key. |

## Findings for the lane

1. **▲ §5.10's plan versioning is absent**, and five keys exist for it. A grandfather boolean cannot
   answer what a family agreed to pay in a past month.
2. **▲ "Automatic billing by standing order" contradicts G8 and `subscription.managerRecordHint`.**
   Our provider cannot create or charge a הוראת קבע programmatically; the club records it manually.
   A toggle that says otherwise is the most dangerous string on the artboard.
3. **Discounts are a whole tab with no key, no enum and no model** — and a sibling discount and a
   scholarship have now appeared on three artboards.
4. **Three billing frequencies with no enum**, where §5.10 models a monthly run.
5. **The VAT claim in the subtitle** is a legal statement with no basis in the model.
6. **Product categories are an enum with no keys.**
7. **No `Tabs`, no icon-only `Button`, no chip-select, no select** — four primitive gaps on one screen.
8. **A physical `border-right`.**
9. **Neither empty state is drawn**, and both are the setup wizard's exit state.
