# `2d` — כרטיס חניך · the coach's view **(composite)**

| | |
|---|---|
| **Surface** | Staff app · 390×844 · light only |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W3 · **container owned by M5 Attendance**; sections owned by four lanes |
| **i18n namespace** | per section |
| **Slot** | **`student-card`** — the same slot as [`2c`](2c-parent-student-card.md) and [`4a`](4a-dashboard-student-card.md) |

Opened from the register, so a coach can see one student without leaving the mat. **The narrowest of
the three student cards**, and deliberately so.

## Ownership — container and sections

| Region | Owner | Namespace |
|---|---|---|
| **Container**: identity header, scroll shell, section order, the slot host | **M5 Attendance** | `attendance` |
| Identity header: back · belt accent · name · `belt · group · age` | **M5**, reading M3 and M7 data | `people` |
| **§ health alert** — a danger banner: declaration missing, an expiry, a participation restriction, and a "remind the parent" action | **M4 Health** | `health` |
| **§ quick actions** — call the parent · message · open the full record | **contested** — call and message read M3's contact data and are arguably M8's; the third is M3's navigation | `people` / `comms` |
| **§ attendance history** — 8 marks + a percentage caption naming an exam threshold | **M5 Attendance** | `attendance` |
| **§ coach notes** — a note, an attribution, no add-field | **owner unclear** — see findings | ? |
| **Footer**: mark absent · mark present | **M5 Attendance** | `attendance` |

## §3.2 — what the coach does not see

The mock data behind this student carries a payment status and an amount. **Every field on that
record appears on this card except those two.** There is no balance, no debt chip, no pay action,
and no freeze or transfer control — all of which [`4a`](4a-dashboard-student-card.md), the manager's
card, has.

**§3.2 is enforced here by omission, not by a statement.** [`9c`](9c-staff-student-card-transfer.md)
does the opposite: it prints `מאמנים אינם רואים נתוני תשלום` on the screen. Both are defensible;
**they should not both ship.** And note the consequence of omission: a developer reading `2d` alone
has no cue that the absence is deliberate. Put a comment where the `student-card` slot is composed
for the coach surface.

## States

| State | What renders |
|---|---|
| **Health banner** | Drawn in its "missing" state, always visible when a declaration is missing. **Not a badge — a full banner.** Contrast `3b`, where the same fact is a chip. |
| **Attendance marks** | Templated. The caption gives the percentage and names an 80% exam threshold. |
| **Footer pair** | Both drawn, **and neither shows which state the student is currently in.** Unlike `1c`'s row, which cycles and shows its state, this pair gives no current value — so toggle or one-shot is undecided. |
| **Empty / loading / error** | **Not drawn for any section.** No "no notes yet", no "no attendance yet", no offline indicator — which `1c` does draw and this screen, reached from `1c`, does not. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | all four cards |
| Ink | `--fg` | primary text, icons, the reminder button's fill |
| On-ink | `--on-fg` | the reminder button's label |
| Secondary text | `--text-secondary` | subtitle, the alert's body, the attendance caption |
| Muted text | `--text-muted` | section labels, the note's attribution — **at D8's floor** |
| Semantic — danger | `--danger` (+ tint and border) | the health banner; the mark-absent button's outline and label |
| Semantic — **`--accent`, not `--paid`** | `--accent` | the mark-present button's fill |
| Border | `--border` | hairlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | the header accent |

> **▲ One token role is easy to get wrong here.** `--accent` and `--paid` hold the same light-mode
> value, so the mark-present button's green looks like the payment token. **It must bind to
> `--accent`.** §3.2 says a coach sees no payment data; wiring an attendance control to the payment
> semantic is exactly the kind of mistake that survives review because it renders identically —
> until D12's dark-mode correction moves `--paid` and the button changes colour on one theme only.

No D8-retired grey. Borders in the export are translucent ink; use the tokens.

> **▲ D7 — the header's belt accent is fill-only.** It is a yellow belt in the mock, the exact case
> D7's audit names as failing even the 3:1 non-text threshold. `BeltBar` rings unconditionally.

## RTL

- The **back chevron** points right, correct for RTL, matching `1c`.
- **Must not mirror:** the dates, the percentages, the exam threshold.
- **None of the numeric spans sets tabular figures here**, unlike `1c` and `4a`. Normalise it.
- The export's spacing is physical throughout. Per D10, translate to logical — especially the
  header's icon–accent–text ordering and the quick-action row.
- Wrap the student's name and the coach's name in `<bdi>`, as `StudentRow` already does: a group or
  coach name can be Latin.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Mark absent | `Button` | `variant="destructive"` — an exact token match. |
| Mark present | `Button` | **No filled positive variant exists.** `ButtonVariant` is `primary \| secondary \| ghost \| destructive`. This button is a solid `--accent` fill. Either `Button` gains a variant or the attendance lane composes one — **not** an inline style (D10). Finding. |
| Reminder action | `Button` | `variant="primary"`. |
| 8 marks | `AttendanceMark` | Four states. |
| Coach-notes card | `Card` | Its `caption` prop matches the label-inside-border layout exactly. |
| Health banner | `Alert` + `Button` | **`Alert` has `tone`, `iconLabel` and `children` — no title prop and no action slot.** The banner has a bold title line *and* an embedded CTA. The health lane composes them around `Alert`. Same gap as [`6c`](6c-dashboard-alert-centre.md) finding 1. |
| Belt accent | `BeltBar` | Confirm the compact vertical variant. |
| **Quick-action tiles** | *gap* | Icon over label, in a bordered tile. `Button`'s `secondary` uses an ink border and `ghost` uses `--border-strong`; **neither matches the very light hairline drawn**, so reusing `Button` would visibly change the look. Feature-specific for now. |
| Attendance card's outer label | — | **It sits outside the card**, where the notes card's label sits inside. `Card`'s `caption` renders inside. Pick one placement across the three student cards. |
| Identity header | *feature-specific* | **Not `StudentRow`** — that is a roster row at list scale; this is a page header. It reuses `BeltBar` and nothing else. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חגורה צהובה · ג'ודו / מתחילים · גיל 9` | `events.belt.rank`, `people.student.group`, `people.student.age` | Composed across three namespaces. |
| `הצהרת בריאות חסרה` | `health.badge.missing` | exact |
| `פג תוקף ב־01.08. אין להשתתף בלחימת קרקע עד חידוש.` | — | **▲ No key, and two problems.** First, an **expiry** — the sixth artboard to contradict `health.declaration.noExpiry`. Second, and worse: **`אין להשתתף` — "must not participate" — is a mat restriction.** §5.5 says nothing on the mat is ever blocked, there is no `block_attendance_without_health` setting, and `health.badge.missingHint` reads `אפשר לסמן נוכחות. ההצהרה נדרשת מההורה`. **This banner tells a coach to bench a child.** Same contradiction as [`11b`](11b-staff-trial-intake.md) finding 1, and here it is aimed at a coach mid-lesson. |
| `שלח תזכורת להורה` | `health.reminder.send` | exact |
| `טלפון להורה` / `הודעה` / `תיק חניך` | `people.guardian.call` (`חיוג`) / `guardian.message` (`שליחת הודעה`) / — | Two of three exist with different wording; the third has none. |
| `נוכחות · 8 המפגשים האחרונים` | `attendance.roster.title` | The "last 8" qualifier has no key — **and `4a` says 12.** |
| `63% נוכחות בחודש האחרון — מתחת לסף המבחן (80%)` | `reports.operational.attendanceRate` + `events.exam.eligibility` | **No key**, and it **states an exam-eligibility threshold to a coach**. §5.9 computes eligibility from rank and time held; `events.exam.eligibleHint` says exactly that and says nothing about attendance. **An 80% attendance threshold for exam eligibility appears only here.** Finding. |
| `הערות מאמן` | — | **No key.** Same gap as [`4a`](4a-dashboard-student-card.md) finding 3 — `schedule.note.*` is per-session. |
| the note's body | — | Data — **and it is a physical-injury note about a minor.** See findings. |
| `אלון מזרחי · 05.08` | — | Data. |
| `סמן כנעדר` / `סמן כנוכח` | `attendance.roster.absent` / `.present` | The **verbs** have no key; the keys are state labels. |

## Findings for the lane

1. **▲ The health banner tells the coach the child may not train.** §5.5 forbids that rule and
   `health.badge.missingHint` says the opposite. **The second artboard to do this**, and the more
   dangerous of the two because it is on the mat, mid-lesson, in `--danger`.
2. **▲ A sixth declaration-expiry contradiction.**
3. **An 80% attendance threshold for exam eligibility exists only on this artboard.** §5.9's
   eligibility is rank and time-in-grade. If attendance is a criterion, it belongs in the model.
4. **Coach notes carry a physical-injury note about a minor**, here and on `4a`, with no model, no
   key, and no G7 consideration. Free text about a child's body is health data by any reading.
5. **`Button` has no filled positive variant**, and the mark-present button needs one.
6. **`--accent`, not `--paid`.** Same hex, different meaning, and D12 already split them in dark.
7. **`Alert` has no title and no action slot.**
8. **No quick-action tile primitive and no avatar primitive.**
9. **The attendance window is 8 here and 12 on `4a`.**
10. **§3.2 is enforced by omission here and stated on `9c`.** Pick one, and leave a comment.
