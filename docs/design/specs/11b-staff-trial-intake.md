# `11b` — שיעור ניסיון · adding a walk-in during a lesson

| | |
|---|---|
| **Surface** | Staff app · 390×844 · **two frames**, light only |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `health` and `attendance` |
| **Slot** | none — but frame 2's rows are `roster-row` shaped |

The two frames are a **before/after pair**, not a theme pair.

- **Frame 1 — intake.** A coach fills in a walk-in child's details and adds them to the lesson in progress.
- **Frame 2 — the roster after the add.** The same class screen, with the new trial student
  highlighted at the top, an attendance pair, and a finish action.

## Regions

**Frame 1** — device chrome · header (back · title · `group · today HH:MM`) · scroll body:
child's name field · age + parent's phone (2-up) · a referral-source chip group · a **health-declaration
alert card with two buttons inside it** · a settings card of two switch rows · footer: cancel + add.

**Frame 2** — device chrome · header (back · class name · `weekday date · time · N students + 1 trial`) ·
scroll body: a highlighted trial-student card (avatar · name + a `ניסיון` badge · a signed-declaration
confirmation · a two-button attendance row) · a `רשימת הכיתה` label · the class roster · footer:
a lead-handoff note + finish.

## States

| State | What renders |
|---|---|
| **Referral chips** | One selected (filled), three unselected (outlined). Single-select, apparently. |
| **Both switches** | **On only**, each with a visible state label. The off state is not drawn. |
| **Fields** | All three pre-filled. The name field carries the emphasised border. |
| **Required** | **Nothing is marked required.** The only "mandatory" statement on the artboard attaches to the health-declaration *action*, not to a field. |
| **Validation error** | **Not drawn.** |
| **Add — in flight / disabled** | **Not drawn.** |
| **Attendance pair (frame 2)** | Present filled, absent outlined — but **no indication which is currently set**, so it is undecided whether these are a toggle pair or two one-shot actions. |
| **Empty / loading / error** | **Not drawn** on either frame. |

## The health-declaration card is the interesting one

A **danger-toned card** — icon, title, one line of body, then two buttons inside it:

> `הצהרת בריאות לשיעור ניסיון` / `קישור חתימה יישלח להורה עכשיו — חובה לפני עלייה למזרן`
> `שליחת קישור בהודעה` · `ההורה כאן`

> **▲ This contradicts §5.5 and G7's own copy.** `health.badge.missingHint` reads
> `אפשר לסמן נוכחות. ההצהרה נדרשת מההורה` — *you may mark them present; the declaration is the
> parent's to provide*. §5.5 is explicit that **nothing on the mat is ever blocked** and that there
> is no `block_attendance_without_health` setting. This card says the opposite: mandatory before
> stepping on the mat.
>
> A trial walk-in may genuinely be a different case from an enrolled student — but if so it is a
> **spec change to argue on its merits**, not something to absorb via a mockup. Settle before M4
> or M3 builds it.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | cards, footer bars, the switch knob |
| Ink | `--fg` | headings, the name field's border, filled buttons, icons |
| Secondary text | `--text-secondary` | subtitles, chip text, alert body, footer note |
| Muted text | `--text-muted` | field labels, section labels — **at D8's floor** |
| Semantic — on / present / signed | `--paid` | both switch state labels, both switch tracks, the present button, the signed-declaration confirmation, the roster checkmarks |
| Semantic — declaration missing | `--danger` | the alert card's icon, title and border |
| Border | `--border` / `--border-strong` | hairlines, chip outlines, the dashed avatar placeholder |
| Belt | `belt_rank.color_hex` via `BeltBar` | frame 2's roster rows (templated; no literal hex) |

No D8-retired grey on either frame. Neither frame has a dark variant, unlike `9a` and `1c`.

## RTL

- The **back icon points right**, correct for RTL, and is a fixed path — pin it rather than
  auto-mirroring, or it becomes a forward arrow.
- The switch knobs use `justify-content: flex-end` for their on position — logical, and correct.
  `Switch` must keep deriving the side from `dir`.
- **Must not mirror:** the parent's phone (tabular), and frame 2's subtitle, which bundles a weekday
  letter, a `dd.mm` date, a time and two counts into one Hebrew line. Every numeral run in it needs
  bidi isolation.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Three fields | `TextField` | `label`, `hint`, `error`. |
| Both switches | `Switch` | `stateLabels: {on, off}` — the artboard's visible label is the primitive's own contract. |
| The health card | `Alert` + `Button` ×2 | `AlertTone` is `danger \| pending \| paid`; `Alert` takes `tone`, `iconLabel` and `children`. **It has no title prop and no action slot** — the health lane composes the title and the two buttons around it. |
| Settings card, trial-student card | `Card` | |
| All buttons | `Button` | |
| `ניסיון` badge | `StatusChip` | **`ChipStatus` has no trial member** (`debt \| paid \| pending \| cancelled \| unmarked \| planned`). `people.status.trial` exists as a string. Finding. |
| Frame 2's roster rows | `StudentRow` + `AttendanceMark` | Belt + name + a mark. |
| Belt swatch | `BeltBar` | Templated in the export; **no evidence either way about the ring.** D7 applies regardless — `BeltBar` rings unconditionally. |
| Attendance pair | `AttendanceMark` | Or two `Button`s, depending on whether it is a toggle. Undecided. |
| Referral chip group | *gap* | Wrapping, single-select choice chips. **Not `SegmentedControl`** (fixed track, no wrap) and **not `Radio`** (circle + label). Fourth artboard wanting this primitive. |
| Avatar placeholder | *gap* | **No avatar primitive among the 18.** Dashed border, single-letter fallback. Also wanted on `12i`, `4a`, `3c`. |
| Header, footer bar | *app shell* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `שיעור ניסיון` | `people.trial.one` | exact |
| `ג׳ודו / מתחילים · היום 17:00` | composed | Data. |
| `שם הילד` | `people.student.firstName` (`שם פרטי`) | Wording differs. |
| `גיל` | `people.student.age` | exact |
| `טלפון הורה` | `people.student.phone` + `guardian.one` | The **composed label has no key**. |
| `מאיפה הגיע` | `reports.funnel.bySource` (`לפי מקור`) | **Cross-namespace (M9)** and it is a report dimension, not a field label. |
| `המלצת חבר` / `אח של חניך` / `פרסום` / `הגיע מהרחוב` | — | **No keys.** These are the **source enum** `reports.funnel.bySource` will group by, and `people.request.source.*` already has a *different* three-member enum (`public_link`, `parent_app`, `manager`) for a different axis. §5.14's funnel needs one referral-source enum with members. Finding. |
| `הצהרת בריאות לשיעור ניסיון` | `health.badge.trialSigned` (`הצהרת ניסיון`) | Near-concept, different wording. |
| `קישור חתימה יישלח להורה עכשיו — חובה לפני עלייה למזרן` | — | **▲ No key, and it contradicts `health.badge.missingHint`.** See above. |
| `שליחת קישור בהודעה` | `health.reminder.send` (`שלח תזכורת להורה`) | Different action — a signing link, not a reminder. |
| `ההורה כאן` | — | **No key.** A parent physically present signs on the coach's phone. That is a real flow with no spec line. Finding. |
| `שיעור ניסיון ללא תשלום` / `לפי מדיניות המועדון — שיעור אחד` | `people.trial.override` / `trial.overrideHint` are the *second*-trial keys | **The first-trial-is-free policy has no key**, and §5.4's override machinery assumes it. |
| `תזכורת מעקב למנהל` / `יומיים אחרי השיעור` | — | **No keys.** A scheduled follow-up notification with a delay. It needs a `comms.preferences.kind.*` member; there is none for lead follow-up. Finding. |
| `מופעל` | `comms.preferences.on` (`פעיל`) | **Cross-namespace (M8)**, wording differs. Belongs in `common` — see [`6a`](6a-dashboard-group-page.md) finding 6. |
| `ביטול` | `schedule.impact.cancel` | Cross-namespace. Belongs in `common`. |
| `הוספה לשיעור היום` | `people.trial.addDuringClass` (`הוספת חניך לשיעור`) | Near-exact. |
| `א׳ 23.08 · 17:00 · 25 חניכים + 1 ניסיון` | composed | Data, but `+ 1 ניסיון` is a **countable label with no key**. |
| `ניסיון` (badge) | `people.status.trial` (`שיעור ניסיון`) | The badge needs the short form. |
| `הצהרת בריאות נחתמה 16:59` | `health.declaration.signedOn` (`נחתמה בתאריך`) | The key says date; the artboard shows a time. |
| `נוכח` / `לא הגיע` | `attendance.roster.present` / `people.trial.didNotAttend` | **Two namespaces for one pair of buttons.** `attendance.roster.absent` is `נעדר`; `people.trial.didNotAttend` is `לא הגיע`. Pick one. |
| `רשימת הכיתה` | `attendance.roster.title` (`נוכחות`) | Wording differs. |
| `בסיום — המנהל יקבל את אורי כליד לטיפול` | `people.status.lead` (`ליד`) | The **sentence has no key** and interpolates the child's name. |
| `סיום` | — | **No generic finish key.** |

## Findings for the lane

1. **▲ The health card blocks the mat; §5.5 says nothing on the mat is ever blocked**, and
   `health.badge.missingHint` says so in the copy that ships. Settle before either lane builds.
2. **`ההורה כאן` is an undocumented flow** — a parent signing in person, on the coach's device.
3. **The referral source enum has no keys and collides with `people.request.source.*`**, which is a
   different axis. §5.14's funnel needs one canonical set.
4. **A follow-up reminder to the manager, two days later**, has no notification kind.
5. **No chip-select primitive** — fourth artboard.
6. **No avatar primitive** — fourth artboard.
7. **`ChipStatus` has no trial member.**
8. **The present/absent pair spans two namespaces.**
9. **The attendance pair's current value is not shown.** Toggle or one-shot is undecided.
