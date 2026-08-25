# `9d` — מבחן חגורה · a coach creates one, and records results

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames**, light only |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` (`exam.*`, `belt.*`) |
| **Slot** | none |

**Frame 1 creates the exam; frame 2 records its results.** §5.9 makes an exam an **event** with
`type='belt_exam'`, and makes a pass write the result, the belt row and the card cache in one
transaction.

## Regions

**Frame 1** — device chrome · header (back · title · a subtitle naming the creating coach and their
role) · scroll: a two-option exam-type selector · a date and a time field · a `כיתות שייבחנו` card of
three class rows (checkbox · name · an eligible-of-total count) · a card of two switch rows · footer:
save-as-draft + a primary whose label carries the candidate count.

**Frame 2** — device chrome · header (title · subtitle · **a row of three stat tiles**: passed ·
failed · not marked) · a candidate list of five rows · footer: a helper caption + save.

## Two different things are called "candidates"

Do not conflate them:

- **Frame 1** shows eligibility **at class level only** — three class rows, each with a checkbox and a
  plain `N eligible of M` count. **No named individuals, and no statement of what makes a student
  eligible.** The primary button's count is the sum across the *checked* classes.
- **Frame 2** shows the **named roster**, each already resolved to a `current → next` transition.

## Recording a result

Each row is a 42px mark, a name, a note line, and a belt-transition visual. Three states appear:

| Result | Mark | Note | Belt visual |
|---|---|---|---|
| **pass** | filled `--paid`, a check | the transition, in ordinary secondary text | **two** swatches with a chevron |
| **fail** | filled `--danger`, a cross | in `--danger`: stays at the current rank, a makeup date | **one** swatch — the unchanged rank, no chevron |
| **not yet examined** | **dashed** `--pending` border with a dot | in `--pending`, prefixed *not marked*, **then the prospective transition anyway** | two swatches, as for a pass |

The fail row's **structurally different** belt visual — one swatch, no arrow — is the best thing on
this artboard. It shows "no change" rather than saying it.

Showing the *prospective* transition on an unmarked row is also right: it previews what a pass would
grant, before anyone decides.

## ▲ The rows are not tappable, and there is no way to record a result

Frame 2's rows carry **no pointer and no handler** — unlike [`1c`](1c-staff-roster.md) and
[`9f`](9f-staff-attendance.md), whose roster rows cycle on tap, and unlike
[`1e`](1e-dashboard-week-quickview.md)'s popover. Frame 2 is drawn as a **static picture of
already-computed results.**

So the artboard shows the destination and not the mechanism. If tap-to-cycle pass/fail/not-yet is the
interaction — and it is the natural one, matching the attendance screens — **it is not drawn**, and
neither is any other affordance for entering a result.

## Does the screen warn that a pass promotes?

Indirectly, in the footer caption: *on save, the belt updates and parents are notified.* That matches
§5.9's one-transaction write and correctly states the consequence. But:

- it is **plain secondary caption text** — no icon, no tint, no border — for a statement about an
  effectively irreversible action;
- it never uses the word *promotion*, and it is **unscoped**: it reads as if saving updates "the
  belt" generally, though the per-row detail shows only passes change rank;
- **there is no confirmation.** `events.belt.groupPromoteHint` exists on the manager's side; the
  coach's side has nothing.

## States

| State | What renders |
|---|---|
| **Exam-type selector** | Selected (2px ink) and unselected. |
| **Class checkboxes** | Two checked, one unchecked. |
| **Both switches** | **On only.** |
| **Fields** | The name field emphasised; the rest default. **No error state.** |
| **Empty** | **Not drawn** — a class with zero eligible students is real, and `events.exam.empty` exists. |
| **Loading / error** | **Not drawn**, on a screen that writes to three tables at once. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | the class card, the settings card, the stat tiles, both footers |
| Ink | `--fg` | headings, the primary button's fill, the selected option's border |
| On-ink | `--on-fg` | the primary button's label |
| Secondary text | `--text-secondary` | meta lines, transition text, the footer caption |
| Muted text | `--text-muted` | field-group labels, the coach's role line — **at D8's floor** |
| Semantic — pass | `--paid` | the mark, the tile, the on switches and their labels |
| Semantic — fail | `--danger` | the mark, the tile, the fail note |
| Semantic — not marked | `--pending` | the dashed mark, the tile's dashed border, the note |
| Border | `--border` / `--border-strong` | hairlines and control outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | every transition swatch — **data** |

No D8-retired grey. **One belt value here is the same green D12 moved dark `--paid` away from**, to
stop a belt and a semantic colliding. This artboard is the live example of why: a belt green and a
pass green sit inches apart.

> **▲ D7 — every solid swatch is bare.** Only the pale swatch and the pale half of a bi-colour one
> carry a border, and it is a translucent tint. **Yellow is bare, twice.** `BeltBar` rings
> unconditionally.
>
> **▲ And the bi-colour split axis is inconsistent within one list**: one bi-colour belt is split
> **horizontally**, another **vertically**. [`5b`](5b-dashboard-belt-system.md) is the source of
> truth — pick one axis and encode it in `BeltBar`.

## RTL

- The **back chevron** points right — correct, hard-coded.
- The **belt-swap chevron** points toward the reading direction; combined with DOM order it reads
  from → to correctly. Directional — feed it a logical direction.
- **Must not mirror:** the date, the time, all three tile counts, the eligible-of-total counts, the fee.
- **No physical CSS property in `9d`'s own range** — spacing is symmetric shorthand and `gap`.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Buttons | `Button` | Draft, create (with an interpolated count), save. |
| Both switches | `Switch` | `stateLabels: {on, off}`. |
| Class checkboxes | `Checkbox` | |
| Cards, tiles | `Card` | |
| Belt swatches | `BeltBar` | Ring on every one; one split axis. |
| Candidate rows | `StudentRow` | Name + meta + a trailing accessory — **plus a leading result mark**, which it has no slot for. Same shape as the `roster-row` composites. |
| **The result mark** | ***not* `AttendanceMark`** | Structurally identical — filled check, filled cross, dashed dot — and **semantically a different domain**. `AttendanceState` is `present \| absent \| notified \| unmarked`; an exam result is `pass \| fail \| pending`. **Do not reuse the attendance-named component for exam results.** Either generalise the icon-mark shape underneath both, or build `ExamResultMark` beside it. Finding. |
| Exam-type selector | `Radio` inside `Card` | Title + description per option; `SegmentedControl` cannot carry the description. |
| **Date and time fields** | *gap* | Single values, not a range. `DateRangePicker` does not map. **Fourth artboard needing a single-date field**, and the first needing a time field. |
| Stat tiles | *feature-specific* | The same shape as `6a`, `4a`, `3e`, `1c`, `9g`, `4c`. **Extract once.** |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מבחן חגורה חדש` | `events.exam.title` (`מבחן חגורה`) | The *new* form has no key. |
| `אלון מזרחי · מאמן ראשי` | — | Data — **and the role label has no key.** M1's territory; see the README's finding 6. |
| `מבחן שנתי` / `כל הזכאים בכיתות שאבחר` | — | **Not in `events.type.*`.** *Annual exam* appears here and on [`12d`](12d-parent-belt-progress.md). Fifth type-enum gap. |
| `מועד השלמה` / `למי שלא הגיע למבחן` | — | **▲ No key, no model.** A **makeup sitting** — a second exam for whoever missed the first — is a real §5.9 concept with no column, and the fail row's note references one too. Finding. |
| `תאריך ושעה` | `events.form.startsAt` (`מתחיל`) | Wording differs. |
| `כיתות שייבחנו` | `events.target.class` (`חוג`) | Wording differs — and note **`כיתה` again**, where the key says `חוג`. Third vocabulary collision (see [`9c`](9c-staff-student-card-transfer.md) finding 2). |
| `9 זכאים מתוך 25` | `events.exam.candidates` (`מועמדים`) + `exam.eligibility` (`זכאות`) | Both exist; **the composed count does not**, and **what makes a student eligible is never stated on this screen.** |
| `חיוב דמי מבחן` / `פריט מהמחירון · 90₪` | `events.fee.label` + `events.fee.chargeOnConfirm` | **Cross-namespace in effect (M6)** — an exam fee is a catalogue item. Neither composed string has a key. |
| `הזמנה להורים` / `תישלח ל־15 משקי בית` | `events.publish` (`פרסום האירוע`) | **Publishing and inviting are different actions** — same finding as [`9i`](9i-staff-events.md) finding 1. The household count has no key. |
| `מופעל` | `comms.preferences.on` | Cross-namespace; belongs in `common`. |
| `טיוטה` | `events.form.saveDraft` (`שמירה כטיוטה`) | Near. |
| `יצירת המבחן · 15 נבחנים` | `events.exam.record` (`רישום תוצאות`) is a different action | **No key**, and the count is interpolated. |
| `רישום תוצאות` | `events.exam.record` | exact |
| `11 עברו` / `1 לא עבר` / `3 לא סומן` | `events.exam.result.pass` / `.fail` / `.pending` (`טרם נבחן`) | **All three labels exist**; the counts have no wrapper, and the third's wording differs. |
| `נשאר בלבנה · מועד השלמה` | `events.belt.current` | **No key**, and it references the makeup sitting again. |
| `לא סומן · …` | `events.exam.result.pending` (`טרם נבחן`) | Wording differs — the artboard borrows attendance's `לא סומן`. **Keep them distinct**: an unexamined candidate is not an unmarked session. |
| `בשמירה — החגורה מתעדכנת וההורים מקבלים הודעה` | `events.exam.passPromotesHint` (`תוצאת ״עבר״ מעניקה את הדרגה הבאה ומעדכנת את כרטיס החניך`) | **The key is better than the artboard's caption** — it scopes the consequence to a pass and names the promotion. **Ship the key.** It says nothing about notifying parents, and that half has no key and no notification kind. |
| `שמירה` | — | **No key.** |

## Findings for the lane

1. **▲ There is no way to record a result.** Frame 2's rows are static. The screen shows the outcome
   and not the interaction; the natural one — tap to cycle — is not drawn.
2. **▲ A makeup sitting has no model**, and two places on this artboard depend on it.
3. **Do not reuse `AttendanceMark` for exam results.** Same shapes, different domain and different
   states. Generalise the mark underneath, or build a sibling.
4. **`events.exam.passPromotesHint` is better than the drawn caption** — it scopes to a pass and names
   the promotion. Ship it, and add a confirmation for an irreversible write.
5. **The bi-colour split axis is inconsistent inside one list.**
6. **What makes a candidate eligible is never stated**, on the screen that selects them.
7. **Publishing and inviting are different actions.** Second artboard.
8. **No single-date and no time field** among the 18.
9. **An exam fee is a catalogue item** — M7's screen creating an M6 charge. Contract commit.
