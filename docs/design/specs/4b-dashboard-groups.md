# `4b` — קבוצות ומחזורים · the groups table

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** |
| **i18n namespace** | `schedule` |
| **Slot** | none |

The list `6a` drills into. Flat rows, hairline dividers, no cards, no zebra.

## Regions

1. **DashNav** — imported, `active="groups"`. See [`3a`](3a-dashboard-week.md#dashnav--the-shared-shell).
2. **Header bar** — title + subtitle (group count · cycle) · spacer · secondary button · primary button.
3. **Column-header row** — six labels: group · coach · weekly schedule · belt range · capacity · status.
4. **Row list** — six rows, each the same six cells. The whole row is a click target into `6a`.

There are **no filters, no search, no sort and no pagination** on this artboard — unlike `3b`,
the students table, which has all four. Whether that is deliberate for a nine-row list or an
omission is a decision, not an inference.

## States

Per row, the two cells that carry state:

| Cell | States drawn |
|---|---|
| **Coach** | a name · **"no coach"** in danger, medium weight · **an em dash** on the frozen row. Two different empty states, and they mean different things — one is an alarm, one is a neutral placeholder. Keep both. |
| **Status** | active · full · needs staffing · frozen. The frozen row also strikes through the group name. |

| Screen state | What renders |
|---|---|
| **Empty** | **Not drawn.** A studio before its first group. Use `EmptyState`. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn.** |

The subtitle claims nine active groups and six rows are drawn. That is a mock shortcut, not a
truncation affordance — there is no "show more".

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header bar, rows |
| Ink | `--fg` | primary text, the primary button's fill, the default capacity fill |
| Secondary text | `--text-secondary` | coach, schedule, capacity ratio, the struck-through frozen name |
| Muted text | `--text-muted` | subtitle, column headers |
| Semantic — active | `--paid` | the active chip |
| Semantic — full | `--pending` | the full chip **and the capacity bar's fill when at capacity** |
| Semantic — needs staffing | `--danger` (+ `--danger-tint`) | the chip and the "no coach" text |
| Semantic — frozen | `--cancelled` (+ `--cancelled-tint`) | the frozen chip |
| Border | `--border` / `--border-strong` | dividers, the secondary button's outline |
| Belt | `belt_rank.color_hex` via `BeltBar` | the belt-range strip |

> **▲ D8/D12 — a second instance of the retired grey.**
> The frozen row's **capacity bar fill** is drawn in `#7a766d`. D12 records that correction only for
> `4h`'s `בוטל` chip; `3a` carries two more and this is a third. D8 retires the value outright and
> does not qualify by usage, so a progress fill is covered. Use `--cancelled`.

## Belt range — how it is drawn

Not one continuous bar. A **strip of discrete swatches**, one per belt in the group's range, tightly
gapped, in ascending order — two or three segments per row.

> **▲ D7 — the canvas rings only the white segment, and even that ring is a translucent ink, not
> the solid foreground colour D7 specifies.** Yellow, orange, green, blue, brown and black carry no
> ring at all, and yellow — the belt D7's own audit names as failing even the 3:1 non-text threshold —
> appears unringed in three of six rows. `BeltBar` applies the ring unconditionally. Use it.

## Capacity — how it is drawn

**A bar and a number, side by side.** A thin rounded track filled to `enrolled / capacity`, plus a
tabular-numeric `enrolled/capacity` label. No percentage. The fill's colour is status-dependent:
ink normally, `--pending` at capacity, `--cancelled` when frozen.

## RTL

- The nav is on the right. Everything inside the row uses flex + `gap` and fixed cell widths —
  **no physical property appears inside `4b`'s own range**, which makes it the cleanest dashboard
  artboard on that count.
- **The belt strip's ascending order reverses correctly under `dir`.** Let the container do it;
  never hard-code `row-reverse` or reverse the array.
- **Must not mirror:** times, the capacity ratio, the cycle label.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Toolbar buttons | `Button` | `secondary` for duplicate-cycle, `primary` for new-group. |
| Status chips | `StatusChip` | active → `paid`, full → `pending`, frozen → `cancelled`. **Needs-staffing has no member** — the same `ChipStatus` gap as `9a` and `3a`. |
| Capacity | `ProgressBar` | `label` + `value` + `max` + `readout` (the ratio text). |
| Belt range | `BeltBar` | D7's "belt progression segments" case, named in the decision. |
| Group row | *feature-specific* | `GroupRow`, composing the above. **Not `StudentRow`** — these are groups. |
| Page shell, column headers | *feature-specific* | A flat table composition. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `קבוצות ומחזורים` | — | **No key.** Same gap as `3a`'s nav item. Finding. |
| `9 קבוצות פעילות · מחזור 2026/27` | `schedule.year.*` is the cycle family | **No key** for the composed subtitle or the group count. |
| `שכפול מחזור` | — | **No key.** Cycle duplication — see `6a` finding. |
| `קבוצה חדשה` | — | **No key.** `people.enrollment.add` is enrolment, not group creation. |
| `קבוצה` | `people.student.group` (`קבוצה`) | exact, though it lives in `people` |
| `מאמן` | `schedule.session.coach` | exact |
| `לו״ז שבועי` | `schedule.rules.title` | exact |
| `טווח חגורות` | `events.belt.rank` / `belt.rankPlural` | **Cross-namespace (M7)**, and there is no *range* key. |
| `תפוסה` | — | **No key.** See `6a`. |
| `מצב` | `people.status.label` (`סטטוס`) | Wording differs; and this is a *group's* status, not a student's — a different enum. |
| `פעילה` | `people.status.active` (`פעיל`) | Gendered form differs (feminine for a group). **Hebrew gender is a real problem here** — `people.status.*` is written for a student. A group needs its own status set. Finding. |
| `מלאה` | — | **No key.** |
| `דרוש שיבוץ` | `schedule.session.noCoach` | Wording differs; the concept matches. |
| `מוקפאת` | `people.status.frozen` (`מוקפא`) | Gender again. |
| `ללא מאמן` | `schedule.session.noCoach` | Wording differs. |
| `—` (frozen coach cell) | — | Not copy. But it must be an accessible label, not a bare dash. |

## Findings for the lane

1. **`#7a766d` again**, in the frozen capacity bar. Third instance across the dashboard export.
2. **Group status needs its own key set.** `people.status.*` is a student's funnel state and is
   grammatically masculine; a group's status is feminine in Hebrew and has different members
   (active · full · needs-staffing · frozen). Reusing `people.status.*` produces wrong Hebrew.
3. **`ChipStatus` has no danger member**, and needs-staffing is one. Third artboard to hit this.
4. **The two coach empty states are different** and both must survive.
5. **No filters, search, sort or pagination**, unlike `3b`. Decide, do not infer.
6. **The belt strip is pre-D7 in the export.** Use `BeltBar`.
