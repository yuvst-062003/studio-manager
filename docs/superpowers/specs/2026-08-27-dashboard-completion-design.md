# Manager dashboard — functional completion spec

**Written:** 2026-08-27
**Surface:** `web/apps/dashboard/` plus the backend routes it needs

## The documents around this one

Four layers already exist. Read them in this order before you build; this spec assumes them
rather than repeating them.

| Document | Says |
|---|---|
| [`docs/design/specs/`](../../design/specs/README.md) — 54 files, one per artboard | **What a screen should be.** Regions, states (*including empty, loading and error*), token roles, which of the 18 primitives each part is, and the real i18n key for every string. Read the artboard's file before building that screen. |
| [`docs/design/audit/README.md`](../../design/audit/README.md) | **What shipped, across all three surfaces**, measured in headless Chromium. Also carries three traps for re-running the capture. |
| [`docs/design/audit/dashboard.md`](../../design/audit/dashboard.md) | **What shipped on this surface**, screen by screen, with a status per screen (`OK` / `PARTIAL` / `SHELL` / `MISSING`). |
| [`docs/design/decisions.md`](../../design/decisions.md) | The **D-numbered design decisions** — D5's three calendar views, D7's belt-bar ring, D9's reductions, D10's logical-CSS ban. |

**Numbering.** This spec's workstreams are `F0`–`F13` — **F for functional**. A bare `D5`,
`D7`, `D9.2` or `D10` anywhere below is the repo's own design decision, never a workstream
here. The two numbering schemes are unrelated and would otherwise collide.

This spec is the **functional** counterpart to the audit's **visual** one: inert controls,
routes with no UI, states with no recovery. They overlap deliberately; where they do, this
file states the behaviour and the audit states the pixels.

## What this document is

A dashboard is drawn, shipped, and in several places **inert**. Controls render and do
nothing; screens promise data that arrived two waves ago and was never wired in; a red alert
names a problem the product offers no way to fix; a complete, tested backend sits behind a
read-only table.

None of this is a bug in the ordinary sense — every piece was an honest decision at the time
it was made, and most carry a comment saying so. What is missing is the return visit. This
spec is that return visit, written so a session with no prior context can execute it.

Every claim below was verified against the working tree on 2026-08-27 and carries a
`file:line`. **Verify before you build** — see F0.

---

## How to verify your work

Python tooling lives in `.venv` (Python 3.14). Always use the `.venv/bin/` prefix; a bare
`python3` or `pytest` resolves to an old 3.8 interpreter earlier on PATH.

```
./scripts/dev-db.sh up             # database tests FAIL rather than skip without this
.venv/bin/pytest -q                # backend
cd web && npx vitest run <file> --reporter=dot   # one frontend file
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint
./scripts/lane-check.sh <vertical> # the one command every lane runs
```

Verticals that exist: `attendance` `belts` `billing` `comms` `core` `events` `health`
`people` `privacy` `reports` `schedule` `structure`.

## Ground rules that bite

Read `CLAUDE.md` first. The five that will catch you here:

1. **Money is agorot, integers, never floats.** Timestamps are stored UTC and rendered in
   Asia/Jerusalem.
2. **No string is inlined in a component.** Hebrew lives in
   `web/packages/i18n/he/<namespace>.ts` and is mirrored in `en/` and `ru/`. The namespaces
   are `attendance` `billing` `common` `comms` `events` `health` `people` `reports`
   `schedule`. **Never edit `web/packages/i18n/index.ts`** — it is authored once.
3. **Logical CSS only** (D10). `padding-inline-start`, never `padding-left`. The dashboard
   runs right-to-left in Hebrew and left-to-right in English from the same rules.
4. **`app/main.py` and `app/models/__init__.py` mount by discovery.** Adding
   `app/routers/foo.py` mounts it. Never edit either file to register something.
5. **`app.core.clock.now()` is the only clock.** A test fails the build on any other
   `datetime.now()` in `app/`.

New endpoints are versioned under `/api/v1/`. New models inherit `TenantMixin`. Writes that
touch a person go through `AuditService.record(...)`, and **health declaration contents are
never logged and never rendered on the dashboard**.

---

## F0 — Re-verify before you build

**This is the first task and it is not optional.**

The audit was written on 2026-08-27 and a design pass landed the *same day*, so some of it
describes a tree that has already moved. Take its headline bar finding as the worked example.

`docs/design/audit/README.md` says *"`BeltBar` is not used on any screen we captured"* and
counts zero coloured bars across the product. The **source** disagrees: `BeltBar` is imported
and rendered at `BeltSystemScreen.tsx:217` and `:291`, `BeltsWizardStep.tsx:191` and
`StudentDetailScreen.tsx:113`, and `ProgressBar` at `AttendanceReport.tsx:106`,
`EventCard.tsx:140` and `ReportsSection.tsx:250`. `BeltSystemScreen` is routed — `App.tsx:534`
mounts it at `#/belts/<classId>`.

**Both statements can be true, and the gap between them is itself the finding.** The audit
measured what *rendered during capture*; a component that is imported, routed and never
reached — because the capture stopped at `#/belts`, which is only a class picker, or because
the seeded studio had no belt ranks — renders zero bars while the code says otherwise. So the
question to answer is not "is the audit wrong" but **"why did a routed component not render,
and does it render for a real manager?"** That answer belongs in F13's log. Note the audit
README's own warning that seeded data was lost three times mid-run, and that a second
`buildScenario` closes the first training year and empties the student screens.

**Done when:** you have re-checked each claim in this file and in the audit against the
working tree, and recorded in F13's log any that no longer hold and any you could not
reproduce. Build against what is there, not against what either document says is there.

---

## F1 — The two missing primitives

Everything downstream uses these. Build them first.

### F1a — `LoadFailed`, and recovery as a rule

**Evidence.** 43 dashboard screens catch an API error. **Three** offer a way to recover:
`features/billing/PricesSection.tsx`, `features/comms/DeliveryReport.tsx`,
`features/health/DocumentsScreen.tsx`. The other 40 render a dead end — typically
`<Alert tone="danger">{t(locale, 'common.setup.loadFailed')}</Alert>`, as at
[`StaffScreen.tsx:104`](../../../web/apps/dashboard/src/features/staff/StaffScreen.tsx#L104).
A browser refresh is not a reliable escape: these apps register a service worker
(`registerSW.ts`) and may serve the same failure from cache.

**Build.** One primitive in `web/packages/ui/src/primitives/LoadFailed.tsx`:

```
<LoadFailed locale={locale} onRetry={() => void reload()} detail={...} />
```

It renders the existing danger `Alert` plus a retry `Button`. `onRetry` is **required** —
a screen that cannot retry cannot use the primitive, which is the point. Adopt it in all 40
screens; each supplies a real re-fetch, not a `location.reload()`.

**Do not invent the error copy.** Every per-artboard spec in `docs/design/specs/` carries a
**States** section that already covers *empty, loading and error* — and explicitly notes where
the canvas drew none. It also carries a **Strings → keys** section giving the real i18n key for
each string, or an explicit "no key exists", which is itself a finding to record. Open the
artboard's file for the screen you are touching and use what is specified there. Inventing a
second error message is the same failure the specs README warns about for chips: *"Name the
primitive. Do not describe a chip from scratch."*

**Done when:** `LoadFailed` is exported from `web/packages/ui/src/index.ts` with its own
test; all 40 screens use it; and a guard test fails when a dashboard screen renders the
`loadFailed` string without a retry handler. Put the guard beside the other frontend guards
so it runs in every lane.

### F1b — `Table`

**Evidence.** There is no table primitive. `ls web/packages/ui/src/primitives/` shows
`Alert BeltBar Button Card Checkbox DateRangePicker EmptyState MoneyDisplay ProgressBar
Radio SegmentedControl StatusChip StudentRow Switch TextField ThemeControl Toast` and no
`Table`. Every table is hand-built, which is why the audit's `#/students` finding is
*"the header currently collapses into one run-on string because no widths are assigned"*, and
why `StaffScreen.tsx:40` pins `minInlineSize: '48rem'` and lets the row scroll sideways.

**Build.** `web/packages/ui/src/primitives/Table.tsx`: explicit per-column widths, a required
`<caption>`, `<th scope="col">`, logical alignment (`text-align: start`), its own
`overflow-x` container so the page never scrolls sideways — and **the card fallback F11
needs**. Below a `stackBelow` breakpoint each row renders as a labelled card instead of a
table row.

**Done when:** the primitive exists with tests at both layouts, and the students, staff,
collections, groups and exams tables use it.

---

## F2 — Ten controls that do nothing

**Evidence.** Each of these renders a `<Button>` with no `onClick`, no `type="submit"`, no
`href` and no enclosing form handler. Verified individually:

| Control | Location | Backend |
|---|---|---|
| `detail-freeze` | [`StudentDetailScreen.tsx:188`](../../../web/apps/dashboard/src/features/people/StudentDetailScreen.tsx#L188) | **exists** — `POST /students/{id}/freeze`, [`students.py:368`](../../../app/routers/students.py#L368) |
| `detail-mark-lost` | [`StudentDetailScreen.tsx:228`](../../../web/apps/dashboard/src/features/people/StudentDetailScreen.tsx#L228) | **exists** — `POST /students/{id}/mark-lost`, [`students.py:464`](../../../app/routers/students.py#L464) |
| `alert-convert-<id>` | [`TrialsAwaitingDecisionAlert.tsx:41`](../../../web/apps/dashboard/src/features/people/sections/TrialsAwaitingDecisionAlert.tsx#L41) | **exists** — same route the detail screen's working convert button uses |
| `alert-lost-<id>` | [`TrialsAwaitingDecisionAlert.tsx:44`](../../../web/apps/dashboard/src/features/people/sections/TrialsAwaitingDecisionAlert.tsx#L44) | **exists** — `mark-lost` |
| `export-accountant` | [`CollectionsScreen.tsx:102`](../../../web/apps/dashboard/src/features/billing/CollectionsScreen.tsx#L102) | none — F7b |
| `bulk-reminder` | [`CollectionsScreen.tsx:158`](../../../web/apps/dashboard/src/features/billing/CollectionsScreen.tsx#L158) | none — F7a |
| `send-reminder` | [`CollectionsScreen.tsx:220`](../../../web/apps/dashboard/src/features/billing/CollectionsScreen.tsx#L220) | none — F7a |
| attendance `export` | [`AttendanceReport.tsx:63`](../../../web/apps/dashboard/src/features/attendance/AttendanceReport.tsx#L63) | none — F7b |
| attendance `remindCoach` | [`AttendanceReport.tsx:87`](../../../web/apps/dashboard/src/features/attendance/AttendanceReport.tsx#L87) | none — F7a |
| events `remindNonResponders` | [`EventPage.tsx:182`](../../../web/apps/dashboard/src/features/events/EventPage.tsx#L182) | none — F7a |

Note the irony at `StudentDetailScreen.tsx:191`: a comment beside the *convert* button
explains that it *"had no handler at all, so the one action that turns a trial into a member
did nothing when pressed"* — and the freeze and mark-lost buttons on either side of it still
have none.

**Build (this workstream).** Wire the four whose route already exists. Each needs a
confirmation step — freeze, mark-lost and convert all change a student's status and two of
them are hard to undo. Reuse `useModalDialog` from `@studio/ui`, the way
`ReportsSection.tsx` already gates its send-monthly action. The other six are F7.

**Done when:** the four act, each has a test asserting the request fired with the right body,
and a **guard test fails on any `<Button>` in `web/apps/dashboard/src` with no handler,
`href` or `type="submit"`**. The guard is the deliverable that keeps this closed; the four
fixes are the instances.

---

## F3 — The calendar answers a click

**Evidence.** `WeekBoard.tsx` renders session blocks that are not interactive: its only
handlers are the three week-navigation buttons at lines 180, 184 and 190. Meanwhile
[`QuickViewRoster.tsx`](../../../web/apps/dashboard/src/features/attendance/QuickViewRoster.tsx)
is built, tested, exported from `features/attendance/index.ts:9` — and **imported by nothing**.
The audit flags it under *Unreachable code* and calls mounting it *"the single
cheapest item in this spec"*. It implements D5's *"clicking a session opens a popover with
the roster and inline attendance marking — never leave the calendar to take a register"*.

**Build.** Clicking a session block opens a popover anchored to it, containing the roster
(mount `QuickViewRoster`) and a menu of session actions:

| Action | Route | Notes |
|---|---|---|
| **Move to a different date** | `PATCH /sessions/{id}`, [`sessions.py:160`](../../../app/routers/sessions.py#L160) | `starts_at` and `ends_at` **must be sent together** — `SessionPatch` 422s otherwise, and `ends_at` must be after `starts_at` ([`schedule.py:301`](../../../app/schemas/schedule.py#L301)). The service sets `is_manually_edited`, which protects the change from the next rule expansion ([`service.py:892`](../../../app/services/schedule/service.py#L892)). |
| **Cancel** | `POST /sessions/{id}/cancel`, [`sessions.py:177`](../../../app/routers/sessions.py#L177) | **A reason is required** — the column carries a check constraint and the schema refuses a blank one ([`schedule.py:311`](../../../app/schemas/schedule.py#L311)). Prompt for it; do not send a placeholder. |
| **Delete** | **no route exists** — see below | |
| Add a note | `POST /sessions/{id}/notes`, [`sessions.py:215`](../../../app/routers/sessions.py#L215) | |
| Change the room / the coach | `PATCH /sessions/{id}` — `location_id`, `staff` | Absence is not `null`: omitting `location_id` leaves the room alone, sending `null` clears it. |

**On delete — a decision this spec makes rather than defers.** There is no
`DELETE /sessions/{id}` and there should not be one for most sessions. `Session` carries
`generated_from_rule_id` ([`app/models/schedule.py:208`](../../../app/models/schedule.py#L208)).
When it is **non-null** the session was materialized from a schedule rule: deleting it is
wrong twice over — the next expansion recreates it, and attendance rows may already point at
it. **Cancel is the product's answer there, and the menu offers cancel only.** When
`generated_from_rule_id` **is null** the session is ad-hoc — somebody added a one-off makeup
class — and deleting it is meaningful. Offer delete on those, behind a confirm, via a new
`DELETE /sessions/{id}` that **409s when `generated_from_rule_id` is not null**. The refusal
belongs on the server, not only in the UI that hides the button.

**Done when:** a session block opens the popover; move, cancel, note and coach/room all
round-trip; delete succeeds on an ad-hoc session and 409s on a generated one with a test for
each; `QuickViewRoster` is reachable; and the popover is keyboard-operable and focus-trapped,
like the dialogs W6's a11y sweep fixed.

---

## F4 — The schedule vertical gets its write half

**Evidence.** The backend is complete and the UI calls almost none of it.
[`GroupsAndCycles.tsx`](../../../web/apps/dashboard/src/features/schedule/GroupsAndCycles.tsx)
contains **no `onClick`, no `<Button>`, no `<form>`, no `<input>`, no `<select>`** — it is a
read-only table. The whole schedule vertical issues two writes: `PUT /groups/{id}/schedule`
and `POST` for a closure.

Unused, shipped, tested routes:

- `POST /classes` — [`structure.py:76`](../../../app/routers/structure.py#L76)
- `POST /groups` — [`structure.py:111`](../../../app/routers/structure.py#L111)
- `POST /locations` — [`structure.py:146`](../../../app/routers/structure.py#L146)
- `POST /groups/{id}/staff` — [`structure.py:171`](../../../app/routers/structure.py#L171)

**The sharpest instance.** `StaffScreen` renders a red alert — *"N groups have no coach"* —
and **no screen in the entire product assigns a coach to a group.** The alert names a problem
it gives the manager no way to solve. `POST /groups/{id}/staff` has been shipped since M1.4.

**Build.**

1. **Coach assignment, from two entry points.** From the staff screen's uncovered-groups
   alert (click a group → assign) and from `GroupSchedulePage`. Both call
   `POST /groups/{id}/staff`. Roles are `lead_coach` and `assistant_coach`
   (`features/schedule/client.ts:20`), and `SessionStaff` carries `is_substitute`.
2. **Group create / rename / retire / revive** on `GroupsAndCycles`. `POST /groups` covers
   create. Rename and retire currently exist **only** inside the yearly rollover wizard
   (`POST /rollover/{y}/groups`, [`rollover.py:167`](../../../app/routers/rollover.py#L167)) —
   a club that opens a Tuesday beginners group in November has nowhere to do it. If no
   general-purpose route exists, add `PATCH /groups/{id}`; do not make the manager run the
   rollover wizard out of season.
3. **Class and location management.** `POST /classes` and `POST /locations` have no screen.
   A studio that opens a second hall cannot record it. Put these in `#/settings` or beside
   groups — your call, stated in F13.
4. **Session-level actions** — delivered by F3.

**Done when:** every route above is reachable from the UI; the staff screen's uncovered
alert leads to a working assignment and the count drops when you use it; each new screen has
tests; and `./scripts/lane-check.sh schedule` and `structure` are green.

---

## F5 — Staff, from a table into a lifecycle

**Evidence.** `app/routers/staff.py` is **29 lines and one route**: `GET /api/v1/staff`.
`features/staff/` issues **zero writes** — the only dashboard feature that does.
`StaffScreen.tsx` is a read-only table. The audit measures it at *"172 → 0 controls"*
and calls it *"the only dashboard screen with a real `<table>`, and it has zero interactive
controls."*

Adding a team member by email does not work because **it was never built, on either side.**

**Build — backend.** New routes on `app/routers/staff.py`, all `ManagerOrOwner`:

- `POST /staff/invitations` — `{ email, roles[], first_name?, last_name? }`. Creates an
  invitation with a token and an expiry, and sends the email. **Reuse the existing
  invitation machinery** rather than inventing a second one: `invite_owner` is used by
  `POST /platform/studios/{id}/invite-owner` ([`platform.py:98`](../../../app/routers/platform.py#L98))
  and acceptance already runs through `accept_invitation` at
  [`identity.py:531`](../../../app/routers/identity.py#L531) and the OAuth callback's
  `invitation_token` at [`identity.py:296`](../../../app/routers/identity.py#L296). A staff
  invitation should land in the same place with a different role set.
- `POST /staff/invitations/{id}/resend` — re-sends and extends the expiry.
- `DELETE /staff/invitations/{id}` — revokes a pending invitation.
- `PATCH /staff/{person_id}` — changes roles.
- `POST /staff/{person_id}/deactivate` — ends the membership. Does **not** delete the person:
  they hold audit rows, session assignments and attendance marks. Deactivation is a status
  change. A coach who is the only `lead_coach` on a group must be refused or force a
  reassignment — decide, state it in F13, and test it.

Every one of these writes an audit row via `AuditService.record(...)`. The list route already
respects invitation expiry through `now()` (`staff.py:26`) — keep that true.

**Build — frontend.** `הוספת איש צוות` opens a form (email, name, roles). Pending
invitations already render — `displayName` at `StaffScreen.tsx:70` falls back to the email
because *"a pending invitation has no Person, so the address IS the identity"* — so give
those rows resend and revoke. Give accepted rows a role editor and deactivate. Add the header
summary the companion asks for (`5 אנשי צוות · 50 שעות שבועיות`).

**Done when:** a manager invites a real address, the recipient receives mail, signing in via
that link puts them in the studio with the right roles, and resend / revoke / role-change /
deactivate all work with tests. `./scripts/lane-check.sh structure` green.

---

## F6 — Wizards that let you go back

**Evidence.** Both wizards already have clickable rails —
[`SetupWizard.tsx:268`](../../../web/packages/ui/src/setup-wizard/SetupWizard.tsx#L268) and
[`RolloverWizard.tsx:282`](../../../web/apps/dashboard/src/features/rollover/RolloverWizard.tsx#L282)
— so navigating to an earlier step works today. What does not work is **un-answering** one.

The two wizards resolved that question in opposite directions:

- **Rollover — the server already allows it.** `RolloverStepPatch.status` is
  `RolloverStepStatus` = `pending | done | skipped`, and its docstring says *"`pending` is
  accepted so a manager can reopen a step they ticked by mistake — a one-way ratchet would
  send them back through the whole wizard to correct a single press"*
  ([`rollover.py:65`](../../../app/schemas/rollover.py#L65)). The route's own docstring says
  *"Record that a human answered a step, or reopen one they answered by mistake."*
  **The frontend simply never sends it** — `setStep` is typed `'done' | 'skipped'`.
  This is a pure frontend change.
- **Setup — the server deliberately refuses it.** `SetupStepIn.status` is
  `Literal["done", "skipped"]`, commented *"Deliberately not `pending`. A step reports its
  own outcome, and un-reporting is not one of the two outcomes §5.1 describes — a 422 here is
  more honest than a silent no-op"* ([`setup.py:31`](../../../app/schemas/setup.py#L31)).
  A test pins it against `SETTABLE_STATUSES`.

**Build.**

1. **Rollover:** widen the client's `setStep` to accept `pending` and add a *"reopen this
   step"* control on any step showing `done` or `skipped`. Note that `year` and `generate`
   are derived steps — the server 409s a manual mark on either
   ([`rollover.py:85`](../../../app/services/schedule/rollover.py#L85)) — so they get no reopen
   control, exactly as `StepShell` already withholds Done/Skip from them.
2. **Setup:** reverse the decision. Widen `SetupStepIn` to accept `pending`, update
   `SETTABLE_STATUSES`, **rewrite the comment to record the new reasoning rather than leaving
   a comment that contradicts the code**, and update the test that pins the two together.
   Then add the same reopen control.
3. **Both:** an explicit Back control alongside Done/Skip, and **each step body loads its own
   saved values** so re-entering a finished step shows what was entered rather than an empty
   form. This is the part that makes going back useful; navigation alone is not.

`WizardStepStatus` and `RolloverStepStatus` already include `pending` on the frontend — no
type widening is needed there.

**Done when:** a manager can reopen a step in both wizards, sees their previous answers,
changes one, and re-saves; derived rollover steps still refuse; and the setup wizard's
comment and test describe the behaviour that now exists.

---

## F7 — The six controls that need a backend

### F7a — Reminders

Four buttons want to send a message and no route exists. The only reminder endpoint in the
product is `POST /students/{id}/health-declaration/reminder`
([`health_declarations.py:349`](../../../app/routers/health_declarations.py#L349)) — use it as
the shape to follow.

- **Debt reminder, one household** (`send-reminder`) and **bulk** (`bulk-reminder`).
- **Remind a coach** to mark an unmarked session (`remindCoach`).
- **Remind event non-responders** (`remindNonResponders`).

Build them over the existing comms layer rather than a second delivery path — announcements
already publish, resend and record delivery (`app/routers/comms.py`, and the dashboard's
`dashboardCommsClient.ts` calls `publish` and `resend`). Each reminder must:

- record what was sent and when, so the UI can show *"reminded 2 days ago"* and refuse to
  spam;
- respect the quiet-hours rule the audit cites for the composer
  (`לא נשלחות הודעות אחרי 21:00`);
- send **one message per household**, not one per child — §6.3's rule, which the collections
  screen already follows for debt (`חוב לפי משק בית, לא לפי ילד`);
- write an audit row.

### F7b — Exports

Two export buttons and **no export endpoint anywhere in the backend**. Confirmed: the only
`Content-Disposition` headers in `app/` are the event `.ics` at `events.py:176` and the signed
health-declaration PDF at `health_declarations.py:341`.

- **`ייצוא לרו"ח`** — the accountant export from the collections screen. A club owner hands
  their bookkeeper a file every month; today that is manual. CSV, UTF-8 **with a BOM** so
  Excel opens Hebrew correctly, amounts in shekels formatted from agorot at the boundary
  (never store or compute in floats).
- **`ייצוא דוח נוכחות`** — the attendance report export, same rules.

Note `app/routers/privacy.py` already has an async export job with a poll endpoint for GDPR
data. If either report is large enough to time out, follow that pattern; otherwise stream
directly.

**Done when:** all six buttons act; exports open correctly in Excel with Hebrew intact and
amounts matching the screen; reminders are rate-limited, audited, one-per-household, and
tested; and F2's guard test passes with no exemptions.

---

## F8 — Eleven promises that outlived their feature

**Evidence.** Screens still tell the manager a feature is coming that shipped waves ago. The
worst is self-contradicting: [`AlertCentre.tsx:40`](../../../web/apps/dashboard/src/features/people/AlertCentre.tsx#L40)
renders *"התראות תשלום והתאמות יתווספו בהמשך"* — while
[`features/billing/register.ts:21`](../../../web/apps/dashboard/src/features/billing/register.ts#L21)
and `BillingAlertSection.tsx:96` register exactly those alerts into that container, and
`comms/register.ts:25` registers the at-risk card.

| i18n key | Says | Shipped in |
|---|---|---|
| `people.alerts.sectionsComeLater` | payment + reconciliation alerts come later | M4 / M5 / M6, all registered |
| `common.staff.uncovered.sessionsLater` | uncovered lessons appear once the schedule exists | W2 |
| `people.document.paymentComesLater` | payment status arrives with the billing module | W4 |
| `schedule.groups.beltRangeComesLater` | belt range appears with the belt system | M7.2 |
| `schedule.groups.capacityComesLater` | capacity appears with the student list | M3 |
| `schedule.calendar.attendanceComesLater` | past attendance shown later | M5 |
| `people.card.sectionsComeLater` | belt, attendance, documents, payment added later | all four |
| `common.setup.groups.scheduleLater` | the weekly schedule comes in a later phase | W2 |
| `common.setup.students.acquisitionLater` | import / registration link / manual add open later | M3.4 |
| `people.landing.scheduleComeLater` | the class board is still being built | W2 |
| `common.home.childrenComeLater` | (parent app — check before touching) | verify |

Two rendering sites carry stale hardcoded cells beside these strings:
`StudentsScreen.tsx:194` renders `<td data-testid="students-payment-pending">—</td>` with a
comment reserving it for W4, and `StaffScreen`'s `weekly_hours` reads `—` with a header
explaining that sessions do not exist yet.

**Build.** Each promise becomes the thing it promised: weekly hours computed from sessions,
payment status and balance from `charge`, belt range, capacity as `14/20` with a `מלאה` state,
past attendance. Then **delete the string and its `en`/`ru` mirrors**.

**Done when:** each column shows real data, every stale key is gone from all three locales,
and a **guard test fails when a `*ComesLater` / `*Later` i18n key exists whose feature has
shipped**. The mechanical version — a key that no component references is dead and must be
deleted — is enough to keep the class closed and cheap to run in every lane.

---

## F9 — Global search

**Evidence.** No search exists anywhere in the dashboard: no `type="search"`, no
`role="search"`, no search component, in any of the 43 screens. A manager who wants one child
must know which screen holds them and scroll. In a club-management tool this is arguably the
most-used control there is, and the audit independently asks for it on `#/schedule`
(`חיפוש חניך, קבוצה או מאמן`) and as filter chips on `#/students`.

**Build.** One search in the app shell, reachable from every screen and from the keyboard.
It searches students, guardians, groups and staff, and navigates to the record. Scope every
query through `TenantSession` — it fails closed, so a missing studio raises rather than
returning every studio's rows, and that is the behaviour you want to preserve. Never surface
health-declaration contents in a result.

**Done when:** search finds a student by partial Hebrew name, by guardian name and by phone;
results are keyboard-navigable; and a test asserts a second studio's rows never appear.

---

## F10 — Navigation that knows who is looking

**Evidence.** The nav renders all 18 entries to everyone (`App.tsx:103-120`). The only
role check in the entire dashboard is `canSeeMoney` at
[`App.tsx:389`](../../../web/apps/dashboard/src/App.tsx#L389), and its own comment scopes it
narrowly: it decides *"whether an ABSENT fee may be rendered as free"*, nothing more. A coach
who reaches the dashboard sees `מחירים ומסלולים`, `גבייה` and the staff table in the nav.

The API is not the hole here — `/staff` is `ManagerOrOwner` and fees are redacted server-side.
The hole is that the product offers doors that will answer 403.

**Build.** Derive nav entries from the active studio's roles, read the way `canSeeMoney`
already reads them — off the membership matching `session.activeStudioId`, **not** the first
membership in the list, because §19.4's persona switcher moves the active studio without a
reload. Also handle the direct-hash case: typing `#/prices` as a coach should refuse
gracefully, not render a broken screen.

**Done when:** a coach, a manager and an owner each see the correct nav; a typed hash for a
forbidden route refuses; and a test covers all three roles including a persona switch.

---

## F11 — The dashboard on a phone

**Evidence.** The *shell* is genuinely good: `.studio-sidenav` hides below 1024px
([`primitives.css:799`](../../../web/packages/ui/src/primitives/primitives.css#L799)) and
`NavDrawer` takes over with a real focus trap, rendered on the correct side in both
directions, and *closed means not rendered* rather than moved off-screen.

The *content* is the gap: **zero `@media` queries across all 43 dashboard screens.** Layout
rests entirely on `flex-wrap` and `overflow-x: auto`. `StaffScreen.tsx:40` sets
`minInlineSize: '48rem'` — 768px — so on a 390px phone the staff table is a horizontal
scroller. Nothing tests any screen at a phone viewport.

`CLAUDE.md` says the UI is mobile-first; §6.4 calls the dashboard desktop-first. Both are
true of different layers, and the content layer is the one that never got the phone pass —
even though `StaffScreen`'s own comment concedes *"a manager checking cover on a phone is a
normal case rather than an error."*

**Build.** Wide tables re-render as stacked cards below 768px, via F1b's `Table` primitive so
the behaviour is defined once. Each card leads with the row's identity (the student, the
household, the coach) and labels every value — a bare number in a card has lost the column
header that explained it. Add a viewport test per converted screen at 390px.

**Done when:** students, staff, collections, groups and exams are usable at 390px with no
horizontal page scroll; the drawer still traps focus; and the viewport tests run in the lane.

---

## F12 — Bulk actions outside the rollover wizard

**Evidence.** Row checkboxes exist on the collections screen and feed the dead `bulk-reminder`
button (F2). Bulk operations otherwise exist **only** inside the once-a-year rollover wizard:
`POST /rollover/{y}/groups`, `/students`, `/prices`
([`rollover.py:167`](../../../app/routers/rollover.py#L167) onward).

**Build.** Selection plus a bulk action bar on students, collections and attendance. Start
with what F7 makes possible — bulk reminder — then bulk group move and bulk status change,
reusing the rollover service's bulk primitives rather than writing second implementations.

Follow the rollover UI's refusal shape, which is already right: per-row refusals with a
**machine-readable reason the i18n layer translates**, not one aggregate error
(`features/rollover/BulkOutcomePanel.tsx`). A bulk action that half-succeeds must say which
rows failed and why. Destructive presses go through the focus-trapped confirm dialog
(`features/rollover/ConfirmDialog.tsx`).

**Done when:** selecting rows and applying an action works on all three screens, partial
failures render per row, and nothing destructive fires without a confirm.

---

## F13 — The record of design and build mistakes

**Evidence.** The record already exists and is good:
[`docs/design/audit/dashboard.md`](../../design/audit/dashboard.md) — 27 artboards rendered in
headless Chromium at 1440×900 and compared against the shipped app, screen by screen, with a
measured table (median ~75 lines of drawn content against ~15 shipped; ~88 controls against
~3). It supersedes `docs/design/canvas-review.md`, which audited the canvas as markup only
and said so.

Two things are missing from it. First, it is a **snapshot**, and F0 shows it going stale
within a day of being written. Second, it records *visual* gaps only — the inert buttons, the
missing routes and the dead-end error states in this spec are invisible to a screenshot
comparison. A screenshot cannot tell you a button does nothing when pressed.

**One cross-surface fact worth carrying here.** `docs/design/audit/README.md` finds
**14 built screens that are unreachable** — referenced only by a barrel `index.ts` and
rendered by nothing — and calls it *"the cheapest work in the audit"*. Only one of the 14 is
on this surface: `QuickViewRoster`, which F3 mounts. The other 13 belong to the parent and
staff apps (`AbsenceScreen`, `FirstRegistration`, `PaymentHistoryScreen`,
`PaymentCompleteScreen`, `PaymentStrip`, `CalendarSync`, `EventCalendarButtons`,
`SessionSummary`, `StudentCardScreen`, `StaffStudentCard`, `TrialInClass`, `HandOverSheet`).
**They are out of scope here** and belong in those surfaces' own specs — noted so the next
session does not rediscover them as if they were new, and does not wander off this surface
to fix them.

**Build.**

1. Add a **`## Log`** section to `docs/design/audit/dashboard.md`, newest first. Every
   workstream in this spec appends an entry when it lands: what was wrong, what was built,
   what was decided and why, and any claim in the file that turned out stale.
2. Add a **functional dimension** to each screen entry alongside the measured visual one:
   controls that do nothing, routes with no UI, states with no recovery.
3. Record the decisions this spec asks you to make and state: where class and location
   management lives (F4), what happens to a group's only lead coach on deactivate (F5), the
   setup wizard's reversal on `pending` (F6).
4. Keep the two `test_canvas_matches_spec.py` assertions honest — **C10** (artboard `3f` must
   not regain the health-declaration attendance-block toggle) and **D9.2** (`7c` must not
   regain the `משקל / קטגוריה` column). Both are pinned by that test; if your work touches
   those screens, do not reintroduce what was deliberately cut.

**Done when:** the log exists, every landed workstream has an entry, and each decision above
is written down with its reasoning rather than living only in a commit message.

---

## Order

F0 and F1 first — the re-verify and the two primitives everything else consumes. Then F2 and
F3, which are mostly wiring and buy the most visible improvement per hour. Then the backend
work (F5, F7) in parallel with the schedule UI (F4). Then the cross-cutting passes
(F8–F12). F13 is continuous: it is appended to as each workstream lands, never left to the end.

```
F0 → F1 → F2 → F3 → { F4 | F5 | F7 } → { F8 | F9 | F10 | F11 | F12 }
                                   F13 throughout
```

## Not in scope

- The parent app and the staff app. They get their own specs.
- The visual/pixel work catalogued in the audit, except where a workstream here
  touches the same screen — in which case do both at once rather than twice.
- Anything requiring a schema migration should be raised before it is written: `main` owns
  `alembic/versions/**` and lanes never run `alembic revision`. The only likely candidates
  here are F5's staff-invitation storage and F8's derived columns; check whether an existing
  table already holds what you need before proposing one.
- Recurring payments (הוראת קבע) are marked paid manually. **Do not build automated
  recurring billing** — the provider cannot create them programmatically.

## Ticking the work off

When a workstream lands, tick it in `docs/plan/state.yaml` **in the same commit as the work**.
The cockpit reads that file; a piece finished but not ticked is progress nobody can see. Never
write anything measurable there — no test results, no branch, no environment health. Those are
computed, and a declaration that contradicts a measurement is how a status board stops being
trusted.
