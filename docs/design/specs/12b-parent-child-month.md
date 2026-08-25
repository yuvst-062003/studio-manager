# `12b` — לוח הילד · the parent's month calendar

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** (attendance decoration is M5's data) |
| **i18n namespace** | `schedule`, plus `attendance` for the marks |
| **Slot** | none |

A whole month for one child, with attendance that already happened drawn into the grid.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a child-selector pill (belt accent · name · chevron) at the reading start, page title at the end.
3. **View switcher** — two segments: week / month. Month is selected.
4. **Scroll region**
   1. **Month nav** — chevron · `אוגוסט 2026` · chevron.
   2. **Weekday header** — seven columns.
   3. **Day grid** — six leading blanks, days 1–31, five trailing blanks.
   4. **Legend** — four swatch + label pairs.
   5. **Monthly summary card** — month name + session counts, a progress bar with a percentage, and a breakdown sentence.
5. **Footer bar** — two buttons: report an absence (secondary), message the coach (primary).

## States

Day cell, six treatments — **four semantic, one "today", one plain**:

| Cell | Treatment |
|---|---|
| **Attended** | Solid `--paid` fill, on-fill numeral. |
| **Did not attend** | Solid `--danger` fill, on-fill numeral. |
| **Notified in advance** | No fill, a 2px `--pending` ring, matching numeral. |
| **Planned** | No fill, a hairline `--border` ring. |
| **Today** | Solid `--fg` fill, on-ink numeral, bolder. **Not one of the four**, and **not in the legend.** |
| **No session** | Muted numeral, nothing else. |

The legend covers four of the six. "Today" is undocumented on screen and a parent has to infer it.

| Screen state | What renders |
|---|---|
| **Empty** | **Not drawn.** A month before the child joined, or a closure month. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn.** |
| **Week view** | **Not drawn** — the switcher's other segment has no artboard. |
| **Child picker open** | **Not drawn** — only the closed pill. |

**No day cell is tappable in the markup.** The sibling artboard `2a` is explicitly "tap a day";
`12b`'s cells carry no pointer affordance. Whether tapping a day here opens a detail view is
undecided — the visual design does not declare it.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the summary card, the footer bar |
| Ink | `--fg` | title, today's fill, the selected segment's fill, the progress fill, the primary button |
| On-ink | `--on-fg` | text on all of the above |
| Secondary text | `--text-secondary` | plain day numerals, card body |
| Semantic — attended | `--paid` | attended cells, legend swatch |
| Semantic — absent | `--danger` | absent cells, legend swatch |
| Semantic — notified | `--pending` | the notified ring, legend swatch |
| Semantic — planned | `--border` at low alpha | planned cells, legend swatch |
| Belt | `belt_rank.color_hex` via `BeltBar` | the child-selector's accent |

No D8-retired grey. **The belt green and the attended green are different values and must stay so** —
D3 requires belt colours stay distinct from semantics, and D12 already moved dark `--paid` off the
green-belt hex for this reason.

> **▲ D7 — the child-selector's accent bar is fill-only in the canvas.** It is exactly "the belt bar
> beside a student name" D7 names. `BeltBar` rings it unconditionally. Use the primitive.

## RTL

- **The week runs right-to-left**: Sunday rightmost, Saturday leftmost. Israeli convention, and it
  falls out of `dir` on a seven-column grid. A port that assumes column 1 is leftmost inverts it.
- **The month chevrons are two distinct paths**, already RTL-oriented: right = previous, left = next,
  matching reading order. Do not add an automatic flip.
- **Must not mirror:** the day numerals (Latin digits, unaffected by `dir`), the percentage,
  the counts, the month/year label.
- Per D10, the legend and footer are flex rows with `gap`.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Week/month switcher | `SegmentedControl` | Two options. |
| Day cell | `AttendanceMark` | `AttendanceState` is `present \| absent \| notified \| unmarked`. **Three of the four map; "planned" does not, and neither does "today".** See findings. |
| Summary progress | `ProgressBar` | `readout` carries the percentage. |
| Summary card | `Card` | |
| Footer buttons | `Button` | `secondary` then `primary`. |
| Child selector's accent | `BeltBar` | |
| Month grid, month nav | *feature-specific* | No primitive is a month browser. `DateRangePicker` is for ranges. |
| Child selector | *feature-specific* | A switcher composing `BeltBar` + name + chevron. |
| Legend | *feature-specific* | Could reuse `AttendanceMark`'s swatches at small size. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הלוח של דנה` | — | **No key.** `schedule.week.title` and `today.title` are staff-side. A parent's per-child calendar title with an interpolated name has none. Finding. |
| `שבוע` / `חודש` | `schedule.view.week` / `.month` | exact |
| `אוגוסט 2026` | — | Data, via `core/datetime`. |
| `א׳`…`ש׳` | `schedule.weekday.0`…`.6` | exact |
| `נכחה` | `attendance.roster.present` (`נוכח`) | **Gender.** The key is masculine; the artboard is feminine because the child is a girl. Hebrew needs a gendered or gender-neutral form — this is a product decision, not a translation one. Finding. |
| `לא נכחה` | `attendance.roster.absent` (`נעדר`) | Gender, and wording differs. |
| `הודעתם מראש` | `attendance.source.preReported` (`הודיעו מראש`) | Person differs — the parent screen addresses the parent ("you told us"), the staff screen reports them ("they told us"). Both are right for their surface; **one key cannot serve both.** Finding. |
| `מתוכנן` | `schedule.session.status.scheduled` | exact |
| `6 מפגשים שהיו · 3 מתוכננים` | — | **No key**, and it needs two plural forms. |
| `67%` | `reports.operational.attendanceRate` labels it; the value is data | The **label is not drawn** — only the bare number. |
| `4 נוכחויות · היעדרות אחת שדיווחתם · אחת ללא דיווח` | — | **No key.** Three interpolated counts in one Hebrew sentence with number-word agreement — the hardest string on the artboard to translate. Finding. |
| `דיווח היעדרות` | `attendance.absence.title` | exact (M5) |
| `הודעה למאמן` | — | **No key**, and §2.3 puts two-way chat out of scope. **What does this button do?** If it opens a compose-a-message-to-the-coach flow, that is the chat D9.1 cut from `2b`. Finding — flag before building. |

## Findings for the lane

1. **`הודעה למאמן` may be the cut feature wearing a different hat.** D9.1 removed `שיחה עם המשרד`
   from `2b` because §2.3 has no in-app two-way chat and §5.11 permits push plus a one-way inbox.
   A "message the coach" button on the parent's calendar is the same capability. It appears on
   [`2c`](2c-parent-student-card.md) too. **Settle this before either lane builds it.**
2. **`AttendanceMark` has no "planned" state and no "today".** Planned is a future session with no
   mark yet, which is not the same as `unmarked` (a past session nobody marked) — §5.14 depends on
   that distinction. Either `AttendanceState` grows a member or the grid draws planned itself.
3. **Hebrew gender.** `attendance.roster.*` is masculine; a parent's screen about a named daughter
   reads wrong. This affects every parent-facing attendance string.
4. **Person.** "You reported" (parent) vs "they reported" (staff) cannot share a key.
5. **"Today" is not in the legend** and is visually the strongest cell on the grid.
6. **Day cells are not tappable** here and are on `2a`. Decide.
7. **The belt accent is fill-only** in the canvas.
