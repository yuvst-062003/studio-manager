---
name: ship-check
description: Pre-merge checklist — tests, types, lint, migrations, security, a11y
disable-model-invocation: true
---
Run every step and report PASS/FAIL per line with the actual output. Stop at the first FAIL.

1. `pytest -q`
2. `npm run test -- --reporter=dot`
3. `npm run typecheck && mypy app`
4. `ruff check app && npm run lint`
5. Migrations: if models changed, confirm a migration exists and `alembic upgrade head` runs clean
6. `/security-review` on the pending diff
7. Confirm no new hardcoded strings in `web/src/**` outside the i18n module
8. Confirm no secrets, keys, or student data in the diff or in any added log statement

Then produce a PR description: what changed, why, how it was verified, what was not covered.
