# `9c` — כרטיס חניך ומעבר כיתה · lead-coach only

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames** |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `attendance` and `health` |
| **Slot** | `student-card` — see [`2c`](2c-parent-student-card.md) and [`2d`](2d-staff-student-card.md) |

Frame 1 is a coach's student card. Frame 2 is the class-transfer sheet it opens. A screen and its
triggered sheet, not two independent states.

## Regions

**Frame 1** — device chrome · header (back chevron · belt accent · name · `belt · class · age`) ·
scroll: an attendance-history card (8 marks + a summary caption) · a health-declaration status row
(display only) · a card of two action rows (contact, add a note) · a **visually emphasised
class-transfer card** · a caption explaining the permission · footer: a payment-visibility caption.

**Frame 2** — a blurred rendering of frame 1 · a scrim · a bottom sheet: drag handle · title ·
an explainer · `מכיתה` and a read-only current-class card · a divider arrow · `לכיתה` and two radio
options · a notification note · footer: cancel + confirm.

## Permission — how the gate is drawn

The transfer card is **fully visible and fully enabled**, with a heavier border than its neighbours
and a trailing chevron. It is **not** disabled-with-a-tooltip. The caption underneath states the
rule outright:

> `מאמן שאינו ראשי בכיתה זו לא יראה את הפעולה הזו כלל.`

**The design intends conditional rendering, not a disabled state.** Render the whole card behind the
lead-coach check. And note the footer's second statement — `מאמנים אינם רואים נתוני תשלום` — which is
§3.2 written on the screen. [`2d`](2d-staff-student-card.md) enforces the same rule by *omission*;
`9c` states it. Both are defensible; pick one and be consistent, because a coach who sees the
sentence on one card and not the other will wonder what changed.

## States

| State | What renders |
|---|---|
| **Attendance marks** | Templated. The card's caption is the only summary. |
| **Health row** | Display-only — no pointer, no chevron. Coaches cannot open the declaration, which is G7 working correctly. |
| **Transfer options** | One selected (2px ring + filled dot), one unselected. |
| **Class at capacity** | **Not drawn.** Both options show a capacity ratio and neither is at it, so there is no "this class is full" state — and the current class *is* at 25/25. |
| **Empty / loading / error** | **Not drawn** anywhere. |
| **Confirm — in flight** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | frame 1 |
| Surface | `--surface` | cards, the sheet |
| Ink | `--fg` | primary text, the transfer card's emphasised border, the confirm fill, the selected radio |
| On-ink | `--on-fg` | the confirm button's label |
| Secondary text | `--text-secondary` | subtitles, captions, icon strokes |
| Muted text | `--text-muted` | card eyebrow labels, `מכיתה`, `לכיתה` — **at D8's floor** |
| Semantic — declaration valid | `--paid` | the health icon and its status pill |
| Scrim | *no token* | Same gap as [`12i`](12i-parent-profile-leave.md). |
| Belt | `belt_rank.color_hex` via `BeltBar` | the header accent |

No D8-retired grey.

> **▲ D7 — the header's belt accent is fill-only.** It is a narrow **vertical** bar, unlike the
> horizontal strips elsewhere. D7 covers *every* fill of `belt_rank.color_hex`, not only the three
> the audit measured — D12 says five fail across the two modes. `BeltBar` rings unconditionally;
> confirm it supports this orientation, and if not, add the variant rather than drawing a bare bar.

## RTL

- The header **back chevron** points right and the transfer card's **disclosure chevron** points left
  — both correct for RTL, both directional.
- **Must not mirror:** the phone number, the validity date, the capacity ratios, the times.
- **None of the numeric runs carries bidi isolation in the export.** A phone number with dashes and a
  ratio with a slash both reorder badly inside RTL text. Wrap them.
- The sheet's bottom anchoring and the header's icon/text ordering are physical in the export.
  Translate to logical (D10).

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| The four cards, the sheet's read-only current class | `Card` | |
| 8 attendance marks | `AttendanceMark` | Matches the templated loop exactly. |
| Health status pill | `StatusChip` | |
| Belt accent | `BeltBar` | See above. |
| Transfer options | `Radio` | The option's title + schedule/capacity subtitle is feature content around it. |
| The notification note | `Alert` | The closest of the 18. It is neutral, so confirm `Alert` has a plain informational rendering — `AlertTone` is `danger \| pending \| paid` and **none of them is "neutral"**. Finding. |
| Cancel / confirm | `Button` | `secondary` and `primary`. |
| Contact row, add-note row, the transfer card | *feature-specific* | Icon + label + pointer. **Not `StudentRow`** — that lists students; these are actions within one student's card. No nav-row primitive exists. |
| Header block | *feature-specific* | |
| **Bottom sheet chrome** | *gap* | **No sheet or modal primitive among the 18.** Also wanted by [`12i`](12i-parent-profile-leave.md). Confirm none exists elsewhere in `web/packages/ui` before building. |
| Icon-only back button | *gap* | `Button`'s variants are `primary \| secondary \| ghost \| destructive` — none obviously icon-only. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חגורה ירוקה · ג׳ודו / מתחילים · גיל 10` | `events.belt.rank`, `people.student.group`, `people.student.age` | The composed subtitle is data across three namespaces. |
| `8 המפגשים האחרונים` | — | **No key**, same as [`2c`](2c-parent-student-card.md). |
| `92% נוכחות החודש · היעדרות אחת דווחה מראש על ידי ההורה` | `reports.operational.attendanceRate` + `attendance.source.preReported` | **The composed sentence has no key.** It also spells one count as a Hebrew word (`אחת`), which no interpolation can produce. Finding. |
| `הצהרת בריאות` | `health.declaration.title` | exact |
| `בתוקף 09.2026` | — | **▲ No key, and it shows an expiry.** `health.declaration.noExpiry` says declarations do not expire. **Third artboard with this contradiction** — after `12j` and `2c`. |
| `מיכל כהן · 054-470-5745` | `people.guardian.one`, `people.student.phone` | Data. |
| `הוספת הערת מאמן` | `attendance.roster.addNote` (`הוספת הערה`) | **Cross-namespace (M5)**, wording differs. |
| `מעבר כיתה` | `people.enrollment.moveGroup` (`מעבר קבוצה`) | **`כיתה` vs `קבוצה`.** The artboard says *class*, the key says *group*, and §4.3 has both concepts. Finding. |
| `אתה המאמן הראשי של …` | — | **No key**, and it is second-person masculine. |
| `מאמן שאינו ראשי בכיתה זו לא יראה את הפעולה הזו כלל.` | — | **No key.** §3.2's rule as user-facing copy. |
| `מאמנים אינם רואים נתוני תשלום.` | — | **No key.** Same. |
| `המעבר נכנס לתוקף מהמפגש הקרוב. המחיר אינו משתנה.` | — | **No key**, and **the price claim is a billing statement on a people screen.** §5.10 versions plans and prorates; "the price does not change" may or may not hold when the target class has a different plan. Finding. |
| `מכיתה` / `לכיתה` | `people.enrollment.moveGroup` is the action | The from/to labels have no keys. |
| `א׳ 17:00 · ד׳ 17:00 · 25/25` | composed | Data. |
| `מיכל כהן תקבל הודעה על המעבר מיד לאחר האישור.` | — | **No key**, feminine-inflected, and it promises a notification with no `comms.preferences.kind.*` member for a class transfer. Finding. |
| `ביטול` | `schedule.impact.cancel` | Cross-namespace; belongs in `common`. |
| `העברה מהמפגש הקרוב` | — | **No key.** |

## Findings for the lane

1. **▲ A third expiry contradiction.** `בתוקף 09.2026` against `health.declaration.noExpiry`.
   Three artboards now say declarations expire. Either §5.5 is wrong or three screens are.
2. **`כיתה` and `קבוצה` are used as if interchangeable.** `people.enrollment.moveGroup` says group;
   this screen says class throughout. §4.3 distinguishes them. Fix the vocabulary once.
3. **"The price does not change" is a billing claim made on a people screen** with no §5.10 basis.
4. **A class transfer sends a notification** with no notification kind.
5. **`AlertTone` has no neutral member**, and this artboard, `12j` and `9g` all want one.
6. **No bottom-sheet primitive and no icon-only button variant.**
7. **`9c` states §3.2 in copy; [`2d`](2d-staff-student-card.md) enforces it by omission.** Be consistent.
8. **The attendance summary spells a count as a word.** Needs a formatter, not a template.
