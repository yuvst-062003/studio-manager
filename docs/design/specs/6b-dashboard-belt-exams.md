# `6b` — מבחני חגורה · the exam roundup, and creating one

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` (`exam.*`, `belt.*`) |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="belts"`.
2. **Header bar** — title · subtitle (season · event count) · spacer · a belt-system button ·
   a new-exam primary.
3. **Body row**
   - **Main column** (at the reading start)
     - `אירועים קרובים` — two exam cards.
     - `אירועים שהסתיימו` — one bordered card of two completed rows.
   - **Side panel** (fixed width, far side) — **the new-exam form.**

## The two exam cards

**Card 1 — active**, with an emphasised border: a date badge · title + meta (time · hall · examiner ·
group count) · **three colour-coded stat counters** (eligible · missing attendance · blocked) · a
manage-eligibility button · a footer strip carrying a **status pill**, an **info pill** and an
**edit link**.

**Card 2 — draft**, plain border: a date badge · title + meta · **no counters at all**, replaced by a
plain sentence · a continue-setup button.

The state-driven substitution is right: a draft has no eligibility to count, so it shows a sentence
instead of three zeroes, and its CTA changes accordingly. Keep it.

**Completed rows** carry a tested count, a **compact belt-distribution strip** with no per-segment
numbers, a promoted count, and a summary link.

## The new-exam form

Name · a 2×2 grid (date · time · hall · examiner) · a **group chip row** (four selected plus an
add-chip) · a divider · **`תנאי זכאות`**: a minimum-attendance field and a tenure field · a
**blocking switch** on debt or a missing document · a **charge switch** · footer: draft + a primary
that creates and runs the eligibility check.

**The panel is pre-filled with the values of the highlighted upcoming exam.** So it reads as an
*edit* state, not a blank *create* form, while being titled *new exam*. **Confirm which it is**; a
create form that opens pre-populated with another exam's data is a bug waiting to be reported.

## ▲ Eligibility, and three criteria §5.9 does not have

`events.exam.eligibleHint` reads: *eligibility is computed from the current rank and time held.*

This panel makes eligibility **configurable per exam**, on three axes:

- **minimum attendance** — a percentage field. Fifth artboard (`5d`, `5b`, `12d`, `4d`, `2d`).
- **blocking on debt or a missing document** — a switch, on, whose helper says how many students it
  blocks **right now**. That is **M6's balance and M4's declaration gating an M7 outcome**, made a
  configurable rule rather than an incidental note. Second artboard, after [`4d`](4d-dashboard-belt-eligibility.md).
- **an exam fee** — a switch tied to a catalogue item, i.e. M7 creating an M6 charge.

None of the three has a model, a key or a §-line. §5.9 needs to admit them or the screens need to
drop them, and **the decision belongs in the W4 contract commit**, not in whichever lane builds first.

## States

| State | What renders |
|---|---|
| Card treatments | Emphasised ink (active) · plain (draft). |
| Status pill | **Dashed pending** — invitations not sent. |
| Info pill | Neutral — the fee per student. |
| Group chips | **Selected only.** No unselected variant exists, so the picker's other half is undrawn. |
| Both switches | **On only.** |
| Fields | The name field emphasised; the rest default. **No error, no disabled.** |
| **Empty** | **Not drawn**, either list. `events.exam.empty` (`לא נקבעו מבחני חגורה`) exists — and a club between exam seasons is in it most of the year. |
| **Loading / error** | **Not drawn**, on a form whose primary action runs a bulk eligibility computation. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, both cards, the list card, the panel |
| Ink | `--fg` | headings, primary buttons, the active card's border |
| On-ink | `--on-fg` | primary labels |
| Secondary text | `--text-secondary` | meta lines, helper copy |
| Muted text | `--text-muted` | the subtitle, field labels — **at D8's floor** |
| Semantic — eligible / promoted / on | `--paid` | the eligible counter, the promoted count, both switch labels and tracks |
| Semantic — missing attendance | `--pending` (**dashed** on the pill) | the counter and the status pill |
| Semantic — blocked | `--danger` | the blocked counter |
| Border | `--border` / `--border-strong` | hairlines, the dashed add-chip |
| Belt | `belt_rank.color_hex` via `BeltBar` | the distribution strips — **data** |

No D8-retired grey.

> **▲ D7 — ringed on the pale segments only**, and the ring is a translucent tint rather than the
> solid foreground. Yellow, orange and green segments are bare. **The instinct — ring what would
> otherwise vanish — is the same one on `5b`, `5d`, `4e` and `4d`, and it is not the rule.** D7 is
> unconditional; D12 adds that five belts fail across the two modes. `BeltBar` rings every one.

## RTL

- Nav on the right; the list at the reading start, the panel at the far side.
- **▲ Two physical declarations**: the **date badge's** left border and left padding, repeated on both
  upcoming cards, and the **panel's divider** (`border-right`). → `border-inline-end` and
  `border-inline-start`.
- Switch thumbs use `justify-content: flex-end` — **logical, correct.**
- **Must not mirror:** every date, time, count, percentage, month figure and the fee.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All buttons | `Button` | Six, plus a **text link** (`ghost`) for edit and summary. |
| Both cards, the list card, the panel | `Card` | With a border-emphasis variant. |
| Status and info pills | `StatusChip` | **Dashed pending and a neutral info pill** — `ChipStatus` has `pending` and no neutral-info member. |
| Both switches | `Switch` | `stateLabels: {on, off}`. |
| Fields | `TextField` | Name, hall, examiner, and the two eligibility numbers. |
| The fee | `MoneyDisplay` | Twice — in the info pill and in the switch's helper. |
| Belt distribution strip | `BeltBar` | **Not one belt — a spread of outcomes.** It is a multi-segment strip like the progression on `12d`, with different semantics (how many reached each rank). Confirm `BeltBar` can render a proportional spread, or build `BeltDistribution` beside it. Finding. |
| **Date / time fields** | *gap* | Single values. Sixth artboard. |
| **Group chip picker** | *gap* | Addable, multi-select. **Eleventh artboard.** |
| **Exam card, exam history row, the form panel** | *feature-specific* | |
| **Date badge** | *feature-specific* | Day over month. Also `7a`, `9i`. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מבחני חגורה` | `events.exam.plural` | exact |
| `עונת 2026/27 · 3 אירועים` | `schedule.year.title` (`שנת פעילות`) | **Cross-namespace (M2)** — and `עונה` (*season*) is a **third word** after `שנת פעילות` and `מחזור` on [`4b`](4b-dashboard-groups.md). One concept, three words. Finding. |
| `מערכת החגורות` | `events.belt.title` | exact |
| `מבחן חדש` | `events.exam.title` | The *new* form has no key. |
| `אירועים קרובים` / `אירועים שהסתיימו` | `events.list.upcoming` / `list.past` | Near-exact. |
| exam titles, dates, halls, examiner names | — | Data. |
| `בוחן:` | — | **No key, and it is gendered** — `9d`'s sibling card says `בוחנת`. Same finding as [`4d`](4d-dashboard-belt-eligibility.md). |
| `9 עומדים בתנאים` / `5 חסרה נוכחות` / `3 חסומים` | `events.exam.eligibility` · — · — | **Only the first has a key**, and none has a count wrapper. |
| `ניהול זכאות` | `events.exam.eligibility` | The action has no key. |
| `הזמנות טרם נשלחו` | — | **No key.** **Fourth artboard** (`9i`, `9d`, `7a`, here) — publishing and inviting are different actions and only one has a key. |
| `חיוב 90₪ לחניך` | `events.fee.perStudent` (`לחניך`) | Near; the composed pill has none. |
| `עריכת פרטי האירוע` | `events.form.title` | The edit action has no key. |
| `טיוטה — טרם נקבעו תנאים` | `events.status.draft` | The label exists; **the reason has no key** — and it is a better draft treatment than [`7a`](7a-dashboard-events.md)'s, which says only `טיוטה`. |
| `המשך הגדרה` | — | **No key.** |
| `22 נבחנו` / `20 קודמו` | `events.exam.recorded` / `events.belt.awarded` | Neither has a count form. |
| `סיכום` | — | **No key**, and a post-exam summary has no artboard. Second artboard (see `7a`). |
| `שם האירוע` / `תאריך` / `שעה` / `אולם` / `בוחן` | `events.form.name` · `form.startsAt` · — · `form.location` · — | **Time and examiner have no key.** |
| `קבוצות משתתפות` | `events.target.group` (`קבוצה`) | Wording differs. |
| `+ קבוצה` | `events.target.add` (`הוספת קהל יעד`) | Wording differs. |
| `תנאי זכאות` | `events.exam.eligibility` (`זכאות`) | Near — **and see the eligibility section.** |
| `נוכחות מינימלית` / `80%` | — | **▲ No key.** Fifth artboard. |
| `ותק בחגורה` / `4 חודשים` | `events.exam.eligibleHint` names it | **No field key.** Fourth artboard needing a tenure label. |
| `חסימה על חוב או מסמך חסר` / `3 חניכים ייחסמו כעת` | — | **▲ No key, no model.** Second artboard. The helper's live count is a good affordance and a cross-lane query. |
| `חיוב דמי מבחן` / `פריט ״מבחן חגורה״ · 90₪` | `events.fee.label` + `billing.product.name` | **Cross-namespace (M6).** An exam fee is a catalogue item; **neither composed string has a key.** |
| `מופעל` (×2) | `comms.preferences.on` | Cross-namespace; belongs in `common`. |
| `טיוטה` | `events.form.saveDraft` | Near. |
| `יצירה ובדיקת זכאות` | — | **No key**, and it is **two actions in one button** — create, then run a bulk eligibility computation. That deserves a progress state, which is not drawn. |

## Findings for the lane

1. **▲ Eligibility is configurable on three axes §5.9 does not have** — attendance, a debt-or-document
   block, and by extension an exam fee. The block is M6 and M4 data gating an M7 outcome, as a rule
   rather than a note. **W4 contract commit.**
2. **The create panel is pre-filled with another exam's values.** Create or edit — confirm.
3. **The group picker's unselected state is not drawn**, so half the control is undesigned.
4. **`6b`'s draft treatment is better than `7a`'s** — it says *why* the draft is incomplete. Use it,
   and add `events.status.draftHint`, which neither draws.
5. **A belt-distribution strip is not a belt progression.** Confirm `BeltBar` covers a proportional
   spread, or build a sibling.
6. **`עונה` is a third word for a training year.** After `שנת פעילות` and `מחזור`.
7. **"Create and check eligibility" is two actions in one button** with no progress state.
8. **Two physical declarations**, and the date-badge pattern repeats on `7a` too.
9. **Neither empty state is drawn**, and a club is between exam seasons most of the year.
10. **Publishing and inviting: fourth artboard, still one key.**
