#!/usr/bin/env bash
# Every gate CI runs, runnable locally. Keep in lockstep with .github/workflows/ci.yml.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "── database ──"
# The DB tests fail rather than skip when no database is reachable, so this is part
# of the gate and not setup around it.
./scripts/dev-db.sh up
.venv/bin/alembic upgrade head

echo "── backend: lint, format, types, tests ──"
.venv/bin/ruff check app scripts tests
.venv/bin/ruff format --check app scripts tests
.venv/bin/mypy app scripts
.venv/bin/pytest

echo "── frontend: types, lint, build, tests ──"
npm --prefix web run typecheck
npm --prefix web run lint
# Build precedes tests: the sw-precache specs assert built output, so running
# them first passes on a stale dist/ and hides a real regression.
npm --prefix web run build
npm --prefix web test

echo "── generated api-client is committed (SPEC §8.2) ──"
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts

echo "── i18n parity (SPEC §9) ──"
node web/scripts/i18n-parity.mjs

echo "── installability ──"
node web/scripts/check-installability.mjs

echo "── the one command every lane runs ──"
# Asserted here rather than in a test: lane-check runs pytest tests/config, so a
# test that shelled out to it would recurse.
./scripts/lane-check.sh core

echo "✅ all gates green"
