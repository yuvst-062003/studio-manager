# `3c` — הוספת חניך · join an existing household, not a new account

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `billing` and `health` in the sidebar |
| **Slot** | none |

The whole artboard exists for one affordance: matching a new student to a **household that already
exists**, rather than creating a second account for the same family.

## Regions

1. **DashNav** — imported, `active="members"`.
2. **Header bar** — back chevron · title · spacer · a draft-saved status with a timestamp.
3. **Body row**
   - **Form pane** (flexible, at the reading start)
     1. A three-step stepper: student details (active) · groups · payment and documents.
     2. `פרטי החניך` card — a three-column grid, six fields.
     3. `אפוטרופוס` card — **the household-match block**.
     4. `שיוך לקבוצות` card — a 2×2 grid of selectable group tiles.
   - **Sidebar** (fixed width, at the far side)
     1. `מסלול תשלום` — three radio options; only the selected one shows helper copy.
     2. `מסמכים` — two switch rows, each with a state label.
     3. Spacer, then an info banner summarising the merge, then cancel + save.

## The household match — how it works

1. **Trigger.** The manager types into a guardian search field, pre-filled here with the surname
   just entered two fields above.
2. **Evidence per candidate**, in one highlighted result row: an avatar placeholder · the guardian's
   full name · their phone · **`חניך קיים: <name>`** — the household already has a registered child ·
   and a **debt chip** showing the household's outstanding balance.
3. **Confirm** — a filled `שייך` button on the row.
4. **Reject / alternate** — a second, unhighlighted row offering a brand-new guardian.
5. **Consequences are pre-wired into the rest of the form**, not announced in a toast:
   - the monthly plan's helper copy says a 10% sibling discount will apply automatically;
   - the parent-app invite switch defaults **off**, because the guardian already has an account;
   - the sidebar's closing banner states the merge outcome in a full sentence.

Surfacing the household's **debt** before the merge is the sharpest thing on this artboard: it tells
the manager what they are joining the child to.

## States

| State | What renders |
|---|---|
| **Stepper** | Step 1 active, steps 2–3 upcoming. **No completed state.** |
| **Fields** | One focused (heavier border), the rest default. No disabled, no error. |
| **Required** | **Nothing is marked required.** |
| **Group tile — selected / unselected / disabled** | All three drawn. The disabled tile is belt-gated (`דורש חגורה כתומה ומעלה`) with `לא זמין` replacing its capacity. |
| **Switch — on and off** | **Both drawn**, each with its state label. This is the only artboard in W2 that draws both. |
| **Match — no results** | **Not drawn.** |
| **Match — searching** | **Not drawn.** |
| **Match — several candidates** | **Not drawn.** Only the single-match case. |
| **New-guardian form expanded** | **Not drawn.** |
| **Save — disabled / in flight** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, cards, sidebar |
| Ink | `--fg` | body text, filled buttons, focused field borders |
| Secondary text | `--text-secondary` | helper copy, meta, the disabled tile's title |
| Muted text | `--text-muted` | the draft timestamp, capacity counts, `לא זמין`, the off state label — **at D8's floor** |
| Semantic — debt | `--debt` (+ a tinted border) | the household debt chip |
| Semantic — on | `--paid` | the on state label and the on switch's track |
| Border | `--border` / `--border-strong` | hairlines, control outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | the current-belt swatch |

No D8-retired grey.

**D7 is satisfied here** — the white-belt swatch carries its ring. That is the *only* belt on the
artboard, and white is the one case the export's helper does ring, so this is not evidence the helper
is compliant. It is not. Use `BeltBar`.

## RTL

- Nav on the right; form pane at the reading start, sidebar at the far side, both by `dir` + flex.
- **Two physical properties do directional work**, and both must become logical:
  - the **sidebar's divider** is a `border-right` → `border-inline-start`;
  - the **selected radio's helper copy is indented with `padding-right`** to clear the dot →
    `padding-inline-start`.
- The **back chevron** is a fixed right-pointing path — correct here, but pinned rather than
  `dir`-derived.
- **Must not mirror:** both dates, the phone number, the capacity counts, the prices, the timestamp.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Four text fields, the guardian search | `TextField` | The search needs a leading-icon slot. |
| `מין` | `SegmentedControl` | Two options. |
| Payment plan | `Radio` | Three options; only the selected carries helper copy. |
| Group tiles | `Checkbox` | Including a disabled variant. |
| Both document rows | `Switch` | `stateLabels: {on, off}`. Both states drawn — use this artboard as the reference for the pair. |
| Cards | `Card` | |
| Debt chip | `StatusChip` | `status="debt"`. |
| Prices | `MoneyDisplay` | `agorot` in. **Three amounts are drawn with a `₪` suffix in the export; none of them may be hand-formatted.** |
| Buttons | `Button` | Several of these are `div`s with a pointer cursor in the export — **an accessibility bug, not a pattern to carry over.** |
| Belt swatch | `BeltBar` | |
| Info banner | `Alert` | The banner is neutral and `AlertTone` has no neutral member. Same gap as [`9c`](9c-staff-student-card-transfer.md) finding 5. |
| **Stepper** | *gap* | Discrete steps, not a linear fill — **`ProgressBar` is the wrong primitive.** The **setup wizard `5c`–`5f` has the same shape**, and so does [`12j`](12j-parent-first-registration.md)'s step header. Three places, one missing primitive. |
| **Avatar placeholder** | *gap* | Fourth artboard. |
| **Single-date field** | *gap* | Two date fields here. `DateRangePicker` is for ranges. Second artboard. |
| Household-match block | *feature-specific* | Search + result row + alternate row. **Not `StudentRow`** — the row represents a *guardian*. |
| Group-tile picker | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הוספת חניך` | `people.student.add` | exact |
| `נשמר כטיוטה · 09:41` | — | **No key.** A draft-autosave indicator, persistent — **not a `Toast`**. Finding. |
| `פרטי חניך` / `קבוצות` / `תשלום ומסמכים` | `people.student.one` · `people.student.groups` · `billing.title` + `health.documents.title` | The **step labels have no keys**, and the third spans two namespaces. |
| `שם פרטי` / `שם משפחה` / `תאריך לידה` | `people.student.firstName` / `.lastName` / `.birthdate` | exact |
| `מין` / `בן` / `בת` | — | **No keys.** §4.3 — check whether the model even carries a gender column before building the control. Finding. |
| `חגורה נוכחית` | `events.belt.current` (`הדרגה הנוכחית`) | **Cross-namespace (M7)**, wording differs. |
| `תאריך הצטרפות` | `people.student.joinedOn` (`הצטרף בתאריך`) | Wording differs. |
| `אפוטרופוס` | `people.guardian.one` (`הורה`) | **Different word.** `אפוטרופוס` is the legal term, `הורה` the everyday one. §5.3 uses guardian throughout. Pick one and use it everywhere. |
| `חפשו הורה קיים — הילד יתווסף לחשבון המשפחתי, לא לחשבון חדש` | `people.request.matchedHint` | Same intent, different wording; the key is about approving a match, this is about searching for one. |
| `חניך קיים: שירה נחום` | — | **No key.** The strongest piece of match evidence on the screen. |
| `חוב 320₪` | `billing.openDebts.total` + `MoneyDisplay` | **Cross-namespace (M6)**; the composed chip label has no key. |
| `שייך` | `people.request.approveInGroup` (`אישור ושיוך לקבוצה`) | Different action — this assigns a household, not a group. |
| `אפוטרופוס חדש — …` | `people.request.newFamily` (`משפחה חדשה`) | Wording differs. |
| `שיוך לקבוצות` | `people.enrollment.add` (`רישום לקבוצה`) | Wording differs; and this is plural. |
| `דורש חגורה כתומה ומעלה` / `לא זמין` | `events.exam.notEligible` (`טרם זכאי`) | **Cross-namespace (M7)** and a different rule — exam eligibility, not group eligibility. **Belt-gated group membership has no key and no spec line.** Finding. |
| `מסלול תשלום` / `מנוי חודשי` / `מנוי שנתי` / `ללא חיוב` / `מלגה` | `billing.plan.title` (`מחירים ומסלולים`) | **Cross-namespace (M6).** The four plan-kind labels have **no keys**, and §5.10's plan model does not enumerate kinds. `ללא חיוב`/`מלגה` — a scholarship — is a real billing state with no home. Finding. |
| `הנחת אח/ות 10% תחול אוטומטית` | — | **No key.** **Second artboard to state the sibling discount** — see [`12g`](12g-parent-add-sibling.md) finding 1. |
| `שליחת הצהרת בריאות לחתימה` / `תישלח ל… מיד לאחר השמירה` | `health.declaration.title` + `health.reminder.send` | **Cross-namespace (M4)**; the composed strings have no keys. |
| `הזמנה לאפליקציית ההורים` / `לאורית כבר יש חשבון פעיל` | — | **No keys.** The second interpolates a name. |
| `מופעל` / `כבוי` | `comms.preferences.on` / `.off` | **Cross-namespace (M8).** Belongs in `common`. |
| the merge summary banner | — | **No key.** It interpolates **three** names in one sentence. |
| `ביטול` / `שמירה והוספה` | `schedule.impact.cancel` / — | Cancel is cross-namespace; save has no key. |

## Findings for the lane

1. **A 10% sibling discount, a scholarship plan and belt-gated group eligibility** all appear here
   as product rules with no key, no §5.10/§5.4 line and no model column. Three business rules
   introduced by a mockup.
2. **`מין` may have no column in §4.3.** Check before building the control.
3. **`אפוטרופוס` vs `הורה`.** Two words for one role, on screens that sit next to each other.
4. **No stepper primitive**, and three artboards want one — this, `12j`, and `5c`–`5f`.
5. **No avatar, no single-date field, no neutral `Alert` tone.**
6. **Buttons are `div`s with a pointer cursor** in the export. Fix on port; do not carry it.
7. **Two physical CSS declarations**, named above.
8. **The draft indicator is persistent, not transient.** Not a `Toast`.
9. **The match block has no no-results, no multi-candidate and no searching state** — and a surname
   search in a small club will match several families often.
