# `6a` — עמוד קבוצה בודדת · roster + weekly-rule editor

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** (the roster half reads M3's data) |
| **i18n namespace** | `schedule`, plus `people` for the roster columns |
| **Slot** | none |

Two panes: the group's roster on one side, its weekly-rule editor on the other. §5.6's rule that a
schedule change rewrites **only future sessions** is the whole reason the editor has an impact preview.

## Regions

1. **DashNav** — imported, `active="groups"`. See [`3a`](3a-dashboard-week.md#dashnav--the-shared-shell).
2. **Group header** — back chevron · breadcrumb · title + meta line · spacer · two secondary buttons · one primary.
3. **Tab bar** — four tabs; `חניכים · 25` is active and is the only tab this artboard renders.
4. **Content row**
   - **Roster column** (flexible)
     1. Four stat cards: capacity (with a bar), average attendance, in debt, missing document.
     2. Table header, five columns.
     3. Roster rows.
   - **Weekly-schedule panel** (fixed width, at the far side)
     1. Title + subtitle.
     2. Session 1 — expanded/editing.
     3. Session 2 — collapsed summary + an edit affordance.
     4. Add-session row, dashed.
     5. Impact preview banner.
     6. Regular-coach row + a change button.
     7. Over-capacity switch, with a visible state label.
     8. Footer: cancel + save.

## States

| State | What renders |
|---|---|
| **Session row — editing** | Heavier border, delete affordance, weekday pills, three fields. |
| **Session row — collapsed** | One summary line + edit affordance. |
| **Empty roster** | **Not drawn.** A new group has no students. Use `EmptyState` with `attendance.roster.empty` or `people.student.empty`. |
| **No weekly rules yet** | **Not drawn**, and `schedule.rules.empty` exists for it. |
| **Loading** | **Not drawn.** The roster's placeholder-count is a prototyping cue, not a skeleton. |
| **Error** | **Not drawn.** A schedule save can conflict; nothing here shows that. |
| **Switch — on** | **Not drawn.** Only the off state, with its label. |

## The weekly-rule editor — what it has and what it does not

The editor draws **weekday** (single-select pills) and **start time**. It does **not** draw:

- **An end time.** It uses a *duration* field instead. `schedule.rules.startTime` and
  `schedule.rules.endTime` both exist as keys, and `schedule.rules.endBeforeStart` validates
  against an end time. **The keys and the artboard disagree about the model.** Duration and end-time
  are not interchangeable across a DST boundary or a cross-midnight session. Settle this in the
  W2 contract, not in the component.
- **An effective-from date.** `schedule.rules.effectiveFrom` exists as a key and nothing on the
  artboard uses it. §5.6's "future sessions only" needs a boundary; the impact banner names a count
  of future sessions but no date. This is the second half of the same gap.
- **Multi-day rules.** The weekday pills are single-select; a group meeting twice a week is modelled
  as two session rows. That is coherent, and worth writing down so nobody adds multi-select later.

**The impact preview is one aggregate sentence, not a diff.** It names a household count and a
future-session count. §5.6 and E2E-5 need more: `schedule.impact.*` carries eleven keys, including
`protectedPast`, `protectedManual`, `protectedAdHoc` and `firstAffected` — the three categories a
rule change must *not* touch, and the date it starts. **None of them appear on this artboard.** A
preview that says "38 sessions will change" without saying which are protected is precisely the
thing `impact.subtitle` was written to prevent.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, tabs, stat cards, roster rows, the schedule panel |
| Ink | `--fg` | primary text, primary button, selected weekday pill |
| On-ink | `--on-fg` | the selected pill's and primary button's label |
| Secondary text | `--text-secondary` | stat labels, inactive tabs, roster secondary columns, helper text |
| Muted text | `--text-muted` | breadcrumb, meta line, panel subtitle, column headers, field labels, switch state label |
| Semantic — debt | `--debt` | the in-debt stat, the delete affordance |
| Semantic — pending | `--pending` | the at-capacity bar and value, the missing-document stat, the impact banner |
| Border | `--border` / `--border-strong` | hairlines, the editing session's emphasised edge |
| Belt | `belt_rank.color_hex` via `BeltBar` | the roster's per-student swatch |

**Two ambers.** The canvas renders the capacity/missing-document values in one amber and the impact
banner's text in a slightly darker one. Both are `--pending`; the darker is a text-on-tint variant.
The token layer already audits chip text against its own tint (D12), so use `--pending` for both and
let the audit decide. No D8-retired grey on this artboard.

## Belt

> **▲ D7 — the canvas is not compliant, and the primitive already is.**
> The export's shared belt helper adds a ring **only to the white belt**. Every other belt renders
> fill-only. `BeltBar` in `web/packages/ui/src/primitives/` applies the ring unconditionally with no
> prop to disable it. **Use the primitive.** Do not port the helper's logic; it is the exact
> fill-only pattern D7 forbids, and D12 notes five belts fail across the two modes, not three.
>
> The header's belt-range is drawn as **prose** (`חגורות לבנה–כתומה`), not a swatch. If a later
> iteration adds a visual range here — `4b` already has one — it takes the ring too.

## RTL

- The nav is on the right; the schedule panel sits at the far (left) side of the content row.
- **The panel's divider is a physical `border-right`.** It happens to land correctly in an RTL-only
  canvas and would land on the outer edge in LTR. It must be `border-inline-start`. This is the one
  physical declaration inside `6a`'s own range.
- The **weekday pills** run right-to-left by flex order. Let the container's direction do it; never
  reverse the array.
- **Must not mirror:** times, durations, the capacity ratio, the attendance percentage.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Stat cards, session cards | `Card` | The editing session needs an emphasised variant. |
| Capacity bar | `ProgressBar` | Takes `label`, `value`, `max`, `readout` — the readout slot is the `25/25` text. |
| Roster status chips | `StatusChip` | Pay and document state per row. |
| Impact banner | `Alert` | `tone="pending"`. |
| Buttons | `Button` | Four variants appear. The dashed **add-session** row is not a `Button` variant — it is a feature affordance. |
| Weekday pills | `SegmentedControl` | Single-select, `options` of `{value,label}`. Exact fit. |
| Over-capacity toggle | `Switch` | Takes `stateLabels: {on, off}` — the canvas's visible state label is the primitive's own contract, and D5 requires it. |
| Time / duration / hall fields | `TextField` | **Hall is an enum, not free text.** No select primitive exists among the 18. Finding. |
| Belt swatch | `BeltBar` | See above. |
| Roster row | `StudentRow` | Fits name + belt + one status. The table needs **two** chips and three more columns, so `StudentRow` covers the name cell, not the row. |
| Attendance % column | *feature-specific* | A number with a threshold colour, not `AttendanceMark` (that is a per-session glyph). The threshold logic belongs in `web/packages/core`, not inline — it is duplicated in the export for two different rosters. |
| Tab bar | *gap* | **No `Tabs` primitive exists.** Per-entity tabs recur across the dashboard. Finding. |
| Page header, stat strip | *feature-specific* | Compose `Button` and `Card`. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `קבוצות` (breadcrumb) | — | **No key** — see `3a` finding 5, groups/cycles has none. |
| coach · hall · belt range | `schedule.session.coach`, `.location`, `events.belt.title` | The **composed line has no key**; it must be assembled, not translated as one string. |
| `הודעה לקבוצה` | `comms.announcement.create` (`הודעה חדשה`) | **Cross-namespace (M8)**, wording differs. |
| `שכפול למחזור הבא` | — | **No key.** Cycle duplication is M10's rollover; §5.15's `schedule.year.*` is the nearest family and has no duplicate key. Finding. |
| `הוספת חניך לקבוצה` | `people.enrollment.add` (`רישום לקבוצה`) | Wording differs; the key is the right concept. |
| `חניכים · 25` | `people.student.plural` | The count wrapper has no key. |
| `נוכחות` (tab) | `attendance.roster.title` | exact (M5) |
| `מבחנים` (tab) | `events.exam.plural` (`מבחני חגורה`) | **Cross-namespace (M7)**, wording differs. |
| `הגדרות קבוצה` | — | **No key.** |
| `תפוסה`, `נוכחות ממוצעת`, `בחוב`, `מסמך חסר` | `reports.operational.attendanceRate` is close for one; the other three have **no key**. | Finding. |
| `חניך` / `חגורה` / `נוכחות` / `ותק בקבוצה` / `מצב` | `people.student.one` · `events.belt.rank` · `attendance.roster.title` · — · `people.status.label` | **`ותק בקבוצה` has no key.** |
| `לו״ז שבועי` | `schedule.rules.title` | exact |
| `חל על כל השבועות במחזור` | — | **No key.** The nearest is `schedule.impact.subtitle`, which says something different. |
| `מפגש 1` / `מפגש 2` | — | **No key** for a numbered rule. |
| `א׳`…`ו׳` | `schedule.weekday.0`…`.5` | exact |
| `שעה` | `schedule.rules.startTime` (`שעת התחלה`) | Wording differs. |
| `משך` | — | **No key** — and see the model gap above. |
| `אולם` | `schedule.session.location` (`מיקום`) | Wording differs. |
| `הוספת מפגש שבועי` | `schedule.rules.add` (`הוספת מועד`) | Wording differs. |
| impact sentence | `schedule.impact.*` | **The keys are richer than the artboard.** See above. |
| `מאמן קבוע` | `schedule.session.coach` (`מאמן`) | Wording differs. |
| `שינוי` | — | **No generic "change" key** in `common`. |
| `רישום מעבר לתפוסה` / `חוסם הוספת חניך מעל 25` | — | **No key.** Finding — and there is no capacity field in `schedule`'s key set at all. |
| `כבוי` | `comms.preferences.off` (`כבוי`) | **Cross-namespace (M8).** A generic on/off pair living in comms. Better home: `common`. Finding. |
| `ביטול` | `schedule.impact.cancel` | exact |
| `שמירת לו״ז` | `schedule.rules.title` + a save verb | **No key.** `events.form.save` (`שמירה`) exists in M7. |

## Findings for the lane

1. **The rule model disagrees with the keys.** Artboard says *duration*; `schedule.rules.endTime`
   and `endBeforeStart` say *end time*. Settle in the W2 contract commit.
2. **`schedule.rules.effectiveFrom` has a key and no field.** §5.6 needs the boundary.
3. **The impact preview drops the three "protected" categories and the first-affected date**, all of
   which have keys and all of which E2E-5 exercises. Build the preview from `schedule.impact.*`, not
   from the artboard's one sentence.
4. **No `Tabs` primitive**, and per-entity tabs recur across dashboard pages.
5. **No select/enum control** among the 18, and the hall field needs one.
6. **`כבוי`/`פעיל` live in `comms`.** A generic on/off pair belongs in `common`, which no lane owns.
7. **The belt helper in the export is pre-D7.** Use `BeltBar`.
8. **The attendance threshold logic is duplicated inline** in the export twice. It belongs in `core`.
