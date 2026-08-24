# M0.2 — The Seams and the Core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two remaining §1.3 seams (Alembic baseline, slot registry) and the four cross-cutting core mechanisms (tenancy, encryption, append-only audit log, log scrubber), plus the invariant suite and the one command every lane runs — so that waves 2–5 can build on top of them without re-inventing any of them.

**Architecture:** A local Docker PostgreSQL 16 and a Railway staging PostgreSQL give the backend a database for the first time. Alembic owns the schema from `main`. Two DB roles split migration authority (`studio_migrator`) from runtime authority (`studio_app`), which is what makes §11.2's append-only audit log enforceable at the grant level rather than by convention. Tenancy is a SQLAlchemy `Session` subclass plus a `with_loader_criteria` event, so isolation is applied at the query layer and failing closed is the default. Encryption is a true envelope — a per-record data key wrapped by a versioned key-encryption key from Railway secrets — so rotating a key rewraps a few hundred bytes instead of re-encrypting every health declaration. Logging is structured JSON with a key-based scrubbing filter. Everything above is guarded by `tests/invariants/`, which runs in every lane on every check.

**Tech Stack:** Python 3.14 · FastAPI · SQLAlchemy 2.0.52 · Alembic 1.19.1 · psycopg 3 · cryptography (AES-256-GCM) · PostgreSQL 16 (Docker locally, Railway in staging) · pytest · React 19 + TypeScript 5.9 + vitest.

**Spec:** [SPEC.md](../../../SPEC.md) §4.2, §4.3, §8.1a, §8.3, §11.1, §11.2, §11.7, §13, §19.6 · [docs/plan/milestone-plan.md](../../plan/milestone-plan.md) Global Constraints, Part 1 §1.3, W0 · M0, Part 5 §C9 · [CLAUDE.md](../../../CLAUDE.md).

---

## Global Constraints

Every task inherits these. Values copied verbatim from their sources.

| # | Constraint | Source |
|---|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md §Commands |
| G2 | Money is **always** an integer count of agorot. Never a float, never a decimal. | SPEC §8.3 |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem`. | SPEC §8.3, §9 |
| G4 | No user-facing string is ever inlined in a component. Everything goes through `@studio/i18n`. | SPEC §8.3 |
| G5 | New API endpoints are versioned under `/api/v1/`. | CLAUDE.md §Conventions |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. | SPEC §7, CLAUDE.md |
| G7 | Health declarations contain personal data about minors. **Never log their contents.** Coaches see `derived_flags` booleans only. | CLAUDE.md §Gotchas, SPEC §5.5 |
| G9 | Every tenant-scoped table carries non-null `studio_id` with a leading composite index. Bypassing `TenantMixin` requires the explicit `.with_all_tenants()` escape hatch. | SPEC §4.2 |
| G12 | Physical CSS properties (`margin-left`, `padding-right`, `left:`, `right:`) are banned by ESLint in all frontend source. | D10 |
| G15 | Soft-delete (`deleted_at`) on user-generated content. No PII is ever denormalized into a financial row. | SPEC §8.3, §11.4 |
| G16 | Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional `Idempotency-Key`. | SPEC §8.3 |
| G18 | A failing test is written before any bug fix. Prefer a single test file over the full suite during development. | CLAUDE.md §Workflow, SPEC §13 |

**Repo conventions M0.1 established, which this session matches:**

- `pyproject.toml` holds ruff / mypy / pytest config. **mypy runs strict** over `app` and `scripts`.
- `alembic/versions/**` is owned by `main`. `.claude/hooks/block-protected.sh` denies `Edit`/`Write` there with exit code 2 — migrations are authored with `.venv/bin/alembic revision` and edited through Bash.
- Assert **behaviour**, not source text, wherever behaviour is observable. Where only source can be checked (a discovery loop, a DB grant) the docstring says so.
- **Prove a new gate fails before trusting it.** M0.1 found three gates that passed while checking nothing.
- `./scripts/ci-local.sh` must be green before every push.
- Python scripts live in `scripts/`; Node scripts live in `web/scripts/` where their dependencies resolve.
- `app/main.py` and `app/models/__init__.py` are seam-2 discovery loops. **Never edit them to register anything.**

---

## Five places this plan deliberately departs from the milestone plan's literal text

The milestone plan's snippets are specifications, not tested code. Four of them do not work as written in this repo, and one collides with a lint rule. Each departure below preserves the *mechanism* the plan specifies and fixes only what stops it running. **Every one of these was verified empirically before this plan was written** — none is a guess.

1. **`lane-check.sh`'s frontend gate cannot work as written.** vitest positional arguments are *filters* matched against test-file paths, not globs. Verified: `npx vitest run "apps/*/src/features/schedule/**/*.test.tsx"` from `web/` matches zero files and **exits 1**. As written, `lane-check.sh` fails for every vertical that has no frontend tests yet — including `core`, which is this session's exit gate. Task 8 resolves file lists in bash first and passes concrete paths, printing an explicit `skipped` line when a gate has no targets.

2. **`lane-check.sh`'s lint gate uses the wrong eslint.** Verified: `npx eslint web/packages/ui/src/theme.ts` from the repo root downloads a *fresh* `eslint@10.9.0` rather than using the workspace copy, and exits 0. Task 8 runs eslint through `npm --prefix web exec`.

3. **`lane-check.sh` assumes every vertical has an i18n namespace.** `lanes.md` uses the verticals `belts`, `privacy` and `core`, none of which is one of the nine namespaces. Task 8 passes `$V` to the parity script only when `web/packages/i18n/he/$V.ts` exists, and otherwise checks all namespaces — strictly stronger, never silently weaker.

4. **`slots.ts` uses `React.FC<any>` and never imports React.** `@typescript-eslint/no-explicit-any` is on (tseslint recommended, `web/eslint.config.js`) and `npm run typecheck` runs `strict`. Task 2 keeps the registry's shape, names and semantics *exactly* and types the render function so it passes both gates.

5. **i18n parity cannot fail on missing `ru` keys.** `web/packages/i18n/ru/common.ts` is deliberately partial — SPEC §15 item 9 (the `ru` translation source) is still outstanding, and §9 says missing keys fall back to Hebrew and are *reported*. Task 8 therefore encodes a per-locale policy: `en` is **strict** (it is complete today, so the gate bites), `ru` is **report**. Orphan keys, missing namespace files and non-string values are hard errors in every locale.

Additionally: **the milestone plan places the i18n parity script at `scripts/i18n-parity.mjs`.** The prompt's stated repo convention puts Node scripts in `web/scripts/`, where their dependencies resolve. It lands at `web/scripts/i18n-parity.mjs`; `lane-check.sh` calls it there.

---

## File structure

### Created — backend

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Local PostgreSQL 16, bound to 127.0.0.1:55433. Trust auth — **no credential is ever written into this repo**. |
| `infra/postgres/init/10-roles.sql` | Creates `studio_migrator` and `studio_app` on a fresh local volume. Mirrors what the 0001 migration does for Railway. |
| `scripts/dev-db.sh` | `up` · `down` · `reset` · `wait` · `url`. The one way a developer gets a database. |
| `.env.example` | Every variable the backend reads, with local-dev values. Committed; contains no secret because local auth is trust. |
| `alembic.ini` | Alembic config. Script location `alembic/`; URL comes from `env.py`, never from this file. |
| `alembic/env.py` | Wires Alembic to `app.models` metadata and `MIGRATION_DATABASE_URL`. |
| `alembic/versions/0001_baseline.py` | Roles, default privileges, `studio`. |
| `alembic/versions/0002_audit_log.py` | `audit_log`, plus the `REVOKE UPDATE, DELETE` that makes §11.2 real. |
| `app/core/db.py` | Lazily-built engine + session factory. Import must not require a database. |
| `app/core/tenancy.py` | §4.2 — request-scoped studio context, `TenantMixin`, `TenantSession`, `with_all_tenants()`, the FastAPI dependency. |
| `app/core/encryption.py` | §11.1 — AES-256-GCM envelope, versioned KEKs, `EncryptedBytes` / `EncryptedJSON` column types. |
| `app/core/logging.py` | §11.7 — structured JSON logs and the scrubbing filter. |
| `app/models/base.py` | `Base`, UUID primary key, `created_at` / `updated_at`. |
| `app/models/studio.py` | The tenant root. |
| `app/models/audit.py` | `audit_log`. |
| `app/services/audit.py` | `AuditService.record(...)` — the only supported way a row reaches `audit_log`. |

### Created — tests

| Path | Responsibility |
|---|---|
| `tests/conftest.py` | Database fixtures. Fails loudly, with the fix in the message, when no database is reachable. |
| `tests/core/test_tenancy.py` | The §4.2 mechanism, including the cache-poisoning case that a naive `with_loader_criteria` lambda gets wrong. |
| `tests/core/test_encryption.py` | Round trip, tamper, AAD binding, rotation-without-re-encryption, rewrap. |
| `tests/core/test_audit_append_only.py` | The grants, asserted against `has_table_privilege`, not against a comment. |
| `tests/core/test_log_scrubber.py` | G7 — health fields never reach log output. |
| `tests/core/test_alembic_baseline.py` | One head; fresh database upgrades clean; `alembic/versions` is hook-protected. |
| `tests/invariants/` | SPEC §13's five non-negotiables, each with a self-test proving the detector fires. |
| `tests/config/test_database_config.py` | The dependency and CI holes that would let this pass locally and fail on the runner. |
| `tests/config/test_lane_check.py` | lane-check's gate resolution, including that an empty vertical **fails** rather than passing vacuously. |

### Created — frontend

| Path | Responsibility |
|---|---|
| `web/packages/ui/src/slots.ts` | Seam 4 — the slot registry. |
| `web/packages/ui/src/slots.test.tsx` | Ordering, isolation, unknown-slot behaviour. |
| `web/scripts/i18n-parity.mjs` | Seam 3's per-namespace parity check. |
| `web/scripts/i18n-parity.test.ts` | Proves the parity checker fails on a broken fixture. |

### Modified

| Path | Change |
|---|---|
| `requirements-dev.txt` | Add `sqlalchemy`, `alembic`, `psycopg[binary]`, `cryptography`. **`sqlalchemy` and `alembic` are missing too** — the prompt named only psycopg; the hole is wider. |
| `pyproject.toml` | pytest markers; mypy override for `alembic/versions`. |
| `app/core/config.py` | Database, encryption and logging settings. |
| `.github/workflows/ci.yml` | A `postgres:16` service on the backend job. Without it every DB test skips on the runner and the suite is theatre. |
| `scripts/ci-local.sh` | Bring the database up before pytest; run i18n parity. |
| `web/vitest.config.ts` | Extend the `tools` project to `scripts/**/*.test.ts` (`tools/` does not exist — that project matches zero files today). |
| `web/tsconfig.json`, `web/eslint.config.js` | Cover `scripts/**/*.ts`. |
| `web/packages/ui/src/index.ts` | Export the slot registry. |
| `.claude/rules/api.md` | Record the `coach` tag convention that invariant 3 keys off. |
| `.claude/settings.json` | Allow `docker compose`, `railway`, and the read-only alembic subcommands. |
| `infra/railway/README.md`, `docs/deploy/railway-runbook.md` | The staging database, and how `DATABASE_URL` reaches the api service. |

---

## Task 0: Prerequisites — a database, and the drivers to reach it

Nothing else in this plan can be written until a database exists and the backend can import a driver. This task is the one place where the deliverable is infrastructure rather than code, so it carries its own tests: the two failure modes here (a dependency in `.venv` but not in `requirements-dev.txt`, and a CI job with no database) both pass locally and fail on the runner, which is the most expensive way to find them.

**Files:**
- Create: `docker-compose.yml`
- Create: `infra/postgres/init/10-roles.sql`
- Create: `scripts/dev-db.sh`
- Create: `.env.example`
- Create: `tests/config/test_database_config.py`
- Modify: `requirements-dev.txt`
- Modify: `app/core/config.py`
- Modify: `pyproject.toml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore` (nothing to add — verify `.env` is already covered)

**Interfaces:**
- Produces: `settings.DATABASE_URL: str`, `settings.MIGRATION_DATABASE_URL: str`, `settings.APP_DB_ROLE: str`, `settings.ENCRYPTION_KEYS: dict[int, SecretStr]`, `settings.ENCRYPTION_ACTIVE_KEY_VERSION: int`, `settings.LOG_LEVEL: str`. Every later task consumes `settings`.
- Produces: `scripts/dev-db.sh up|down|reset|wait|url` — used by `scripts/ci-local.sh` and by every task that runs a DB test.

- [ ] **Step 1: Write the failing test**

`tests/config/test_database_config.py`:

```python
"""The two ways a database dependency passes locally and fails on the runner.

Both are source assertions by necessity: what CI installs and what services CI
starts are properties of the workflow file, not of anything importable here.
"""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS = ROOT / "requirements-dev.txt"
WORKFLOW = ROOT / ".github/workflows/ci.yml"

# Imported by app/ or alembic/ at runtime. `.venv` having them is not enough:
# CI installs from requirements-dev.txt and nothing else.
RUNTIME_DEPENDENCIES = ["sqlalchemy", "alembic", "psycopg", "cryptography"]


def _requirements() -> list[str]:
    return [
        line.split("#", 1)[0].strip().lower()
        for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    ]


@pytest.mark.parametrize("dependency", RUNTIME_DEPENDENCIES)
def test_every_runtime_dependency_is_declared(dependency: str) -> None:
    """SQLAlchemy and Alembic were in .venv but not here -- CI would have failed
    at import, not at the assertion that mattered."""
    declared = _requirements()
    assert any(re.match(rf"^{dependency}(\[|==|>=|~=|$)", d) for d in declared), (
        f"{dependency} is imported by the app but absent from requirements-dev.txt"
    )


def test_ci_backend_job_has_a_postgres_service() -> None:
    """Without it the DB tests cannot run on the runner, and a suite that cannot
    run is not a gate."""
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    services = workflow["jobs"]["backend"].get("services", {})
    assert "postgres" in services, "the backend job has no database"
    assert services["postgres"]["image"].startswith("postgres:16"), (
        "SPEC 8.1a specifies PostgreSQL 16; CI must not test against a different major"
    )


def test_ci_backend_job_points_the_suite_at_that_service() -> None:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    env = workflow["jobs"]["backend"].get("env", {})
    assert "DATABASE_URL" in env and "MIGRATION_DATABASE_URL" in env


def test_env_example_documents_every_setting_the_backend_reads() -> None:
    from app.core.config import Settings

    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for name in Settings.model_fields:
        assert re.search(rf"^{name}=", text, re.MULTILINE), f".env.example omits {name}"


def test_no_password_is_committed_anywhere_in_the_local_database_setup() -> None:
    """Local auth is `trust` precisely so this repo never carries a credential.
    A password appearing here is the regression this guards."""
    for path in ("docker-compose.yml", ".env.example", "infra/postgres/init/10-roles.sql"):
        text = (ROOT / path).read_text(encoding="utf-8").lower()
        assert "password" not in text, f"{path} introduces a credential; local auth is trust"
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/config/test_database_config.py -q
```

Expected: collection errors / failures — `requirements-dev.txt` declares none of the four, `.env.example` does not exist, and the backend job has no `services` key.

- [ ] **Step 3: Add the dependencies**

Append to `requirements-dev.txt` (keep the existing lines):

```
sqlalchemy
alembic
psycopg[binary]
cryptography
```

Install them:

```bash
.venv/bin/pip install -r requirements-dev.txt
```

- [ ] **Step 4: Write `docker-compose.yml`**

```yaml
# Local PostgreSQL 16 (SPEC 8.1a). psql is not installed on this machine; docker is.
#
# Trust auth, bound to loopback only. That is deliberate: it means no credential is
# ever written into this repository, so there is nothing here for a secret scanner to
# find and nothing for a developer to leak. Staging and production get real
# credentials from Railway, injected at runtime.
#
# Port 55433, not 5432 and not 55432: both are already taken on the machine this was
# built on, and a port collision reads as "postgres is broken" rather than "wrong
# database".
services:
  db:
    image: postgres:16
    container_name: studio-manager-db
    environment:
      POSTGRES_DB: studio_manager
      POSTGRES_USER: studio_migrator
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - "127.0.0.1:55433:5432"
    volumes:
      - studio-manager-pgdata:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U studio_migrator -d studio_manager"]
      interval: 2s
      timeout: 3s
      retries: 30

volumes:
  studio-manager-pgdata:
```

- [ ] **Step 5: Write `infra/postgres/init/10-roles.sql`**

```sql
-- Runs once, on a fresh volume, as studio_migrator (the POSTGRES_USER).
--
-- Two roles, because SPEC 11.2 requires the application role to hold INSERT on
-- audit_log and no UPDATE or DELETE. One role cannot both own the table and be
-- denied rights on it: an owner's privileges cannot be revoked from itself in any
-- way that survives, so append-only would be a comment rather than a grant.
--
--   studio_migrator  owns the schema, runs Alembic
--   studio_app       the runtime role the API connects as
--
-- No credential appears here: local auth is trust. The 0001 migration performs the
-- same role creation for environments that have no init hook, such as Railway.
CREATE ROLE studio_app LOGIN;
GRANT CONNECT ON DATABASE studio_manager TO studio_app;
```

- [ ] **Step 6: Write `scripts/dev-db.sh`**

```bash
#!/usr/bin/env bash
# The one way a developer gets a database. psql is not installed here, so every
# command below goes through the container.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMPOSE=(docker compose -f docker-compose.yml)

usage() { echo "usage: dev-db.sh {up|down|reset|wait|url|psql}" >&2; exit 64; }

wait_ready() {
  for _ in $(seq 1 60); do
    if "${COMPOSE[@]}" exec -T db pg_isready -U studio_migrator -d studio_manager >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "database did not become ready in 60s" >&2
  return 1
}

case "${1:-}" in
  up)    "${COMPOSE[@]}" up -d db; wait_ready; echo "✅ postgres ready on 127.0.0.1:55433" ;;
  down)  "${COMPOSE[@]}" down ;;
  # -v drops the volume, so the init script re-runs and the next `alembic upgrade
  # head` is genuinely against a fresh database -- which is this session's exit gate.
  reset) "${COMPOSE[@]}" down -v; "${COMPOSE[@]}" up -d db; wait_ready; echo "✅ fresh database" ;;
  wait)  wait_ready ;;
  url)   echo "postgresql+psycopg://studio_app@127.0.0.1:55433/studio_manager" ;;
  psql)  shift; "${COMPOSE[@]}" exec -T db psql -U studio_migrator -d studio_manager "$@" ;;
  *)     usage ;;
esac
```

Then `chmod +x scripts/dev-db.sh`.

- [ ] **Step 7: Extend `app/core/config.py`**

Replace the file with:

```python
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["development", "staging", "production", "test"]

LOCAL_DB = "127.0.0.1:55433/studio_manager"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: Env = "development"

    # Two DSNs, because two roles (SPEC 11.2). The app connects as a role that
    # cannot UPDATE or DELETE audit_log; Alembic connects as the schema owner.
    DATABASE_URL: str = f"postgresql+psycopg://studio_app@{LOCAL_DB}"
    MIGRATION_DATABASE_URL: str = f"postgresql+psycopg://studio_migrator@{LOCAL_DB}"
    # Named, not hardcoded, so the 0001 migration grants to whatever role the
    # environment actually runs as.
    APP_DB_ROLE: str = "studio_app"

    # SPEC 11.1 -- keys live in Railway secrets, never in the database. Versioned so
    # rotation does not mean re-encrypting everything: a blob records the version it
    # was wrapped under and stays readable after the active version moves on.
    ENCRYPTION_KEYS: dict[int, SecretStr] = {}
    ENCRYPTION_ACTIVE_KEY_VERSION: int = 0

    LOG_LEVEL: str = "INFO"


settings = Settings()
```

- [ ] **Step 8: Write `.env.example`**

```
# Copy to .env for local development. `.env` is gitignored; this file is not, which
# is safe because local Postgres uses trust auth and carries no credential.
#
# First: ./scripts/dev-db.sh up
ENV=development

DATABASE_URL=postgresql+psycopg://studio_app@127.0.0.1:55433/studio_manager
MIGRATION_DATABASE_URL=postgresql+psycopg://studio_migrator@127.0.0.1:55433/studio_manager
APP_DB_ROLE=studio_app

# Generate with:
#   .venv/bin/python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"
# In staging and production these come from Railway secrets and never from a file.
ENCRYPTION_KEYS={"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}
ENCRYPTION_ACTIVE_KEY_VERSION=1

LOG_LEVEL=INFO
```

- [ ] **Step 9: Add the pytest marker and the alembic mypy override to `pyproject.toml`**

Under `[tool.pytest.ini_options]` add:

```toml
markers = ["db: requires a live PostgreSQL (./scripts/dev-db.sh up)"]
```

And append:

```toml
[[tool.mypy.overrides]]
# Alembic generates these; `op` and `sa` are untyped at the call sites it writes.
module = "alembic.versions.*"
ignore_errors = true
```

- [ ] **Step 10: Add the Postgres service to the CI backend job**

In `.github/workflows/ci.yml`, in `jobs.backend`, after `runs-on: ubuntu-latest`:

```yaml
    services:
      postgres:
        # SPEC 8.1a pins PostgreSQL 16. Trust auth mirrors docker-compose.yml, so
        # no credential exists in CI either.
        image: postgres:16
        env:
          POSTGRES_DB: studio_manager
          POSTGRES_USER: studio_migrator
          POSTGRES_HOST_AUTH_METHOD: trust
        ports:
          - 55433:5432
        options: >-
          --health-cmd "pg_isready -U studio_migrator -d studio_manager"
          --health-interval 2s --health-timeout 3s --health-retries 30
    env:
      DATABASE_URL: postgresql+psycopg://studio_app@127.0.0.1:55433/studio_manager
      MIGRATION_DATABASE_URL: postgresql+psycopg://studio_migrator@127.0.0.1:55433/studio_manager
```

The CI service container has no `docker-entrypoint-initdb.d` hook, so `studio_app` does not exist there yet. The 0001 migration creates it — which is exactly why that role creation belongs in a migration and not only in the init script. Add a step before `Tests`:

```yaml
      - name: Migrate
        run: alembic upgrade head
```

- [ ] **Step 11: Run the tests and confirm they pass**

```bash
./scripts/dev-db.sh up
.venv/bin/pytest tests/config/test_database_config.py -q
```

Expected: PASS. `test_ci_backend_job_points_the_suite_at_that_service` and the `.env.example` test are the two that were red for a real reason.

- [ ] **Step 12: Add the Railway staging database**

```bash
railway status
railway add --database postgres --environment staging
railway variables --environment staging --service api
```

Then wire the api service to it. Railway exposes the database's `DATABASE_URL`; the api service needs it under both names, because Alembic and the app connect as different roles and Railway's managed Postgres gives one superuser role:

```bash
railway variables --environment staging --service api \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'MIGRATION_DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'APP_DB_ROLE=studio_app'
```

> **Record the honest caveat.** On Railway both DSNs point at the same superuser role, so in staging the append-only property is enforced by the *grant on `studio_app`* while the api connects as the superuser until M1 wires the app to `studio_app` explicitly. Note this in the runbook rather than letting the test give false comfort — `tests/core/test_audit_append_only.py` asserts the grant, which is true in every environment; whether the api *uses* that role in staging is a deployment fact, and Task 5 Step 8 records it as an open item.

- [ ] **Step 13: Document it**

Append to `docs/deploy/railway-runbook.md` a `## The staging database` section covering: which command created it, the two variables and why there are two, and the open item from Step 12. Add a short paragraph to `infra/railway/README.md` pointing at it.

- [ ] **Step 14: Commit**

```bash
git add requirements-dev.txt pyproject.toml docker-compose.yml infra/postgres .env.example \
        scripts/dev-db.sh app/core/config.py .github/workflows/ci.yml \
        tests/config/test_database_config.py docs/deploy/railway-runbook.md infra/railway/README.md
git commit -m "infra(db): local Postgres 16, Railway staging database, and the drivers CI needs

SQLAlchemy and Alembic were in .venv but absent from requirements-dev.txt, so the
backend job would have failed at import. psycopg and cryptography were missing
outright. Local auth is trust so no credential enters the repo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: Seam 1 — the Alembic baseline

`main` owns `alembic/versions/**` outright; one revision per wave, authored in the contract commit. This task lands the machinery and the first revision. `.claude/hooks/block-protected.sh` already denies `Edit`/`Write` under `alembic/versions/`, so **the revision file is created with `alembic revision` and edited through Bash** — that is the sanctioned path, not a workaround.

**Files:**
- Create: `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/0001_baseline.py`
- Create: `app/models/base.py`, `app/models/studio.py`, `app/core/db.py`
- Create: `tests/conftest.py`, `tests/core/test_alembic_baseline.py`
- Modify: none of `app/main.py` or `app/models/__init__.py` — seam 2 discovers `base` and `studio` on its own.

**Interfaces:**
- Produces: `app.models.base.Base` — the declarative base every model inherits. `UUIDPrimaryKey` / `TimestampColumns` mixins.
- Produces: `app.models.studio.Studio` — the tenant root, `studio` table.
- Produces: `app.core.db.get_engine()`, `app.core.db.session_factory()`. Both lazy: importing the module must not require a database.
- Consumes: `settings.DATABASE_URL`, `settings.MIGRATION_DATABASE_URL` (Task 0).

- [ ] **Step 1: Write the failing test**

`tests/conftest.py`:

```python
"""Database fixtures.

These fail rather than skip when no database is reachable. A skipped DB test is a
gate that passes while checking nothing, which is exactly the failure mode M0.1
found three times. The message carries the fix.
"""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings

ROOT = Path(__file__).resolve().parents[1]

_NO_DB = (
    "No PostgreSQL at {url}.\n"
    "Start one:  ./scripts/dev-db.sh up\n"
    "These tests do not skip: a skipped database test is a gate that checks nothing."
)


@pytest.fixture(scope="session")
def migration_engine() -> Iterator[Engine]:
    engine = create_engine(settings.MIGRATION_DATABASE_URL, poolclass=None)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 -- the message matters more than the type
        pytest.fail(_NO_DB.format(url=settings.MIGRATION_DATABASE_URL) + f"\n\n{exc}")
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def migrated(migration_engine: Engine) -> Engine:
    """Upgrade to head once per session. Forward-only, per SPEC 8.1a."""
    subprocess.run(
        [str(ROOT / ".venv/bin/alembic"), "upgrade", "head"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return migration_engine


@pytest.fixture
def app_session(migrated: Engine) -> Iterator[Session]:
    """A session on the runtime role -- the one that cannot UPDATE audit_log."""
    engine = create_engine(settings.DATABASE_URL)
    with Session(engine) as session:
        yield session
    engine.dispose()
```

`tests/core/test_alembic_baseline.py`:

```python
"""Seam 1 -- main owns alembic/versions/**, one head, forward-only."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text

ROOT = Path(__file__).resolve().parents[2]


def _scripts() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini")))


def test_there_is_exactly_one_head() -> None:
    """Two heads means two lanes authored revisions in parallel, which is the
    single thing seam 1 exists to prevent."""
    assert len(_scripts().get_heads()) == 1, _scripts().get_heads()


def test_every_revision_has_a_downgrade_that_is_not_a_stub() -> None:
    """SPEC 8.1a: forward-only policy, but the most recent migration keeps a
    tested rollback. A `pass` body is not a rollback."""
    for revision in _scripts().walk_revisions():
        source = Path(revision.path).read_text(encoding="utf-8")
        body = source.split("def downgrade()", 1)[1]
        assert "pass" not in body.split("\n")[1:3][0] + body.split("\n")[1:3][1], (
            f"{revision.revision} has an empty downgrade"
        )


@pytest.mark.db
def test_a_fresh_database_upgrades_to_head_cleanly(migrated: Engine) -> None:
    with migrated.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == _scripts().get_current_head()


@pytest.mark.db
def test_the_studio_table_exists_with_its_spec_columns(migrated: Engine) -> None:
    columns = {c["name"] for c in inspect(migrated).get_columns("studio")}
    assert {
        "id", "name", "slug", "logo_object_key", "timezone", "default_locale",
        "status", "is_demo", "settings", "created_at", "updated_at",
    } <= columns


@pytest.mark.db
def test_studio_slug_is_unique(migrated: Engine) -> None:
    indexes = inspect(migrated).get_indexes("studio")
    uniques = {tuple(i["column_names"]) for i in indexes if i["unique"]}
    constraints = {
        tuple(c["column_names"]) for c in inspect(migrated).get_unique_constraints("studio")
    }
    assert ("slug",) in uniques | constraints


def test_the_versions_directory_is_protected_by_the_hook() -> None:
    """Behaviour, not a comment: run the hook the way Claude Code runs it and
    assert it denies. A lane that could edit a migration would break seam 1."""
    payload = '{"tool_input":{"file_path":"alembic/versions/0001_baseline.py"}}'
    result = subprocess.run(
        [str(ROOT / ".claude/hooks/block-protected.sh")],
        input=payload,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 2, "the hook allowed an edit to alembic/versions/"
    assert "protected" in result.stderr.lower()
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/core/test_alembic_baseline.py -q
```

Expected: FAIL — `alembic.ini` does not exist, so `ScriptDirectory.from_config` raises.

- [ ] **Step 3: Write `app/models/base.py`**

```python
"""The declarative base every model inherits.

Seam 2 imports this module by discovery, so nothing registers it by hand. SPEC 4.3:
every table has `id UUID PK`, `created_at`, `updated_at`; every timestamp is stored
UTC `timestamptz` (G3).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Explicit naming, so autogenerate produces stable names and a later migration can
# always drop a constraint by the name it was created under.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampColumns:
    """G3 -- always `timestamptz`, always UTC. Rendered in Asia/Jerusalem, never stored
    that way."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

- [ ] **Step 4: Write `app/models/studio.py`**

```python
"""The tenant root. Not itself tenant-scoped -- it *is* the tenant, so it carries no
`studio_id` and does not inherit TenantMixin.

SPEC 4.3's `created_by_identity_id` is deliberately absent: it references
`auth_identity`, which M1 owns. M1 adds the column and the foreign key in the same
revision that creates the table it points at.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

STUDIO_STATUSES = ("active", "suspended")


class Studio(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "studio"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'suspended')", name="studio_status"
        ),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    logo_object_key: Mapped[str | None] = mapped_column(String(500))
    # G3 -- rendering timezone, never a storage timezone.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Jerusalem")
    default_locale: Mapped[str] = mapped_column(String(8), nullable=False, default="he")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # 19.7 -- the demo studio is excluded from every cross-studio total.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
```

- [ ] **Step 5: Write `app/core/db.py`**

```python
"""Engine and session factory.

Lazy on purpose: importing this module must not open a connection, or `pytest
--collect-only` and `scripts/export_openapi.py` would both need a database.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy import Engine, create_engine

from app.core.config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
```

- [ ] **Step 6: Scaffold Alembic**

```bash
.venv/bin/alembic init -t generic alembic
```

Then replace `alembic.ini`'s `sqlalchemy.url` line so the URL never lives in a file that is committed:

```ini
# The URL is resolved in env.py from MIGRATION_DATABASE_URL. Never set it here: a
# committed DSN is a credential waiting to be committed with it.
sqlalchemy.url =
```

Replace `alembic/env.py`:

```python
"""Alembic wiring.

Two things matter here. The URL comes from MIGRATION_DATABASE_URL, so migrations run
as the schema owner and not as the runtime role (SPEC 11.2 needs those to differ).
And `app.models` is imported for its side effect: seam 2's discovery loop imports
every model module, so autogenerate sees a table the moment a lane adds a file.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401 -- seam 2 discovery populates Base.metadata
from app.core.config import settings
from app.models.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.MIGRATION_DATABASE_URL)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.MIGRATION_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 7: Author revision 0001**

The hook blocks `Edit`/`Write` under `alembic/versions/`, so generate and then write through Bash:

```bash
.venv/bin/alembic revision -m "baseline" --rev-id 0001
```

Then fill it in with a heredoc (`cat > alembic/versions/0001_baseline.py <<'PY'`). Content:

```python
"""baseline: roles, default privileges, studio

Revision ID: 0001
Revises:
Create Date: (generated)

Roles are created here and not only in the local init script, because environments
with no `docker-entrypoint-initdb.d` hook -- Railway, and GitHub Actions service
containers -- have no other place to get them. SPEC 11.2's append-only audit log
needs `studio_app` to exist before 0002 can revoke UPDATE and DELETE from it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.config import settings

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    role = settings.APP_DB_ROLE
    # NOLOGIN by default: infrastructure grants login and a password out of band, so
    # no credential is ever expressed in a migration. The local init script creates
    # the same role WITH LOGIN under trust auth, and CREATE ROLE is idempotent here.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                CREATE ROLE {role} NOLOGIN;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")
    # FOR ROLE is omitted deliberately: it defaults to current_user, which is whichever
    # role runs migrations in this environment (studio_migrator locally, the Railway
    # superuser in staging). Naming it would break one of the two.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}"
    )
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO {role}")

    op.create_table(
        "studio",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("logo_object_key", sa.String(500)),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Jerusalem"),
        sa.Column("default_locale", sa.String(8), nullable=False, server_default="he"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="ck_studio_studio_status"),
        sa.UniqueConstraint("slug", name="uq_studio_slug"),
    )
    # ALTER DEFAULT PRIVILEGES above applies to tables created after it, but only for
    # the role that ran it. Grant explicitly too, so a mismatch between the migrating
    # role here and elsewhere cannot silently leave the app without rights.
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON studio TO {role}")


def downgrade() -> None:
    role = settings.APP_DB_ROLE
    op.execute(f"REVOKE ALL ON studio FROM {role}")
    op.drop_table("studio")
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {role}"
    )
```

- [ ] **Step 8: Run the tests and confirm they pass**

```bash
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/core/test_alembic_baseline.py -q
```

Expected: PASS, and `alembic upgrade head` prints `Running upgrade  -> 0001, baseline` on a genuinely fresh database.

- [ ] **Step 9: Prove the hook test is not vacuous**

```bash
echo '{"tool_input":{"file_path":"app/main.py"}}' | .claude/hooks/block-protected.sh; echo "unprotected path exit=$?"
echo '{"tool_input":{"file_path":"alembic/versions/0001_baseline.py"}}' | .claude/hooks/block-protected.sh; echo "protected path exit=$?"
```

Expected: `0` then `2`. If both are 2 the hook is over-broad; if both are 0 the test asserts nothing.

- [ ] **Step 10: Commit**

```bash
git add alembic.ini alembic app/models/base.py app/models/studio.py app/core/db.py \
        tests/conftest.py tests/core/test_alembic_baseline.py
git commit -m "feat(db): seam 1 -- Alembic baseline, studio table, two DB roles

alembic/versions/** stays owned by main; the block-protected hook is asserted by
behaviour rather than trusted. Roles are created in the migration because Railway
and GitHub Actions service containers have no init hook.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Seam 4 — the slot registry

Nothing consumes this until M3. It lands now so no lane has to author it, and so no lane invents a second one. It is the mechanism that makes M4 ∥ M5 safe: the health badge on the attendance lane's roster row is a health-lane file registering into a slot, not a health-lane edit to an attendance-lane file.

**Files:**
- Create: `web/packages/ui/src/slots.ts`
- Create: `web/packages/ui/src/slots.test.tsx`
- Modify: `web/packages/ui/src/index.ts`

**Interfaces:**
- Produces: `SlotId`, `SlotEntry`, `registerSlot(slot, entry)`, `useSlot(slot)`, `clearSlot(slot)`. Consumed by every composite screen in waves 2–5.

- [ ] **Step 1: Write the failing test**

`web/packages/ui/src/slots.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { clearSlot, registerSlot, useSlot } from './slots'

const Strip = ({ label }: { label: string }) => <span>{label}</span>

describe('slot registry (seam 4)', () => {
  beforeEach(() => {
    clearSlot('student-card')
    clearSlot('roster-row')
  })

  it('returns an empty list for a slot nothing registered into', () => {
    expect(useSlot('student-card')).toEqual([])
  })

  it('orders entries by order, not by registration order', () => {
    registerSlot('student-card', { key: 'payment', order: 40, render: Strip })
    registerSlot('student-card', { key: 'belt', order: 10, render: Strip })
    registerSlot('student-card', { key: 'attendance', order: 20, render: Strip })

    expect(useSlot('student-card').map((e) => e.key)).toEqual([
      'belt',
      'attendance',
      'payment',
    ])
  })

  it('keeps slots independent -- one lane registering cannot leak into another', () => {
    registerSlot('student-card', { key: 'documents', order: 30, render: Strip })
    expect(useSlot('roster-row')).toEqual([])
  })

  it('replaces an entry registered twice under the same key', () => {
    registerSlot('roster-row', { key: 'health', order: 10, render: Strip })
    registerSlot('roster-row', { key: 'health', order: 99, render: Strip })

    const entries = useSlot('roster-row')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.order).toBe(99)
  })

  it('renders what a lane registered, which is the whole point', () => {
    registerSlot('roster-row', { key: 'health', order: 10, render: Strip })
    const [entry] = useSlot('roster-row')
    const Registered = entry!.render
    render(<Registered label="health-badge" />)
    expect(screen.getByText('health-badge')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run web/packages/ui/src/slots.test.tsx --reporter=dot
```

Run from `web/`: `npx vitest run packages/ui/src/slots.test.tsx --reporter=dot`.
Expected: FAIL — `Failed to resolve import "./slots"`.

- [ ] **Step 3: Write `web/packages/ui/src/slots.ts`**

The plan's version at §1.3 uses `React.FC<any>` and does not import React; `@typescript-eslint/no-explicit-any` and `tsc --strict` both reject it. Shape, names and semantics are unchanged.

```ts
// web/packages/ui/src/slots.ts — main only, authored once in M0.
//
// Seam 4. Five artboards are composed of sections owned by different verticals. A
// lane adds one file that calls registerSlot() at module load and one line in its own
// feature barrel; the container file is never reopened. Where a section needs data it
// reads a field the wave's contract commit already put in the payload — it never asks
// the container to fetch for it.
import type { ComponentType } from 'react'

export type SlotId =
  | 'student-card'
  | 'roster-row'
  | 'alert-centre'
  | 'setup-wizard'
  | 'dev-bar'

/**
 * `render` takes whatever props the container passes. Unknown rather than any: the
 * container's props are a contract from the wave's contract commit, so a section
 * narrows them at its own boundary and a typo does not silently type-check.
 */
export type SlotEntry = {
  key: string
  order: number
  render: ComponentType<Record<string, unknown>>
}

const registry = new Map<SlotId, SlotEntry[]>()

export function registerSlot(slot: SlotId, entry: SlotEntry): void {
  // Replace on key so a module evaluated twice — HMR, or a test importing a feature
  // barrel more than once — does not render the same strip twice.
  const list = (registry.get(slot) ?? []).filter((e) => e.key !== entry.key)
  list.push(entry)
  list.sort((a, b) => a.order - b.order)
  registry.set(slot, list)
}

export function useSlot(slot: SlotId): readonly SlotEntry[] {
  return registry.get(slot) ?? []
}

/** Tests only. Module-level state outlives a test file without it. */
export function clearSlot(slot: SlotId): void {
  registry.delete(slot)
}
```

- [ ] **Step 4: Export it**

In `web/packages/ui/src/index.ts`, add:

```ts
export { registerSlot, useSlot, clearSlot } from './slots'
export type { SlotEntry, SlotId } from './slots'
```

- [ ] **Step 5: Run the tests, the typecheck and the lint**

```bash
cd web && npx vitest run packages/ui/src/slots.test.tsx --reporter=dot
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: 5 passing, no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/slots.ts web/packages/ui/src/slots.test.tsx web/packages/ui/src/index.ts
git commit -m "feat(ui): seam 4 -- the slot registry

Nothing consumes it until M3. It lands now so no lane authors a second one. Typed
with ComponentType<Record<string, unknown>> rather than the plan's React.FC<any>,
which no-explicit-any and tsc --strict both reject.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tenancy — `TenantSession`, `TenantMixin`, `.with_all_tenants()`

SPEC §4.2 names three layers. This task builds all three: a request-scoped studio context, a mixin whose default query option applies `WHERE studio_id = :current_studio`, and the escape hatch. Layer three — "a test asserts every tenant-scoped table has a `studio_id` column and a composite index leading with it" — is invariant 2 and lands in Task 7.

The design decision that matters: **the filter fails closed.** A query issued with no studio in context raises rather than returning every studio's rows. A tenancy layer that quietly degrades to "no filter" when the context is missing is worse than none, because it looks like it is working.

**Files:**
- Create: `app/core/tenancy.py`
- Create: `tests/core/test_tenancy.py`
- Modify: `.claude/rules/api.md` (one line — the `coach` tag convention Task 7 keys off)

**Interfaces:**
- Produces: `TenantMixin` — declarative mixin adding non-null `studio_id` (FK to `studio.id`) and the leading composite index `ix_<table>_studio_id_id`. Subclasses add their own table args through `__tenant_table_args__`.
- Produces: `TenantSession(Session)` — the session class every request uses.
- Produces: `use_studio(studio_id)` context manager · `get_current_studio_id()` · `require_current_studio_id()`.
- Produces: `with_all_tenants(*, reason: str)` context manager, and `TenantSession.with_all_tenants(*, reason: str)`.
- Produces: `get_tenant_session` FastAPI dependency and the `TenantSessionDep` alias.
- Produces exceptions: `NoActiveStudioError`, `CrossTenantWriteError`.
- Consumes: `app.core.db.get_engine()`, `app.models.base.Base` (Task 1).

> **A deliberate addition beyond the spec's wording:** `with_all_tenants` takes a required `reason` keyword. SPEC §4.2 says the hatch "is only legal in platform-admin code and in background jobs that iterate studios deliberately". A required reason is what turns that sentence into something a reviewer can see at the call site, and it costs one argument. Flag it when handing this over.

- [ ] **Step 1: Write the failing test**

`tests/core/test_tenancy.py`:

```python
"""SPEC 4.2 -- tenant isolation at the query layer.

The probe model lives on its own DeclarativeBase so it never enters
app.models.base.Base.registry, which invariant 2 scans. A test fixture appearing in
a production invariant scan would make that invariant lie in both directions.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, MetaData, String, Table, Column, select, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.tenancy import (
    CrossTenantWriteError,
    NoActiveStudioError,
    TenantMixin,
    TenantSession,
    get_current_studio_id,
    use_studio,
    with_all_tenants,
)

ALPHA = uuid.UUID("11111111-1111-1111-1111-111111111111")
BETA = uuid.UUID("22222222-2222-2222-2222-222222222222")


class ProbeBase(DeclarativeBase):
    metadata = MetaData()


# The FK target must exist in this MetaData for the mixin's ForeignKey to resolve.
# create_all(checkfirst=True) will not recreate the real table.
Table("studio", ProbeBase.metadata, Column("id", PGUUID(as_uuid=True), primary_key=True))


class Widget(TenantMixin, ProbeBase):
    __tablename__ = "tenancy_probe_widget"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(40), nullable=False)


@pytest.fixture
def probe(migrated: Engine) -> Iterator[Engine]:
    with migrated.begin() as connection:
        for studio_id, slug in ((ALPHA, "alpha"), (BETA, "beta")):
            connection.execute(
                text(
                    "INSERT INTO studio (id, name, slug) VALUES (:id, :slug, :slug) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"id": studio_id, "slug": slug},
            )
    Widget.__table__.create(migrated, checkfirst=True)
    with TenantSession(bind=migrated, expire_on_commit=False) as seed:
        with with_all_tenants(reason="test fixture seeding both studios"):
            seed.add_all(
                [
                    Widget(studio_id=ALPHA, name="alpha-one"),
                    Widget(studio_id=ALPHA, name="alpha-two"),
                    Widget(studio_id=BETA, name="beta-one"),
                ]
            )
            seed.commit()
    yield migrated
    Widget.__table__.drop(migrated, checkfirst=True)


@pytest.fixture
def session(probe: Engine) -> Iterator[TenantSession]:
    with TenantSession(bind=probe, expire_on_commit=False) as s:
        yield s


# -- the mixin ---------------------------------------------------------------
def test_the_mixin_adds_a_non_null_studio_id() -> None:
    column = Widget.__table__.c.studio_id
    assert column.nullable is False
    assert {fk.column.table.name for fk in column.foreign_keys} == {"studio"}


def test_the_mixin_adds_a_composite_index_leading_with_studio_id() -> None:
    """G9. Leading matters: an index on (id, studio_id) does not serve a tenant scan."""
    leading = {tuple(i.columns.keys())[0] for i in Widget.__table__.indexes}
    assert "studio_id" in leading
    composite = [tuple(i.columns.keys()) for i in Widget.__table__.indexes]
    assert any(cols[0] == "studio_id" and len(cols) > 1 for cols in composite), composite


# -- the default filter ------------------------------------------------------
@pytest.mark.db
def test_a_query_sees_only_the_active_studio(session: TenantSession) -> None:
    with use_studio(ALPHA):
        names = set(session.scalars(select(Widget.name)).all())
    assert names == {"alpha-one", "alpha-two"}


@pytest.mark.db
def test_two_studios_in_one_process_do_not_share_a_cached_filter(
    session: TenantSession,
) -> None:
    """The failure mode this exists for: with_loader_criteria caches its lambda, and a
    naive implementation bakes the first studio's id into the cached statement. The
    second studio would then see the first's rows -- a cross-tenant leak that only
    appears on the second request, never in a single-test run."""
    with use_studio(ALPHA):
        first = set(session.scalars(select(Widget.name)).all())
    session.expunge_all()
    with use_studio(BETA):
        second = set(session.scalars(select(Widget.name)).all())

    assert first == {"alpha-one", "alpha-two"}
    assert second == {"beta-one"}


@pytest.mark.db
def test_a_query_with_no_active_studio_raises_rather_than_returning_everything(
    session: TenantSession,
) -> None:
    """Fail closed. A tenancy layer that degrades to `no filter` looks like it works."""
    assert get_current_studio_id() is None
    with pytest.raises(NoActiveStudioError):
        session.scalars(select(Widget.name)).all()


# -- the escape hatch --------------------------------------------------------
@pytest.mark.db
def test_with_all_tenants_sees_every_studio(session: TenantSession) -> None:
    with with_all_tenants(reason="platform operations board (18.3)"):
        assert len(session.scalars(select(Widget.name)).all()) == 3


@pytest.mark.db
def test_the_hatch_closes_again_when_the_block_exits(session: TenantSession) -> None:
    with with_all_tenants(reason="deliberate cross-studio job"):
        pass
    with pytest.raises(NoActiveStudioError):
        session.scalars(select(Widget.name)).all()


@pytest.mark.db
def test_the_session_method_reads_the_way_spec_4_2_writes_it(session: TenantSession) -> None:
    with session.with_all_tenants(reason="platform-admin"):
        assert len(session.scalars(select(Widget.name)).all()) == 3


def test_the_hatch_requires_a_reason() -> None:
    """SPEC 4.2 permits it only in platform-admin code and deliberate cross-studio
    jobs. A required reason is what makes which one visible at the call site."""
    with pytest.raises(ValueError):
        with with_all_tenants(reason="   "):
            pass


# -- writes ------------------------------------------------------------------
@pytest.mark.db
def test_an_insert_is_stamped_with_the_active_studio(session: TenantSession) -> None:
    with use_studio(BETA):
        session.add(Widget(name="beta-two"))
        session.commit()
        assert set(session.scalars(select(Widget.name)).all()) == {"beta-one", "beta-two"}


@pytest.mark.db
def test_writing_into_another_studio_is_refused(session: TenantSession) -> None:
    with use_studio(ALPHA), pytest.raises(CrossTenantWriteError):
        session.add(Widget(studio_id=BETA, name="smuggled"))
        session.flush()


# -- the dependency ----------------------------------------------------------
def test_the_dependency_rejects_a_request_with_no_resolved_studio() -> None:
    """SPEC 4.2 layer 1 resolves the studio from the JWT. Auth lands in M1, so the
    dependency reads request.state.studio_id, which M1's middleware sets. Until then
    the contract worth asserting is that an unresolved studio is a 401 and never an
    unscoped session."""
    from fastapi import HTTPException, Request

    from app.core.tenancy import studio_id_from_request

    request = Request({"type": "http", "headers": [], "method": "GET", "path": "/"})
    with pytest.raises(HTTPException) as caught:
        studio_id_from_request(request)
    assert caught.value.status_code == 401
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/core/test_tenancy.py -q
```

Expected: collection error — `No module named 'app.core.tenancy'`.

- [ ] **Step 3: Write `app/core/tenancy.py`**

```python
"""SPEC 4.2 -- tenant isolation, enforced at three layers.

1. A request-scoped studio context, resolved from the JWT by the dependency below.
2. A default query option on every TenantMixin model: WHERE studio_id = :current_studio.
3. Invariant 2 (tests/invariants) asserts every tenant-scoped table carries studio_id
   and a composite index leading with it.

The filter fails closed. A query with no studio in context raises NoActiveStudioError
rather than returning every studio's rows -- a layer that quietly degrades to "no
filter" is worse than none, because it looks like it is working.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from itertools import chain
from typing import Annotated, Any, ClassVar

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import ForeignKey, Index, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import (
    Mapped,
    ORMExecuteState,
    Session,
    declared_attr,
    mapped_column,
    with_loader_criteria,
)

from app.core.db import get_engine

ALL_TENANTS_OPTION = "with_all_tenants"

_current_studio_id: uuid.UUID | None
_current_studio: "ContextVarType[uuid.UUID | None]"

from contextvars import ContextVar  # noqa: E402 -- kept beside its two variables

_current_studio: ContextVar[uuid.UUID | None] = ContextVar("current_studio_id", default=None)
_all_tenants: ContextVar[bool] = ContextVar("with_all_tenants", default=False)


class NoActiveStudioError(RuntimeError):
    """Raised when a tenant-scoped query runs with no studio in context."""


class CrossTenantWriteError(RuntimeError):
    """Raised when a write targets a studio other than the active one."""


# -- the request-scoped context ----------------------------------------------
def get_current_studio_id() -> uuid.UUID | None:
    return _current_studio.get()


def require_current_studio_id() -> uuid.UUID:
    studio_id = _current_studio.get()
    if studio_id is None:
        raise NoActiveStudioError(
            "no active studio: a tenant-scoped query ran outside a TenantSession "
            "request scope. Use use_studio(...), or with_all_tenants(reason=...) if "
            "this is platform-admin code or a deliberate cross-studio job."
        )
    return studio_id


@contextmanager
def use_studio(studio_id: uuid.UUID) -> Iterator[None]:
    token = _current_studio.set(studio_id)
    try:
        yield
    finally:
        _current_studio.reset(token)


@contextmanager
def with_all_tenants(*, reason: str) -> Iterator[None]:
    """The SPEC 4.2 escape hatch.

    Legal ONLY in platform-admin code (SPEC 18.3) and in background jobs that iterate
    studios deliberately. The reason is required so which of the two is visible at the
    call site rather than in a commit message.
    """
    if not reason.strip():
        raise ValueError("with_all_tenants requires a reason")
    token = _all_tenants.set(True)
    try:
        yield
    finally:
        _all_tenants.reset(token)


# -- the mixin ---------------------------------------------------------------
class TenantMixin:
    """G9 -- non-null studio_id plus a composite index leading with it.

    A subclass adds its own table args through __tenant_table_args__ rather than
    __table_args__, so it can never drop the tenant index by overriding it.
    """

    __tenant_table_args__: ClassVar[tuple[Any, ...]] = ()

    @declared_attr
    def studio_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            PGUUID(as_uuid=True),
            ForeignKey("studio.id", ondelete="RESTRICT"),
            nullable=False,
        )

    @declared_attr.directive
    def __table_args__(cls) -> tuple[Any, ...]:  # noqa: N805
        return (
            Index(f"ix_{cls.__tablename__}_studio_id_id", "studio_id", "id"),
            *cls.__tenant_table_args__,
        )


# -- the session -------------------------------------------------------------
class TenantSession(Session):
    """The session class every request uses. The event handlers below are registered
    against this class, not against Session, so a deliberately unscoped session (a
    migration, a seed script) is a different type rather than a forgotten flag."""

    @contextmanager
    def with_all_tenants(self, *, reason: str) -> Iterator[TenantSession]:
        """Reads the way SPEC 4.2 writes it: `.with_all_tenants()`."""
        with _all_tenants_scope(reason=reason):
            yield self


_all_tenants_scope = with_all_tenants


@event.listens_for(TenantSession, "do_orm_execute")
def _apply_tenant_filter(state: ORMExecuteState) -> None:
    if state.is_column_load or state.is_relationship_load:
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if _all_tenants.get() or state.execution_options.get(ALL_TENANTS_OPTION, False):
        return
    studio_id = require_current_studio_id()
    state.statement = state.statement.options(
        with_loader_criteria(
            TenantMixin,
            lambda cls: cls.studio_id == studio_id,
            include_aliases=True,
        )
    )


@event.listens_for(TenantSession, "before_flush")
def _stamp_and_guard_writes(session: Session, flush_context: Any, instances: Any) -> None:
    if _all_tenants.get():
        return
    studio_id = require_current_studio_id()
    for obj in session.new:
        if isinstance(obj, TenantMixin):
            if getattr(obj, "studio_id", None) is None:
                obj.studio_id = studio_id
            elif obj.studio_id != studio_id:
                raise CrossTenantWriteError(
                    f"insert targets studio {obj.studio_id}, active studio is {studio_id}"
                )
    for obj in chain(session.dirty, session.deleted):
        if isinstance(obj, TenantMixin) and obj.studio_id != studio_id:
            raise CrossTenantWriteError(
                f"write targets studio {obj.studio_id}, active studio is {studio_id}"
            )


# -- the dependency ----------------------------------------------------------
def studio_id_from_request(request: Request) -> uuid.UUID:
    """SPEC 4.2 layer 1.

    M1 owns authentication and sets request.state.studio_id from the verified JWT.
    Until it lands this is the seam, and the contract worth holding is that an
    unresolved studio is a 401 -- never an unscoped session.
    """
    studio_id = getattr(request.state, "studio_id", None)
    if not isinstance(studio_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="no active studio"
        )
    return studio_id


def get_tenant_session(
    studio_id: Annotated[uuid.UUID, Depends(studio_id_from_request)],
) -> Iterator[TenantSession]:
    with use_studio(studio_id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


TenantSessionDep = Annotated[TenantSession, Depends(get_tenant_session)]
```

> **Clean up the import block.** The snippet above shows the `ContextVar` import inline for readability; move it to the top with the others and delete the two placeholder annotations. `ruff check --fix` will not do this for you.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
.venv/bin/pytest tests/core/test_tenancy.py -q
```

Expected: PASS. If `test_two_studios_in_one_process_do_not_share_a_cached_filter` fails, SQLAlchemy is caching the lambda's closure variable rather than binding it. The fix is to pass the criteria without a lambda by resolving the mapped attribute at call time:

```python
    entity = state.bind_mapper.class_ if state.bind_mapper is not None else None
    ...
    with_loader_criteria(TenantMixin, lambda cls: cls.studio_id == studio_id,
                         include_aliases=True, track_closure_variables=True)
```

Do not "fix" it by disabling caching globally — measure which of the two is actually happening before changing anything.

- [ ] **Step 5: Prove the filter is not vacuous**

Temporarily comment out the `state.statement = ...` line and re-run. `test_a_query_sees_only_the_active_studio` must go red. Restore it.

```bash
.venv/bin/pytest tests/core/test_tenancy.py -q   # confirm red, then restore, confirm green
```

- [ ] **Step 6: Record the `coach` tag convention**

Add to `.claude/rules/api.md`, under the existing bullets:

```markdown
- A router serving coaches is tagged `coach` (`APIRouter(tags=["coach"])`). SPEC §13's
  third invariant — no coach-scoped endpoint returns any financial field — is enforced
  against that tag, so an untagged coach router is an unguarded one.
```

- [ ] **Step 7: Typecheck, lint, commit**

```bash
.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests
.venv/bin/mypy app scripts
git add app/core/tenancy.py tests/core/test_tenancy.py .claude/rules/api.md
git commit -m "feat(core): SPEC 4.2 tenancy -- TenantSession, TenantMixin, with_all_tenants

The filter fails closed: a query with no studio in context raises rather than
returning every studio's rows. The escape hatch takes a required reason, so which of
4.2's two legal uses applies is visible at the call site.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Encryption — the AES-256-GCM envelope

SPEC §11.1 and §8.1a between them state the requirement precisely: AES-256-GCM, keys in Railway secrets and never in the database, versioned so rotation is possible **without re-encrypting everything at once**. M3 needs this for `registration_request.payload_encrypted` — it is not M4-only, so it cannot wait.

Envelope form, per the milestone plan's wording: a random per-record data key encrypts the payload, and that data key is wrapped by a versioned key-encryption key. That is what makes the rotation requirement literally true — `rewrap()` moves a row to a new key version by re-encrypting 48 bytes, never the payload.

**Files:**
- Create: `app/core/encryption.py`
- Create: `tests/core/test_encryption.py`

**Interfaces:**
- Produces: `Keyring`, `Keyring.from_settings()`, `EncryptionError`, `DecryptionError`.
- Produces: `encrypt(plaintext: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes`, `decrypt(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes`, `rewrap(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes`, `key_version_of(blob: bytes) -> int`.
- Produces: `EncryptedBytes(aad)` and `EncryptedJSON(aad)` SQLAlchemy `TypeDecorator`s. M3 declares `payload_encrypted: Mapped[dict] = mapped_column(EncryptedJSON("registration_request.payload"))`; M4 does the same for `answers_encrypted` and `signature_image_encrypted`.
- Consumes: `settings.ENCRYPTION_KEYS`, `settings.ENCRYPTION_ACTIVE_KEY_VERSION` (Task 0).

- [ ] **Step 1: Write the failing test**

`tests/core/test_encryption.py`:

```python
"""SPEC 11.1 -- AES-256-GCM envelope encryption.

No database needed: this is pure crypto. The rotation test is the load-bearing one.
"""

from __future__ import annotations

import base64
import os

import pytest
from pydantic import SecretStr

from app.core.encryption import (
    DecryptionError,
    EncryptedJSON,
    Keyring,
    decrypt,
    encrypt,
    key_version_of,
    payload_section,
    rewrap,
)

AAD = "health_declaration.answers_encrypted"
SECRET = b'{"asthma": true, "medication": "\xd7\xa8\xd7\x99\xd7\x98\xd7\x9c\xd7\x99\xd7\x9f"}'


def _key() -> SecretStr:
    return SecretStr(base64.b64encode(os.urandom(32)).decode())


@pytest.fixture
def v1() -> Keyring:
    return Keyring({1: _key()}, active_version=1)


def test_round_trip(v1: Keyring) -> None:
    assert decrypt(encrypt(SECRET, aad=AAD, keyring=v1), aad=AAD, keyring=v1) == SECRET


def test_the_ciphertext_contains_no_plaintext(v1: Keyring) -> None:
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    assert SECRET not in blob
    assert b"asthma" not in blob


def test_two_encryptions_of_the_same_plaintext_differ(v1: Keyring) -> None:
    """A per-record data key and a fresh nonce. Deterministic ciphertext would let an
    observer with the database tell which declarations match without any key."""
    assert encrypt(SECRET, aad=AAD, keyring=v1) != encrypt(SECRET, aad=AAD, keyring=v1)


def test_a_tampered_blob_is_refused(v1: Keyring) -> None:
    blob = bytearray(encrypt(SECRET, aad=AAD, keyring=v1))
    blob[-1] ^= 0x01
    with pytest.raises(DecryptionError):
        decrypt(bytes(blob), aad=AAD, keyring=v1)


def test_a_blob_moved_to_another_column_is_refused(v1: Keyring) -> None:
    """AAD binds a ciphertext to the column it belongs in, so moving one from
    answers_encrypted to signature_image_encrypted fails rather than decrypting into
    the wrong context."""
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    with pytest.raises(DecryptionError):
        decrypt(blob, aad="health_declaration.signature_image_encrypted", keyring=v1)


def test_a_key_that_is_not_256_bits_is_refused() -> None:
    with pytest.raises(ValueError):
        Keyring({1: SecretStr(base64.b64encode(os.urandom(16)).decode())}, active_version=1)


def test_an_unknown_active_version_is_refused() -> None:
    with pytest.raises(ValueError):
        Keyring({1: _key()}, active_version=2)


# -- the requirement rotation exists for ------------------------------------
def test_old_data_still_decrypts_after_the_active_key_moves_on(v1: Keyring) -> None:
    """SPEC 8.1a: versioned "so rotation does not require re-encrypting everything at
    once". This is that sentence as a test."""
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    rotated = Keyring({1: v1.raw(1), 2: _key()}, active_version=2)

    assert key_version_of(old) == 1
    assert decrypt(old, aad=AAD, keyring=rotated) == SECRET
    assert key_version_of(encrypt(SECRET, aad=AAD, keyring=rotated)) == 2


def test_rewrap_moves_a_blob_to_the_active_key_without_touching_the_payload(
    v1: Keyring,
) -> None:
    """The point of the envelope. Rewrapping a million health declarations
    re-encrypts 48 bytes each and decrypts none of them."""
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    rotated = Keyring({1: v1.raw(1), 2: _key()}, active_version=2)

    new = rewrap(old, aad=AAD, keyring=rotated)

    assert key_version_of(new) == 2
    assert payload_section(new) == payload_section(old)
    assert decrypt(new, aad=AAD, keyring=rotated) == SECRET


def test_a_retired_key_can_no_longer_decrypt(v1: Keyring) -> None:
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    retired = Keyring({2: _key()}, active_version=2)
    with pytest.raises(DecryptionError):
        decrypt(old, aad=AAD, keyring=retired)


# -- the column types --------------------------------------------------------
def test_encrypted_json_round_trips_through_bind_and_result(v1: Keyring) -> None:
    column = EncryptedJSON("registration_request.payload", keyring=v1)
    payload = {"child": "דני", "allergies": ["בוטנים"]}
    stored = column.process_bind_param(payload, dialect=None)
    assert stored is not None and b"\\u05d3" not in stored
    assert column.process_result_value(stored, dialect=None) == payload


def test_keys_are_never_written_to_the_database() -> None:
    """SPEC 8.1a: keys live in Railway secrets, "deliberately not in the database,
    which is the entire point: a leaked dump is inert without them"."""
    import app.models  # noqa: F401 -- seam 2 discovery
    from app.models.base import Base

    for table in Base.metadata.tables.values():
        for column in table.columns:
            assert "encryption_key" not in column.name
            assert not column.name.endswith("_kek")


def test_the_keyring_does_not_leak_through_repr() -> None:
    keyring = Keyring({1: _key()}, active_version=1)
    assert "SecretStr" not in repr(keyring) or "**" in repr(keyring)
    for fragment in (base64.b64encode(keyring.raw(1)).decode(), keyring.raw(1).hex()):
        assert fragment not in repr(keyring)
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/core/test_encryption.py -q
```

Expected: collection error — `No module named 'app.core.encryption'`.

- [ ] **Step 3: Write `app/core/encryption.py`**

```python
"""SPEC 11.1 -- application-level AES-256-GCM on health declaration answers,
signature images, registration request payloads and free-text medical notes.

Envelope form: a random 256-bit data key (DEK) encrypts the payload, and the DEK is
itself encrypted by a key-encryption key (KEK) drawn from a versioned keyring that
lives in Railway secrets and never in the database. That is what makes SPEC 8.1a's
requirement literally true -- rotating to a new KEK rewraps 48 bytes per row and
never decrypts a payload.

This is in addition to disk encryption. Disk encryption protects against a stolen
server; column encryption protects against a leaked backup, a SQL injection, or a
developer browsing production.

Blob layout, big-endian throughout:

    b"SMv1"        4    magic and format version
    key_version    2    which KEK wrapped the DEK
    wrapped_len    2    byte length of nonce + wrapped DEK
    wrap_nonce    12
    wrapped_dek   48    32-byte DEK + 16-byte GCM tag
    data_nonce    12
    ciphertext     n    payload + 16-byte GCM tag

The DEK wrap is bound to the key version, so a rewrap recomputes it. The payload is
bound to the AAD only, so a rewrap leaves it byte-identical.
"""

from __future__ import annotations

import base64
import json
import os
import struct
from collections.abc import Mapping
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import SecretStr
from sqlalchemy import Dialect, LargeBinary, TypeDecorator

from app.core.config import settings

MAGIC = b"SMv1"
_HEADER = struct.Struct(">4sHH")
_NONCE_BYTES = 12
_DEK_BYTES = 32
_KEY_BYTES = 32


class EncryptionError(RuntimeError):
    """Raised when a plaintext cannot be encrypted -- a misconfigured keyring."""


class DecryptionError(RuntimeError):
    """Raised when a blob cannot be decrypted: tampered, wrong AAD, or retired key."""


class Keyring:
    """The versioned KEKs. Never persisted, never logged, never rendered."""

    def __init__(self, keys: Mapping[int, SecretStr], active_version: int) -> None:
        decoded: dict[int, bytes] = {}
        for version, secret in keys.items():
            raw = base64.b64decode(secret.get_secret_value())
            if len(raw) != _KEY_BYTES:
                raise ValueError(
                    f"key version {version} is {len(raw) * 8} bits; AES-256 needs 256"
                )
            decoded[int(version)] = raw
        if active_version not in decoded:
            raise ValueError(f"active key version {active_version} is not in the keyring")
        self._keys = decoded
        self.active_version = active_version

    @classmethod
    def from_settings(cls) -> Keyring:
        if not settings.ENCRYPTION_KEYS:
            raise EncryptionError(
                "ENCRYPTION_KEYS is empty. In staging and production these come from "
                "Railway secrets; locally, see .env.example."
            )
        return cls(settings.ENCRYPTION_KEYS, settings.ENCRYPTION_ACTIVE_KEY_VERSION)

    def raw(self, version: int) -> bytes:
        try:
            return self._keys[version]
        except KeyError as exc:
            raise DecryptionError(f"key version {version} is not in the keyring") from exc

    def __repr__(self) -> str:
        return f"Keyring(versions={sorted(self._keys)}, active={self.active_version})"


def _keyring(keyring: Keyring | None) -> Keyring:
    return keyring if keyring is not None else Keyring.from_settings()


def _wrap_aad(version: int, aad: str) -> bytes:
    return MAGIC + struct.pack(">H", version) + aad.encode("utf-8")


def _payload_aad(aad: str) -> bytes:
    return MAGIC + aad.encode("utf-8")


def encrypt(plaintext: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    ring = _keyring(keyring)
    version = ring.active_version
    dek = os.urandom(_DEK_BYTES)

    wrap_nonce = os.urandom(_NONCE_BYTES)
    wrapped = AESGCM(ring.raw(version)).encrypt(wrap_nonce, dek, _wrap_aad(version, aad))

    data_nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(dek).encrypt(data_nonce, plaintext, _payload_aad(aad))

    wrapped_section = wrap_nonce + wrapped
    return (
        _HEADER.pack(MAGIC, version, len(wrapped_section))
        + wrapped_section
        + data_nonce
        + ciphertext
    )


def _split(blob: bytes) -> tuple[int, bytes, bytes]:
    if len(blob) < _HEADER.size:
        raise DecryptionError("blob is too short to carry a header")
    magic, version, wrapped_len = _HEADER.unpack_from(blob)
    if magic != MAGIC:
        raise DecryptionError(f"unrecognised blob format {magic!r}")
    start = _HEADER.size
    end = start + wrapped_len
    if len(blob) <= end:
        raise DecryptionError("blob is truncated")
    return version, blob[start:end], blob[end:]


def key_version_of(blob: bytes) -> int:
    """Which KEK version wrapped this blob's data key. Cheap: no key needed."""
    return _split(blob)[0]


def payload_section(blob: bytes) -> bytes:
    """The nonce + ciphertext a rewrap must leave untouched."""
    return _split(blob)[2]


def _unwrap(version: int, wrapped_section: bytes, aad: str, ring: Keyring) -> bytes:
    nonce, wrapped = wrapped_section[:_NONCE_BYTES], wrapped_section[_NONCE_BYTES:]
    try:
        return AESGCM(ring.raw(version)).decrypt(nonce, wrapped, _wrap_aad(version, aad))
    except InvalidTag as exc:
        raise DecryptionError("data key failed authentication") from exc


def decrypt(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    ring = _keyring(keyring)
    version, wrapped_section, payload = _split(blob)
    dek = _unwrap(version, wrapped_section, aad, ring)
    nonce, ciphertext = payload[:_NONCE_BYTES], payload[_NONCE_BYTES:]
    try:
        return AESGCM(dek).decrypt(nonce, ciphertext, _payload_aad(aad))
    except InvalidTag as exc:
        raise DecryptionError("payload failed authentication") from exc


def rewrap(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    """Move a blob to the active key version without decrypting its payload."""
    ring = _keyring(keyring)
    version, wrapped_section, payload = _split(blob)
    if version == ring.active_version:
        return blob
    dek = _unwrap(version, wrapped_section, aad, ring)

    target = ring.active_version
    nonce = os.urandom(_NONCE_BYTES)
    wrapped = AESGCM(ring.raw(target)).encrypt(nonce, dek, _wrap_aad(target, aad))
    section = nonce + wrapped
    return _HEADER.pack(MAGIC, target, len(section)) + section + payload


class EncryptedBytes(TypeDecorator[bytes]):
    """A BYTEA column whose contents are encrypted before they leave the process.

    Not queryable, which is fine -- nothing queries them. `derived_flags` exists
    precisely so coaches can be warned without decryption (SPEC 11.1).
    """

    impl = LargeBinary
    cache_ok = True

    def __init__(self, aad: str, *, keyring: Keyring | None = None) -> None:
        super().__init__()
        self.aad = aad
        self._keyring = keyring

    def process_bind_param(self, value: bytes | None, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        return encrypt(value, aad=self.aad, keyring=self._keyring)

    def process_result_value(self, value: bytes | None, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        return decrypt(value, aad=self.aad, keyring=self._keyring)


class EncryptedJSON(TypeDecorator[Any]):
    """The same, for a JSON document. ensure_ascii=False keeps Hebrew Hebrew."""

    impl = LargeBinary
    cache_ok = True

    def __init__(self, aad: str, *, keyring: Keyring | None = None) -> None:
        super().__init__()
        self.aad = aad
        self._keyring = keyring

    def process_bind_param(self, value: Any, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return encrypt(raw, aad=self.aad, keyring=self._keyring)

    def process_result_value(self, value: bytes | None, dialect: Dialect | None) -> Any:
        if value is None:
            return None
        return json.loads(decrypt(value, aad=self.aad, keyring=self._keyring))
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
.venv/bin/pytest tests/core/test_encryption.py -q
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Prove the AAD binding is not decorative**

Temporarily make `_payload_aad` return `MAGIC` regardless of `aad` and re-run. `test_a_blob_moved_to_another_column_is_refused` must go red. Restore it and confirm green.

- [ ] **Step 6: Generate a real local key and check the app boots with it**

```bash
.venv/bin/python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"
# put it in .env as ENCRYPTION_KEYS={"1":"<that>"} with ENCRYPTION_ACTIVE_KEY_VERSION=1
.venv/bin/python -c "from app.core.encryption import Keyring; print(Keyring.from_settings())"
```

Expected: `Keyring(versions=[1], active=1)` — and no key material in the output.

- [ ] **Step 7: Set the staging keys as Railway secrets**

```bash
railway variables --environment staging --service api \
  --set "ENCRYPTION_KEYS={\"1\":\"$(.venv/bin/python -c 'import base64,os;print(base64.b64encode(os.urandom(32)).decode())')\"}" \
  --set 'ENCRYPTION_ACTIVE_KEY_VERSION=1'
```

Do not echo the value into the transcript or into a file. Note in the runbook that staging holds version 1 and that rotation is `rewrap`, not re-encryption.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests
.venv/bin/mypy app scripts
git add app/core/encryption.py tests/core/test_encryption.py docs/deploy/railway-runbook.md
git commit -m "feat(core): SPEC 11.1 AES-256-GCM envelope with versioned keys

Per-record data key wrapped by a KEK from Railway secrets. rewrap() moves a row to a
new key version by re-encrypting 48 bytes and decrypting no payload, which is what
8.1a's 'rotation without re-encrypting everything' actually requires. M3 needs this
for registration_request.payload_encrypted, not just M4.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The append-only audit log

SPEC §11.2 is one sentence and it is a grant, not a convention: *"The application database role has `INSERT` on `audit_log` and no `UPDATE` or `DELETE`."* The test asserts that against `has_table_privilege`, so a future migration that hands the app role `UPDATE` fails the build rather than being noticed during an incident.

The ORM guard is belt-and-braces on top. It exists so the failure arrives as a readable Python exception during development instead of a Postgres permission error at 2am, but it is not the enforcement — the grant is.

**Files:**
- Create: `app/models/audit.py`
- Create: `app/services/audit.py`
- Create: `alembic/versions/0002_audit_log.py`
- Create: `tests/core/test_audit_append_only.py`

**Interfaces:**
- Produces: `app.models.audit.AuditLog` — the `audit_log` table.
- Produces: `AuditService.record(session, *, action, entity_type, entity_id, actor_person_id=None, actor_identity_id=None, actor_ip=None, is_sensitive=False, diff=None, studio_id=None) -> AuditLog`. Every wave's "log this read/write" requirement goes through it.
- Produces: `AuditLogImmutableError`.
- Consumes: `Base`, `TimestampColumns` (Task 1); `with_all_tenants` (Task 3).

- [ ] **Step 1: Write the failing test**

`tests/core/test_audit_append_only.py`:

```python
"""SPEC 11.2 -- append-only, enforced by grant.

The grant assertions are the real gate. The ORM guard is asserted too, but only so a
developer sees a readable error before Postgres does.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import AuditLog
from app.services.audit import AuditLogImmutableError, AuditService


@pytest.mark.db
def test_the_table_carries_every_column_spec_4_3_lists(migrated: Engine) -> None:
    columns = {c["name"] for c in inspect(migrated).get_columns("audit_log")}
    assert {
        "id", "studio_id", "actor_person_id", "actor_identity_id", "actor_ip",
        "action", "entity_type", "entity_id", "is_sensitive", "diff", "created_at",
    } <= columns


@pytest.mark.db
@pytest.mark.parametrize("privilege", ["UPDATE", "DELETE", "TRUNCATE"])
def test_the_application_role_cannot_change_a_row(migrated: Engine, privilege: str) -> None:
    """The whole of 11.2, asserted against the actual grants rather than a comment
    saying it is so."""
    with migrated.connect() as connection:
        granted = connection.execute(
            text("SELECT has_table_privilege(:role, 'audit_log', :privilege)"),
            {"role": settings.APP_DB_ROLE, "privilege": privilege},
        ).scalar_one()
    assert granted is False, f"{settings.APP_DB_ROLE} holds {privilege} on audit_log"


@pytest.mark.db
@pytest.mark.parametrize("privilege", ["INSERT", "SELECT"])
def test_the_application_role_can_still_append_and_read(
    migrated: Engine, privilege: str
) -> None:
    """The other half. A role that cannot INSERT makes the audit log a decoration,
    and a role that cannot SELECT makes 'who has seen my child's medical
    information?' unanswerable."""
    with migrated.connect() as connection:
        granted = connection.execute(
            text("SELECT has_table_privilege(:role, 'audit_log', :privilege)"),
            {"role": settings.APP_DB_ROLE, "privilege": privilege},
        ).scalar_one()
    assert granted is True


@pytest.mark.db
def test_the_grant_is_enforced_by_postgres_not_only_by_us(app_session: Session) -> None:
    """Behaviour, not metadata: issue a raw UPDATE as the application role and watch
    the database refuse it."""
    with pytest.raises(ProgrammingError) as caught:
        app_session.execute(text("UPDATE audit_log SET action = 'tampered'"))
    assert "permission denied" in str(caught.value).lower()
    app_session.rollback()


@pytest.mark.db
def test_recording_an_entry_writes_a_row(migrated: Engine) -> None:
    entity_id = uuid.uuid4()
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session,
            action="health_declaration.read",
            entity_type="health_declaration",
            entity_id=entity_id,
            actor_ip="203.0.113.7",
            is_sensitive=True,
        )
        session.commit()

        stored = session.get(AuditLog, entry.id)
        assert stored is not None
        assert stored.is_sensitive is True
        assert stored.entity_id == entity_id
        assert stored.created_at is not None


@pytest.mark.db
def test_the_orm_refuses_to_update_an_entry(migrated: Engine) -> None:
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session, action="login", entity_type="auth_identity", entity_id=uuid.uuid4()
        )
        session.commit()
        entry.action = "rewritten"
        with pytest.raises(AuditLogImmutableError):
            session.flush()
        session.rollback()


@pytest.mark.db
def test_the_orm_refuses_to_delete_an_entry(migrated: Engine) -> None:
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session, action="login", entity_type="auth_identity", entity_id=uuid.uuid4()
        )
        session.commit()
        session.delete(entry)
        with pytest.raises(AuditLogImmutableError):
            session.flush()
        session.rollback()


@pytest.mark.db
def test_a_platform_level_action_may_have_no_studio(migrated: Engine) -> None:
    """SPEC 4.3 writes `studio_id?`. A break-glass grant (18.2) and a platform login
    happen outside any studio, so nullable is the specification, not an oversight --
    which is why audit_log is in invariant 2's documented exemption list."""
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session, action="platform.break_glass", entity_type="studio",
            entity_id=uuid.uuid4(),
        )
        session.commit()
        assert entry.studio_id is None
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/core/test_audit_append_only.py -q
```

Expected: collection error — `No module named 'app.models.audit'`.

- [ ] **Step 3: Write `app/models/audit.py`**

```python
"""SPEC 11.2 -- the append-only audit log.

Not TenantMixin, deliberately. SPEC 4.3 writes `studio_id?`: a platform login, a
studio switch and a break-glass grant (18.2) all happen outside any one studio, and
`platform_admin` reads this table globally. It is therefore listed in invariant 2's
exemption set with that reason rather than being silently different.

`actor_person_id` and `actor_identity_id` are plain UUIDs with no foreign key: they
reference `person` and `auth_identity`, which M1 owns. M1's revision adds the
constraints once the tables it points at exist.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey


class AuditLog(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        # Managers view the trail for one entity; platform_admin views it globally.
        # Both are covered by leading with studio_id and then the entity.
        Index("ix_audit_log_studio_id_entity_type_entity_id", "studio_id", "entity_type", "entity_id"),
        Index("ix_audit_log_studio_id_created_at", "studio_id", "created_at"),
    )

    studio_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("studio.id", ondelete="RESTRICT")
    )
    actor_person_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    actor_identity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    actor_ip: Mapped[str | None] = mapped_column(INET)

    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    # 11.2 -- "whether the data was sensitive". Answers "who has seen my child's
    # medical information?" without reading anything sensitive to do it.
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
```

- [ ] **Step 4: Write `app/services/audit.py`**

```python
"""The only supported way a row reaches audit_log.

G6 -- business logic in a service; routers parse, call, return.

The ORM guard below is belt-and-braces. The enforcement is the grant in revision
0002: the application role holds INSERT and SELECT and nothing else. The guard exists
so the failure arrives as a readable Python exception in development rather than as a
Postgres permission error in production.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.audit import AuditLog


class AuditLogImmutableError(RuntimeError):
    """Raised on any attempt to modify or delete an audit entry."""


class AuditService:
    @staticmethod
    def record(
        session: Session,
        *,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        studio_id: uuid.UUID | None = None,
        actor_person_id: uuid.UUID | None = None,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
        is_sensitive: bool = False,
        diff: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Append one entry.

        `diff` is written verbatim, so a caller must never put a health declaration's
        contents in it (G7). Pass the derived booleans or the field names that
        changed -- never the answers.
        """
        entry = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            is_sensitive=is_sensitive,
            diff=diff,
        )
        session.add(entry)
        return entry


@event.listens_for(Session, "before_flush")
def _refuse_to_mutate_audit_entries(session: Session, flush_context: Any, instances: Any) -> None:
    for obj in session.dirty:
        if isinstance(obj, AuditLog) and session.is_modified(obj, include_collections=False):
            raise AuditLogImmutableError(
                "audit_log is append-only (SPEC 11.2). The application DB role holds "
                "INSERT and no UPDATE; this guard only makes that arrive sooner."
            )
    for obj in session.deleted:
        if isinstance(obj, AuditLog):
            raise AuditLogImmutableError("audit_log is append-only (SPEC 11.2)")
```

- [ ] **Step 5: Author revision 0002**

```bash
.venv/bin/alembic revision -m "audit_log" --rev-id 0002
```

Then write it through Bash (`cat > alembic/versions/0002_audit_log.py <<'PY'`):

```python
"""audit_log, append-only by grant

Revision ID: 0002
Revises: 0001

The REVOKE is the point. 0001's ALTER DEFAULT PRIVILEGES grants the application role
UPDATE and DELETE on every new table, which is right for every table except this one,
so it is taken back explicitly here. Explicit revoke beats the default; the test
asserts the result rather than the intent.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.config import settings

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    role = settings.APP_DB_ROLE
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_identity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_ip", postgresql.INET(), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("diff", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"], ["studio.id"], name="fk_audit_log_studio_id_studio",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_audit_log_studio_id_entity_type_entity_id",
        "audit_log",
        ["studio_id", "entity_type", "entity_id"],
    )
    op.create_index("ix_audit_log_studio_id_created_at", "audit_log", ["studio_id", "created_at"])

    # SPEC 11.2, the whole of it.
    op.execute(f"REVOKE ALL ON audit_log FROM {role}")
    op.execute(f"GRANT SELECT, INSERT ON audit_log TO {role}")


def downgrade() -> None:
    op.execute(f"REVOKE ALL ON audit_log FROM {settings.APP_DB_ROLE}")
    op.drop_index("ix_audit_log_studio_id_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_studio_id_entity_type_entity_id", table_name="audit_log")
    op.drop_table("audit_log")
```

- [ ] **Step 6: Migrate and run the tests**

```bash
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/core/test_audit_append_only.py -q
```

Expected: PASS.

- [ ] **Step 7: Prove the grant test is not vacuous**

This is the single most important "prove it fails" step in the session, because a grant test that silently passes is indistinguishable from one that works.

```bash
./scripts/dev-db.sh psql -c "GRANT UPDATE ON audit_log TO studio_app"
.venv/bin/pytest tests/core/test_audit_append_only.py -q   # MUST be red on UPDATE
./scripts/dev-db.sh psql -c "REVOKE UPDATE ON audit_log FROM studio_app"
.venv/bin/pytest tests/core/test_audit_append_only.py -q   # green again
```

If the first run is green, the test is asserting against the wrong role or the wrong table. Fix that before continuing — everything downstream trusts this.

- [ ] **Step 8: Record the staging deployment caveat**

In `docs/deploy/railway-runbook.md`, under the staging database section, add:

```markdown
**Open item — the api service connects as the superuser in staging.** Railway's managed
Postgres provides one role. Revision 0001 creates `studio_app` and 0002 revokes UPDATE
and DELETE on `audit_log` from it, so the grant SPEC §11.2 requires is correct in every
environment. What is not yet true in staging is that the API *uses* that role: both
`DATABASE_URL` and `MIGRATION_DATABASE_URL` currently point at the superuser. M1 splits
them, by giving `studio_app` a login password from a Railway secret and pointing
`DATABASE_URL` at it. Until then, append-only is enforced in tests and in local
development, and by convention in staging.
```

- [ ] **Step 9: Typecheck, lint, commit**

```bash
.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests
.venv/bin/mypy app scripts
git add app/models/audit.py app/services/audit.py alembic/versions/0002_audit_log.py \
        tests/core/test_audit_append_only.py docs/deploy/railway-runbook.md
git commit -m "feat(core): SPEC 11.2 append-only audit log, enforced by grant

The application role holds INSERT and SELECT on audit_log and nothing else. Asserted
against has_table_privilege and against a real UPDATE that Postgres refuses, not
against a comment. Verified the test goes red when the grant is restored.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The log scrubber

SPEC §11.7: *"No health data, card owner names or last-4 digits in application logs — enforced by a log scrubber and a test that asserts sensitive fields never serialize into log output."* G7 says the same about health declarations specifically.

§8.1 asks for structured JSON logs, and that is what makes the scrubber tractable: a log record's payload is a dict, and a dict can be scrubbed by key. Be honest about the boundary — a raw f-string that interpolates an answer into a message cannot be scrubbed by key, and the module docstring says so rather than implying coverage the code does not have.

**Files:**
- Create: `app/core/logging.py`
- Create: `tests/core/test_log_scrubber.py`

**Interfaces:**
- Produces: `SENSITIVE_KEYS`, `SENSITIVE_SUBSTRINGS`, `REDACTED`, `is_sensitive_key(name)`, `scrub(value)`, `ScrubbingFilter`, `JsonFormatter`, `configure_logging()`.
- Consumed by: invariant 4 (Task 7), and by every service that logs from M1 on.

- [ ] **Step 1: Write the failing test**

`tests/core/test_log_scrubber.py`:

```python
"""SPEC 11.7 and G7 -- sensitive fields never serialize into log output."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from io import StringIO

import pytest

from app.core.logging import (
    REDACTED,
    JsonFormatter,
    ScrubbingFilter,
    is_sensitive_key,
    scrub,
)

# A realistic declaration, not a toy. Hebrew free text is the case a naive
# str()-based scrubber gets wrong.
DECLARATION = {
    "student_id": "3f2b...",
    "answers": {
        "asthma": "כן, משתמש במשאף לפני אימון",
        "allergies": "אגוזים, בוטנים",
        "medication": "ונטולין",
    },
    "derived_flags": {"asthma": True, "allergy": True},
    "signature_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    "signed_by_person_id": "9a1c...",
}

PAYMENT = {"card_owner_name": "ישראל ישראלי", "four_digits": "4242", "amount_agorot": 25000}


@pytest.fixture
def captured() -> Iterator[StringIO]:
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())
    logger = logging.getLogger("test.scrubber")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    yield stream
    logger.handlers = []


# -- the key predicate -------------------------------------------------------
@pytest.mark.parametrize(
    "name",
    [
        "answers", "answers_encrypted", "derived_flags", "signature_image",
        "signature_image_encrypted", "payload_encrypted", "medical_note",
        "card_owner_name", "four_digits", "raw_query", "password", "refresh_token",
        "ENCRYPTION_KEYS", "Authorization",
    ],
)
def test_sensitive_keys_are_recognised_case_insensitively(name: str) -> None:
    assert is_sensitive_key(name)


@pytest.mark.parametrize("name", ["student_id", "session_id", "amount_agorot", "status"])
def test_ordinary_keys_are_left_alone(name: str) -> None:
    assert not is_sensitive_key(name)


# -- scrub() -----------------------------------------------------------------
def test_scrub_redacts_nested_health_answers() -> None:
    cleaned = scrub(DECLARATION)
    assert cleaned["answers"] == REDACTED
    assert cleaned["derived_flags"] == REDACTED
    assert cleaned["signature_image"] == REDACTED
    assert cleaned["student_id"] == "3f2b..."


def test_scrub_reaches_inside_lists() -> None:
    cleaned = scrub({"declarations": [DECLARATION, DECLARATION]})
    for entry in cleaned["declarations"]:
        assert entry["answers"] == REDACTED


def test_scrub_does_not_mutate_its_input() -> None:
    """A scrubber that mutates would silently corrupt the object the caller is about
    to persist."""
    before = json.dumps(DECLARATION, ensure_ascii=False, sort_keys=True)
    scrub(DECLARATION)
    assert json.dumps(DECLARATION, ensure_ascii=False, sort_keys=True) == before


def test_scrub_survives_a_cycle() -> None:
    node: dict[str, object] = {"answers": "secret"}
    node["self"] = node
    assert scrub(node)["answers"] == REDACTED


# -- end to end through the logging stack -----------------------------------
def test_a_health_declaration_logged_as_extra_never_reaches_the_output(
    captured: StringIO,
) -> None:
    logging.getLogger("test.scrubber").info(
        "health declaration stored", extra={"declaration": DECLARATION}
    )
    output = captured.getvalue()
    for secret in ("משאף", "בוטנים", "ונטולין", "iVBORw0KGgo"):
        assert secret not in output, f"{secret!r} reached the log"
    assert REDACTED in output


def test_card_details_never_reach_the_output(captured: StringIO) -> None:
    logging.getLogger("test.scrubber").info("payment recorded", extra={"payment": PAYMENT})
    output = captured.getvalue()
    assert "ישראל ישראלי" not in output
    assert "4242" not in output
    # G2's money is not sensitive -- redacting it would make the log useless.
    assert "25000" in output


def test_a_dict_passed_positionally_is_scrubbed_too(captured: StringIO) -> None:
    logging.getLogger("test.scrubber").info("stored %s", DECLARATION)
    assert "ונטולין" not in captured.getvalue()


def test_the_output_is_valid_json_with_the_fields_an_operator_needs(
    captured: StringIO,
) -> None:
    logging.getLogger("test.scrubber").info("hello", extra={"studio_id": "abc"})
    record = json.loads(captured.getvalue().strip())
    assert record["message"] == "hello"
    assert record["level"] == "INFO"
    assert record["logger"] == "test.scrubber"
    assert record["studio_id"] == "abc"
    assert "timestamp" in record


def test_an_exception_traceback_is_carried_without_leaking_a_payload(
    captured: StringIO,
) -> None:
    try:
        raise ValueError("boom")
    except ValueError:
        logging.getLogger("test.scrubber").exception("failed", extra={"row": DECLARATION})
    record = json.loads(captured.getvalue().strip())
    assert "ValueError: boom" in record["exception"]
    assert "ונטולין" not in captured.getvalue()
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
.venv/bin/pytest tests/core/test_log_scrubber.py -q
```

Expected: collection error — `No module named 'app.core.logging'`.

- [ ] **Step 3: Write `app/core/logging.py`**

```python
"""SPEC 11.7 -- structured JSON logs with a scrubbing filter.

    "No health data, card owner names or last-4 digits in application logs --
     enforced by a log scrubber and a test that asserts sensitive fields never
     serialize into log output."

G7 says the same about health declarations specifically: never log their contents.

**What this covers, and what it does not.** Scrubbing is by key. Anything passed as
`extra=`, and any dict, list or dataclass passed as a positional argument, is walked
and redacted. A raw f-string that interpolates an answer directly into the message --
`logger.info(f"answers={answers}")` -- has no key to match and cannot be caught here.
That is a code-review rule, not a runtime guarantee, and pretending otherwise would be
worse than saying so. Log the payload as `extra`, never in the message.

`derived_flags` is redacted even though coaches are allowed to see it: allowed *in the
app* is not allowed *in a log file that an operator greps*.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any

REDACTED = "[redacted]"

SENSITIVE_KEYS = frozenset(
    {
        # Health (11.1, G7)
        "answers", "answers_encrypted", "derived_flags", "health_answers",
        "signature_image", "signature_image_encrypted", "medical_note", "medical_notes",
        "payload_encrypted", "health_declaration",
        # Payments (11.7, 12 -- uPay's IPN carries card details in its query string)
        "card_owner_name", "four_digits", "card_number", "raw_query",
        # Credentials
        "password", "secret", "token", "refresh_token", "access_token", "id_token",
        "authorization", "api_key", "encryption_keys", "private_key",
    }
)

# Matched as substrings so a lane's new column is covered the day it lands.
SENSITIVE_SUBSTRINGS = (
    "_encrypted", "password", "secret", "token", "authorization", "api_key",
    "card_owner", "four_digits",
)

_MAX_DEPTH = 12
# Attributes logging puts on every record. Anything else came from `extra`.
_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "message", "asctime", "taskName",
}


def is_sensitive_key(name: str) -> bool:
    lowered = name.lower()
    return lowered in SENSITIVE_KEYS or any(s in lowered for s in SENSITIVE_SUBSTRINGS)


def scrub(value: Any, *, _depth: int = 0, _seen: set[int] | None = None) -> Any:
    """Return a copy with every sensitive key's value replaced.

    Never mutates its input: the caller is usually about to persist the object.
    """
    seen = set() if _seen is None else _seen
    if _depth > _MAX_DEPTH:
        return REDACTED
    if id(value) in seen:
        return REDACTED
    if is_dataclass(value) and not isinstance(value, type):
        value = asdict(value)
    if hasattr(value, "model_dump"):  # pydantic v2, without importing it here
        value = value.model_dump()
    if isinstance(value, dict):
        seen = seen | {id(value)}
        return {
            str(k): REDACTED if is_sensitive_key(str(k)) else scrub(v, _depth=_depth + 1, _seen=seen)
            for k, v in value.items()
        }
    if isinstance(value, list | tuple | set):
        seen = seen | {id(value)}
        return [scrub(v, _depth=_depth + 1, _seen=seen) for v in value]
    return value


class ScrubbingFilter(logging.Filter):
    """Installed on every handler. Returns True always -- it edits, never drops."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key in _RESERVED:
                continue
            record.__dict__[key] = (
                REDACTED if is_sensitive_key(key) else scrub(record.__dict__[key])
            )
        if isinstance(record.args, dict):
            record.args = scrub(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(scrub(a) for a in record.args)
        if isinstance(record.msg, dict | list):
            record.msg = scrub(record.msg)
        return True


class JsonFormatter(logging.Formatter):
    """SPEC 8.1 -- structured JSON logs. ensure_ascii=False keeps Hebrew readable."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Install the formatter and the filter on the root logger. Called from main."""
    from app.core.config import settings

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL.upper())
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
.venv/bin/pytest tests/core/test_log_scrubber.py -q
```

Expected: PASS.

- [ ] **Step 5: Prove the scrubber is what makes the tests green**

```bash
# Temporarily make ScrubbingFilter.filter return True without editing anything.
.venv/bin/pytest tests/core/test_log_scrubber.py -q
```

Expected while stubbed: the three end-to-end tests go red with the Hebrew answers in the output. Restore and confirm green.

- [ ] **Step 6: Call `configure_logging()` on boot**

In `app/main.py`, add the call immediately after the imports and **before** `app = FastAPI(...)`. This is the one edit to `app/main.py` this session makes, and it is not a registration — seam 2's discovery loop is untouched. Confirm `tests/test_router_discovery.py` still passes, particularly `test_main_mounts_by_discovery_not_by_an_explicit_list`, which counts `include_router` occurrences.

```python
from app.core.logging import configure_logging

configure_logging()
```

```bash
.venv/bin/pytest tests/test_router_discovery.py -q
```

- [ ] **Step 7: Typecheck, lint, commit**

```bash
.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests
.venv/bin/mypy app scripts
git add app/core/logging.py app/main.py tests/core/test_log_scrubber.py
git commit -m "feat(core): SPEC 11.7 log scrubber and structured JSON logs

Health answers, signature images, card owner names and last-4 digits are redacted by
key from extra fields and from dict arguments. The module docstring states the
boundary honestly: an f-string that interpolates an answer into the message has no
key to match and is a review rule, not a runtime guarantee.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `tests/invariants/` — SPEC §13's five non-negotiables

These run in **every** lane, every time, via `lane-check.sh`. Invariants 3 and 5 assert vacuously true until M6 exists; that is correct and intended. But a vacuous assertion is indistinguishable from a broken one, so **every invariant in this task ships with a self-test that runs the detector against a deliberately violating fixture and asserts it fires.** That is what makes a gate which currently finds nothing still worth having.

**Files:**
- Create: `tests/invariants/__init__.py`
- Create: `tests/invariants/test_01_money_is_never_a_float.py`
- Create: `tests/invariants/test_02_tenant_tables_are_scoped.py`
- Create: `tests/invariants/test_03_coach_endpoints_expose_no_money.py`
- Create: `tests/invariants/test_04_health_never_reaches_logs.py`
- Create: `tests/invariants/test_05_the_billing_run_is_idempotent.py`

**Interfaces:**
- Consumes: `Base` (Task 1), `TenantMixin` (Task 3), `scrub`/`JsonFormatter`/`ScrubbingFilter` (Task 6), `app.main.app`.
- Produces: nothing importable. These are gates, not a library.

- [ ] **Step 1: Write invariant 1 — no money column is a float**

`tests/invariants/test_01_money_is_never_a_float.py`:

```python
"""SPEC 13 invariant 1 / G2: money is always an integer count of agorot.

Two failure modes, not one. A float column is the obvious one. The quieter one is a
money column that does not say `_agorot`, because the next person to read it will
assume shekels and divide by a hundred somewhere.
"""

from __future__ import annotations

import re

import sqlalchemy as sa
from sqlalchemy import Column, Integer, MetaData, Numeric, Table

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
from app.models.base import Base

INTEGER_TYPES = (sa.Integer, sa.BigInteger, sa.SmallInteger)
MONEY_WORDS = re.compile(r"(amount|price|fee|balance|total|sum|cost)", re.IGNORECASE)
# Counts, not money. `max_payments` is how many instalments, not how many shekels.
NOT_MONEY = {"max_payments", "charges_created", "payments_count"}


def float_money_columns(metadata: sa.MetaData) -> list[str]:
    bad = []
    for table in metadata.tables.values():
        for column in table.columns:
            if column.name.endswith("_agorot") and not isinstance(column.type, INTEGER_TYPES):
                bad.append(f"{table.name}.{column.name} is {column.type!r}, not an integer")
    return bad


def mis_named_money_columns(metadata: sa.MetaData) -> list[str]:
    bad = []
    for table in metadata.tables.values():
        for column in table.columns:
            name = column.name
            if name in NOT_MONEY or name.endswith("_agorot"):
                continue
            if MONEY_WORDS.search(name):
                bad.append(f"{table.name}.{name} looks like money but does not end in _agorot")
    return bad


def test_no_money_column_is_a_float() -> None:
    assert float_money_columns(Base.metadata) == []


def test_every_money_column_says_agorot() -> None:
    assert mis_named_money_columns(Base.metadata) == []


# -- the detectors are proven to fire, because today they find nothing --------
def test_the_float_detector_flags_a_float_money_column() -> None:
    probe = MetaData()
    Table("probe", probe, Column("amount_agorot", Numeric(10, 2)))
    assert float_money_columns(probe) == [
        "probe.amount_agorot is Numeric(precision=10, scale=2), not an integer"
    ]


def test_the_naming_detector_flags_a_bare_amount_column() -> None:
    probe = MetaData()
    Table("probe", probe, Column("monthly_amount", Integer))
    assert mis_named_money_columns(probe) == [
        "probe.monthly_amount looks like money but does not end in _agorot"
    ]
```

- [ ] **Step 2: Write invariant 2 — every tenant-scoped table is scoped**

`tests/invariants/test_02_tenant_tables_are_scoped.py`:

```python
"""SPEC 13 invariant 2 / G9 / SPEC 4.2 layer 3.

Stated as a closed rule rather than an open one: every mapped table either inherits
TenantMixin -- and therefore has a non-null studio_id and a composite index leading
with it -- or appears below with a reason. A table cannot become cross-tenant by
omission.
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey, MetaData, String, Table
from sqlalchemy.dialects.postgresql import UUID as PGUUID

import app.models  # noqa: F401 -- seam 2 discovery
from app.core.tenancy import TenantMixin
from app.models.base import Base

CROSS_TENANT_TABLES = {
    "studio": "the tenant root -- it *is* the tenant, so it carries no studio_id",
    "audit_log": (
        "SPEC 4.3 writes `studio_id?`. A platform login, a studio switch and a "
        "break-glass grant (18.2) happen outside any studio, and platform_admin "
        "reads the table globally (11.2)"
    ),
    "alembic_version": "Alembic's own bookkeeping",
}


def tenant_mapped_tables() -> set[str]:
    return {
        mapper.local_table.name
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantMixin) and mapper.local_table is not None
    }


def unscoped_tables(metadata: sa.MetaData, tenant_tables: set[str]) -> list[str]:
    return sorted(
        table.name
        for table in metadata.tables.values()
        if table.name not in tenant_tables and table.name not in CROSS_TENANT_TABLES
    )


def badly_indexed(metadata: sa.MetaData, tenant_tables: set[str]) -> list[str]:
    bad = []
    for name in sorted(tenant_tables):
        table = metadata.tables[name]
        column = table.c.get("studio_id")
        if column is None:
            bad.append(f"{name} inherits TenantMixin but has no studio_id")
            continue
        if column.nullable:
            bad.append(f"{name}.studio_id is nullable")
        leading_composite = [
            tuple(i.columns.keys())
            for i in table.indexes
            if len(i.columns) > 1 and tuple(i.columns.keys())[0] == "studio_id"
        ]
        if not leading_composite:
            bad.append(f"{name} has no composite index leading with studio_id")
    return bad


def test_every_table_is_tenant_scoped_or_documented_as_not() -> None:
    assert unscoped_tables(Base.metadata, tenant_mapped_tables()) == []


def test_every_tenant_table_has_a_non_null_studio_id_and_a_leading_index() -> None:
    assert badly_indexed(Base.metadata, tenant_mapped_tables()) == []


def test_every_exemption_carries_a_reason() -> None:
    """An exemption list without reasons becomes a place to hide a table."""
    for table, reason in CROSS_TENANT_TABLES.items():
        assert len(reason) > 20, f"{table}'s exemption has no real reason"


# -- proven to fire ----------------------------------------------------------
def test_the_detector_flags_an_undocumented_table_with_no_studio_id() -> None:
    probe = MetaData()
    Table("smuggled", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    assert unscoped_tables(probe, set()) == ["smuggled"]


def test_the_detector_flags_a_nullable_studio_id_and_a_missing_index() -> None:
    probe = MetaData()
    Table("studio", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    Table(
        "sloppy",
        probe,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), ForeignKey("studio.id"), nullable=True),
        Column("name", String(10)),
    )
    assert badly_indexed(probe, {"sloppy"}) == [
        "sloppy.studio_id is nullable",
        "sloppy has no composite index leading with studio_id",
    ]


def test_the_detector_rejects_an_index_that_does_not_lead_with_studio_id() -> None:
    """An index on (id, studio_id) does not serve a tenant scan; only the leading
    column is usable for it."""
    probe = MetaData()
    Table("studio", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    table = Table(
        "trailing",
        probe,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), ForeignKey("studio.id"), nullable=False),
    )
    sa.Index("ix_trailing_id_studio_id", table.c.id, table.c.studio_id)
    assert badly_indexed(probe, {"trailing"}) == [
        "trailing has no composite index leading with studio_id"
    ]


def test_uuid_is_imported_for_a_reason() -> None:
    """Guard against the import being pruned; the probes above rely on it."""
    assert uuid.UUID is not None
```

> Drop `test_uuid_is_imported_for_a_reason` and the `uuid` import if ruff flags them as unused — they are only there because the probe fixtures may or may not need a UUID literal. Prefer removing the import.

- [ ] **Step 3: Write invariant 3 — no coach-scoped endpoint returns money**

`tests/invariants/test_03_coach_endpoints_expose_no_money.py`:

```python
"""SPEC 13 invariant 3: no coach-scoped endpoint returns any financial field.

Vacuous today -- no coach router exists until M1, and no financial field until M6.
That is correct and intended: it must exist now so no lane can land the first
violation unnoticed. The self-tests below are what make a currently-empty gate worth
having, because they prove the detector fires when there *is* something to find.

The convention it keys off is recorded in .claude/rules/api.md: a router serving
coaches is tagged `coach`.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel

from app.main import app

COACH_TAG = "coach"
FINANCIAL = re.compile(
    r"(_agorot$|^amount|^price|^balance|charge|payment|invoice|receipt|debt)", re.IGNORECASE
)


def financial_fields(model: type[BaseModel], seen: set[type] | None = None) -> list[str]:
    """Recursive, because a nested model is how this leaks in practice: a roster row
    that innocently embeds a student summary carrying a balance."""
    seen = seen or set()
    if model in seen:
        return []
    seen.add(model)
    found = []
    for name, field in model.model_fields.items():
        if FINANCIAL.search(name):
            found.append(f"{model.__name__}.{name}")
        annotation = field.annotation
        for candidate in (annotation, *getattr(annotation, "__args__", ())):
            if isinstance(candidate, type) and issubclass(candidate, BaseModel):
                found.extend(financial_fields(candidate, seen))
    return found


def leaks(application: FastAPI) -> list[str]:
    found = []
    for route in application.routes:
        if not isinstance(route, APIRoute) or COACH_TAG not in (route.tags or []):
            continue
        model = route.response_model
        if isinstance(model, type) and issubclass(model, BaseModel):
            found.extend(f"{route.path} -> {f}" for f in financial_fields(model))
    return found


def test_no_coach_scoped_endpoint_returns_a_financial_field() -> None:
    assert leaks(app) == []


# -- proven to fire ----------------------------------------------------------
def _probe_app(model: type[BaseModel], *, tags: list[str]) -> FastAPI:
    router = APIRouter(tags=tags)

    @router.get("/roster", response_model=model)
    def roster() -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    return probe


def test_the_detector_flags_a_coach_route_that_returns_money() -> None:
    class RosterRow(BaseModel):
        student_id: str
        balance_agorot: int

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == ["/roster -> RosterRow.balance_agorot"]


def test_the_detector_reaches_into_a_nested_model() -> None:
    class Summary(BaseModel):
        outstanding_charge_agorot: int

    class RosterRow(BaseModel):
        student_id: str
        summary: Summary

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == [
        "/roster -> Summary.outstanding_charge_agorot"
    ]


def test_a_manager_route_may_return_money() -> None:
    """The invariant is about coach scope, not about money. A manager route returning
    a balance is the product working."""

    class Ledger(BaseModel):
        balance_agorot: int

    assert leaks(_probe_app(Ledger, tags=["billing"])) == []


def test_the_gate_is_currently_empty_and_says_so() -> None:
    """Records the vacuity rather than hiding it. When M1 lands the first coach
    router this goes red, and the fix is to delete this test."""
    coach_routes = [
        r for r in app.routes if isinstance(r, APIRoute) and COACH_TAG in (r.tags or [])
    ]
    assert coach_routes == [], (
        "a coach-scoped route now exists -- delete this test; the real assertion above "
        "is no longer vacuous"
    )
```

- [ ] **Step 4: Write invariant 4 — health data never reaches log output**

`tests/invariants/test_04_health_never_reaches_logs.py`:

```python
"""SPEC 13 invariant 4 / SPEC 11.7 / G7: health data never appears in serialized log
output.

Not a unit test of scrub() -- tests/core/test_log_scrubber.py is that. This runs a
realistic declaration through the logging stack the application actually configures
and greps the bytes that come out.
"""

from __future__ import annotations

import logging
from io import StringIO

import pytest

from app.core.logging import REDACTED, JsonFormatter, ScrubbingFilter

DECLARATION = {
    "student_id": "8b0d4c2e",
    "template_version": 3,
    "answers": {
        "chronic_illness": "אסתמה",
        "medication": "ונטולין, לפני אימון",
        "allergies": "בוטנים ואגוזי לוז",
        "surgeries": "ניתוח ברך 2024",
        "free_text": "יש לפנות לאמא בכל מקרה של קוצר נשימה",
    },
    "derived_flags": {"asthma": True, "allergy": True, "medication": True},
    "signature_image": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
}

# Every value a coach, a log aggregator or a support engineer must never see.
SECRETS = [
    "אסתמה", "ונטולין", "בוטנים", "אגוזי לוז", "ניתוח ברך",
    "קוצר נשימה", "iVBORw0KGgo",
]


@pytest.fixture
def emitted() -> StringIO:
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())
    logger = logging.getLogger("invariant.health")
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    return stream


def test_a_declaration_logged_as_extra_never_serializes(emitted: StringIO) -> None:
    logging.getLogger("invariant.health").info(
        "declaration signed", extra={"declaration": DECLARATION}
    )
    for secret in SECRETS:
        assert secret not in emitted.getvalue(), f"{secret!r} reached the log"


def test_a_declaration_logged_positionally_never_serializes(emitted: StringIO) -> None:
    logging.getLogger("invariant.health").warning("stored %s", DECLARATION)
    for secret in SECRETS:
        assert secret not in emitted.getvalue()


def test_a_list_of_declarations_never_serializes(emitted: StringIO) -> None:
    logging.getLogger("invariant.health").info(
        "batch", extra={"batch": {"rows": [DECLARATION, DECLARATION]}}
    )
    for secret in SECRETS:
        assert secret not in emitted.getvalue()


def test_a_declaration_inside_an_exception_path_never_serializes(emitted: StringIO) -> None:
    try:
        raise RuntimeError("pdf render failed")
    except RuntimeError:
        logging.getLogger("invariant.health").exception("render", extra={"row": DECLARATION})
    output = emitted.getvalue()
    assert "pdf render failed" in output
    for secret in SECRETS:
        assert secret not in output


def test_the_non_sensitive_context_an_operator_needs_survives(emitted: StringIO) -> None:
    """A scrubber that redacts everything is a scrubber nobody keeps switched on."""
    logging.getLogger("invariant.health").info(
        "declaration signed", extra={"declaration": DECLARATION}
    )
    output = emitted.getvalue()
    assert "8b0d4c2e" in output
    assert REDACTED in output


# -- proven to fire ----------------------------------------------------------
def test_the_same_payload_without_the_filter_does_leak() -> None:
    """The control. Without ScrubbingFilter the answers land in the output verbatim,
    which is what proves the assertions above are testing the filter and not the
    absence of the data."""
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("invariant.health.control")
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    logger.info("declaration signed", extra={"declaration": DECLARATION})
    assert "ונטולין" in stream.getvalue()
    logger.handlers = []
```

- [ ] **Step 5: Write invariant 5 — the billing run is idempotent**

`tests/invariants/test_05_the_billing_run_is_idempotent.py`:

```python
"""SPEC 13 invariant 5: the billing run is idempotent across repeated executions.

Vacuous until M6 lands BillingService -- correct and intended. What is not vacuous is
the harness: `assert_idempotent` is unit-tested here against a deliberately
non-idempotent stub, so when M6 arrives the assertion is a one-line change to
something already known to work rather than something written under deadline.

Why this matters more than most: the billing run creates money rows. A run that is
not idempotent produces "we charged them twice" in a community where every parent
knows every other parent (SPEC 8.1a).
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from typing import Any

import pytest


def assert_idempotent(
    run: Callable[[], Any],
    snapshot: Callable[[], Any],
    *,
    executions: int = 3,
) -> None:
    """Run once, snapshot, run again N times, snapshot again. Equal or it is not
    idempotent. Three executions rather than two, because a bug that alternates
    between two states passes a two-run check."""
    run()
    after_first = snapshot()
    for _ in range(executions - 1):
        run()
    assert snapshot() == after_first, (
        f"the run is not idempotent: {executions} executions produced "
        f"{snapshot()!r}, one produced {after_first!r}"
    )


def _billing_service() -> Any | None:
    try:
        module = importlib.import_module("app.services.billing")
    except ModuleNotFoundError:
        return None
    return getattr(module, "BillingService", None)


def test_the_billing_run_is_idempotent() -> None:
    service = _billing_service()
    if service is None:
        pytest.skip(
            "M6 has not landed app.services.BillingService yet. This is the one "
            "invariant that cannot be written before the thing it guards exists; "
            "the harness below is tested instead."
        )
    raise AssertionError(  # pragma: no cover -- reached only once M6 lands
        "BillingService now exists. Wire assert_idempotent() to a real run over a "
        "seeded period and delete this line."
    )


# -- the harness is proven to work -------------------------------------------
def test_the_harness_accepts_an_idempotent_run() -> None:
    charges: dict[str, int] = {}

    def run() -> None:
        charges.setdefault("2026-09/student-1", 25000)

    assert_idempotent(run, lambda: dict(charges))


def test_the_harness_rejects_a_run_that_charges_twice() -> None:
    """The exact bug: keyed on nothing, so a second run bills the same month again."""
    charges: list[int] = []

    def run() -> None:
        charges.append(25000)

    with pytest.raises(AssertionError, match="not idempotent"):
        assert_idempotent(run, lambda: list(charges))


def test_the_harness_rejects_a_run_that_alternates() -> None:
    """Why three executions and not two."""
    state = {"flipped": False}

    def run() -> None:
        state["flipped"] = not state["flipped"]

    with pytest.raises(AssertionError, match="not idempotent"):
        assert_idempotent(run, lambda: dict(state))
```

> `pytest.skip` here is deliberate and is the one place in this session where a skip is right: the target genuinely does not exist, the skip message says so, and the harness beside it is fully tested. Every other skip in this repo is a smell.

- [ ] **Step 6: Run the whole invariant suite**

```bash
touch tests/invariants/__init__.py
.venv/bin/pytest tests/invariants -q -v
```

Expected: all pass, one skip (invariant 5's real assertion), and the self-tests visibly present in the `-v` output.

- [ ] **Step 7: Prove invariants 1 and 2 fail on a real violation**

Not on a probe — on the actual metadata, which is what they will guard.

```bash
# Add a deliberately wrong column to app/models/studio.py:
#     monthly_fee: Mapped[float] = mapped_column(Numeric(10, 2))
.venv/bin/pytest tests/invariants -q     # MUST be red on invariants 1 (both tests)

# Then make audit_log inherit TenantMixin without an index, or drop `studio` from
# CROSS_TENANT_TABLES:
.venv/bin/pytest tests/invariants -q     # MUST be red on invariant 2

# Revert both.
git checkout -- app/models/studio.py tests/invariants
.venv/bin/pytest tests/invariants -q     # green
```

- [ ] **Step 8: Commit**

```bash
git add tests/invariants
git commit -m "test(invariants): SPEC 13's five non-negotiables

3 and 5 assert vacuously true until M6 exists, which is intended. Each invariant
ships with a self-test running its detector against a deliberately violating fixture,
because a vacuous assertion is otherwise indistinguishable from a broken one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `lane-check.sh` and `i18n-parity.mjs` — the one command every lane runs

Every lane in every wave runs `./scripts/lane-check.sh <vertical>` as its entire check, so a defect here is a defect in eight lanes at once. Three of the milestone plan's four gates do not work as written; the departures are listed at the top of this document with the evidence for each.

**The rule that governs every design choice below: a gate with nothing to check prints `skipped` and says why; a *check* with nothing to check exits non-zero.** Silence is the failure mode this repo has already been bitten by.

The script must run under **bash 3.2** — verified as `/bin/bash` on this machine — as well as bash 5 on the CI runner. No `globstar`, no `mapfile`, no associative arrays, and empty arrays expand through the `${arr[@]+"${arr[@]}"}` idiom.

**Files:**
- Create: `scripts/lane-check.sh`
- Create: `web/scripts/i18n-parity.mjs`
- Create: `web/scripts/i18n-parity.test.ts`
- Create: `tests/config/test_lane_check.py`
- Modify: `web/vitest.config.ts`, `web/tsconfig.json`, `web/eslint.config.js`

**Interfaces:**
- Produces: `./scripts/lane-check.sh <vertical> [--dry-run]`. Exit 0 green, non-zero otherwise.
- Produces: `node web/scripts/i18n-parity.mjs [namespace]`, and the importable `checkParity({ root, namespace })` the vitest spec drives.

- [ ] **Step 1: Write the failing tests**

`web/scripts/i18n-parity.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkParity } from './i18n-parity.mjs'

let root: string

/** A miniature i18n tree, so a broken fixture proves the checker fires. */
function fixture(bundles: Record<string, Record<string, Record<string, string>>>) {
  writeFileSync(
    join(root, 'types.ts'),
    `export const LOCALES = ['he', 'en', 'ru'] as const\n` +
      `export const NAMESPACES = ['common'] as const\n` +
      `export const REFERENCE_LOCALE = 'he'\n`,
  )
  for (const [locale, namespaces] of Object.entries(bundles)) {
    mkdirSync(join(root, locale), { recursive: true })
    for (const [ns, entries] of Object.entries(namespaces)) {
      writeFileSync(
        join(root, locale, `${ns}.ts`),
        `import type { Bundle } from '../types'\n` +
          `export const ${ns}: Bundle = ${JSON.stringify(entries)}\n`,
      )
    }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'i18n-parity-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('i18n parity (seam 3, SPEC §9)', () => {
  it('passes when every locale matches the reference', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors).toEqual([])
  })

  it('errors on a key that exists in en but not in he', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello', orphan: 'nope' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/orphan/)
  })

  it('errors on a missing en translation, because en is strict', async () => {
    fixture({
      he: { common: { hello: 'שלום', bye: 'להתראות' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/en\/common\.ts: 1 untranslated/)
  })

  it('reports rather than errors on a missing ru translation', async () => {
    // SPEC §15 item 9 -- the ru translation source is still outstanding, and §9 says
    // missing keys fall back to Hebrew and are *reported* per locale.
    fixture({
      he: { common: { hello: 'שלום', bye: 'להתראות' } },
      en: { common: { hello: 'Hello', bye: 'Bye' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors, report } = await checkParity({ root })
    expect(errors).toEqual([])
    expect(report.join('\n')).toMatch(/ru\/common\.ts: 1 untranslated/)
  })

  it('errors on an empty string, which renders as a blank label', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: '' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/is empty/)
  })

  it('errors on a missing namespace file', async () => {
    fixture({ he: { common: { hello: 'שלום' } }, en: { common: { hello: 'Hello' } } })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/ru\/common\.ts is missing/)
  })

  it('checks the real tree it ships against', async () => {
    const { errors } = await checkParity({})
    expect(errors).toEqual([])
  })
})
```

`tests/config/test_lane_check.py`:

```python
"""lane-check.sh is eight lanes' entire verification command. A defect here is a
defect in all of them at once.

--dry-run resolves and prints the gate plan without running it, which is what makes
these assertions fast enough to keep.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/lane-check.sh"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(SCRIPT), *args], cwd=ROOT, capture_output=True, text=True, timeout=300
    )


def test_the_script_is_executable() -> None:
    assert SCRIPT.stat().st_mode & 0o111, "a lane cannot run a script it cannot execute"


def test_it_refuses_to_run_without_a_vertical() -> None:
    assert _run().returncode != 0


def test_the_invariants_gate_runs_for_every_vertical() -> None:
    """SPEC 13's five run in *every* lane, every time -- that is the point of them."""
    for vertical in ("core", "attendance", "billing"):
        assert "tests/invariants" in _run(vertical, "--dry-run").stdout, vertical


def test_a_vertical_with_no_files_at_all_fails_rather_than_passing() -> None:
    """The failure mode this guards: every gate skips, the script prints green, and a
    lane believes it verified something. A check that checked nothing is red."""
    result = _run("no-such-vertical", "--dry-run")
    assert result.returncode != 0
    assert "nothing was checked" in (result.stdout + result.stderr)


def test_core_resolves_the_cross_cutting_paths_m0_actually_built() -> None:
    stdout = _run("core", "--dry-run").stdout
    for expected in ("app/core", "tests/core", "i18n-parity"):
        assert expected in stdout, f"core's plan omits {expected}\n{stdout}"


def test_a_skipped_gate_says_so_out_loud() -> None:
    """`billing` has a namespace and nothing else yet. Every absent gate must name
    itself; a silent skip is indistinguishable from a passing one."""
    stdout = _run("billing", "--dry-run").stdout
    assert "skipped" in stdout


def test_it_runs_eslint_through_the_web_workspace() -> None:
    """Source assertion by necessity: `npx eslint` from the repo root installs a
    fresh eslint and ignores web/eslint.config.js -- verified, it exits 0 having
    checked nothing. The workspace copy is the only one with the D10 rules."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "cd web" in text
    assert "\nnpx eslint" not in text


@pytest.mark.slow
def test_core_is_actually_green() -> None:
    """The session's exit gate, asserted rather than remembered."""
    result = _run("core")
    assert result.returncode == 0, result.stdout + result.stderr
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
.venv/bin/pytest tests/config/test_lane_check.py -q
cd web && npx vitest run scripts/i18n-parity.test.ts --reporter=dot
```

Expected: FAIL — neither file exists. The vitest run additionally reports **no test files found**, because `web/vitest.config.ts`'s `tools` project globs `tools/**/*.test.ts` and that directory does not exist. Fix that in Step 5.

- [ ] **Step 3: Write `web/scripts/i18n-parity.mjs`**

```js
#!/usr/bin/env node
/**
 * Seam 3's parity check.  `node web/scripts/i18n-parity.mjs [namespace]`
 *
 * Scoped to one namespace so it is part of a lane's own check rather than only CI's
 * — a lane that adds Hebrew keys learns about the gap before it merges, not after.
 * With no argument it checks all nine.
 *
 * Lives in web/scripts/ rather than the milestone plan's scripts/ because that is
 * where node dependencies resolve; `typescript` is a web devDependency.
 *
 * The namespace files are TypeScript with a single `import type`, so transpiling and
 * importing them is exact where a regex would be a guess.
 *
 * ── What is an error, and what is only reported ──────────────────────────────
 * SPEC §9: "Hebrew is the reference locale. Missing keys in other locales fall back
 * to Hebrew and are reported by a CI check that lists untranslated keys per locale."
 * So a missing translation is a report, not automatically a failure — but a report
 * nobody fails on is a report nobody reads. The policy below splits it per locale:
 *
 *   en   strict   complete today, so the gate genuinely bites
 *   ru   report   SPEC §15 item 9 (the ru translation source) is still outstanding.
 *                 Change this one word to 'strict' when it lands.
 *
 * Orphan keys, missing namespace files, non-string values and empty strings are hard
 * errors in every locale: none of them is a translation gap, they are all bugs.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(HERE, '../packages/i18n')

export const POLICY = { en: 'strict', ru: 'report' }

async function loadModule(path) {
  const source = await readFile(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  })
  const encoded = Buffer.from(outputText, 'utf8').toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

export async function checkParity({ root = DEFAULT_ROOT, namespace } = {}) {
  const errors = []
  const report = []

  const types = await loadModule(join(root, 'types.ts'))
  const { LOCALES, NAMESPACES, REFERENCE_LOCALE } = types

  if (namespace && !NAMESPACES.includes(namespace)) {
    return { errors: [`unknown namespace \`${namespace}\` — expected one of ${NAMESPACES.join(', ')}`], report }
  }

  for (const ns of namespace ? [namespace] : NAMESPACES) {
    const bundles = {}
    for (const locale of LOCALES) {
      const file = join(root, locale, `${ns}.ts`)
      if (!existsSync(file)) {
        errors.push(`${locale}/${ns}.ts is missing — index.ts lists every namespace in every locale`)
        continue
      }
      const bundle = (await loadModule(file))[ns]
      if (!bundle || typeof bundle !== 'object') {
        errors.push(`${locale}/${ns}.ts does not export \`${ns}\``)
        continue
      }
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') errors.push(`${locale}/${ns}.ts: \`${key}\` is not a string`)
        else if (value.trim() === '') errors.push(`${locale}/${ns}.ts: \`${key}\` is empty — a blank label reads as a broken screen`)
      }
      bundles[locale] = bundle
    }

    const reference = bundles[REFERENCE_LOCALE]
    if (!reference) continue

    for (const locale of LOCALES) {
      if (locale === REFERENCE_LOCALE || !bundles[locale]) continue
      for (const key of Object.keys(bundles[locale])) {
        if (!(key in reference)) {
          errors.push(`${locale}/${ns}.ts: \`${key}\` has no ${REFERENCE_LOCALE} source — Hebrew is the reference locale (SPEC §9)`)
        }
      }
      const missing = Object.keys(reference).filter((key) => !(key in bundles[locale]))
      if (missing.length === 0) continue
      const shown = missing.slice(0, 5).join(', ') + (missing.length > 5 ? ', …' : '')
      const line = `${locale}/${ns}.ts: ${missing.length} untranslated (${shown})`
      if (POLICY[locale] === 'strict') errors.push(line)
      else report.push(line)
    }
  }

  return { errors, report }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const namespace = process.argv[2]
  const { errors, report } = await checkParity({ namespace })
  for (const line of report) console.log(`   · ${line}`)
  for (const line of errors) console.error(`   ✗ ${line}`)
  if (errors.length) {
    console.error(`\n${errors.length} i18n parity error(s)`)
    process.exit(1)
  }
  console.log(`✅ i18n parity${namespace ? ` · ${namespace}` : ' · all namespaces'}`)
}
```

- [ ] **Step 4: Write `scripts/lane-check.sh`**

```bash
#!/usr/bin/env bash
# scripts/lane-check.sh <vertical> [--dry-run]   —   the one command every lane runs.
#
# Departures from the milestone plan's snippet, each measured rather than assumed:
#
#   * vitest positional arguments are FILTERS, not globs. A glob that matches nothing
#     exits 1, so the plan's frontend gate fails for every vertical with no frontend
#     tests yet -- including `core`. File lists are resolved here and passed as
#     concrete paths.
#   * `npx eslint` from the repo root downloads a fresh eslint and never reads
#     web/eslint.config.js, so it exits 0 having applied none of the D10 rules.
#     Everything frontend runs from inside web/.
#   * `belts`, `privacy` and `core` are verticals with no i18n namespace, so `$V` is
#     passed to the parity script only when a namespace file for it exists.
#   * A gate with no targets prints `skipped` and names itself. If NO vertical-scoped
#     gate ran, the check FAILS -- a green that verified nothing is the worst outcome
#     available here.
#
# bash 3.2 compatible (that is /bin/bash on macOS): no globstar, no mapfile, and
# empty arrays expand through ${arr[@]+"${arr[@]}"}.
set -euo pipefail

V="${1:?usage: lane-check.sh <vertical> [--dry-run]}"
DRY_RUN=0
if [ "${2:-}" = "--dry-run" ]; then DRY_RUN=1; fi
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SCOPED_GATES=0

say()  { printf '\n── %s ──\n' "$*"; }
skip() { printf '   · skipped — %s\n' "$*"; }
run()  {
  if [ "$DRY_RUN" = 1 ]; then printf '   would run: %s\n' "$*"; return 0; fi
  "$@"
}

# ── which paths belong to this vertical ─────────────────────────────────────
# `core` is M0's cross-cutting layer, not a feature vertical: it lives in app/core and
# web/packages, so its paths differ from the convention every other vertical follows
# (app/services/<v>/, app/routers/<v>.py, app/models/<v>.py, tests/<v>/,
# web/apps/*/src/features/<v>/, web/packages/i18n/<locale>/<v>.ts).
py_candidates=()
test_candidates=()
case "$V" in
  core)
    py_candidates=(app/core app/models app/services)
    test_candidates=(tests/core tests/config)
    ;;
  *)
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    ;;
esac

existing=()
for candidate in ${py_candidates[@]+"${py_candidates[@]}"}; do
  if [ -e "$candidate" ]; then existing+=("$candidate"); fi
done
py_paths=(${existing[@]+"${existing[@]}"})

existing=()
for candidate in ${test_candidates[@]+"${test_candidates[@]}"}; do
  if [ -d "$candidate" ]; then existing+=("$candidate"); fi
done
test_paths=(${existing[@]+"${existing[@]}"})

# Frontend test files, resolved with find because bash 3.2 has no globstar. Paths are
# printed relative to web/, which is where vitest runs.
web_tests=$(
  if [ "$V" = "core" ]; then
    find web/packages -path '*/src/*' \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
  else
    find web/apps -path "*/src/features/$V/*" \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
    find "web/packages/core/src/$V" \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
  fi | sed 's|^web/||' | sort
)

# ── the gates ───────────────────────────────────────────────────────────────
say "invariants (SPEC §13)"
# Not scoped: these run in every lane, every time, which is the whole point of them.
run .venv/bin/pytest tests/invariants -q

say "backend · $V"
if [ ${#test_paths[@]} -eq 0 ]; then
  skip "no test directory for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/pytest ${test_paths[@]+"${test_paths[@]}"} -q
fi

say "types · $V"
if [ ${#py_paths[@]} -eq 0 ]; then
  skip "no backend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/mypy ${py_paths[@]+"${py_paths[@]}"}
fi

say "frontend · $V"
if [ -z "$web_tests" ]; then
  skip "no frontend tests for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: vitest run %s\n' "$(echo "$web_tests" | tr '\n' ' ')"
  else
    # shellcheck disable=SC2086 -- deliberate word splitting; no repo path has a space
    ( cd web && npx vitest run --reporter=dot $web_tests )
  fi
fi

say "lint · $V"
if [ ${#py_paths[@]} -eq 0 ]; then
  skip "no backend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/ruff check ${py_paths[@]+"${py_paths[@]}"}
  run .venv/bin/ruff format --check ${py_paths[@]+"${py_paths[@]}"}
fi

eslint_targets=$(
  if [ "$V" = "core" ]; then
    echo "packages/*/src"
  else
    for path in web/apps/*/src/features/"$V" "web/packages/i18n/he/$V.ts"; do
      if [ -e "$path" ]; then echo "${path#web/}"; fi
    done
    for locale in en ru; do
      if [ -e "web/packages/i18n/$locale/$V.ts" ]; then echo "packages/i18n/$locale/$V.ts"; fi
    done
  fi
)
if [ -z "$eslint_targets" ]; then
  skip "no frontend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && npx eslint %s)\n' "$(echo "$eslint_targets" | tr '\n' ' ')"
  else
    # shellcheck disable=SC2086
    ( cd web && npx eslint $eslint_targets )
  fi
fi

say "i18n parity · $V"
# `belts`, `privacy` and `core` have no namespace of their own. Checking all nine is
# strictly stronger than checking one, and never silently weaker than checking none.
if [ -f "web/packages/i18n/he/$V.ts" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run node web/scripts/i18n-parity.mjs "$V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  printf '   · %s has no namespace of its own — checking all nine\n' "$V"
  run node web/scripts/i18n-parity.mjs
fi

if [ "$SCOPED_GATES" -eq 0 ]; then
  printf '\n❌ lane %s: every vertical-scoped gate was skipped — nothing was checked.\n' "$V" >&2
  printf '   A green check that verified nothing is worse than a red one.\n' >&2
  exit 1
fi

printf '\n✅ lane %s green (%s scoped gates)\n' "$V" "$SCOPED_GATES"
```

Then `chmod +x scripts/lane-check.sh`.

> The i18n gate increments `SCOPED_GATES` on both branches, so a nonsense vertical such as `no-such-vertical` would still count one. That is why the guard is written against *scoped* gates and the i18n branch for an unknown vertical must not count: change the `else` branch to **not** increment, and let `checkParity` reject an unknown namespace. Verify `test_a_vertical_with_no_files_at_all_fails_rather_than_passing` is red before you make it green — if it passes on the first run, the guard is not doing anything.

- [ ] **Step 5: Make the new specs discoverable**

`web/vitest.config.ts` — extend the `tools` project, which currently globs a directory that does not exist:

```ts
        test: {
          name: 'tools',
          include: ['tools/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
```

`web/tsconfig.json` — add `"scripts/**/*"` to `include`.

`web/eslint.config.js` — widen the build-script block from `['scripts/**/*.mjs']` to `['scripts/**/*.{mjs,ts}']`.

- [ ] **Step 6: Run everything and confirm it passes**

```bash
cd web && npx vitest run scripts/i18n-parity.test.ts --reporter=dot
node web/scripts/i18n-parity.mjs
node web/scripts/i18n-parity.mjs health
.venv/bin/pytest tests/config/test_lane_check.py -q
./scripts/lane-check.sh core --dry-run
./scripts/lane-check.sh core
```

Expected: 7 vitest specs pass · the bare parity run reports `ru` gaps and exits 0 · `lane-check.sh core` is green.

- [ ] **Step 7: Prove lane-check actually goes red**

Three separate proofs, because the script has three ways to be wrong.

```bash
# a) a failing backend test must fail the check
printf '\ndef test_deliberate_failure():\n    assert False\n' >> tests/core/test_log_scrubber.py
./scripts/lane-check.sh core; echo "exit=$?"      # MUST be non-zero
git checkout -- tests/core/test_log_scrubber.py

# b) a D10 violation must fail the lint gate — this is the one that was silently
#    passing before, because the root npx eslint ignored the workspace config
printf '\nexport const bad = { marginLeft: 4 }\n' >> web/packages/ui/src/slots.ts
./scripts/lane-check.sh core; echo "exit=$?"      # MUST be non-zero, naming D10
git checkout -- web/packages/ui/src/slots.ts

# c) an i18n orphan must fail the parity gate
printf "\nexport const orphan = 1\n" >> web/packages/i18n/en/common.ts   # then add a real orphan key
./scripts/lane-check.sh core; echo "exit=$?"      # MUST be non-zero
git checkout -- web/packages/i18n/en/common.ts

./scripts/lane-check.sh core                       # green again
```

For (c), the meaningful edit is adding a key to `en/common.ts` that does not exist in `he/common.ts` — that is the orphan the checker looks for.

- [ ] **Step 8: Commit**

```bash
chmod +x scripts/lane-check.sh
git add scripts/lane-check.sh web/scripts/i18n-parity.mjs web/scripts/i18n-parity.test.ts \
        web/vitest.config.ts web/tsconfig.json web/eslint.config.js tests/config/test_lane_check.py
git commit -m "feat(scripts): lane-check.sh and i18n-parity.mjs

Three of the milestone plan's four gates do not work as written: vitest args are
filters and not globs, root npx eslint downloads a fresh eslint and ignores the
workspace config, and belts/privacy/core have no i18n namespace. Each departure is
documented at the top of the script with what was measured. Verified red on a failing
test, on a D10 violation and on an i18n orphan before being trusted.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire the new gates into CI, run the exit gate, close the session

Nothing is finished until `scripts/ci-local.sh` and `.github/workflows/ci.yml` agree, because the local script is the only thing standing between a push and a red build.

**Files:**
- Modify: `scripts/ci-local.sh`, `.github/workflows/ci.yml`
- Modify: `.claude/settings.json`, `tests/config/test_repo_config.py`
- Modify: `docs/plan/next-session.md`, `CLAUDE.md`

- [ ] **Step 1: Bring the database up in `scripts/ci-local.sh`**

Insert before the backend block:

```bash
echo "── database ──"
# The DB tests fail rather than skip when no database is reachable, so this is not
# optional setup — it is part of the gate.
./scripts/dev-db.sh up
.venv/bin/alembic upgrade head
```

And after the frontend block:

```bash
echo "── i18n parity (SPEC §9) ──"
node web/scripts/i18n-parity.mjs
```

- [ ] **Step 2: Add the same parity step to the CI frontend job**

In `.github/workflows/ci.yml`, in `jobs.frontend.steps`, after `Tests`:

```yaml
      - name: i18n parity
        # SPEC §9 — Hebrew is the reference locale; en is strict, ru reports until
        # §15 item 9 lands. See web/scripts/i18n-parity.mjs for the policy.
        run: node scripts/i18n-parity.mjs
```

- [ ] **Step 3: Widen the permission allowlist**

`.claude/settings.json`, in `permissions.allow`:

```json
      "Bash(docker compose:*)",
      "Bash(./scripts/dev-db.sh:*)",
      "Bash(./scripts/ci-local.sh)",
      "Bash(.venv/bin/alembic current)",
      "Bash(.venv/bin/alembic heads)",
      "Bash(.venv/bin/alembic revision:*)",
      "Bash(railway status)",
      "Bash(railway variables:*)",
      "Bash(node web/scripts/i18n-parity.mjs:*)"
```

`Bash(.venv/bin/alembic downgrade:*)` stays in `deny`, and deny wins — do not replace these with a blanket `Bash(.venv/bin/alembic:*)`, which would defeat it.

Extend the C8 parametrize list in `tests/config/test_repo_config.py` with the new patterns so the allowlist stays asserted rather than drifting.

- [ ] **Step 4: Run the whole local gate**

```bash
./scripts/ci-local.sh
```

Expected: green. Fix anything that is not before continuing — in particular, `npm run typecheck` now sees `web/scripts/*.ts`, and `ruff format --check` covers the new modules.

- [ ] **Step 5: Run the exit gate, on a genuinely fresh database**

Both halves, in this order, because the second is only meaningful against a database that has never seen a migration.

```bash
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade head
./scripts/lane-check.sh core
```

Expected: `Running upgrade  -> 0001, baseline` then `0001 -> 0002, audit_log`, no errors, and `✅ lane core green`.

- [ ] **Step 6: Update the plan documents**

In `docs/plan/next-session.md`, mark M0.2's seams and items 1–7 done in the Session 2 block the way seams 2 and 3 are already marked, so Session 3 opens against the truth. Add the same "already landed" note the M0.1 block carries, naming: the two DB roles, the two DSNs, `TenantSession`/`TenantMixin`/`with_all_tenants`, the envelope's `rewrap`, `tests/invariants/`, and `lane-check.sh`'s three departures.

In `CLAUDE.md` §Commands, add the two commands every later session needs:

```markdown
- Local database: `./scripts/dev-db.sh up` (reset with `reset`). DB tests fail, not skip, without it.
- Lane check: `./scripts/lane-check.sh <vertical>` — the one command every lane runs.
```

- [ ] **Step 7: Answer C9 before the session closes**

Part 5 §C9 is a decision, not a build item: the D9 canvas edits are recorded but not applied, so artboard `2b` still shows in-app chat, `7c` still shows the weight column and `12f` is still titled `קבלות ותשלומים`. The port happens in M3/M6/M7/M8, and a lane reading `2b` in a browser will build the chat.

Nothing in M0.2 depends on it and it is not this session's to decide unilaterally. **Surface it in the hand-off** with the plan's own recommendation — run the Claude Design edit pass before W2 opens, because the mockup is what a human opens at 2am — and note that the fallback (the ▲ markers plus each lane's opening prompt) is already in place if the answer is no.

- [ ] **Step 8: Final commit and push**

```bash
./scripts/ci-local.sh
git add scripts/ci-local.sh .github/workflows/ci.yml .claude/settings.json \
        tests/config/test_repo_config.py docs/plan/next-session.md CLAUDE.md \
        docs/superpowers/plans/2026-08-24-m0-2-seams-and-core.md
git commit -m "chore(ci): wire the M0.2 gates into ci-local and the workflow

Exit gate met: ./scripts/lane-check.sh core is green and alembic upgrade head runs
clean on a fresh database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Self-review

**Spec coverage.** §4.2 → Task 3 (all three layers; layer 3 is invariant 2 in Task 7). §4.3 → Tasks 1 and 5 land `studio` and `audit_log`; the rest belongs to M1+ and is deliberately absent. §8.1a → Task 0 (PostgreSQL 16, Railway secrets for keys, forward-only Alembic). §8.3 → G2/G3 asserted in Task 1's column types and invariant 1. §11.1 → Task 4. §11.2 → Task 5. §11.7 → Task 6, plus tenancy (Task 3) and the dependency/secret scanning M0.1 already ships. §13 → Task 7, all five, plus `lane-check.sh` running them in every lane. §19.6 → the `dev` router exclusion already landed in M0.1 and is asserted by `tests/test_router_discovery.py`; M0.4 asserts the remaining four restrictions. §1.3 seam 1 → Task 1, seam 4 → Task 2; seams 2 and 3 landed in M0.1 and are untouched. Part 5 §C9 → Task 9 Step 7, surfaced as a decision rather than silently taken.

**Not covered, deliberately.** The demo studio, the developer account and the dev bar (§19) are M0.4. The component library port from artboard `4h` and the D10 ESLint rule's remaining scope are M0.3 — though D10 itself already exists in `web/eslint.config.js` and Task 8 proves it fires. `app/workers/` and `app/integrations/upay/` are empty until M6.

**Placeholder scan.** No TBDs. Every code step carries the actual content. The three "prove it fails" steps (Task 5 Step 7, Task 7 Step 7, Task 8 Step 7) name the exact commands and the exact expected colour.

**Type consistency.** `TenantSession`, `TenantMixin`, `with_all_tenants(reason=)`, `use_studio`, `require_current_studio_id`, `NoActiveStudioError`, `CrossTenantWriteError` are spelled identically in Task 3's module, Task 3's tests and invariant 2. `Keyring`, `encrypt`, `decrypt`, `rewrap`, `key_version_of`, `payload_section`, `EncryptedBytes`, `EncryptedJSON` match between Task 4's module and its tests. `AuditService.record`, `AuditLog`, `AuditLogImmutableError` match between Task 5's model, service and tests. `REDACTED`, `scrub`, `is_sensitive_key`, `ScrubbingFilter`, `JsonFormatter`, `configure_logging` match between Task 6 and invariant 4. `checkParity({ root, namespace })` and `POLICY` match between `i18n-parity.mjs`, its spec and `lane-check.sh`. `registerSlot` / `useSlot` / `clearSlot` match the milestone plan's seam-4 signature.

**One risk worth stating.** Task 3's `with_loader_criteria` lambda is the only place where SQLAlchemy's behaviour is being relied on rather than asserted from first principles — its statement caching could, in principle, bake the first studio's id into the cached criteria. `test_two_studios_in_one_process_do_not_share_a_cached_filter` exists precisely to catch that, and Task 3 Step 4 says what to do if it fires. Do not skip that test.
