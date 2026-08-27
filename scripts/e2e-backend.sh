#!/usr/bin/env bash
# scripts/e2e-backend.sh — the API process Playwright's `webServer` block starts.
#
# This exists for one reason: `webServer` cannot start PostgreSQL, and the E2E suite is
# useless without it. `GET /api/v1/health` reads `alembic_version` out of the database, so
# a missing database does not fail fast — uvicorn boots fine, the readiness probe returns
# 500 for two minutes, and Playwright reports `Timed out waiting 120000ms from
# config.webServer`, which names neither the cause nor the fix.
#
# So the check is here instead, ahead of uvicorn. A developer who has not started the
# database gets one line naming the command, in about two seconds.
#
# Deliberately NOT `dev-db.sh wait`: that loops for 60s before giving up, which is correct
# when a container is starting and wrong when there is no container at all. This is a
# single probe — the "is it starting" case is `dev-db.sh up`'s job, and it is idempotent.
#
# This script does not run migrations. An E2E harness that silently migrates is an E2E
# harness that can hide a broken migration, and `alembic upgrade head` is a gate this wave
# runs explicitly.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker compose -f docker-compose.yml exec -T db \
     pg_isready -U studio_migrator -d postgres >/dev/null 2>&1; then
  cat >&2 <<'MSG'
✋ No database server. The E2E suite needs one — GET /api/v1/health reads alembic_version.

    ./scripts/dev-db.sh up && .venv/bin/alembic upgrade head

Then re-run `npm --prefix web run test:e2e`.
MSG
  exit 1
fi

# The database this deployment is configured for, asked of the settings object rather
# than parsed out of .env by hand — one reader, so the script and the app can never
# disagree — and then suffixed `_e2e` (HB-e2e-shared-database): pytest reads
# settings.DATABASE_URL directly, so without the suffix a backend test run truncates
# tables underneath a live E2E run in the MAIN checkout, not only across worktrees. The
# suffix is skipped when the settings already name an _e2e database (a worktree that
# configured its own). One honest caveat, stated where it bites: Playwright reuses an
# ALREADY-RUNNING backend on :8000 (`reuseExistingServer`), and a reused dev server
# keeps whatever database it was started with — kill it first when isolation matters.
BASE_DB="$(.venv/bin/python -c '
from urllib.parse import urlparse
from app.core.config import settings
print(urlparse(settings.MIGRATION_DATABASE_URL.replace("+psycopg", "")).path.lstrip("/"))
')"
case "$BASE_DB" in
  *_e2e) DB_NAME="$BASE_DB" ;;
  *)     DB_NAME="${BASE_DB}_e2e" ;;
esac

# The two URLs the app and alembic will actually use, rewritten to the suite database.
E2E_DATABASE_URL="$(.venv/bin/python -c "
from app.core.config import settings
print(settings.DATABASE_URL.rsplit('/', 1)[0] + '/${DB_NAME}')
")"
E2E_MIGRATION_DATABASE_URL="$(.venv/bin/python -c "
from app.core.config import settings
print(settings.MIGRATION_DATABASE_URL.rsplit('/', 1)[0] + '/${DB_NAME}')
")"

# Created if absent, and this is what makes a per-worktree database practical.
#
# `tests/conftest.py` reads DATABASE_URL, so pytest runs against whatever the E2E stack
# runs against. Sharing one database between the two means a backend test run truncating
# tables underneath a live E2E run; sharing it between two lane worktrees means one lane's
# migration deciding the other lane's schema, which is how `alembic upgrade head` on this
# branch started failing on a revision it has never seen. A database per worktree fixes
# both, but only if it survives `dev-db.sh reset`, which drops the volume.
if ! docker compose -f docker-compose.yml exec -T db \
     psql -U studio_migrator -d postgres -tAc \
     "select 1 from pg_database where datname = '${DB_NAME}'" | grep -q 1; then
  echo "▸ creating database ${DB_NAME}" >&2
  docker compose -f docker-compose.yml exec -T db \
    createdb -U studio_migrator -O studio_migrator "${DB_NAME}"
  echo "▸ migrating ${DB_NAME} to head" >&2
  MIGRATION_DATABASE_URL="${E2E_MIGRATION_DATABASE_URL}" .venv/bin/alembic upgrade head >&2
elif ! MIGRATION_DATABASE_URL="${E2E_MIGRATION_DATABASE_URL}" .venv/bin/alembic current 2>/dev/null | grep -q "(head)"; then
  # The suite database exists but trails main's chain — a fresh revision landed since the
  # last run. Migrating here is safe for exactly this database: nothing but the E2E stack
  # writes it, so the "silently migrating harness" concern belongs to the shared database
  # this script no longer serves.
  echo "▸ migrating ${DB_NAME} to head" >&2
  MIGRATION_DATABASE_URL="${E2E_MIGRATION_DATABASE_URL}" .venv/bin/alembic upgrade head >&2
fi

# 127.0.0.1, matching every app's vite.config.ts proxy target. uvicorn binds IPv4 only and
# Node resolves `localhost` to ::1 first, so a proxy — or a readiness probe — aimed at
# `localhost` would ECONNREFUSED against a running API. The apps' configs carry the same
# note; this is the same trap on the other side of the connection.
exec env \
  DATABASE_URL="${E2E_DATABASE_URL}" \
  MIGRATION_DATABASE_URL="${E2E_MIGRATION_DATABASE_URL}" \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
