# Studio Manager

Judo club management: enrollment, attendance, payments, health declarations, monthly reports.
Users are club admins and parents. UI is Hebrew, RTL, mobile-first.

## Stack
- Backend: Python (FastAPI), SQLAlchemy, Alembic migrations, PostgreSQL
- Frontend: React + TypeScript + Vite
- Auth: Google OAuth
- Payments: uPay

## Commands
Python tooling lives in `.venv` (Python 3.14). Always use the `.venv/bin/` prefix —
a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH.
- Dev (backend): `.venv/bin/uvicorn app.main:app --reload`
- Dev (frontend): `npm run dev`
- Backend tests: `.venv/bin/pytest -q`
- One frontend test file: `npx vitest run <file> --reporter=dot`
- Typecheck: `npm run typecheck && .venv/bin/mypy app`
- Lint/format: `.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint`
- Migration: `.venv/bin/alembic revision --autogenerate -m "<msg>"` then `.venv/bin/alembic upgrade head`
- Local database: `./scripts/dev-db.sh up` (start fresh with `reset`). Database tests
  **fail** rather than skip without it — a skipped DB test is a gate that checks nothing.
- Lane check: `./scripts/lane-check.sh <vertical>` — the one command every lane runs.

## Layout
- `app/` FastAPI: `routers/`, `services/`, `models/`, `schemas/`, `workers/`,
  `integrations/upay/`, `core/` (auth, tenancy, encryption, audit, config)
- `alembic/` migrations — `main` owns `alembic/versions/**`. Lanes never run
  `alembic revision`; one revision per wave lands in the wave's contract commit.
- `web/` npm workspaces root
  - `web/packages/api-client/` generated from OpenAPI — never hand-edited
  - `web/packages/ui/` RTL/LTR-aware design system, tokens, primitives
  - `web/packages/core/` shared hooks, formatting, permissions, offline queue
  - `web/packages/i18n/` namespaced locale files (see §Conventions)
  - `web/apps/staff/` managers + coaches
  - `web/apps/parent/` guardians + adult students
  - `web/apps/dashboard/` manager web
- There is **no** `native/` directory. §6.5 ships installable PWAs — no App Store
  build, no Play listing, no native shell.
- Business logic lives in `services/`. Routers stay thin — parse, call a service, return.
- `app/main.py` and `app/models/__init__.py` mount routers and models by **discovery**.
  Adding `app/routers/attendance.py` mounts it. Never edit either file to register something.

## Conventions
- All money is stored in agorot (integers). Never floats.
- All timestamps stored UTC; render in Asia/Jerusalem.
- Hebrew user-facing strings live in `web/packages/i18n/he/<namespace>.ts` — one namespace
  file per feature vertical (`common`, `schedule`, `people`, `health`, `attendance`,
  `billing`, `events`, `comms`, `reports`), mirrored in `en/` and `ru/`. Never inline a
  string in a component. `web/packages/i18n/index.ts` lists every namespace and is authored
  once — a lane never edits it. A single `he.ts` would serialize every wave.
- New API endpoints are versioned under `/api/v1/`.

## Core mechanisms (M0.2 — read before adding a model or an endpoint)
- Tenancy: inherit `TenantMixin` from `app/core/tenancy.py`. It adds a non-null
  `studio_id` and the leading composite index, and `TenantSession` filters every query
  by the active studio. It **fails closed** — no studio in context raises rather than
  returning every studio's rows. The `with_all_tenants(reason=...)` hatch is legal only
  in platform-admin code and deliberate cross-studio jobs.
- Encryption: `EncryptedJSON("table.column")` / `EncryptedBytes(...)` from
  `app/core/encryption.py`. Keys live in Railway secrets, never in the database.
  Rotation is `rewrap()`, which never decrypts a payload.
- Audit: `AuditService.record(...)`. `audit_log` is append-only **by grant** — the app
  role holds INSERT and SELECT and nothing else. Never put health contents in `diff`.
- Logging: structured JSON with a scrubber. Log payloads as `extra=`, never
  interpolated into the message — an f-string has no key for the scrubber to match.
- Two DB roles: `studio_migrator` owns the schema and runs Alembic, `studio_app` is the
  runtime role. That split is what makes the append-only grant possible.
- Developer account (§19 — M0.4): `/dev/*` is **conditionally mounted** — `app/main.py`
  skips `app/routers/dev.py` when `ENV == production`, so the routes do not exist there.
  `app.core.clock.now()` is the **only** clock; `X-Dev-Now` shifts it for one request
  outside production and a test fails the build on any other `datetime.now()` in `app/`.
  The demo studio is created by migration (so production has one), reset from a
  versioned fixture set in `app/services/demo/fixtures.py`, and excluded from every
  cross-studio number by `app.core.demo.exclude_demo_studios`. §19.6's five restrictions
  live in `tests/restrictions/` and run **unscoped in every lane**, like the invariants.

## Gotchas
- Recurring payments (הוראת קבע) cannot be created programmatically by our provider.
  They are marked paid manually in-app, same flow as bank transfers. Do not build
  automated recurring billing.
- Health declarations contain personal data about minors. Never log their contents.

## Workflow
- When you finish a piece of the active milestone, tick it in `docs/plan/state.yaml`
  **in the same commit as the work**. The cockpit reads that file; a piece finished but
  not ticked is progress nobody can see. Never write anything measurable there — no test
  results, no branch, no environment health. Those are computed, and a declaration that
  contradicts a measurement is how a status board stops being trusted.
- Write a failing test before fixing a bug.
- Typecheck and lint after a series of edits.
- Prefer running a single test file over the whole suite.

## Compact instructions
When compacting, always preserve: the list of modified files, the current plan or
SPEC.md section being implemented, and any test commands established this session.
