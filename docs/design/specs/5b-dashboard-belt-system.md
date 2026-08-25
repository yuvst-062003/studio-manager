# `5b` — מערכת חגורות · where the belt system is defined

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` (`belt.*`) |
| **Slot** | none |

**This is the artboard that defines what a belt is**, so it governs `BeltBar`'s API and D7's scope
more than any other. Everywhere else in the product renders `belt_rank.color_hex`; here it is set.

## Regions

1. **DashNav** — imported, `active="belts"`.
2. **Header bar** — title · subtitle (discipline · rank count · a note that it is editable) · spacer ·
   load-a-preset · add-a-rank (primary).
3. **Body row**
   - **Rank table** (at the reading start) — a six-column header, then a card of six rank rows and a
     dashed add-row. A row is: **a drag handle · a belt swatch · the name · minimum tenure ·
     minimum attendance · a student count · edit and delete icons.**
   - **Edit panel** (fixed width, far side) — name · a bi-colour toggle · a first-colour swatch grid ·
     a second-colour swatch grid · a live preview · minimum tenure and minimum attendance · a spacer ·
     cancel + save.

## How a belt is drawn

**Single colour:** a rounded rectangle with a plain fill. Two sizes appear — a small strip in the
table row, and larger squares in the picker.

**Bi-colour:** a **hard 50/50 split** — a gradient whose two stops sit at the midpoint, so it reads as
two solid halves, not a blend. Both orientations appear: a **horizontal** bar (the table swatch and
the preview's wide bar) and a **vertical** one (the preview's narrow bar).

Colour A takes the reading-start half, colour B the far half — matching how a compound name reads.

> **▲ D10 — the gradient's direction is a hard-coded physical keyword.** It produces the correct
> order only because the canvas is RTL. `BeltBar` must express it as *first colour toward the inline
> start*.
>
> **▲ And the split axis is inconsistent across the canvas.** [`9d`](9d-staff-belt-exam.md) draws one
> bi-colour belt split horizontally and another split **vertically**, in the same list. `5b` is the
> source of truth: **decide one axis here and encode it in `BeltBar`.**

## ▲ D7 — the ring is applied by eye, not by rule

Two of the six rows carry a ring: the **white** swatch and the **white half of a bi-colour** swatch.
Both are a **translucent tint of the ink**, not the solid foreground D7 specifies. **The yellow,
orange, green, brown and bi-colour-without-white swatches carry no border at all.**

The instinct is understandable — ring the ones that would otherwise vanish. **It is not the rule.**
D7 is unconditional, and D12 adds that brown and green fail against the dark ground too — **five belts
across the two modes**, not the three the light-mode audit named. `BeltBar` applies
`--belt-ring` at `--belt-ring-width` unconditionally, with no prop to disable it, and its test asserts it.

**Do not conflate two rings.** The picker's selected swatch also carries a ring — a **selection**
indicator, thicker and with an inset highlight. A swatch that is both a belt fill and a selection
target wants both, distinguishably.

## How a colour is chosen

**A fixed grid of eight swatches** — click to select, one per grid, two grids for a bi-colour rank.
**Not a hex field, not a colour wheel.**

That is the right shape and it is worth saying why: D1 forbids a studio choosing a *brand* colour in
v1, because an arbitrary hex can fail a contrast check. **A belt colour is different — it is per-class
data (D3, §5.9), and a bounded palette keeps it auditable.** So a picker here is legitimate precisely
because it is bounded. Keep the bound; do not add a hex field later.

Eight presets exist; the six drawn rows use five of them.

## Ordering, and the next rank

**Drag and drop only** — a grip handle per row, plus the copy *drag to reorder*. **No numeric order
field, no up/down buttons.** "The next rank" is expressed purely as list position: whichever row is
below.

`events.belt.order` and `belt.orderHint` (`הסדר קובע מהי הדרגה הבאה`) both exist and say exactly that.

## Kyu — absent entirely

`events.belt.kyu` and `belt.kyuOptional` (`לא כל מועדון משתמש בקיו`) exist. **Neither the table nor
the edit panel has a kyu field.** It is not shown as optional; it is not shown at all. Either the
keys are dead or the artboard is missing a field — and since `kyuOptional` was written deliberately,
the second is likelier. Finding.

## States

| State | What renders |
|---|---|
| **Bi-colour toggle** | **On only**, with its state label. |
| **Swatch — selected** | A 2px ink border plus an inset highlight. |
| **Swatch — unselected** | A hairline. |
| **Rows** | One state. All six identical apart from their data. |
| **Empty — no belt system yet** | **Not drawn**, and `events.belt.empty` (`לא הוגדרה מערכת חגורות`) exists. It is the state a studio is in before the wizard's step 2 runs. |
| **Loading / error / validation** | **Not drawn.** |
| **Delete confirmation** | **Not drawn** — and deleting a rank that students hold is destructive. The row shows a student count, so the data to warn with is right there. |

The subtitle claims twelve ranks and six rows are drawn, in a card with no scroll affordance.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, the table card, the edit panel |
| Ink | `--fg` | headings, primary buttons, the selected swatch's border |
| Secondary text | `--text-secondary` | row values, counts, hints |
| Muted text | `--text-muted` | the subtitle, field labels, column headers — **at D8's floor** |
| Semantic — enabled | `--paid` | the toggle's track and its state label |
| Semantic — destructive | `--danger` | the delete icons only |
| Border | `--border` / `--border-strong` | hairlines and control outlines |
| Belt ring | `--belt-ring` / `--belt-ring-width` | **the only belt-related tokens that exist** (D2) |
| Belt fills | **`belt_rank.color_hex` — data, never a token** | every swatch |

No D8-retired grey. The export uses **seven distinct border alphas** where the token layer has two
tiers; consolidate onto `--border` and `--border-strong` (D12 gave the second a 3:1 obligation, and
a swatch's edge is a control boundary).

## RTL

- Nav on the right; the table at the reading start, the edit panel at the far side.
- **▲ The edit panel's divider is a physical `border-right`.** → `border-inline-start`.
- **▲ The bi-colour gradient's direction is physical.** See above.
- **The ladder runs top to bottom**, so `dir` affects only each row's internal layout.
- **Must not mirror:** the tenure months, the attendance percentages, the student counts.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every swatch, both preview bars | `BeltBar` | **This artboard is `BeltBar`'s specification.** It needs: `colorHex`, `secondaryColorHex`, one split axis, both orientations, two sizes, and the unconditional ring. |
| Both cards | `Card` | |
| Fields | `TextField` | Name, tenure, attendance. |
| Bi-colour toggle | `Switch` | `stateLabels: {on, off}` — **and only the on state is drawn**, so the off label has to be authored. |
| Buttons | `Button` | Four, plus **icon-only edit and delete per row** — `ButtonVariant` has no icon-only member. Fifth artboard. |
| **Colour swatch picker** | *gap — build it here* | Single-select from a bounded set. Semantically `Radio`; visually nothing like it. **The same control appears on [`12e`](12e-parent-order-items.md).** Build `ColourSwatchPicker` once, in `web/packages/ui`, bounded and audited — this is the product's only legitimate colour-selection UI. |
| **Drag-to-reorder** | *gap* | No primitive, and no shared drag utility. Finding. |
| Rank row, the edit panel | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מערכת חגורות` | `events.belt.title` | exact |
| `ג'ודו · 12 דרגות · נקבע בהקמה, ניתן לשינוי` | `events.belt.rankPlural` + `belt.perClassHint` (`מערכת החגורות מוגדרת לכל חוג בנפרד`) | **The composed subtitle has no key** — and **`perClassHint` says something the artboard does not**: the system is per *class*, and this screen shows one discipline with no class selector. Finding. |
| `טעינת ערכה מוכנה` | `events.belt.seedDefault` (`טעינת מערכת חגורות ברירת מחדל`) | Near-exact. |
| `הוספת דרגה` | `events.belt.add` (`דרגה חדשה`) | Wording differs. |
| `חגורה` / `שם` / `ותק מינימלי` / `נוכחות מינימלית` / `חניכים` | `events.belt.color` · `belt.name` · — · — · `people.student.plural` | **The two eligibility columns have no key** — see below. |
| the six rank names | `belt_rank` data | **Not copy — the manager renames them here.** That settles the data-or-copy question for belt names, and by extension for the presets on [`5d`](5d-wizard-step2-belts.md). |
| `—` | — | Not copy, but it needs an accessible label. |
| `הוספת דרגה — גררו לשינוי סדר` | `events.belt.orderHint` | Same intent. |
| `עריכת דרגה` | — | **No edit-panel key.** |
| `שם הדרגה` | `events.belt.name` | exact |
| `חגורה דו-צבעית` | `events.belt.biColor` | exact |
| `חצי-חצי, לחגורות ביניים של ילדים` | — | **No key.** |
| `מופעל` | `comms.preferences.on` | **Cross-namespace (M8).** Belongs in `common`. |
| `צבע ראשון` / `צבע שני` | `events.belt.color` (`צבע`) / `belt.secondaryColor` (`צבע משני`) | Near-exact — **and `secondaryColor` confirms the model carries both.** |
| `תצוגה מקדימה` / `כפי שתופיע ברשימות ובאפליקציה` | — | **No keys.** |
| `ותק מינימלי` / `3 חודשים` | `events.exam.eligibleHint` names tenure | **No field key.** |
| `נוכחות מינימלית` / `75%` | — | **▲ No key, and this is the fourth artboard to make attendance an eligibility criterion.** §5.9 and `events.exam.eligibleHint` say **rank and time held**. Here it is a **per-rank configurable minimum** — a column in the belt table, not a preference. See [`5d`](5d-wizard-step2-belts.md) finding 2. |
| `ביטול` / `שמירת דרגה` | `schedule.impact.cancel` / — | Cross-namespace; no save key. |

## Findings for the lane

1. **▲ Minimum attendance is a per-rank column here.** §5.9 computes eligibility from rank and time
   held; `events.exam.eligibleHint` says so. This makes attendance a **stored belt-rank field**,
   which is a model change, not a UI one. **Fourth artboard** — with `5d`, `6b`, `4d`, and shown to a
   coach on `2d`. Settle §5.9.
2. **Kyu has two keys and no field.** `belt.kyuOptional` was written on purpose.
3. **`belt.perClassHint` says the system is per class**, and this screen has no class selector.
4. **`BeltBar`'s API is specified here**: two colours, one split axis, two orientations, two sizes,
   the unconditional ring. And the split axis disagrees with `9d`.
5. **Belt names are data** — the manager edits them. That answers the data-or-copy question for belts
   and, by extension, for `5d`'s presets.
6. **Build `ColourSwatchPicker` here**, bounded. It is also `12e`'s control, and it is the only
   legitimate colour picker in the product (D1).
7. **No delete confirmation**, on a row that shows how many students hold the rank.
8. **No empty state**, and it is the pre-wizard state.
9. **No drag-to-reorder primitive and no shared drag utility.**
10. **Two physical declarations** — the panel divider and the gradient direction.
