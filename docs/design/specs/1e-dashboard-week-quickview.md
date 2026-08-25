# `1e` — לוח מנהל · שבוע, with the Quick View

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 · light only |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W3 · **M5 Attendance** (the grid is M2's) |
| **i18n namespace** | `attendance`, plus `schedule` |
| **Slot** | none — but the popover's rows are `roster-row` shaped |

**This is the artboard that fulfils D5.** Clicking a session opens a popover with the roster and
**inline attendance marking**, so a manager never leaves the calendar to take a register.

## `1e` vs `3a` — and what has to be merged

Both are the dashboard week grid, on the same engine. They are **not** light and heavy versions of
one finished screen; each has what the other lacks.

| | [`3a`](3a-dashboard-week.md) | `1e` |
|---|---|---|
| **DashNav** | present | **absent** — a studio-identity block instead |
| Header | page title · search · a create-session CTA | studio identity, no search, no create |
| Coach / group / room filters | absent | **present** |
| Previous / next week | **absent** | **present** |
| Completed-sessions counter | absent | present |
| "What's missing this week" | present | present, plus the fourth counter |
| Session block clickable | **no handler at all** | wired (a no-op in the export) |
| **Quick View popover** | **absent entirely** | **present** |

**D5 mandates the popover.** So `1e` is the artboard that meets the spec and `3a` is the one with the
app chrome. **Whichever ships needs `3a`'s shell merged with `1e`'s filters and popover** — that merge
is a decision for the specs, and neither artboard settles it alone.

## The Quick View popover

**Anchoring.** A sibling of the grid inside the same positioned region, **opening toward the far side
(the left) of the clicked block**, not over it — so the triggering block stays visible in its selected
state (a bold border plus a soft ring).

> **▲ D10 — the popover's placement is a physical `right` offset**, not a logical inline one. So is
> the grid header's day-number spacing, the day-column and gutter dividers, and the popover's
> "saved automatically" note (a physical `text-align: left`). **Five physical declarations**, and this
> artboard is a large part of the export's documented fourteen.

**Contents,** in order: a header (session title · `weekday time–time · hall · coach` · a close ×),
then a status row (an "attendance not marked" chip plus a computed summary), then the roster, then a
footer (mark all present · open the lesson · a "saved automatically" note).

**How a mark is made.** **The whole row is the click target**, and each click advances that student
one step through a fixed four-state cycle: present → absent → notified → unmarked → present. There is
no per-state button and no way to jump directly to a state or step backwards.

**How it is dismissed.** Only the × — **and the × carries no handler in the export.** There is no
backdrop element, so click-outside-to-close is neither drawn nor implied. Decide it.

**The block → popover wiring is not demonstrated.** The block's handler resolves to a no-op and the
popover's presence is hard-coded to one block. The selected-block styling and the popover both need
building; the artboard shows the destination, not the mechanism.

## States

Session block, five: completed · **open/selected** (bold border + ring) · unmarked (dashed) ·
uncovered (danger border, danger coach text) · cancelled (muted fill, struck title).

Mark, four — the same four as [`1c`](1c-staff-roster.md), at a smaller size:

| State | Treatment |
|---|---|
| present | filled `--paid`, check |
| absent | filled `--danger`, cross |
| **notified** | transparent, **solid** `--pending` border, a lighter cross |
| **unmarked** | transparent, **dashed** `--pending` border, a dot |

Notified and unmarked share `--pending` and differ **only by solid vs dashed and cross vs dot.**
Preserve both. Only three of the four appear in the seeded snapshot — notified is reachable only by
clicking, so it is easy to miss when building.

| Screen state | What renders |
|---|---|
| **Empty grid / empty roster** | **Not drawn.** |
| **Loading / error** | **Not drawn.** |
| **Roster overflow** | The roster list is **clipped, not scrollable**, with no scroll affordance. A group larger than fits has nowhere to go. Finding. |

Every control other than the row cycling and mark-all is drawn but **unwired**: the today button, both
week arrows, all three filter chips, the ×, and "open the lesson".

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, strip, grid header and gutter, blocks, the popover |
| Ink | `--fg` | primary text, the selected segment, the date label, block titles, the selected block's border |
| Secondary text | `--text-secondary` | subtitles, inactive segments, chevrons, coach text, the cancelled block's struck title |
| Muted text | `--text-muted` | the tagline, the missing-strip label, hour labels, the summary, the autosave note |
| Semantic — uncovered | `--danger` | the no-coach indicator, the absent mark |
| Semantic — unmarked / notified | `--pending` | the unmarked indicator, both outline marks, the not-marked chip |
| Semantic — present / completed | `--paid` | the present mark, the completed counter |
| Semantic — cancelled | `--cancelled` | see below |
| Border | `--border` / `--border-strong` | drawn as ad-hoc ink alpha in the export; use the tokens |
| Belt | `belt_rank.color_hex` via `BeltBar` | the popover's roster rows |

> **▲ D8/D12 — the retired grey, twice more.** `1e` draws the cancelled indicator in the missing-strip
> **and** the cancelled block's dot in `#7a766d`. With `3a`'s two and `4b`'s one that is **five
> instances across the dashboard export**, against D12's note naming only `4h`. `--cancelled`
> supersedes it. No other retired grey appears.

> **▲ D7 — the export's belt helper rings only white.** The popover's roster includes a **yellow**
> belt, drawn bare — the exact case D7's audit names. `BeltBar` rings unconditionally.

## RTL

- **The popover opens toward the left** — the inline-end side — of a block in the rightmost column.
- **Five physical declarations**, listed above. All must become logical.
- Within a roster row: mark at the reading start, name filling the middle, belt at the end. Preserve
  it logically, not by copying offsets.
- **Must not mirror:** every hour label, day number, time range, count, and the money amount in the
  missing-strip's detail.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Day/week/month switcher | `SegmentedControl` | Three options — D5 caps it there. |
| Buttons | `Button` | Today, mark-all-present (primary), open-the-lesson (secondary). The × needs an icon-only affordance. |
| Not-marked chip | `StatusChip` | `status="unmarked"`. |
| Roster mark | `AttendanceMark` | All four states. **This is the primitive's reason to exist.** |
| Belt swatch | `BeltBar` | |
| Roster row | `StudentRow` | Close — but it needs a **leading `AttendanceMark` slot**, and its own order is belt → name → chip. Same mismatch as [`1c`](1c-staff-roster.md); it is `roster-row`-shaped. |
| The popover's panel | `Card` | The surface only. |
| Week grid, session block, missing-strip, filter chips, the popover shell | *feature-specific* | No primitive is a calendar grid or an anchored popover. |
| Week stepper | *feature-specific* | **Not `DateRangePicker`** — it steps a week, it does not pick an arbitrary range. |
| Studio-identity header | *app shell* | And it is the thing `3a` has as DashNav. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `יום` / `שבוע` / `חודש` | `schedule.view.day` / `.week` / `.month` | exact |
| `היום` | `schedule.week.today` | exact |
| `23–29 באוגוסט 2026` | — | Data. |
| `מאמן: הכל` / `קבוצה: הכל` / `אולם: הכל` | `schedule.today.allCoaches` covers one | **The other two have no "all" key.** Same gap as [`3b`](3b-dashboard-students.md) finding 7. |
| `מה חסר השבוע` | — | **No key.** |
| `2 שיעורים ללא מאמן` / `4 מפגשים ללא סימון נוכחות` / `1 בוטל` / `18 מפגשים הושלמו` | `schedule.session.noCoach` · `attendance.report.unmarkedSessions` · `schedule.session.status.cancelled` · `.completed` | All four labels exist; **none of the four count wrappers does.** |
| `ללא מאמן` (in a block) | `schedule.session.noCoach` | Wording differs. |
| popover subtitle | composed | Data. |
| `נוכחות לא נסמנה` | `attendance.roster.unmarked` (`לא סומן`) | Wording differs — and note the artboard's spelling, `נסמנה`, is a **typo** for `נסמנה`/`סומנה`. Ship the key. |
| `{N} נוכחים · {N} לא סומנו` | `attendance.roster.present` / `.unmarked` | The composed summary has no key — **and it omits the absent count entirely**, though absences are in the roster. |
| `הודיעו מראש` | `attendance.source.preReported` | exact |
| `לא סומן` | `attendance.roster.unmarked` | exact |
| `הצהרת בריאות חסרה` | `health.badge.missing` | exact **(M4)** — a flag takes priority over the mark-state note. |
| `סמן הכל נוכח` | `attendance.roster.markAllPresent` | Wording differs. **And see [`9f`](9f-staff-attendance.md) finding 1** — the bulk action must not overwrite a pre-reported mark, and the sibling artboard's does. |
| `פתח שיעור` | — | **No key.** |
| `נשמר אוטומטית` | `attendance.network.offlineHint` is the nearest | **No key** for an autosave confirmation. |

## Findings for the lane

1. **`1e` and `3a` must be merged.** D5 requires the popover; `3a` has the nav, search and create.
   Decide which shell wins and record it.
2. **The popover's roster is clipped, not scrollable.** A group of twenty-five has nowhere to go.
3. **The × has no handler and there is no backdrop.** Dismissal is undecided.
4. **The block → popover wiring is not drawn** — only its destination.
5. **The summary omits the absent count** while showing present and unmarked.
6. **Five physical CSS declarations**, the largest concentration in the export.
7. **Two more instances of the retired grey** — five across the dashboard.
8. **Four count wrappers have no key**, and neither do two "all" filters.
9. **`נסמנה` is a typo on the artboard.** Ship `attendance.roster.unmarked`.
