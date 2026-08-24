#!/usr/bin/env bash
# Every gate CI runs, runnable locally. Keep in lockstep with .github/workflows/ci.yml.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

echo "── installability ──"
node web/scripts/check-installability.mjs

echo "✅ all gates green"
