# `9a` — שיעורים · the staff day view

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames: light and dark** |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** |
| **i18n namespace** | `schedule` (borrowing `attendance`, `health` — see Strings) |
| **Slot** | none |

The coach's home. D5's rule governs it: a session block surfaces **coverage and completion**,
never registration counts. Everything on a card answers "is a coach on it, has attendance been
taken, is it cancelled" — nothing answers "how many signed up".

> **The two frames are not one screen re-skinned.** Light shows a normal day; dark shows a day
> with an uncovered session, an unmarked session and a substitute, plus a three-tile summary row
> light does not have. Read them as **two illustrative states**, not a theme diff. The screen
> must render every state in both themes.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — "back to today" control at the start, page title at the end.
3. **Day strip** — one rounded container, seven day cells, single-select.
4. **Filter row** — coach chip · location chip · spacer · session count.
5. **Summary row** *(drawn only in the dark frame)* — three count tiles: uncovered, unmarked, completed.
6. **Session list** — repeating `[time column] + [session card]`.
   A card is: title + subline, then either a disclosure chevron **or** inline action buttons —
   never both. Warnings sit on their own line under the status chip.
7. **Sync line** — icon + one muted line, at the foot of the list.
8. **Tab bar** — four tabs; the first is active.

## States

Session card, one per state, all four drawn:

| Card state | What renders |
|---|---|
| **Completed** | Success chip carrying a fraction (`… · 17/18`). Chevron, no buttons. |
| **In progress** | Pending/warning chip. A primary button opens the roster. Warnings inline. |
| **Upcoming** | Outline chip, neutral. Chevron. |
| **Unmarked** | Pending chip + a small reminder button. |
| **Uncovered (no coach)** | Danger chip + two buttons: assign a coach, or cancel. |
| **Cancelled** | Struck-through title, cancelled chip. |

Screen states:

| State | What renders |
|---|---|
| **Empty** | **Not drawn.** `schedule.today.empty` and `schedule.today.emptyHint` exist for it — use `EmptyState` with both. A club with no session today is ordinary, not exceptional. |
| **Loading** | **Not drawn.** The export carries a placeholder-count hint of 5, which is a prototyping cue, not a skeleton design. |
| **Error** | **Not drawn.** The nearest thing on the artboard is the sync line, which is an offline-queue notice, not an error. |
| **Offline / stale** | The sync line is the only offline affordance drawn. §10.1 has four network states, not one — `attendance.network.*` carries all four and this screen must distinguish them. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | session cards, day-strip container, tab bar |
| Ink | `--fg` | titles, times, selected day cell, active tab |
| On-ink | `--on-fg` | text on the selected day cell |
| Secondary text | `--text-secondary` | sublines, duration, sync line |
| Muted text | `--text-muted` | chevrons, inactive tab icons and labels |
| Semantic — completed | `--paid` (+ `--paid` tint) | the attendance-recorded chip |
| Semantic — in progress / unmarked | `--pending` | the in-progress chip, the unmarked dashed treatment, the missing-declaration warning |
| Semantic — uncovered | `--danger` (+ `--danger-tint`) | the no-coach card and tile |
| Semantic — upcoming | `--cancelled` | the neutral outline chip |
| Border (control) | `--border-strong` | the emphasised coach filter chip's outline |
| Border (hairline) | `--border` | card edges, dividers |
| Belt | — none. This screen shows no belt. |

**D8:** the dark frame uses two greys the light frame does not. Both are **dark-mode-only tokens**
and legitimate there (G11). The light frame uses neither, and uses no retired grey. Do not lift a
dark-frame grey into a light-mode map — that is exactly the mistake D8 exists to stop.

**A gap the canvas leaves:** the light frame draws **no danger state at all**. The uncovered-session
treatment exists only in dark. `--danger` and `--danger-tint` are defined in both modes; use them.

## RTL

- The **day strip** runs right-to-left: the earliest day is at the reading start.
- The card **disclosure chevron** points toward the reading direction. It is a directional icon and
  **must** flip with locale — but the canvas already drew it RTL-oriented, so an icon layer that
  auto-flips on `dir` will double-flip it. Feed the icon a logical direction, not a hand-picked path.
- **Must not mirror:** every clock time (`16:00`, `17:00`, `18:30`), every count, the sync icon,
  the warning triangle, the filter chips' chevron-down.
- Times render Asia/Jerusalem regardless of locale (G3), through `core/datetime`.
- Per D10 the day strip and filter row are flex + `gap`; nothing takes a physical margin.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Status chips | `StatusChip` | `paid` for completed · `pending` for in-progress/unmarked · `cancelled` for upcoming · `debt`→ no: use `danger`… **note:** `ChipStatus` is `debt \| paid \| pending \| cancelled \| unmarked \| planned`. Uncovered has **no matching status**. See Findings. |
| Session card | `Card` | The card surface. Contents are feature-specific. |
| Inline warning | `Alert` | `tone="pending"`, with `iconLabel`. `Alert` takes a tone, an icon label and children — it fits the inline warning line as long as a compact rendering is acceptable. |
| Action buttons | `Button` | `primary` for open-attendance and assign-coach; `secondary` for cancel; a small variant for the reminder. |
| Day strip | *feature-specific* | Single-select with date semantics and two-line cells. `SegmentedControl` takes `options: {value,label}[]` — one label per option, so it cannot carry the number-over-weekday cell. Build `WeekDayStrip` in the schedule vertical. |
| Filter chips | *feature-specific* | A picker **trigger**, not a segmented control. Recurs on `9h`, `3b`, `4c`; worth promoting once a second lane needs it, not before. |
| Summary tiles | *feature-specific* | Number-forward metric tiles. `StatusChip` is pill-forward and does not fit. |
| Sync line | *feature-specific* | Reads `attendance.network.*` / `attendance.sync.*` from M5's core. Not `Toast` (not transient), not `Alert` (no severity). |
| Tab bar | *app shell* | Not a `ui/primitives` concern. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `שיעורים` (title) | `schedule.today.title` (`היום`) | **Wording differs.** The artboard title is "Lessons" because the screen can show another day. Decide: keep `today.title` and retitle the screen, or add a key. |
| `חזרה להיום` | `schedule.datePicker.jumpToToday` (`קפיצה להיום`) | Wording differs; the key covers the job. |
| `מאמן: …` | `schedule.today.filterByCoach` + `schedule.today.allCoaches` | Both exist. The chip renders label + current value. |
| `אולם: הכל` | — | **No key.** `schedule.session.location` and `session.noLocation` exist; there is **no location-filter key and no "all locations"**. Finding. |
| `3 שיעורים` | — | **No key.** A pluralised session count is needed for `he`/`en`/`ru`. Finding. |
| `נוכחות נרשמה` | `schedule.session.attendanceTaken` | exact |
| `… · 17/18` | — | Data. But the *shape* (marked/total) has no key and no plural rule. |
| `מתקיים כעת` | — | **No key, and no status either.** `schedule.session.status.*` is `scheduled \| cancelled \| completed`. "In progress" is a fourth, derived from the clock. Finding — see below. |
| `עתידי` | `schedule.session.status.scheduled` (`מתוכנן`) | Wording differs; the key wins. |
| `הצהרה חסרה` | `health.badge.missing` | **Cross-namespace (M4).** Correct — this is the health lane filling `roster-row`/card via the slot registry, not a schedule string. |
| `2 הודיעו מראש` | `attendance.source.preReported` | **Cross-namespace (M5).** The count wrapper has no key. |
| `פתיחת נוכחות` | — | **No key.** `attendance.roster.title` is the screen, not the verb. Finding. |
| `3 שיעורים ממתינים לסנכרון` | `attendance.sync.pendingCount` | **Mismatch of unit.** The key counts *marks*; the artboard counts *sessions*. Pick one and make the copy true. |
| `ללא מאמן` | `schedule.session.noCoach` (`לא שובץ מאמן`) | Wording differs; the key wins. |
| `לא סומן` | `attendance.roster.unmarked` | exact (M5) |
| `הושלמו` | `schedule.session.status.completed` (`הסתיים`) | Wording differs — the tile counts, the key labels one session. |
| `תזכורת` | — | **No key.** `health.reminder.send` is a health reminder to a parent; this is an attendance nudge to a coach. Finding. |
| `שיבוץ מאמן` | — | **No key.** Finding. |
| `ביטול` | `schedule.session.cancel` / `schedule.impact.cancel` | Two candidates; `session.cancel` is the one that cancels a session. |
| `(מחליף)` | `schedule.session.substitute` (`ממלא מקום`) | Wording differs. |
| Tab labels | — | **No keys, in any namespace.** See Findings. |

## Findings for the lane

1. **"In progress" is a fourth session status and it does not exist yet** — not in
   `schedule.session.status.*`, not in `StatusChip`'s `ChipStatus`. It is derived from the clock,
   not stored, so it may be a render-time state rather than a column; either way it needs a label.
2. **"Uncovered" has no chip status.** `ChipStatus` has no danger member. Either `StatusChip` gains
   one, or the no-coach state renders as an `Alert` and not a chip. This is a **shared-primitive
   decision** and belongs in the W2 contract commit, not in a lane.
3. **The tab-bar labels have no i18n keys**, on this screen or any other. G4 forbids inlining them.
   Whoever builds the app shell needs a home for four staff labels, four parent labels and the
   dashboard nav — probably `common`, which no lane owns.
4. **Six strings have no key at all**: location filter, "all locations", session count, open-attendance,
   coach reminder, assign-coach.
5. **The sync-count unit disagrees** between the key and the artboard.
6. **Light mode never shows a danger state.** Do not conclude it has none.
