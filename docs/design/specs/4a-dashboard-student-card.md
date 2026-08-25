# `4a` — כרטיס חניך · the manager's student card **(composite)**

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **container owned by M3 People**; sections owned by five other lanes |
| **i18n namespace** | per section |
| **Slot** | **`student-card`** — the same slot as [`2c`](2c-parent-student-card.md) and [`2d`](2d-staff-student-card.md) |

The fullest of the three student cards. Everything a manager needs about one child, and — unlike the
coach's [`2d`](2d-staff-student-card.md) — **including money**.

## Ownership — container and sections

| Region | Owner | Namespace |
|---|---|---|
| **Container**: identity header, the two-column shell, section order, the slot host | **M3 People** | `people` |
| Identity header: breadcrumb · name · `belt · group · joined` · belt accent · three action buttons | **M3 People** (hosting M6's freeze, M3's transfer, M8's message) | `people` |
| Stat card — attendance, 30 days | **M5 Attendance** | `attendance` |
| Stat card — sessions this year | **M5 Attendance** | `attendance` |
| Stat card — outstanding balance | **M6 Money** | `billing` |
| Stat card — time at this belt | **M7 Events & belts** | `events` |
| **§ `מסלול חגורות`** — 7-segment track + next-exam date | **M7 Events & belts** | `events` |
| **§ `נוכחות · 12 המפגשים האחרונים`** — 12 marks + legend + a click hint | **M5 Attendance** | `attendance` |
| **§ `משק בית`** — guardian + siblings + **a household debt banner** | **M3 People**, with an **M6 sub-element** | `people` + `billing` |
| **§ `מסמכים`** — health declaration + insurance certificate | **M4 Health** (declaration); **owner unclear** (insurance) | `health` + ? |
| **§ `הערות מאמן`** — a past note, attribution, an add-note field | **owner unclear** | ? |

**Three ownership questions this artboard forces**, and the slot registry cannot answer them:

- The **household card is M3's and contains an M6 debt banner**. Either the banner is its own slot
  entry inside a nested slot, or M3 renders a value M6's contract commit put in the payload. The
  second is what `slots.ts` prescribes — write it into the W4 contract.
- **The insurance certificate is not a health declaration.** §5.5 and §11 cover declarations;
  nothing covers an insurance document. It has no model, no namespace and no lane.
- **Coach notes** carry a physical-injury note here and on [`2d`](2d-staff-student-card.md).
  Health-adjacent free text, owned by nobody.

## Regions

1. **DashNav** — imported, `active="members"`.
2. **Identity header** — full width, bottom rule.
3. **Body row**
   - **Main column** — four stat cards · the belt-track card · the attendance card.
   - **Sidebar** (fixed width, far side) — household · documents · coach notes.

## States

Every card is drawn in its populated happy path. **No empty, loading or error state exists for any
section**, and there are eleven sections. Specifically undrawn and needed:

- **no belt yet** — `events.belt.none` exists;
- **no siblings** — the household card assumes at least one;
- **no debt** — `billing.openDebts.empty` exists;
- **no coach notes** — the add-field's empty state is drawn, the list's is not;
- **no attendance yet** — a student who joined this week.

Each section owns its own. Write that into the slot contract; the container owns none of them.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, all cards, the sidebar |
| Ink | `--fg` | primary text, the primary button's fill |
| Secondary text | `--text-secondary` | stat labels, the guardian's phone, the exam date, legend counts |
| Muted text | `--text-muted` | breadcrumb, section captions, sibling group tags, attribution, placeholder — **at D8's floor** |
| Semantic — debt | `--debt` (+ `--danger-tint`, and an on-tint text variant in the banner) | the balance stat and the household banner |
| Semantic — valid / attended | `--paid` | attended marks; the declaration's validity chip |
| Semantic — expiring / notified / unmarked | `--pending` | the insurance chip; the notified ring; the unmarked dashed ring |
| Border | `--border` / `--border-strong` | card edges, ghost-button outlines, dividers |
| Belt | `belt_rank.color_hex` via `BeltBar` | three places — see below |

No D8-retired grey on this artboard.

> **▲ D7 — three fill-only violations, and D7 names two of them by example.**
> 1. The **header accent strip** beside the name — literally "the belt strip on the student card".
> 2. The **7-segment track** — only white is ringed; **yellow, the belt D7's audit calls out as
>    failing even 3:1, is bare**, and so is the current green.
> 3. The **sibling colour tags** in the household card — 5px bars in belt hexes, unringed.
>
> `BeltBar` rings unconditionally with no opt-out. Route all three through it.

**The future belt segments are drawn at reduced alpha.** With a ring added, "dimmed" and "ringed"
must not fight each other — decide whether the ring dims too, or stays at full strength. It is a
contrast obligation either way (SC 1.4.11), so it should stay.

## RTL

- Nav on the right; main column at the reading start, sidebar at the far side.
- **One physical property**: the sidebar's divider is a `border-right`. It lands correctly only
  because of where the sidebar happens to fall. → `border-inline-start`.
- The breadcrumb **arrow** points right, the household row's **chevron** points left — both correct
  for RTL, both directional. Keep the icon layer's rule consistent.
- **Must not mirror:** the two money amounts, the percentages, the counts, the dates, the phone.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every panel | `Card` | |
| Three belt renderings | `BeltBar` | See above. Confirm it supports a compact vertical accent and a full ladder; if not, add the variants. |
| 12 marks + legend swatches | `AttendanceMark` | |
| Both document chips | `StatusChip` | Valid → `paid`. **Expiring-soon has no member.** Same gap as [`3b`](3b-dashboard-students.md) finding 2. |
| Two money figures | `MoneyDisplay` | `tone="debt"`. |
| Three header actions | `Button` | Two ghost, one primary. |
| Sibling rows | `StudentRow` | Colour tag + name + group subline. **Its `belt` prop is required and the tags are belt colours here**, so it fits — unlike the parent app's identity colours. |
| Add-note field | `TextField` | |
| Stat card | *feature-specific* | Label + a large tabular figure. **Not** `StatusChip` (pill-forward) and **not** `ProgressBar`. The same shape recurs on `6a` and `4c` — worth extracting once, across the dashboard. |
| **Avatar placeholder** | *gap* | Fifth artboard. |
| Household card, document rows, notes card | *feature-specific, per lane* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חניכים` (breadcrumb) | `people.student.plural` | exact |
| `חגורה ירוקה · ג'ודו / מתחילים · הצטרפה 04.2026` | `events.belt.rank` · `people.student.group` · `people.student.joinedOn` | Composed; **and `הצטרפה` is feminine.** Third artboard with a Hebrew gender problem. |
| `הקפאת מנוי` | `people.freeze.title` (`הקפאת חברות`) | Wording differs — *subscription* vs *membership*. §5.4 freezes a student; §5.10 has `run.frozenSkipped`. One word. |
| `העברה לקבוצה` | `people.enrollment.moveGroup` | exact concept — and note [`9c`](9c-staff-student-card-transfer.md) says `מעבר כיתה`. |
| `הודעה להורה` | `comms.announcement.create` | **Cross-namespace (M8)**, and it is a *directed* message to one parent, which §5.11's one-way inbox does not obviously model. Finding. |
| `נוכחות 30 יום` | `attendance.report.attendanceRate` | The 30-day window has no key. |
| `מפגשים מתחילת השנה` | `attendance.report.sessionsHeld` (`שיעורים שהתקיימו`) | Wording differs; the year window has no key. |
| `יתרת חוב` | `billing.openDebts.total` (`סה״כ חוב`) | Wording differs. |
| `ותק בחגורה` | — | **No key.** Third artboard needing a tenure label. |
| `מסלול חגורות` | `events.belt.progress` (`התקדמות חגורה`) | Wording differs. |
| `מבחן הבא: 12.09.2026` | `events.belt.next` (`הדרגה הבאה`) / `events.exam.title` | The **next-exam-date composition has no key.** |
| the seven belt names | `belt_rank` data | Not copy. |
| `נוכחות · 12 המפגשים האחרונים` | `attendance.roster.title` | The "last 12" qualifier has no key — **and `2c` says 8, `9c` says 8, this says 12.** The window is a product choice with three values across three artboards. Finding. |
| `לחצו על מפגש לפתיחת רשימת הנוכחות` | — | **No key.** |
| `נכח 9` / `לא נכח 1` / `הודיעו מראש 1` / `לא סומן 1` | `attendance.roster.present` / `.absent` / `source.preReported` / `roster.unmarked` | All four exist; **the counts have no wrapper**, and the person is third here (staff view) where `2c` is second (parent view). |
| `משק בית` | — | **No key.** §5.3's household is a first-class concept and has no label. `billing.debt.byHousehold` is the only occurrence, in M6. Finding. |
| `אפוטרופוס · 054-470-5745` | `people.guardian.one` (`הורה`) | **`אפוטרופוס` again** — see [`3c`](3c-dashboard-add-student.md) finding 3. |
| `אחים במועדון` | — | **No key.** |
| `חוב משק הבית: 1,280₪ · תזכורת אחרונה נשלחה 14.10` | `billing.debt.total` + `billing.debt.reminderSent` | Both exist; **the composed banner has no key.** |
| `מסמכים` | `health.documents.title` (`מסמכים והצהרות`) | Near-exact. |
| `בתוקף 09.2026` | — | **▲ Fifth artboard showing a declaration expiry**, against `health.declaration.noExpiry`. |
| `אישור ביטוח` / `פג בעוד 12 יום` | — | **No keys, no model, no lane.** See ownership above. |
| `הערות מאמן` | — | **No key.** `schedule.note.title` (`סיכום מפגש`) is a *session* note, not a per-student one. Two different things. Finding. |
| `הוספת הערה…` | `attendance.roster.addNote` (`הוספת הערה`) | Near-exact — and it is M5's, on a card nobody owns. |

## Findings for the lane

1. **▲ A fifth declaration-expiry contradiction.** `12j`, `2c`, `9c`, `3b` and now `4a`.
   Five screens against one key. **Escalate §5.5 rather than patching each spec.**
2. **The insurance certificate has no model, no namespace and no owner.**
3. **Per-student coach notes have no model and no key.** `schedule.note.*` is per-session.
4. **The attendance window is 8, 8 and 12 across three student cards.** Pick one.
5. **`משק בית` — the household — has no key**, though §5.3 makes it central.
6. **The household card is M3's and contains an M6 banner.** Resolve via the payload, per `slots.ts`.
7. **`הודעה להורה` is a directed message**, which §5.11's one-way inbox does not model.
8. **Freeze is called subscription here and membership in the key.** And transfer is *group* here and
   *class* on `9c`. Two vocabulary collisions.
9. **Three fill-only belt renderings**, two of them named by D7's own examples.
10. **Eleven sections, zero empty states.**
