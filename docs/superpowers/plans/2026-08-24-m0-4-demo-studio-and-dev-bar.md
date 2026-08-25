# M0.4 — The Demo Studio, the Developer Account and the Dev Bar: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every part of SPEC §19 that is not bound to an identity — the `/dev` router and its non-existence in production, `X-Dev-Now` time travel, the demo studio and its versioned fixture set, `POST /dev/demo/reset` and the nightly staging reset, the uPay IPN simulator in §19.5's four shapes, the dev bar container and its slot registry, the cross-studio exclusion, and all five §19.6 restrictions as passing tests — so that from M1 on every milestone is testable end to end on the day it lands.

**Architecture:** The load-bearing idea is that **each guardrail is a mechanism that cannot be inverted, and each mechanism is proven by a test that watches it fire.** The `/dev` router does not exist in production because a module is never imported, not because a handler returns 403 — proven by re-importing `app.main` under `ENV=production` and watching a route that resolves in development vanish from the OpenAPI paths entirely. The dev bar is absent from a production bundle because a `define`-folded flag makes its module unreachable and rollup drops it — proven by building the staff app twice, once with the flag off and once on, and asserting the marker is missing from the first and present in the second, because an absence test with nothing to find is not a test. The demo studio's reset is derived from `Base.metadata` rather than a table list, so a table a later wave adds is wiped on the day it lands. And the five restrictions live in `tests/restrictions/`, which — like `tests/invariants/` — runs **unscoped in every lane, every time**, so no lane can land the first violation unnoticed.

**Tech Stack:** FastAPI · Starlette middleware · SQLAlchemy 2 + `TenantSession` · Alembic (revision `0003`) · PostgreSQL 18 · pydantic-settings · pytest · React 19 + TypeScript 5.9 (strict) · Vite 8 (`define`-based dead-code elimination) · vitest 4 + Testing Library + jsdom · ESLint 10 · `@studio/ui` primitives from M0.3.

**Spec:** [SPEC.md](../../../SPEC.md) §19 in full, plus §5.10 (the four uPay security requirements), §7 (the `/dev` route list), §10.1, §11.2, §18.1–§18.3 · [docs/architecture.html](../../architecture.html) "§19 The developer account" · [docs/plan/milestone-plan.md](../../plan/milestone-plan.md) Global Constraints, W0 · M0 · [upay-integration.md](../../../upay-integration.md) (the callback shape) · [CLAUDE.md](../../../CLAUDE.md).

---

## Global Constraints

Every task inherits these. Values copied verbatim from their sources.

| # | Constraint | Source |
|---|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md §Commands |
| G2 | Money is **always** an integer count of agorot. Never a float, never a decimal. | SPEC §8.3, invariant 1 |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem` regardless of locale. | SPEC §8.3, §9 |
| G4 | No user-facing string is ever inlined in a component. Everything goes through `@studio/i18n`. | SPEC §8.3 |
| G5 | New API endpoints are versioned under `/api/v1/`. | CLAUDE.md §Conventions |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. | SPEC §7, CLAUDE.md |
| G7 | Health declarations contain personal data about minors. **Never log their contents.** | CLAUDE.md §Gotchas, SPEC §5.5 |
| G9 | Every tenant-scoped table carries non-null `studio_id` with a leading composite index. Bypassing `TenantMixin` requires the explicit `.with_all_tenants(reason=...)` escape hatch. | SPEC §4.2 |
| G12 | Physical CSS properties are banned by ESLint in all frontend source. | D10 |
| G13 | Colours live in named tokens, never hardcoded hex. | D1, D2 |
| G16 | Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional `Idempotency-Key`. | SPEC §8.3 |
| G18 | A failing test is written before any bug fix. Prefer a single test file over the full suite during development. | CLAUDE.md §Workflow, SPEC §13 |

**Repo conventions this session matches:**

- **Assert behaviour, not source text, wherever behaviour is observable.** Where only source can be checked, the docstring says so and says why.
- **Prove a new gate fails before trusting it.** Plant a violation, watch it go red, revert. M0.1 found three gates that passed while checking nothing; M0.2 found three more; M0.3 found that its own bijection parser read only the first matching CSS block.
- Components get a vitest + Testing Library test rendering them in both `he` (RTL) and `en` (LTR), per §13, using `web/packages/ui/src/testing.tsx` (`renderIn`, `DIRECTIONS`, `THEMES`). Do not write a second harness.
- Frontend tooling runs from `web/`, never the repo root.
- `./scripts/ci-local.sh` must be green before every push. `./scripts/lane-check.sh core` is this session's lane check.
- **Do not edit** `app/models/__init__.py` (seam-2 discovery), `web/packages/ui/src/slots.ts` (seam 4), or `web/packages/i18n/index.ts` / `types.ts` (authored once).
- `alembic/versions/**` is denied to Edit/Write by `.claude/hooks/block-protected.sh` — author migrations with `.venv/bin/alembic revision` and edit them through Bash.

---

## The scope split — confirmed, with two corrections

The proposed split is **confirmed**. §19 assumes `auth_identity`, `person`, `role_assignment`, `student`, `guardian`, `session` and `charge`, and `app/models/` holds only `base.py`, `audit.py` and `studio.py`. Verified: `grep -rn 'is_developer'` across `app/`, `tests/`, `web/` returns nothing; `is_demo` appears only in `app/models/studio.py:34` and `tests/core/test_alembic_baseline.py:99`; `'dev-bar'` appears only as a `SlotId` in `web/packages/ui/src/slots.ts:17`.

**M0.4 builds** the `/dev` router and its non-existence in production · `X-Dev-Now` · the demo studio row, the versioned fixture module and `POST /dev/demo/reset` · the nightly staging reset · the uPay IPN simulator in four shapes · the `livesystem=0` pin · the §19.7 cross-studio exclusion · the dev bar container, its slot registry and its tree-shaking · and all five §19.6 restrictions as tests.

**M1's contract commit adds** `auth_identity.is_developer`, the nine personas and the role switcher — the first commit in which a `Person` exists. **M2–M7 append fixture layers** (structure, students, health, attendance, money, belts), each one a `FixtureLayer` moved out of `PLANNED_LAYERS` (Task 5).

**Correction 1 — restriction 1 is *not* vacuous this session, and should not be written as if it were.** "Cannot act inside a non-demo studio in production" is a pure function of three booleans: `is_developer`, `env == production`, `studio.is_demo`. All eight rows of that truth table are assertable today, and the rule is wired into `studio_id_from_request` — the resolver that already exists — reading fields M1 will populate. Only the *inputs* are absent, not the rule. Restrictions 3 and 4 are the genuinely vacuous ones.

**Correction 2 — the routes resolve at `/api/v1/dev/*`, not `/dev/*`.** SPEC §7 writes them as `/dev/*`, but `app/main.py` mounts every discovered router under an `/api/v1` prefix. G5 ("new API endpoints are versioned under `/api/v1/`") wins over §7's shorthand. Every test and every client call in this plan uses the `/api/v1/dev/...` form.

---

## What was verified empirically before this plan was written

None of the following is a guess. Each was run in the session that produced this plan.

### 1. Seam 2's conditional mount works, and the test harness for it works

A probe `app/routers/dev.py` exposing `GET /dev/ping`, with `app.main` re-imported under each environment:

```
development -> 200 | paths: ['/api/v1/dev/ping', '/api/v1/health']
production  -> 404 | paths: ['/api/v1/health']
```

The route does not 403 — it is **not in the OpenAPI path set at all**. §19.2's requirement is already satisfied by M0.2's mechanism; this session's job is to add the module and assert it, exactly as the session prompt says.

The harness detail that matters: `app/main.py` reads `settings.ENV` **once, at import**, and `settings` is a module-level singleton. Swapping the environment requires setting `os.environ["ENV"]`, popping `app.main` and `app.core.config` from `sys.modules`, and re-importing. **The restore is load-bearing:** a production-built `app.main` left in `sys.modules` silently changes every later test in the session, including `tests/invariants/test_03`, which walks `app.openapi()`. Task 1 tests the harness's own restore.

### 2. A `define`-folded flag really does drop the component from a production bundle — but **not its CSS**

A probe component containing the marker `DEV_BAR_MARKER_5731`, selected by `import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true' ? Real : Absent`, built into `web/apps/staff`:

| Build | JS marker | CSS marker |
|---|---|---|
| `npm run build` (flag off) | **absent** | `.probe-marker` **present in `dist/assets/index-*.css`** |
| `VITE_DEV_TOOLS=true npm run build` | present | present |

**The JS is tree-shaken; a CSS file the dropped module imported is emitted anyway.** Vite collects stylesheets at transform time, before rollup's dead-code elimination decides the importing module is unreachable. So:

- **The dev bar must not import a stylesheet.** It styles itself with inline style objects over the M0.3 token variables — the pattern `HelloProof.tsx` already uses, and the one D10's ESLint rule (`no-restricted-syntax` over JS object properties) actually reads.
- The session prompt's option of "keep dev-bar-only CSS beside the dev-bar feature" is therefore **rejected on evidence**: it would ship dev-only rules into every production stylesheet, which is precisely the "hidden, not absent" threat model §19.4 exists to refuse.

Both build directions were confirmed, which is what makes the absence assertion worth having: with the flag on, the marker **is** present, so the flag-off assertion is testing something.

### 3. `scripts/export_openapi.py` currently exports whichever environment it is run in

It does `from app.main import app` with no environment pinned, and the effective `ENV` locally is `development` (`.env` holds only `ENCRYPTION_KEYS` and `ENCRYPTION_ACTIVE_KEY_VERSION`; CI sets neither). **The moment `app/routers/dev.py` exists, `openapi.json` and the generated `api-client` gain the `/dev` surface**, and the committed schema becomes a function of the exporting machine's environment — so `ci-local.sh`'s `git diff --exit-code` gate would fail for anyone running it under a different `ENV`. Task 3 pins the export to the production app, which is also the correct contract: the generated client describes what clients can actually reach.

### 4. Baseline

`.venv/bin/pytest` → **161 passed, 1 skipped, 1 xfailed**. `./scripts/dev-db.sh up` → postgres ready on `127.0.0.1:55433`.

---

## Two decisions taken up front, not mid-build

### Decision A — the dev bar's strings go through `@studio/i18n`

**Choice: route them through `@studio/i18n`, in the `common` namespace under a `dev.*` prefix, in all three locales — and *extend* G4's ESLint rule to cover `packages/ui/src/dev-bar/**/*.tsx` rather than exempt anything.**

The one-sentence justification: the switcher's persona labels *are* the product's own role names, so an exception would create a second set of Hebrew role strings that drift from the real ones the day M1 lands `people`, and an ESLint hole in developer-only code is a precedent a later lane can cite — whereas sixteen keys in `common` is a bounded, one-time cost.

Note the placement consequence, recorded so it is a decision and not an oversight: the dev bar lives in `web/packages/ui/src/dev-bar/`, where G4's rule (scoped to `apps/*/src/**/*.tsx`) **would not have fired at all**. Extending the rule to that directory is strictly stronger than either option the prompt offered.

**The trade-off, stated plainly:** because `common.ts` ships in every app's bundle, the dev bar's *copy* is present in a production build even though its *code and markup* are not. The bundle gate in Task 17 therefore asserts on a dev-bar-only marker (`studio-dev-bar`), not on the Hebrew copy. Inert strings in a shared translation table are not the dev bar; the code that could call `/api/v1/dev/*` is, and those endpoints do not exist in production either (restriction 2).

### Decision B — `app/main.py` gains exactly one guarded line, and it is not a registration

`X-Dev-Now` must shift the clock for *every* request, not only `/dev/*` ones — §19.5's whole purpose is loading the parent's payments screen "in three weeks" to see the debt ladder. Middleware is the only place that can do that, and middleware is installed on the app object.

M0.2 already established the precedent: `app/main.py:22` calls `configure_logging()` with the comment *"Not a registration: seam 2's discovery loop is untouched."* This session adds one more line in the same shape, guarded the same way as the router:

```python
if settings.ENV != "production":
    app.add_middleware(DevClockMiddleware)
```

`tests/test_router_discovery.py` already asserts `include_router` appears exactly twice and `pkgutil.iter_modules` is present; both remain true. The middleware **also** guards itself internally, so the header is ignored in production even if someone reintroduces an unconditional `add_middleware` — defence in depth, with the non-installation as the primary mechanism.

---

## File structure

**Backend — create**

| Path | Responsibility |
|---|---|
| `app/core/clock.py` | `now()` — the only clock in the app — plus `X_DEV_NOW_HEADER`, the request-scoped offset contextvar, and `DevClockMiddleware` |
| `app/core/dev_account.py` | §19.6's rules as pure functions: `developer_may_act`, `dev_tools_allowed`, and the `RequireDeveloper` dependency |
| `app/core/break_glass.py` | §18.2's health exclusion: `HEALTH_ENTITY_TYPES`, `break_glass_may_read` |
| `app/core/demo.py` | §19.7's one shared exclusion helper: `exclude_demo_studios` |
| `app/services/demo/__init__.py` | package marker |
| `app/services/demo/fixtures.py` | `FixtureLayer`, `PlannedLayer`, `StudioFixture`, `FixtureSet`, `SEEDS`, `LATEST_VERSION`, `PLANNED_LAYERS` |
| `app/services/demo/service.py` | `DemoStudioService.seed/wipe/reset/get` |
| `app/integrations/upay/__init__.py` | package marker |
| `app/integrations/upay/form.py` | `upay_form_fields` — the `livesystem` pin and the agorot→shekel boundary |
| `app/integrations/upay/ipn.py` | `IpnShape`, `IpnPayload`, `build_ipn_payload` — the four §19.5 shapes |
| `app/routers/dev.py` | the router: `/dev/ping`, `/dev/clock`, `/dev/demo/reset`, `/dev/upay/simulate-ipn`, `/dev/jobs/{name}/run`, `/dev/act-as/{person_id}` |
| `app/schemas/dev.py` | every request/response model the dev router declares |
| `app/workers/__init__.py` | package marker |
| `app/workers/demo_reset.py` | the nightly staging reset entry point |
| `infra/railway/jobs.json` | the scheduled-job declaration, in one place |

**Backend — modify**

| Path | Change |
|---|---|
| `app/main.py` | one guarded `add_middleware` line (Decision B) |
| `app/core/config.py` | `DEV_TOOLS_TOKEN: SecretStr \| None = None` |
| `app/core/tenancy.py` | `studio_id_from_request` calls `developer_may_act` |
| `scripts/export_openapi.py` | pins the export to the production app |
| `scripts/lane-check.sh` | `core`'s paths gain the new source; `tests/restrictions` joins `tests/invariants` in the unscoped gate |
| `alembic/versions/0003_*.py` | new revision: the demo studio row |
| `docs/deploy/railway-runbook.md` | records that the cron entry must be created in the Railway dashboard |

**Tests — create**

| Path | Responsibility |
|---|---|
| `tests/dev/__init__.py`, `tests/dev/conftest.py` | the `app_in_env` harness |
| `tests/dev/test_dev_router.py` | the router mounts, is guarded, and its shape |
| `tests/dev/test_clock.py` | `X-Dev-Now`: per-request only, non-production only, and the `now()` discipline gate |
| `tests/dev/test_demo_fixtures.py` | the fixture module's growth contract |
| `tests/dev/test_demo_service.py` | seed / wipe / reset against a live database |
| `tests/dev/test_ipn_simulator.py` | the four shapes |
| `tests/dev/test_openapi_surface.py` | `openapi.json` carries no `/dev` path |
| `tests/config/test_jobs_config.py` | the scheduled-job declaration is real |
| `tests/restrictions/__init__.py` | package marker |
| `tests/restrictions/test_01_no_action_in_a_real_studio.py` | §19.6 restriction 1 |
| `tests/restrictions/test_02_no_dev_routes_in_production.py` | §19.6 restriction 2 |
| `tests/restrictions/test_03_no_real_health_declaration.py` | §19.6 restriction 3 |
| `tests/restrictions/test_04_the_flag_is_not_grantable.py` | §19.6 restriction 4 |
| `tests/restrictions/test_05_no_live_money.py` | §19.6 restriction 5 |
| `tests/restrictions/test_19_7_demo_data_hygiene.py` | §19.7 — not a sixth restriction, named by its section so nobody miscounts |

**Frontend — create**

| Path | Responsibility |
|---|---|
| `web/packages/ui/src/dev-bar/DevBar.tsx` | the container, built from M0.3 primitives, inline styles only |
| `web/packages/ui/src/dev-bar/tools.ts` | `registerDevTool`, `DEV_TOOL_ORDER`, `PENDING_TOOLS`, `DevToolProps` |
| `web/packages/ui/src/dev-bar/api.ts` | `DEV_NOW_HEADER`, `setDevNow`, `devHeaders`, `resetDemoStudio`, `simulateIpn`, `IPN_SHAPES` |
| `web/packages/ui/src/dev-bar/TimeTravelTool.tsx` | §19.5 tool 2 |
| `web/packages/ui/src/dev-bar/IpnSimulatorTool.tsx` | §19.5 tool 4 |
| `web/packages/ui/src/dev-bar/devTools.ts` | registers the built tools into the `dev-bar` slot |
| `web/packages/ui/src/dev-bar/index.ts` | **the flag switch** — the only module apps import |
| `web/packages/ui/src/dev-bar/absent.ts` | the production shapes: a `null` component and an empty header map |
| `web/packages/ui/src/dev-bar/*.test.tsx` | he/RTL + en/LTR tests per §13 |
| `web/tools/__tests__/dev-bar-bundle.test.ts` | the tree-shaking gate, both directions |
| `web/tools/__tests__/g4-dev-bar.test.ts` | the extended inline-string rule fires on the dev-bar directory |
| `web/tools/__tests__/ipn-shapes.test.ts` | the TS shape names equal the Python enum's |

**Frontend — modify**

| Path | Change |
|---|---|
| `web/packages/ui/package.json` | `"./dev-bar"` subpath export |
| `web/packages/i18n/{he,en,ru}/common.ts` | the `dev.*` keys |
| `web/eslint.config.js` | the inline-string rule covers `packages/ui/src/dev-bar/**/*.tsx` |
| `web/apps/{staff,parent,dashboard}/src/App.tsx` | mount `<DevBar />` |

---

## Task 1: The `/dev` router exists outside production and nowhere inside it

**Files:**
- Create: `app/routers/dev.py`
- Create: `app/schemas/dev.py`
- Create: `tests/dev/__init__.py`, `tests/dev/conftest.py`, `tests/dev/test_dev_router.py`
- Create: `tests/restrictions/__init__.py`, `tests/restrictions/test_02_no_dev_routes_in_production.py`
- Modify: `app/core/config.py` (add `DEV_TOOLS_TOKEN`)
- Modify: `app/core/dev_account.py` — created here with `dev_tools_allowed` and `RequireDeveloper`

**Interfaces:**
- Consumes: `app.main.app` (seam 2's discovery loop, `app/main.py:27-33`), `app.core.config.settings`.
- Produces:
  - `tests/dev/conftest.py::app_in_env(env: str) -> ContextManager[FastAPI]`
  - `app.core.dev_account.dev_tools_allowed(*, env: str, is_developer: bool, presented_token: str | None, configured_token: str | None) -> bool`
  - `app.core.dev_account.RequireDeveloper` — a FastAPI dependency annotation; every later `/dev` route depends on it
  - `app.routers.dev.router` — `APIRouter(prefix="/dev", tags=["dev"])`
  - `app.schemas.dev.DevPing(env: str, now: datetime)`

- [ ] **Step 1: Write the failing harness and the restriction-2 test**

`tests/dev/conftest.py`:

```python
"""The environment-swapping app harness.

app/main.py reads settings.ENV **once, at import**, inside seam 2's discovery loop --
that is the mechanism §19.2 relies on, so the only faithful way to test it is to
re-import the module under a different environment.

The restore is the load-bearing half. `settings` is a module-level singleton and
`app.main` caches an app object built from it; a production-built app/main left in
sys.modules silently changes every test that imports it later in the same session,
including tests/invariants/test_03, which walks app.openapi(). The harness therefore
puts the original module objects back rather than reloading again, and
test_the_harness_restores_what_it_swapped asserts it.
"""

from __future__ import annotations

import importlib
import os
import sys
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import FastAPI

#: Order matters: config first, because app.main imports `settings` from it by value.
RELOADABLE = ("app.core.config", "app.main")


@contextmanager
def app_in_env(env: str) -> Iterator[FastAPI]:
    saved_modules = {name: sys.modules.get(name) for name in RELOADABLE}
    saved_env = os.environ.get("ENV")
    os.environ["ENV"] = env
    try:
        for name in RELOADABLE:
            sys.modules.pop(name, None)
        importlib.import_module("app.core.config")
        yield importlib.import_module("app.main").app
    finally:
        if saved_env is None:
            os.environ.pop("ENV", None)
        else:
            os.environ["ENV"] = saved_env
        for name, module in saved_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
```

`tests/restrictions/test_02_no_dev_routes_in_production.py`:

```python
"""§19.6 restriction 2: the developer account cannot reach /dev/* in production.

NOT VACUOUS. The mechanism is live today and this test watches it fire.

The assertion that matters is the second one in each test. A 404 proves very little on
its own -- a typo'd path 404s too. What §19.2 requires is that the routes **do not
exist**: "the router is never registered, so the endpoints do not exist rather than
being guarded by an `if` statement someone can invert." So the test reads the OpenAPI
path set, which is the app's own account of what it serves.

Routes resolve under /api/v1/dev/... , not /dev/... : app/main.py mounts every
discovered router beneath an /api/v1 prefix (G5). SPEC §7 writes the short form.
"""

from fastapi.testclient import TestClient

from tests.dev.conftest import app_in_env

PING = "/api/v1/dev/ping"


def test_a_dev_route_resolves_outside_production():
    """The control. Without this, the production assertion below would pass just as
    happily against a router that was never written."""
    with app_in_env("development") as application:
        assert TestClient(application).get(PING).status_code == 200


def test_no_dev_route_resolves_in_production():
    with app_in_env("production") as application:
        assert TestClient(application).get(PING).status_code == 404
        dev_paths = [p for p in application.openapi()["paths"] if "/dev" in p]
        assert dev_paths == [], f"the dev surface exists in production: {dev_paths}"


def test_the_dev_router_is_absent_from_staging_too_only_if_staging_is_production():
    """Staging keeps the dev tools on purpose -- §19.1: the role switcher exists
    'across any studio in that environment'. Recorded as an assertion so nobody
    'hardens' staging into uselessness and calls it a fix."""
    with app_in_env("staging") as application:
        assert TestClient(application).get(PING).status_code == 200
```

`tests/dev/test_dev_router.py`:

```python
"""The harness itself, and the router's shape."""

from fastapi.testclient import TestClient

from app.core.dev_account import dev_tools_allowed
from tests.dev.conftest import app_in_env


def test_the_harness_restores_what_it_swapped():
    """The failure this guards: a production app/main left in sys.modules turns every
    later test in the session into a test of a different application."""
    import app.main as before

    with app_in_env("production"):
        pass

    import app.main as after

    assert after is before
    assert TestClient(after.app).get("/api/v1/health").status_code == 200


def test_ping_reports_the_environment_it_was_built_in():
    with app_in_env("development") as application:
        body = TestClient(application).get("/api/v1/dev/ping").json()
    assert body["env"] == "development"


# -- who may call /dev/* at all (the truth table) -----------------------------
def test_a_developer_identity_is_allowed():
    assert dev_tools_allowed(
        env="staging", is_developer=True, presented_token=None, configured_token=None
    )


def test_localhost_with_no_token_configured_is_allowed():
    """Development is a machine with no auth layer yet. Documented rather than implied."""
    assert dev_tools_allowed(
        env="development", is_developer=False, presented_token=None, configured_token=None
    )


def test_staging_with_no_token_configured_is_refused():
    """Staging is a public HTTPS origin (§15 item 3). An unauthenticated
    POST /dev/demo/reset there is a stranger wiping your test data; an unauthenticated
    POST /dev/upay/simulate-ipn is a stranger inventing payments. Closed by default."""
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token=None, configured_token=None
    )


def test_a_matching_token_is_allowed_and_a_wrong_one_is_not():
    assert dev_tools_allowed(
        env="staging", is_developer=False, presented_token="s3cret", configured_token="s3cret"
    )
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token="wrong", configured_token="s3cret"
    )


def test_production_is_refused_on_every_input():
    """Defence in depth. The router is not mounted in production at all, so this branch
    is unreachable through HTTP -- which is exactly why it must be asserted directly."""
    for is_developer in (True, False):
        for token in (None, "s3cret"):
            assert not dev_tools_allowed(
                env="production",
                is_developer=is_developer,
                presented_token=token,
                configured_token="s3cret",
            )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest tests/dev tests/restrictions -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.dev_account'`, and the ping route 404s in development because `app/routers/dev.py` does not exist.

- [ ] **Step 3: Add `DEV_TOOLS_TOKEN` to settings**

In `app/core/config.py`, after `ENCRYPTION_ACTIVE_KEY_VERSION`:

```python
    # §19 -- who may call /dev/* on a deployed non-production environment. Staging is a
    # public HTTPS origin, so "the router exists there" must not mean "anyone may use
    # it". Unset in development, where there is no auth layer to authenticate against
    # yet; M1 replaces this with the is_developer flag and it becomes vestigial.
    DEV_TOOLS_TOKEN: SecretStr | None = None
```

- [ ] **Step 4: Write `app/core/dev_account.py`**

```python
"""SPEC §19.6 -- what the developer account cannot do, as functions rather than prose.

Everything here is a pure decision over booleans and strings. That is deliberate: a
guardrail expressed as a pure function has a truth table, and a truth table can be
asserted in full. The FastAPI dependency at the bottom is the only part that touches a
request, and it does nothing but read three values and call one of these functions.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings

DEV_TOKEN_HEADER = "X-Dev-Token"


def dev_tools_allowed(
    *,
    env: str,
    is_developer: bool,
    presented_token: str | None,
    configured_token: str | None,
) -> bool:
    """Who may call /dev/* on an environment where the router is mounted at all.

    Production returns False on every input. The router is not registered there, so
    this branch is unreachable over HTTP -- it exists so that a future refactor which
    accidentally mounts the router does not also hand it out.
    """
    if env == "production":
        return False
    if is_developer:
        return True
    if configured_token is not None:
        return presented_token is not None and secrets.compare_digest(
            presented_token, configured_token
        )
    # No token configured: allowed only on a developer's own machine.
    return env == "development"


def developer_may_act(*, is_developer: bool, studio_is_demo: bool, env: str) -> bool:
    """§19.6 restriction 1 -- 'cannot act inside a non-demo studio in production'.

    §19.1: in dev and staging the role switcher works across any studio in that
    environment; in production it works only inside a studio that contains no real
    people. Not "is discouraged from": this is the resolver's answer.
    """
    if not is_developer:
        return True
    if env != "production":
        return True
    return studio_is_demo


def require_developer(request: Request) -> None:
    """The dependency every /dev route declares (.claude/rules/api.md: authorization is
    checked in the router via a dependency, never inside a service)."""
    configured = settings.DEV_TOOLS_TOKEN
    if not dev_tools_allowed(
        env=settings.ENV,
        is_developer=bool(getattr(request.state, "is_developer", False)),
        presented_token=request.headers.get(DEV_TOKEN_HEADER),
        configured_token=None if configured is None else configured.get_secret_value(),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the developer tools are not available to this caller",
        )


RequireDeveloper = Annotated[None, Depends(require_developer)]
```

- [ ] **Step 5: Write `app/schemas/dev.py` and `app/routers/dev.py`**

`app/schemas/dev.py`:

```python
"""Request and response models for the dev router. .claude/rules/api.md: every request
body and query param is validated by a Pydantic schema, and every endpoint declares an
explicit response_model."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.core.config import Env


class DevPing(BaseModel):
    env: Env
    now: datetime
```

`app/routers/dev.py`:

```python
"""SPEC §19 -- the developer account's endpoints.

**This module's existence is the mechanism.** app/main.py's discovery loop skips a
module named `dev` when settings.ENV == "production" (seam 2, M0.2, app/main.py:31), so
in production these routes are never registered: they 404 the way any unclaimed path
does, rather than 403-ing from an `if` a later edit could invert. tests/restrictions/
test_02 asserts the OpenAPI path set, not the status code, because a status code proves
much less.

Nothing outside this module and app/services/demo may import from here. If a service
needs something in this file, the thing is in the wrong file.

Routes resolve under /api/v1/dev/... : main.py mounts every discovered router beneath
/api/v1 (G5). SPEC §7 writes the short form.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.clock import now
from app.core.config import settings
from app.core.dev_account import RequireDeveloper
from app.schemas.dev import DevPing

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/ping", response_model=DevPing)
def ping(_: RequireDeveloper) -> DevPing:
    """Proof of mount. Restriction 2's test asserts this resolves outside production and
    does not exist inside it, so it stays the cheapest possible route: no database, no
    tenant scope, nothing that could fail for an unrelated reason and make the
    restriction look satisfied when it is not."""
    return DevPing(env=settings.ENV, now=now())
```

**Note for Step 5:** `app.core.clock.now` does not exist until Task 2. Until then, write
`from datetime import UTC, datetime` and `now=datetime.now(UTC)`, and Task 2 replaces it
— Task 2's discipline gate will fail until you do, which is the point.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/pytest tests/dev tests/restrictions -q`
Expected: PASS.

Then run the whole suite to prove the harness leaks nothing:
Run: `.venv/bin/pytest -q`
Expected: PASS, with the pre-existing 161 still passing.

- [ ] **Step 7: Prove the gate bites**

Plant an unconditional mount by temporarily deleting the `ENV == "production"` guard at `app/main.py:31-32`:

```bash
.venv/bin/pytest tests/restrictions/test_02_no_dev_routes_in_production.py -q
```

Expected: FAIL on `test_no_dev_route_resolves_in_production` — `the dev surface exists in production: ['/api/v1/dev/ping']`. Restore the guard and re-run to green. **Record the observed failure text in the retrospective (Task 18).**

- [ ] **Step 8: Commit**

```bash
git add app/routers/dev.py app/schemas/dev.py app/core/dev_account.py app/core/config.py tests/dev tests/restrictions
git commit -m "feat(dev): the /dev router, and the proof it does not exist in production

§19.2's conditional mount was built in M0.2; this is the module that makes it
observable. The restriction test asserts the OpenAPI path set rather than a status
code, because a 404 is what a typo looks like too."
```

---

## Task 2: `X-Dev-Now` — one request, non-production only

**Files:**
- Create: `app/core/clock.py`
- Create: `tests/dev/test_clock.py`
- Modify: `app/main.py` (one guarded line — see Decision B)
- Modify: `app/routers/dev.py` (import `now` from the clock; add `GET /dev/clock`)
- Modify: `app/schemas/dev.py` (add `DevClock`)

**Interfaces:**
- Consumes: `app_in_env` (Task 1), `RequireDeveloper` (Task 1).
- Produces:
  - `app.core.clock.now() -> datetime` — timezone-aware UTC; **the only clock in the app**
  - `app.core.clock.X_DEV_NOW_HEADER = "X-Dev-Now"`
  - `app.core.clock.DevClockMiddleware` — a `BaseHTTPMiddleware` subclass
  - `app.core.clock.use_dev_now(value: datetime | None) -> ContextManager[None]`
  - `app.schemas.dev.DevClock(now: datetime, shifted: bool)`

- [ ] **Step 1: Write the failing test**

`tests/dev/test_clock.py`:

```python
"""§19.5 -- 'An X-Dev-Now header shifts the server's clock for that request only, in
non-production.'

Three properties, each of which can fail independently:
  1. the header shifts the clock at all,
  2. the shift does not survive the request (a contextvar leaked into the event loop
     would silently move every later request's clock -- the kind of bug that surfaces
     as "the billing run ran for the wrong month" three weeks later),
  3. production ignores it.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.clock import X_DEV_NOW_HEADER, now
from tests.dev.conftest import app_in_env

ROOT = Path(__file__).resolve().parents[2]
TRAVELLED = "2027-03-01T09:00:00+00:00"


def test_now_is_timezone_aware_utc():
    """G3 -- always stored UTC. A naive datetime compares unequal to every aware one and
    raises when subtracted from one, so this is not a stylistic preference."""
    assert now().tzinfo is not None
    assert now().utcoffset() == UTC.utcoffset(None)


def test_the_header_shifts_the_clock_for_that_request():
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .get("/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: TRAVELLED})
            .json()
        )
    assert body["now"].startswith("2027-03-01T09:00:00")
    assert body["shifted"] is True


def test_the_shift_does_not_leak_into_the_next_request():
    with app_in_env("development") as application:
        client = TestClient(application)
        client.get("/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: TRAVELLED})
        body = client.get("/api/v1/dev/clock").json()
    assert not body["now"].startswith("2027"), "the offset outlived its request"
    assert body["shifted"] is False


def test_an_unparseable_header_is_a_400_not_a_silent_pass_through():
    """Silently ignoring a malformed header is the worst option: you think you are
    testing March and you are testing today, and the test that 'proves' the debt ladder
    passes for the wrong reason."""
    with app_in_env("development") as application:
        response = TestClient(application).get(
            "/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: "next tuesday"}
        )
    assert response.status_code == 400


def test_production_ignores_the_header_entirely():
    """/dev/clock does not exist in production, so this asks a route that does."""
    with app_in_env("production") as application:
        response = TestClient(application).get(
            "/api/v1/health", headers={X_DEV_NOW_HEADER: TRAVELLED}
        )
    assert response.status_code == 200
    assert now().year != 2027


def test_the_middleware_is_installed_conditionally_not_guarded():
    """Source assertion by necessity: 'the middleware object is absent from this app's
    stack' is not observable through the ASGI interface once the internal guard also
    exists. Decision B -- the non-installation is the mechanism and the internal guard
    is defence in depth, so both must be present and neither alone is enough."""
    text = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    assert re.search(r'if settings\.ENV != "production":\s*\n\s*app\.add_middleware', text)
    # Seam 2 is untouched -- the same assertion tests/test_router_discovery.py makes.
    assert text.count("include_router") == 2
    assert "pkgutil.iter_modules" in text


def test_nothing_outside_the_clock_module_reads_the_wall_clock():
    """The discipline gate. Time travel is worthless if half the app calls
    datetime.now() directly -- the billing run would shift and the debt ladder would
    not, and the difference would look like a billing bug.

    Source-level by necessity: 'this module called datetime.now' is not observable at
    runtime without patching the interpreter. `func.now()` in a model is SQL, not
    Python, and is deliberately not matched.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path.name == "clock.py":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\bdatetime\.(now|utcnow|today)\s*\(", line):
                offenders.append(f"{path.relative_to(ROOT)}:{lineno}")
    assert offenders == [], (
        "these read the wall clock directly and so cannot be time-travelled -- "
        f"use app.core.clock.now(): {offenders}"
    )


def test_the_discipline_gate_would_flag_a_direct_call(tmp_path):
    """Proves the detector fires, because today it finds nothing."""
    probe = tmp_path / "probe.py"
    probe.write_text("from datetime import datetime\nx = datetime.now()\n", encoding="utf-8")
    hits = [
        line
        for line in probe.read_text(encoding="utf-8").splitlines()
        if re.search(r"\bdatetime\.(now|utcnow|today)\s*\(", line)
    ]
    assert hits == ["x = datetime.now()"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/dev/test_clock.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.clock'`.

- [ ] **Step 3: Write `app/core/clock.py`**

```python
"""The only clock in the application.

SPEC §19.5: "An X-Dev-Now header shifts the server's clock **for that request only**,
in non-production. This is the only practical way to test the billing run, the debt
escalation ladder (day 3 / 7 / 14), health reminders (day 1 / 3 / 7) and trial
follow-ups without waiting a fortnight."

Two rules follow from that sentence and both are enforced by tests:

* **Nothing else calls `datetime.now()`.** A module that reads the wall clock directly
  cannot be time-travelled, so a run that half-shifts is worse than one that does not
  shift at all -- it looks like a billing bug rather than a missing feature.
* **The shift is request-scoped.** It lives in a ContextVar set and reset by the
  middleware, so a leak into the event loop cannot move a later request's clock.

G3: always timezone-aware UTC. Rendering in Asia/Jerusalem happens at the edge.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

X_DEV_NOW_HEADER = "X-Dev-Now"

_dev_now: ContextVar[datetime | None] = ContextVar("dev_now", default=None)


def now() -> datetime:
    """The current time, honouring an active X-Dev-Now shift."""
    return _dev_now.get() or datetime.now(UTC)


def is_shifted() -> bool:
    return _dev_now.get() is not None


@contextmanager
def use_dev_now(value: datetime | None) -> Iterator[None]:
    """Also the seam a worker uses: `python -m app.workers.billing --at=...` under
    time travel is the same mechanism as the header, not a second one."""
    token = _dev_now.set(value)
    try:
        yield
    finally:
        _dev_now.reset(token)


def parse_dev_now(raw: str) -> datetime:
    """ISO 8601. A bare date is accepted and read as midnight UTC, because
    `?at=2027-03-01` is what you actually type when testing a billing day."""
    parsed = datetime.fromisoformat(raw)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class DevClockMiddleware(BaseHTTPMiddleware):
    """Installed only when ENV != production (app/main.py). The internal guard below is
    defence in depth, not the mechanism: §19.2's standard is that the capability does
    not exist in production, not that it is switched off there."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        from app.core.config import settings

        raw = request.headers.get(X_DEV_NOW_HEADER)
        if raw is None or settings.ENV == "production":
            return await call_next(request)
        try:
            shifted = parse_dev_now(raw)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "code": "invalid_dev_now",
                    "message": f"{X_DEV_NOW_HEADER} must be ISO 8601, got {raw!r}",
                },
            )
        with use_dev_now(shifted):
            return await call_next(request)
```

- [ ] **Step 4: Add the one guarded line to `app/main.py`**

After `app = FastAPI(...)` and **before** the discovery loop, so the middleware wraps
every route the loop mounts:

```python
# §19.5 -- X-Dev-Now shifts the clock for one request, and only where the router that
# documents it exists. Not a registration: seam 2's discovery loop below is untouched,
# exactly as configure_logging() above is not one.
if settings.ENV != "production":
    app.add_middleware(DevClockMiddleware)
```

with `from app.core.clock import DevClockMiddleware` added to the imports.

- [ ] **Step 5: Add `GET /dev/clock` and switch `ping` to the real clock**

In `app/schemas/dev.py`:

```python
class DevClock(BaseModel):
    now: datetime
    shifted: bool
```

In `app/routers/dev.py`, replace the temporary `datetime.now(UTC)` from Task 1 with
`from app.core.clock import is_shifted, now` and add:

```python
@router.get("/clock", response_model=DevClock)
def read_clock(_: RequireDeveloper) -> DevClock:
    """What time does the server think it is, and did you move it? The second field is
    the one that matters: a shift that silently failed to apply looks identical to no
    shift at all, and you would debug the billing run instead of the header."""
    return DevClock(now=now(), shifted=is_shifted())
```

- [ ] **Step 6: Run to verify it passes**

Run: `.venv/bin/pytest tests/dev/test_clock.py -q`
Expected: PASS — 8 tests.

- [ ] **Step 7: Prove the leak test bites**

Temporarily replace `use_dev_now`'s body with a bare `_dev_now.set(value); yield` (no
reset):

```bash
.venv/bin/pytest tests/dev/test_clock.py::test_the_shift_does_not_leak_into_the_next_request -q
```

Expected: FAIL — `the offset outlived its request`. Restore and re-run to green.

- [ ] **Step 8: Commit**

```bash
git add app/core/clock.py app/main.py app/routers/dev.py app/schemas/dev.py tests/dev/test_clock.py
git commit -m "feat(dev): X-Dev-Now, request-scoped and non-production only

One guarded add_middleware line in main.py, in the shape M0.2 established for
configure_logging: not a registration, and seam 2's loop is untouched. The
discipline gate is the other half -- time travel that only half the app honours
reads as a billing bug."
```

---

## Task 3: `openapi.json` describes production, not whichever environment exported it

**Files:**
- Modify: `scripts/export_openapi.py`
- Create: `tests/dev/test_openapi_surface.py`

**Interfaces:**
- Consumes: `app.main.app`.
- Produces: nothing new; `openapi.json` and `web/packages/api-client/src/schema.d.ts` become environment-independent.

**Why this task exists:** verified before this plan was written — `export_openapi.py` does a bare `from app.main import app` with no environment pinned. The moment Task 1's router exists, the committed schema becomes a function of the exporting machine's `ENV`, and `ci-local.sh`'s `git diff --exit-code -- openapi.json ...` gate fails for anyone whose environment differs. The generated client is also the wrong place for a surface no deployed client can reach.

- [ ] **Step 1: Write the failing test**

`tests/dev/test_openapi_surface.py`:

```python
"""The generated client describes what a client can actually reach.

Verified before this plan: scripts/export_openapi.py imported app.main with no
environment pinned, so `openapi.json` -- which ci-local.sh diffs and fails on -- was a
function of the exporting machine's ENV the moment a conditionally-mounted router
existed.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_the_committed_schema_carries_no_dev_surface():
    schema = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
    dev_paths = [p for p in schema["paths"] if "/dev" in p]
    assert dev_paths == [], (
        "the dev surface reached the generated api-client. Run "
        "`.venv/bin/python scripts/export_openapi.py` and commit the result: the "
        f"export must pin ENV=production. Found {dev_paths}"
    )


def test_the_export_still_carries_the_real_surface():
    """The complement, so 'no dev paths' can never be satisfied by an empty file."""
    schema = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
    assert "/api/v1/health" in schema["paths"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
.venv/bin/python scripts/export_openapi.py
.venv/bin/pytest tests/dev/test_openapi_surface.py -q
```

Expected: FAIL — `the dev surface reached the generated api-client ... ['/api/v1/dev/clock', '/api/v1/dev/ping']`.

- [ ] **Step 3: Pin the export to production**

In `scripts/export_openapi.py`, above the `from app.main import app` line:

```python
# The schema describes the surface a deployed client can reach, and §19.2 removes the
# dev router from production entirely -- so the export is taken from the production
# app. Set before the import, because app/main.py reads settings.ENV once, at import,
# in seam 2's discovery loop. Without this, `openapi.json` is a function of whichever
# environment happened to run the export, and ci-local.sh's diff gate fails for the
# next person.
os.environ["ENV"] = "production"
```

with `import os` added to the imports.

- [ ] **Step 4: Regenerate and verify**

```bash
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/pytest tests/dev/test_openapi_surface.py -q
git diff --stat -- openapi.json web/packages/api-client/src/schema.d.ts
```

Expected: PASS, and `git diff --stat` reports **no change** to either file — the dev surface never made it in.

- [ ] **Step 5: Commit**

```bash
git add scripts/export_openapi.py tests/dev/test_openapi_surface.py
git commit -m "fix(api): export the production schema, not the exporter's environment

Without this, openapi.json is a function of whoever ran the export the moment a
conditionally-mounted router exists, and ci-local's diff gate fails for the next
person. The generated client should also describe what a client can reach."
```

---

## Task 4: The demo studio row, in every environment including production

**Files:**
- Create: `alembic/versions/0003_*.py` (via `.venv/bin/alembic revision`)
- Create: `app/services/demo/__init__.py`
- Modify: `tests/core/test_alembic_baseline.py` (extend, do not rewrite)

**Interfaces:**
- Consumes: `app.models.studio.Studio`.
- Produces:
  - `app.services.demo.DEMO_STUDIO_SLUG = "demo"`
  - `app.services.demo.DEMO_STUDIO_NAME = "מועדון הדגמה"`
  - `app.services.demo.DEMO_UPAY_SETTINGS: dict[str, object]` — the pinned `{"livesystem": 0, ...}` block

**Why a migration and not only a seed:** §19.1 requires the demo studio to exist **in production** — "so you can smoke-test a live deploy". A migration is the only thing that runs in every environment on every deploy. The *contents* stay a seed (Task 6), which is what makes them resettable and version-addressable; the row itself is restored in place and never deleted.

Identified by `slug`, not by a magic UUID: `studio.slug` already carries a unique constraint (`app/models/studio.py:27`), so `ON CONFLICT (slug) DO NOTHING` is exactly the idempotence a migration needs, and no hardcoded UUID has to agree across a migration, a service and three test files.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/test_alembic_baseline.py`:

```python
# -- §19.1: the demo studio exists everywhere, production included ------------
def test_the_demo_studio_row_exists_after_migration(app_session):
    """§19.1 -- 'Exists in production: Yes, so you can smoke-test a live deploy'. A row
    created by a seed script would exist only where someone remembered to run it."""
    from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SLUG

    row = app_session.execute(
        sa.text("SELECT name, is_demo, settings FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).one()
    assert row.name == DEMO_STUDIO_NAME
    assert row.is_demo is True


def test_the_demo_studios_upay_config_is_pinned_to_the_sandbox(app_session):
    """§19.6 -- 'Cannot touch live money.' The pin lives in the row, not in code that
    reads the row, so a code path that forgets to check is_demo still cannot produce a
    live form for this studio (Task 10 asserts the form builder end of it)."""
    from app.services.demo import DEMO_STUDIO_SLUG

    settings_json = app_session.execute(
        sa.text("SELECT settings FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).scalar_one()
    assert settings_json["upay"]["livesystem"] == 0


def test_migrating_twice_does_not_create_a_second_demo_studio(app_session):
    """Forward-only migrations still re-run on a database that already has the row --
    a fresh `alembic upgrade head` against staging, for instance."""
    from app.services.demo import DEMO_STUDIO_SLUG

    count = app_session.execute(
        sa.text("SELECT count(*) FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).scalar_one()
    assert count == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/core/test_alembic_baseline.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.demo'`.

- [ ] **Step 3: Write `app/services/demo/__init__.py`**

```python
"""SPEC §19 -- the demo studio.

The names and the pinned settings live here rather than in the migration, so the
migration, the seed service, the fixture module and the tests all read one definition.
A slug rather than a hardcoded UUID: `studio.slug` is already unique, which makes
`ON CONFLICT (slug) DO NOTHING` the migration's idempotence for free.
"""

from __future__ import annotations

from typing import Any

#: §19.3's studio.
DEMO_STUDIO_SLUG = "demo"
DEMO_STUDIO_NAME = "מועדון הדגמה"

#: §19.6 -- 'Cannot touch live money.' uPay's form field is a string "1" or "0"
#: (upay-integration.md); it is stored here as an integer and rendered at the boundary,
#: because settings JSONB holding "0" and 0 as different things is a bug waiting to be
#: written. The pin is on the ROW: a code path that forgets to check is_demo still
#: cannot produce a live form for this studio.
DEMO_UPAY_SETTINGS: dict[str, Any] = {"livesystem": 0}

DEMO_STUDIO_SETTINGS: dict[str, Any] = {
    "upay": DEMO_UPAY_SETTINGS,
    # §5.10's two manual-payment strings. Present so the demo studio exercises the
    # payments screen's three options from M6's first day.
    "standing_order_link": "https://example.invalid/demo-standing-order",
    "cash_instructions": "שלמו למאמן בתחילת החודש (נתוני הדגמה)",
    "billing_day": 1,
}
```

- [ ] **Step 4: Author the migration**

```bash
.venv/bin/alembic revision -m "demo studio (SPEC 19.1)"
```

Then edit the generated file **through Bash** (the `block-protected.sh` hook denies
Edit/Write under `alembic/versions/`). Its `upgrade()`:

```python
def upgrade() -> None:
    # §19.1 -- the demo studio exists in production too, so a live deploy can be
    # smoke-tested against real infrastructure without touching anyone's data. A
    # migration is the only thing that runs in every environment on every deploy; a
    # seed script exists only where someone remembered to run it.
    #
    # ON CONFLICT DO NOTHING because migrations re-run against databases that already
    # have the row, and because Task 6's reset restores the row in place rather than
    # recreating it -- the studio id must survive a reset or every fixture reference
    # made after it would dangle.
    op.execute(
        sa.text(
            """
            INSERT INTO studio (id, name, slug, timezone, default_locale, status,
                                is_demo, settings, created_at, updated_at)
            VALUES (gen_random_uuid(), :name, :slug, 'Asia/Jerusalem', 'he', 'active',
                    true, CAST(:settings AS jsonb), now(), now())
            ON CONFLICT (slug) DO NOTHING
            """
        ).bindparams(
            name=DEMO_STUDIO_NAME,
            slug=DEMO_STUDIO_SLUG,
            settings=json.dumps(DEMO_STUDIO_SETTINGS, ensure_ascii=False),
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM studio WHERE slug = :slug AND is_demo").bindparams(
            slug=DEMO_STUDIO_SLUG
        )
    )
```

with `import json` and `from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG` at the top, following revision `0002`'s precedent of importing from `app` (it imports `settings`).

- [ ] **Step 5: Migrate and verify**

```bash
./scripts/dev-db.sh reset && .venv/bin/alembic upgrade head
.venv/bin/pytest tests/core/test_alembic_baseline.py -q
```

Expected: PASS. Then prove idempotence for real, not only by reading the SQL:

```bash
.venv/bin/alembic upgrade head && .venv/bin/pytest tests/core/test_alembic_baseline.py -q
```

Expected: still PASS, `count == 1`.

- [ ] **Step 6: Commit**

```bash
git add alembic/versions app/services/demo/__init__.py tests/core/test_alembic_baseline.py
git commit -m "feat(demo): the demo studio, created by migration so production has one

§19.1 needs it in production to smoke-test a live deploy. Identified by slug, so
ON CONFLICT gives idempotence for free and no magic UUID has to agree across a
migration, a service and three test files. livesystem=0 is pinned on the row."
```

---

## Task 5: The versioned fixture module — the contract every later wave appends to

**Files:**
- Create: `app/services/demo/fixtures.py`
- Create: `tests/dev/test_demo_fixtures.py`

**Interfaces:**
- Consumes: `app.services.demo.DEMO_STUDIO_NAME/SLUG/SETTINGS` (Task 4), `app.core.clock.now` (Task 2).
- Produces:
  - `app.services.demo.fixtures.FixtureLayer(name: str, milestone: str, tables: tuple[str, ...], seed: Callable[[Session, uuid.UUID], None])`
  - `app.services.demo.fixtures.PlannedLayer(name: str, milestone: str, contents: str)`
  - `app.services.demo.fixtures.StudioFixture(name: str, slug: str, settings: dict[str, Any])`
  - `app.services.demo.fixtures.FixtureSet(version: str, studio: StudioFixture, layers: tuple[FixtureLayer, ...])`
  - `app.services.demo.fixtures.SEEDS: dict[str, FixtureSet]`, `LATEST_VERSION: str`, `PLANNED_LAYERS: tuple[PlannedLayer, ...]`

**The design constraint this task exists to satisfy:** §19.3's fixture set spans M2 through M7 — ~40 students, a training year of materialized sessions, attendance history, price plans, settled and open charges, two unmatched IPNs, belt history, a competition and a belt exam. None of those tables exist. So what lands now is the **shape**: a seed addressable by version, composed of layers, with the layers §19.3 still owes recorded in `PLANNED_LAYERS` and a test asserting the two tables never disagree. A later wave moves an entry from `PLANNED_LAYERS` into `layers`; if it forgets, the gap stays visible instead of being forgotten.

- [ ] **Step 1: Write the failing test**

`tests/dev/test_demo_fixtures.py`:

```python
"""The fixture module's growth contract.

§19.3 describes a demo studio spanning M2-M7. None of those tables exist yet, so what
is asserted here is the shape and the bookkeeping: that the set is addressable by
version, that its layers are ordered and unique, and -- the load-bearing one -- that
the layers §19.3 still owes are recorded rather than remembered.

PARTIALLY VACUOUS TODAY: `LATEST.layers` holds one layer (the studio itself). It stops
being vacuous the moment M1 moves `personas` out of PLANNED_LAYERS, and
test_no_layer_is_both_planned_and_present is what makes forgetting to do so a red build
rather than a quiet omission.
"""

from __future__ import annotations

import pytest

from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SLUG
from app.services.demo.fixtures import (
    LATEST_VERSION,
    PLANNED_LAYERS,
    SEEDS,
)

MILESTONES = {f"M{n}" for n in range(12)}


def test_the_latest_version_is_addressable():
    assert LATEST_VERSION in SEEDS


def test_every_version_is_addressable_by_its_own_version_string():
    """§19.7 -- 'restores the fixture set from a versioned seed'. A dict whose keys can
    disagree with its values' version fields is not addressable, it is two facts."""
    for key, fixture_set in SEEDS.items():
        assert key == fixture_set.version


def test_the_studio_fixture_matches_the_row_the_migration_creates():
    """Revision 0003 creates the row and the fixture restores it. If those two ever
    disagree, a reset silently renames the studio."""
    studio = SEEDS[LATEST_VERSION].studio
    assert studio.slug == DEMO_STUDIO_SLUG
    assert studio.name == DEMO_STUDIO_NAME


def test_the_demo_studios_upay_config_is_pinned_in_the_fixture_too():
    """§19.6 restriction 5. The reset must not be the thing that un-pins it."""
    assert SEEDS[LATEST_VERSION].studio.settings["upay"]["livesystem"] == 0


def test_layer_names_are_unique():
    names = [layer.name for layer in SEEDS[LATEST_VERSION].layers]
    assert len(names) == len(set(names))


def test_every_layer_names_a_real_milestone():
    for layer in SEEDS[LATEST_VERSION].layers:
        assert layer.milestone in MILESTONES, layer


def test_every_planned_layer_names_a_real_milestone_and_says_what_it_holds():
    for planned in PLANNED_LAYERS:
        assert planned.milestone in MILESTONES, planned
        assert planned.contents.strip(), planned


def test_no_layer_is_both_planned_and_present():
    """The bookkeeping gate. When M1 lands the nine personas it adds a FixtureLayer and
    must remove the PlannedLayer; this is what fails if it does not, so §19.3's promise
    and the demo studio's actual contents can never quietly drift apart."""
    present = {layer.name for layer in SEEDS[LATEST_VERSION].layers}
    planned = {p.name for p in PLANNED_LAYERS}
    assert present & planned == set(), (
        f"{sorted(present & planned)} is both seeded and still listed as planned -- "
        "remove it from PLANNED_LAYERS"
    )


def test_the_full_19_3_fixture_set_is_accounted_for():
    """Every part of §19.3's paragraph is either seeded or explicitly owed. Written as
    an exact set so adding a layer without deciding where it belongs fails."""
    accounted = {layer.name for layer in SEEDS[LATEST_VERSION].layers} | {
        p.name for p in PLANNED_LAYERS
    }
    assert accounted == {
        "studio",
        "personas",
        "structure",
        "students",
        "health",
        "attendance",
        "money",
        "belts",
    }


def test_an_unknown_version_raises_rather_than_silently_seeding_the_latest():
    """A reset that quietly upgrades you to a newer fixture set is a reset that hides
    the regression you were bisecting."""
    with pytest.raises(KeyError):
        SEEDS["1999-01-01.0"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/dev/test_demo_fixtures.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.demo.fixtures'`.

- [ ] **Step 3: Write `app/services/demo/fixtures.py`**

```python
"""SPEC §19.7 -- 'POST /dev/demo/reset restores the fixture set from a versioned seed.'

§19.3's demo studio spans M2 through M7: ~40 students with Hebrew names, a full training
year of materialized sessions, partial attendance history, price plans, settled and open
charges, two unmatched IPNs, belt history, one competition and one belt exam. None of
those tables exist in M0. What lands here is therefore the **shape**, designed for
growth:

* a `FixtureSet` addressable by `version`, so a reset can restore a specific one and a
  bisect is not silently upgraded to a newer set;
* composed of `FixtureLayer`s, each owned by one milestone, so a wave appends a file's
  worth of seeding and nothing else;
* with `PLANNED_LAYERS` recording every layer §19.3 still owes, and a test asserting the
  two lists never overlap -- so the distance between what the spec promises and what the
  demo studio actually contains is visible in the code rather than remembered.

Adding a layer is: write `seed`, append a `FixtureLayer`, delete the matching
`PlannedLayer`, bump `version`. The reset needs no change -- it wipes from
`Base.metadata` (see service.py), so a table added by a later wave is cleaned the day it
lands.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.studio import Studio
from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG


@dataclass(frozen=True)
class StudioFixture:
    """The tenant root's own restorable state. Not a layer: the row is restored in
    place, never deleted, so every id created against it survives a reset."""

    name: str
    slug: str
    settings: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FixtureLayer:
    """One milestone's worth of demo data.

    `tables` is documentation with teeth: the reset asserts it can actually reach every
    table a layer claims, so a layer that seeds a table nobody wipes is a red build
    rather than data that survives a reset and hides a bug.
    """

    name: str
    milestone: str
    tables: tuple[str, ...]
    seed: Callable[[Session, uuid.UUID], None]


@dataclass(frozen=True)
class PlannedLayer:
    """A layer §19.3 promises and the schema cannot yet hold."""

    name: str
    milestone: str
    contents: str


def _seed_studio(session: Session, studio_id: uuid.UUID) -> None:
    """Restore the tenant root in place.

    An UPDATE and not a DELETE + INSERT: revision 0003 created this row and everything
    a later layer seeds references its id. Recreating it would either dangle every
    reference or force every fixture to be written against a UUID that changes on every
    reset.
    """
    session.execute(
        update(Studio)
        .where(Studio.id == studio_id)
        .values(
            name=DEMO_STUDIO_NAME,
            slug=DEMO_STUDIO_SLUG,
            settings=DEMO_STUDIO_SETTINGS,
            is_demo=True,
            status="active",
        )
        .execution_options(with_all_tenants=True)
    )


#: Bump on any change to a layer's contents. Date-ordinal rather than a bare integer, so
#: a reset log line says when the data it restored was authored.
V_2026_08_24 = FixtureSet_ = None  # placeholder replaced below; see FixtureSet


@dataclass(frozen=True)
class FixtureSet:
    version: str
    studio: StudioFixture
    layers: tuple[FixtureLayer, ...]


_V1 = FixtureSet(
    version="2026-08-24.1",
    studio=StudioFixture(
        name=DEMO_STUDIO_NAME, slug=DEMO_STUDIO_SLUG, settings=DEMO_STUDIO_SETTINGS
    ),
    layers=(
        FixtureLayer(
            name="studio",
            milestone="M0",
            tables=("studio",),
            seed=_seed_studio,
        ),
    ),
)

SEEDS: dict[str, FixtureSet] = {_V1.version: _V1}
LATEST_VERSION: str = _V1.version

#: §19.3 in full, and the milestone that lands each part. An entry moves into
#: `_V1.layers` (and out of here) when its milestone's models exist.
PLANNED_LAYERS: tuple[PlannedLayer, ...] = (
    PlannedLayer("personas", "M1", "the nine §19.3 personas, their auth identities, role assignments and guardian links"),
    PlannedLayer("structure", "M2", "2 classes, 5 groups, schedule rules, one training year, holiday closures"),
    PlannedLayer("students", "M3", "~40 students with Hebrew names, enrollments, one trial booking, one lead"),
    PlannedLayer("health", "M4", "signed, trial-signed and missing declarations across the roster"),
    PlannedLayer("attendance", "M5", "a full training year of materialized sessions and partial attendance history"),
    PlannedLayer("money", "M6", "price plans, settled and open charges, and two unmatched IPNs"),
    PlannedLayer("belts", "M7", "belt history, one competition and one belt exam"),
)
```

**Note:** delete the `V_2026_08_24 = FixtureSet_ = None` placeholder line — it is shown
above only to mark where `FixtureSet` is defined relative to `_V1`; move the `FixtureSet`
dataclass above `_seed_studio` and drop the line entirely.

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/dev/test_demo_fixtures.py -q`
Expected: PASS — 10 tests.

- [ ] **Step 5: Prove the bookkeeping gate bites**

Temporarily add `FixtureLayer(name="personas", milestone="M1", tables=("person",), seed=_seed_studio)` to `_V1.layers`:

```bash
.venv/bin/pytest tests/dev/test_demo_fixtures.py::test_no_layer_is_both_planned_and_present -q
```

Expected: FAIL — `['personas'] is both seeded and still listed as planned`. Revert.

- [ ] **Step 6: Commit**

```bash
git add app/services/demo/fixtures.py tests/dev/test_demo_fixtures.py
git commit -m "feat(demo): the versioned fixture set, and the layers 19.3 still owes

The shape is what lands now: addressable by version, composed of per-milestone
layers, with PLANNED_LAYERS recording the rest and a test that the two lists never
overlap. A wave that forgets to move an entry gets a red build, not a quiet gap."
```

---

## Task 6: `DemoStudioService` — a reset derived from the schema, not from a list

**Files:**
- Create: `app/services/demo/service.py`
- Create: `tests/dev/test_demo_service.py`

**Interfaces:**
- Consumes: `FixtureSet`, `SEEDS`, `LATEST_VERSION` (Task 5), `app.core.tenancy.use_studio`, `app.models.base.Base`, `app.services.audit.AuditService`.
- Produces:
  - `app.services.demo.service.DemoStudioService.studio_id(session: Session) -> uuid.UUID`
  - `app.services.demo.service.DemoStudioService.wipe(session: Session, studio_id: uuid.UUID) -> list[str]` — returns the table names it emptied, in the order it emptied them
  - `app.services.demo.service.DemoStudioService.seed(session: Session, *, version: str = LATEST_VERSION) -> str`
  - `app.services.demo.service.DemoStudioService.reset(session: Session, *, version: str = LATEST_VERSION) -> DemoResetResult`
  - `app.services.demo.service.DemoResetResult(version: str, tables_wiped: tuple[str, ...], layers_seeded: tuple[str, ...])`
  - `app.services.demo.service.NEVER_WIPED: frozenset[str]`
  - `app.services.demo.service.NotADemoStudioError`

- [ ] **Step 1: Write the failing test**

`tests/dev/test_demo_service.py`:

```python
"""§19.7 -- 'POST /dev/demo/reset restores the fixture set from a versioned seed.'

The property worth testing is not "reset ran". It is that the wipe is derived from
Base.metadata rather than from a list someone has to remember to extend -- because a
reset that leaves a later wave's rows behind is worse than no reset at all: it hides
exactly the stale-state bugs it exists to prevent, and it does so silently.
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Session

from app.models.base import Base
from app.services.demo import DEMO_STUDIO_SLUG
from app.services.demo.fixtures import LATEST_VERSION
from app.services.demo.service import (
    NEVER_WIPED,
    DemoStudioService,
    NotADemoStudioError,
)


@pytest.fixture
def session(migrated) -> Session:
    with Session(migrated) as s:
        yield s


def test_the_demo_studio_is_found_by_slug(session):
    assert isinstance(DemoStudioService.studio_id(session), uuid.UUID)


def test_reset_restores_the_studio_row_after_it_is_edited(session):
    studio_id = DemoStudioService.studio_id(session)
    session.execute(
        sa.text("UPDATE studio SET name = 'wrecked' WHERE id = :id"), {"id": studio_id}
    )
    session.commit()

    DemoStudioService.reset(session)
    session.commit()

    name = session.execute(
        sa.text("SELECT name FROM studio WHERE id = :id"), {"id": studio_id}
    ).scalar_one()
    assert name != "wrecked"


def test_reset_keeps_the_studio_id_stable(session):
    """Every fixture reference made after a reset points at this id. Recreating the row
    would either dangle them or force every fixture to be written against a UUID that
    changes on every reset."""
    before = DemoStudioService.studio_id(session)
    DemoStudioService.reset(session)
    session.commit()
    assert DemoStudioService.studio_id(session) == before


def test_reset_reports_the_version_it_restored(session):
    assert DemoStudioService.reset(session).version == LATEST_VERSION


def test_an_unknown_version_raises_rather_than_falling_back(session):
    with pytest.raises(KeyError):
        DemoStudioService.reset(session, version="1999-01-01.0")


def test_the_wipe_is_derived_from_the_schema_not_from_a_list():
    """The growth property, asserted against a synthetic table rather than a real one --
    no tenant-scoped table exists in M0 to test with, and inventing a real model to test
    the wipe would put a fake table in every migration from here on.

    This is the assertion that keeps working in M2, M4 and M6 without anyone editing
    this file.
    """
    probe = Table(
        "probe_tenant_table",
        Base.metadata,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), nullable=False),
    )
    try:
        assert "probe_tenant_table" in DemoStudioService.wipe_plan()
    finally:
        Base.metadata.remove(probe)


def test_the_audit_log_is_never_wiped():
    """§11.2 -- audit_log is append-only BY GRANT: the application role holds INSERT and
    SELECT and nothing else, so a wipe that tried would raise a Postgres permission
    error rather than a readable one. It is also evidence: the demo studio's own record
    of who switched persona is not scratch data."""
    assert "audit_log" in NEVER_WIPED
    assert "audit_log" not in DemoStudioService.wipe_plan()


def test_the_studio_row_itself_is_never_wiped():
    assert "studio" in NEVER_WIPED
    assert "studio" not in DemoStudioService.wipe_plan()


def test_the_wipe_plan_deletes_children_before_parents():
    """A wipe in metadata order hits a foreign key and fails halfway, leaving the demo
    studio in a state no fixture describes."""
    plan = DemoStudioService.wipe_plan()
    ordered = [t.name for t in Base.metadata.sorted_tables if t.name in plan]
    assert plan == list(reversed(ordered))


def test_reset_refuses_a_studio_that_is_not_a_demo_studio(session):
    """The single most dangerous thing in this module is a wipe pointed at the wrong
    studio. It takes a studio_id, so it must check."""
    real = uuid.uuid4()
    session.execute(
        sa.text(
            "INSERT INTO studio (id, name, slug, timezone, default_locale, status, "
            "is_demo, settings, created_at, updated_at) VALUES "
            "(:id, 'Real Club', :slug, 'Asia/Jerusalem', 'he', 'active', false, "
            "'{}'::jsonb, now(), now())"
        ),
        {"id": real, "slug": f"real-{real.hex[:8]}"},
    )
    session.commit()

    with pytest.raises(NotADemoStudioError):
        DemoStudioService.wipe(session, real)

    session.execute(sa.text("DELETE FROM studio WHERE id = :id"), {"id": real})
    session.commit()


def test_the_demo_slug_is_the_one_the_migration_used(session):
    slug = session.execute(
        sa.text("SELECT slug FROM studio WHERE id = :id"),
        {"id": DemoStudioService.studio_id(session)},
    ).scalar_one()
    assert slug == DEMO_STUDIO_SLUG
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/dev/test_demo_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.demo.service'`.

- [ ] **Step 3: Write `app/services/demo/service.py`**

```python
"""§19.7 -- restoring the demo studio from a versioned seed.

**The wipe is derived from `Base.metadata`, not from a list.** Every table carrying a
`studio_id` column is emptied for this studio, deepest dependency first. A list would be
a list someone forgets to extend when M4 adds `health_declaration`, and a reset that
leaves rows behind is worse than none: it hides exactly the stale-state bugs §19.7 exists
to prevent, and it hides them quietly.

Two tables are never wiped, each for its own reason -- see NEVER_WIPED.

G6: this is a service. The router parses, calls it, and returns.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import Table, delete, select
from sqlalchemy.orm import Session

from app.core.tenancy import use_studio
from app.models.base import Base
from app.models.studio import Studio
from app.services.demo import DEMO_STUDIO_SLUG
from app.services.demo.fixtures import LATEST_VERSION, SEEDS

logger = logging.getLogger(__name__)

#: Neither of these is an oversight.
NEVER_WIPED = frozenset(
    {
        # §11.2 -- append-only BY GRANT. The application role holds INSERT and SELECT
        # and nothing else, so a DELETE here raises a Postgres permission error rather
        # than a readable one. It is also evidence: §19.4 audit-logs every persona
        # switch to the demo studio's own log, and evidence is not scratch data.
        "audit_log",
        # The tenant root is restored in place by the `studio` fixture layer. Deleting
        # it would change the studio id on every reset and dangle every reference a
        # later layer made.
        "studio",
    }
)


class NotADemoStudioError(RuntimeError):
    """Raised when a wipe is pointed at a studio holding real people."""


@dataclass(frozen=True)
class DemoResetResult:
    version: str
    tables_wiped: tuple[str, ...]
    layers_seeded: tuple[str, ...]


class DemoStudioService:
    @staticmethod
    def studio_id(session: Session) -> uuid.UUID:
        """The demo studio's id, looked up by the slug revision 0003 inserted."""
        return session.execute(
            select(Studio.id)
            .where(Studio.slug == DEMO_STUDIO_SLUG)
            .execution_options(with_all_tenants=True)
        ).scalar_one()

    @staticmethod
    def wipe_plan() -> list[str]:
        """Every tenant-scoped table, children first.

        `Base.metadata.sorted_tables` is parents-first (creation order), so deletion is
        its reverse. Computed on every call rather than cached at import: seam 2's
        discovery loop populates the metadata when `app.models` is imported, and a
        module-level constant would freeze whatever happened to be imported first.
        """
        return [
            table.name
            for table in reversed(Base.metadata.sorted_tables)
            if "studio_id" in table.c and table.name not in NEVER_WIPED
        ]

    @staticmethod
    def wipe(session: Session, studio_id: uuid.UUID) -> list[str]:
        """Empty every tenant-scoped table for this studio.

        Refuses a non-demo studio. The check is not decoration: this function takes a
        studio_id, and the single most damaging thing in this module is a wipe pointed
        at a real club.
        """
        is_demo = session.execute(
            select(Studio.is_demo)
            .where(Studio.id == studio_id)
            .execution_options(with_all_tenants=True)
        ).scalar_one_or_none()
        if is_demo is not True:
            raise NotADemoStudioError(
                f"studio {studio_id} is not a demo studio; refusing to wipe it "
                "(§19.7 -- the reset exists for a studio that contains no real people)"
            )

        wiped: list[str] = []
        tables: dict[str, Table] = {t.name: t for t in Base.metadata.sorted_tables}
        for name in DemoStudioService.wipe_plan():
            table = tables[name]
            session.execute(
                delete(table)
                .where(table.c.studio_id == studio_id)
                .execution_options(with_all_tenants=True)
            )
            wiped.append(name)
        return wiped

    @staticmethod
    def seed(session: Session, *, version: str = LATEST_VERSION) -> tuple[str, ...]:
        """Apply every layer of one fixture set, in declaration order.

        `SEEDS[version]` raises KeyError on an unknown version deliberately: a reset
        that quietly upgrades you to a newer fixture set is a reset that hides the
        regression you were bisecting.
        """
        fixture_set = SEEDS[version]
        studio_id = DemoStudioService.studio_id(session)
        seeded: list[str] = []
        # The seed runs inside the studio it is seeding, so TenantMixin's before_flush
        # stamps studio_id on every row a layer creates and refuses one that targets a
        # different studio. `with_all_tenants` is deliberately NOT used: the escape
        # hatch is for cross-studio work, and this is the opposite of that.
        with use_studio(studio_id):
            for layer in fixture_set.layers:
                layer.seed(session, studio_id)
                seeded.append(layer.name)
        return tuple(seeded)

    @staticmethod
    def reset(session: Session, *, version: str = LATEST_VERSION) -> DemoResetResult:
        fixture_set = SEEDS[version]
        studio_id = DemoStudioService.studio_id(session)
        wiped = DemoStudioService.wipe(session, studio_id)
        seeded = DemoStudioService.seed(session, version=version)
        # Logged as `extra`, never interpolated -- an f-string has no key for the
        # scrubber to match (app/core/logging.py).
        logger.info(
            "demo studio reset",
            extra={"demo_version": version, "tables_wiped": wiped, "layers": list(seeded)},
        )
        return DemoResetResult(
            version=fixture_set.version, tables_wiped=tuple(wiped), layers_seeded=seeded
        )
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/dev/test_demo_service.py -q`
Expected: PASS — 11 tests.

- [ ] **Step 5: Prove the growth property bites**

Temporarily replace `wipe_plan`'s body with a hardcoded `return []`:

```bash
.venv/bin/pytest tests/dev/test_demo_service.py::test_the_wipe_is_derived_from_the_schema_not_from_a_list -q
```

Expected: FAIL. Restore. Then temporarily remove `"audit_log"` from `NEVER_WIPED` and run
the whole file: expected FAIL on `test_the_audit_log_is_never_wiped`. Restore.

- [ ] **Step 6: Commit**

```bash
git add app/services/demo/service.py tests/dev/test_demo_service.py
git commit -m "feat(demo): reset derived from Base.metadata, not from a table list

A list is a list someone forgets to extend when M4 adds health_declaration, and a
reset that leaves rows behind hides the stale-state bugs it exists to prevent. Two
exclusions, each with its reason: audit_log is append-only by grant, and the studio
row is restored in place so its id survives."
```

---

## Task 7: `POST /dev/demo/reset`

**Files:**
- Modify: `app/routers/dev.py`, `app/schemas/dev.py`
- Modify: `tests/dev/test_dev_router.py`

**Interfaces:**
- Consumes: `DemoStudioService` (Task 6), `RequireDeveloper` (Task 1).
- Produces:
  - `POST /api/v1/dev/demo/reset` with optional body `DemoResetRequest(version: str | None = None)` → `DemoResetResponse(version, tables_wiped, layers_seeded)`
  - `app.core.db.get_session() -> Iterator[Session]` — an **unscoped** session dependency, because the reset spans the wipe and the re-seed and must not be filtered by the tenant loader

- [ ] **Step 1: Write the failing test**

Append to `tests/dev/test_dev_router.py`:

```python
# -- POST /dev/demo/reset -----------------------------------------------------
def test_reset_returns_the_version_it_restored(migrated):
    with app_in_env("development") as application:
        body = TestClient(application).post("/api/v1/dev/demo/reset").json()
    assert body["version"] == LATEST_VERSION
    assert "studio" in body["layers_seeded"]


def test_reset_accepts_an_explicit_version(migrated):
    with app_in_env("development") as application:
        response = TestClient(application).post(
            "/api/v1/dev/demo/reset", json={"version": LATEST_VERSION}
        )
    assert response.status_code == 200


def test_reset_rejects_an_unknown_version_with_a_422_not_a_500(migrated):
    """An unknown version is a caller mistake, not a server fault. A 500 here would
    also mean a stack trace in the response, which .claude/rules/api.md forbids."""
    with app_in_env("development") as application:
        response = TestClient(application).post(
            "/api/v1/dev/demo/reset", json={"version": "1999-01-01.0"}
        )
    assert response.status_code == 422


def test_reset_does_not_exist_in_production(migrated):
    with app_in_env("production") as application:
        assert TestClient(application).post("/api/v1/dev/demo/reset").status_code == 404
```

with `from app.services.demo.fixtures import LATEST_VERSION` added at the top.

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/dev/test_dev_router.py -q`
Expected: FAIL — 404 on `/api/v1/dev/demo/reset` in development.

- [ ] **Step 3: Add the unscoped session dependency**

In `app/core/db.py`:

```python
def get_session() -> Iterator[Session]:
    """A plain, **unscoped** session.

    Deliberately not TenantSession: this is for work that legitimately spans studios or
    runs before one is resolved -- the demo reset, migrations-adjacent tooling,
    platform-admin jobs. Every request-scoped path uses TenantSessionDep from
    app.core.tenancy instead, which fails closed. Making them different types is what
    stops the unscoped one being reached for by habit.
    """
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
```

with the matching imports (`Annotated`, `Iterator`, `Depends`, `Session`).

- [ ] **Step 4: Add the schemas and the route**

In `app/schemas/dev.py`:

```python
class DemoResetRequest(BaseModel):
    #: Omitted means "the latest set". Naming one pins a bisect to the data it was
    #: authored against.
    version: str | None = None


class DemoResetResponse(BaseModel):
    version: str
    tables_wiped: list[str]
    layers_seeded: list[str]
```

In `app/routers/dev.py`:

```python
@router.post("/demo/reset", response_model=DemoResetResponse)
def reset_demo_studio(
    _: RequireDeveloper,
    session: SessionDep,
    body: DemoResetRequest | None = None,
) -> DemoResetResponse:
    """§19.7 -- restore the fixture set from a versioned seed."""
    version = (body.version if body else None) or LATEST_VERSION
    if version not in SEEDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unknown_fixture_version",
                "message": f"no fixture set {version!r}",
                "details": {"available": sorted(SEEDS)},
            },
        )
    result = DemoStudioService.reset(session, version=version)
    session.commit()
    return DemoResetResponse(
        version=result.version,
        tables_wiped=list(result.tables_wiped),
        layers_seeded=list(result.layers_seeded),
    )
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/dev -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/dev.py app/schemas/dev.py app/core/db.py tests/dev/test_dev_router.py
git commit -m "feat(dev): POST /dev/demo/reset

An unknown version is a 422, never a fallback to the latest -- a reset that quietly
upgrades your fixture set is a reset that hides the regression you were bisecting."
```

---

## Task 8: The nightly staging reset

**Files:**
- Create: `app/workers/__init__.py`, `app/workers/demo_reset.py`
- Create: `infra/railway/jobs.json`
- Create: `tests/config/test_jobs_config.py`
- Modify: `docs/deploy/railway-runbook.md`

**Interfaces:**
- Consumes: `DemoStudioService.reset` (Task 6), `app.core.db.get_engine`.
- Produces: `app.workers.demo_reset.main() -> int` — process exit code; `0` reset, `1` refused.

**Why it refuses everywhere but staging:** §19.7 puts the nightly reset in staging and names no other environment. In production the demo studio is a smoke-test target you may have deliberately left mid-flow; in development it is your own scratch data and wiping it overnight is hostile. **Refusing is most of the job**, so it is what the tests are about.

- [ ] **Step 1: Write the failing test**

`tests/config/test_jobs_config.py`:

```python
"""§19.7 -- 'a nightly job does the same in staging so the data never drifts into a
state that hides a bug.'

Two halves, and the second is the one that rots: the job must exist, and the schedule
that invokes it must point at something real. A declared cron entry naming a module
nobody wrote is a job that silently never runs, which is the same failure mode as a
lint rule scoped to a path that matches nothing (M0.1 found three).
"""

from __future__ import annotations

import importlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / "infra/railway/jobs.json"

CRON = re.compile(r"^\S+ \S+ \S+ \S+ \S+$")


def _jobs() -> list[dict]:
    return json.loads(JOBS.read_text(encoding="utf-8"))["jobs"]


def test_the_demo_reset_job_is_declared():
    assert [job for job in _jobs() if job["name"] == "demo-reset"]


def test_the_demo_reset_runs_in_staging_and_nowhere_else():
    job = next(job for job in _jobs() if job["name"] == "demo-reset")
    assert job["environment"] == "staging"


def test_every_job_has_a_five_field_cron_schedule():
    for job in _jobs():
        assert CRON.match(job["schedule"]), job


def test_every_declared_command_points_at_a_module_that_exists():
    """The anti-rot gate. `python -m app.workers.demo_reset` in a dashboard field is
    not checked by anything -- a rename lands green and the job stops running."""
    for job in _jobs():
        match = re.fullmatch(r"python -m ([\w.]+)", job["command"])
        assert match, f"{job['name']}: command must be `python -m <module>`, got {job['command']!r}"
        module = importlib.import_module(match.group(1))
        assert callable(module.main), f"{job['name']}: {match.group(1)}.main is not callable"


def test_every_job_cites_the_spec_section_that_asks_for_it():
    for job in _jobs():
        assert job["spec"].startswith("SPEC §"), job
```

`tests/dev/test_demo_reset_worker.py`:

```python
"""The worker's refusals. §19.7 names staging and no other environment."""

from __future__ import annotations

import app.workers.demo_reset as worker


def test_it_refuses_to_run_in_production(monkeypatch):
    """In production the demo studio is a smoke-test target you may have deliberately
    left mid-flow. An overnight job that wipes it destroys the evidence you left."""
    monkeypatch.setattr(worker.settings, "ENV", "production", raising=False)
    assert worker.main() == 1


def test_it_refuses_to_run_in_development(monkeypatch):
    """In development it is your own scratch data."""
    monkeypatch.setattr(worker.settings, "ENV", "development", raising=False)
    assert worker.main() == 1


def test_it_runs_in_staging(monkeypatch, migrated):
    monkeypatch.setattr(worker.settings, "ENV", "staging", raising=False)
    assert worker.main() == 0
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/config/test_jobs_config.py tests/dev/test_demo_reset_worker.py -q`
Expected: FAIL — `infra/railway/jobs.json` missing, `app.workers` missing.

- [ ] **Step 3: Write the worker**

`app/workers/__init__.py`: empty.

`app/workers/demo_reset.py`:

```python
"""§19.7 -- the nightly demo reset.

'POST /dev/demo/reset restores the fixture set from a versioned seed, and a nightly job
does the same in staging so the data never drifts into a state that hides a bug.'

Staging and nowhere else, and the refusal is most of the job:

* **production** -- the demo studio there is a smoke-test target you may have
  deliberately left mid-flow. An overnight wipe destroys the evidence you left.
* **development** -- it is your own scratch data.

Run as `python -m app.workers.demo_reset`. The schedule is declared once, in
infra/railway/jobs.json, and tests/config/test_jobs_config.py asserts this module is
what it points at.
"""

from __future__ import annotations

import logging
import sys

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.services.demo.service import DemoStudioService

logger = logging.getLogger(__name__)

ALLOWED_ENV = "staging"


def main() -> int:
    configure_logging()
    if settings.ENV != ALLOWED_ENV:
        logger.warning(
            "refusing to reset the demo studio outside staging",
            extra={"env": settings.ENV, "allowed": ALLOWED_ENV},
        )
        return 1

    with Session(get_engine(), expire_on_commit=False) as session:
        result = DemoStudioService.reset(session)
        session.commit()

    logger.info(
        "nightly demo reset complete",
        extra={"demo_version": result.version, "layers": list(result.layers_seeded)},
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Write `infra/railway/jobs.json`**

```json
{
  "$comment": "Scheduled jobs, declared in one place so a rename cannot silently stop one. Railway's cron is configured in the dashboard per service; this file is the source of truth that tests/config/test_jobs_config.py checks the commands against, and docs/deploy/railway-runbook.md records the dashboard step.",
  "jobs": [
    {
      "name": "demo-reset",
      "environment": "staging",
      "schedule": "0 2 * * *",
      "command": "python -m app.workers.demo_reset",
      "spec": "SPEC §19.7",
      "why": "So the demo data never drifts into a state that hides a bug. 02:00 Asia/Jerusalem is after any evening session a coach might have been testing against."
    }
  ]
}
```

- [ ] **Step 5: Record the manual half in the runbook**

Append to `docs/deploy/railway-runbook.md`:

```markdown
## Scheduled jobs

[`infra/railway/jobs.json`](../../infra/railway/jobs.json) is the source of truth for
what runs on a schedule and why; `tests/config/test_jobs_config.py` asserts every
declared command points at a module that exists, so a rename fails the build rather
than silently stopping a job.

**Still manual:** Railway's cron is configured per service in the dashboard. Create a
cron service in the `staging` environment for each entry in that file, using its
`schedule` and `command` verbatim. This is the one half of the mechanism a test cannot
reach — if the dashboard and the file disagree, the file is right.
```

- [ ] **Step 6: Run to verify they pass**

Run: `.venv/bin/pytest tests/config/test_jobs_config.py tests/dev/test_demo_reset_worker.py -q`
Expected: PASS.

- [ ] **Step 7: Prove the anti-rot gate bites**

Temporarily change the declared command to `python -m app.workers.demo_resett`:

```bash
.venv/bin/pytest tests/config/test_jobs_config.py::test_every_declared_command_points_at_a_module_that_exists -q
```

Expected: FAIL — `ModuleNotFoundError`. Revert.

- [ ] **Step 8: Commit**

```bash
git add app/workers infra/railway/jobs.json tests/config/test_jobs_config.py tests/dev/test_demo_reset_worker.py docs/deploy/railway-runbook.md
git commit -m "feat(demo): the nightly staging reset, and a gate on the command it declares

Refusing outside staging is most of the job: in production the demo studio is a
smoke-test target you may have left mid-flow. A cron entry naming a module nobody
wrote is a job that silently never runs, so the declaration is tested."
```

---

## Task 9: The §19.7 exclusion — one shared helper, so no later report has to remember

**Files:**
- Create: `app/core/demo.py`
- Create: `tests/restrictions/test_19_7_demo_data_hygiene.py`

**Interfaces:**
- Consumes: `app.models.studio.Studio`.
- Produces:
  - `app.core.demo.exclude_demo_studios(stmt: Select[Any], studio_id_column: ColumnElement[uuid.UUID]) -> Select[Any]`
  - `app.core.demo.non_demo_studio_ids() -> Select[Any]`
  - `app.core.demo.CROSS_STUDIO_CALLERS: dict[str, str]` — the allowlist of `with_all_tenants` call sites and why each is exempt

**Note on the file name:** this is `test_19_7_...`, not `test_06_...`. §19.6 has exactly five restrictions and the exit gate counts them; demo-data hygiene is §19.7 and is named after its own section so nobody miscounts.

- [ ] **Step 1: Write the failing test**

`tests/restrictions/test_19_7_demo_data_hygiene.py`:

```python
"""§19.7 -- 'The demo studio is excluded from platform_studio_stats, from every
cross-studio report and from the operations board totals (§18.3), so it never
contaminates the numbers you use to judge real studios.'

The helper is built now so that no later report has to remember. Two kinds of assertion
here, and the docstrings say which is which:

* The helper's own behaviour -- NOT VACUOUS. The demo studio exists today, so the
  filter is asserted against a real row.
* The detector over cross-studio call sites -- VACUOUS TODAY. `platform_studio_stats`
  is M9's and the operations board is M9's; the only `with_all_tenants` call sites in
  M0 are the demo service's own. It bites the moment M9 lands a report, which is
  exactly when it must.
"""

from __future__ import annotations

import re
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.demo import CROSS_STUDIO_CALLERS, exclude_demo_studios
from app.models.studio import Studio

ROOT = Path(__file__).resolve().parents[2]


def test_the_filter_removes_the_demo_studio(migrated):
    with Session(migrated) as session:
        stmt = exclude_demo_studios(
            select(Studio.slug).execution_options(with_all_tenants=True), Studio.id
        )
        slugs = set(session.execute(stmt).scalars())
    assert "demo" not in slugs


def test_the_unfiltered_query_would_have_included_it(migrated):
    """The control. Without it, `demo not in slugs` is satisfied just as happily by a
    query that returns nothing at all."""
    with Session(migrated) as session:
        slugs = set(
            session.execute(
                select(Studio.slug).execution_options(with_all_tenants=True)
            ).scalars()
        )
    assert "demo" in slugs


def test_the_filter_keeps_real_studios(migrated):
    import uuid

    real = uuid.uuid4()
    with Session(migrated) as session:
        session.execute(
            sa.text(
                "INSERT INTO studio (id, name, slug, timezone, default_locale, status, "
                "is_demo, settings, created_at, updated_at) VALUES "
                "(:id, 'Real Club', :slug, 'Asia/Jerusalem', 'he', 'active', false, "
                "'{}'::jsonb, now(), now())"
            ),
            {"id": real, "slug": f"real-{real.hex[:8]}"},
        )
        session.commit()
        stmt = exclude_demo_studios(
            select(Studio.id).execution_options(with_all_tenants=True), Studio.id
        )
        found = set(session.execute(stmt).scalars())
        session.execute(sa.text("DELETE FROM studio WHERE id = :id"), {"id": real})
        session.commit()
    assert real in found


def test_every_cross_studio_call_site_is_accounted_for():
    """VACUOUS TODAY -- the only with_all_tenants call sites in M0 are the demo
    service's own and the tenancy module that defines the hatch.

    It bites in M9, when platform_studio_stats and the operations board land: a report
    that reaches across studios must either apply exclude_demo_studios or be listed in
    CROSS_STUDIO_CALLERS with a reason. Source-level by necessity -- 'this query
    excluded the demo studio' is not observable without executing every report against
    a seeded database, and a gate that needs M9's data to run is a gate M9 turns off.
    """
    pattern = re.compile(r"with_all_tenants")
    unaccounted = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        rel = str(path.relative_to(ROOT))
        if rel in CROSS_STUDIO_CALLERS:
            continue
        text = path.read_text(encoding="utf-8")
        if pattern.search(text) and "exclude_demo_studios" not in text:
            unaccounted.append(rel)
    assert unaccounted == [], (
        "these reach across studios without excluding the demo studio (§19.7). Apply "
        "exclude_demo_studios, or add the file to CROSS_STUDIO_CALLERS with the reason "
        f"it is exempt: {unaccounted}"
    )


def test_every_allowlisted_caller_still_exists_and_carries_a_reason():
    """An allowlist entry for a deleted file is an exemption nobody notices growing
    stale -- and the next file with that path inherits it."""
    for rel, reason in CROSS_STUDIO_CALLERS.items():
        assert (ROOT / rel).exists(), f"{rel} is allowlisted but does not exist"
        assert reason.strip(), rel
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/restrictions/test_19_7_demo_data_hygiene.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.demo'`.

- [ ] **Step 3: Write `app/core/demo.py`**

```python
"""§19.7 -- the demo studio never contaminates a cross-studio number.

'The demo studio is excluded from platform_studio_stats, from every cross-studio report
and from the operations board totals (§18.3), so it never contaminates the numbers you
use to judge real studios.'

One helper, built in M0, so that no report written in M9 has to remember. The
alternative -- each report adding its own `WHERE NOT is_demo` -- fails the first time
someone forgets, and it fails quietly: the operations board simply reads one studio
higher than reality and nobody notices for a month.

It takes the studio-id column rather than assuming a shape, because a report's
`studio_id` is usually on the aggregate row (`platform_studio_stats.studio_id`), not on
a joined `studio` table.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, select

from app.models.studio import Studio


def non_demo_studio_ids() -> Select[Any]:
    """Every studio a cross-studio number may legitimately count."""
    return select(Studio.id).where(Studio.is_demo.is_(False))


def exclude_demo_studios(
    stmt: Select[Any], studio_id_column: ColumnElement[uuid.UUID]
) -> Select[Any]:
    """Restrict a cross-studio query to studios holding real people.

    A subquery rather than a join: the caller has already built their own joins, and a
    helper that adds one changes their row count. `IN (SELECT ...)` composes with
    anything.
    """
    return stmt.where(studio_id_column.in_(non_demo_studio_ids()))


#: Files that legitimately reach across studios without excluding the demo studio, and
#: the reason each is exempt. tests/restrictions/test_19_7_demo_data_hygiene.py asserts
#: every other file that touches the escape hatch applies the helper.
CROSS_STUDIO_CALLERS: dict[str, str] = {
    "app/core/tenancy.py": (
        "defines with_all_tenants; it is the escape hatch, not a caller of it"
    ),
    "app/core/demo.py": "this file -- it is the exclusion",
    "app/services/demo/service.py": (
        "the demo reset operates ON the demo studio by definition; excluding it would "
        "make the reset a no-op"
    ),
    "app/services/demo/fixtures.py": (
        "seeds the demo studio's own tenant root, for the same reason"
    ),
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/restrictions/test_19_7_demo_data_hygiene.py -q`
Expected: PASS — 5 tests.

- [ ] **Step 5: Prove the detector bites**

Create a throwaway `app/services/probe_report.py` containing
`from app.core.tenancy import with_all_tenants` and a function that uses it:

```bash
.venv/bin/pytest tests/restrictions/test_19_7_demo_data_hygiene.py::test_every_cross_studio_call_site_is_accounted_for -q
```

Expected: FAIL — `['app/services/probe_report.py']`. Delete the probe with
`git clean -f app/services/probe_report.py` and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add app/core/demo.py tests/restrictions/test_19_7_demo_data_hygiene.py
git commit -m "feat(demo): one exclusion helper, so no later report has to remember

Each report adding its own WHERE NOT is_demo fails the first time someone forgets,
and fails quietly -- the operations board reads one studio higher than reality and
nobody notices for a month. The detector is vacuous until M9 and says so."
```

---

## Task 10: The `livesystem` pin — a demo studio can never render a live payment form

**Files:**
- Create: `app/integrations/upay/__init__.py`, `app/integrations/upay/form.py`
- Create: `tests/restrictions/test_05_no_live_money.py`

**Interfaces:**
- Consumes: `app.models.studio.Studio`.
- Produces:
  - `app.integrations.upay.form.upay_form_fields(*, studio: Studio, order_public_ref: uuid.UUID, expected_amount_agorot: int, max_payments: int, merchant_email: str, return_url: str, ipn_url: str) -> dict[str, str]`
  - `app.integrations.upay.form.UPAY_ENDPOINT`, `LIVE`, `SANDBOX`
  - `app.integrations.upay.form.shekels(amount_agorot: int) -> str`

**What is a shell today, stated plainly:** M6 owns `payment_order`, the `/payment-orders/{public_ref}/form` route and the IPN endpoint. What lands here is the **field builder** — the one function that decides `livesystem` — because §19.6's fifth restriction is a test that a demo studio can never render a live form, and there is nothing to assert until something builds the fields. M6 calls this function; it does not write its own.

**The agorot boundary.** `upay-integration.md` shows `assert order.amount == float(request.args['amount'])`. That snippet is not followed: SPEC §4.3 stores `expected_amount_agorot INTEGER` and invariant 1 fails the build on a float money column (G2). The conversion to uPay's decimal-shekel field happens **here and nowhere else**, in integer arithmetic, and the result is a string.

- [ ] **Step 1: Write the failing test**

`tests/restrictions/test_05_no_live_money.py`:

```python
"""§19.6 restriction 5: the developer account cannot touch live money.

'The demo studio's uPay configuration is pinned to livesystem=0 and a test asserts a
demo studio can never render a live payment form.'

NOT VACUOUS for the pin itself -- the field builder exists and the demo studio row
exists, so both ends are assertable today.

PARTIALLY VACUOUS for coverage: M6 owns the route that renders the form. The final test
in this file is the gate that keeps the pin load-bearing when it lands -- it asserts no
other module in app/ writes a `livesystem` field, so M6 must call this builder rather
than assembling its own dict.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from app.integrations.upay.form import LIVE, SANDBOX, shekels, upay_form_fields
from app.models.studio import Studio

ROOT = Path(__file__).resolve().parents[2]

COMMON = {
    "order_public_ref": uuid.UUID("11111111-1111-4111-8111-111111111111"),
    "expected_amount_agorot": 32000,
    "max_payments": 1,
    "merchant_email": "merchant@example.invalid",
    "return_url": "https://example.invalid/payment-complete",
    "ipn_url": "https://example.invalid/api/v1/webhooks/upay/1111",
}


def _studio(*, is_demo: bool) -> Studio:
    return Studio(name="x", slug="x", is_demo=is_demo, settings={})


def test_a_demo_studio_gets_the_sandbox_flag():
    assert upay_form_fields(studio=_studio(is_demo=True), **COMMON)["livesystem"] == SANDBOX


def test_a_real_studio_gets_the_live_flag():
    """The control. A builder that returned "0" unconditionally would satisfy the
    restriction and break every real payment."""
    assert upay_form_fields(studio=_studio(is_demo=False), **COMMON)["livesystem"] == LIVE


def test_livesystem_cannot_be_passed_in():
    """The pin is derived from the studio, never from an argument. A keyword the caller
    controls is a keyword a caller gets wrong."""
    with pytest.raises(TypeError):
        upay_form_fields(studio=_studio(is_demo=True), livesystem=LIVE, **COMMON)  # type: ignore[call-arg]


def test_the_order_reference_is_the_public_ref_not_a_sequential_id():
    """§5.10: 'public_ref is a UUIDv4, never a sequential id. Sequential ids in this
    endpoint would let anyone mark any tuition paid.'"""
    fields = upay_form_fields(studio=_studio(is_demo=False), **COMMON)
    assert fields["paymentdetails"] == str(COMMON["order_public_ref"])


def test_money_crosses_the_boundary_as_integer_arithmetic():
    """G2 / invariant 1. upay-integration.md's snippet uses float(); SPEC §4.3 stores
    _agorot INTEGER, and SPEC wins. The conversion happens here and nowhere else."""
    assert shekels(32000) == "320.00"
    assert shekels(32050) == "320.50"
    assert shekels(5) == "0.05"
    assert shekels(0) == "0.00"


def test_the_amount_field_is_a_string_not_a_float():
    fields = upay_form_fields(studio=_studio(is_demo=False), **COMMON)
    assert fields["amount"] == "320.00"
    assert all(isinstance(v, str) for v in fields.values())


def test_no_other_module_decides_livesystem():
    """The gate that keeps this restriction load-bearing after M6.

    Source-level by necessity: 'M6's form route called this builder' is not observable
    until that route exists. What IS checkable now is that nothing else in app/ writes
    the field, so the pin has exactly one implementation to get right.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path == ROOT / "app/integrations/upay/form.py":
            continue
        if re.search(r"['\"]livesystem['\"]", path.read_text(encoding="utf-8")):
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], (
        "livesystem is decided in app/integrations/upay/form.py and nowhere else "
        f"(§19.6) -- these also write it: {offenders}"
    )
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/restrictions/test_05_no_live_money.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.integrations'`.

- [ ] **Step 3: Write the form builder**

`app/integrations/upay/__init__.py`: empty.

`app/integrations/upay/form.py`:

```python
"""SPEC §5.10's server-rendered uPay form, and §19.6's fifth restriction.

M6 owns `payment_order` and the route that renders this. What lives here is the field
builder, because the restriction 'a demo studio can never render a live payment form'
needs exactly one place where `livesystem` is decided. A test asserts no other module in
app/ writes that field.

**Money.** upay-integration.md shows `float(request.args['amount'])`. That is not
followed: SPEC §4.3 stores `expected_amount_agorot INTEGER`, G2 forbids floats and
invariant 1 fails the build on one. The conversion to uPay's decimal-shekel field is
integer arithmetic, it happens here and nowhere else, and it returns a string.

**No signature exists** on this form (upay-integration.md §"Important caveat"). Nothing
here is trusted on the way back; §5.10's reconciliation compares the IPN against
`expected_amount_agorot` on our own row.
"""

from __future__ import annotations

import uuid

from app.models.studio import Studio

UPAY_ENDPOINT = "https://app.upay.co.il/API6/clientsecure/redirectpage.php"

#: uPay's own field values. Strings, because they are form fields.
LIVE = "1"
SANDBOX = "0"


def shekels(amount_agorot: int) -> str:
    """Agorot -> uPay's decimal shekels, in integer arithmetic. `divmod`, not `/ 100`:
    the moment a float appears, 32050 renders as 320.5000000000001 for some input and
    the amount check on the way back fails for a payment that was correct."""
    whole, remainder = divmod(amount_agorot, 100)
    return f"{whole}.{remainder:02d}"


def upay_form_fields(
    *,
    studio: Studio,
    order_public_ref: uuid.UUID,
    expected_amount_agorot: int,
    max_payments: int,
    merchant_email: str,
    return_url: str,
    ipn_url: str,
) -> dict[str, str]:
    """The hidden fields of §5.10's auto-submitting form.

    `livesystem` is **derived from the studio and is not a parameter**. §19.6: 'The demo
    studio's uPay configuration is pinned to livesystem=0.' A keyword the caller
    controls is a keyword a caller gets wrong, and the cost of getting this one wrong is
    a real charge on a real card during a demo.
    """
    return {
        "email": merchant_email,
        "amount": shekels(expected_amount_agorot),
        "returnurl": return_url,
        "ipnurl": ipn_url,
        # §5.10 -- a UUIDv4 public_ref, never a sequential id: a sequential id here
        # would let anyone mark any tuition paid.
        "paymentdetails": str(order_public_ref),
        "maxpayments": str(max_payments),
        "livesystem": SANDBOX if studio.is_demo else LIVE,
        "createinvoiceandreceipt": "1",
        "refername": "STUDIOMANAGER",
        "lang": "HE",
        "currency": "NIS",
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/restrictions/test_05_no_live_money.py -q`
Expected: PASS — 7 tests.

- [ ] **Step 5: Prove the pin bites**

Temporarily change the `livesystem` line to `"livesystem": LIVE,`:

```bash
.venv/bin/pytest tests/restrictions/test_05_no_live_money.py -q
```

Expected: FAIL on `test_a_demo_studio_gets_the_sandbox_flag`. Restore. Then temporarily
write `"livesystem"` into `app/routers/dev.py` and confirm
`test_no_other_module_decides_livesystem` goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add app/integrations tests/restrictions/test_05_no_live_money.py
git commit -m "feat(upay): the livesystem pin, decided in exactly one place

§19.6's fifth restriction needs somewhere for 'a demo studio can never render a live
payment form' to be true of. livesystem is derived from the studio and is not a
parameter: the cost of a caller getting it wrong is a real charge on a real card.
Agorot cross to uPay's decimal field in integer arithmetic, per SPEC §4.3 over
upay-integration.md's float() snippet."
```

---

## Task 11: The uPay IPN simulator — §19.5's four shapes

**Files:**
- Create: `app/integrations/upay/ipn.py`
- Create: `tests/dev/test_ipn_simulator.py`
- Modify: `app/routers/dev.py`, `app/schemas/dev.py`

**Interfaces:**
- Consumes: `shekels` (Task 10), `RequireDeveloper` (Task 1), `app.core.clock.now` (Task 2).
- Produces:
  - `app.integrations.upay.ipn.IpnShape` — a `StrEnum` with members `SUCCESS = "success"`, `AMOUNT_MISMATCH = "amount_mismatch"`, `FORGED_REF = "forged_ref"`, `DUPLICATE = "duplicate"`
  - `app.integrations.upay.ipn.IPN_SOURCE_IP = "84.95.87.35"`
  - `app.integrations.upay.ipn.build_ipn_query(*, shape: IpnShape, order_public_ref: uuid.UUID, expected_amount_agorot: int, transaction_id: str, card_owner_name: str = ..., four_digits: str = ..., payment_date: date | None = None) -> dict[str, str]`
  - `POST /api/v1/dev/upay/simulate-ipn` with body `SimulateIpnRequest` → `SimulateIpnResponse(shape, delivered, target_url, query, note)`

**What is a shell today, stated plainly:** M6 owns `GET /webhooks/upay/{public_ref}`, `upay_ipn_record`, `payment_order` and the reconciliation worker. **The simulator builds the four callbacks and delivers them by HTTP to that endpoint if it exists**; today it does not, so `delivered` comes back `false` with a `note` naming M6, and the query it *would* have sent is returned in full so it can be eyeballed and replayed by hand. M6 plugs in by doing nothing: the moment the route exists, `delivered` becomes `true`. The four shapes and their field values are the durable part, and they are fully tested now.

The four shapes are §5.10's four security requirements, one each:

| Shape | §5.10 threat | What the payload does |
|---|---|---|
| `success` | — | Correct `amount`, correct `productdescription`, a fresh `transactionid` |
| `amount_mismatch` | "Client tampers with `amount` before submitting" | `amount` one agora below expected — the smallest difference a `!=` check must still catch |
| `forged_ref` | "Anyone can forge an IPN for a guessed order" | `productdescription` is a UUID no order carries |
| `duplicate` | "Duplicate IPN delivery" | Byte-identical to a `success` payload, same `transactionid` |

- [ ] **Step 1: Write the failing test**

`tests/dev/test_ipn_simulator.py`:

```python
"""§19.5 -- 'Simulate a uPay IPN. The important one. Fires a synthetic callback in four
shapes: a clean success, an amount mismatch, a forged order reference, and a duplicate
transactionid. These are the four security requirements from §5.10, and without a
simulator they are only testable against live money.'

The payload shapes are asserted in full here. What is NOT asserted is what the server
does with them -- M6 owns GET /webhooks/upay/{public_ref}, upay_ipn_record and the
reconciliation worker. `delivered=False` in the response is the honest report of that,
not a failure.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.integrations.upay.ipn import IPN_SOURCE_IP, IpnShape, build_ipn_query
from tests.dev.conftest import app_in_env

REF = uuid.UUID("22222222-2222-4222-8222-222222222222")
EXPECTED = 32000


def _query(shape: IpnShape, **kwargs) -> dict[str, str]:
    return build_ipn_query(
        shape=shape,
        order_public_ref=REF,
        expected_amount_agorot=EXPECTED,
        transaction_id="TX-1",
        payment_date=date(2026, 8, 20),
        **kwargs,
    )


def test_there_are_exactly_four_shapes():
    """§19.5 names four. A fifth added without a spec change is a shape nobody
    designed a mitigation for."""
    assert {s.value for s in IpnShape} == {
        "success",
        "amount_mismatch",
        "forged_ref",
        "duplicate",
    }


def test_success_carries_the_expected_amount_and_the_real_reference():
    q = _query(IpnShape.SUCCESS)
    assert q["errordescription"] == "SUCCESS"
    assert q["providererrorcode"] == "0"
    assert q["amount"] == "320.00"
    assert q["productdescription"] == str(REF)
    assert q["transactionid"] == "TX-1"


def test_amount_mismatch_differs_by_the_smallest_possible_amount():
    """One agora. §5.10's mitigation is 'never trust the IPN's amount, compare against
    expected_amount_agorot' -- a simulator that differed by 100₪ would pass a check
    that only compared the shekel part."""
    q = _query(IpnShape.AMOUNT_MISMATCH)
    assert q["amount"] == "319.99"
    assert q["productdescription"] == str(REF)


def test_forged_ref_names_an_order_that_does_not_exist():
    """§5.10: 'public_ref is a UUIDv4, never a sequential id.' The forged shape must
    still LOOK like a UUID, or the endpoint would reject it as malformed before
    reaching the lookup this is meant to exercise."""
    q = _query(IpnShape.FORGED_REF)
    assert uuid.UUID(q["productdescription"]) != REF
    assert q["amount"] == "320.00"


def test_duplicate_is_byte_identical_to_the_success_it_repeats():
    """§5.10's mitigation is idempotence on transactionid. A duplicate that differed in
    any other field would also be caught by a weaker check, and the test would pass
    while the real threat went unmitigated."""
    assert _query(IpnShape.DUPLICATE) == _query(IpnShape.SUCCESS)


def test_the_card_details_have_sensible_defaults():
    """§5.10's reconciliation matches on (normalized card owner name, last 4 digits),
    so both must be present and stable across a repeated simulation."""
    q = _query(IpnShape.SUCCESS)
    assert q["fourdigits"].isdigit() and len(q["fourdigits"]) == 4
    assert q["cardownername"]


def test_the_payload_carries_every_field_upay_sends():
    """upay-integration.md §4. A simulator missing a field is a parser that was never
    tested against it."""
    assert set(_query(IpnShape.SUCCESS)) == {
        "errordescription",
        "providererrorcode",
        "amount",
        "transactionid",
        "productdescription",
        "cardownername",
        "fourdigits",
        "paymentdate",
    }


def test_the_documented_source_ip_is_recorded_not_invented():
    """§5.10's weak layer: 'Source-IP allowlist (84.95.87.35, configurable). Treated as
    one weak layer, not proof.' Recorded here so M6's allowlist and the simulator agree
    on the value."""
    assert IPN_SOURCE_IP == "84.95.87.35"


# -- the endpoint -------------------------------------------------------------
@pytest.mark.parametrize("shape", [s.value for s in IpnShape])
def test_the_endpoint_returns_the_query_it_would_send(shape):
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .post(
                "/api/v1/dev/upay/simulate-ipn",
                json={"shape": shape, "order_public_ref": str(REF), "expected_amount_agorot": EXPECTED},
            )
            .json()
        )
    assert body["shape"] == shape
    assert body["query"]["productdescription"]


def test_the_endpoint_reports_honestly_that_m6_has_not_landed():
    """`delivered: false` with a note naming the milestone, rather than a 200 that
    implies something happened. The moment M6 mounts GET /webhooks/upay/{public_ref},
    this flips to true with no change here -- and this test goes red, which is the
    signal to delete it."""
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .post(
                "/api/v1/dev/upay/simulate-ipn",
                json={"shape": "success", "order_public_ref": str(REF), "expected_amount_agorot": EXPECTED},
            )
            .json()
        )
    assert body["delivered"] is False
    assert "M6" in body["note"]


def test_the_endpoint_does_not_exist_in_production():
    with app_in_env("production") as application:
        response = TestClient(application).post(
            "/api/v1/dev/upay/simulate-ipn",
            json={"shape": "success", "order_public_ref": str(REF), "expected_amount_agorot": EXPECTED},
        )
    assert response.status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/dev/test_ipn_simulator.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.integrations.upay.ipn'`.

- [ ] **Step 3: Write `app/integrations/upay/ipn.py`**

```python
"""SPEC §19.5's IPN simulator, and the callback shape it simulates.

'Fires a synthetic callback in four shapes: a clean success, an amount mismatch, a
forged order reference, and a duplicate transactionid. These are the four security
requirements from §5.10, and without a simulator they are only testable against live
money.'

**What M6 owns and this does not:** `GET /webhooks/upay/{public_ref}`,
`upay_ipn_record`, `payment_order` and the reconciliation worker. This module builds the
callback; the dev router delivers it to that endpoint when it exists. The four shapes
and their field values are the durable part and they are tested in full today.

The field list is upay-integration.md §4 verbatim. A simulator missing a field is a
parser that was never tested against it.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import StrEnum

from app.integrations.upay.form import shekels

#: §5.10: 'Source-IP allowlist (84.95.87.35, configurable). Treated as one weak layer,
#: not proof.' Recorded here so M6's allowlist and the simulator cannot disagree.
IPN_SOURCE_IP = "84.95.87.35"

#: The fixture card. Stable across simulations because §5.10's reconciliation builds a
#: payer_fingerprint from (normalized card owner name, last 4 digits) -- a name that
#: changed every call would make the fingerprint path untestable.
DEMO_CARD_OWNER = "ישראל ישראלי"
DEMO_FOUR_DIGITS = "4242"


class IpnShape(StrEnum):
    """§19.5's four, one per §5.10 security requirement."""

    #: The happy path.
    SUCCESS = "success"
    #: 'Client tampers with amount before submitting.' Off by one agora -- the smallest
    #: difference a comparison against expected_amount_agorot must still catch.
    AMOUNT_MISMATCH = "amount_mismatch"
    #: 'Anyone can forge an IPN for a guessed order.' A well-formed UUID no order
    #: carries, so the endpoint reaches its lookup rather than rejecting the input.
    FORGED_REF = "forged_ref"
    #: 'Duplicate IPN delivery.' Byte-identical to the success it repeats, because a
    #: duplicate that differed anywhere else would be caught by a weaker check.
    DUPLICATE = "duplicate"


def build_ipn_query(
    *,
    shape: IpnShape,
    order_public_ref: uuid.UUID,
    expected_amount_agorot: int,
    transaction_id: str,
    card_owner_name: str = DEMO_CARD_OWNER,
    four_digits: str = DEMO_FOUR_DIGITS,
    payment_date: date | None = None,
) -> dict[str, str]:
    """The query string uPay would GET to our ipnurl, in one of §19.5's four shapes."""
    amount_agorot = expected_amount_agorot
    reference = order_public_ref

    if shape is IpnShape.AMOUNT_MISMATCH:
        amount_agorot = expected_amount_agorot - 1
    elif shape is IpnShape.FORGED_REF:
        # Deterministic, so a forged-reference test is reproducible; derived from the
        # real ref so it can never collide with it.
        reference = uuid.uuid5(uuid.NAMESPACE_URL, f"forged/{order_public_ref}")

    return {
        "errordescription": "SUCCESS",
        "providererrorcode": "0",
        "amount": shekels(amount_agorot),
        "transactionid": transaction_id,
        "productdescription": str(reference),
        "cardownername": card_owner_name,
        "fourdigits": four_digits,
        "paymentdate": (payment_date or date.today()).isoformat(),
    }
```

**Note on `date.today()`:** Task 2's discipline gate matches `datetime.now|utcnow|today`,
not `date.today`. Use `now().date()` from `app.core.clock` here instead, so a simulated
IPN under time travel carries the travelled date — otherwise "run the billing run in
March, then simulate its payment" produces a payment dated today. Import
`from app.core.clock import now` and write `(payment_date or now().date()).isoformat()`.

- [ ] **Step 4: Add the schemas and the route**

In `app/schemas/dev.py`:

```python
class SimulateIpnRequest(BaseModel):
    shape: IpnShape
    order_public_ref: uuid.UUID
    expected_amount_agorot: int
    #: Omitted means a fresh one. Naming it is how a duplicate is simulated across two
    #: calls rather than only within one.
    transaction_id: str | None = None


class SimulateIpnResponse(BaseModel):
    shape: IpnShape
    delivered: bool
    target_url: str
    query: dict[str, str]
    note: str
```

In `app/routers/dev.py`:

```python
@router.post("/upay/simulate-ipn", response_model=SimulateIpnResponse)
def simulate_ipn(_: RequireDeveloper, body: SimulateIpnRequest, request: Request) -> SimulateIpnResponse:
    """§19.5's fourth tool.

    Delivery is best-effort and reported honestly. M6 owns
    GET /webhooks/upay/{public_ref}; until it is mounted there is nothing to deliver
    to, and `delivered: false` with a note naming the milestone is a more useful answer
    than a 200 that implies something happened. When M6 lands, this starts delivering
    with no change here.
    """
    query = build_ipn_query(
        shape=body.shape,
        order_public_ref=body.order_public_ref,
        expected_amount_agorot=body.expected_amount_agorot,
        transaction_id=body.transaction_id or f"DEV-{body.order_public_ref.hex[:12]}",
    )
    path = f"/api/v1/webhooks/upay/{body.order_public_ref}"
    mounted = any(getattr(route, "path", None) == path for route in request.app.routes)
    note = (
        "delivered to the webhook"
        if mounted
        else "M6 owns GET /webhooks/upay/{public_ref}; it is not mounted yet, so this "
        "is the payload that would have been sent"
    )
    return SimulateIpnResponse(
        shape=body.shape,
        delivered=mounted,
        target_url=path,
        query=query,
        note=note,
    )
```

**Note:** `request.app.routes` sees only top-level mounts; the webhook will be mounted
through the same `_IncludedRouter` opacity that `tests/invariants/test_03` documents. Use
the OpenAPI path set instead — `path in request.app.openapi()["paths"]` — which is the
same source of truth restriction 2 uses, and verify during Step 5 that it reports
`False` today.

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/dev/test_ipn_simulator.py -q`
Expected: PASS — 13 tests (4 parametrized).

- [ ] **Step 6: Prove the duplicate shape is really identical**

Temporarily change `DUPLICATE` to also bump the transaction id:

```bash
.venv/bin/pytest tests/dev/test_ipn_simulator.py::test_duplicate_is_byte_identical_to_the_success_it_repeats -q
```

Expected: FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add app/integrations/upay/ipn.py app/routers/dev.py app/schemas/dev.py tests/dev/test_ipn_simulator.py
git commit -m "feat(dev): the uPay IPN simulator in §19.5's four shapes

The four are §5.10's four security requirements, one each. The mismatch differs by
one agora and the duplicate is byte-identical to its success -- a simulator that was
sloppier would pass a check that only caught the easy version. M6 owns the webhook;
until it is mounted the endpoint reports delivered:false and returns the payload it
would have sent, which is more useful than a 200 that implies something happened."
```

---

## Task 12: Restrictions 1, 3 and 4

**Files:**
- Create: `app/core/break_glass.py`
- Create: `tests/restrictions/test_01_no_action_in_a_real_studio.py`
- Create: `tests/restrictions/test_03_no_real_health_declaration.py`
- Create: `tests/restrictions/test_04_the_flag_is_not_grantable.py`
- Modify: `app/core/tenancy.py` (`studio_id_from_request` calls `developer_may_act`)

**Interfaces:**
- Consumes: `developer_may_act` (Task 1), `app.main.app`.
- Produces:
  - `app.core.break_glass.HEALTH_ENTITY_TYPES: frozenset[str]`
  - `app.core.break_glass.break_glass_may_read(entity_type: str, *, is_developer: bool = False) -> bool`
  - `app.core.tenancy.studio_id_from_request` now 403s for a developer session in a real studio in production

**Vacuity, named:**

| Restriction | Vacuous today? | What makes it bite |
|---|---|---|
| 1 — cannot act in a non-demo studio in production | **No.** All eight rows of the rule are asserted, and the resolver enforces it | M1 setting `request.state.is_developer` and `request.state.studio_is_demo` from the verified JWT turns it from "correct and unused" into "correct and load-bearing" |
| 3 — cannot read a real health declaration | **Partly.** The exclusion function is fully asserted; the detector over break-glass call sites finds only this module | M4 lands `health_declaration`; M9 lands `POST /platform/break-glass` |
| 4 — cannot grant itself the flag | **Yes, both detectors.** `auth_identity` does not exist, so no schema names `is_developer` and no code writes it | M1's contract commit creates `auth_identity.is_developer`. The day a schema exposes the field or a service assigns it, both go red |

- [ ] **Step 1: Write the three failing tests**

`tests/restrictions/test_01_no_action_in_a_real_studio.py`:

```python
"""§19.6 restriction 1: 'Cannot act inside a non-demo studio in production. Not "is
discouraged from" -- the studio resolver excludes is_demo = false for developer sessions
in production, and a test asserts it.'

NOT VACUOUS. The rule is a function of three booleans and all eight rows are asserted
below, and the resolver calls it today. What is absent is only the INPUT: M1 sets
request.state.is_developer and request.state.studio_is_demo from the verified JWT and
the resolved studio. Until then every request presents (False, False) and the rule
correctly allows it -- which is why the resolver test drives request.state directly.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from app.core.dev_account import developer_may_act
from app.core.tenancy import studio_id_from_request

STUDIO = uuid.uuid4()


# -- the rule, in full --------------------------------------------------------
@pytest.mark.parametrize("env", ["development", "staging", "test", "production"])
@pytest.mark.parametrize("studio_is_demo", [True, False])
def test_a_non_developer_is_never_affected(env, studio_is_demo):
    """The rule is about developer sessions. A real manager in a real studio in
    production is the product working."""
    assert developer_may_act(is_developer=False, studio_is_demo=studio_is_demo, env=env)


@pytest.mark.parametrize("env", ["development", "staging", "test"])
@pytest.mark.parametrize("studio_is_demo", [True, False])
def test_outside_production_a_developer_may_act_anywhere(env, studio_is_demo):
    """§19.1 -- the role switcher is available 'across any studio in that environment'
    in dev and staging."""
    assert developer_may_act(is_developer=True, studio_is_demo=studio_is_demo, env=env)


def test_in_production_a_developer_may_act_only_in_a_demo_studio():
    assert developer_may_act(is_developer=True, studio_is_demo=True, env="production")
    assert not developer_may_act(is_developer=True, studio_is_demo=False, env="production")


# -- the resolver enforces it -------------------------------------------------
def _probe_app(*, is_developer: bool, studio_is_demo: bool) -> FastAPI:
    """A minimal app whose middleware presents the state M1 will present. Driving
    request.state directly is the only honest way to test this before an auth layer
    exists -- and it tests the resolver, which is what §19.6 names."""
    probe = FastAPI()

    @probe.middleware("http")
    async def _state(request: Request, call_next):
        request.state.studio_id = STUDIO
        request.state.is_developer = is_developer
        request.state.studio_is_demo = studio_is_demo
        return await call_next(request)

    @probe.get("/probe")
    def read(studio_id: uuid.UUID = Depends(studio_id_from_request)) -> dict[str, str]:
        return {"studio_id": str(studio_id)}

    return probe


def test_the_resolver_refuses_a_developer_in_a_real_studio_in_production(monkeypatch):
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=True, studio_is_demo=False))
    assert client.get("/probe").status_code == 403


def test_the_resolver_allows_a_developer_in_the_demo_studio_in_production(monkeypatch):
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=True, studio_is_demo=True))
    assert client.get("/probe").status_code == 200


def test_the_resolver_leaves_an_ordinary_session_alone_in_production(monkeypatch):
    """The control. A resolver that 403'd everything would satisfy the restriction and
    break the product."""
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=False, studio_is_demo=False))
    assert client.get("/probe").status_code == 200
```

`tests/restrictions/test_03_no_real_health_declaration.py`:

```python
"""§19.6 restriction 3: 'Cannot read any real person's health declaration. Legitimate
support access to real data goes through break-glass (§18.2), which is time-boxed,
reason-tagged, written to the tenant's own audit log and notified to the studio owner.
Break-glass excludes health declaration contents entirely, and the developer flag does
not change that.'

PARTIALLY VACUOUS. `break_glass_may_read` is fully asserted -- including the property
the restriction actually names, that passing is_developer=True changes nothing. What is
vacuous is coverage: `health_declaration` is M4's table and POST /platform/break-glass
is M9's route, so the detector at the bottom finds only this module today. It bites when
M9 lands the elevation path.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core.break_glass import HEALTH_ENTITY_TYPES, break_glass_may_read

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("entity_type", sorted(HEALTH_ENTITY_TYPES))
def test_health_is_excluded_from_break_glass(entity_type):
    assert not break_glass_may_read(entity_type)


@pytest.mark.parametrize("entity_type", sorted(HEALTH_ENTITY_TYPES))
def test_the_developer_flag_does_not_change_that(entity_type):
    """The sentence §19.6 actually writes. The parameter exists precisely so this can
    be asserted rather than assumed from its absence."""
    assert break_glass_may_read(entity_type, is_developer=True) is break_glass_may_read(
        entity_type, is_developer=False
    )
    assert not break_glass_may_read(entity_type, is_developer=True)


@pytest.mark.parametrize("entity_type", ["student", "charge", "session", "attendance"])
def test_break_glass_still_reaches_the_data_it_exists_for(entity_type):
    """§18.2 exists because 'sometimes you genuinely will need to look at a studio's
    real data to debug something'. A function that refused everything would satisfy the
    restriction and delete the feature."""
    assert break_glass_may_read(entity_type)


def test_every_health_entity_type_spec_names_is_covered():
    """SPEC §4.3's health tables. Listed explicitly so adding a table in M4 without
    adding it here is a red build."""
    assert HEALTH_ENTITY_TYPES >= {
        "health_declaration",
        "health_declaration_version",
        "health_template",
    }


def test_no_break_glass_code_path_bypasses_the_check():
    """VACUOUS TODAY -- §18.2's elevation route is M9's, so the only function here
    matching /break.?glass/ is the one in app/core/break_glass.py.

    Source-level by necessity: 'M9's read path consulted this' is not observable until
    that path exists. It bites the day it does.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path == ROOT / "app/core/break_glass.py":
            continue
        text = path.read_text(encoding="utf-8")
        if re.search(r"break.?glass", text, re.IGNORECASE) and "break_glass_may_read" not in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], (
        "these touch break-glass without consulting break_glass_may_read (§18.2, "
        f"§19.6): {offenders}"
    )
```

`tests/restrictions/test_04_the_flag_is_not_grantable.py`:

```python
"""§19.6 restriction 4: 'Cannot grant itself the flag, or grant it to anyone else.'
§19.2: 'is_developer is set only by a database seed or migration. There is no API, no UI
and no admin screen that can grant it. A test asserts no route can write the column.'

FULLY VACUOUS TODAY, both detectors, and deliberately so. `auth_identity` is M1's table:
no schema names is_developer and no code assigns it, so both detectors find nothing.
They exist now so that M1 cannot land the first violation unnoticed -- the same reason
tests/invariants 3 and 5 exist while the things they guard do not.

TRIGGER: M1's contract commit creating auth_identity.is_developer. From that commit on,
the day a request schema exposes the field or a service assigns it, these go red.

The self-tests at the bottom are what make a currently-empty gate worth having.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
COLUMN = "is_developer"

#: Where the flag may legally be set. §19.2 names exactly these two.
ALLOWED_WRITERS = ("alembic/versions/", "app/services/demo/")


def writable_properties(application: FastAPI) -> list[str]:
    """Every property a client can SEND, walked through $refs.

    Request bodies, not responses: exposing `is_developer` in a response is a privacy
    question, but §19.2's requirement is that no route can WRITE it.
    """
    schema = application.openapi()
    components: dict[str, Any] = schema.get("components", {}).get("schemas", {})

    def walk(node: dict[str, Any], seen: set[str]) -> list[str]:
        ref = node.get("$ref")
        if ref:
            if ref in seen:
                return []
            seen = seen | {ref}
            node = components.get(ref.rsplit("/", 1)[-1], {})
        found = []
        for prop, sub in (node.get("properties") or {}).items():
            if prop == COLUMN:
                found.append(f"{node.get('title', '?')}.{prop}")
            branches = [*(sub.get("anyOf") or []), *(sub.get("allOf") or [])]
            if isinstance(sub.get("items"), dict):
                branches.append(sub["items"])
            if sub.get("$ref"):
                branches.append(sub)
            for branch in branches:
                found.extend(walk(branch, seen))
        return found

    out = []
    for path, operations in schema.get("paths", {}).items():
        for method, operation in operations.items():
            body = (
                operation.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema")
            )
            if body:
                out.extend(f"{method.upper()} {path} -> {p}" for p in walk(body, set()))
    return sorted(set(out))


def source_writers(root: Path) -> list[str]:
    """Every assignment to the column outside a seed or a migration."""
    pattern = re.compile(rf"(\.{COLUMN}\s*=(?!=)|\b{COLUMN}\s*=(?!=))")
    found = []
    for path in sorted(root.rglob("*.py")):
        rel = str(path.relative_to(ROOT))
        if rel.startswith(ALLOWED_WRITERS):
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                found.append(f"{rel}:{lineno}")
    return found


def test_no_route_can_write_the_flag():
    assert writable_properties(app) == []


def test_no_code_outside_a_seed_or_a_migration_assigns_it():
    assert source_writers(ROOT / "app") == [], (
        f"{COLUMN} is settable only by a database seed or migration (§19.2)"
    )


def test_the_gate_is_currently_empty_and_says_so():
    """Records the vacuity rather than hiding it. When M1 lands auth_identity this goes
    red, and the correct fix is to delete this test -- the two assertions above stop
    being vacuous at that point."""
    import app.models

    assert COLUMN not in {
        column.name
        for table in app.models.base.Base.metadata.tables.values()
        for column in table.columns
    }, (
        f"auth_identity.{COLUMN} now exists -- delete this test; the assertions above "
        "are no longer vacuous"
    )


# -- proven to fire ----------------------------------------------------------
def test_the_schema_detector_flags_a_route_that_accepts_the_flag():
    class GrantRequest(BaseModel):
        person_id: str
        is_developer: bool

    router = APIRouter()

    @router.post("/grant")
    def grant(body: GrantRequest) -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    assert writable_properties(probe) == ["POST /grant -> GrantRequest.is_developer"]


def test_the_schema_detector_reaches_into_a_nested_model():
    class Identity(BaseModel):
        is_developer: bool

    class Body(BaseModel):
        identity: Identity

    router = APIRouter()

    @router.post("/grant")
    def grant(body: Body) -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    assert writable_properties(probe) == ["POST /grant -> Identity.is_developer"]


def test_the_source_detector_flags_an_assignment(tmp_path):
    (tmp_path / "probe.py").write_text("identity.is_developer = True\n", encoding="utf-8")
    assert [hit.split(":")[-1] for hit in source_writers(tmp_path)] == ["1"]


def test_the_source_detector_leaves_a_comparison_alone(tmp_path):
    """`==` is a read, and a read is exactly what M1's resolver must do."""
    (tmp_path / "probe.py").write_text("if identity.is_developer == True:\n    pass\n", encoding="utf-8")
    assert source_writers(tmp_path) == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/restrictions -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.break_glass'`, and the
three resolver tests fail because `studio_id_from_request` does not consult the rule.

- [ ] **Step 3: Write `app/core/break_glass.py`**

```python
"""SPEC §18.2's break-glass boundary, and §19.6's third restriction.

'Health declarations are excluded from break-glass entirely. If you need to debug
something touching them, you debug the shape and the encryption, never the contents.'
And §19.6: 'the developer flag does not change that.'

The `is_developer` parameter exists so that last sentence can be **asserted** rather than
inferred from the parameter's absence. A test passes both values and requires the same
answer. That is a deliberately useless parameter, and it is useless on purpose.

M9 owns the elevation itself -- the reason, the expiry, the notification to the owner and
the per-read audit entries. What lands in M0 is the one decision the developer account
must not be able to move.
"""

from __future__ import annotations

#: SPEC §4.3's health tables. M4 adds the models; the names are fixed here so a table
#: added there without an entry here is a red build (restriction 3's test asserts this
#: set covers them).
HEALTH_ENTITY_TYPES = frozenset(
    {
        "health_declaration",
        "health_declaration_version",
        "health_template",
    }
)


def break_glass_may_read(entity_type: str, *, is_developer: bool = False) -> bool:
    """Whether an elevated platform admin may read this entity type's contents.

    `is_developer` is accepted and deliberately ignored. §19.6: the flag does not change
    what break-glass excludes, and a parameter that is asserted to make no difference is
    stronger than a parameter that was never offered -- the second could be added later
    by someone who did not know.
    """
    del is_developer  # §19.6 -- named, accepted, and intentionally not consulted.
    return entity_type not in HEALTH_ENTITY_TYPES
```

- [ ] **Step 4: Wire the rule into the resolver**

In `app/core/tenancy.py`, extend `studio_id_from_request`:

```python
def studio_id_from_request(request: Request) -> uuid.UUID:
    """SPEC §4.2 layer 1, and §19.6 restriction 1.

    M1 owns authentication and sets ``request.state.studio_id``, ``is_developer`` and
    ``studio_is_demo`` from the verified JWT and the resolved studio. Until it lands
    this is the seam, and the contract worth holding is that an unresolved studio is a
    401 -- never an unscoped session -- and that a developer session cannot resolve a
    studio holding real people in production.
    """
    studio_id = getattr(request.state, "studio_id", None)
    if not isinstance(studio_id, uuid.UUID):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="no active studio")

    # §19.6 -- 'the studio resolver excludes is_demo = false for developer sessions in
    # production'. Both flags default to False, so an ordinary request is unaffected
    # and the rule is correct-but-unused until M1 populates them.
    if not developer_may_act(
        is_developer=bool(getattr(request.state, "is_developer", False)),
        studio_is_demo=bool(getattr(request.state, "studio_is_demo", False)),
        env=settings.ENV,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="a developer session may only act inside a demo studio in production",
        )
    return studio_id
```

with `from app.core.config import settings` and `from app.core.dev_account import developer_may_act` added to the imports.

**Import-cycle note:** `app/core/dev_account.py` imports `settings` only; `tenancy.py`
importing it creates no cycle. Verify with `.venv/bin/python -c "import app.core.tenancy"`.

- [ ] **Step 5: Run to verify they pass**

Run: `.venv/bin/pytest tests/restrictions -q`
Expected: PASS.

- [ ] **Step 6: Prove restriction 1 bites**

Temporarily make `developer_may_act` `return True` unconditionally:

```bash
.venv/bin/pytest tests/restrictions/test_01_no_action_in_a_real_studio.py -q
```

Expected: FAIL on `test_in_production_a_developer_may_act_only_in_a_demo_studio` **and**
`test_the_resolver_refuses_a_developer_in_a_real_studio_in_production` — both ends, the
rule and the wiring. Restore.

- [ ] **Step 7: Commit**

```bash
git add app/core/break_glass.py app/core/tenancy.py tests/restrictions
git commit -m "feat(dev): restrictions 1, 3 and 4, with their vacuity named

Restriction 1 is not vacuous: all eight rows of the rule are asserted and the
resolver calls it -- only the inputs wait on M1. Restrictions 3 and 4 are, and each
docstring says which trigger makes it bite. break_glass_may_read takes an
is_developer it deliberately ignores, so §19.6's 'the flag does not change that' is
an assertion rather than an inference from a missing parameter."
```

---

## Task 13: The lane check reads the new code, and `tests/restrictions` runs in every lane

**Files:**
- Modify: `scripts/lane-check.sh`
- Modify: `tests/config/test_lane_check.py`

**Interfaces:**
- Consumes: everything Tasks 1–12 created.
- Produces: `./scripts/lane-check.sh core` reports **eight** scoped gates, and every vertical runs `tests/restrictions` unscoped.

**Why:** `core`'s Python paths are `app/core app/models app/services` (`scripts/lane-check.sh:47`). Nothing in this session's `app/routers/dev.py`, `app/integrations/` or `app/workers/` is typechecked, linted or format-checked by the exit gate as it stands, and `tests/dev` and `tests/restrictions` are in neither `test_candidates` list. That is exactly the failure this repo has caught three times already: a gate that is green because it read nothing.

**And why `tests/restrictions` is unscoped:** the five §19.6 restrictions are the same kind of thing as `tests/invariants/`'s five — *"they must exist from M0 so no lane can land the first violation unnoticed"*. A lane in W4 adding a route that writes `is_developer` must go red in its own check, not in someone's merge.

- [ ] **Step 1: Write the failing test**

Append to `tests/config/test_lane_check.py`:

```python
def test_core_typechecks_the_dev_surface():
    """§19's code lives in app/routers/dev.py, app/integrations/ and app/workers/. The
    core lane's paths listed only app/core, app/models and app/services, so none of it
    reached mypy, ruff or ruff format in the one command this session's exit gate
    names."""
    text = LANE_CHECK.read_text(encoding="utf-8")
    for path in ("app/routers/dev.py", "app/integrations", "app/workers"):
        assert path in text, f"{path} is invisible to lane-check.sh core"


def test_restrictions_run_unscoped_in_every_lane():
    """§19.6's five, for the same reason tests/invariants' five run everywhere: no lane
    may land the first violation unnoticed."""
    text = LANE_CHECK.read_text(encoding="utf-8")
    assert "tests/restrictions" in text
    # Inside the unscoped block, beside the invariants -- not in a per-vertical branch.
    unscoped = text.split('say "invariants')[1].split('say "backend')[0]
    assert "tests/restrictions" in unscoped


def test_core_runs_the_dev_test_directory():
    assert "tests/dev" in LANE_CHECK.read_text(encoding="utf-8")


def test_the_dry_run_reports_eight_scoped_gates_for_core():
    """The count is the cheapest regression detector there is: M0.3 caught a missing
    CSS gate because core reported five where it should have reported six."""
    result = subprocess.run(
        [str(ROOT / "scripts/lane-check.sh"), "core", "--dry-run"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    assert result.returncode == 0, result.stderr
    assert "8 scoped gates" in result.stdout
```

**Note:** confirm the existing constants in that file (`LANE_CHECK`, `ROOT`, and whether
`subprocess` is already imported) and reuse them rather than redefining. If the existing
tests count scoped gates differently, match their idiom.

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/config/test_lane_check.py -q`
Expected: FAIL — `app/routers/dev.py is invisible to lane-check.sh core`.

- [ ] **Step 3: Extend `scripts/lane-check.sh`**

In the `core)` branch:

```bash
  core)
    # §19's code is spread across routers/, integrations/ and workers/, none of which
    # follow the per-vertical convention. Listed explicitly rather than by widening to
    # all of app/routers: a lane's own router belongs to that lane's check, not to
    # core's.
    py_candidates=(app/core app/models app/services app/routers/dev.py app/integrations app/workers)
    test_candidates=(tests/core tests/config tests/dev)
    ;;
```

And beside the invariants gate, before the per-vertical block:

```bash
say "restrictions (SPEC §19.6)"
# Not scoped, for the same reason the invariants are not: §19.6's five guardrails must
# be checked in every lane, every time, so no lane can land the first violation
# unnoticed. §19.7's demo-data hygiene rides along in the same directory.
run .venv/bin/pytest tests/restrictions -q
```

- [ ] **Step 4: Run to verify it passes**

```bash
.venv/bin/pytest tests/config/test_lane_check.py -q
./scripts/lane-check.sh core --dry-run
./scripts/lane-check.sh core
```

Expected: PASS, and `✅ lane core green (8 scoped gates)`.

- [ ] **Step 5: Prove each new gate bites**

Three plants, each reverted after:

1. **mypy sees the dev router.** Add `x: int = "not an int"` to `app/routers/dev.py`.
   `./scripts/lane-check.sh core` → red in the `types · core` gate. Revert.
2. **ruff format sees `app/integrations`.** Add a badly formatted line (e.g.
   `x   =   1`) to `app/integrations/upay/form.py`. `./scripts/lane-check.sh core` → red
   in the `lint · core` gate. Revert.
3. **restrictions run in a lane that is not core.** Temporarily break
   `tests/restrictions/test_05_no_live_money.py` (change the expected `"320.00"` to
   `"999.00"`) and run `./scripts/lane-check.sh billing`. Expected: red — a vertical
   with no source of its own still runs the restrictions. Revert.

**Record each observed failure in the retrospective (Task 18).**

- [ ] **Step 6: Commit**

```bash
git add scripts/lane-check.sh tests/config/test_lane_check.py
git commit -m "fix(lane-check): core reads the dev surface, and restrictions run everywhere

app/routers/dev.py, app/integrations/ and app/workers/ reached neither mypy nor ruff
in the one command this session's exit gate names -- the same failure mode M0.3 found
with CSS. §19.6's five join §13's five in the unscoped block: a lane in W4 that writes
is_developer must go red in its own check, not in someone's merge."
```

---

## Task 14: The dev bar's copy, and the G4 rule that will now cover it

**Files:**
- Modify: `web/packages/i18n/he/common.ts`, `web/packages/i18n/en/common.ts`, `web/packages/i18n/ru/common.ts`
- Modify: `web/eslint.config.js`
- Create: `web/tools/__tests__/g4-dev-bar.test.ts`

**Interfaces:**
- Produces: sixteen `common.dev.*` keys in three locales, and an ESLint config under which `packages/ui/src/dev-bar/**/*.tsx` is subject to the inline-string rule.

**Decision A, applied.** See the decision section at the top of this plan: the strings go through `@studio/i18n`, and G4's rule is *extended* to the dev-bar directory rather than an exception being carved for it. `web/packages/i18n/index.ts` and `types.ts` are **not** touched — these are keys in the existing `common` namespace, not a tenth namespace.

- [ ] **Step 1: Write the failing test**

`web/tools/__tests__/g4-dev-bar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * G4 — "no user-facing string is ever inlined in a component" — was scoped to
 * `apps/*​/src/**​/*.tsx`, because packages/ui primitives take their text as props. The
 * dev bar is the exception to that convention: it is a feature, not a primitive, and it
 * carries its own copy.
 *
 * Decision A of the M0.4 plan: rather than exempt it, the rule is EXTENDED to cover it.
 * Its persona labels are the product's own role names, so inline Hebrew there would be
 * a second set that drifts from `people`'s the day M1 lands — and an ESLint hole in
 * developer-only code is a precedent a later lane can cite.
 *
 * This spec is what stops the extension being silently dropped by a future config edit.
 */
const lint = async (code: string, filePath: string) => {
  const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
  const results = await eslint.lintText(code, { filePath })
  return results.flatMap((r) => r.messages.map((m) => m.message)).join('\n')
}

const INLINE_HEBREW = `export const A = () => <div>שלום עולם</div>`
const VIA_T = `import { t } from '@studio/i18n'
export const A = () => <div>{t('he', 'common.dev.title')}</div>`

describe('G4 covers the dev bar', () => {
  it('rejects an inlined string in the dev-bar directory', async () => {
    const out = await lint(INLINE_HEBREW, 'packages/ui/src/dev-bar/Fixture.tsx')
    expect(out).toMatch(/no user-facing string is inlined/)
  })

  it('accepts the same component when the string comes from t()', async () => {
    const out = await lint(VIA_T, 'packages/ui/src/dev-bar/Fixture.tsx')
    expect(out).not.toMatch(/no user-facing string is inlined/)
  })

  it('still leaves the primitives alone — they take their text as props', async () => {
    const out = await lint(INLINE_HEBREW, 'packages/ui/src/primitives/Fixture.tsx')
    expect(out).not.toMatch(/no user-facing string is inlined/)
  })

  it('still covers the apps', async () => {
    const out = await lint(INLINE_HEBREW, 'apps/staff/src/Fixture.tsx')
    expect(out).toMatch(/no user-facing string is inlined/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run tools/__tests__/g4-dev-bar.test.ts --reporter=dot`
Expected: FAIL on the first case — the rule does not reach `packages/ui/src/dev-bar/`.

- [ ] **Step 3: Extend the ESLint config**

In `web/eslint.config.js`, after the existing `apps/*/src/**/*.tsx` block:

```js
  {
    // G4 reaches the dev bar too. It lives in packages/ui because all three apps mount
    // it, but unlike every primitive beside it, it is a feature that carries its own
    // copy rather than taking text as props — and its persona labels are the product's
    // own role names, so inline Hebrew here would be a second set that drifts from
    // `people`'s the day M1 lands. Extended rather than exempted: an ESLint hole in
    // developer-only code is a precedent a later lane can cite.
    files: ['packages/ui/src/dev-bar/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...physicalPropertySyntax, inlineStringSyntax],
    },
  },
```

- [ ] **Step 4: Add the sixteen keys**

To `web/packages/i18n/he/common.ts`:

```ts
  // §19.4 — the dev bar. Developer-only UI, but UI: these go through i18n like
  // everything else, because the persona labels are the product's own role names.
  'dev.title': 'פיתוח',
  'dev.actingAs': 'פועל בתור',
  'dev.noPersona': 'אין פרסונה פעילה',
  'dev.personaSwitcherPending': 'מחליף התפקידים מגיע ב-M1, יחד עם טבלת הזהויות',
  // §19.3 — 'There is no student persona, because students have no login in v1, and
  // the dev bar says so explicitly, so the gap is visible rather than confusing.'
  'dev.noStudentPersona': 'אין פרסונת תלמיד — לתלמידים אין התחברות בגרסה 1',
  'dev.tool.offline': 'לא מקוון',
  'dev.tool.slow': 'איטי',
  'dev.tool.timeTravel': 'מסע בזמן',
  'dev.tool.runJob': 'הרצת משימה',
  'dev.tool.simulateIpn': 'הדמיית IPN',
  'dev.tool.resetDemo': 'איפוס נתוני הדגמה',
  'dev.pendingIn': 'מגיע ב-',
  'dev.timeTravel.plusMonth': 'חודש קדימה',
  'dev.timeTravel.now': 'חזרה לעכשיו',
  'dev.ipn.success': 'הצלחה',
  'dev.ipn.amount_mismatch': 'סכום לא תואם',
  'dev.ipn.forged_ref': 'מזהה הזמנה מזויף',
  'dev.ipn.duplicate': 'כפילות',
```

To `web/packages/i18n/en/common.ts` (`en` is **strict** in `i18n-parity.mjs`'s POLICY, so
every key must be present):

```ts
  'dev.title': 'DEV',
  'dev.actingAs': 'acting as',
  'dev.noPersona': 'no active persona',
  'dev.personaSwitcherPending': 'the role switcher arrives in M1, with the identity table',
  'dev.noStudentPersona': 'no student persona — students have no login in v1',
  'dev.tool.offline': 'offline',
  'dev.tool.slow': 'slow',
  'dev.tool.timeTravel': 'time travel',
  'dev.tool.runJob': 'run a job',
  'dev.tool.simulateIpn': 'simulate IPN',
  'dev.tool.resetDemo': 'reset demo data',
  'dev.pendingIn': 'arrives in ',
  'dev.timeTravel.plusMonth': '+1 month',
  'dev.timeTravel.now': 'back to now',
  'dev.ipn.success': 'success',
  'dev.ipn.amount_mismatch': 'amount mismatch',
  'dev.ipn.forged_ref': 'forged ref',
  'dev.ipn.duplicate': 'duplicate',
```

To `web/packages/i18n/ru/common.ts` (`ru` is **report**, but the file's own docstring says
machine-translated with a native review before launch — follow it rather than leaving a
hole):

```ts
  'dev.title': 'РАЗРАБОТКА',
  'dev.actingAs': 'действует как',
  'dev.noPersona': 'нет активной роли',
  'dev.personaSwitcherPending': 'переключатель ролей появится в M1, вместе с таблицей личностей',
  'dev.noStudentPersona': 'нет роли ученика — у учеников нет входа в версии 1',
  'dev.tool.offline': 'офлайн',
  'dev.tool.slow': 'медленно',
  'dev.tool.timeTravel': 'путешествие во времени',
  'dev.tool.runJob': 'запустить задачу',
  'dev.tool.simulateIpn': 'симуляция IPN',
  'dev.tool.resetDemo': 'сброс демо-данных',
  'dev.pendingIn': 'появится в ',
  'dev.timeTravel.plusMonth': '+1 месяц',
  'dev.timeTravel.now': 'вернуться к текущему времени',
  'dev.ipn.success': 'успех',
  'dev.ipn.amount_mismatch': 'несовпадение суммы',
  'dev.ipn.forged_ref': 'поддельный идентификатор',
  'dev.ipn.duplicate': 'дубликат',
```

**Note on the `dev.ipn.*` key names:** they are the `IpnShape` enum's values verbatim
(`success`, `amount_mismatch`, `forged_ref`, `duplicate`), so the tool renders
`t(locale, \`common.dev.ipn.${shape}\`)` without a mapping table that can fall out of
sync. Task 16's shape-parity test asserts the two lists agree.

- [ ] **Step 5: Run to verify it passes**

```bash
cd web && npx vitest run tools/__tests__/g4-dev-bar.test.ts --reporter=dot
node scripts/i18n-parity.mjs common
```

Expected: PASS, and parity reports no missing `en` keys.

- [ ] **Step 6: Commit**

```bash
git add web/eslint.config.js web/packages/i18n web/tools/__tests__/g4-dev-bar.test.ts
git commit -m "feat(i18n): the dev bar's copy, and G4 extended to cover it

Decision A: routed through @studio/i18n rather than exempted. The switcher's persona
labels are the product's own role names, so inline Hebrew would be a second set that
drifts from people's the day M1 lands -- and an ESLint hole in developer-only code is
a precedent a later lane can cite. index.ts and types.ts are untouched: these are
keys in the existing common namespace, not a tenth one."
```

---

## Task 15: The dev bar container and its tool registry

**Files:**
- Create: `web/packages/ui/src/dev-bar/tools.ts`, `web/packages/ui/src/dev-bar/DevBar.tsx`
- Create: `web/packages/ui/src/dev-bar/tools.test.ts`, `web/packages/ui/src/dev-bar/DevBar.test.tsx`

**Interfaces:**
- Consumes: `registerSlot`, `useSlot`, `clearSlot`, `SlotId` from `../slots` (seam 4, **not reopened**); `Card`, `Button`, `StatusChip`, `Alert`, `EmptyState` from `../primitives/*`; `t`, `DIRECTION`, `Locale` from `@studio/i18n`; `renderIn`, `DIRECTIONS`, `THEMES` from `../testing`.
- Produces:
  - `DevToolKey = 'offline' | 'slow' | 'timeTravel' | 'runJob' | 'simulateIpn'`
  - `DevToolProps = { locale: Locale }`
  - `DEV_TOOL_ORDER: Record<DevToolKey, number>`
  - `PENDING_TOOLS: readonly { key: DevToolKey; milestone: string; labelKey: string }[]`
  - `registerDevTool(key: DevToolKey, render: ComponentType<DevToolProps>): void`
  - `devToolKeys(): readonly DevToolKey[]`
  - `DevIdentity = { isDeveloper: boolean; studioName: string; actingAs?: string }`
  - `DevBar({ identity, locale }: { identity: DevIdentity | null; locale?: Locale })`

**Two design points worth stating before the code:**

*Inline styles, no stylesheet.* Verified before this plan: a CSS file imported by a
module that rollup drops is **still emitted** into the production stylesheet. A dev-bar
stylesheet would therefore ship dev-only rules to every user, which is the "hidden, not
absent" failure §19.4 exists to refuse. The bar styles itself with inline style objects
over the M0.3 token variables — the pattern `HelloProof.tsx` already uses, and the one
D10's ESLint rule actually reads.

*Pending tools are declarative, not registered.* M5 fills `offline`/`slow` and M6/M8 fill
`runJob`. If the placeholders registered themselves into the slot, whether a lane's real
tool replaced the placeholder or the placeholder overwrote the real tool would depend on
module evaluation order. Instead `PENDING_TOOLS` is a list the container consults **only
for keys nothing has registered**, so a lane's registration wins unconditionally and the
placeholder erases itself.

- [ ] **Step 1: Write the failing tests**

`web/packages/ui/src/dev-bar/tools.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSlot, useSlot } from '../slots'
import { DEV_TOOL_ORDER, PENDING_TOOLS, devToolKeys, registerDevTool } from './tools'

const Stub = () => null

describe('the dev-bar tool registry (seam 4)', () => {
  beforeEach(() => clearSlot('dev-bar'))

  it('registers through the dev-bar slot, not a second registry', () => {
    registerDevTool('timeTravel', Stub)
    expect(useSlot('dev-bar').map((e) => e.key)).toEqual(['timeTravel'])
  })

  it('orders tools by §19.4s layout, not by registration order', () => {
    registerDevTool('simulateIpn', Stub)
    registerDevTool('offline', Stub)
    registerDevTool('timeTravel', Stub)
    expect(devToolKeys()).toEqual(['offline', 'timeTravel', 'simulateIpn'])
  })

  it('lets a later lane replace a tool without reopening the container', () => {
    registerDevTool('offline', Stub)
    const Replacement = () => null
    registerDevTool('offline', Replacement)
    const entries = useSlot('dev-bar')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.render).toBe(Replacement)
  })

  it('names every §19.4 tool exactly once', () => {
    expect(Object.keys(DEV_TOOL_ORDER).sort()).toEqual(
      ['offline', 'runJob', 'simulateIpn', 'slow', 'timeTravel'].sort(),
    )
  })

  it('records which milestone fills each unbuilt tool', () => {
    expect(PENDING_TOOLS.map((p) => p.key).sort()).toEqual(['offline', 'runJob', 'slow'])
    for (const pending of PENDING_TOOLS) expect(pending.milestone).toMatch(/^M\d+$/)
  })

  it('never lists a tool as both pending and registered', () => {
    registerDevTool('offline', Stub)
    const registered = new Set(devToolKeys())
    const stillPending = PENDING_TOOLS.filter((p) => !registered.has(p.key)).map((p) => p.key)
    expect(stillPending).not.toContain('offline')
  })
})
```

`web/packages/ui/src/dev-bar/DevBar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { clearSlot } from '../slots'
import { DevBar } from './DevBar'
import { registerDevTool } from './tools'

const DEVELOPER = { isDeveloper: true, studioName: 'מועדון הדגמה' }

describe('DevBar', () => {
  beforeEach(() => clearSlot('dev-bar'))

  it('renders nothing when there is no identity at all', () => {
    const { container } = renderIn(<DevBar identity={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an identity without the developer flag', () => {
    // §19.4 — "Rendered only when the authenticated identity has is_developer."
    const { container } = renderIn(
      <DevBar identity={{ isDeveloper: false, studioName: 'Real Club' }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders for a developer identity, and names the studio it is acting in', () => {
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.getByTestId('studio-dev-bar')).toBeInTheDocument()
    expect(screen.getByText('מועדון הדגמה')).toBeInTheDocument()
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(screen.getByText(t(locale, 'common.dev.title'))).toBeInTheDocument()
  })

  it('says explicitly that there is no student persona — §19.3', () => {
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.getByText(t('he', 'common.dev.noStudentPersona'))).toBeInTheDocument()
  })

  it('shows a pending marker naming the milestone for each unbuilt tool', () => {
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.getByTestId('dev-tool-pending-offline')).toHaveTextContent('M5')
    expect(screen.getByTestId('dev-tool-pending-runJob')).toHaveTextContent('M6')
  })

  it('renders a tool a lane registered, in slot order', () => {
    registerDevTool('offline', () => <span>offline-tool</span>)
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.getByText('offline-tool')).toBeInTheDocument()
  })

  it('drops the pending marker once a lane registers that tool', () => {
    registerDevTool('offline', () => <span>offline-tool</span>)
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.queryByTestId('dev-tool-pending-offline')).toBeNull()
  })

  it('is a complementary landmark, so a screen reader can skip it', () => {
    // It is developer chrome wrapped around someone else's app. An unlabelled div
    // would sit in the tab order and the reading order with no way past it.
    renderIn(<DevBar identity={DEVERLOPER_FIXTURE} />)
    expect(screen.getByRole('complementary', { name: t('he', 'common.dev.title') })).toBeInTheDocument()
  })
})
```

**Note:** replace the `DEVERLOPER_FIXTURE` placeholder with the `DEVELOPER` constant
declared at the top of the file — it is written out here only so the fixture is visible
in every case; use one name consistently.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run packages/ui/src/dev-bar --reporter=dot`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `tools.ts`**

```ts
// §19.4's four tools, registered through the 'dev-bar' slot that M0.2 authored.
//
// Seam 4's whole point: M5 fills `offline`/`slow` and M6/M8 fill `runJob` by adding
// ONE file that calls registerDevTool() at module load. The container is never
// reopened.
//
// Pending tools are declarative rather than registered. If a placeholder registered
// itself into the slot, whether M5's real tool replaced it or it overwrote M5's tool
// would depend on module evaluation order — a race with no error message. Instead the
// container consults PENDING_TOOLS only for keys nothing has registered, so a lane's
// registration wins unconditionally and the placeholder erases itself.
import type { ComponentType } from 'react'
import type { Locale } from '@studio/i18n'
import { registerSlot, useSlot } from '../slots'

export type DevToolKey = 'offline' | 'slow' | 'timeTravel' | 'runJob' | 'simulateIpn'

export type DevToolProps = { locale: Locale }

/** §19.4's layout order: [📴 offline] [🐌 slow] [⏩ +1 month] [↺ reset] [simulate IPN ▾]. */
export const DEV_TOOL_ORDER: Record<DevToolKey, number> = {
  offline: 10,
  slow: 20,
  timeTravel: 30,
  runJob: 40,
  simulateIpn: 50,
}

/** The tools §19.5 specifies and this milestone does not build, and who builds them. */
export const PENDING_TOOLS = [
  { key: 'offline', milestone: 'M5', labelKey: 'common.dev.tool.offline' },
  { key: 'slow', milestone: 'M5', labelKey: 'common.dev.tool.slow' },
  { key: 'runJob', milestone: 'M6', labelKey: 'common.dev.tool.runJob' },
] as const satisfies readonly { key: DevToolKey; milestone: string; labelKey: string }[]

export function registerDevTool(key: DevToolKey, render: ComponentType<DevToolProps>): void {
  registerSlot<DevToolProps>('dev-bar', { key, order: DEV_TOOL_ORDER[key], render })
}

/** The keys currently registered, in slot order. */
export function devToolKeys(): readonly DevToolKey[] {
  return useSlot<DevToolProps>('dev-bar').map((entry) => entry.key as DevToolKey)
}
```

- [ ] **Step 4: Write `DevBar.tsx`**

```tsx
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Alert } from '../primitives/Alert'
import { StatusChip } from '../primitives/StatusChip'
import { useSlot } from '../slots'
import { PENDING_TOOLS } from './tools'
import type { DevToolKey, DevToolProps } from './tools'

/**
 * §19.4 — the dev bar. "Rendered only when the authenticated identity has
 * is_developer. Never shipped to anyone else — the component is tree-shaken out of
 * production client bundles by an env flag, so it is not merely hidden."
 *
 * The tree-shaking is `./index.ts`'s job; this file is the bar itself and is imported
 * only from there (and from its own tests, which must import it DIRECTLY — under
 * vitest the flag is unset, so the switched export is the absent one).
 *
 * **No stylesheet, on purpose.** Verified in M0.4: a CSS file imported by a module
 * rollup drops is still EMITTED into the production stylesheet. A dev-bar stylesheet
 * would ship dev-only rules to every user, which is exactly the "hidden, not absent"
 * outcome §19.4 refuses. Inline style objects over the M0.3 tokens instead — the
 * pattern HelloProof already uses, and the one D10's ESLint rule actually reads.
 *
 * `identity` is null until M1: it is the seam where the verified JWT arrives. Until
 * then every app passes null and the bar renders nothing, which is the correct
 * behaviour for "no developer is signed in" and not a stub.
 */
export type DevIdentity = {
  isDeveloper: boolean
  studioName: string
  /** §19.4 — the persona the API is resolving permissions from. M1 fills it. */
  actingAs?: string
}

const bar: React.CSSProperties = {
  position: 'sticky',
  insetBlockStart: 0,
  zIndex: 9999,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  fontSize: 'var(--text-caption)',
}

export function DevBar({
  identity,
  locale = 'he',
}: {
  identity: DevIdentity | null
  locale?: Locale
}) {
  const entries = useSlot<DevToolProps>('dev-bar')

  // §19.4 — rendered only for a developer identity. Before the flag exists, that is
  // every identity, which is why the apps pass null.
  if (!identity?.isDeveloper) return null

  const registered = new Set(entries.map((entry) => entry.key as DevToolKey))
  const pending = PENDING_TOOLS.filter((tool) => !registered.has(tool.key))

  return (
    <aside
      aria-label={t(locale, 'common.dev.title')}
      data-testid="studio-dev-bar"
      style={bar}
    >
      <StatusChip status="pending" label={t(locale, 'common.dev.title')} />
      <strong>{identity.studioName}</strong>
      <span>
        {t(locale, 'common.dev.actingAs')}:{' '}
        <bdi>{identity.actingAs ?? t(locale, 'common.dev.noPersona')}</bdi>
      </span>

      {entries.map(({ key, render: Tool }) => (
        <span data-testid={`dev-tool-${key}`} key={key}>
          <Tool locale={locale} />
        </span>
      ))}

      {pending.map((tool) => (
        <span data-testid={`dev-tool-pending-${tool.key}`} key={tool.key} style={{ opacity: 0.6 }}>
          {t(locale, tool.labelKey)} · {t(locale, 'common.dev.pendingIn')}
          {tool.milestone}
        </span>
      ))}

      {/* §19.3 — "the dev bar says so explicitly, so the gap is visible rather than
          confusing." */}
      <Alert tone="info">{t(locale, 'common.dev.noStudentPersona')}</Alert>
    </aside>
  )
}
```

**Note:** check `Alert`'s actual prop names and `StatusChip`'s `ChipStatus` union in
`web/packages/ui/src/primitives/` before writing — use what those files declare, not what
is guessed here. If `StatusChip` has no `pending` status, use the closest one its type
allows. Check `--border-width-hairline` and `--text-caption` exist in `tokens.css`; if a
token you want is missing, **do not add one** — `tokens.audit.test.ts` asserts a bijection
with `tokens.roles.ts` and a new token needs a role, which is out of scope here. Use an
existing token.

- [ ] **Step 5: Run to verify they pass**

Run: `cd web && npx vitest run packages/ui/src/dev-bar --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Prove the developer gate bites**

Temporarily change the guard to `if (!identity) return null`:

```bash
cd web && npx vitest run packages/ui/src/dev-bar/DevBar.test.tsx --reporter=dot
```

Expected: FAIL on `renders nothing for an identity without the developer flag`. Restore.

- [ ] **Step 7: Commit**

```bash
git add web/packages/ui/src/dev-bar
git commit -m "feat(ui): the dev bar container and its tool registry

Built from the M0.3 primitives, with inline styles and no stylesheet: a CSS file
imported by a module rollup drops is still emitted into the production stylesheet,
which is the 'hidden not absent' outcome §19.4 refuses. Pending tools are declarative
rather than registered, so a lane's real tool wins without depending on module
evaluation order."
```

---

## Task 16: The two tools that exist today — time travel and the IPN simulator

**Files:**
- Create: `web/packages/ui/src/dev-bar/api.ts`, `TimeTravelTool.tsx`, `IpnSimulatorTool.tsx`, `devTools.ts`
- Create: `web/packages/ui/src/dev-bar/api.test.ts`, `TimeTravelTool.test.tsx`, `IpnSimulatorTool.test.tsx`
- Create: `web/tools/__tests__/ipn-shapes.test.ts`

**Interfaces:**
- Consumes: `registerDevTool`, `DevToolProps` (Task 15); `Button`, `SegmentedControl` from `../primitives/*`.
- Produces:
  - `DEV_NOW_HEADER = 'X-Dev-Now'`
  - `IPN_SHAPES = ['success', 'amount_mismatch', 'forged_ref', 'duplicate'] as const`; `IpnShape = (typeof IPN_SHAPES)[number]`
  - `setDevNow(iso: string | null): void`, `getDevNow(): string | null`
  - `devHeaders(): Record<string, string>`
  - `resetDemoStudio(): Promise<Response>`
  - `simulateIpn(input: { shape: IpnShape; orderPublicRef: string; expectedAmountAgorot: number }): Promise<Response>`

**Why `devHeaders()` lives here:** M1's fetch layer needs to attach `X-Dev-Now` to every
request. Putting the store inside the dev-bar directory means that in production it
resolves — through Task 17's switch — to a function returning `{}`, so the header can
never be sent by a production client at all. M1 imports `devHeaders` from
`@studio/ui/dev-bar` and needs no conditional of its own.

- [ ] **Step 1: Write the failing tests**

`web/packages/ui/src/dev-bar/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEV_NOW_HEADER, IPN_SHAPES, devHeaders, getDevNow, setDevNow, simulateIpn } from './api'

afterEach(() => {
  setDevNow(null)
  vi.restoreAllMocks()
})

describe('the dev-bar client', () => {
  it('sends no header until the clock is moved', () => {
    expect(devHeaders()).toEqual({})
  })

  it('sends X-Dev-Now once the clock is moved', () => {
    setDevNow('2027-03-01T09:00:00.000Z')
    expect(devHeaders()).toEqual({ [DEV_NOW_HEADER]: '2027-03-01T09:00:00.000Z' })
  })

  it('clears back to nothing, so the shift does not outlive the session', () => {
    setDevNow('2027-03-01T09:00:00.000Z')
    setDevNow(null)
    expect(devHeaders()).toEqual({})
    expect(getDevNow()).toBeNull()
  })

  it('names §19.5s four IPN shapes and no others', () => {
    expect([...IPN_SHAPES]).toEqual(['success', 'amount_mismatch', 'forged_ref', 'duplicate'])
  })

  it('posts a simulated IPN to the versioned dev endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await simulateIpn({
      shape: 'amount_mismatch',
      orderPublicRef: '22222222-2222-4222-8222-222222222222',
      expectedAmountAgorot: 32000,
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/dev/upay/simulate-ipn')
    expect(JSON.parse(init.body).shape).toBe('amount_mismatch')
  })

  it('carries the time-travel header on its own calls too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    setDevNow('2027-03-01T09:00:00.000Z')
    await simulateIpn({
      shape: 'success',
      orderPublicRef: '22222222-2222-4222-8222-222222222222',
      expectedAmountAgorot: 32000,
    })
    expect(fetchMock.mock.calls[0]![1].headers[DEV_NOW_HEADER]).toBe('2027-03-01T09:00:00.000Z')
  })
})
```

`web/packages/ui/src/dev-bar/TimeTravelTool.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { TimeTravelTool } from './TimeTravelTool'
import { getDevNow, setDevNow } from './api'

afterEach(() => setDevNow(null))

describe('TimeTravelTool', () => {
  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<TimeTravelTool locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(
      screen.getByRole('button', { name: t(locale, 'common.dev.timeTravel.plusMonth') }),
    ).toBeInTheDocument()
  })

  it('moves the clock forward by a month', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    expect(getDevNow()).not.toBeNull()
    expect(new Date(getDevNow()!).getTime()).toBeGreaterThan(Date.now())
  })

  it('goes back to now, so a session is not stuck in the future', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    await userEvent.click(screen.getByRole('button', { name: 'back to now' }))
    expect(getDevNow()).toBeNull()
  })

  it('shows where the clock is, because a shift that failed looks like no shift', async () => {
    renderIn(<TimeTravelTool locale="en" />)
    await userEvent.click(screen.getByRole('button', { name: '+1 month' }))
    expect(screen.getByTestId('dev-now')).toHaveTextContent(/\d{4}-\d{2}-\d{2}/)
  })
})
```

`web/packages/ui/src/dev-bar/IpnSimulatorTool.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '@studio/i18n'
import { DIRECTIONS, renderIn } from '../testing'
import { IpnSimulatorTool } from './IpnSimulatorTool'
import { IPN_SHAPES } from './api'

afterEach(() => vi.restoreAllMocks())

const ORDER = '22222222-2222-4222-8222-222222222222'

describe('IpnSimulatorTool', () => {
  it.each(DIRECTIONS)('renders in $locale ($dir) — §13', ({ locale, dir }) => {
    renderIn(<IpnSimulatorTool locale={locale} />, { locale })
    expect(document.documentElement.dir).toBe(dir)
    expect(screen.getByText(t(locale, 'common.dev.tool.simulateIpn'))).toBeInTheDocument()
  })

  it('offers all four §19.5 shapes and nothing else', () => {
    renderIn(<IpnSimulatorTool locale="en" />)
    for (const shape of IPN_SHAPES) {
      expect(screen.getByRole('radio', { name: t('en', `common.dev.ipn.${shape}`) })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('radio')).toHaveLength(IPN_SHAPES.length)
  })

  it('posts the selected shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"delivered":false}'))
    vi.stubGlobal('fetch', fetchMock)
    renderIn(<IpnSimulatorTool locale="en" />)
    await userEvent.click(screen.getByRole('radio', { name: 'duplicate' }))
    await userEvent.type(screen.getByLabelText(/order/i), ORDER)
    await userEvent.click(screen.getByRole('button', { name: /simulate/i }))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).shape).toBe('duplicate')
  })

  it('every label key it renders exists in the bundle', () => {
    // A missing key renders as the key itself (packages/i18n/index.ts translate()), so
    // a typo would show `common.dev.ipn.duplicate` on screen and pass a looser test.
    for (const shape of IPN_SHAPES) {
      expect(t('he', `common.dev.ipn.${shape}`)).not.toContain('common.dev')
    }
  })
})
```

`web/tools/__tests__/ipn-shapes.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IPN_SHAPES } from '../../packages/ui/src/dev-bar/api'

/**
 * §19.5's four shapes are named in two languages: `IpnShape` in
 * app/integrations/upay/ipn.py and IPN_SHAPES here. The endpoint rejects an unknown
 * value with a 422, so a drift between them is a runtime failure in the one tool that
 * exists to make §5.10's four security requirements testable.
 *
 * Source-level by necessity, and this is the same technique i18n-parity.mjs uses: the
 * committed openapi.json is exported from the PRODUCTION app (see
 * scripts/export_openapi.py), which by §19.2 has no /dev surface at all — so the schema
 * cannot be the shared source of truth here.
 */
const PY = new URL('../../../app/integrations/upay/ipn.py', import.meta.url)

describe('the IPN shape names agree across the two languages', () => {
  it('matches the Python enum member for member', () => {
    const source = readFileSync(PY, 'utf-8')
    const block = source.slice(source.indexOf('class IpnShape'))
    const members = [...block.matchAll(/^\s{4}[A-Z_]+ = "([a-z_]+)"$/gm)].map((m) => m[1])
    expect(members.sort()).toEqual([...IPN_SHAPES].sort())
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd web && npx vitest run packages/ui/src/dev-bar tools/__tests__/ipn-shapes.test.ts --reporter=dot
```
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Write `api.ts`**

```ts
// The dev bar's own calls into /api/v1/dev/*.
//
// This module lives inside the dev-bar directory so that Task 17's switch removes it
// from a production bundle along with everything else here. That is why `devHeaders()`
// is exported from the same place M1's fetch layer will import it: in production it
// resolves to a function returning {}, so a production client cannot send X-Dev-Now
// even by accident — no conditional of M1's own is needed.

/** Must equal app/core/clock.py's X_DEV_NOW_HEADER. */
export const DEV_NOW_HEADER = 'X-Dev-Now'

/** §19.5's four. Kept in the enum's own order; tools/__tests__/ipn-shapes.test.ts
 *  asserts it equals app/integrations/upay/ipn.py's IpnShape member for member. */
export const IPN_SHAPES = ['success', 'amount_mismatch', 'forged_ref', 'duplicate'] as const
export type IpnShape = (typeof IPN_SHAPES)[number]

const DEV_BASE = '/api/v1/dev'

let devNow: string | null = null

export function setDevNow(iso: string | null): void {
  devNow = iso
}

export function getDevNow(): string | null {
  return devNow
}

/**
 * The headers every request should carry while the dev bar is present. Empty when the
 * clock has not been moved, so the server's default path is the one exercised unless
 * someone deliberately asked otherwise.
 */
export function devHeaders(): Record<string, string> {
  return devNow ? { [DEV_NOW_HEADER]: devNow } : {}
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${DEV_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...devHeaders() },
    body: JSON.stringify(body),
  })
}

export function resetDemoStudio(): Promise<Response> {
  return post('/demo/reset', {})
}

export function simulateIpn(input: {
  shape: IpnShape
  orderPublicRef: string
  expectedAmountAgorot: number
}): Promise<Response> {
  return post('/upay/simulate-ipn', {
    shape: input.shape,
    order_public_ref: input.orderPublicRef,
    expected_amount_agorot: input.expectedAmountAgorot,
  })
}
```

- [ ] **Step 4: Write the two tools and `devTools.ts`**

`TimeTravelTool.tsx`:

```tsx
import { useState } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { getDevNow, setDevNow } from './api'
import type { DevToolProps } from './tools'

/**
 * §19.5 — "Time travel. An X-Dev-Now header shifts the server's clock for that request
 * only, in non-production. This is the only practical way to test the billing run, the
 * debt escalation ladder (day 3 / 7 / 14), health reminders (day 1 / 3 / 7) and trial
 * follow-ups without waiting a fortnight."
 *
 * The current position is displayed rather than implied. A shift that silently failed
 * to apply looks exactly like no shift, and you would spend the afternoon debugging the
 * billing run instead of the header.
 */
export function TimeTravelTool({ locale }: DevToolProps) {
  const [at, setAt] = useState<string | null>(getDevNow())

  const move = (months: number) => {
    const base = at ? new Date(at) : new Date()
    base.setMonth(base.getMonth() + months)
    const iso = base.toISOString()
    setDevNow(iso)
    setAt(iso)
  }

  const reset = () => {
    setDevNow(null)
    setAt(null)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Button onClick={() => move(1)} variant="ghost">
        {t(locale, 'common.dev.timeTravel.plusMonth')}
      </Button>
      {at ? (
        <>
          <span data-testid="dev-now">{at.slice(0, 10)}</span>
          <Button onClick={reset} variant="ghost">
            {t(locale, 'common.dev.timeTravel.now')}
          </Button>
        </>
      ) : null}
    </span>
  )
}
```

`IpnSimulatorTool.tsx`:

```tsx
import { useId, useState } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { SegmentedControl } from '../primitives/SegmentedControl'
import { TextField } from '../primitives/TextField'
import { IPN_SHAPES, simulateIpn } from './api'
import type { IpnShape } from './api'
import type { DevToolProps } from './tools'

/**
 * §19.5 — "Simulate a uPay IPN. The important one. ... These are the four security
 * requirements from §5.10, and without a simulator they are only testable against live
 * money."
 *
 * The order reference is typed rather than picked from a list, because M6 owns
 * payment_order and there is no list to pick from yet. When M6 lands, this becomes a
 * picker and nothing else here changes.
 */
export function IpnSimulatorTool({ locale }: DevToolProps) {
  const [shape, setShape] = useState<IpnShape>('success')
  const [orderRef, setOrderRef] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const fieldId = useId()

  const fire = async () => {
    const response = await simulateIpn({
      shape,
      orderPublicRef: orderRef,
      expectedAmountAgorot: 32000,
    })
    setResult(String(response.status))
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span>{t(locale, 'common.dev.tool.simulateIpn')}</span>
      <SegmentedControl
        legend={t(locale, 'common.dev.tool.simulateIpn')}
        onValueChange={(next) => setShape(next as IpnShape)}
        options={IPN_SHAPES.map((each) => ({
          value: each,
          label: t(locale, `common.dev.ipn.${each}`),
        }))}
        value={shape}
      />
      <TextField
        id={fieldId}
        label="order public_ref"
        onChange={(event) => setOrderRef(event.target.value)}
        value={orderRef}
      />
      <Button onClick={fire} variant="secondary">
        {t(locale, 'common.dev.tool.simulateIpn')}
      </Button>
      {result ? <span data-testid="ipn-result">{result}</span> : null}
    </span>
  )
}
```

**Note:** `TextField`'s `label` is a user-facing string and the extended G4 rule covers
this directory — but the rule matches `JSXText`, not attribute values, so `label="order
public_ref"` will not be flagged. It is nonetheless copy: use
`t(locale, 'common.dev.tool.simulateIpn')`-style keys or add one more key rather than
leaving a literal. Check `TextField`'s and `SegmentedControl`'s real prop signatures in
`web/packages/ui/src/primitives/` and match them exactly.

`devTools.ts`:

```ts
// The tools M0.4 builds, registered into the 'dev-bar' slot at module load. M5 and
// M6/M8 add their own file beside this one; neither this file nor DevBar.tsx is
// reopened to accept them.
import { IpnSimulatorTool } from './IpnSimulatorTool'
import { TimeTravelTool } from './TimeTravelTool'
import { registerDevTool } from './tools'

registerDevTool('timeTravel', TimeTravelTool)
registerDevTool('simulateIpn', IpnSimulatorTool)
```

- [ ] **Step 5: Run to verify they pass**

```bash
cd web && npx vitest run packages/ui/src/dev-bar tools/__tests__/ipn-shapes.test.ts --reporter=dot
```
Expected: PASS.

- [ ] **Step 6: Prove the cross-language gate bites**

Temporarily rename the Python enum's `FORGED_REF` value to `"forged_reference"`:

```bash
cd web && npx vitest run tools/__tests__/ipn-shapes.test.ts --reporter=dot
```

Expected: FAIL, listing the mismatch. Restore.

- [ ] **Step 7: Commit**

```bash
git add web/packages/ui/src/dev-bar web/tools/__tests__/ipn-shapes.test.ts
git commit -m "feat(ui): time travel and the IPN simulator, wired to /api/v1/dev

devHeaders() lives inside the dev-bar directory on purpose: in production it resolves
to a function returning {}, so a production client cannot send X-Dev-Now even by
accident and M1's fetch layer needs no conditional. The four shape names are asserted
against the Python enum, because a drift there breaks the one tool that makes §5.10's
four security requirements testable."
```

---

## Task 17: Tree-shaken out of production, and mounted in all three apps

**Files:**
- Create: `web/packages/ui/src/dev-bar/index.ts`, `web/packages/ui/src/dev-bar/absent.ts`
- Create: `web/tools/__tests__/dev-bar-bundle.test.ts`
- Modify: `web/packages/ui/package.json` (the `./dev-bar` subpath export)
- Modify: `web/apps/{staff,parent,dashboard}/src/App.tsx`
- Modify: `web/apps/{staff,parent,dashboard}/src/App.test.tsx`

**Interfaces:**
- Consumes: `DevBar`, `DevIdentity` (Task 15), `devHeaders` (Task 16).
- Produces: `@studio/ui/dev-bar` exporting `DevBar` and `devHeaders`, switched by the build flag; `VITE_DEV_TOOLS` as the documented opt-in.

**The mechanism, and why it is this one.** Verified before this plan (see the empirical
section): a component selected by `import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'`
is folded to a constant at build time, rollup drops the unreachable branch, and the
marker string is **absent** from `dist/`. With `VITE_DEV_TOOLS=true` at build time it is
**present**. Both directions were measured, and the second is what makes the first worth
asserting: an absence test that could never have found anything is not a test.

Note the switch imports the real module at the top level. That is fine — and was
measured, not assumed — because the module graph is side-effect-free once no live binding
references it. It is also why Task 15 forbids a stylesheet: a CSS import is exactly the
side effect that survives.

- [ ] **Step 1: Write the failing test**

`web/tools/__tests__/dev-bar-bundle.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * §19.4 — "the component is tree-shaken out of production client bundles by an env
 * flag, so it is not merely hidden."
 *
 * "Hidden" and "absent" are different threat models and only one of them survives
 * someone opening devtools, so this builds the app for real and reads what came out.
 *
 * **Both directions, deliberately.** A test that only asserted absence would pass just
 * as happily against a marker that was never in the source. The second case builds the
 * same app with the flag on and requires the marker to be there — that is what makes
 * the first case an assertion rather than a tautology.
 *
 * The marker is the dev bar's own test id, NOT its Hebrew copy: Decision A routes the
 * copy through @studio/i18n, and packages/i18n/he/common.ts ships in every bundle. The
 * copy is inert data; the code that can call /api/v1/dev/* is the thing that must be
 * gone — and those endpoints do not exist in production either (§19.2).
 *
 * ~20s: two real production builds. Worth it — this is the only gate that reads what
 * ships rather than what the config says.
 */
const MARKER = 'studio-dev-bar'
const APP = resolve(new URL('../..', import.meta.url).pathname, 'apps/staff')

function buildAndRead(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), 'devbar-bundle-'))
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: APP,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  })
  const assets = join(out, 'assets')
  return readdirSync(assets)
    .map((file) => readFileSync(join(assets, file), 'utf-8'))
    .join('\n')
}

describe('the dev bar and production bundles', () => {
  it('is absent from a production build', { timeout: 180_000 }, () => {
    expect(buildAndRead({})).not.toContain(MARKER)
  })

  it('is present when VITE_DEV_TOOLS=true — without this the case above proves nothing', {
    timeout: 180_000,
  }, () => {
    expect(buildAndRead({ VITE_DEV_TOOLS: 'true' })).toContain(MARKER)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run tools/__tests__/dev-bar-bundle.test.ts --reporter=dot`
Expected: FAIL on the **second** case — the marker is in neither build, because nothing
mounts the dev bar yet. (The first case passing at this point is exactly the tautology
the second case exists to catch.)

- [ ] **Step 3: Write the switch and the absent shapes**

`web/packages/ui/src/dev-bar/absent.ts`:

```ts
// What `@studio/ui/dev-bar` resolves to in a production build. Not a stub for tests —
// the real production shapes.
export const AbsentDevBar = () => null

/** No dev bar means no time travel, so a production client cannot send the header at
 *  all. M1's fetch layer imports this name unconditionally and needs no branch. */
export const absentDevHeaders = (): Record<string, string> => ({})
```

`web/packages/ui/src/dev-bar/index.ts`:

```ts
// §19.4 — "the component is tree-shaken out of production client bundles by an env
// flag, so it is not merely hidden."
//
// The flag is folded to a literal at build time (Vite `define`), so the ternary below
// becomes `false ? Real : Absent`, rollup drops the unreachable branch, and every
// module reachable only through it leaves the graph. Measured in M0.4 by building the
// staff app twice and grepping dist/: absent with the flag off, present with it on.
// web/tools/__tests__/dev-bar-bundle.test.ts is that measurement, kept.
//
// `import.meta.env.DEV` covers `npm run dev` without anyone having to remember a flag;
// VITE_DEV_TOOLS=true is the opt-in for a *built* bundle — a staging deploy you want
// the bar on. Both fold statically; the combined expression was measured too.
//
// **Import the real module directly in tests.** Under vitest neither value is set, so
// this switch yields the absent shapes and a test importing DevBar from here would
// render nothing and pass for the wrong reason.
import { DevBar as RealDevBar } from './DevBar'
import { devHeaders as realDevHeaders } from './api'
import { AbsentDevBar, absentDevHeaders } from './absent'
import './devTools'

const enabled = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'

export const DevBar = enabled ? RealDevBar : AbsentDevBar
export const devHeaders = enabled ? realDevHeaders : absentDevHeaders
export type { DevIdentity } from './DevBar'
```

**Note on `import './devTools'`:** a bare side-effect import is *not* dropped by
rollup — it is exactly the case that survives DCE, which is the same reason a CSS import
survives. Move the registration inside the enabled branch instead:

```ts
if (enabled) {
  // Registers timeTravel and simulateIpn into the 'dev-bar' slot. Inside the guard, so
  // the module is reachable only from a branch a production build folds away.
  await import('./devTools')
}
```

A top-level `await import` in a module is legal in an ESM build, but if it complicates the
build, use the simplest form that measures clean: import `devTools` from `DevBar.tsx`
itself, which is already inside the dropped subtree. **Verify by running the bundle test
after choosing** — that test is the arbiter, not this note.

- [ ] **Step 4: Add the subpath export**

In `web/packages/ui/package.json`:

```json
  "exports": {
    ".": "./src/index.ts",
    "./theme": "./src/theme.ts",
    "./manifest": "./src/manifest.ts",
    "./dev-bar": "./src/dev-bar/index.ts"
  },
```

A subpath rather than a re-export from `src/index.ts`: the main barrel imports
`./tokens.css`, `./fonts.css` and `./primitives/primitives.css`, so anything reached
through it shares a module record with three side-effectful imports. Keeping the dev bar
on its own entry keeps its subtree cleanly droppable, which is the property the bundle
test measures.

- [ ] **Step 5: Mount it in all three apps**

In each of `web/apps/{staff,parent,dashboard}/src/App.tsx` — shown for `staff`:

```tsx
import { HelloProof, ThemeProvider } from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'

export default function App() {
  return (
    <ThemeProvider>
      {/* §19.4 — rendered only for an identity carrying is_developer. M1 resolves the
          real one from the verified JWT; until then there is no developer signed in
          and the bar correctly renders nothing. In a production build this import
          resolves to a component that returns null and whose module is not in the
          bundle at all (web/tools/__tests__/dev-bar-bundle.test.ts). */}
      <DevBar identity={null} />
      <HelloProof appNameKey="common.appName.staff" />
    </ThemeProvider>
  )
}
```

In each `App.test.tsx`, add:

```tsx
  it('renders no dev bar without a developer identity', () => {
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
```

- [ ] **Step 6: Run to verify it passes**

```bash
cd web && npx vitest run tools/__tests__/dev-bar-bundle.test.ts --reporter=dot
npx vitest run apps --reporter=dot
npm run typecheck && npm run lint
```

Expected: PASS in both directions of the bundle test.

- [ ] **Step 7: Prove the absence gate bites**

Temporarily change the switch to `const enabled = true`:

```bash
cd web && npx vitest run tools/__tests__/dev-bar-bundle.test.ts --reporter=dot
```

Expected: FAIL on `is absent from a production build`. Restore, re-run, green. **Record
both observed outputs in the retrospective.**

- [ ] **Step 8: Commit**

```bash
git add web/packages/ui/src/dev-bar web/packages/ui/package.json web/apps web/tools/__tests__/dev-bar-bundle.test.ts
git commit -m "feat(ui): the dev bar is absent from production bundles, not hidden in them

The gate builds the staff app twice and reads dist/: absent with the flag off,
present with VITE_DEV_TOOLS=true. The second direction is what makes the first an
assertion rather than a tautology -- an absence test that could never have found
anything is not a test. Its own subpath export, so the barrel's three CSS imports
do not anchor the subtree."
```

---

## Task 18: The exit gate, and the record of what actually happened

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-m0-4-demo-studio-and-dev-bar.md` (append the retrospective)
- Modify: `CLAUDE.md` (a §19 line in Core mechanisms)
- Modify: `docs/plan/next-session.md` (mark M0.4 done, name what M1's contract commit inherits)

- [ ] **Step 1: Run the full local gate**

```bash
./scripts/dev-db.sh up
./scripts/lane-check.sh core
./scripts/ci-local.sh
```

Expected: `✅ lane core green (8 scoped gates)` and `✅ all gates green`. If
`ci-local.sh` fails on the api-client diff, run
`.venv/bin/python scripts/export_openapi.py` and the `openapi-typescript` line it prints,
then confirm **no diff appears** — Task 3 means the dev surface must not be in it.

- [ ] **Step 2: Confirm the five restrictions, one command**

```bash
.venv/bin/pytest tests/restrictions -v
```

Expected: every test in all six files passing. Copy the summary line into the
retrospective.

- [ ] **Step 3: Confirm the demo studio round-trips end to end, by hand**

Not a test — the thing the tests are a proxy for:

```bash
.venv/bin/uvicorn app.main:app --reload &
curl -s localhost:8000/api/v1/dev/ping | jq
curl -s -X POST localhost:8000/api/v1/dev/demo/reset | jq
curl -s -H 'X-Dev-Now: 2027-03-01T09:00:00Z' localhost:8000/api/v1/dev/clock | jq
curl -s localhost:8000/api/v1/dev/clock | jq                      # shifted:false again
curl -s -X POST localhost:8000/api/v1/dev/upay/simulate-ipn \
  -H 'Content-Type: application/json' \
  -d '{"shape":"amount_mismatch","order_public_ref":"22222222-2222-4222-8222-222222222222","expected_amount_agorot":32000}' | jq
```

Then, with the dev bar visible: `cd web && npm run dev -w @studio/staff`, temporarily
pass `identity={{ isDeveloper: true, studioName: 'מועדון הדגמה' }}` in `App.tsx`, confirm
the bar renders in RTL with both live tools and the M5/M6 pending markers, then revert the
prop to `null`.

- [ ] **Step 4: Add the §19 line to CLAUDE.md**

Under `## Core mechanisms`:

```markdown
- Developer account (§19 — M0.4): `/dev/*` is **conditionally mounted** — `app/main.py`
  skips `app/routers/dev.py` when `ENV == production`, so the routes do not exist there.
  `app.core.clock.now()` is the **only** clock; `X-Dev-Now` shifts it for one request
  outside production and a test fails the build on any other `datetime.now()` in `app/`.
  The demo studio is created by migration (so production has one), reset from a
  versioned fixture set in `app/services/demo/fixtures.py`, and excluded from every
  cross-studio number by `app.core.demo.exclude_demo_studios`. §19.6's five restrictions
  live in `tests/restrictions/` and run **unscoped in every lane**, like the invariants.
```

- [ ] **Step 5: Append the retrospective to this plan**

Add a `## Retrospective — what actually happened` section covering, at minimum:

- Every planted violation from Steps labelled "prove the gate bites", with the **observed
  failure text**, not a claim that it failed.
- Anything the plan predicted wrongly. The plan's own notes flag four places where the
  code shown is a best guess against files that must be read first: `Alert`/`StatusChip`/
  `TextField`/`SegmentedControl` prop signatures, the token names in `DevBar.tsx`, the
  `tests/config/test_lane_check.py` constants, and the `import './devTools'` form in the
  switch. Record what each turned out to be.
- The final counts: `pytest`, `npm test`, and the scoped-gate number from `lane-check.sh core`.
- Anything found that was latent before this session, in the shape M0.3's finding 7 was
  recorded.

- [ ] **Step 6: Update `docs/plan/next-session.md`**

Mark M0.4 complete and record what M1's contract commit inherits:

```markdown
**M0.4 landed 2026-08-24.** M1's contract commit inherits four specific obligations
from §19, each with a test already written that will go red until it is met:

1. `auth_identity.is_developer BOOLEAN NOT NULL DEFAULT false`, settable only by seed or
   migration. `tests/restrictions/test_04_the_flag_is_not_grantable.py` is vacuous until
   this lands and has a test whose failure message says to delete it at that point.
2. Set `request.state.is_developer` and `request.state.studio_is_demo` from the verified
   JWT and the resolved studio. The rule is already wired into
   `app/core/tenancy.py::studio_id_from_request` and correct; only its inputs are absent.
3. Move `personas` out of `PLANNED_LAYERS` in `app/services/demo/fixtures.py` into a real
   `FixtureLayer` — the nine §19.3 personas. `test_no_layer_is_both_planned_and_present`
   fails if the entry is left behind.
4. The role switcher: `POST /dev/act-as/{person_id}`, `acting_as_person_id` on the
   session, the `X-Acting-As` response header, and an audit entry per switch (§19.4).
   Register it into the `dev-bar` slot with `registerDevTool` — the container is not
   reopened.
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/plan/next-session.md docs/superpowers/plans/2026-08-24-m0-4-demo-studio-and-dev-bar.md
git commit -m "docs(m0.4): the exit gate, the retrospective, and what M1 inherits

Four §19 obligations hand off to M1's contract commit, each with a test already
written that goes red until it is met -- including two that say in their failure
message to delete themselves once they stop being vacuous."
```

---

## Self-review

**Spec coverage — §19, section by section:**

| Spec | Task | Note |
|---|---|---|
| §19.1 demo studio exists in production | 4 | Created by migration, not a seed script |
| §19.1 role switcher | — | **M1.** Person rows do not exist; recorded in Task 18 Step 6 |
| §19.2 `auth_identity.is_developer` | — | **M1.** Restriction 4's tests are written and vacuous |
| §19.2 `studio.is_demo` | — | Already landed (`app/models/studio.py:34`) |
| §19.2 conditional mount | 1 | Mechanism from M0.2; asserted here against the OpenAPI path set |
| §19.2 "a test asserts no route can write the column" | 12 | Vacuous; both detectors self-tested |
| §19.2 "a developer identity cannot resolve a studio where is_demo = false" | 12 | Not vacuous — rule and resolver both asserted |
| §19.3 the nine personas | — | **M1** |
| §19.3 the fixture set | 5 | Shape lands; `PLANNED_LAYERS` records M1–M7's parts, with a test that the lists never overlap |
| §19.3 "no student persona, and the dev bar says so" | 14, 15 | `common.dev.noStudentPersona`, asserted rendered |
| §19.4 rendered only for `is_developer` | 15 | Asserted both ways |
| §19.4 tree-shaken, not hidden | 17 | Both build directions |
| §19.4 `acting_as_person_id`, `X-Acting-As` | — | **M1** |
| §19.5 offline / slow | 15 | Pending marker naming M5; slot reserved |
| §19.5 time travel | 2, 16 | Middleware + client tool |
| §19.5 run a job now | 15 | Pending marker naming M6 |
| §19.5 simulate a uPay IPN, four shapes | 11, 16 | Payloads built and tested; delivery reports `delivered:false` until M6 |
| §19.6 restriction 1 | 12 | Not vacuous |
| §19.6 restriction 2 | 1 | Not vacuous |
| §19.6 restriction 3 | 12 | Partly vacuous, trigger named |
| §19.6 restriction 4 | 12 | Vacuous, trigger named |
| §19.6 restriction 5 | 10 | Not vacuous for the pin; the coverage gate is |
| §19.7 excluded from cross-studio totals | 9 | One shared helper + an allowlisted-callers detector |
| §19.7 `POST /dev/demo/reset` | 6, 7 | Wipe derived from `Base.metadata` |
| §19.7 nightly staging reset | 8 | Worker + declared schedule + anti-rot gate |
| §10.1 four network states | 15 | `offline`/`slow` are M5's; the slot and the pending markers land here |
| §11.2 audit log | 6 | `audit_log` in `NEVER_WIPED`, with the reason |
| §18.2 break-glass excludes health | 12 | `break_glass_may_read` |
| §18.3 operations board totals | 9 | The helper M9 must call |

**Placeholder scan:** the four "Note:" blocks in Tasks 15, 16 and 17 are deliberate and
each names a specific file to read and a specific test that arbitrates the answer — they
are not "TBD". Everything else carries real code. `V_2026_08_24 = FixtureSet_ = None` in
Task 5 is explicitly marked for deletion in the note beneath it.

**Type consistency:** `IpnShape` is `StrEnum` in Python with values `success`,
`amount_mismatch`, `forged_ref`, `duplicate`; `IPN_SHAPES` in TypeScript carries the same
four strings; the i18n keys are `common.dev.ipn.<value>` — one naming, three places, with
Task 16's cross-language test asserting two of them agree. `DevToolKey` is used
identically in `tools.ts`, `DevBar.tsx` and both tool components. `developer_may_act` and
`dev_tools_allowed` keep their keyword-only signatures from Task 1 through Task 12.
`DemoStudioService.wipe_plan()` is referenced by that name in Task 6's tests and its
implementation.

**One known gap, stated rather than hidden:** the `slow` tool has a `DEV_TOOL_ORDER`
entry and a `PENDING_TOOLS` entry but no separate §19.5 line item in the table above —
§19.5 treats "offline / slow" as one tool. Both keys exist so M5 can register them
independently, which is how §10.1's four network states will actually need them.

---

## Retrospective — what actually happened

Recorded after the fact. Every item was verified, not assumed.

**Final state.** 35 commits, `64cbfbe..1221aac`. Backend **316 passed**, 1 skipped, 1 xfailed
(baseline 161). Frontend **574 passed** across 48 files (baseline 526). `tests/restrictions`
holds **62 tests** across six files and runs unscoped in every lane, like `tests/invariants`.
`./scripts/lane-check.sh core` green at **6 scoped gates**; `./scripts/ci-local.sh` green,
including the generated-api-client diff.

### Ten gates that could not fail, found and fixed

This project had found six such gates before M0.4. This milestone found **ten more**, and
three of them were written into this plan:

1. **The `X-Dev-Now` leak test could not fail.** `TestClient` spawns a fresh anyio portal per
   call, so each request gets an isolated context whether or not the middleware resets
   anything. Replaced with a sync unit test of the contract plus an `httpx.ASGITransport`
   test driven by `asyncio.run`, which shares one task — measured at `reset=True → None`,
   `reset=False → 'SHIFTED'`.
2. **`test_the_wipe_plan_deletes_children_before_parents` compared `[] == []`.** Every
   tenant-scoped table in M0's metadata is excluded, so deleting `reversed()` would have
   passed. Fixed with a synthetic parent/child FK pair.
3. **`POST /dev/demo/reset` lost its `session.commit()` and all four prescribed tests stayed
   green** — the response body is built before the commit. The same happened again in the
   nightly worker. Both now have a persistence test reading back through an independent
   session.
4. **The §19.7 detector tested `"exclude_demo_studios" not in text`** — a decoy mention in a
   comment satisfied it. Sharpened to require a call.
5. **The `is_developer` grant detector missed `AuthIdentity(is_developer=True)` and
   `.values(is_developer=True)`** — exactly M1's forms. A mid-milestone fix had traded a
   false positive for a false negative in the one case the gate exists for. Only the
   whole-branch review saw it.
6. **`openapi.json` was stale**, so the "no dev surface" test would have passed before the
   fix it was meant to prove. Caught by regenerating first and watching it fail.
7–10. The wall-clock detector's `date.today()` blind spot; `lane-check.sh core` reading none
   of `app/routers/dev.py`, `app/integrations/` or `app/workers/`; the bundle gate's harness
   leaking `NODE_ENV=test`; and `FixtureLayer.tables` promising "a red build" while nothing
   read it.

### Three things the plan got wrong, found by measurement

- **A CSS file imported by a tree-shaken module is still emitted.** Measured before the plan
  was written: the JS marker vanished from `dist/`, the stylesheet did not. The plan's option
  of "keep dev-bar-only CSS beside the feature" was rejected on that evidence — the dev bar
  is styled with inline objects and has no stylesheet.
- **`uvicorn`'s `reset_contextvars` branch never runs here** (it defaults to `False`). A
  docstring citing it was corrected to name ordinary asyncio per-task context copying, and to
  say what the reset actually protects: the worker path, not the HTTP path.
- **Two docstrings asserted enforcement that does not run.** `seed()` claimed `TenantMixin`
  stamps `studio_id` — the listeners are on `TenantSession` and every caller passes a plain
  `Session`. In a codebase where the comment is the specification, a confidently wrong
  docstring is worse than a missing one: it stops the next author checking.

### Two environment hazards, both self-inflicted

- **Symlinking `web/node_modules` across checkouts silently redirected workspace-internal
  package resolution.** Every `@studio/*` import resolved to the *other* checkout's packages;
  `t()` returned raw keys and the tests passed self-consistently. Copy or reinstall — never
  symlink a workspace's `node_modules`.
- **`docker-compose.yml` pins `container_name`**, so running `ci-local.sh` from a second
  worktree would have created a new project and an empty volume, then claimed the running
  container. `COMPOSE_PROJECT_NAME=studio-manager` makes compose adopt the existing project.

### What M1 inherits

Four obligations, each with a test already written that goes red until met — two of which say
in their own failure message to delete themselves once they stop being vacuous. See
[next-session.md](../../plan/next-session.md).

**One boundary worth knowing:** the `is_developer` static detector catches literal grants
(`= True`, `=1`). A grant through a *variable* is caught at runtime by `developer_may_act`
and restriction 1, not at commit time. That split is deliberate — a grep that pretended to
catch every form would be the more dangerous artefact.
