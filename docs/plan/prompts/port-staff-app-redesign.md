# Port the staff app redesign

**Run this session on Opus 5.** You are the manager. Sonnet 5 does the typing.

---

## What this is

There is a new design for the coach-facing staff app, built as a React prototype in AI
Studio. It has to become the real `web/apps/staff/` — the same way the parent app redesign
was ported, screen by screen, against the real API.

**The design is not the hard part. The wiring is.** The prototype invents three things the
system does not have (tasks, a training timer, coach constraints) and says nothing about how
any of them reach the manager's dashboard, the notification feed, or the schedule. Those
answers do not exist in either the prototype or the repo. Getting them out of the owner,
before anybody writes code, is the first job.

- **Prototype:** `~/Downloads/staff-app` — read the source directly (`src/App.tsx`,
  `src/types.ts`, `src/components/*`, `src/data/mockData.ts`). Do not run it, do not npm
  install it, do not copy files out of it.
- **Repo:** `/Users/yuvalstolin/Desktop/studio-manager` — read `CLAUDE.md` first, then
  `.claude/rules/ui-rtl-a11y.md`.

---

## Roles

**You (Opus 5) are the manager.** You investigate, you decide, you ask the owner, you
review, and you own every claim made to the owner. You do not write feature code.

**Sonnet 5 writes and runs the code.** Spawn it with the Agent tool and
`model: "sonnet"` — one agent per bounded unit of work.

Rules for delegation, because a manager who delegates badly is slower than one who types:

- **Never delegate a decision.** A subagent gets a spec, not a question. If an agent comes
  back asking what something should do, that is your failure, not theirs — answer it and
  re-dispatch.
- **One screen or one seam per agent.** Not "port the app". Not "fix the tests".
- **Every dispatch carries: the files to read, the exact acceptance criteria, the commands
  to run, and what NOT to touch.** An agent that discovers scope is an agent that widens it.
- **Parallelise only what cannot collide.** Two agents editing `App.tsx` will silently lose
  each other's work. Serialise anything that touches the shell, the router, the i18n
  registries, or `alembic/versions/**`.
- **You verify. They report.** A subagent saying "all tests pass" is a claim, not a result.
  Re-run the command yourself before you repeat it to the owner.
- Backend work (models, migrations, endpoints) is higher risk than screen porting. Give
  those to Sonnet with a tighter spec and read the diff yourself.

---

## Phase 0 — read, do not ask yet

Build the inventory before you spend a single question. Delegate the reading to two or three
Sonnet agents in parallel and merge their findings yourself.

**The prototype's shape** (verified 2026-09-06 — confirm it still holds):

- Five tabs: `schedule · students · timer · tasks · account`
- Three screens: `main · calendar · constraints`
- Components: `ScheduleView`, `StudentsView`, `TimerView`, `TasksView`, `AccountView`,
  `BottomNav`, `CalendarOverviewScreen`, `CoachConstraintsScreen`, `AttendanceModal`,
  `AddStudentModal`, `StudentDetailModal`, `AttendanceTrendChart`
- Types: `Student`, `ScheduleItem`, `TaskItem`, `TimerTemplate`, `CoachConstraint`,
  `ParentContact`, `SessionHistory`

**What the backend already has**, so nothing gets rebuilt: `schedule.py`, `sessions.py`,
`session_rosters.py`, `attendance.py`, `students.py`, `staff.py`, `calendar.py`, `comms.py`
(which already serves `/notifications`, `/announcements`, `/notification-preferences`),
`belts.py`, `billing.py`, `events.py`, `health*.py`, `training_plans.py`, `reports.py`.

**What it does not have — grep confirmed, no model, no router, no service:**

- `timer` — zero hits anywhere in `app/`
- coach `availability` / `constraint` as a domain — zero hits (the word appears only as SQL
  constraints)
- a **task** entity — the `task` hits in `app/` are unrelated wording

**What the staff app looks like today:** `AppShell` from `@studio/ui` with a drawer, nav of
`today · schedule · students · attendance · announcements`, features in
`web/apps/staff/src/features/{attendance,billing,comms,events,health,identity,legal,people,privacy,schedule}`.
Note that the staff app still uses `AppShell` — the parent app replaced it with its own
Tailwind shell, and you will need to decide whether staff follows.

**The manager's dashboard** (`web/apps/dashboard/src/features/`) has:
`attendance belts billing comms events health home people platform reports rollover schedule
settings staff training`. There is no tasks screen and no constraints-approval screen.

---

## Phase 1 — find the missing details, then ask

The gap is **not** the visual design. It is the connection between the prototype and what
exists, and between the systems themselves. Work these out as far as the code can tell you,
then put the rest to the owner with **AskUserQuestion** — batched, concrete, with a
recommended option first. Do not ask what you can read.

The known unknowns, as leads rather than a script. Verify each before asking; some may
already be answered in the repo:

1. **Tasks — stored or derived?** The prototype's `TaskItem` carries
   `primaryActionType: 'close_session' | 'mark_received' | 'parent_call'`, which all look
   *derived* from state the system already has (an unclosed session, an unpaid charge, a
   missing declaration). If they are derived, there is no task table and no way to assign
   one. If they are stored, a manager needs somewhere to create and track them — and that
   screen does not exist in the dashboard. This is the single biggest fork in the whole
   port. Ask it first, and ask it clearly.
2. **Who sees a completed task?** If a coach closes a task, does the manager learn about it,
   and where — dashboard screen, notification, both, neither?
3. **Coach constraints — the approval loop.** `CoachConstraint` has
   `status: 'approved' | 'pending'` and a `substituteCoach`. Somebody approves it and
   somebody is named as substitute, and neither exists today. Does approval belong in the
   dashboard? Does approving actually reassign the session's coach in `schedule`, or is it
   a note the manager acts on by hand? What happens to a constraint filed for a session that
   already has a roster?
4. **The timer — whose is it?** `TimerTemplate` has `isCustom` and `createdAt`. Personal to
   one coach, shared across the studio, or authored by the manager? That decides whether it
   needs a backend at all, and whether it belongs in the dashboard too. Note also that the
   staff app is the offline one (§10) — a timer that loses its templates in a basement is
   worse than one that never had them.
5. **Notifications for staff.** `/notifications` exists and the parent app consumes it. Does
   a coach have an inbox? Do tasks or constraint approvals push into it? Is there a badge on
   a tab, as the parent app has?
6. **Navigation.** The prototype's five tabs do not match the staff app's current nav, and
   several current screens (`billing`, `events`, `health`, `privacy`, `legal`, `install`,
   `cash`, `join-link`, `setup`) have nowhere to live in the new bar. Where do they go — the
   `account` tab, a drawer that survives, or somewhere else? **No screen may become
   unreachable**; `unreachable-screens.test.ts` exists because that has already happened
   once on this project.
7. **Coaches versus managers.** The staff app serves both (`isCoach`, `CAPABILITIES` in
   `@studio/core`). Which of the five tabs does a coach see and which need a manager? Does a
   coach see other coaches' constraints?
8. **Scope and order.** Is this one release or several, and which tab ships first?

Put these to the owner in AskUserQuestion with real options and a recommendation. Where a
question does not change what you build next, decide it yourself, say so, and move on.

---

## Phase 2 — write the spec, then stop

Once the answers are in, write `docs/superpowers/specs/YYYY-MM-DD-staff-app-redesign.md`:
every screen, every endpoint it needs, which of those exist and which are new, the data
shapes, the migration list, and the order of work. Name the things you are deliberately not
building.

**Show the owner the plan and wait for a yes before any code is written.** Not a summary of
the plan — the plan.

---

## Phase 3 — build, one screen at a time

The parent app port established this loop, and it works:

1. **Say what you understood before coding.** Describe the screen you are about to build in
   your own words and let the owner correct you. Cheaper than building it twice.
2. Dispatch one Sonnet agent for that screen with a full spec.
3. Review the diff yourself.
4. **Screenshot it and look at it.** Put the comparison in
   `docs/screenshots/staff-checkpoints/<screen>/` — the prototype's screen beside yours.
5. **Stop and wait for a yes** before moving to the next screen.

Do not batch four screens and present them together. The whole value of the loop is that a
misread is caught on screen one.

---

## Non-negotiables

These are the repo's, not mine. `CLAUDE.md` has the full list; these are the ones this port
will actually trip over.

- **Hebrew strings live in `web/packages/i18n/he/<namespace>.ts`**, mirrored in `en/` and
  `ru/`. Never inline a string in a component. `packages/i18n/index.ts` and `types.ts` are
  shared registries — one agent touches them, in one commit, or lanes serialise on it.
- **RTL and logical CSS only.** `margin-inline-start`, never `margin-left`. Stylelint and
  ESLint both enforce it and they are two separate mechanisms.
- **Money is integer agorot. Timestamps are UTC, rendered Asia/Jerusalem.
  `app.core.clock.now()` is the only clock.**
- **New models inherit `TenantMixin`.** It fails closed. New endpoints go under `/api/v1/`.
- **`main` owns `alembic/versions/**`.** One revision per wave, in the wave's own commit.
- **Health declarations are personal data about minors. Never log their contents.**
- **The staff app is the offline one** (§10.2, §10.6): `pending_ops`, the flusher, and
  persistent storage. Anything a coach does on a mat must survive a basement.
- **Write a failing test before fixing a bug.**
- **Tick `docs/plan/state.yaml` in the same commit as the work.** Nothing measurable goes
  in it.
- **Stage by explicit path. Never `git add -A`** — other sessions share this checkout.

### Verification, which is where this project has been burned

- **Scope test runs to what the change can reach.** Baseline a pre-existing failure once, on
  `main`, not on both branches.
- **A verification claim expires the moment you edit again.**
- **Test the seam, not just the component.** A field added to an API is not proven by a test
  that hand-builds the component's props. Assert `fetch → state → component`.
- **If it renders, render it and look.**
- **When something you shipped misbehaves, read your own diff before theorising.**
- Guard the wiring, not only the behaviour. `unreachable-screens.test.ts`,
  `inert-buttons.test.ts` and `routes.reachable.test.ts` all exist because something shipped
  fully built and connected to nothing.

### Commands

```
.venv/bin/pytest -q                          # backend (never a bare pytest)
npx vitest run <file> --reporter=dot         # one frontend file
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint
./scripts/lane-check.sh <vertical>
./scripts/dev-db.sh up                       # DB tests fail rather than skip without it
```

---

## Done means

Every screen in the prototype either exists in `web/apps/staff/` against the real API, or is
written down in the spec as deliberately not built, with the reason. No screen that worked
before is unreachable. Typecheck, lint and the touched suites are green, and you ran them
yourself. The owner has seen each screen and said yes to it.

**Start with Phase 0. Do not ask a question you have not first tried to answer from the
code.**
