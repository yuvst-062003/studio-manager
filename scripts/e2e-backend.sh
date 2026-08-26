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
     pg_isready -U studio_migrator -d studio_manager >/dev/null 2>&1; then
  cat >&2 <<'MSG'
✋ No database. The E2E suite needs one — GET /api/v1/health reads alembic_version.

    ./scripts/dev-db.sh up && .venv/bin/alembic upgrade head

Then re-run `npm --prefix web run test:e2e`.
MSG
  exit 1
fi

# 127.0.0.1, matching every app's vite.config.ts proxy target. uvicorn binds IPv4 only and
# Node resolves `localhost` to ::1 first, so a proxy — or a readiness probe — aimed at
# `localhost` would ECONNREFUSED against a running API. The apps' configs carry the same
# note; this is the same trap on the other side of the connection.
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
