# Continue: W0–W6 Full Stack Audit (session 2)

You are continuing the audit defined in `docs/plan/prompts/w0-w6-fable5-evaluation.md`.
Session 1 completed most of it. Do NOT redo finished work — pick up the remaining tasks,
then write the final Blocked/Degraded/Verified report.

## Findings so far (carry these into the final report)

### Blocked
1. **Fresh-database bootstrap is broken.** `docker-compose.yml` removed the initdb hook
   ("the runtime role comes from revision 0001 in every environment"), but
   `alembic/versions/0001_baseline.py` creates `studio_app` **NOLOGIN**, and its comment
   assumes a local init script (which no longer exists) grants LOGIN. After
   `./scripts/dev-db.sh reset` + `alembic upgrade head`, every API request 500s with
   `role "studio_app" is not permitted to log in`. `scripts/verify-db-roles.py` never
   checks `rolcanlogin`. Session 1 worked around it with
   `./scripts/dev-db.sh psql -c "ALTER ROLE studio_app LOGIN"` (already applied to the
   current DB — do not reset the DB without re-applying it).
2. **`JWT_SIGNING_KEY` is absent from the main checkout's `.env`** — the backend 503s on
   every `auth/refresh` (`identity.py:_signing_key`), so the whole E2E suite dies at
   fixture sign-in. Workaround: export a generated key when starting the backend/suite.
3. **HealthGate is unmounted (HB-w6-health-gate-unmounted confirmed).** Zero references
   to health in `web/apps/parent/src/App.tsx` (271 lines); the components exist only in
   `features/health/` + their tests. Persona `parent1` has a child with
   `health_status = "missing"` and reaches the app normally. §6.1's hard gate does not
   exist at runtime. (Browser screenshot proof still pending — remaining task 2.)
4. **E2E-3 test 2 is red on a fresh full run** ("a charge already covered by an open
   order cannot be paid for twice" — expected 409, got 201). Root cause chain, verified
   in the DB: (a) `GET /me/charges` orders by `Charge.id` (random UUID4) via
   `BillingService.list_charges`, though the route docstring and the client comment both
   promise oldest-first; (b) `oldestMonths` in
   `web/apps/parent/src/features/billing/billingClient.ts` is `slice(0, months)` with no
   sort; (c) E2E scenarios accumulate open charges on shared personas, so the payer had
   4 open charges across 2 students and the two clicks selected different charge sets —
   the second order was legitimately allowed. The server-side double-claim guard itself
   is CORRECT (verified: no charge appears in two holding orders;
   `orders.py create()` raises ConflictError on claimed charges). The product bug is the
   §5.10 "N oldest months" selection being effectively random; the suite bug is
   cross-test state leakage. Exit gate "all five flows green" is currently false.
5. **`POST /dev/demo/reset` 500s on every call after the first-ever reset**
   (HB-e2e-demo-reset confirmed live — `audit_log` actor FK RESTRICT vs wiped `person`).
6. **No platform_admin exists in dev tooling.** `/dev/personas` has 9 personas, all in
   the demo studio; `app/routers/dev.py:294` hardcodes `is_platform_admin=False`. The
   eval's step "sign in as platform_admin via /dev/" is impossible; the platform console
   is unreachable locally.

### Degraded
- `/dev/personas` shows persona `lead` with **19 duplicated `lead_coach` roles** (one
  per E2E-created group; the projection should dedupe).
- `makeBillingClient` in the parent app (`billingClient.ts`) calls manager-only routes
  (`/charges?payer_person_id=`, `/payers/{id}/balance`) — dead code; the mounted screen
  uses `makeParentBillingClient` (`/me/*`). Confusing, not broken.
- The eval prompt's "§5.5: health declarations mandatory before attendance" is **wrong
  per SPEC**: SPEC §5.5 says "a missing declaration never blocks anything in the app"
  (⚠ badge, deliberate). The app conforms. Report as not-a-defect.

### Verified
- **E2E 18/19 green** on a fresh DB once the two bootstrap blockers are worked around:
  E2E-1 (both tests), E2E-2 offline attendance (both), E2E-3 happy path + standing-order
  warning, E2E-4 all four forged/tampered IPN tests, E2E-5 (all three), fixture specs.
- **Ledger invariants by direct SQL**: every settled charge exactly fully allocated; no
  open charge carries allocations; no over-allocation; no charge claimed by two holding
  orders.
- `allocate_oldest_first` orders by `due_date, id`, positive charges only (credits
  excluded) — §5.10 conform.
- **Billing run**: only active student + active enrollment billed (DISTINCT); freeze
  overlapping the period excludes; proration first-tuition-only with zero-denominator
  guard; registration fee once per student, never prorated, no double-charge with
  proration.
- **Tenancy**: 151 tests green (`tests/core/test_tenancy.py`, `tests/invariants/`,
  `tests/restrictions/`). Live checks: demo manager GET on a studio-B student by ID →
  404; name search → 0 items; parent token on staff route → 401.
- `has_active_subscription` is a warning-not-block, matching SPEC; its E2E test passed.

## Current environment state
- DB container `studio-manager-db` (port 55433) is up; DB migrated to head; demo studio
  reset once; E2E residue present; `ALTER ROLE studio_app LOGIN` applied. A second
  studio is seeded for isolation tests: studio `bbbbbbbb-0000-0000-0000-000000000001`,
  person `...0002`, student `...0003`.
- All dev servers from session 1 are DEAD (they were background tasks). Restart:
  - backend: `JWT_SIGNING_KEY="$(openssl rand -base64 48)" .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`
  - apps: `npm --prefix web run dev --workspace @studio/parent -- --strictPort` (5174),
    same for `@studio/staff` (5173) and `@studio/dashboard` (5175).
  - Apps answer on `localhost`, the API on `127.0.0.1` (IPv6/IPv4 split — deliberate).
- Sign-in: `GET http://127.0.0.1:8000/api/v1/dev/sign-in-as/{persona}?app=parent` with a
  cookie jar, then `POST /api/v1/auth/refresh` with the jar → `access_token`. Refresh
  tokens ROTATE — after one refresh the jar is stale; sign in again rather than reuse.
  (Session 1's last failed call was exactly this: a reused jar. Re-verify
  `/me/students` for parent1 shows only demo-studio children, no studio-B leak.)
- E2E: `JWT_SIGNING_KEY=... npm --prefix web run test:e2e` from the repo root. Note
  `... | tail` masks the exit code — use `set -o pipefail`.
- The hook `.claude/hooks/block-protected.sh` blocks Bash commands that mention
  `alembic/versions/` or `node_modules` paths — use the Read tool for those files and
  `node -e "require.resolve(...)"` for module checks.

## Remaining tasks
1. Re-verify parent1 `/me/students` (fresh sign-in) — only demo children, no studio-B row.
2. Browser proof of the health gate failure: Playwright (in `web/node_modules`,
   `NODE_PATH=web/node_modules`), sign in as `parent1` on the parent app, land on `/`,
   observe home renders despite `health_status=missing`; screenshot.
3. A11y/RTL/theme spot-check with axe-core (download `axe.min.js` to the scratchpad —
   do NOT npm-install into the repo; inject with `page.addScriptTag`):
   parent home + payments (persona `parent1`), staff today/roster (persona `lead`),
   dashboard home + billing (persona `manager`). For each: Hebrew default — assert
   `document.documentElement.dir === 'rtl'`; switch to English if a switcher exists and
   assert `ltr`; run axe (wcag2a/wcag2aa) in light and dark (`page.emulateMedia`).
   Record violations per page/theme.
4. Optional if time allows: rollover wizard smoke test (w6), and a quick look at the
   comms/offline-queue interaction (eval §1).
5. Produce the final report in the eval's three sections (Blocked / Degraded /
   Verified), folding in everything above with reproduction steps.
