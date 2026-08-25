# `9b` — בחירת תאריך · the staff date picker

| | |
|---|---|
| **Surface** | Staff app · 390×844 · light only (no dark frame drawn) |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** |
| **i18n namespace** | `schedule` |
| **Slot** | none |

Reached from `9a`'s day strip. Four modes — day, week, month, range — in one screen.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — close (×) · title · a "today" pill. Hairline beneath.
3. **Mode switcher** — one four-way single-select: `יום / שבוע / חודש / טווח`.
4. **Scroll region** — flat on the ground, no cards:
   1. **Month nav** — chevron · month + year · chevron.
   2. **Weekday header** — seven single-letter columns.
   3. **Date grid** — 7 × 5.
   4. **Legend** — two swatch + label pairs.
   5. Hairline.
   6. **Quick-jump label**, then a wrapping row of four chips.
5. **Footer bar** — the selected-date readout at the start, the confirm button at the end.

## States

Day cell, four drawn:

| Cell state | Treatment |
|---|---|
| **No session** | Muted numeral, no border. |
| **Has sessions** | Hairline border, medium weight. |
| **Attendance unmarked** | Dashed border and text in the pending role. |
| **Selected** | Ink fill, on-ink numeral, semibold. |

Screen states:

| State | What renders |
|---|---|
| **Empty** | Not applicable — a month always has days. |
| **Loading** | **Not drawn.** The per-day session/unmarked decoration is fetched; the grid should render immediately with undecorated cells rather than blocking. |
| **Error** | **Not drawn.** If the decoration fetch fails, the honest fallback is an undecorated but usable grid, not an error screen. |
| **Range mode, incomplete** | **Not drawn.** The footer shows a single selected date; there is no half-range readout and no disabled confirm. The lane must design it. |
| **Out-of-range month** | **Not drawn.** Neither month chevron has a disabled state. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen — this page has no cards |
| Surface | `--surface` | the footer bar only |
| Ink | `--fg` | title, selected day fill, selected segment fill, confirm button fill |
| On-ink | `--on-fg` | the selected day's numeral, the selected segment's label, the confirm button's label |
| Secondary text | `--text-secondary` | unselected segments, undecorated day numerals |
| Muted text | `--text-muted` | the quick-jump section label |
| Semantic — unmarked | `--pending` | the dashed day cell and its legend swatch — the only semantic colour on the screen |
| Border (control) | `--border-strong` | the quick-jump chips' outline, the "today" pill |
| Border (hairline) | `--border` | dividers, the has-sessions day border |
| Belt | — none. |

No D8-retired grey appears on this artboard.

## RTL

- **The week runs right-to-left**: Sunday is the rightmost column, Saturday the leftmost. The grid
  is a seven-column CSS grid inheriting `dir`; a port that assumes "first column = leftmost"
  inverts the whole calendar.
- The two **month chevrons** are separate hand-drawn paths, already RTL-oriented. Do not layer an
  automatic flip on top — feed them a logical direction.
- **Which chevron is "next" is not decided by the markup.** There is no handler. Pick deliberately:
  in RTL, reading-start is the right, so the right chevron should go *back*.
- **Must not mirror:** all day numerals, the date readout, the clock.
- Dates render Asia/Jerusalem (G3) via `core/datetime`.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Mode switcher | `SegmentedControl` | Exact fit — `legend`, `value`, four `options`, `onValueChange`. |
| "today" pill, confirm, quick-jump chips | `Button` | `secondary` for the pill and chips, `primary` for confirm. The close (×) needs an icon-only affordance; `Button` does not obviously offer one. |
| Range mode | `DateRangePicker` | Already exists, and takes `from`/`to`/`onChange`/`fromLabel`/`toLabel`/`min`/`max`/`errorMessage`. **This is the range tab's implementation** — do not build a second range control. |
| Unmarked day treatment | `AttendanceMark` | `AttendanceState` includes `unmarked`. Reuse its visual language rather than re-picking a dashed amber; the same signal appears on `9a`, `4c` and `1e`. |
| Month grid (day/week/month tabs) | *feature-specific* | None of the 18 is a single-date month grid. `DateRangePicker` is scoped to ranges. Build `MonthGrid` in the schedule vertical and let the range tab delegate to `DateRangePicker`. |
| Legend row | *feature-specific* | A key, not a status. `StatusChip` is a status indicator and would misrepresent it. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `בחירת תאריך` | `schedule.datePicker.title` | exact |
| `היום` (header pill) | `schedule.week.today` (`היום`) | exact. `schedule.datePicker.jumpToToday` (`קפיצה להיום`) is the longer form. |
| `יום` | `schedule.view.day` | exact |
| `שבוע` | `schedule.view.week` | exact |
| `חודש` | `schedule.view.month` | exact |
| `טווח` | `schedule.datePicker.range` (`טווח תאריכים`) | Wording differs — the segment needs one word. Either shorten the key or add a short variant. |
| `אוגוסט 2026` | — | Data. Format via `core/datetime`. |
| `א׳`…`ש׳` | `schedule.weekday.0`…`weekday.6` | exact — all seven exist |
| `יש שיעורים` | — | **No key.** Finding. |
| `נוכחות לא סומנה` | `attendance.roster.unmarked` (`לא סומן`) | **Cross-namespace (M5)** and wording differs — the legend needs a sentence, the key is a mark label. |
| `קפיצה מהירה` | — | **No key.** Finding. |
| `השבוע` | — | **No key.** `schedule.week.title` is a screen title, not a jump target. |
| `שבוע הבא` | `schedule.week.next` (`שבוע הבא`) | exact |
| `החודש` | `reports.period.thisMonth` (`החודש`) | **Cross-namespace (M9).** A period key living in reports. Either `schedule` gains its own or the jump chips reuse `reports.period.*` — decide in the W2 contract. |
| `30 יום אחרונים` | — | **No key.** `reports.period.last12Months` and `period.custom` exist; there is no 30-day key. |
| `נבחר: …` | — | **No key** for the readout's prefix. |
| `הצגה` | `schedule.datePicker.apply` (`החל`) | Wording differs; the key covers the job. `datePicker.clear` exists and the artboard draws no clear affordance. |

## Findings for the lane

1. **The four quick-jump chips are period presets and three of the four have no home.** `reports.period.*`
   already models periods for M9. Decide in the W2 contract commit whether periods are a `schedule`
   concept, a `reports` concept, or shared — before two namespaces grow the same four strings.
2. **Range mode has no incomplete state and no error state**, but `DateRangePicker` already takes an
   `errorMessage`. Wire it; do not leave the confirm button always enabled.
3. **Neither month chevron has a disabled state** and neither has a decided direction.
4. **`schedule.datePicker.clear` exists and nothing on the artboard uses it.** Either the screen is
   missing a clear affordance or the key is dead. Check before shipping.
5. **The exported grid's numbering is wrong** — each row's Saturday cell reads one less than that
   row's Sunday. It is a static-export artifact. Derive every cell from the date; never transcribe
   the mock's numbers.
