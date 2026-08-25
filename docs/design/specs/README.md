# Component specs — the M2–M9 artboards

One file per artboard. A lane developer reads a 100-line spec instead of opening a 300 KB
`.dc.html`, and gets the four things the picture cannot tell them: **which existing primitive each
part is**, **which real i18n key each string uses**, **which token role each colour is**, and
**which lane owns which section**.

> **The canvas is a visual reference only (D10).** No CSS in these specs, no hex values, no copied
> markup. Where a spec names a colour it names a **token role**. Where it names a component it names
> an **existing primitive** in `web/packages/ui/src/primitives/`.

## How to read a spec

Every file has the same seven sections:

| Section | What it gives you |
|---|---|
| **Header table** | Surface · canvas file · wave and lane · i18n namespace · slot |
| **Regions** | The artboard's structure, in order, with nesting |
| **States** | Every state — including **empty, loading and error**, and explicitly noting where the canvas draws none |
| **Tokens by role** | `--ground`, `--fg`, `--text-secondary`, the semantic statuses, belt. Never a hex. |
| **RTL** | Which way things run, and **what must not mirror** |
| **Primitives** | Which of the 18 each part is; which parts are genuinely feature-specific; which are gaps |
| **Strings → keys** | The real key for every string, or an explicit "no key exists" — which is a finding |
| **Findings for the lane** | What the lane has to settle before it builds |

A `▲` line marks a place where **the canvas and what ships differ**. Those are not suggestions.

## The 18 primitives that already exist

`Alert` · `AttendanceMark` · `BeltBar` · `Button` · `Card` · `Checkbox` · `DateRangePicker` ·
`EmptyState` · `MoneyDisplay` · `ProgressBar` · `Radio` · `SegmentedControl` · `StatusChip` ·
`StudentRow` · `Switch` · `TextField` · `ThemeControl` · `Toast`

**Name the primitive. Do not describe a chip from scratch.** Inventing a second status chip is the
failure this whole task exists to prevent.

## The five composite artboards

Five screens are composed of sections owned by **different lanes**. `web/packages/ui/src/slots.ts`
registers five slot ids so a lane adds one file rather than editing a container.

| Slot | Artboards | Container owner |
|---|---|---|
| `student-card` | [`2c`](2c-parent-student-card.md) · [`2d`](2d-staff-student-card.md) · [`4a`](4a-dashboard-student-card.md) | M3 People |
| `roster-row` | [`1c`](1c-staff-roster.md) · [`9f`](9f-staff-attendance.md) | M5 Attendance |
| `alert-centre` | [`6c`](6c-dashboard-alert-centre.md) | M3 People |
| `setup-wizard` | `5c`–`5f` (M1's — out of scope here; see [`12j`](12j-parent-first-registration.md) for the shared step header) | M1 |
| `dev-bar` | §19.4 (M0's) | M0 |

**Each section owns its own empty and error state.** The container owns none of them. Write that into
each wave's contract commit, or every lane will assume the container handles it.

---

## W2 — schedule and people

**M2 Schedule** · [`9a`](9a-staff-today.md) · [`9b`](9b-staff-date-picker.md) ·
[`1d`](1d-staff-today-simple.md) · [`3a`](3a-dashboard-week.md) ·
[`6a`](6a-dashboard-group-page.md) · [`4b`](4b-dashboard-groups.md) ·
[`12b`](12b-parent-child-month.md)

**M3 People & funnel** · [`13a`](13a-parent-landing-mobile.md) ·
[`13b`](13b-parent-trial-confirmed.md) · [`13c`](13c-parent-landing-desktop.md) ·
[`12j`](12j-parent-first-registration.md) · [`12g`](12g-parent-add-sibling.md) ·
[`12i`](12i-parent-profile-leave.md) · [`2c`](2c-parent-student-card.md) ·
[`11b`](11b-staff-trial-intake.md) · [`9c`](9c-staff-student-card-transfer.md) ·
[`9h`](9h-staff-students-search.md) · [`3b`](3b-dashboard-students.md) ·
[`3c`](3c-dashboard-add-student.md) · [`4a`](4a-dashboard-student-card.md) ·
[`6c`](6c-dashboard-alert-centre.md)

## W3 — health and attendance

*Pending.*

## W4 — money, events and belts

*Pending.*

## W5 — communication, reports and privacy

*Pending.*

---

## Out of scope here

- **`4h`** (`ספריית רכיבים`) — M0.3 already ported it into `tokens.css`, `tokens.roles.ts` and the
  18 primitives. It is the source, not a target.
- **`1a` `2e` `9e` `3d` `3f` `5c` `5f`** — M1's, owned by the concurrent W1 session.

---

## Cross-cutting findings

Things that turned up on several artboards at once. Each belongs in a **contract commit**, not in a
lane, because each touches a shared file.

### 1 · The canvas draws belt bars fill-only. The primitive does not.

The export's shared belt helper adds a ring **only to the white belt**. Every other belt renders as
a bare fill, including yellow — the belt D7's own audit names as failing even the 3:1 non-text
threshold — and D12 adds that brown and green fail against the dark ground too. **Five belts across
the two modes, not three.**

`BeltBar` already applies the ring unconditionally, with no prop to disable it, and its own test
asserts it. **Use the primitive; never port the helper.** Affected: `4b` `6a` `9h` `3b` `2c` `4a`
`9c` `12b` `2a` `1c` `9f` `13a` `13c` `1e` `2d`.

### 2 · `#7a766d` is on more artboards than D12 records

D12 notes the retired grey on `4h`'s `בוטל` chip and calls it "one correction to the canvas". It is
on **`3a` twice** (the cancelled indicator and the cancelled block's dot), **`4b` once** (the frozen
row's capacity-bar fill) and **`1e` twice**. `--cancelled` supersedes it everywhere, as D12 says —
but nobody should read D12 as a single-artboard patch.

### 3 · `ChipStatus` does not cover the screens

`StatusChip`'s enum is `debt | paid | pending | cancelled | unmarked | planned`. The artboards also
need: **danger** (`9a`, `3a`, `4b` — an uncovered session, a group needing staffing), **trial**
(`11b`), **standing order** and **three document states** (`3b`, `4a`, `4e`). `StatusChip` is a
shared primitive; **widen it once, in a contract commit**, or six lanes will each add a chip.

### 4 · `AlertTone` has no neutral member

`Alert`'s tones are `danger | pending | paid`. Neutral informational banners appear on `6c` (three
of seven rows), `9c`, `12j` and `3c`. And `6c`'s rows need more than a tone: a **title** distinct
from the body, a **leading icon**, a **trailing meta slot** and an **action slot**.

### 5 · Six primitives are missing, and each is wanted by three or more artboards

| Missing | Wanted by |
|---|---|
| **Chip-select / `FilterChip`** — wrapping, single-select, per-option variants | `13a` `13c` `12a` `12i` `11b` `9h` `3b` `4e` `6c` `1e` |
| **Avatar** (with a no-photo placeholder) | `12i` `11b` `3c` `4a` `2d` |
| **Stepper** — discrete steps, not a linear fill | `3c` `12j` `5c`–`5f` |
| **Single-date field** — `DateRangePicker` is for ranges | `12g` `3c` `12i` |
| **Bottom sheet / modal** | `12i` `9c` |
| **Tabs**, **pagination**, **select/enum**, **icon-only button** | `6a` `3b` `3c` |

### 6 · The app shell's navigation has no i18n keys, anywhere

Not one tab-bar label, in either app, has a key in any of the nine namespaces. Nor do three of
DashNav's eleven items (`קבוצות ומחזורים`, `צוות`, `הגדרות`). G4 forbids inlining them. `common` is
the only namespace no lane owns and is the obvious home — but `web/packages/i18n/index.ts` is
authored once and a lane never edits it, so this has to land in a contract commit.

### 7 · Five artboards show a health declaration that expires. §5.5 says none does.

`health.declaration.noExpiry` reads `ההצהרה תקפה ללא הגבלת זמן`. But `12j` promises an annual
renewal reminder, and `2c`, `9c`, `3b` and `4a` all render a validity date or an "expiring soon"
state. **Five screens against one key.** Either §5.5 is wrong or five artboards are; this is not a
per-spec patch.

### 8 · Hebrew gender and person are product decisions, not translation ones

`attendance.roster.*` and `people.status.*` are written in the masculine. Parent-facing screens
address a named child, often a girl (`נכחה`, `הצטרפה`), and `4b`'s group statuses are feminine
(`פעילה`, `מוקפאת`). Separately, `הודעתם מראש` (the parent's own screen, second person) and
`הודיעו מראש` (staff, third person) **cannot share one key**.

### 9 · Generic strings live in feature namespaces

`ביטול` is in `schedule`. `מופעל`/`כבוי` are in `comms`. `ייצוא` is in both `attendance` and
`reports`. `החודש` is in `reports` and wanted by `schedule`. Each is a generic control label and
belongs in `common`.

### 10 · The canvas export's token values are not the token layer's

Three values in the dark frames differ from `tokens.css`: the canvas's dark ink, its dark success
green, and several borders drawn as translucent ink rather than `--border`/`--border-strong`. **The
token layer is authoritative** — D12 corrected the dark `--paid` deliberately, to remove a collision
with `4h`'s green belt. Never read a hex out of the export.

### 11 · Three business rules exist only in a mockup

A **10% sibling discount** applied automatically (`12g`, `3c`), a **scholarship / no-charge plan**
(`3c`), and **belt-gated group eligibility** (`3c`). None has a key, a §5.10 or §5.4 line, or a
model column.

### 12 · "Message the coach" is the cut feature wearing a different hat

D9.1 removed `שיחה עם המשרד` from `2b` because §2.3 has no in-app two-way chat and §5.11 permits
push plus a one-way inbox. `הודעה למאמן` appears on `12b` and `2c`; `הודעה להורה` on `4a`; a
`הודעה` quick action on `2d`. **Settle once, before M3, M5 or M8 builds any of them.**
