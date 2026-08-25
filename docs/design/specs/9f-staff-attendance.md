# `9f` — נוכחות · the register, with the parent's advance notice **(composite)**

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames: light and dark** |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W3 · **container owned by M5 Attendance** |
| **i18n namespace** | `attendance`, with `health` and `events` filling the row |
| **Slot** | **`roster-row`** — see [`1c`](1c-staff-roster.md#ownership--the-roster-row-part-by-part) |

The same screen as [`1c`](1c-staff-roster.md), one iteration on, with the parent's advance notice
made explicit. **Read `1c`'s spec first** — the row anatomy, the four mark states, the slot ownership
and the token roles all carry over. This spec records what `9f` adds and what it gets wrong.

The two frames are light and dark. **Identical structure and identical logic; only the theme differs.**

## What `9f` adds over `1c`

1. **An advance-notice hint row**, between the header and the bulk bar: an inbox icon and one line
   saying how many parents pre-reported, and that those students are **marked automatically**.
2. **A footer helper line** stating attendance can be corrected at any time, even after saving —
   `attendance.roster.editAnytime` exists for exactly this.
3. **A per-row note line** whose text depends on state: the excuse note when notified, the health
   flag when flagged, and "not marked" otherwise.

## The bulk action overwrites the parent's report

> **▲ This is the finding, and it is a correctness bug, not a copy problem.**
>
> The `סמן הכל נוכח` button sets **every** roster entry to present, unconditionally. It does not
> special-case a notified/excused entry. As drawn, one tap silently discards every parent's advance
> notice — the very signal the hint row above it just announced.
>
> `attendance.source.preReportedHint` reads:
> `ההורה דיווח מראש. סימון קבוצתי לא ידרוס את הדיווח` — *a bulk action will not overwrite the report*.
> §10.5 protects it. **The copy that ships and the behaviour drawn are opposites.**
>
> The bulk action must skip pre-reported marks, and the button's own copy should say so.

## States

Mark states, both frames, identical to `1c`'s four — with `9f`'s clearer rendering:

| State | Shape | Distinguishes it from |
|---|---|---|
| **present** | filled square, check | — |
| **absent** — the coach marked it | **filled** square, white cross | notified: filled vs outline |
| **notified** — the parent reported it | **outline** square, thinner cross, no fill | absent: fill; unmarked: solid vs dashed |
| **unmarked** | **dashed** outline, a dot | notified: dashed, and a dot not a cross |

Absent and notified both use a cross. **Fill is the only thing separating "they didn't come" from
"they told us they wouldn't come".** That is a strong enough distinction to keep and a weak enough
one to lose in a careless port.

| Screen state | What renders |
|---|---|
| **Empty / loading / error** | **Not drawn**, either frame. |
| **Offline / sync / stale** | **▲ Not drawn at all** — no offline glyph, no pending-sync text, no staleness label. `1c` draws all three. `9f` is the later iteration and **lost them.** Since this is the screen a coach uses in a basement, that is the wrong direction. |
| **Conflict** | **Not drawn.** `attendance.conflict.*` has nine keys. |

## Tokens by role

Same roles as [`1c`](1c-staff-roster.md#tokens-by-role). Two notes specific to `9f`:

- The **health flag icon** uses `--pending`, the same role as the notified and unmarked marks. On a
  row that is both flagged and unmarked, two different meanings render in one colour. Worth a look.
- **The dark frame's secondary grey is a D8 dark-mode-only token** and is legal there (G11).
  `#8f8b82` and the retired `#7a766d` appear nowhere in either frame.

> **▲ D7 — the export's belt helper rings only white.** Six of seven belts are bare fills, yellow
> among them. `BeltBar` rings unconditionally. Use the primitive.

## RTL

- Row order is mark → name/note → belt by DOM order plus `dir` — the mark at the reading start, the
  belt at the end. **The mirror of an LTR checkbox-on-the-left roster.** Build it with logical flex,
  never a hard-coded side.
- The **back chevron** points right, correct for RTL, and is directional.
- The footer puts the helper text at the flexible start and the finish button at the end — logical.
- **Must not mirror:** the session time and date, the three counts, the advance-notice count.
- Numerals use tabular figures throughout. Keep that.

## Primitives

Same as [`1c`](1c-staff-roster.md#primitives). `9f` adds one part:

| Part | Primitive | Notes |
|---|---|---|
| Advance-notice hint row | `Alert` | `tone="pending"`, with `iconLabel`. Plain icon + text — no trailing badge, so unlike `1c`'s sync banner it fits `Alert` as it stands. |
| Footer helper line | — | Plain secondary text. Not `Alert`, not `Toast`. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `ג׳ודו / מתחילים` | Data | |
| `א׳ 23.08 · 17:00 · אולם א׳` | composed | **No key** — same as `1c`. |
| `נוכחים` / `חסרים` / `לא סומן` | `attendance.roster.present` / `.absent` / `.unmarked` | The first two are pluralised on screen and singular in the keys. |
| `2 הורים דיווחו היעדרות מראש — מסומן אוטומטית` | `attendance.source.preReported` (`הודיעו מראש`) + `source.preReportedHint` | **The sentence has no key**, it interpolates a count, and **its second half — "marked automatically" — is a behaviour claim** that needs to be true. It also sits directly above the button that undoes it. |
| `סמן הכל נוכח` | `attendance.roster.markAllPresent` (`סימון כולם כנוכחים`) | Wording differs. **And see the finding above** — if the action skips pre-reported marks, the label should say so. |
| `ניתן לתקן נוכחות בכל זמן — גם אחרי שנשמרה` | `attendance.roster.editAnytime` (`אפשר לערוך את הנוכחות בכל זמן`) | Near-exact. The "even after saving" clause is the part the key drops, and it is the reassuring half. |
| `סיום` | — | **No key.** |
| row note — `הודיעו מראש` | `attendance.source.preReported` | exact |
| row note — `הצהרת בריאות חסרה` | `health.badge.missing` | exact, **cross-namespace (M4)**, via the slot. |
| row note — `לא סומן` | `attendance.roster.unmarked` | exact — **and it is reused as both a tile label and a row note.** Two different jobs, one key. Check that it reads correctly in both. |

## Findings for the lane

1. **▲ The bulk action overwrites the parent's advance notice**, contradicting
   `attendance.source.preReportedHint` and §10.5. **The correctness bug on this artboard.**
2. **`9f` lost `1c`'s offline, sync and staleness indicators** — and it is the later iteration.
   Whichever screen ships must keep all three; §10.1 has four network states and §6.5 makes a stale
   queue block.
3. **The advance-notice line makes a claim ("marked automatically") that the bulk button breaks.**
4. **Absent and notified differ only by fill.** Preserve it.
5. **The health flag and the unmarked mark share `--pending`** on the same row.
6. **`attendance.roster.unmarked` does two jobs** — a count tile's label and a row's note.
7. **None of §10.5's conflict states is drawn.**
