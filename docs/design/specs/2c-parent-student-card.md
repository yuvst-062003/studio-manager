# `2c` — כרטיס חניך · the parent's student card **(composite)**

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **container owned by M3 People**; sections owned by four other lanes |
| **i18n namespace** | per section — see the ownership table |
| **Slot** | **`student-card`** (`web/packages/ui/src/slots.ts`) |

Belt, attendance, documents and payment in one place. This is one of the five composite artboards,
and the reason `slots.ts` exists: **five lanes must not edit one file.**

## Ownership — container and sections

| Region | Owner | Registers as | Namespace |
|---|---|---|---|
| **Container**: header, scroll shell, section order, the `student-card` slot host | **M3 People** | — | `people` |
| Header: avatar, name, `group · coach` subline, the switch-child chip | **M3 People** | part of the container | `people` |
| **§ `חגורה`** — 7-segment progression + current belt + since/next-exam caption | **M7 Events & belts** | `student-card` slot entry | `events` (`belt.*`) |
| **§ `נוכחות · 8 המפגשים האחרונים`** — 8 marks + a 4-state legend | **M5 Attendance** | `student-card` slot entry | `attendance` |
| **§ `מסמכים וחיובים` row 1** — health declaration + validity | **M4 Health** | `student-card` slot entry | `health` |
| **§ `מסמכים וחיובים` rows 2–3** — open debt + a pay button; payments + count | **M6 Money** | `student-card` slot entry | `billing` |
| **Footer**: message the coach · planned absence | **contested** | part of the container | see findings |

The documents-and-billing card is **one visual card holding two lanes' rows**. Either the container
owns the card and the rows are slot entries, or the card itself is split. Decide in the W3/W4
contract commits, before M4 and M6 both reach for it.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — back chevron · avatar · name + subline · a switch-child chip.
3. **Scroll region** — three labelled sections, each a label above a `Card`.
4. **Footer action bar** — two buttons, outside the scroll.

No tab bar: this renders pushed over the shell, not as a tab destination.

## States

| State | What renders |
|---|---|
| **Belt — future segments** | Drawn dimmed, at reduced alpha. |
| **Belt — current segment** | Distinguished **by height alone** — taller, different radius. Not by a ring or outline. |
| **Attendance marks** | Templated; the *legend* defines the four canonical states: attended · absent · notified · unmarked. |
| **Empty / loading / error** | **Not drawn for any section.** The attendance loop's placeholder count is a prototyping cue, not a skeleton. Every section assumes data. |
| **No belt yet** | **Not drawn**, and `events.belt.none` exists for it. A new white-belt child is the common case. |
| **No debt** | **Not drawn.** `billing.openDebts.empty` exists. |
| **No payments yet** | **Not drawn.** `billing.history.empty` exists. |

Because each section belongs to a different lane, **each section owns its own empty and error state**
and the container owns none of them. Say so in the slot contract or four lanes will each assume the
container handles it.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the three cards, the footer bar |
| Ink | `--fg` | name, primary buttons' fill |
| Secondary text | `--text-secondary` | header subline, belt caption, legend |
| Muted text | `--text-muted` | section labels, the payments count, the chevron — **at D8's floor** |
| Semantic — attended / valid | `--paid` | the attended swatch; the declaration's validity text |
| Semantic — absent / debt | `--danger` / `--debt` | the absent swatch; the debt amount |
| Semantic — notified / unmarked | `--pending` | the notified outline and the unmarked dashed outline |
| Belt | `belt_rank.color_hex` via `BeltBar` | the seven segments |
| Border | `--border` | card edges, row dividers |

No D8-retired grey. **The belt green and the semantic success green are different values two
sections apart on the same screen.** D3 requires that; do not collapse them.

> **▲ D7 — only the white segment carries a ring, and yellow does not.** D7's own audit names yellow
> as failing even the 3:1 non-text threshold, and D12 adds that brown and green fail against the dark
> ground too — five belts across two modes, not three. `BeltBar` rings unconditionally, with no prop
> to disable it. **Use the primitive. Do not port the white-only pattern.**

## RTL

- The header **back chevron** points right and the documents row's **disclosure chevron** points
  toward the reading direction — both correct, both directional.
- **The belt bar is a plain flex row with no direction override**, so white (the start of the
  progression) lands at the reading start under `dir="rtl"`. Rely on that; never hard-code
  `row-reverse` or a literal offset.
- **Must not mirror:** the dates, the money amount, the document count, the attendance marks.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Belt progression | `BeltBar` | Direct fit. Ring on every segment. |
| The 8 marks + legend swatches | `AttendanceMark` | Four states map to `present \| absent \| notified \| unmarked`. |
| Three section containers | `Card` | |
| `לתשלום`, the two footer buttons, the switch-child chip | `Button` | Four usages. Whether `Button` has a chip visual needs confirming; if not, the chip stays feature-specific. |
| The debt amount | `MoneyDisplay` | `tone="debt"`. |
| The declaration's validity | `StatusChip` | Drawn as plain coloured text, not a pill. `StatusChip` is a pill; either the design gains one or this stays a health-lane label. |
| Header block | *feature-specific* | Larger than `StudentRow`'s scale. No avatar primitive exists. |
| The three document/billing rows | *feature-specific, per lane* | Each row is its lane's, composing `MoneyDisplay` / `Button` / `StatusChip`. |
| Footer bar | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| name · `group · coach` | `people.student.group`, `schedule.session.coach` | The composed subline is data. |
| `החלף ילד` | — | **No key.** A multi-child parent switching children is core §5.3. Finding. |
| `חגורה` | `events.belt.title` (`מערכת חגורות`) / `belt.current` (`הדרגה הנוכחית`) | `belt.current` is the closer of the two. |
| `חגורה ירוקה` | `events.belt.rank` labels it; the name is `belt_rank` data | |
| `מ־04.2026 · מבחן הבא 12.09` | `events.belt.awardedOn` + `events.exam.title` | The **composed caption has no key** and joins two facts from two models. |
| `נוכחות · 8 המפגשים האחרונים` | `attendance.roster.title` (`נוכחות`) | The "last 8" qualifier has no key. |
| `נכח 5` / `לא נכח 1` / `הודעתם 1` / `לא סומן 1` | `attendance.roster.present` / `.absent` / `source.preReported` / `roster.unmarked` | All four exist. **`הודעתם` is second person — the parent's voice** — while `source.preReported` is third. Same person mismatch as [`12b`](12b-parent-child-month.md) finding 4. The counts have no wrapper. |
| `מסמכים וחיובים` | `health.documents.title` + `billing.title` | **The heading spans two namespaces.** It belongs to the container, so it needs a `people` key or a `common` one. Finding. |
| `הצהרת בריאות` | `health.declaration.title` | exact |
| `בתוקף עד 09.2026` | — | **▲ No key, and it contradicts §5.5.** `health.declaration.noExpiry` says declarations are valid indefinitely. This row shows an expiry. Same contradiction as [`12j`](12j-parent-first-registration.md) finding 1. |
| `חוב פתוח` | `billing.openDebts.title` (`חובות פתוחים`) | Near-exact. |
| `320₪` | via `MoneyDisplay` | Data. Agorot in, ₪ out. |
| `לתשלום` | `billing.card.pay` (`לתשלום`) | exact |
| `תשלומים` | `billing.title` (`תשלומים`) | exact — **and it already reflects D9.3's retitle.** |
| `7 מסמכים` | `billing.receipt.*` | **▲ No key, and D9.3 is the reason.** §5.10 issues a tax document for **card payments only**. A count of "7 documents" on a card that lists all payments repeats exactly the false promise D9.3 removed from `12f`'s title. Finding. |
| `הודעה למאמן` | — | **No key**, and see below. |
| `היעדרות מתוכננת` | `attendance.absence.title` (`דיווח היעדרות`) | Wording differs. |

## Findings for the lane

1. **▲ `7 מסמכים` re-introduces what D9.3 cut.** The screen counts documents for *all* payments;
   §5.10 issues one only for card. Either count card payments, or use `billing.receipt.cardOnly`.
2. **▲ `בתוקף עד 09.2026` contradicts `health.declaration.noExpiry`.** Second artboard to do so.
3. **`הודעה למאמן` is the chat question again.** It appears here and on [`12b`](12b-parent-child-month.md).
   §2.3 has no two-way chat and D9.1 cut the office-chat tab from `2b` for that reason. **Settle once,
   for both artboards, before M3 or M5 builds it.** It also decides who owns the footer bar.
4. **The `מסמכים וחיובים` card holds two lanes' rows.** Split it or assign it, in the contract.
5. **`החלף ילד` has no key** and multi-child switching is central to the parent app.
6. **Each section owns its own empty state.** Write that into the slot contract.
7. **The current belt is marked by height alone.** With the D7 ring on every segment, height may no
   longer read as "current". `BeltBar` needs a current-segment affordance that is not just size.
