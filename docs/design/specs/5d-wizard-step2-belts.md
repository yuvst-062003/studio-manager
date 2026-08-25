# `5d` — אשף · שלב 2 · choosing a belt system

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **container is M1's; this step's content is M7 Events & belts** |
| **i18n namespace** | `events` (`belt.*`) |
| **Slot** | **`setup-wizard`** |

Step 2 of six. See [`5e`](5e-wizard-step4-prices.md) for the chrome's other half — **read both before
building the container**, because they disagree.

## Chrome — and where it differs from `5e`

1. **Header bar** — brand mark + wordmark · spacer · step counter · save-and-exit. **Structurally
   identical to `5e`'s.**
2. **Progress region** — the thin bar **plus a six-node step list**: numbered circles with labels, in
   three states — done (a filled success circle with a check), **current** (a filled ink circle, its
   label bold), and upcoming (an outlined circle). The six labels are the wizard's own map:
   club details · belts · groups and schedule · prices · staff · students.
3. **Footer nav** — a primary next and a secondary back. **No defer link.**

> **▲ Two disagreements with [`5e`](5e-wizard-step4-prices.md), and both are the container's to settle.**
> 1. `5d` draws the step list; `5e` draws only the bar. **The step list is the better design** — it
>    names where the manager is in a six-step setup — so make the chrome render it on every step.
> 2. `5d` has **no defer link** and `5e` has one. That is not an inconsistency: **belt setup is
>    required and pricing is not.** Deferability is per-step, and the chrome takes it as a prop.

## Step content

- A heading and a helper line — *you can add, delete and reorder later; children's intermediate belts
  are usually bi-colour.*
- **Four preset cards**, radio-exclusive, each a title plus a one-line tag, and — on the selected one
  only — an explanatory caption. Three are ladders of 7, 12 and 9 ranks; the fourth is
  **build-from-scratch**, drawn with a dashed border to mark it as a different kind of choice.
- A **live preview panel** at the far side: the ranks the selected preset would create, listed with
  their swatches, a truncation line, and a footer row summarising the default promotion condition.

The **primary button's label carries the selected preset's rank count**, so it changes with the
selection. That is a good pattern and a translation problem: it interpolates a number into a verb
phrase.

## Bi-colour belts — how they are drawn

A **hard 50/50 split**: a gradient with both stops at the midpoint, so it reads as two solid halves
rather than a blend. Colour A occupies the reading-start half and colour B the far half, matching how
a compound name reads (`לבנה–צהובה` = white first).

**`5b` is the source of truth for this** — see [`5b`](5b-dashboard-belt-system.md), where the belt
system is defined and the same split appears on both a horizontal and a vertical bar. **Note the
axis disagreement**: [`9d`](9d-staff-belt-exam.md) draws one bi-colour belt split horizontally and
another split *vertically*. One axis, decided once, in `BeltBar`.

> **▲ D10 — the gradient's direction is a hard-coded physical keyword.** It produces the correct
> reading order only because the canvas is RTL. `BeltBar` must express it as
> *first colour toward the inline start*, not as a literal left or right.

## D7 — ringed selectively, and that is not the rule

The ring is drawn **only on the white swatch and on the white half of a bi-colour swatch**, across all
three preset strips and the preview list. **Every saturated swatch — yellow, orange, green, blue,
brown, black — carries none.**

That reads as "ring the ones that would otherwise disappear", which is a reasonable instinct and is
**not what D7 says.** D7 is unconditional — *a belt bar is never fill-only* — and D12 sharpens it:
against the dark ground brown and green fail too, so **five belts across the two modes**, not the
three the light-mode audit happened to name. `BeltBar` rings every belt with no opt-out. Use it.

## States

| State | What renders |
|---|---|
| **Preset — selected** | A 2px ink border, a filled radio, and the only explanatory caption. |
| **Preset — unselected** | A hairline border, an empty radio. |
| **Preset — build from scratch** | Unselected radio styling, **dashed container** — a different kind of action. |
| **Step nodes** | Done, current and upcoming all drawn. **None carries a pointer**, so as drawn the step list is progress, not navigation. |
| **Next disabled** | **Not drawn** — a preset is pre-selected, so the CTA is never empty. |
| **Empty / loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, the preset cards, the preview panel |
| Ink | `--fg` | headings, the current step node, the primary button, the selected card's border |
| On-ink | `--on-fg` | the current node's numeral, the primary button's label |
| Secondary text | `--text-secondary` | the subheading, card captions, the preview footer |
| Muted text | `--text-muted` | the step counter, card tags, the truncation line — **at D8's floor** |
| Semantic — done / recommended / enabled | `--paid` | the done step node, the "recommended" badge, the enabled status word |
| Border | `--border` / `--border-strong` | hairlines and control outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | every swatch — **data, never a token** |

No D8-retired grey. **`--paid` renders three different things here** — a completed wizard step, a
recommendation, and an enabled setting — as a bordered pill in one case and bare text in another.
Normalise the rendering; the role is fine.

> **The belt palette is data (D3, §5.9), and one of its values equals `--fg`'s.** A black belt and the
> ink token share a hex. **That is a coincidence of one studio's data.** Never wire a belt to a token.

## RTL

- The **belt ladder runs top to bottom**, so `dir` does not affect its order — only each row's
  internal layout mirrors.
- The **progress fill and step list run right-to-left**: step 1 at the reading start.
- **▲ A physical `padding-right`**, used repeatedly to indent each preset card's swatch strip and the
  selected card's caption past the radio. → `padding-inline-start`.
- **The bi-colour gradient's direction is physical.** See above.
- **Must not mirror:** the step counter, every rank count, the truncation count, the promotion
  condition's percentage and month count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Progress bar | `ProgressBar` | |
| Buttons | `Button` | Save-and-exit and back `secondary`, next `primary` with an interpolated count. |
| Preset cards | `Radio` inside `Card` | The radio is the control; the card is the chrome. |
| "Recommended" badge | `StatusChip` | |
| Every swatch, the preview rows | `BeltBar` | **With `secondaryColorHex` for bi-colour**, one split axis, and the ring on every segment. |
| **Step list** | *gap* | A discrete stepper — done / current / upcoming, with labels. **Not `ProgressBar`.** Third artboard. |
| Preset card composition, the preview panel | *feature-specific* | M7's content inside M1's chrome. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `שלב 2 מתוך 6` | — | **No key.** Chrome's; shared with `5c`–`5f` and `12j`. |
| `שמירה ויציאה` / `חזרה` | — | **No keys.** Chrome's. |
| the six step labels | `people.student.plural` covers one | **Five of six have no key** — club details, belts, groups and schedule, prices, staff. They name the wizard's own map and belong to the chrome, in `common`. Finding. |
| `איזו מערכת חגורות נהוגה אצלכם?` | `events.belt.title` (`מערכת חגורות`) | The heading is a question; the key is a noun. |
| `אפשר להוסיף, למחוק ולשנות סדר בהמשך.` | `events.belt.orderHint` (`הסדר קובע מהי הדרגה הבאה`) | Different statement. **No key.** |
| `חגורות ביניים לילדים הן בדרך כלל דו-צבעיות.` | `events.belt.biColor` (`חגורה דו־צבעית`) | The label exists; the explanation does not. |
| `ג'ודו · 7 דרגות` / `ג'ודו ילדים · 12 דרגות` / `קראטה · 9 דרגות` | `events.belt.seedDefault` (`טעינת מערכת חגורות ברירת מחדל`) | **▲ The presets are seeded data with no keys** — and a discipline name plus a rank count is a *preset's* name, not UI copy. Same data-or-copy question as the health questionnaire and the price catalogue. **Third occurrence.** Finding. |
| `בוגרים` / `הגדרה ידנית` | — | **No keys.** |
| `מומלץ` | — | **No key.** |
| `6 דרגות ביניים דו-צבעיות — מאפשרות קידום כל 3–4 חודשים.` | — | **No key**, and it makes a **promotion-cadence claim** — every three to four months — that appears nowhere in §5.9. Finding. |
| `הדרגות שייווצרו` | `events.belt.rankPlural` (`דרגות`) | The noun exists; the heading does not. |
| the seven rank names | `belt_rank` data | Not copy — **and `5b` lets the manager rename them**, which settles it: rank names are data. |
| `ועוד 5 דרגות…` | — | **No key**, and it needs a plural. |
| `תנאי קידום ברירת מחדל` / `80% נוכחות · 4 חודשי ותק` | `events.exam.eligibility` (`זכאות`) + `events.exam.eligibleHint` | **▲ `eligibleHint` reads `הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה` — rank and time held. This preview adds an 80% attendance threshold.** Same contradiction as [`2d`](2d-staff-student-card.md) finding 3, and it is now **seeded as a default** here and editable on [`6b`](6b-dashboard-belt-exams.md) and [`4d`](4d-dashboard-belt-eligibility.md). §5.9 needs to admit attendance as a criterion or these three screens need to drop it. |
| `מופעל` | `comms.preferences.on` | Cross-namespace; belongs in `common`. |
| `יצירת 12 דרגות` | `events.belt.add` (`דרגה חדשה`) | Wording differs, and the count is interpolated. |

## Findings for the lane

1. **The chrome disagrees between `5d` and `5e`** — the step list, and the defer link. Both are the
   container's to settle, and both have a right answer: render the list always, take deferability as
   a prop.
2. **▲ Attendance is an eligibility criterion here and §5.9 says rank and time held.** Seeded as a
   default on this screen, editable on `6b` and `4d`, shown to a coach on `2d`. **Four artboards.**
3. **Belt presets are seeded data with no keys** — the third data-or-copy question, after the health
   questionnaire and the price catalogue. **Settle the general rule, not three special cases.**
4. **A promotion cadence of three to four months** is claimed in a caption and modelled nowhere.
5. **Five of the six step labels have no key**, and they belong to the chrome, in `common`.
6. **A physical `padding-right`, and a physical gradient direction.**
7. **The bi-colour split axis disagrees with [`9d`](9d-staff-belt-exam.md).** Decide it in `BeltBar`.
8. **No stepper primitive.** Third artboard.
