# W5 · session 1 — the E2E harness lane

Companion to [lanes.md](../lanes.md). One paste, into a fresh session started in
`~/Desktop/studio-manager`. The setup commands are inside the prompt — do not run them
yourself first.

Runs concurrently with [session 2, lane COMMS](w5-comms.md). Two build lanes, never three
([lanes.md §4](../lanes.md) rule 6).

```
SETUP — do this before anything else, and show me the output of each command.

  git worktree add ../sm-e2e -b feat/e2e-harness main
  cd ../sm-e2e
  python3.14 -m venv .venv
  .venv/bin/pip install -e ".[dev]"
  npm ci --prefix web
  npx --prefix web playwright install chromium

Then move into ../sm-e2e — EnterWorktree if you have it, otherwise tell me and I
will relaunch you there. Every command from that point runs from inside ../sm-e2e,
never from the main checkout. Confirm your working directory before your first
commit. Then: /rename e2e

Read, in this order:
  @SPEC.md §13 — the five E2E flows
  @docs/plan/state.yaml — holdbacks HB-w2-e2e-gate and HB-w3-e2e-harness
  @e2e/playwright.config.ts and @e2e/origins.ts — read the docstrings in full,
    they are this session's handover
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

You are the GATES lane. You close W2's, W3's and W4's exit gates — three waves of
deferred debt on one thing. Lane COMMS (M8) is running concurrently in ../sm-comms.

W5's contract commit already landed the runner, three projects (staff 5173, parent
5174, dashboard 5175), a webServer block and scripts/e2e-backend.sh. The suite
runs. All fifteen tests are test.fixme-gated. What is owed is the fixture and the
spec bodies.

YOU OWN:
  e2e/**
  web/apps/{staff,parent,dashboard}/src/App.tsx      <- see the exception below
  data-testid attributes in W2-W4 feature directories — ADD ONLY, NEVER RENAME

THE App.tsx EXCEPTION, and why you have it. The billing and health feature
directories are fully built and unit-tested in all three apps, and NOTHING IMPORTS
THEM. Verified at HEAD: every .ts/.tsx per app, imports from outside the directory
itself, tests excluded, lazy() and dynamic import() ruled out. Zero. Parent's
`absence` and `home` are the same. Concretely — parent App.tsx has
{ key: 'payments', href: '/payments' } in NAV; nothing matches that path
(features/landing/route.ts's LANDING regex accepts only /t/<slug>, and
route.test.ts:21 asserts matchLandingPath('/payments') is null), so it falls
through navigateFallback to index.html and lands the parent back on home.
PaymentsScreen.tsx — artboard 12f, the subject of E2E-3 and E2E-4, which ARE W4's
exit gate — is unreachable in a running app. Wiring these in is yours. It is the
reason the gate would otherwise be theatre.

DO NOT modify: the alembic revisions directory (a hook will block you),
app/schemas/**, app/models/__init__.py, app/main.py,
web/packages/{ui,core,api-client,i18n}/**, or anything under app/services/comms/ or
web/apps/*/src/features/comms/ — lane COMMS is live in those right now. If you need
a change in any of them, STOP AND TELL ME. Do not edit it.

BUILD, in this order:

  1. The fixture. Seed and authenticate over the §19.4 dev routes that already
     exist — /dev/demo/reset and /dev/act-as. Do not invent a second seeding path.
  2. Narrow the projects. testDir collects all five specs into all three projects —
     45 tests today, 45 real runs the moment you un-gate them. The config left this
     wrong deliberately, because the flows are named for journeys rather than apps
     and no filename filter splits them correctly. You have the bodies in front of
     you, so you are the session that can decide it. Say what you chose and why.
  3. Mount what is unmounted, per the exception above. Failing spec first, then the
     mount.
  4. Rewrite the five spec bodies against what the apps actually expose.

WHAT THE SPECS GET WRONG, so you do not rediscover it:
  - They deep-link with PATHS (page.goto('/parent/payments')). The apps route on
    location.hash — #/calendar, #/events/<eventId>/<studentId>,
    #/belts/<studentId>/<classId>, staff #/attendance/<sessionId>, dashboard
    #/students/<id>. Rewrite the URL SHAPE, not the navigation model. The only real
    path in the product is the public landing at /t/<slug>, and that is deliberate.
  - Four of the five flows are cross-app inside one test. A project's baseURL is one
    origin, so the second must be absolute: use ORIGINS from e2e/origins.ts. Never
    hardcode a port into a spec.
  - The testid vocabulary in the specs is fiction — session-card, roster,
    offline-banner, mark-present and the rest were authored in M0 against an
    imagined UI. The apps expose a richer real vocabulary instead. Read the app,
    then write the assertion. Adapt to what exists; add a testid only where one is
    genuinely missing; NEVER rename one — another lane's tests may hold it.

ORDER OF WORK: 03 and 04 first (W4's live gate), then 02, then 01, then 05.

INVARIANTS:
  - NEVER DEEP-LINK PAST THE THING UNDER TEST. Deep-link to the screen the flow
    starts on; click the flow itself. E2E-3 is a parent choosing three months and
    pressing pay — a goto() that skips that has tested nothing.
  - Do NOT add a router library. .claude/rules/ui-rtl-a11y.md forbids adding a UI
    dependency without asking, and hash routing already works.
  - retries stay 0. Flows 2 and 3 are sync and async-callback flows, exactly the
    ones a retry papers over. A flake here is a finding — report it, do not retry it.
  - The redirect is never proof of payment. Assert on the IPN settling the ledger,
    never on the return URL (§5.10 step 5).
  - A spec you cannot make pass is A BUG REPORT, not a test.fixme(). Bring it to me.
    Un-fixme'ing something into a permanently red gate is how gates stop being read
    — that is on the record as why W2 deferred this in the first place.

CONSTRAINTS: .venv/bin/ prefix. Timestamps UTC, rendered Asia/Jerusalem. No inline
Hebrew — everything through web/packages/i18n. Logical CSS properties only.

YOU OWN THE RUNNING STACK THIS WAVE. Vite runs with --strictPort and
e2e-backend.sh binds 127.0.0.1:8000 against the shared studio_manager database, so
there is one stack, not two. Lane COMMS has been told to ask you before starting a
dev server or resetting the database. Extend the same courtesy: your fixture calls
/dev/demo/reset, and that wipes their data too.

Before your first test run:  ./scripts/dev-db.sh up && .venv/bin/alembic upgrade head

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal fix, green, commit.

Your check is:
  npm --prefix web run test:e2e
  .venv/bin/pytest -q && npm run typecheck && .venv/bin/mypy app && npm run lint
Do not tell me a flow is done until its spec is green with no fixme. Show me the
output.
```
