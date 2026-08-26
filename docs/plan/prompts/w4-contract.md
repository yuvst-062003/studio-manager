# W4 contract — revision 0008, the belts namespace, and the two worktrees

Ready-to-paste opening prompt for the session that opens **W4 · M6 Money ∥ M7 Events & belts**,
on `main`, before either worktree exists.

Written 2026-08-26, after W3 shipped and both its lanes merged (`0e97f65`).

---

## Where this work stands

**W3 is feature-complete and merged.** `lane/attendance` and `lane/health` are both in `main`;
`docs/plan/state.yaml` records M4.1–M4.6 and M5.1–M5.7 as shipped.

**W3's exit gate was NOT met, and W4's has the same shape.** `HB-w3-e2e-harness` records why:
the E2E specs cannot be un-fixme'd because they describe an app nobody built — seventeen
`page.goto()` deep links against an app with **no router**, one `baseURL` for three separate
Vite apps, and eleven named testids of which **none exists**. W4's stated gate is **E2E-3**
(uPay happy path) and **E2E-4** (forged IPN), and both live in the same unbuilt harness. Read
that holdback before promising W4 an exit gate; the harness is a session of its own and it is
not this one.

**Most of W4's contract already exists.** Know what is there before planning anything:

| Already on `main` | Where |
|---|---|
| **W4's models**, written and type-checked | `app/models/_pending/billing.py` (558 lines), `_pending/events.py` (196), `_pending/belts.py` (108) |
| **Pydantic schemas** for all three verticals | `app/schemas/billing.py`, `app/schemas/events.py`, `app/schemas/belts.py` |
| **Both cross-lane seams**, real signatures, `NotImplementedError` bodies | `BillingService.create_charge` and `.recompute_charge_status` in `app/services/billing/__init__.py` |
| **Seam tests**, already asserting the keyword-only trap | `tests/contracts/test_seams.py:181-212` |
| **Model contract tests**, waiting to be promoted | `tests/contracts/_pending/test_w4_models.py` |
| **The migration draft** | `docs/plan/migrations/w4-draft.py` — but see finding 2 |
| **i18n namespaces with real keys** — `billing`, `events` | `web/packages/i18n/{he,en,ru}/` |
| **Artboard specs** for every W4 screen | `docs/design/specs/` — `1b` `12e` `12f` `11a` `3e` `5a` `5e` · `12d` `12h` `7d` `9d` `9i` `7a` `7b` `7c` `6b` `4d` `5b` `5d` |

`app/models/__init__.py` skips `_`-prefixed modules, which is why `_pending/` type-checks with
no tables behind it. **That directory is the staging mechanism. Do not invent another one.**

## Six things that will bite you

### 1. `lane-check.sh billing` reaches almost nothing this lane owns

The default branch gives `app/services/$V`, `app/routers/$V.py`, `app/models/$V.py`. For
`billing` that silently skips:

| Owned path | Why it matters |
|---|---|
| `app/routers/webhooks.py` | **The IPN endpoint.** §12: the IPN carries no cryptographic signature, so this file is the highest-stakes surface in the product, and the one a silently-green gate must never cover |
| `app/routers/payments.py` | The parent-facing pay flow |
| `app/workers/billing.py` | The monthly run — invariant 5's subject |
| `app/integrations/upay/**` | Every line that talks to the provider |

W3 fixed the same class of gap for `attendance` and `health`; the branches are there to copy.
**And check what `app/routers/$V.py` actually resolves to before trusting it** — W3's health
lane was nearly handed a gate over `app/routers/health.py`, which is core's liveness probe.
For `billing` there is no `app/routers/billing.py` at all, so the default resolves *nothing*
and the gate would report a green it never earned.

`events` and `belts` need branches too, for a different reason — see finding 3.

### 2. `w4-draft.py`'s HAND_CHECK is wrong about the idempotency key

It says `charge`'s partial unique index is on `(enrollment_id, period_year, period_month,
kind)`. It is not. `app/models/_pending/billing.py:187` declares
`uq_charge_student_period_kind` on **`student_id`**, and so do revision `0006`'s docstring and
`create_charge`'s. C11 is the reason: *the club prices per student, by how often a child
trains* — a child in two groups is one charge, not two. Keying on `enrollment_id` would
reintroduce exactly the defect C11 was raised to remove.

**The model is right and the draft is wrong. Do not "fix" the model to match the draft.**
Correct the draft in this commit so the next reader is not sent the same way.

### 3. `belts` has no i18n namespace, and a lane cannot give it one

`milestone-plan.md § Lane EVENTS` says that lane owns
`web/packages/i18n/{he,en,ru}/{events,belts}.ts`. **`belts.ts` does not exist in any locale**,
and `NAMESPACES` in `web/packages/i18n/types.ts` lists nine namespaces without it. That file is
authored once and **a lane never edits it** — a single shared list is exactly the serialization
the namespace split was designed to remove.

So this commit decides one of two things, and either is defensible:
- **Add `belts` as a tenth namespace** — edit `types.ts`, create six empty files, done here.
- **Fold belt strings into `events.ts`** — and correct the milestone plan's ownership line.

`lane-check.sh` already assumes the second: its comment reads *"`belts`, `privacy` and `core`
are verticals with no i18n namespace."* Whichever you choose, make the plan and the script
agree, because right now they do not.

> CLAUDE.md says the namespace list lives in `index.ts`. It lives in `types.ts`. Small drift,
> worth fixing while you are here.

### 4. Two foreign keys W2 deferred land in this revision

`w4-draft.py`'s `DEFERRED_FROM_W2` is correct and is easy to half-do:

- `student.current_belt_id` → `belt_rank.id`, `ON DELETE SET NULL`
- `enrollment.price_plan_id` → `price_plan.id`, `ON DELETE RESTRICT`

Add the `ForeignKey(...)` **to the two model columns** and let autogenerate emit the ALTERs.
Hand-writing `op.create_foreign_key` without touching the models gives a database the models do
not describe, and `test_the_migrations_match_the_models` is then red forever on a schema that is
actually correct — the worst kind of red, because the obvious fix is to weaken the test.

### 5. The `payment` ↔ `upay_ipn_record` cycle is already solved — do not undo it

Both directions are §4.3 columns, so the cycle is real rather than a modelling slip. It is
resolved with `use_alter=True` **and an explicit constraint name** on the reconciliation side.
Both halves matter: without `use_alter` SQLAlchemy drops both constraints from its topological
sort and emits `CREATE TABLE`s Postgres rejects; without the explicit name Alembic cannot write
the `DROP` in `downgrade()`. This bites on a **fresh** database, so a run against your existing
one will not catch a regression.

### 6. `tests/contracts/test_w4_schemas.py` does not exist

W2, W3 and W5 each have one. W4 does not. `tests/contracts/_pending/test_w4_models.py` exists
and moves up in the same commit as the models — the two moves are one commit, or the wave has
models with nothing checking them.

## What this session delivers

1. **Revision `0008`**, `down_revision = '0007'` — seventeen tables from three promoted model
   files, plus finding 4's two ALTERs.
2. **The `lane-check.sh` case branches** for `billing`, and whatever findings 1 and 3 decide
   for `events` and `belts`.
3. **`tests/{billing,events,belts}/conftest.py`** — the fixtures each lane needs (§2.2 item 8).
4. **`tests/contracts/test_w4_schemas.py`**, and `test_w4_models.py` promoted.
5. **Finding 3's namespace decision**, applied to whichever files it touches.
6. **Finding 2's correction** to `w4-draft.py`.
7. **The regenerated API client**, committed.
8. **Two worktrees**, created only after all of the above is pushed.

## Hard rules this session inherits

- **One Alembic head.** `main` owns `alembic/versions/**`; the chain is linear `0001`→`0007`
  and `0008` continues it. **`.claude/hooks/block-protected.sh` denies Edit/Write there with
  exit code 2** and its message is *"Ask the user before touching it."* Asking is the unlock
  path — W3 asked and was approved for `0007` only, so **ask again for `0008`**. Mechanics that
  cost W3 time: `alembic revision --autogenerate` is allowed; editing the result is not; the
  generated file is named by **hash**, so both the filename and `revision: str = ...` need
  rewriting to `0008`; and the hook's Bash arm refuses any command containing a redirect *and*
  a token matching a protected path, so `... 2>&1 | tail` in the same command as a bare
  `alembic/versions/` path is refused for the redirect.
- **G2 — every money column is `*_agorot INTEGER`.** Not `NUMERIC(10,2)`, which looks more
  responsible and is still wrong. **This is the wave where invariant 1 stops being vacuous.**
- **G8 — no automated recurring billing.** הוראת קבע cannot be created programmatically by the
  provider. Do not build a mandate creator; do not build automatic matching.
- **Charges are never mutated to record payment.** `charge.status` is a derived cache
  maintained only in `recompute_charge_status`.
- **§11.7 — no card owner names or last-4 digits in application logs.**
- Schema discovered missing mid-lane is a **stop-and-tell**, not a lane workaround.

## What changed on `main` during W3 that W4 gets for free

- **`AuditService.record` sanitises `actor_ip`.** It is `INET`, and `request.client.host` is
  `"testclient"` under TestClient — Postgres rejected it and took the audited write down with
  it. W3's health lane worked around it in its own routers before it was fixed centrally; W4's
  lanes will not hit it.
- **eslint now enforces single quotes and no semicolons.** W2's people lane shipped three i18n
  files formatted with prettier's defaults and nobody noticed for a wave. It is a red gate now.
- **`npm run generate:api-client` is a real script.** Three docs named it; it did not exist.
- **`lane-check.sh` has a `core_dirs` mechanism** for lanes owning part of `web/packages/core`.

## Five open decisions W3 handed forward

Settle them here or record why not — they are cheap now and awkward later:

1. **`TextField` has no multiline mode**, and four artboards want one. W4's lanes will hit it.
2. **`AlertTone` has no green that is not `paid`.** A token-layer decision in D12's territory —
   worth a **D13** rather than a quiet addition.
3. **`SignaturePad` → `web/packages/ui/src/primitives/`.** Two artboards draw it; it currently
   lives in a parent feature directory because primitives are not a lane's to add.
4. **`app/services/attendance/schemas.py`** holds `BatchResult`/`AttendanceConflictOut` because
   W3's contract authored no *result* shape for a flush. No OpenAPI effect; move it if you
   prefer it in `app/schemas/`.
5. **`4c`'s at-risk sidebar** — W3's contract never decided whether M5 or W5 renders M9's list.
   Every string already lives in the `reports` namespace, which argues for W5.

## Exit gate

- `.venv/bin/alembic upgrade head` clean on a **fresh** database and on **W3's** database.
- `.venv/bin/pytest -q` green, including `tests/invariants` and `tests/restrictions` —
  invariants **1** and **5** stop being vacuous in this wave and must actually pass.
- `npm run generate:api-client` produces no uncommitted diff.
- `./scripts/lane-check.sh billing --dry-run`, `… events --dry-run` and `… belts --dry-run`
  each name every path their lane owns — `app/routers/webhooks.py`, `app/routers/payments.py`,
  `app/workers/billing.py` and `app/integrations/upay/**` included.

---

## Paste this

```
Read @docs/plan/prompts/w4-contract.md in full — it records what already exists,
and the six things that cost the most here.

Then read @docs/plan/milestone-plan.md §2.2 (the contract commit) and the whole W4
section. Read @docs/plan/migrations/w4-draft.py — but note finding 2: its
HAND_CHECK is WRONG about the charge idempotency key. Read @CLAUDE.md.

This is W4's contract commit. Sequential work on `main`, no worktrees yet. W3 is
merged; you are starting from 0e97f65.

Deliver, in this order:

1. Revision 0008, down_revision '0007'. Promote app/models/_pending/billing.py,
   events.py and belts.py into app/models/ — all three are clean promotions, no
   append like W3's health.py. Seventeen tables.
   - Every money column is *_agorot INTEGER (G2). Not NUMERIC. This is the wave
     where invariant 1 stops being vacuous.
   - charge's partial unique index is on student_id, NOT enrollment_id. The model
     is right and w4-draft.py's HAND_CHECK is wrong — C11 prices per student, so
     a child in two groups is one charge. Correct the draft; do not touch the model.
   - Add ForeignKey to TWO MODEL COLUMNS W2 deferred: student.current_belt_id ->
     belt_rank.id (SET NULL) and enrollment.price_plan_id -> price_plan.id
     (RESTRICT). Let autogenerate emit the ALTERs. Hand-writing them leaves
     test_the_migrations_match_the_models red forever on a correct schema.
   - The payment <-> upay_ipn_record cycle is ALREADY resolved in the models with
     use_alter=True and an explicit constraint name. Do not undo it. It only
     bites on a FRESH database.
   - alembic/versions/* is denied to Edit/Write by .claude/hooks/block-protected.sh.
     Ask me before writing it. autogenerate is allowed; the file is named by hash,
     so filename and revision id both need rewriting to 0008.

2. The lane-check.sh case branch for `billing`. The default reaches
   app/services/billing, app/routers/billing.py and app/models/billing.py — and
   app/routers/billing.py does not exist, so it resolves nothing and reports a
   green it never earned. It must reach app/routers/webhooks.py (the IPN endpoint,
   the highest-stakes file in the project), app/routers/payments.py,
   app/workers/billing.py and app/integrations/upay/**. Verify with --dry-run.
   Copy the shape W3 added for attendance and health.

3. Decide the `belts` i18n namespace. milestone-plan tells lane EVENTS it owns
   web/packages/i18n/{he,en,ru}/belts.ts. Those files DO NOT EXIST, `belts` is not
   in NAMESPACES in web/packages/i18n/types.ts, and that file is authored once —
   a lane never edits it. Either add belts as a tenth namespace here, or fold belt
   strings into events.ts and correct the plan. lane-check.sh already assumes the
   second. Make the plan and the script agree; right now they do not.

4. tests/{billing,events,belts}/conftest.py — the fixtures each lane needs (§2.2
   item 8). Read tests/attendance/conftest.py and tests/health/conftest.py first;
   they are the pattern and they were written for exactly this purpose.

5. tests/contracts/test_w4_schemas.py — it does not exist; W2, W3 and W5 each have
   one. And promote tests/contracts/_pending/test_w4_models.py in the SAME commit
   as the models.

6. npm run generate:api-client, committed.

Plan first with superpowers:writing-plans, then work it task by task: failing
test, confirm it fails, minimal implementation, green, commit.

Exit gate — do not create a worktree until all five hold:
  - alembic upgrade head clean on a FRESH database AND on W3's database
  - .venv/bin/pytest -q green, invariants and restrictions included, with
    invariants 1 and 5 now asserting against real columns
  - generate:api-client leaves no uncommitted diff
  - lane-check.sh --dry-run for billing, events and belts names every owned path
  - the belts namespace decision is applied in BOTH the plan and the script

Then push, and only then:
  git worktree add ../studio-manager-money  -b lane/money  main
  git worktree add ../studio-manager-events -b lane/events main

Per-worktree setup, which W3 learned the hard way:
  - `git worktree add` copies NO untracked file. There is no .worktreeinclude in
    this repo. Each worktree starts with no .env and therefore falls back to the
    SHARED database — worse than a stale copy, because both lanes then tread on
    each other. Write a .env in each pointing at its own database.
  - One Postgres container, two more databases:
      ./scripts/dev-db.sh psql -c 'CREATE DATABASE studio_manager_money  OWNER studio_migrator'
      ./scripts/dev-db.sh psql -c 'CREATE DATABASE studio_manager_events OWNER studio_migrator'
    then `alembic upgrade head` into each. Roles are cluster-wide from 0001.
  - NEVER run ./scripts/dev-db.sh reset once a lane is working. It drops the
    shared Docker volume and destroys BOTH lane databases mid-run. W3's managing
    session did this and cost both lanes time.
  - `python3` resolves to a pyenv 3.8 on this machine, so the documented
    `python3 -m venv` produces an unusable venv. Use the explicit 3.14 path.
```

## After this session

`docs/plan/prompts/w4-lanes.md` should carry the opening prompt for each lane, plus the merge
order. W3's merge order held up well and the same logic applies: **merge MONEY first** — it owns
`app/integrations/upay/**` and every money table, so EVENTS rebases onto a stable ledger rather
than the reverse, and M7's event fees are a pure caller of M6's seam.

## While the lanes run

`main` is idle. **Build the E2E harness then** — `HB-w3-e2e-harness` blocks W3's gate *and*
W4's, since E2E-3 and E2E-4 need exactly the same rig, and it closes `HB-w2-e2e-gate`'s owed W2
subsets on the way past. It is the highest-value idle-time work available and it removes a
serial session from the critical path for every remaining wave.
