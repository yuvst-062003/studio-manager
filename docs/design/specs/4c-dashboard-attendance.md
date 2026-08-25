# `4c` — נוכחות · what is unmarked, and who is missing repeatedly

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W3 · **M5 Attendance** |
| **i18n namespace** | `attendance`, plus `reports` for the at-risk half |
| **Slot** | none |

Two problems on one screen: sessions nobody marked, and students who have stopped coming.

## Regions

1. **DashNav** — imported, `active="attendance"`.
2. **Header bar** — title · a week-range subtitle (static text, **not** a control) · spacer · an export button.
3. **Body row**
   - **Main pane** (at the reading start)
     1. `ממתין לסימון` — a label, a dashed count pill, and a helper line explaining the auto-reminder.
        Then a **dashed-bordered list card** of three unmarked-session rows.
     2. `אחוז נוכחות לפי קבוצה` — a solid card of five group rows: name · a bar · a percentage.
   - **Sidebar** (fixed width, far side) — `חניכים בסיכון`, a subtitle, then three at-risk cards.

## The two halves

**Unmarked sessions.** Each row: start time · group name · a meta line (weekday, date, coach, headcount) ·
a status string naming how long it has been unmarked. **Two actions per row**: remind the coach
(secondary) and mark it now (primary). Neither the row nor its text is clickable — only the buttons.

**At-risk students.** Three cards, and **they are not one uniform pattern**:

| Variant | What it draws | Action |
|---|---|---|
| **Consecutive absences** (×2) | severity-coloured border · a belt swatch · name · `group · N consecutive absences` · **a six-square attendance-sequence strip** | contact the parent |
| **Monthly absences** (×1) | neutral border · belt swatch · name · `group · N absences this month` · **no strip** | **none — the card is read-only** |

Model the two variants explicitly. The second is not "the first with optional bits missing"; it
answers a different question and offers no way to act on it, which is itself worth questioning.

## The unmarked-is-not-absent rule — stated visually, never in words

§5.14 turns on the rule that **a session nobody marked is not a session nobody attended.** The
artboard never says so. But it encodes it: the six-square sequence strip draws three treatments —
filled `--paid` for present, filled `--danger` for absent, and a **dashed `--pending` outline, unfilled**
for unmarked. One card reads present · absent · absent · **unmarked** · absent · **unmarked** and is
still labelled *three consecutive absences*. **The streak count only works if the unmarked squares
are skipped** — neither counted as absences nor treated as breaking the run.

That is a real rule, inferred from the data, stated nowhere. `reports.attendance.unmarkedExcluded`
(`שיעורים שלא סומנו אינם נספרים כהיעדרות`) exists **and this screen does not use it.** It should.

## States

| State | What renders |
|---|---|
| **Empty — nothing unmarked** | **Not drawn.** The goal state of the left half. `attendance.report.empty` exists. |
| **Empty — nobody at risk** | **Not drawn**, and `reports.atRisk.empty` exists. |
| **Loading / error** | **Not drawn.** |
| **Contacted** | **Not drawn**, and `reports.atRisk.contacted` exists — so a manager who contacts a parent gets no feedback and no record on the card. |
| **Group bar** | Three: ink normally, `--pending` below 80%, `--danger` below 70%. |

No hover, focus, active or disabled state exists anywhere — every control is drawn once.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, both cards, the sidebar cards |
| Ink | `--fg` | primary text, the mark-now button's fill, the default bar fill |
| Secondary text | `--text-secondary` | row meta lines, card sublines |
| Muted text | `--text-muted` | the subtitle, the helper line |
| Semantic — pending | `--pending` | the count pill and the dashed list border, the unmarked status text, the 76% bar, one at-risk card's border, the **unmarked square's dashed outline** |
| Semantic — danger | `--danger` | the 61% bar, one at-risk card's border, the **absent square's fill** |
| Semantic — present | `--paid` | the **present square's fill** |
| Border | `--border` / `--border-strong` | hairlines, outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | one swatch per at-risk card |

**No D8-retired grey inside `4c`'s own range** — though `#7a766d` is elsewhere in the same export
(see the README's cross-cutting finding 2).

> **▲ D7 — the canvas rings only the light belt.** The white-belt swatch carries its ring; the yellow
> and green ones do not. **That is not "D7 applied to the cases that need it"** — D7 is unconditional
> ("a belt bar is never fill-only"), D12 adds that five belts fail across the two modes, and yellow is
> the belt D7's own audit names as failing even 3:1. `BeltBar` rings every belt with no opt-out.
> Use the primitive.

## RTL

- Nav on the right; main pane at the reading start, sidebar at the far side.
- **One physical property**: the sidebar's divider is a `border-right`. It lands correctly here only
  because of where the sidebar falls; mirrored to LTR it becomes the sidebar's outer edge.
  → `border-inline-start`. This is the only physical declaration in `4c`'s own range.
- **Must not mirror:** the times, the dates, the percentages, the counts, the sequence strip's order.
- **The sequence strip runs in reading order** — oldest at the reading start. Let `dir` do it.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All buttons | `Button` | `secondary` for export, remind, contact; `primary` for mark-now. |
| The two list cards, the at-risk cards | `Card` | The at-risk card needs a **severity border variant** — three are drawn. |
| Group percentage bars | `ProgressBar` | `label`, `value`, `max`, `readout`. The fill's colour is threshold-driven. |
| The count pill | `StatusChip` | `status="pending"`, dashed. |
| The six-square strip | `AttendanceMark` | Its three drawn states are `present`, `absent`, `unmarked`. **Exact fit** — and reusing it is what keeps the unmarked treatment consistent with `1c`, `9f` and `1e`. |
| Belt swatch | `BeltBar` | See above. |
| Empty states | `EmptyState` | Needed twice; drawn neither time. |
| Unmarked-session row | *feature-specific* | Time + group/meta + status + two buttons. **Not `StudentRow`** — it is session-shaped: time, class, coach, headcount. |
| Group-percentage row | *feature-specific* | Name + `ProgressBar` + figure. |
| At-risk card | *feature-specific*, **two variants** | May borrow `StudentRow`'s name+subline pattern. |

`DateRangePicker` is **not** used: the week label is static text, not a control. See findings.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `נוכחות` | `attendance.report.title` | exact |
| `שבוע 23–29 באוגוסט` | — | **No key**, and it is **not a control** — see findings. |
| `ייצוא דוח נוכחות` | `attendance.report.export` (`ייצוא`) | The key is the bare verb; the qualified label has none. |
| `ממתין לסימון` | `attendance.report.unmarkedSessions` (`שיעורים שלא סומנו`) | Wording differs. |
| `4 מפגשים` | — | **No count key.** |
| `מפגש שלא סומן תוך 24 שעות נשלחת עליו תזכורת למאמן` | — | **No key**, and it describes an **automated reminder after 24 hours** — a scheduled job with no `comms.preferences.kind.*` member and no §-reference. Finding. |
| `לא סומן · 26 שעות` / `· 3 שעות` / `· 2 ימים` | `attendance.roster.unmarked` | The label exists; **the elapsed-time suffix has no key** and needs a relative-time formatter with plurals in `core`. Third artboard needing one (see `2a`, `12a`). |
| `תזכורת למאמן` | — | **No key.** Same gap as [`9a`](9a-staff-today.md) finding 4. |
| `סימון עכשיו` | — | **No key.** |
| `אחוז נוכחות לפי קבוצה` | `reports.operational.attendanceRate` + `operational.byGroup` | **Cross-namespace (M9).** Both halves exist as separate keys; the composed heading does not. |
| `חניכים בסיכון` | `reports.atRisk.title` | exact **(M9)** |
| `3 היעדרויות רצופות ומעלה — הזמן ליצור קשר לפני שהם נושרים.` | `reports.atRisk.subtitle` (`שלוש היעדרויות רצופות ומעלה`) | The first half matches; the second — "before they drop out" — has no key. |
| `N היעדרויות רצופות` | `reports.atRisk.consecutiveAbsences` (`{{count}} היעדרויות רצופות`) | **exact, count already interpolated.** The best-matched string on the artboard. |
| `N היעדרויות בחודש` | — | **No key.** The second variant's metric has no home — `atRisk` models consecutive absences only. Finding. |
| `יצירת קשר עם ההורה` | `reports.atRisk.contactParent` (`צור קשר עם ההורה`) | Near-exact **(M9)**. |

## Findings for the lane

1. **The unmarked-is-not-absent rule is encoded and never stated.**
   `reports.attendance.unmarkedExcluded` exists for it. Put it on the screen.
2. **The at-risk sidebar is M9's data on an M5 screen.** Every string in it resolves to `reports.*`,
   and `4g` is M9's own reports page. Decide in the W3 contract whether M5 renders M9's at-risk list
   or whether this sidebar waits for W5 — otherwise both lanes build it.
3. **The monthly-absence variant has no metric key and no action.** Either it gains both or it goes.
4. **The week range is static text.** There is no way to look at another week on a screen whose
   entire content is scoped to one. `DateRangePicker` exists.
5. **A 24-hour auto-reminder to coaches** has no notification kind and no spec line.
6. **Neither empty state is drawn**, and both are the goal state.
7. **`reports.atRisk.contacted` exists and nothing uses it** — contacting a parent leaves no trace.
8. **Elapsed-time strings need a formatter** in `core`. Third artboard.
9. **A physical `border-right`.**
