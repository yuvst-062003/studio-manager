# `9h` — חניכים · the staff search tab

| | |
|---|---|
| **Surface** | Staff app · 390×844 |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `health` for the banner |
| **Slot** | none |

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — title, then a search field (leading magnifier + placeholder).
3. **Filter chip row** — three chips: `הכיתות שלי · 3` (active) · two group names.
4. **Roster region**
   1. A **health warning banner** — icon + one line naming a count of students missing a declaration.
   2. A section label: group name · headcount.
   3. Student rows.
5. **Tab bar** — four tabs, `חניכים` active.

## States

| State | What renders |
|---|---|
| **Search — empty** | Drawn: placeholder, magnifier. |
| **Search — typed** | **Not drawn**, and **no clear (×) affordance exists** in the markup. |
| **Search — focused** | **Not drawn.** No focus ring, no border change. |
| **No results** | **Not drawn — and this is a search screen.** `people.student.emptyFiltered` exists for exactly this. Use `EmptyState`. |
| **Empty roster** | **Not drawn.** `people.student.empty` exists. |
| **Loading** | **Not drawn.** The placeholder-count is a prototyping cue. |
| **Error** | **Not drawn.** |
| **Filter chips** | Selected (thicker border, medium weight) and unselected. Apparently single-select. |

## Row anatomy

Leading to trailing: **belt swatch · name over `belt name · tenure` · attendance percentage · chevron.**
The whole row is a tap target into the student card.

The **attendance percentage is threshold-coloured**: ink at 80% and above, `--pending` from 70 to 79,
`--danger` below 70. That logic is **duplicated inline in the export for two different rosters** and
belongs in `web/packages/core`, not in a component — it is the same rule `6a` and `4c` apply.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the search field, the tab bar |
| Ink | `--fg` | title, active tab, high attendance, the active chip's outline |
| Secondary text | `--text-secondary` | the placeholder, row sublines |
| Muted text | `--text-muted` | the section label, inactive tabs, inactive chips |
| Semantic — warning | `--pending` (+ tint) | the health banner and the mid-range attendance figure |
| Semantic — danger | `--danger` | low attendance only |
| Border | `--border` / `--border-strong` | dividers, the field's edge, chip outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | the row swatch |

No D8-retired grey.

> **▲ D7 — the export's shared belt helper rings only the white belt.** Six of seven belts render
> fill-only, including yellow. `BeltBar` rings unconditionally with no opt-out and its own test
> asserts it. Use the primitive.
>
> **A second belt gap:** two rows in the underlying data carry **bi-colour belt names**
> (`לבנה–צהובה`, `צהובה–כתומה`) and the export's helper takes a single colour key, so those rows
> render as one flat colour. `BeltBar` takes `colorHex` **and** `secondaryColorHex` — the data model
> already supports it (`events.belt.biColor`, `belt.secondaryColor`). Pass both.

## RTL

- The **magnifier sits at the field's reading start** (the right), the placeholder flowing from it.
- The row **chevron** sits at the reading end and is directional.
- **The tab bar's visual order runs right-to-left**: the first tab is rightmost. The active tab is
  second from the right — not "second from the left". Anything positioning a tab indicator must use
  logical offsets.
- **Must not mirror:** the percentages, the counts in the chip and the section label.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Search field | `TextField` | Needs a **leading-adornment** slot and a **clear** affordance, neither of which this artboard draws. Its `label`/`hint`/`error` props cover the rest. |
| Student row | `StudentRow` | Close: belt + name + subline + tap. It takes an optional `status` chip; **this row's trailing element is a threshold-coloured number, not a chip.** Either `StudentRow` gains a trailing slot or the row is a feature composition. |
| Belt swatch | `BeltBar` | With `secondaryColorHex` for bi-colour ranks. |
| Health banner | `Alert` | `tone="pending"`, with `iconLabel`. |
| No-results state | `EmptyState` | `title`, `description`, `action`. Not used by the artboard; needed. |
| Filter chips | *gap* | Three pills, one active, one carrying a count. `SegmentedControl` renders one connected track; these are separate pills and one has a live count in its label. Fifth artboard wanting a `FilterChip`. |
| Tab bar | *app shell* | |
| Section label | — | Plain type. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חניכים` (title and tab) | `people.student.plural` | exact |
| `חיפוש לפי שם חניך או הורה` | `people.student.search` (`חיפוש חניך`) | **Wording differs and so does the scope** — the artboard searches parents too. §5.4's matching is on a guardian's verified phone or email, so searching by parent is right. The key is too narrow. |
| `הכיתות שלי · 3` | — | **No key**, and it is a coach-scoped filter (§3.2: a lead coach sees their own groups). `comms.audience.limitedToOwnGroups` is the nearest and it is a different sentence in a different namespace. Finding. |
| group names in chips | — | Data. |
| `2 חניכים עם הצהרת בריאות חסרה` | `health.badge.missing` (`הצהרת בריאות חסרה`) | **Cross-namespace (M4).** The label exists; **the count wrapper does not.** |
| `ג׳ודו / מתחילים · 25` | `people.student.group` | The composed label with a headcount has no key. |
| `ירוקה · 5 חודשים` | `events.belt.rank` + — | The belt name is `belt_rank` data. **Tenure has no key** — same gap as `6a`'s `ותק בקבוצה`. |
| `92%` | `reports.operational.attendanceRate` labels the concept | The bare figure is data; the **label is not drawn**. |
| Tab labels | — | **No keys, in any namespace.** See [`9a`](9a-staff-today.md) finding 3. |

## Findings for the lane

1. **A search screen with no no-results state**, and `people.student.emptyFiltered` already exists.
2. **No clear affordance and no focus state** on the search field.
3. **`people.student.search` is narrower than the screen** — the placeholder searches parents too.
4. **Bi-colour belts render as one colour** in the export. `BeltBar` takes both.
5. **The attendance threshold rule is duplicated inline**, here and on two other artboards.
   It belongs in `core`.
6. **"My classes" has no key**, and it is the §3.2 scoping filter.
7. **No `FilterChip` primitive** — fifth artboard.
8. **Tenure has no key**, second artboard.
