# W3 lanes — ATTENDANCE ∥ HEALTH

Companion to [w3-contract.md](w3-contract.md). That one opens the wave on `main`. This one is
the two lanes, their setup, and the order they merge in.

Written 2026-08-26.

---

## Why these two are paired

A recorded decision, not a convenience. §5.5 puts Health's entire staff surface *inside* the
attendance roster — the `⚠ הצהרת בריאות חסרה` badge, the one-tap `שלח תזכורת להורה`, and the
`derived_flags` chips a coach sees. Under §14's order that roster does not exist when M4 runs,
so **M4 alone has a parent surface and a dashboard surface and no staff surface at all.**
Pairing the two fixes it without amending §14: the wave covers all three surfaces, and the seam
between the lanes is *data*, not a shared file.

The seam, in both halves:

| Half | What | Who writes it | Who reads it |
|---|---|---|---|
| Data | `BootstrapPayload.roster[].health_status` (`missing`/`trial_signed`/`signed`) and `.derived_flags` | M4 populates | M5 renders |
| Function | `HealthService.recompute_derived_flags(student_id) -> dict[str, bool]` | M4 fills the body | M4's own re-derivation after a template edit |

Both are already on `main` — the schema in `app/schemas/health.py`, the signature in
`app/services/health/__init__.py`, asserted by `tests/contracts/test_seams.py`. Neither lane may
change them unilaterally.

**The one container this wave builds is `roster-row`, and M5 owns it.** M4's health badge is a
`registerSlot('roster-row', …)` file in M4's own directory. The attendance lane renders
`<HealthBadge status={row.health_status} flags={row.derived_flags} />` from two fields the
contract commit already put in the payload. Neither lane opens the other's file.

## Per-worktree setup

```bash
git worktree add ../studio-manager-attendance -b lane/attendance main
git worktree add ../studio-manager-health     -b lane/health     main
```

**`git worktree add` copies no untracked file at all.** This repo has no `.worktreeinclude`,
and an earlier draft of this section said it carried the env file — it does not exist. The
settings file this repo actually reads is `.env` (`app/core/config.py`:
`SettingsConfigDict(env_file=".env")`), it is gitignored, and each worktree therefore starts
with **none**. Neither `.venv/` nor `node_modules/` comes across either, and neither should:
the interpreter path is baked into the venv's scripts, so each worktree builds its own.

**Give each lane its own database.** [tests/conftest.py](../../tests/conftest.py) reads
`DATABASE_URL` and `MIGRATION_DATABASE_URL` from settings, which fall back to the shared
`studio_manager` when no `.env` overrides them — so a worktree with no env file is *worse*
than one with a copied env file: both lanes silently share the main database, and
`./scripts/dev-db.sh reset` in one drops the other's fixtures mid-run. One Postgres
container, two more databases:

```bash
./scripts/dev-db.sh psql -c 'CREATE DATABASE studio_manager_attendance OWNER studio_migrator'
./scripts/dev-db.sh psql -c 'CREATE DATABASE studio_manager_health     OWNER studio_migrator'
```

Then write an `.env` in each worktree pointing at its own, and run the chain once there:

```bash
# in ../studio-manager-attendance
cat > .env <<'EOF'
DATABASE_URL=postgresql+psycopg://studio_app@127.0.0.1:55433/studio_manager_attendance
MIGRATION_DATABASE_URL=postgresql+psycopg://studio_migrator@127.0.0.1:55433/studio_manager_attendance
EOF
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
npm --prefix web ci
```

The roles are cluster-wide — revision `0001` creates them and it has already run — so a new
database needs no role setup, only the chain replayed into it.

## Rules both lanes inherit

- **Never run `alembic revision`.** `main` owns `alembic/versions/**`;
  `.claude/hooks/block-protected.sh` denies it with exit code 2. Schema you find missing is a
  **stop-and-tell** — you pause, `main` lands a corrective revision, both lanes rebase. Working
  around a schema gap in application code is how two lanes end up with two different workarounds.
- **Never open the other lane's file.** A section that belongs on the other lane's screen is a
  `registerSlot` call in a file you own, reading fields the contract commit already put in the
  payload. It never asks the container to fetch for it.
- **Never edit `app/main.py` or `app/models/__init__.py`.** Both mount by discovery.
- **Never edit `web/packages/i18n/index.ts`.** It lists every namespace already.
- `./scripts/lane-check.sh <vertical>` green is a **precondition for requesting review**, not an
  outcome of it.
- Read the artboard specs in `docs/design/specs/`, **not** the `.dc.html` canvas exports — they
  are ~654 KB across three files and will swamp your context in a single Read.
- 18 primitives already exist in `web/packages/ui/src/primitives/`. Name the primitive; do not
  write a second status chip.

---

## `lane/attendance` — M5

```
Read @docs/plan/prompts/w3-lanes.md § Rules both lanes inherit, then
@docs/plan/milestone-plan.md § W3 · Lane ATTENDANCE — M5 in full.
Read @SPEC.md §5.13, §10.1–§10.6, §6.1, §6.5. Read @CLAUDE.md.

This is M5, in the worktree at ../studio-manager-attendance on lane/attendance.
Revision 0007 is on main and the attendance tables exist. Do not run alembic
revision.

You own, and nothing outside this list:
  app/models/attendance.py        app/services/attendance/**
  app/routers/attendance.py       app/routers/sync.py
  tests/attendance/**
  web/packages/core/src/offline/**      ← pending_ops, network state machine, queue
  web/apps/staff/src/features/attendance/**
  web/apps/parent/src/features/absence/**
  web/apps/dashboard/src/features/attendance/**
  web/packages/i18n/{he,en,ru}/attendance.ts

You also build the `roster-row` CONTAINER — the one composite container this wave
creates. M4's health badge registers into it. It renders useSlot('roster-row')
and knows none of its sections by name. Render the badge from
row.health_status and row.derived_flags, two fields the contract commit already
put in BootstrapPayload. Never fetch health data yourself, and never open a file
under web/apps/staff/src/features/health/.

Build: roster UI · bulk mark with the pre-report protection rule · parent absence
reporting · the offline queue · sync · conflict handling.

This is the highest-risk lane in the plan, and the only one that owns
web/packages/core/**. Four things must be true, each with its own test:

  - FOUR network states, not two. Never trust navigator.onLine — it is true on a
    captive portal that routes nowhere. Mode derives from request outcomes against
    a lightweight ping; a 6s timeout demotes a slow request into the offline path;
    intermittent is treated as offline until TWO consecutive successes. A
    state-machine unit test per transition. (§10.1)

  - Offline writes NEVER depend on a valid token. Marks go to pending_ops
    regardless of auth state — the local write is not an API call. A queue is
    never dropped on auth failure; there is no code path that discards unsynced
    work. Re-auth as a DIFFERENT person surfaces a conflict card rather than
    flushing. Test the expired-access, expired-refresh and different-person
    cases. (§10.3)

  - Cross-actor conflicts, one test per row. Coach offline + manager cancels the
    session → marks stored, card raised, never silently dropped and never
    silently applied. Two coaches → last write by device_marked_at, EXCEPT a
    parent pre-report, which never loses to a bulk action regardless of
    timestamp. Same device flushes twice → no-op on client_mark_id. (§10.5)

  - pending_ops is exempt from eviction under ALL circumstances; cache bounded to
    two days, evicted oldest-first, with an eviction test asserting pending_ops
    survives. iOS cannot fully guarantee that exemption, so MANAGE it: require
    standalone mode, call navigator.storage.persist() on boot, and show a
    BLOCKING warning when unsynced work has been queued for more than one
    session. A native container would have given the guarantee; §6.5 traded it
    away deliberately and coaches are a small, known group. (§10.6, §6.5)

Offline priming is NOT optional: first launch blocks on fetching today's and
tomorrow's sessions and rosters into IndexedDB before the coach reaches Today
(§6.1). Parent absence pre-reports REQUIRE a connection on purpose, and the app
says so rather than queuing into the void (§10.2).

`unmarked` is a real state and must stay one. M9's "sessions held vs planned"
report depends on it never collapsing into absent (§5.14).

Nothing on the mat is ever blocked by a missing health declaration. The roster
shows ⚠ and the coach can still mark the student present. There is deliberately
no block_attendance_without_health setting (§5.5).

You fill two slots into containers that already exist: `alert-centre` conflict
cards (M3's container) and `student-card` attendance strip (M3's), plus the
`dev-bar` offline/slow toggles (M0's).

Artboards — specs in docs/design/specs/: parent 2a, 12a · staff 1c, 9f, 9g, 2d ·
dashboard 4c, 1e. Do not open the .dc.html exports.

Plan with superpowers:writing-plans, then TDD each task.
Check: ./scripts/lane-check.sh attendance
```

## `lane/health` — M4

```
Read @docs/plan/prompts/w3-lanes.md § Rules both lanes inherit, then
@docs/plan/milestone-plan.md § W3 · Lane HEALTH — M4 in full.
Read @SPEC.md §5.5, §11.2, §4.3. Read @docs/design/decisions.md D11.
Read @CLAUDE.md.

This is M4, in the worktree at ../studio-manager-health on lane/health. Revision
0007 is on main and the health tables exist. Do not run alembic revision.

D11 SUPERSEDES any "blocked on you" note about the studio's PDF. There is nothing
to wait for. Revision 0007 seeded a standard Israeli sports health declaration as
the default `full` health_form_template question set. You own making it editable
— a manager can add, remove and reword questions — and a manager may upload their
own PDF, stored at source_pdf_object_key for reference only.

Carry D11's caveat into the UI: a health declaration for minors in an Israeli
sports club touches insurance and regulatory ground. The bundled template is a
STARTING POINT and the app must say so where the manager edits it. It is not a
compliance artefact and must not be presented as one.

health_form_template already existed before this wave — revision 0005 created it
and seeded the 'trial' form so M3's trial bookings had something to write
against (conflict C3). You own the `full` template. Do not touch the trial one.

app/routers/health.py is NOT yours. It is core's liveness probe, GET
/api/v1/health, asserted by tests/test_health.py. SPEC §7 puts your routes at
/health-templates and /students/{id}/health-declaration, which is why the two
filenames above are what they are. GET /health-templates already exists in
app/routers/structure.py (M1, conflict C3); you add the write side. Do not move
the existing GET without saying so — it is an OpenAPI-visible change and the
generated client is committed.

You own, and nothing outside this list:
  app/models/health.py            app/services/health/**
  app/routers/health_templates.py app/routers/health_declarations.py
  app/workers/health_reminders.py
  tests/health/**
  web/apps/parent/src/features/health/**
  web/apps/dashboard/src/features/health/**
  web/apps/staff/src/features/health/HealthBadge.tsx   ← registers into 'roster-row'
  web/packages/i18n/{he,en,ru}/health.ts

Build: the kind='full' template in versioned health_form_template.schema ·
declaration flow with a finger-drawn signature · encryption of answers and
signature image · derived_flags · signed-PDF rendering · the parent app gate.

Invariants:
  - The gate is a HARD BLOCK IN THE PARENT APP ONLY. Nothing on the mat is ever
    blocked — the roster shows ⚠ הצהרת בריאות חסרה with a one-tap reminder and
    the coach can still mark the student present. There is deliberately NO
    block_attendance_without_health setting. (§5.5)
  - Coaches see derived_flags — BOOLEANS ONLY, never free text. A free-text flag
    is a medical description on a coach's screen, which is exactly what the flag
    mechanism replaced. Reading the full declaration requires manager or owner and
    EVERY read is audit-logged. (§4.3, §11.2)
  - Declarations do not expire. valid_until is NULL;
    health_declaration_validity_months defaults to null and is a config flag, not
    a migration. (§5.5)
  - Hebrew PDF rendering needs an embedded Noto Sans Hebrew face and explicit bidi
    handling. §5.5 calls this known-fiddly and mandates a golden-PDF fixture test.
    Budget for it — it is the likeliest thing in this lane to eat a day.
  - G7 — NEVER log declaration contents. These are minors' personal data. Log
    payloads as extra=, never interpolated into the message; an f-string has no
    key for the scrubber to match. Never put health contents in an audit diff.
  - Encryption uses EncryptedJSON("health_declaration.answers") / EncryptedBytes
    from app/core/encryption.py. Keys live in Railway secrets, never in the
    database. Rotation is rewrap(), which never decrypts a payload.

HealthService.recompute_derived_flags already has its signature on main and
tests/contracts/test_seams.py asserts it. Fill the body; do not change the
signature. Flags are a function of (answers, template version), so a manager
rewording a question makes every declaration's flags stale — that single named
entry point is how you re-derive a studio's whole roster after a template edit,
without M5 ever knowing it happened.

You populate BootstrapPayload.roster[].health_status and .derived_flags, the two
fields M5 renders. Populate them; never render them yourself in M5's roster.

Your staff surface is real work with no screen of its own, and that is EXPECTED
(conflict C2): the ⚠ badge and one-tap reminder on 1c/9f, and the derived_flags
chips on 9c. All three are registerSlot additions into containers M5 and M3 own.
If M5 has not merged its roster-row container yet, build HealthBadge.tsx against
the contract's prop shape and defer only its integration test.

Artboards — specs in docs/design/specs/: parent 12c · dashboard 4e.
Do not open the .dc.html exports.

Plan with superpowers:writing-plans, then TDD each task.
Check: ./scripts/lane-check.sh health
```

---

## Merge & integration

1. **Lane ATTENDANCE first.** It owns `web/packages/core/**`, which is the wider blast radius;
   merging it first means the health lane rebases onto a stable core rather than the reverse.
2. Full suite on `main`.
3. Rebase Lane HEALTH, re-run `lane-check.sh health`, review, merge, full suite.
4. **E2E-2** — coach marks offline → reconnects → marks sync → dashboard reflects them. Then
   **E2E-1** end to end, including the health declaration.
5. **The manual one nothing substitutes for:** airplane mode on a real device, 90 minutes, then
   reconnect. The dev bar's offline toggle proves the code path; it does not prove iOS suspends
   the way you assumed.

Tick M4 and M5 in `docs/plan/state.yaml` **in the same commit as the work** (CLAUDE.md
§Workflow). Nothing measurable goes in that file — no test results, no branch, no environment
health. Those are computed.

## While the lanes run

`main` is idle. Author **W4's contract commit (`0008`)** then — see
[w3-contract.md § While the lanes run](w3-contract.md) for the three findings that belong in it,
including the `lane-check.sh billing` gap that would leave `app/routers/webhooks.py` unchecked.
