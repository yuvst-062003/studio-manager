# Staff app — canvas-to-code gap spec

**Written:** 2026-08-27
**Surface:** `web/apps/staff/` · 390×844 · Hebrew RTL · installable PWA, used on the mat
**Reference pages:** [`docs/design/canvas/02-staff-app/Staff App.dc.html`](../canvas/02-staff-app/Staff%20App.dc.html) — open in a browser and jump with an anchor, e.g. `Staff App.dc.html#9f`.

> **This is a gap audit, not a design spec.** The per-artboard design specs already exist in
> [`docs/design/specs/`](../specs/README.md) — one file per artboard, with regions, states, token
> roles, primitives and i18n keys. Read those to know *what a screen should be*. Read this to know
> *what shipped, what is missing, and where the code is*.

## How this was measured

All 14 staff artboards (22 variants including light/dark and ×2 pairs) were rendered in
headless Chromium and compared against the shipped app at **exactly 390×844**, signed in as
the `lead` coach persona with a seeded studio (5 students enrolled, 43 sessions, one marked
register). The coach *is* assigned to the group — `buildScenario` sets `lead_coach`.

**Two measurement traps, both corrected here.** Set `localStorage['studio.staff.tour-seen']`
before measuring: the first-run tour ([`StaffTour.tsx`](../../../web/apps/staff/src/features/identity/StaffTour.tsx))
otherwise covers four routes completely and makes every screen look like two lines of text.
And today must actually have a class — the seeded rules are Sunday and Tuesday, so measuring
on a Thursday shows an honest `אין שיעורים היום` that is not a defect.

## Summary

| Metric | Artboards | Shipped |
|---|---|---|
| Median interactive controls | ~16 (up to **99**) | ~8 |
| Distinct accent colours | 1–7 | 0–3 |
| Coloured bars | 4 (`1d` 3, `9i` 1) | **0** |

The roster is genuinely good. The rest of the app is thin, and **five screens are built and
unreachable** — including the entire post-lesson flow.

### Route fall-through

`#/`, `#/schedule`, `#/attendance`, `#/cash` and `#/join-link` all render the **identical**
20-line date-picker screen. Three different causes, and they need three different fixes:

| Route | Cause | Fix |
|---|---|---|
| `#/schedule` | correct — this *is* the screen | — |
| `#/` | correct — home is the schedule | — |
| `#/attendance` (bare) | **no branch exists**; only `#/attendance/<sessionId>` is handled (`App.tsx:171`) | add an index screen or redirect |
| `#/cash` | gated on `viewerIsManager` (`App.tsx:338`) — a coach never sees it | intended for `11a`, see below |
| `#/join-link` | gated on `viewerIsManager` | correct as designed |

---

## Screen-by-screen

Legend — `OK` close to spec · `PARTIAL` present but thin · `SHELL` empty state only ·
`UNREACHABLE` built but nothing renders it.

### `#/attendance/<sessionId>` — the register
- **Reference:** `Staff App.dc.html#1c` (24 lines / **76** controls / 7 accents) and `#9f` (23 / 76 / 7)
- **Source:** [`features/attendance/RosterScreen.tsx`](../../../web/apps/staff/src/features/attendance/RosterScreen.tsx), [`RosterRow.tsx`](../../../web/apps/staff/src/features/attendance/RosterRow.tsx), [`AttendanceStrip.tsx`](../../../web/apps/staff/src/features/attendance/AttendanceStrip.tsx)
- **Measured:** 16–21 lines · 31–36 controls · 3 accents · **Status:** OK

The best screen in the staff app. Real counters (`5 נוכח · 0 נעדר · 0 לא סומן`),
`סימון כולם כנוכחים` with the correct caveat (`לא ידרוס דיווחי הורים או סימונים קיימים`),
tap-to-cycle rows, and `אפשר לערוך את הנוכחות בכל זמן` — §5.14's "correctable at any time".

Build:
1. **Session context in the header.** Mockup: `יום א׳ · 17:00 · אולם א׳`. Shipped:
   `מתחילים … · 17:00` — no weekday, no hall. A coach covering for someone needs the hall.
2. **The `הודיעו מראש` row state.** §5.14 makes advance notice a distinct state from absence,
   and `9f` auto-marks it: `2 הורים דיווחו היעדרות מראש — מסומן אוטומטית`. It does not render.
   *This depends on the parent app shipping `AbsenceScreen` — see [`parent.md`](parent.md).*
3. **The `הצהרת בריאות חסרה` flag on a row.** [`HealthBadge.tsx`](../../../web/apps/staff/src/features/health/HealthBadge.tsx)
   exists. §5.5: a coach sees **only `derived_flags`** — a ⚠ badge reading אסתמה or אלרגיה —
   never the declaration contents. Per **C10** the missing declaration must **not** hard-block
   attendance: the coach controls the mat and can decline the child; a block only stops the
   record from being accurate. Show the warning, allow the mark.
4. **Offline indicators** — `3 שיעורים ממתינים לסנכרון` and `לא מקוון`. §6.1 walks this flow
   in a basement; [`OfflinePriming.tsx`](../../../web/apps/staff/src/features/attendance/OfflinePriming.tsx)
   and the offline queue in `web/packages/core/` already exist.

### `#/` and `#/schedule` — today and date picker
- **Reference:** `#9a` (43 / 41, light + dark), `#1d` (36 / **64**, 3 bars), `#9b` (55 / 14)
- **Source:** [`features/schedule/TodayScreen.tsx`](../../../web/apps/staff/src/features/schedule/TodayScreen.tsx), [`DatePickerScreen.tsx`](../../../web/apps/staff/src/features/schedule/DatePickerScreen.tsx), [`ScheduleSection.tsx`](../../../web/apps/staff/src/features/schedule/ScheduleSection.tsx)
- **Measured:** 20 lines · 8 controls · 2 accents · **Status:** PARTIAL

Has the day strip and a coach filter (`סינון לפי מאמן` — §9a's *"מסנן מאמן במקום פיצול מסכים"*,
which is the right call and is implemented).

Build:
1. **Session cards.** `1d` carries 64 controls: per-lesson time, duration (`45 דק׳`), group,
   hall and headcount (`אולם א׳ · 14 חניכים`), and a **`נוכחות נרשמה` state marker** —
   the 3 bars in `1d`. None of this renders.
2. **Header summary** — `5 שיעורים · אלון מזרחי`, and `היום` / `יום א׳ · 23 באוגוסט`.
3. **The offline banner** — `3 שיעורים ממתינים לסנכרון`.
4. **`9b`'s full date picker** — day / week / month / range switcher, a month grid, the
   `יש שיעורים` and `נוכחות לא סומנה` **legend**, and quick jumps
   (`השבוע` / `שבוע הבא` / `החודש` / `30 יום אחרונים`).
5. **`חזרה להיום`.**

### `#/students` — student search
- **Reference:** `#9h` (36 lines / **99** controls / 6 accents)
- **Source:** [`features/people/StudentsSearch.tsx`](../../../web/apps/staff/src/features/people/StudentsSearch.tsx)
- **Measured:** 17 lines · **0** controls · 2 accents · **Status:** PARTIAL

Lists name, group, `פעיל` — and has **zero interactive controls against 99**. Rows are not
tappable, so the student card has no entry point.

Build:
1. **Tappable rows** opening the student card (see *Unreachable code*).
2. **Class grouping and filter tabs** — `הכיתות שלי · 3`, `מתחילים`, `נבחרת`, with per-class
   headers carrying counts (`ג׳ודו / מתחילים · 25`).
3. **The warning banner** — `2 חניכים עם הצהרת בריאות חסרה`.
4. **Per-student belt, tenure and attendance** — `ירוקה · 5 חודשים · 92%`, with the belt bar
   (D7 ring) and the percentage coloured against the exam threshold.
5. Search by student **or parent** name (`חיפוש לפי שם חניך או הורה`).

### `#/events` — staff events
- **Reference:** `#9i` (31 / 4, 1 bar) · **Source:** [`features/events/StaffEventsScreen.tsx`](../../../web/apps/staff/src/features/events/StaffEventsScreen.tsx)
- **Measured:** 2 lines · 0 controls · **Status:** SHELL (no events existed when measured)

Build: `הכיתות שלי · 3 קרובים`; typed event cards (`אימון מיוחד` / `מבחן חגורה` / `תחרות`) with
date, time, venue; **ownership markers** `אתה האחראי` and `אתה הבוחן` — the point of `9i` is
*"מה שלי, מי אישר, ומה נשאר לעשות"*; capacity (`42/54`); consent state
(`כל האישורים נחתמו`); outstanding work (`הזמנות טרם נשלחו` + `שליחה`); `רשימת משתתפים`;
`אירוע חדש`.

### `#/cash` — payment promises *(manager-only)*
- **Source:** [`features/billing/PaymentPromisesSection.tsx`](../../../web/apps/staff/src/features/billing/PaymentPromisesSection.tsx)
- **Measured (as `manager`):** 2 lines — `בקשות תשלום`, `אין בקשות תשלום פתוחות.`

**This is not artboard `11a`.** `#/cash` is the cheque / cash payment-promise queue; `11a` is
in-lesson item handover, a different feature with no route. See *Unreachable code*.

### `#/join-link` — club join link *(manager-only)*
- **Source:** [`features/people/JoinLinkSection.tsx`](../../../web/apps/staff/src/features/people/JoinLinkSection.tsx)
- **Measured (as `manager`):** 3 lines — works. No artboard.

### `#/events/<eventId>` — exam results
- **Reference:** `#9d` variant 2 · **Source:** [`features/events/ExamResultsScreen.tsx`](../../../web/apps/staff/src/features/events/ExamResultsScreen.tsx), [`ExamResultMark.tsx`](../../../web/apps/staff/src/features/events/ExamResultMark.tsx), [`BeltPair.tsx`](../../../web/apps/staff/src/features/events/BeltPair.tsx)
- Not measured — no exam existed. `BeltPair` is the before/after belt display and should carry
  the **D7 ring**; `9d#2` has 7 accent colours.

### `#/install`
- **Source:** shared [`web/packages/ui/src/first-run/InstallWalkthrough.tsx`](../../../web/packages/ui/src/first-run/InstallWalkthrough.tsx) · 2 lines. No artboard. Works.

### Drawer
- **Reference:** `#9e` (16 / 28) · **Source:** [`web/packages/ui/src/shell/NavDrawer.tsx`](../../../web/packages/ui/src/shell/NavDrawer.tsx)
- **Measured:** 43 lines · 39 controls · **Status:** OK — exceeds the mockup

Build: the coach identity block (`שירה לוי · מאמנת · קראטה / ילדים · נוער`); work counters
(`היסטוריית נוכחות 1`, `הכיתות שלי 2`); `בקשת החלפה`; and — the interesting part — **the
permission-boundary list**, which explicitly shows `מסמכים של חניכים`, `תשלומים וגבייה` and
`מעבר חניך בין כיתות` greyed out with `לא זמין בהרשאה שלך` and the footnote
*"פעולות אלה שמורות למאמן הראשי של הכיתה"*. Showing a locked capability is a deliberate design
choice — it teaches the role rather than hiding it.

---

## Unreachable code — built, tested, rendered by nothing

Each is referenced **only** by its feature's barrel `index.ts`. Together they are the whole
post-lesson and student-card surface of the coach app.

| File | Artboard | What it is |
|---|---|---|
| [`features/attendance/SessionSummary.tsx`](../../../web/apps/staff/src/features/attendance/SessionSummary.tsx) | `#9g` | End-of-lesson summary |
| [`features/attendance/StudentCardScreen.tsx`](../../../web/apps/staff/src/features/attendance/StudentCardScreen.tsx) | `#9c` | Student card + class move |
| [`features/people/StaffStudentCard.tsx`](../../../web/apps/staff/src/features/people/StaffStudentCard.tsx) | `#2d` | Card opened from the roster |
| [`features/people/TrialInClass.tsx`](../../../web/apps/staff/src/features/people/TrialInClass.tsx) | `#11b` | Add a trial student mid-lesson |
| [`features/billing/HandOverSheet.tsx`](../../../web/apps/staff/src/features/billing/HandOverSheet.tsx) | `#11a` | In-lesson item handover |
| [`features/attendance/ConflictSection.tsx`](../../../web/apps/staff/src/features/attendance/ConflictSection.tsx) | — | Offline sync conflicts |
| [`features/comms/CoachCalendarFeed.tsx`](../../../web/apps/staff/src/features/comms/CoachCalendarFeed.tsx) | — | Calendar subscription |

**`SessionSummary` (`9g`) is the most consequential.** It is the step after taking a register:
attendance totals, a lesson note, **an injury report that goes to the manager and the parent
immediately**, a message to absentees' parents, and `נשמר מקומית · יסונכרן בחיבור`. A coach
finishing a class currently has nowhere to go. Wire it as the roster's completion step.

**`HandOverSheet` (`11a`)** is the other half of the parent shop (see [`parent.md`](parent.md)
`12e`): items waiting for students **present in this lesson**, `נמסר` marking, out-of-stock
state (`חסר במלאי — המנהל הזמין`), and a delivered-today log. Note its privacy rule, drawn
into the artboard: *"סימון מסירה מעדכן מלאי אצל המנהל. מחיר הפריט אינו מוצג למאמן"* — a coach
never sees prices. It needs an entry point from the session, not from `#/cash`.

**`StudentCardScreen` / `StaffStudentCard` (`9c` / `2d`)** need an entry from both the roster
row and the student list. Between them they specify: belt, age, an 8-session strip, attendance
against the exam threshold (`63% נוכחות — מתחת לסף המבחן (80%)`), guardian phone with call and
message, coach notes (`נזהר בכתף ימין אחרי נפילה (04.08)`), health-declaration expiry with the
participation restriction, and `מעבר כיתה` **gated to the lead coach** — `9c` states both
boundaries explicitly: *"מאמן שאינו ראשי בכיתה זו לא יראה את הפעולה הזו כלל"* and
*"מאמנים אינם רואים נתוני תשלום"*.

**`TrialInClass` (`11b`)** — §5.4a's trial student added during a lesson, with source
attribution (`המלצת חבר` / `אח של חניך` / `פרסום` / `הגיע מהרחוב`) and a health-declaration
link that must be signed `לפני עלייה למזרן`.

---

## Bugs

1. **`sync/bootstrap` fires four times before `/auth/refresh` returns**, taking four 401s;
   later calls succeed. A startup race in the offline-first sync layer — it self-heals, but it
   logs four auth failures on every launch and delays first paint.
   Source: [`web/packages/core/src/`](../../../web/packages/core/src/) offline/sync layer and
   [`features/attendance/OfflinePriming.tsx`](../../../web/apps/staff/src/features/attendance/OfflinePriming.tsx).
2. **`GET /api/v1/setup` returns 403 for a coach** on every screen. Either gate the call
   behind the manager check that already guards `#/cash`, or make the endpoint answer
   an empty result for non-managers.
3. **The first-run tour has no content behind it.** On `#/`, `#/attendance`, `#/cash` and
   `#/join-link` it renders over an empty page, so a new coach's first impression is a tooltip
   pointing at nothing. Either gate the tour until data exists, or ship the empty states.

---

## Cross-cutting work

1. **Bars.** Zero render against 4 in the artboards. `BeltBar` (with the **D7 1px ring**) and
   the attendance strip are shared with the other two apps — build once in
   `web/packages/ui/src/primitives/`.
2. **Accent colours.** Artboards use 1–7 per screen; shipped uses 0–3. `1c` and `9f` alone use
   7 — present/absent/notified/unmarked/health-warning states. Use the semantic tokens from
   [`tokens.css`](../../../web/packages/ui/src/tokens.css); never a raw hex (**D2**).
3. **Offline first.** §6.1 walks this app in a basement. The queue exists in
   `web/packages/core/`; what is missing is the **visible** state — pending count, offline
   badge, conflict resolution (`ConflictSection`).
4. **Permission boundaries are UI.** `9c`, `9e` and `11a` all draw a capability the coach does
   **not** have, labelled. Do not silently hide manager-only features — that is what makes
   `#/cash` and `#/join-link` currently look like broken routes to a coach.
5. **Logical CSS only** (**D10**) and **i18n** in `web/packages/i18n/he/<namespace>.ts`,
   mirrored in `en/` and `ru/`.

## Log

### 2026-08-27 · S7 — the day became cards, and the picker learned to answer

**Today (9a/1d).** The screen had the right bones — the strip, the coach filter, the
roster link — and 20 of 1d's 64 lines. Landed: per-card duration (derived from the two
instants already on the wire), `אולם א׳ · 14 חניכים`, and the `נוכחות נרשמה` chip that is
the difference between "done" and "still owed" at a glance down the day. The header now
sums the day (`5 שיעורים · רון מאמן` when the filter names a coach) and titles the day
being looked at — `היום`, or `יום שלישי · 3 בנובמבר` — with `חזרה להיום` appearing exactly
when the title stops saying היום.

**Headcount came from the server.** `SessionOut` gained `headcount` — the group's LIVE
enrollment, one grouped query per page in `project_sessions`, ended enrollments excluded
(a covering coach must not wait for a child who left — tested). This does not contradict
the schema's no-capacity note: children are enrolled, not booking, and this is how many.

**The picker (9b).** The month grid and the range picker existed; landed on top: the
legend naming both ring colours, the `נוכחות לא סומנה` marking (a PAST day holding an
uncancelled session whose register was never signed — §5.14's report counts exactly
these), and the four quick jumps, each handing back a real range.

**Decision — the "day / week / month / range switcher" is selection modes, not a mode
toggle.** Tapping a day is day; השבוע/שבוע הבא are week; החודש is month; the range picker
is range. Every mode the artboard names is an affordance on one screen; a toggle would add
state at 390px without adding a capability. A multi-day jump lands Today on the range's
first day with the strip anchored there.

### 2026-08-27 · S6 — the register was already the best screen; it now names its room

Three of S6's four items were already done by the time this entry was written: the
`הודיעו מראש` state and the bulk button that refuses to overwrite it were built and tested
(`RosterScreen.test.tsx` — "does NOT overwrite a parent's advance notice"), the parent's
`AbsenceScreen` that produces the state shipped in P1, the health badge landed with S1, and
the offline indicators with S5. The one gap was the header: `מתחילים · 17:00` with no
weekday and no hall, and a coach covering for someone needs the hall.

The header now reads `יום שלישי · 17:00 · מתחילים · אולם א׳`. The weekday comes from
`studioDayKey` — the STUDIO's calendar day, Sunday-first to match `schedule.weekday.*` —
because an evening class near midnight UTC is already tomorrow in Jerusalem. The hall
renders only when the session has one; `location_name` was already on the wire in
`SessionRosterOut`, fetched and dropped. One new key per locale (`roster.dayLabel`)
composes `יום {{weekday}}` from the schedule namespace's existing weekday names.

### 2026-08-27 · S5 — the offline machinery, made visible

**What was wrong.** The machinery was complete and invisible: `usePendingCount` had one
consumer on a screen S2 only just made reachable, `ConflictSection` targeted a container
only the dashboard mounts (fixed in S1), and **nobody mounted `useNetworkMonitor`**, so the
probe loop the whole §10.1 state machine depends on never ran — the mode could only change
when a real request happened to fail.

**What shipped.** `NetworkStatus` in the staff shell, above every screen: the §10.1 mode
label (all five, `api-down` keeping its own `השרת אינו זמין` words) and the pending count,
rendered only when there is something to say. It is also the app's single
`useNetworkMonitor` mount, so the probe loop now actually runs. The conflict surface needed
no new code — S1's `staff-alerts` container plus the existing `ConflictSection` registration
already put §10.5's cards in the shell — so S5's contribution there is the test.

**The test** (`offlineVisible.test.tsx`) walks §6.1's exact path in one it(): forced-offline
shows the badge, a queued mark shows the count, a reconnect flush against a server that
answers `session_cancelled` drains the queue, quiets the strip, and raises a card that is
visible and dismissible in this app. A second test pins that the pending badge is about the
queue, not the network — marks waiting on a working connection still show.

**Vocabulary decision.** No second vocabulary was invented: the shell reads the same
`attendance.network.*` / `attendance.sync.*` keys the roster and the parent AbsenceScreen
already use, and `slow` stays an offline-path mode per §10.1.

### 2026-08-27 · S4 — three of the four defects closed, the fourth sequenced

**The coach 403.** The spec pointed at the ungated `<SetupWizard>` mount at `App.tsx:366`,
but that element is a prop — `Resolve` renders it only on the owner-only `'wizard'` outcome,
so its effect never ran for a coach. The actual per-launch 403 was `Resolve`'s **own**
`GET /setup` read, which fired for every staff identity even though `decideOutcome` can only
route an OWNER into the wizard — the answer could not change the outcome for anyone else.
`Resolve` now asks `/setup` only when the active membership includes `owner`; everyone else
resolves straight to the tour. Decision recorded: a coach never sees the setup wizard —
§3.2 keeps setup at owner/manager, and §5.1's wizard is the owner's first-accept flow
specifically. A manager configures from Settings. Test: a coach session renders `Resolve`
with a fetch spy and the spy is never called at all.

**The 401 race.** `useOfflinePriming` fired on mount, racing `/auth/refresh` — four 401'd
bootstrap calls per cold start. The hook now takes an `enabled` flag and the staff app
passes `session.status === 'signed-in'`, so the first bootstrap call happens after the
session resolves, exactly once — asserted by a gated-harness test (nothing while disabled,
one call after the flip).

**The bare hash.** `#/attendance` fell through in silence to whatever `Resolve` rendered.
It now redirects explicitly to `#/schedule`, where the date picker (9b) is — the screen
where a coach picks the session to mark. Test asserts the redirect.

**The tour over empty screens (S4.4)** is sequenced last per the spec's own advice: S4.3
just filled `#/attendance`, S7 fills `#/` with Today content, and S10 gives `#/cash` and
`#/join-link` visible refusals. Re-verified after those land — see the S7/S10 entries.

### 2026-08-27 · S2 + S3 — the post-lesson surface exists, and the card has two doors

**What was wrong.** Seven built, tested components were referenced only by their barrels —
the entire post-lesson and student-card surface. A coach finishing a class had nowhere to
go; the register simply stayed open. Neither entry point to the student card existed, and
`RosterRow`'s comment claimed `1c` wants the row to open the card while `1c`'s own spec says
the whole row cycles the mark.

**What was built (S2).**
- `#/attendance/<id>/summary` routes `9g`, entered from the register's footer. Its
  injury-report card — deferred by `9g` finding 1 "to whichever wave gives it a model" —
  ships: `POST /sessions/{id}/injury-reports` notifies every guardian and every
  manager/owner immediately under kind `health.injury` (the `health.` prefix is §5.11
  always-on, so no switch can mute a hurt child), and the audit row carries the recipient
  count and never the description. Online-only, mirroring the absence pre-report: a report
  that syncs after everyone has gone home is not a report. The card renders only when a
  real handler exists, and the submit disables offline.
- `#/attendance/<id>/handover` routes `11a` from the session (not `#/cash`), narrowing the
  roster to present marks. `#/attendance/<id>/trial` routes `11b`, taking the group off the
  session. `#/students/<id>` routes `9c`, which renders `2d`'s slot sections.
- `NotificationPreferences` and `CoachCalendarFeed` mount in the 9e drawer, above the
  shared account footer — the drawer they were designed for.

**What was built (S3).** The roster row grew a shell: the row's tap stays the mark cycle
(`1c` line 41 — "the whole row cycles them on tap"), and a named per-child link at the
inline end opens the card. `StudentsSearch` rows already supported `onOpen`; the app now
passes it. Both doors lead to the same `#/students/<id>`.

**Stale claims.** `SessionSummary`'s header said the injury report "cannot be built from a
card" for want of a model — the model existed (notifications + audit); rewritten.
`register.ts`'s "M5's container is not merged yet" was two waves stale; rewritten in S1.


### 2026-08-27 · S1 — the registrations that never ran, and the guard that keeps them running

**What was wrong.** The app called one of its three slot-registration functions.
`registerHealthSections` and `registerCommsSections` were exported and invoked by nothing, so
a coach taking a register saw no health flag on any row — §5.5's coach-facing safety surface,
absent from the running app. Worse, both `ConflictSection` and `AtRiskAlert` targeted
`alert-centre`, a container only the *dashboard* bundle mounts, and slots register inside the
bundle that imports the barrel — so even a called registration could render nowhere. And the
registered `HealthBadge` declared props (`status`/`flags`/`studentId`) the `roster-row` slot
never supplies (`{ row, locale }`), so it would have crashed had it ever been mounted.

**What was built.** `App.tsx` now calls both functions at module load, beside the existing
call. A new `staff-alerts` slot id plus a `StaffAlerts` container mounted in the shell —
visible from Today and the roster, which is where §6.1's basement flow needs a conflict to
surface. `ConflictSection` and the staff `AtRiskAlert` both retarget it.
`RosterHealthBadge` adapts the contract's `{ row, locale }` to the badge. Integration test:
a flagged child's row renders the badge through the slot, and a missing declaration warns
without blocking the mark (C10).

**What was decided.** The staff `AtRiskAlert` is **kept**, not deleted: it reads the coach's
own notification inbox and carries the one-tap dial — the dashboard's copy serves the manager,
a different reader. Its home is the new `staff-alerts` container.

**Guards.** `web/tools/__tests__/slot-wiring.test.ts` fails on (a) any `register*` function a
feature barrel exports that no code in that app calls, and (b) any `registerSlot` target with
no `useSlot` container in the same bundle — across all three apps.

**Stale claims found elsewhere by the guard.** The same class existed on both other surfaces:
the parent app's `registerPeopleSections` was called only by tests (so a real guardian's
student card rendered *no* sections — worse than the parent audit's claim that M3's three are
registered), and the dashboard's `registerCommsAlerts` + `registerBillingDevTools` were never
called (so its at-risk card had never rendered, contradicting the dashboard spec F8's claim
that comms/register.ts:25 registers it). `registerBillingAlerts` was dead code superseded by
`BillingAlertSection` and is deleted. All fixed in this commit.
