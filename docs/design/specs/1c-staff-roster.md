# `1c` — נוכחות בשיעור · taking the register **(composite)**

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **light and dark** |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W3 · **container owned by M5 Attendance**; the row's parts owned by three lanes |
| **i18n namespace** | `attendance`, with `health` and `events` filling the row |
| **Slot** | **`roster-row`** (`web/packages/ui/src/slots.ts`) |

The screen a coach uses on the mat. It is the reason the offline queue exists.

## Ownership — the roster row, part by part

Leading to trailing, in DOM order (so leading = the reading start, the right):

| Part | Owner | How it gets there |
|---|---|---|
| **Row shell** — the tap target, the divider, the cycling interaction | **M5 Attendance** | the container |
| **Attendance mark** | **M5 Attendance** | the container |
| **Health flag icon** — a warning triangle, icon only, no text | **M4 Health** | a `roster-row` slot entry |
| **Name** | **M5**, from M3's data | the container |
| **Note line** — conditional | **M5** | the container |
| **Belt bar** | **M7 Events & belts** | a `roster-row` slot entry |

This is exactly the M4 ∥ M5 pairing `slots.ts` was written for: **the health badge on the attendance
lane's roster row is a health-lane file registering into a slot, not a health-lane edit to an
attendance-lane file.**

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Session header** — back chevron · session title · `weekday · time · hall`, then a row of
   **three count tiles** (present · absent · unmarked), then a **sync banner**.
3. **Bulk bar** — one full-width button: mark everyone present.
4. **Roster list** — scrollable.
5. **Footer bar** — a persistent sync status line, and a finish button.

## States

**The attendance mark has four states and the whole row cycles them on tap:**

| State | Shape |
|---|---|
| **present** | filled square, check glyph |
| **absent** | filled square, cross glyph |
| **notified** | **outline** square, a thinner cross |
| **unmarked** | **dashed outline** square, a dot |

Solid-fill → solid-outline → dashed-outline is a deliberate progression, and the two amber states
(notified and unmarked) are distinguished **only by solid vs dashed and cross vs dot**. Keep both
distinctions; merging them loses §5.14's rule that an unmarked session is not an absence.

| Screen state | What renders |
|---|---|
| **Empty roster** | **Not drawn.** `attendance.roster.empty` exists. |
| **Loading** | **Not drawn.** The placeholder-count is a prototyping cue. |
| **Error** | **Not drawn.** |
| **Offline** | The header's sync banner and the footer's status line. |
| **Conflict** | **Not drawn**, and `attendance.conflict.*` carries nine keys for §10.5's cross-actor cases. |
| **Stale queue** | **Not drawn**, and `attendance.sync.staleWarning` / `staleBody` / `staleAction` exist — §6.5 makes a stale queue **block**, because iOS cannot guarantee the eviction exemption. |

## Tokens by role

Both themes are drawn. Roles are identical; only values differ.

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the count tiles |
| Ink | `--fg` | primary text, the bulk button's fill, the finish button's border |
| On-ink | `--on-fg` | the bulk button's label |
| Secondary text | `--text-secondary` | the session meta, the footer status |
| Semantic — present | `--paid` | the present mark, the present tile |
| Semantic — absent | `--debt` / `--danger` | the absent mark, the absent tile |
| Semantic — notified / unmarked / health flag | `--pending` | both outline marks, the unmarked tile, the health triangle |
| Border | `--border` | dividers |
| Belt | `belt_rank.color_hex` via `BeltBar` | the trailing bar |

> **▲ The export's dark values are not the token layer's, in two places.**
> The canvas's dark ink and dark success green are both **different from `tokens.css`**, and D12
> changed the dark `--paid` **deliberately** — the canvas's green is `4h`'s green belt, and D3
> requires belt colours stay distinct from semantics. **The token layer is authoritative. Never read
> a hex out of the export.** Borders in the export are also drawn as translucent ink rather than
> `--border` / `--border-strong`; use the tokens.

**No D8-retired grey appears in the light frame.** One appears in the dark frame and is legal there
(G11 makes it dark-mode-only).

**Two tint tokens are missing.** The count tiles need a `--paid` tint and a `--pending` tint;
`tokens.css` defines `--debt-tint`, `--cancelled-tint` and `--danger-tint` and no others. Finding.

## Belt

The row's belt element is **fully templated in the export** — no literal fill, border or shadow. **Do
not conclude from that silence that the canvas is fill-only or that a ring is present.** D7 applies
regardless: `BeltBar` carries `box-shadow: inset 0 0 0 var(--belt-ring-width) var(--belt-ring)`
unconditionally, with no prop to disable it, and its test asserts it. Use the primitive.

## RTL

- The row's **mark → name → belt** order comes from DOM order plus `dir`, with no manual positioning.
  Good; keep it logical.
- The header **back chevron** points right, correct for RTL, and is directional.
- The sync/refresh icon and the warning triangle are **not** directional.
- **Must not mirror:** the session time, the three counts, the sync count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Attendance mark | `AttendanceMark` | `AttendanceState` is exactly `present \| absent \| notified \| unmarked`, and its four glyphs match the export's four. Direct fit; takes a `label`. |
| Belt bar | `BeltBar` | `colorHex`, `label`, `secondaryColorHex`. |
| Buttons | `Button` | The bulk button and finish. |
| Sync banner | `Alert` + a trailing badge | `Alert` is icon + one body. **The banner has a trailing "offline" pill `Alert` has no slot for**, and `ChipStatus` has no offline member either. Finding. |
| Count tiles | `Card` + feature content | `Card`'s caption sits above its content; the tile is number-then-label with a semantic border. A feature composition on `Card`. |
| **Roster row** | ***not* `StudentRow`** | `StudentRow`'s order is belt → name/group → `StatusChip`. **This row is mark → flag + name + note → belt, with no chip.** That mismatch is precisely why `roster-row` is a slot rather than a prop. Build the composite; borrow `StudentRow`'s `<bdi>`-wrapped name. |
| Health flag | *M4's, via the slot* | Icon only. |
| Header, footer | *feature-specific* | |

**No accessible name appears on any icon-only element in the export** — the back chevron, the health
flag, the marks, the belt. `AttendanceMark` and `BeltBar` both **require** a `label` prop and `Alert`
requires `iconLabel`; those contracts close the gap, so honour them.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `ג'ודו / מתחילים` | `people.student.group` | Data. |
| `יום א' · 17:00 · אולם א'` | `schedule.session.at`, `.location` | Composed; **no key.** |
| `נוכחות` | `attendance.roster.present` (`נוכח`) | The tile's plural label has no key. |
| `חסרים` | `attendance.roster.absent` (`נעדר`) | Wording differs — plural. |
| `לא סומן` | `attendance.roster.unmarked` | exact |
| `3 שיעורים ממתינים לסנכרון` | `attendance.sync.pendingCount` (`{{count}} סימונים ממתינים לסנכרון`) | **Unit mismatch** — the key counts *marks*, the banner counts *sessions*. Third artboard with this (see `9a`, `1d`). **Pick one unit and make the copy true.** |
| `לא מקוון` | `attendance.network.offline` | exact |
| `סמן הכל נוכח` | `attendance.roster.markAllPresent` (`סימון כולם כנוכחים`) | Wording differs. |
| `נשמר מקומית · יסונכרן בחיבור` | `attendance.network.offlineHint` (`הסימונים נשמרים במכשיר ויסונכרנו כשהחיבור יחזור`) | Same intent, shorter. |
| `סיום` | — | **No generic finish key.** |
| per-row note — pre-reported | `attendance.source.preReported` | exact |
| per-row note — health flag | `health.badge.missing` | **Cross-namespace (M4)**, correctly — it arrives through the slot. |

## Findings for the lane

1. **The bulk action must not overwrite a pre-reported mark.** `attendance.source.preReportedHint`
   says `סימון קבוצתי לא ידרוס את הדיווח` and §10.5 protects it. See [`9f`](9f-staff-attendance.md)
   finding 1 — the sibling artboard's bulk action, as drawn, **does** overwrite it.
2. **None of §10.5's conflict states is drawn**, and `attendance.conflict.*` has nine keys.
3. **The stale-queue block is not drawn**, and §6.5 makes it a block, not a warning.
4. **The sync count's unit disagrees with its key.** Third artboard.
5. **`Alert` has no trailing-badge slot** and `ChipStatus` has no offline member.
6. **`--paid` and `--pending` have no tint tokens** and the count tiles need both.
7. **The row is not `StudentRow`.** Build the `roster-row` composite; do not bend the primitive.
8. **Never read a hex from the export's dark frame.** Two of its values contradict `tokens.css`,
   and D12 changed one of them on purpose.
