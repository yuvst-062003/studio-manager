# Staff app — functional completion spec

**Written:** 2026-08-27
**Surface:** `web/apps/staff/` · 390×844 · Hebrew RTL · installable PWA, **used on the mat**

## The documents around this one

| Document | Says |
|---|---|
| [`docs/design/specs/`](../../design/specs/README.md) — 54 files, one per artboard | **What a screen should be.** Regions, states (*including empty, loading and error*), token roles, which of the 18 primitives each part is, and the real i18n key for every string. Open the artboard's file before building that screen. |
| [`docs/design/audit/staff.md`](../../design/audit/staff.md) | **What shipped on this surface**, screen by screen, measured at 390×844 as the `lead` coach persona. |
| [`docs/design/audit/README.md`](../../design/audit/README.md) | The cross-surface summary and the capture traps. |
| [`docs/design/decisions.md`](../../design/decisions.md) | The **D-numbered design decisions** — D2's status tokens, D7's belt ring, D10's logical CSS. **C10** is a conflict resolution, not a decision: a missing declaration must not hard-block attendance. |
| [`2026-08-27-dashboard-completion-design.md`](2026-08-27-dashboard-completion-design.md) | The dashboard's spec. **S11 shares its `LoadFailed` primitive with F1a.** |
| [`2026-08-27-parent-completion-design.md`](2026-08-27-parent-completion-design.md) | The parent's spec. **S6's `הודיעו מראש` row state depends on its P1** — the parent app must be able to file an absence report before a coach can see one. |

**Numbering.** Workstreams here are `S0`–`S12` — **S for staff**. The dashboard uses `F`, the
parent uses `P`. A bare `D2`, `D7`, `D10` or `C10` below is the repo's own decision or
conflict record, never a workstream.

## What this document is

The register is the best screen in the product, and the rest of this app is thinner than any
other surface. There are **no inert controls** here — that problem is the dashboard's — but
there are **zero retry affordances across fourteen screens that catch errors**, in the one app
§6.1 walks through a basement.

The defining failure on this surface is different from the other two. It is not stale text or
unwired buttons: it is **slot registrations that never run**. The staff app calls one of its
three registration functions. One consequence is that a coach never sees the warning telling
them a child on the mat has asthma. That is S1, and it goes first.

Every claim below was verified against the working tree on 2026-08-27 and carries a
`file:line`. **Verify before you build** — see S0.

## How to verify your work

```
./scripts/dev-db.sh up             # database tests FAIL rather than skip without this
.venv/bin/pytest -q
cd web && npx vitest run <file> --reporter=dot
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint
./scripts/lane-check.sh <vertical>
```

Always use the `.venv/bin/` prefix — a bare `python3` or `pytest` resolves to an old 3.8
interpreter earlier on PATH. Verticals: `attendance` `belts` `billing` `comms` `core`
`events` `health` `people` `privacy` `reports` `schedule` `structure`.

**Two traps when you look at this app by hand**, both from the audit and both real:

1. Set `localStorage['studio.staff.tour-seen']` before measuring anything. Otherwise
   [`StaffTour.tsx`](../../../web/apps/staff/src/features/identity/StaffTour.tsx) covers four
   routes completely and every screen reads as two lines of text. The key is exported as
   `TOUR_SEEN_KEY` at `StaffTour.tsx:19`.
2. **Today must actually have a class.** The seeded rules are Sunday and Tuesday, so looking
   on a Thursday shows an honest `אין שיעורים היום` that is not a defect.

## Ground rules that bite

Read `CLAUDE.md` first. On *this* surface:

1. **A coach sees `derived_flags`, never declaration contents.** §5.5. The badge reads
   `אסתמה` or `אלרגיה`; the answers behind it are never sent to this app, never rendered,
   never logged.
2. **A missing declaration must not block attendance.** **C10**, resolved 2026-08-26: the
   coach controls the mat and can decline a child; blocking the *record* only makes the
   record wrong. Show the warning, allow the mark.
3. **A coach never sees money.** `9c` states it — *"מאמנים אינם רואים נתוני תשלום"* — and
   `11a` repeats it for the handover sheet: *"מחיר הפריט אינו מוצג למאמן"*. The API already
   redacts; the UI must not reintroduce a price by inference.
4. **This is the app that queues offline work.** §10.2. `pending_ops` must never be lost —
   `main.tsx` requests persistent storage on boot for exactly that reason (§10.6).
5. **Logical CSS only** (**D10**), and no string inlined — `web/packages/i18n/he/<namespace>.ts`
   mirrored in `en/` and `ru/`. **Never edit `web/packages/i18n/index.ts`.**
6. **Never the brand colour in a status position** (**D2**). `1c` and `9f` alone need seven
   states — present, absent, notified, unmarked, health warning — all from semantic tokens.

---

## S1 — Registrations that never run

**This is first, and one part of it is a safety issue.**

**Evidence.** The staff app calls exactly one registration function:
[`App.tsx:65`](../../../web/apps/staff/src/App.tsx#L65) — `registerAttendanceSections()`.
`main.tsx` calls none. Two more are exported from their barrels and **called by nothing**:

- `registerHealthSections` — [`features/health/index.ts:3`](../../../web/apps/staff/src/features/health/index.ts#L3)
- `registerCommsSections` — [`features/comms/index.ts:15`](../../../web/apps/staff/src/features/comms/index.ts#L15)

For comparison, the dashboard calls four (`App.tsx:89`, `:92`, `:96`, `:100`).

**Consequence 1 — the health warning does not exist.**
`features/health/register.ts:17` registers `HealthBadge` into the `roster-row` slot, and
[`RosterRow.tsx:95`](../../../web/apps/staff/src/features/attendance/RosterRow.tsx#L95)
renders `useSlot('roster-row')`. The container is there, the fill is written and tested, and
the function that connects them is never called. **So a coach taking a register sees no
health flag on any row** — §5.5's coach-facing safety surface, absent from the running app.
The audit lists `HealthBadge` as a build item and notes the file exists; the reason it does
not render is this.

**Consequence 2 — a slot with no container.** `registerAttendanceSections` registers two
fills: `AttendanceStrip` into `student-card` (`features/attendance/index.ts:39`) and
`ConflictSection` into `alert-centre` (`:44`). `registerCommsSections` would register
`AtRiskAlert` into `alert-centre` too (`features/comms/register.ts:26`).

**The staff app has no `alert-centre` container.** Its only `useSlot` calls are
`roster-row` (`RosterRow.tsx:95`) and `student-card` (`StudentCardScreen.tsx:61`).
`ConflictSection.tsx:1` names its intended home — *"M3's `alert-centre` container
(dashboard `6c`)"* — but slots register at module load **inside the bundle that imports the
barrel**, and the dashboard never imports staff files. So §10.5's offline sync-conflict cards
can render in no app at all. The staff `AtRiskAlert` has the same problem, and the dashboard
already ships its own separate copy at `features/comms/AtRiskAlert.tsx`.

**Build.**

1. Call `registerHealthSections()` and `registerCommsSections()` at module load in
   `App.tsx`, beside the existing call and for the same stated reason — *"the slots must be
   populated before anything renders."*
2. Give the conflict cards a real home in **this** app — see S5. `ConflictSection`'s target
   changes from `alert-centre` to whatever container S5 builds, and its header comment is
   rewritten to match.
3. Decide what the staff `AtRiskAlert` is for, now that the dashboard has its own. Either give
   it a container here or delete it; a third state — registered into nothing — is not one of
   the options. Record the decision in S12.

**Done when:** a roster row for a student with `derived_flags` renders the badge in the
running app; and **two guard tests hold the class closed**:

- one failing when a `features/*/index.ts` exports a `register*` function that no app entry
  point calls;
- one failing when a `registerSlot` target has no matching `useSlot` container **in the same
  app bundle**.

The second is what catches the `alert-centre` orphan, and it should run across all three apps
— the same mistake is available on every surface.

---

## S2 — Seven screens that nothing renders

**Evidence.** Each is referenced only by its feature's barrel `index.ts`, verified
individually. Together they are the entire post-lesson and student-card surface of the coach's
app.

| File | Artboard | What it is |
|---|---|---|
| [`features/attendance/SessionSummary.tsx`](../../../web/apps/staff/src/features/attendance/SessionSummary.tsx) | `9g` | End-of-lesson summary |
| [`features/attendance/StudentCardScreen.tsx`](../../../web/apps/staff/src/features/attendance/StudentCardScreen.tsx) | `9c` | Student card + class move |
| [`features/people/StaffStudentCard.tsx`](../../../web/apps/staff/src/features/people/StaffStudentCard.tsx) | `2d` | Card opened from the roster |
| [`features/people/TrialInClass.tsx`](../../../web/apps/staff/src/features/people/TrialInClass.tsx) | `11b` | Add a trial student mid-lesson |
| [`features/billing/HandOverSheet.tsx`](../../../web/apps/staff/src/features/billing/HandOverSheet.tsx) | `11a` | In-lesson item handover |
| [`features/attendance/ConflictSection.tsx`](../../../web/apps/staff/src/features/attendance/ConflictSection.tsx) | — | Offline sync conflicts — S1 and S5 |
| [`features/comms/CoachCalendarFeed.tsx`](../../../web/apps/staff/src/features/comms/CoachCalendarFeed.tsx) | — | Calendar subscription |

`StaffStudentCard` is imported by `StudentCardScreen`, so routing the latter reaches both.

**`SessionSummary` (`9g`) first.** It is the step after taking a register: attendance totals,
a lesson note, **an injury report that goes to the manager and the parent immediately**, a
message to absentees' parents, and `נשמר מקומית · יסונכרן בחיבור`. A coach finishing a class
today has nowhere to go — the register simply stays open. Wire it as the roster's completion
step. It is also the **only consumer of `usePendingCount`** (`SessionSummary.tsx:43`), which is
why the sync-pending count is invisible everywhere in the shipped app (S5).

**`HandOverSheet` (`11a`)** is the other half of the parent shop (`12e` in the parent spec):
items waiting for students **present in this lesson**, `נמסר` marking, an out-of-stock state
(`חסר במלאי — המנהל הזמין`), and a delivered-today log. It needs an entry point **from the
session**, not from `#/cash` — `#/cash` is the payment-promise queue and a different feature.
Its privacy rule is drawn into the artboard and repeated in Ground rule 3.

**`StudentCardScreen` / `StaffStudentCard` (`9c` / `2d`)** specify between them: belt, age, an
8-session strip, attendance against the exam threshold (`63% נוכחות — מתחת לסף המבחן (80%)`),
guardian phone with call and message, coach notes
(`נזהר בכתף ימין אחרי נפילה (04.08)`), health-declaration expiry with the participation
restriction, and `מעבר כיתה` **gated to the lead coach**. `9c` states both boundaries in copy;
`2d` enforces them by omission. `9c` finding 7 says the two must be consistent — **pick one
and apply it to both**, and record which in S12.

**`TrialInClass` (`11b`)** — §5.4a's trial student added during a lesson, with source
attribution (`המלצת חבר` / `אח של חניך` / `פרסום` / `הגיע מהרחוב`) and a health-declaration
link that must be signed `לפני עלייה למזרן`.

**Done when:** all seven are reachable by navigation a coach could actually perform;
`SessionSummary` closes a lesson end to end including the injury report; and S1's barrel guard
test also fails on a component exported by a barrel and imported by nothing else.

---

## S3 — How a coach opens a student card

**Evidence, and a correction.**
[`RosterRow.tsx:106`](../../../web/apps/staff/src/features/attendance/RosterRow.tsx#L106)
carries a comment saying *"`1c` says the row opens a student card and cycles a mark"*. The
handler does only the second thing — it cycles the mark, or overrides a pre-report. There is
no `onOpenCard` prop anywhere in the app.

And `1c`'s own spec is unambiguous at line 41: *"The attendance mark has four states and **the
whole row cycles them on tap**."* So the row's tap is correctly the mark cycle, and the card
cannot simply take it over. Meanwhile `StudentsSearch` has **zero interactive controls**
against the artboard's 99 — its rows are not tappable either. **Both entry points to the
student card are missing, and one of them needs an affordance that does not exist yet.**

**Build.** A dedicated control at the row's inline-end — a chevron or info button — that opens
the card, leaving the rest of the row cycling the mark. It must carry its own accessible name:
`1c` finding at line 121 already flags that *"no accessible name appears on any icon-only
element in the export"*, including the back chevron and the health badge, so fix that class
while you are in the file rather than adding a second nameless icon.

Then make `StudentsSearch` rows tappable, opening the same card. Two entries, one screen.

**Done when:** the card opens from a roster row and from the student list; tapping the rest of
the row still cycles the mark with no regression to the register; every icon-only control in
`RosterRow` has an accessible name; and the affordance is keyboard-reachable.

---

## S4 — Four defects

**1. Every coach takes a 403 on every screen.**
[`App.tsx:366`](../../../web/apps/staff/src/App.tsx#L366) mounts
`<SetupWizard client={setupClient} …/>` **ungated**, and `SetupWizard` reads `GET /setup` in an
effect. That route is `ManagerOrOwner`
([`setup.py:40`](../../../app/routers/setup.py#L40)). `viewerIsManager` already exists at
`App.tsx:153` and already guards `#/cash` (`:337`) and `#/join-link` (`:339`) — apply it here.
Decide whether a coach should see the wizard at all; if not, do not mount it.

**2. The startup 401 race.** `sync/bootstrap` fires four times before `/auth/refresh` returns,
taking four 401s; later calls succeed. It self-heals, but it logs four auth failures on every
launch and delays first paint on the app that most needs a fast cold start. Look at the
offline/sync layer in `web/packages/core/src/offline/` together with
[`OfflinePriming.tsx`](../../../web/apps/staff/src/features/attendance/OfflinePriming.tsx) —
priming should wait on a resolved session rather than racing it.

**3. `#/attendance` falls through.** Only `#/attendance/<sessionId>` has a branch
(`App.tsx:171`), so the bare hash silently renders the date-picker screen. Add an index — the
coach's own sessions awaiting a register is the obvious one — or redirect explicitly. **Do not
leave it falling through**; this is the same class as the parent app's belt route.

**4. The tour points at nothing.** On `#/`, `#/attendance`, `#/cash` and `#/join-link` the
first-run tour renders over an empty page, so a new coach's first impression is a tooltip
pointing at empty space. Either gate the tour until there is content behind it, or ship the
empty states — S7 and S4.3 supply most of them, so sequence this last and it may resolve
itself.

**Done when:** a coach signs in and no request 403s; the launch makes one bootstrap call after
the session resolves, asserted by a test; `#/attendance` resolves or refuses visibly; and the
tour never renders over an empty screen.

---

## S5 — Offline, made visible

**Evidence.** The machinery is complete. `web/packages/core/src/offline/` ships `pendingOps`,
`store` (IndexedDB), `network`, `sync` (`flush`, `listConflicts`, `dismissConflict`),
`priming`, `queueMark`, `staleQueue` and `useOffline`. `OfflinePriming` and `useQueueFlusher`
are wired into the app.

**What is missing is every visible trace of it.** `usePendingCount` has exactly one consumer —
`SessionSummary.tsx:43` — and that screen is unreachable (S2). `ConflictSection` registers into
a container that does not exist (S1). So a coach in a basement gets no `לא מקוון` badge, no
`3 שיעורים ממתינים לסנכרון` count, and no way to see or resolve a conflict. §6.1 walks this
exact flow.

**Build.**

1. **A persistent network/pending indicator in the app shell** — offline badge and pending
   count — visible from the roster and from today, which is where `1c`, `9a` and `1d` all draw
   it.
2. **A conflict surface in this app.** `ConflictSection` moves off `alert-centre` and into a
   real container here, reachable when `listConflicts()` is non-empty. Conflicts are produced
   by the coach's queue and are the coach's to resolve; a card on the manager's dashboard is
   the wrong end of the wire.
3. Preserve §10.1's four network states as `AbsenceScreen` models them on the parent surface —
   `slow` counts as an offline path. Do not invent a second vocabulary.

**Done when:** a coach going offline sees it, a queued mark shows in a pending count, a
conflict is visible and resolvable in the staff app, and a test covers the offline → queue →
reconnect → flush → conflict path.

---

## S6 — The register

**Evidence.** `#/attendance/<sessionId>` is the best screen in the product and measures `OK`
— real counters, `סימון כולם כנוכחים` with the correct caveat
(`לא ידרוס דיווחי הורים או סימונים קיימים`), tap-to-cycle rows, and §5.14's
`אפשר לערוך את הנוכחות בכל זמן`. What follows is completion, not repair.

**Build.**

1. **Session context in the header** — `יום א׳ · 17:00 · אולם א׳`. Shipped omits the weekday
   and the hall. A coach covering for someone needs the hall.
2. **The `הודיעו מראש` row state.** §5.14 makes advance notice distinct from absence, and `9f`
   auto-marks it: `2 הורים דיווחו היעדרות מראש — מסומן אוטומטית`. `RosterRow` already carries a
   `preReported` branch. **This depends on the parent spec's P1** — until `AbsenceScreen` is
   reachable, nothing in the product can produce the state, so build P1 first or you cannot see
   this work.
3. **The health flag on a row** — delivered by S1. Per **C10** it warns and never blocks.
4. **Offline indicators** — delivered by S5.

**Done when:** the header carries weekday and hall; a parent-filed absence renders as
`הודיעו מראש` and is not silently overwritten by `סימון כולם כנוכחים`; and the health badge
renders without blocking a mark.

---

## S7 — Today, and the date picker

**Evidence.** `#/` and `#/schedule` measure 20 lines and 8 controls against `1d`'s **64**.
The day strip and the coach filter work — `9a`'s *"מסנן מאמן במקום פיצול מסכים"* is the right
call and is implemented.

**Build.**

1. **Session cards** — per-lesson time, duration (`45 דק׳`), group, hall and headcount
   (`אולם א׳ · 14 חניכים`), and a **`נוכחות נרשמה` state marker**. These are `1d`'s three bars
   and none of it renders.
2. **Header summary** — `5 שיעורים · אלון מזרחי`, and `היום` / `יום א׳ · 23 באוגוסט`.
3. **The offline banner** — S5.
4. **`9b`'s full date picker** — day / week / month / range switcher, a month grid, the
   `יש שיעורים` and `נוכחות לא סומנה` **legend**, and quick jumps (`השבוע` / `שבוע הבא` /
   `החודש` / `30 יום אחרונים`).
5. **`חזרה להיום`.**

**Done when:** a coach opening the app sees their day as cards with headcount and register
state, and can reach any date through `9b`'s picker with its legend.

---

## S8 — Student search

**Evidence.** `#/students` measures 17 lines and **0 controls** against `9h`'s 99. It lists
name, group and `פעיל`, and the rows do not respond.

**Build.**

1. **Tappable rows** opening the student card — S3.
2. **Class grouping and filter tabs** — `הכיתות שלי · 3`, `מתחילים`, `נבחרת`, with per-class
   headers carrying counts (`ג׳ודו / מתחילים · 25`).
3. **The warning banner** — `2 חניכים עם הצהרת בריאות חסרה`. Status only; never contents.
4. **Per-student belt, tenure and attendance** — `ירוקה · 5 חודשים · 92%`, with the belt bar
   (**D7** ring) and the percentage coloured against the exam threshold.
5. **Search by student *or parent* name** — `חיפוש לפי שם חניך או הורה`. A coach is more often
   told a parent's name than a child's.

**Done when:** search finds a child by partial Hebrew name and by parent name, rows open the
card, and the class tabs filter.

---

## S9 — Events and exam results

**Evidence.** `#/events` measured 2 lines and 0 controls — but **no events existed when it was
measured**, so `SHELL` is unproven. `#/events/<eventId>` (exam results, `9d` variant 2) was not
measured at all because no exam existed. `ExamResultsScreen`, `ExamResultMark` and `BeltPair`
are routed from `App.tsx`.

**Seed an event and an exam before you conclude anything here.** Then:

**Build — `9i`.** `הכיתות שלי · 3 קרובים`; typed cards (`אימון מיוחד` / `מבחן חגורה` /
`תחרות`) with date, time and venue; **ownership markers `אתה האחראי` and `אתה הבוחן`** — `9i`'s
whole point is *"מה שלי, מי אישר, ומה נשאר לעשות"*; capacity (`42/54`); consent state
(`כל האישורים נחתמו`); outstanding work (`הזמנות טרם נשלחו` with `שליחה`); `רשימת משתתפים`;
`אירוע חדש`.

**Build — `9d#2`.** `BeltPair` is the before/after belt display and must carry the **D7 ring**;
the variant uses seven accent colours.

**Done when:** both screens are measured against seeded data, the ownership markers render for
the right coach, and a belt promotion shows its before/after pair.

---

## S10 — Permission boundaries are UI

**Evidence.** For a coach, `#/cash` and `#/join-link` are gated on `viewerIsManager`
(`App.tsx:337`, `:339`) and fall through to the date-picker screen — so **the app looks broken
rather than restricted**. Meanwhile `9e` draws the opposite approach deliberately: the drawer
lists `מסמכים של חניכים`, `תשלומים וגבייה` and `מעבר חניך בין כיתות` **greyed out** with
`לא זמין בהרשאה שלך` and the footnote *"פעולות אלה שמורות למאמן הראשי של הכיתה"*. Nothing in
`NavDrawer.tsx` or `AccountDrawerFooter.tsx` implements it.

Showing a locked capability teaches the role; a silent fall-through teaches nothing and reads
as a bug.

**Build.**

1. `#/cash` and `#/join-link` **refuse visibly** for a coach instead of rendering another
   screen.
2. The drawer's permission-boundary list from `9e`, with its footnote.
3. The coach identity block (`שירה לוי · מאמנת · קראטה / ילדים · נוער`) and work counters
   (`היסטוריית נוכחות 1`, `הכיתות שלי 2`); `בקשת החלפה`.
4. Reconcile `9c`'s two rules with `2d`'s enforcement-by-omission — S2 already asks you to
   pick one; apply the same choice here so `מעבר כיתה` behaves identically in both places.

**Done when:** a coach sees why a capability is unavailable rather than a wrong screen, and a
test covers coach / lead-coach / manager against each gated surface.

---

## S11 — Recovery, and bars

**Evidence — recovery.** Fourteen staff screens catch an API error and **not one offers a
retry**. The dashboard manages 3 of 43 and the parent 1 of 19; this surface is 0 of 14, in the
app used furthest from a good network.

**Build.** Adopt the **same `LoadFailed` primitive** the dashboard spec's F1a defines — a
required `onRetry`, the existing danger `Alert`, a retry `Button`. Whichever surface lands it
first owns it; do not write a second. Each screen supplies a real re-fetch, never
`location.reload()`. On this app a failed read must also distinguish *offline* from *broken*,
using S5's network state — "you are offline" and "that failed" are different messages and only
one of them is worth retrying immediately.

**Evidence — bars.** Zero coloured bars render against 4 in the artboards (`1d` 3, `9i` 1).
`BeltBar` exists as a primitive with its D7 ring; no staff screen imports it. The attendance
strip is needed by `2d`, `9c` and `9h` here, and by the parent's `2c` — **one shared primitive,
built once** in `web/packages/ui/src/primitives/`, per the parent spec's P10.

**Done when:** all 14 screens can retry, an offline failure says so rather than offering a
pointless retry, and both bar types render from shared primitives.

---

## S12 — The record

**Evidence.** [`docs/design/audit/staff.md`](../../design/audit/staff.md) is the record and it
is good — 14 artboards rendered and compared, with both measurement traps documented, a
route fall-through table and three bugs it found by running the app rather than reading it.
What it has no place for is what happens next.

**Build.**

1. Add a **`## Log`** section, newest first. Every workstream appends when it lands: what was
   wrong, what was built, what was decided, and any claim that turned out stale.
2. Record the decisions this spec defers: S1.3's fate for the staff `AtRiskAlert`, S2's choice
   between `9c`'s stated rule and `2d`'s omission, S4.1's answer on whether a coach sees the
   setup wizard at all, and S5's conflict-surface location.
3. Add the **functional dimension** to each screen entry — registrations that never run, slots
   with no container, states with no recovery. None of these is visible to a screenshot, and
   the biggest finding on this surface was invisible to the audit for exactly that reason.

**Done when:** the log exists, every landed workstream has an entry, and each decision is
written down with its reasoning rather than living only in a commit message.

---

## Order

S1 first — it is a safety fix and its guard tests protect everything after it. S2 next, and
`SessionSummary` before the rest of it, because S5's pending count needs a home and S3 needs a
card to open. Then the defects, then the screens.

```
S1 → S2 (SessionSummary first) → S3 → S4 → S5 → { S6 | S7 | S8 | S9 } → S10 → S11
                                                            S12 throughout
```

**Two cross-surface dependencies, both real:**

- **S6.2 needs the parent spec's P1.** A coach cannot see `הודיעו מראש` until a parent can file
  an absence report, and today nothing in the product can.
- **S11 shares the dashboard spec's F1a primitive**, and S11's bars share the parent spec's
  P10. Build each once, in `web/packages/ui/src/primitives/`.

## Not in scope

- The dashboard and the parent app — each has its own spec.
- **Blocking attendance on a missing declaration.** **C10** resolved this: warn, never block.
- **Showing a coach any price or payment data.** §3.2, `9c` and `11a` all say so; the API
  already redacts and the UI must not reintroduce it by inference.
- **Removing the offline queue.** It is correct that this app queues writes and the parent app
  does not (§10.2). S5 makes the queue visible; it does not change what it does.
- Schema migrations should be raised before they are written — `main` owns
  `alembic/versions/**` and lanes never run `alembic revision`. Nothing here obviously needs
  one; `11a`'s stock state is the item to check first.

## Ticking the work off

When a workstream lands, tick it in `docs/plan/state.yaml` **in the same commit as the work**.
Never write anything measurable there — no test results, no branch, no environment health.
Those are computed, and a declaration that contradicts a measurement is how a status board
stops being trusted.
