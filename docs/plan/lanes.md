# Lanes — worktree setup and opening prompts

Companion to [milestone-plan.md](milestone-plan.md). That document decides *what* runs in
parallel and *why*. This one is operational: the commands to create each lane, the directories
it owns, and the prompt to paste into it.

Four parallel waves, two build lanes each, plus one review session that runs across both.

---

## 1. Before any worktree exists

### 1.1 One-time setup, in M0

**`.worktreeinclude`** — carries gitignored, machine-local files into every new worktree so a
lane is not dead on arrival. Claude Code reads this when creating a worktree.

```
.env.local
.claude/settings.local.json
```

Do **not** list `.venv/` or `node_modules/` here. Copying them is slow and, for `.venv`, wrong
— the interpreter path is baked into the scripts. §1.3 sets them up per worktree instead.

**Permission allowlist** — apply conflict **C8** from the milestone plan before the first lane
runs, or every `.venv/bin/pytest` prompts. In `.claude/settings.json`:

```json
"allow": [
  "Bash(.venv/bin/pytest:*)", "Bash(.venv/bin/ruff:*)", "Bash(.venv/bin/mypy:*)",
  "Bash(.venv/bin/alembic upgrade:*)", "Bash(./scripts/lane-check.sh:*)",
  "Bash(npx eslint:*)", "Bash(git worktree:*)"
],
"deny": [ "Bash(.venv/bin/alembic downgrade:*)" ]
```

### 1.2 Every wave opens with the contract commit — on `main`, before the worktrees

```bash
cd ~/Desktop/studio-manager
git switch main && git pull

# … author the contract commit for this wave (milestone-plan.md §2.2) …

.venv/bin/alembic upgrade head        # clean on a fresh DB and on last wave's DB
.venv/bin/pytest -q
npm run generate:api-client           # the diff must be committed, or CI fails (§8.2)
git add -A && git commit -m "contract(wN): models, migration, schemas, seams, i18n namespaces"
git push
```

**Do not create the worktrees before this is pushed.** A lane branched from a pre-contract
`main` will invent its own version of the seam, which is exactly what the contract exists to
prevent.

### 1.3 Per-worktree bootstrap

Each worktree needs its own Python environment and node modules. Run this inside a new
worktree, once:

```bash
python3.14 -m venv .venv
.venv/bin/pip install -e ".[dev]"
npm ci --prefix web
```

> `.venv` cannot be symlinked from the main checkout — the absolute interpreter path is written
> into `.venv/bin/*`, so a symlinked env silently runs the wrong tree's code. `node_modules`
> *can* be symlinked if disk matters, but `npm ci` is a minute and correctness is worth it.

**All worktrees of one repo share the same auto-memory directory**, so what one lane learns
about the codebase is available to the others. That is a feature — do not try to isolate it.

---

## 2. The four waves

Same shape every time. Only the names and globs change.

### Wave 2 — M2 Schedule ∥ M3 People & funnel

```bash
cd ~/Desktop/studio-manager
git worktree add ../sm-schedule -b feat/m2-schedule main
git worktree add ../sm-people   -b feat/m3-people   main
```

```bash
# terminal 1
cd ../sm-schedule && python3.14 -m venv .venv && .venv/bin/pip install -e ".[dev]" \
  && npm ci --prefix web && claude
#   then:  /rename schedule

# terminal 2
cd ../sm-people && python3.14 -m venv .venv && .venv/bin/pip install -e ".[dev]" \
  && npm ci --prefix web && claude
#   then:  /rename people

# terminal 3 — review session, stays on main
cd ~/Desktop/studio-manager && claude
#   then:  /rename review
```

### Wave 3 — M4 Health ∥ M5 Attendance

```bash
git worktree add ../sm-attendance -b feat/m5-attendance main
git worktree add ../sm-health     -b feat/m4-health     main
```

### Wave 4 — M6 Money ∥ M7 Events & belts

```bash
git worktree add ../sm-money  -b feat/m6-money  main
git worktree add ../sm-events -b feat/m7-events main
```

### Wave 5 — M8 Communication ∥ M9 Reports & privacy

```bash
git worktree add ../sm-comms   -b feat/m8-comms   main
git worktree add ../sm-reports -b feat/m9-reports main
```

### Closing a wave

Merge order is fixed by the milestone plan — **the callee before the caller**, so the second
lane rebases onto a base that already has what it calls.

| Wave | Merge first | Then |
|:--:|---|---|
| W2 | `feat/m2-schedule` | `feat/m3-people` |
| W3 | `feat/m5-attendance` | `feat/m4-health` |
| W4 | `feat/m6-money` | `feat/m7-events` |
| W5 | `feat/m8-comms` | `feat/m9-reports` |

```bash
# review the FIRST lane's diff before it touches main — never after
cd ~/Desktop/studio-manager
git switch main
git diff main...feat/m2-schedule        # read this, or dispatch spec-auditor at it
git merge --no-ff feat/m2-schedule
.venv/bin/pytest -q && npm run typecheck && .venv/bin/mypy app && npm run lint
git push

# rebase the second lane onto the new main, re-run ITS check inside its worktree
cd ../sm-people
git fetch origin && git rebase origin/main
./scripts/lane-check.sh people

# review, merge, full suite again
cd ~/Desktop/studio-manager
git diff main...feat/m3-people
git merge --no-ff feat/m3-people
.venv/bin/pytest -q && npm run typecheck && .venv/bin/mypy app && npm run lint

# wave exit gate — the E2E flows for this wave (milestone-plan.md §2.1)
npx playwright test e2e/05-schedule-change.spec.ts
npx playwright test e2e/01-registration-to-active.spec.ts

git push
git worktree remove ../sm-schedule && git worktree remove ../sm-people
git branch -d feat/m2-schedule feat/m3-people
```

> Merging both branches at once and then debugging is the worst version of this. One lane, full
> suite, then the next.

---

## 3. Opening prompts

One per lane. Paste verbatim into a fresh session in that worktree. Every one carries the
stop-and-tell clause.

### The clause, and why it is in all eight

> If you need to change a file you do not own — a migration, a shared schema, a UI primitive,
> another lane's directory — **stop and tell me. Do not edit it.**

That sentence is the only thing keeping lanes from silently reaching into each other. A lane
that "just adds one field" to a shared Pydantic schema breaks the other lane's generated
api-client and neither session will notice until merge. When a lane stops, the change is made
on `main`, both lanes rebase, and the contract stays true.

---

### Lane SCHEDULE — M2

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W2 · Lane SCHEDULE
  @SPEC.md §5.6, §5.15, §7 (the /sessions, /training-years, /closures block)
  @CLAUDE.md
Skim @docs/design/canvas/INVENTORY.md for your artboard IDs. DO NOT open
docs/design/canvas/*.dc.html — they are ~856 KB of inline-styled HTML and will
swamp your context. Open them in a browser if you need to look.

YOU OWN, and nothing else:
  app/models/schedule.py            app/services/schedule/**
  app/routers/schedule.py           app/routers/sessions.py
  app/workers/schedule.py           tests/schedule/**
  web/apps/staff/src/features/schedule/**
  web/apps/parent/src/features/schedule/**
  web/apps/dashboard/src/features/schedule/**
  web/packages/i18n/{he,en,ru}/schedule.ts

DO NOT modify: alembic/versions/** (a hook will block you), app/models/__init__.py,
app/main.py, app/schemas/** , web/packages/{ui,core,api-client}/**, any i18n file
other than schedule.ts, or anything under app/services/people/ or
web/apps/*/src/features/people/. If you need a change in any of those, STOP AND
TELL ME. Do not edit it.

BUILD: training years · closure calendar with Israeli holiday presets · schedule
rules · session materialization for the whole training year · per-session overrides
· ad-hoc sessions · the impact-preview dialog on PUT /groups/{id}/schedule.

DELIVER these artboards: parent 12b · staff 9a, 9b, 1d · dashboard 3a, 6a, 4b.

THE INVARIANT THIS LANE EXISTS TO PROTECT (§5.6, and E2E flow 5): changing a
schedule rule rewrites ONLY future sessions. Sessions in the past and any session
with is_manually_edited = true are NEVER overwritten. The change dialog shows
exactly what will happen before it happens.

CONSTRAINTS: .venv/bin/ prefix on all Python tooling — a bare pytest resolves to an
old 3.8 interpreter. Timestamps stored UTC, rendered Asia/Jerusalem. No inline
Hebrew — everything through web/packages/i18n/*/schedule.ts. Logical CSS properties
only; the D10 ESLint rule will reject margin-left. Treat the exported canvas CSS as
a visual reference, never copy-paste it.

Plan first with superpowers:writing-plans. Then, per task: write the failing test
from the acceptance criteria, run it and confirm it fails, implement the minimum,
run it green, commit. Show me the test output.

Your check is:  ./scripts/lane-check.sh schedule
Do not tell me a task is done until that command is green. Show me the output.
```

---

### Lane PEOPLE — M3

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W2 · Lane PEOPLE
  @SPEC.md §5.3, §5.4, §5.4a, §6.1, §6.3, §7 (/students, /public, /trial-bookings)
  @CLAUDE.md
Skim @docs/design/canvas/INVENTORY.md for your artboard IDs. DO NOT open
docs/design/canvas/*.dc.html — ~856 KB of inline-styled HTML. Browser only.

YOU OWN, and nothing else:
  app/models/people.py              app/services/people/**
  app/routers/students.py           app/routers/enrollments.py
  app/routers/public.py             app/routers/trial_bookings.py
  app/workers/followups.py          tests/people/**
  web/apps/{staff,parent,dashboard}/src/features/people/**
  web/apps/parent/src/features/landing/**
  web/packages/i18n/{he,en,ru}/people.ts

DO NOT modify: alembic/versions/**, app/models/__init__.py, app/main.py,
app/schemas/**, web/packages/{ui,core,api-client}/**, any i18n file other than
people.ts, or anything under app/services/schedule/ or
web/apps/*/src/features/schedule/. If you need a change there, STOP AND TELL ME.

You are a READER of sessions, never a writer. Get bookable trial slots through
ScheduleService.materialize_sessions() and GET /sessions. If you find yourself
wanting to create or edit a session row, that is the schedule lane's job — stop
and tell me.

BUILD: students, guardians, enrollment · the public trial landing page with
sign-in-first booking and the session picker · lead/trial statuses and
student_status_history · manager conversion · trial follow-up automation · person
and child matching · the approval queue · parent-initiated add-sibling · freeze and
leave · invitations.

DELIVER these artboards: parent 13a, 13b, 13c, 12j, 12g, 12i, 2c · staff 11b, 9c,
9h · dashboard 3b, 3c, 4a, 6c.
  - 2c (parent student card) and 6c (dashboard alert centre) are CONTAINERS. Build
    the container plus your own sections, and register them through registerSlot()
    from web/packages/ui/src/slots.ts. Later milestones add belt, attendance,
    documents, payment and reconciliation sections through the same registry. Do
    not hardcode sections you do not own.

INVARIANTS:
  - Enrollment is ALWAYS a manager decision. The public link's only job is to get
    someone through the door for a first lesson. Nobody enrolls themselves (§5.4).
  - Never create a duplicate guardian. Submissions match on VERIFIED email or phone.
  - All guardians on a student are equal and see the same things, payments
    included. is_primary decides only two things: whose name the bill is addressed
    to, and which person a הוראת קבע payment matches. There is no permission
    branching inside the guardian view.
  - There is no household or family entity. "My children" is
    SELECT student_id FROM guardian WHERE person_id = me.
  - registration_request.payload_encrypted uses the M0 AES-256-GCM envelope. It
    contains a minor's data — never log it (§11.1, CLAUDE.md §Gotchas).
  - The trial health declaration writes against the SEEDED kind='trial' template
    shipped in M1. You do not build a template editor and you do not touch the
    kind='full' PDF-derived template — that is M4.

CONSTRAINTS: .venv/bin/ prefix. Money in agorot, integers — no floats. Timestamps
UTC, rendered Asia/Jerusalem. No inline Hebrew. Logical CSS properties only.
Canvas CSS is a visual reference, never copy-paste.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh people
Do not claim done until it is green. Show me the output.
```

---

### Lane ATTENDANCE — M5

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W3 · Lane ATTENDANCE
  @SPEC.md §5.7, §10 (all of it — 10.1 through 10.6), §7 (/attendance, /sync)
  @CLAUDE.md
Also read, in @docs/architecture.html, the sections "Four network states, not two",
"Authentication while offline — the one that bites", "Cross-actor conflicts",
"Staleness & cache budget" and "Offline scope per client".
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/attendance.py          app/services/attendance/**
  app/routers/attendance.py         app/routers/sync.py
  tests/attendance/**
  web/packages/core/src/offline/**          ← you are the ONLY owner of this
  web/apps/staff/src/features/attendance/**
  web/apps/parent/src/features/absence/**
  web/apps/dashboard/src/features/attendance/**
  web/packages/i18n/{he,en,ru}/attendance.ts

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, the rest of web/packages/{ui,core,api-client}/**, any i18n file other
than attendance.ts, or anything under app/services/health/ or
web/apps/*/src/features/health/. STOP AND TELL ME instead.

THE HEALTH SEAM — read this twice. The roster shows a health badge. You do NOT
build it and you do NOT open the health lane's files. You render:
    <HealthBadge status={row.health_status} flags={row.derived_flags} />
from the two fields the contract commit already put in BootstrapPayload.roster[].
The health lane owns that component and populates those fields. If the badge
renders nothing today, that is correct — it fills in when M4 merges.

BUILD: roster UI · bulk mark with the pre-report protection rule · parent absence
reporting · the offline queue · sync · conflict handling.

DELIVER these artboards: parent 2a, 12a · staff 1c, 9f, 9g, 2d · dashboard 4c, 1e.

THIS IS THE HIGHEST-RISK LANE IN THE PROJECT. Four things must be true, each with
its own test:

1. FOUR NETWORK STATES, NOT TWO. Never trust navigator.onLine — it is true on a
   captive-portal wifi that routes nowhere. Derive mode from actual request
   outcomes against a lightweight ping. A 6s timeout demotes a request into the
   offline path rather than spinning. Intermittent is treated as offline until TWO
   CONSECUTIVE requests succeed. "API down, client online" is a distinct state from
   offline: queueable writes still queue, non-queueable ones are blocked with an
   explanation, never a silent failure.

2. OFFLINE WRITES NEVER DEPEND ON A VALID TOKEN. Marks go to pending_ops
   regardless of auth state — the local write is not an API call. On reconnect,
   refresh then flush. If the refresh token has also expired, the queue is
   PRESERVED, not discarded; the user signs in again and it flushes, validated
   against the same person_id. If the re-authenticated identity is a DIFFERENT
   person, the queue is NOT flushed — it becomes a conflict card for a manager.
   There is no code path anywhere that discards unsynced work.

3. CROSS-ACTOR CONFLICTS. Coach marks offline while a manager cancels that session
   → marks are accepted and stored, and a card appears for the manager
   ("השיעור בוטל — התקבלו 22 סימוני נוכחות"). Never silently dropped, never
   silently applied to a cancelled session's reports. Same for a student unenrolled
   meanwhile. Two coaches on one session → last write by device_marked_at, EXCEPT a
   parent pre-report, which never loses to a bulk action regardless of timestamp.
   Same device flushes twice → idempotent no-op on client_mark_id.

4. pending_ops IS EXEMPT FROM EVICTION UNDER ALL CIRCUMSTANCES. The cache is
   bounded to two days of sessions, evicted oldest-first. Unsynced work is the one
   thing that must never be reclaimed.
   iOS CANNOT FULLY GUARANTEE THAT, and we ship no native container (§6.5), so
   manage it rather than assume it: require standalone display mode in the staff
   app, call navigator.storage.persist() on boot, and show a BLOCKING warning when
   unsynced work has been queued for longer than one session. A coach must never
   discover at the end of the month that a session's marks evaporated.

ALSO: offline priming is not optional — first launch blocks on fetching today's and
tomorrow's sessions and rosters into IndexedDB before the coach reaches Today, and
it re-runs on every foreground resume. A parent's absence pre-report REQUIRES a
connection on purpose; the app says so rather than queuing it into the void.
unmarked is a real state — never default a row to present or absent.

CONSTRAINTS: .venv/bin/ prefix. Timestamps UTC, rendered Asia/Jerusalem — and
device_marked_at is the client's clock, which you must not trust for anything but
conflict ordering. No inline Hebrew. Logical CSS properties only. Canvas CSS is a
visual reference, never copy-paste.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit. Use the dev bar's offline and slow
toggles to exercise the paths — they exist for exactly this.

Your check is:  ./scripts/lane-check.sh attendance
Do not claim done until it is green. Show me the output.
```

---

### Lane HEALTH — M4

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W3 · Lane HEALTH
  @SPEC.md §5.5, §11.1, §11.2, §11.6, §7 (/health-templates, /health-declaration)
  @CLAUDE.md
Also read, in @docs/architecture.html, "Parent app — hard block", "The mat — never
blocked" and "What gets stored, and who can read it".
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/health.py              app/services/health/**
  app/routers/health.py             app/workers/health_reminders.py
  tests/health/**
  web/apps/parent/src/features/health/**
  web/apps/dashboard/src/features/health/**
  web/apps/staff/src/features/health/HealthBadge.tsx
  web/packages/i18n/{he,en,ru}/health.ts

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, web/packages/{ui,core,api-client}/**, any i18n file other than
health.ts, or ANYTHING under app/services/attendance/ or
web/apps/*/src/features/attendance/. STOP AND TELL ME instead.

THE ATTENDANCE SEAM — read this twice. Your badge appears on the coach's roster,
but you do NOT open the roster file. Build HealthBadge.tsx in your own directory
and register it:
    registerSlot('roster-row', { key: 'health', order: 10, render: HealthBadge })
The attendance lane's roster renders whatever the registry holds. Your other job on
that seam is to POPULATE student.health_status and health_declaration.derived_flags
so the badge has something to show. Those two columns are already in the contract
commit — you write them, the attendance lane reads them, neither of you touches the
other's file.

BUILD: the kind='full' template mapped from the studio's PDF into a versioned
health_form_template.schema · the declaration flow with a finger-drawn signature ·
encryption of answers and signature image · derived_flags · signed-PDF rendering ·
the parent app gate.

You do NOT build the kind='trial' template — it ships seeded from M1 and M3 already
writes against it.

DELIVER these artboards: parent 12c · dashboard 4e. Your staff-surface deliverables
have no artboard of their own and are slot fills: the ⚠ "הצהרת בריאות חסרה" badge
with its one-tap "שלח תזכורת להורה" on the roster, and the derived_flags chips on
the staff student card (9c).

INVARIANTS — these are the ones that matter most in this lane:
  - THE GATE IS IN THE PARENT APP ONLY, and it is a hard block: a guardian with any
    child at health_status = missing routes into the declaration flow and no other
    screen is reachable.
  - NOTHING ON THE MAT IS EVER BLOCKED. The roster shows the ⚠ and a reminder; the
    coach can still mark that student present. There is deliberately NO
    block_attendance_without_health setting. Do not add one, do not add an option
    for one. Blocking a row in an app does not stop a child stepping onto a mat —
    it only makes the record wrong.
  - COACHES SEE derived_flags ONLY — booleans, e.g. {"asthma": true}. NEVER free
    text. Reading the full declaration requires manager or owner and EVERY READ IS
    AUDIT-LOGGED.
  - NEVER LOG DECLARATION CONTENTS. Not the answers, not the signature, not in an
    exception, not in a debug line. This is personal medical data about minors.
  - Declarations DO NOT EXPIRE. valid_until stays NULL.
    health_declaration_validity_months defaults to null and is a CONFIG FLAG, NOT A
    MIGRATION.
  - Escalating parent reminders on days 1, 3 and 7. Use the dev bar's time travel
    (X-Dev-Now) to test them — do not wait a week.
  - HEBREW PDF RENDERING is known-fiddly: it needs an embedded Noto Sans Hebrew
    face and explicit bidi handling. It gets a golden-PDF fixture test comparing
    rendered output byte-for-byte against a checked-in reference. Budget real time
    for this; it is the part of this lane that will take longer than you expect.

CONSTRAINTS: .venv/bin/ prefix. Timestamps UTC, rendered Asia/Jerusalem. No inline
Hebrew. Logical CSS properties only. Canvas CSS is a visual reference, never
copy-paste.

BLOCKED ON: docs/forms/health-declaration.pdf must exist before you start — the
whole template derives from it. If it is not there, stop and tell me immediately
rather than inventing a schema.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh health
Do not claim done until it is green. Show me the output.
```

---

### Lane MONEY — M6

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W4 · Lane MONEY
  @SPEC.md §5.10, §12, §7 (/price-plans through /reconciliation)
  @upay-integration.md
  @.claude/skills/payments/SKILL.md
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/billing.py             app/services/billing/**
  app/integrations/upay/**          app/routers/billing.py
  app/routers/payments.py           app/routers/webhooks.py
  app/workers/billing.py            tests/billing/**
  web/apps/{staff,parent,dashboard}/src/features/billing/**
  web/packages/i18n/{he,en,ru}/billing.ts

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, web/packages/{ui,core,api-client}/**, any i18n file other than
billing.ts, or anything under app/services/{events,belts}/ or
web/apps/*/src/features/{events,belts}/. STOP AND TELL ME instead.

You are the CALLEE this wave. The events lane calls
BillingService.create_charge(kind='event', ...). Do not change that signature — it
is in the contract commit and the other lane is coding against it. If it is wrong,
stop and tell me; we fix it on main and both lanes rebase.

BUILD: price plans · product catalog · debt escalation ladder · the billing run
with proration · the charge/payment/allocation ledger · the uPay one-time flow with
every §5.10 security requirement · the reconciliation queue · payer fingerprints ·
manual payments and adjustments.

DELIVER these artboards: parent 1b, 12e, 12f · staff 11a · dashboard 3e, 5a, 5e.
  - 12f ships under D9.3: titled תשלומים, NOT קבלות ותשלומים, and the email
    affordance is scoped to CARD ROWS ONLY. uPay issues a חשבונית/קבלה for card
    payments only; there is no tax document for cash, bank transfer or הוראת קבע.
    A screen promising all receipts live there is false for the payment methods
    §5.10 expects to be common. The canvas may still show the old title — the
    decision wins.
  - 5e is wizard step 4. Register it into the 'setup-wizard' slot. Do not open
    M1's SetupWizard container.

INVARIANTS — this lane handles real money; each of these is a test:
  - ALL MONEY IS INTEGER AGOROT. Never a float, never a Decimal, never a currency
    library. A model-level test rejects float columns.
  - CHARGES ARE NEVER MUTATED TO RECORD PAYMENT. A charge is settled when its
    payment_allocation rows sum to amount_agorot. charge.status is a DERIVED CACHE
    maintained in exactly one place: BillingService.recompute_charge_status.
  - charge.payer_person_id is captured at creation from the student's primary
    guardian. If the primary guardian changes later, historical charges stay with
    whoever actually owed them.
  - PRORATE THE FIRST MONTH ONLY, from MATERIALIZED SESSIONS, not calendar days:
    round(monthly × remaining_sessions ÷ total_sessions_in_period). Store the
    original amount and a readable proration_note. Closures, holidays and absences
    NEVER change the amount thereafter — the monthly fee buys the slot, not the
    sessions.
  - THE BILLING RUN IS IDEMPOTENT across repeated executions. Test it by running it
    twice and asserting the second run creates nothing.
  - uPay's IPN HAS NO CRYPTOGRAPHIC SIGNATURE. UUID order refs + IP allowlist +
    independent amount verification are mandatory, not optional.
  - THE uPay FORM IS CLIENT-SUBMITTED AND amount IS EDITABLE. amount_mismatch is a
    real state that records the REAL money received. Do not settle the charges.
    Alert the manager.
  - THE RETURN REDIRECT IS NEVER THE SOURCE OF TRUTH. The IPN arrives ~5 minutes
    after payment. /payment-complete is a landing page, not a state transition.
  - NO AUTOMATED RECURRING BILLING. uPay recurring links are dashboard-created
    only, share ONE fixed amount across ALL parents, and their IPNs carry NO
    customer identifier. Do not build a mandate creator. Do not build automatic
    matching. הוראת קבע is reconciled by a human, assisted by payer_fingerprint
    (four digits + normalized card-owner name). Manual in month 1, mostly one-tap
    by month 3 — that is the design, not a shortcoming.
  - NO CARD OWNER NAMES OR LAST-4 DIGITS IN APPLICATION LOGS.
  - The demo studio's uPay config is pinned to livesystem=0, and a test asserts a
    demo studio can never render a live payment form.

Exercise all four IPN cases from the dev bar's simulator — success, amount
mismatch, forged ref, duplicate. Those four ARE §5.10's security requirements.
Without the simulator they are only testable against live money.

CONSTRAINTS: .venv/bin/ prefix. Timestamps UTC, rendered Asia/Jerusalem. No inline
Hebrew. Logical CSS properties only. Canvas CSS is a visual reference.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh billing
Do not claim done until it is green. Show me the output. Expect me to run
security-reviewer over this whole diff before it merges.
```

---

### Lane EVENTS — M7

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W4 · Lane EVENTS
  @SPEC.md §5.8, §5.9, §7 (/belt-ranks, /events)
  @docs/design/decisions.md D3, D7   — belt colours are DATA, and every belt bar
                                       carries a 1px ring
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/events.py              app/models/belts.py
  app/services/events/**            app/services/belts/**
  app/routers/events.py             app/routers/belts.py
  tests/events/**                   tests/belts/**
  web/apps/{staff,parent,dashboard}/src/features/events/**
  web/apps/{staff,parent,dashboard}/src/features/belts/**
  web/packages/i18n/{he,en,ru}/{events,belts}.ts

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, web/packages/{ui,core,api-client}/**, any i18n file other than
events.ts and belts.ts, or ANYTHING under app/services/billing/,
app/integrations/upay/ or web/apps/*/src/features/billing/. STOP AND TELL ME.

You are the CALLER this wave. An event fee creates a charge through
BillingService.create_charge(kind='event', ...). You never write to a billing table
directly and you never touch the uPay integration. If create_charge does not do
what you need, stop and tell me — do not work around it.

BUILD: event types · targeting · RSVP · event fees · event consent · event
attendance · belt ranks including bi-colour grades · grading history · belt exams.

DELIVER these artboards: parent 12d, 12h, 7d · staff 9d, 9i · dashboard 7a, 7b, 7c,
6b, 4d, 5b, 5d.
  - 7c ships under D9.2: the משקל / קטגוריה column is CUT. §2.2 defers weight
    categories to v2 and they imply student fields §4.3 does not carry. RSVP
    counts, parent consent and payment status all stand. The canvas may still show
    the column — the decision wins.
  - 5d is wizard step 2. Register it into the 'setup-wizard' slot. Do not open M1's
    SetupWizard container.
  - 12d, 2c's belt strip and 9c's belt display all render belt_rank.color_hex.

INVARIANTS:
  - EVERY BELT BAR CARRIES A 1px RING in the current foreground colour — #17150f on
    light grounds, #fffefb on dark. NEVER fill-only. Fill alone makes a white belt
    invisible on light (1.08:1), a black belt invisible on dark (1.02:1), and a
    yellow belt fail even the 3:1 non-text threshold (2.02:1). Yellow is one of the
    most common children's grades, so it is on real rosters constantly. This
    applies to the belt bar beside a student name, belt progression segments, and
    the belt strip on the student card — anywhere color_hex is rendered as a fill.
  - BELT COLOURS ARE DATA, NOT BRAND. belt_rank.color_hex is defined per class.
    Never use a belt colour as a UI accent, and keep them visually distinct from
    the three semantic colours (#b3261e debt, #1f6b3f paid, #8a5a00 pending).
  - Bi-colour belts are real and correct for children's judo grades — 5b specifies
    them. Support them in the model, not as a special case in the view.
  - Event consent is a consent_record row (consent_type='event'), versioned, with
    IP. Revocation is recorded, never deleted.
  - No brackets, no medals, no weight categories. All v2 (§2.2).

CONSTRAINTS: .venv/bin/ prefix. Money in agorot, integers — event fee_agorot
included. Timestamps UTC, rendered Asia/Jerusalem. No inline Hebrew. Logical CSS
properties only. Canvas CSS is a visual reference, never copy-paste.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh events && ./scripts/lane-check.sh belts
Do not claim done until both are green. Show me the output.
```

---

### Lane COMMS — M8

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W5 · Lane COMMS
  @SPEC.md §5.11, §5.12, §12, §7 (/announcements through /calendar-feeds)
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/comms.py               app/services/comms/**
  app/routers/comms.py              app/routers/calendar.py
  app/workers/notify.py             tests/comms/**
  web/apps/{staff,parent,dashboard}/src/features/comms/**
  web/packages/i18n/{he,en,ru}/comms.ts

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, web/packages/{ui,core,api-client}/**, any i18n file other than
comms.ts, or anything under app/services/{reports,privacy}/ or
web/apps/*/src/features/{reports,privacy,platform}/. STOP AND TELL ME.

You are the CALLEE this wave. The reports lane calls
NotificationService.enqueue(...) from its retention and at-risk jobs. Do not change
that signature.

BUILD: announcements · push + inbox delivery with delivery reporting and the
push-disabled banner · at-risk alerts · notification preferences · ICS calendar
feeds · per-event calendar buttons.

DELIVER these artboards: parent 2b · dashboard 4f. Your staff-surface deliverables
have no artboard of their own: push_token registration for the staff app,
notification preferences inside the existing 9e drawer (register into that
container's slot — do not reopen it), the coach's at-risk push with its one-tap
"צור קשר עם ההורה", and the coach ICS feed (calendar_feed.subject_type='coach').

INVARIANTS:
  - 2b ships under D9.1: keep the עדכוני מועדון inbox, CUT שיחה עם המשרד. §2.3
    lists in-app two-way chat as EXPLICITLY OUT OF SCOPE. §5.11 permits exactly two
    levels: a push notification and a ONE-WAY in-app inbox. A conversation thread
    with the office is a third thing and is not in v1. The canvas may still show
    it — the decision wins. If reaching the office is a genuine gap, that is a spec
    change to argue on its merits, not something to absorb through a mockup.
  - NO WHATSAPP AUTOMATION. The Groups API caps a group at 8 participants and
    exposes no endpoint to add one; unofficial libraries violate ToS and get the
    number banned. Only a share-sheet handoff is viable. Do not add a dependency
    that talks to WhatsApp.
  - ON iOS, WEB PUSH EXISTS ONLY FOR A HOME-SCREEN WEB APP. In a Safari tab the
    Push API is ABSENT — not denied, absent. There is nothing to request and no
    permission to grant. Detect standalone display mode before you even consider
    showing a push prompt; on iOS in a tab, show the install walkthrough instead.
    Android Chrome allows Web Push in a normal tab, so the two platforms take
    different paths here and you must not share one code path between them.
  - PUSH PERMISSION IS OPT-IN on iOS and Android 13+, so SOME PARENTS WILL NEVER
    RECEIVE ALERTS. That is why delivery reporting and the push-disabled banner
    exist. Never assume a notification arrived.
  - YOU ALSO OWN INSTALL-STATE REPORTING: which guardians are running standalone,
    and therefore which ones CAN receive push at all. On iOS that is the same
    question as "did they install". Surface it on the dashboard beside the
    delivery report, as a list the office can phone. §5.11 permits no email or
    SMS fallback, so a parent who is neither installed nor answering the inbox is
    reachable only by telephone — the product's job is to make that list visible,
    not to pretend it is empty.
  - Ask for push behind a VALUE PRE-PROMPT first ("נודיע לך אם שיעור מתבטל"), then
    the OS dialog. Never the raw OS dialog on launch — on iOS a denial is permanent
    and cannot be re-requested in-app.
  - APPLE HAS NO THIRD-PARTY CALENDAR WRITE API, and Google Calendar write is a
    restricted scope requiring an annual third-party security assessment. ICS
    SUBSCRIPTION IS THE ONLY OPTION. Do not attempt calendar writes.
  - Calendar feed tokens are unauthenticated URLs — they must be unguessable and
    rotatable, and rotation must invalidate the old one immediately.
  - At-risk = three or more consecutive absences. It fires a notification to the
    group's coaches AND to managers with a one-tap contact action. It is not left
    sitting in a report nobody opens.

CONSTRAINTS: .venv/bin/ prefix. Timestamps UTC, rendered Asia/Jerusalem — and ICS
must carry correct Asia/Jerusalem VTIMEZONE data, not floating times. No inline
Hebrew. Logical CSS properties only. Canvas CSS is a visual reference.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh comms
Do not claim done until it is green. Show me the output.
```

---

### Lane REPORTS — M9

```
Read, in this order:
  @docs/plan/milestone-plan.md   — Global Constraints, and W5 · Lane REPORTS
  @SPEC.md §5.14, §11.3, §11.4, §11.5, §18.2, §18.3, §7 (/reports, /privacy,
           /platform)
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

YOU OWN, and nothing else:
  app/models/reports.py             app/services/reports/**
  app/services/privacy/**           app/routers/reports.py
  app/routers/privacy.py            app/routers/platform.py
  app/workers/retention.py          tests/reports/**   tests/privacy/**
  web/apps/dashboard/src/features/{reports,privacy,platform}/**
  web/apps/parent/src/features/privacy/**
  web/packages/i18n/{he,en,ru}/reports.ts   ← privacy strings go here, under privacy.*

DO NOT modify: alembic/versions/**, app/schemas/**, app/models/__init__.py,
app/main.py, web/packages/{ui,core,api-client}/**, any i18n file other than
reports.ts, or anything under app/services/comms/ or
web/apps/*/src/features/comms/. STOP AND TELL ME.

You are the CALLER this wave. Your at-risk and retention jobs notify through
NotificationService.enqueue(...). You never write a notification row directly.

BUILD: financial, operational and funnel reports with CSV/XLSX export on every
table · studio overview · data export · anonymization · the retention job · the
platform operations board and break-glass access.

DELIVER: dashboard 4g. Your parent-surface deliverable is the data-export request
row on the profile screen (12i) — register it into that container's slot, do not
reopen it. Your staff surface is receipt of the at-risk push; no screen.

INVARIANTS:
  - 4g has NO COLOURED CHARTS. The monochrome direction survived the whole canvas
    and it survives dataviz too. Encode with position, length and labelling, not
    hue. Where a status colour is genuinely needed, use the semantic tokens
    (#b3261e debt, #1f6b3f paid, #8a5a00 pending) and never a chart palette.
  - "SESSIONS HELD VS PLANNED" IS WHY unmarked MUST BE A REAL STATE. Never let a
    report treat unmarked as absent, or as present. Competitors default one way or
    the other and silently report perfect attendance for a forgotten session — that
    is the failure this product is designed against.
  - HARD DELETION IS IMPOSSIBLE. Israeli tax law requires retaining financial
    records for approximately seven years.
  - ANONYMIZATION overwrites person name, birthdate, phone, email and photo and
    sets anonymized_at · DESTROYS health declarations, signature images and
    rendered PDFs outright · deletes student and session notes referencing the
    person · RETAINS charges, payments and allocations. This works only because no
    PII is ever denormalized into a financial row — receipts render names BY JOIN.
    If you find a name stored on a financial row, stop and tell me; that is a bug
    in an earlier lane, not something to work around here.
  - RETENTION defaults to 24 months after status='left'. Managers see a PREVIEW of
    what the next run will anonymize and can exempt individuals. Never run it
    silently.
  - A GUARDIAN can request an export from the parent app for their own students;
    managers can trigger the same for any student. Notes about a student ARE
    included — a written opinion about a child is personal data. Delivery is a
    TIME-LIMITED link. Every export is audit-logged.
  - THE DEMO STUDIO IS EXCLUDED from platform_studio_stats, from every cross-studio
    report, and from the operations-board totals. It must never contaminate the
    numbers real studios are judged by.
  - BREAK-GLASS is time-boxed, reason-tagged, written into the tenant's audit log,
    and the owner is notified. It EXCLUDES HEALTH DECLARATION CONTENTS ENTIRELY.
    No flag, developer or otherwise, changes that.
  - Every list endpoint is cursor-paginated, exports included.

CONSTRAINTS: .venv/bin/ prefix. Money in agorot — format at the edge, never store a
formatted string. Timestamps UTC, rendered Asia/Jerusalem, and exports must say
which timezone they are in. No inline Hebrew. Logical CSS properties only.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh reports && ./scripts/lane-check.sh privacy
Do not claim done until both are green. Show me the output.
```

---

### The review session — runs on `main`, every wave

This is the third session. It builds nothing. Per Part 4, a fresh context reviews better
because it is not attached to code it just wrote.

```
You are the review session for this wave. You do not write implementation code and
you do not merge anything. You read diffs and report.

Read @docs/plan/milestone-plan.md — Global Constraints and this wave's section.

For each lane branch, in the merge order the plan gives:

1. git diff main...<branch>
2. Dispatch spec-auditor at it: "Audit this diff against SPEC.md <the lane's
   sections>. Report missing requirements and untested edge cases. Gaps only, not
   style."
3. Check the lane's boundary yourself — this is the one thing an agent will not
   think to do:
     git diff --name-only main...<branch>
   Every path must be inside that lane's ownership list. A file outside it is a
   contract violation and I need to know before it merges, not after.
4. Check the artboards the plan assigns to that lane are actually present, and that
   the D9 reductions were applied: 2b has no chat, 7c has no weight column, 12f is
   titled תשלומים.
5. Report only what affects correctness or a stated requirement. Do not report
   style, and do not propose defensive code for cases that cannot happen — I will
   spend the afternoon on it and it will not have been worth it.

Additionally, once per wave:
  - W3: after the attendance diff, run three independent reviews of the offline
    path from different angles — auth expiry, cross-actor conflict, and cache
    eviction — rather than one review of all three.
  - W4: run security-reviewer over the uPay diff specifically, before the merge.
    Payment callbacks, authz, personal data, injection. This is the one diff where
    a review miss costs real money.
```

---

## 4. Rules that hold in every lane

1. **Migrations serialize.** `alembic/versions/**` belongs to `main`. The
   [`block-protected.sh`](../../.claude/hooks/block-protected.sh) `PreToolUse` hook denies
   edits with exit code 2 — this is enforced, not requested.
2. **Shared types land on main before lanes start.** If a lane needs a schema change, it stops.
   The change is made on `main`, both lanes rebase, and the api-client is regenerated once.
3. **One owner per file.** Ownership is by directory, listed above. `git diff --name-only
   main...<branch>` outside the list is a contract violation, and the review session checks it
   every wave.
4. **Every lane's check is one command** — `./scripts/lane-check.sh <vertical>`. If a lane
   cannot make its own check green, it is not done, and I am not its test suite.
5. **Review before merging, never after.** A bad merge contaminates the other lane's baseline.
6. **Two build lanes, never three.** Parallelism multiplies review load, not output. The third
   session reviews.
7. **Name every session** with `/rename` — `schedule`, `people`, `review` — so `claude --resume`
   is navigable a day later.
8. **Worktrees share the repo's auto-memory directory.** What one lane learns is available to
   the other. `.env` and `node_modules` are not shared.
