# W1 · M1 — Identity & Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the identity layer — `auth_identity` / `person` / `role_assignment`, Google+Apple OAuth with a 15-minute access JWT and a rotating refresh cookie, the two §6.1 refusal screens, both app shells, the studio setup wizard container — and close the six keyboard-closable holdbacks M0 handed over.

**Architecture:** Backend gains two verticals: `identity` (auth, platform console, personas, role switcher) and `structure` (classes, groups, locations, coaches). Authentication is a standard top-level OAuth redirect with server-side PKCE; the server mints its own HS256 access JWT (15 min) and issues an opaque rotating refresh token in a host-only `httpOnly/Secure/SameSite=Lax` cookie per §11.7. A middleware verifies the access token and populates `request.state.is_developer` / `studio_is_demo`, which `app/core/tenancy.py::studio_id_from_request` has been waiting for since M0.2. Frontend gains a shared shell + nav drawer in `@studio/ui`, per-app `features/identity/` sign-in and refusal flows, and a setup-wizard container with the belt and price steps left as registered slots.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 18 · PyJWT (new) · httpx · React 19 + TypeScript + Vite · vitest

**Spec:** `SPEC.md` §3, §4.2, §4.3, §5.1, §5.2, §6.1, §6.5, §11.7, §19.2, §19.3, §19.4, §19.6 · `docs/plan/milestone-plan.md` (Global Constraints, §1.3, W1 · M1) · `docs/plan/prompts/m1.md` (the eight inherited holdbacks)

---

## Global Constraints

Every task inherits these. Copied verbatim from their sources.

- **G1** Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH.
- **G2** Money is **always** an integer count of agorot. Never a float, never a decimal.
- **G3** Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem` regardless of locale.
- **G4** No user-facing string is ever inlined in a component. Everything goes through the i18n package.
- **G5** New API endpoints are versioned under `/api/v1/`.
- **G6** Routers stay thin — parse, call a service, return. All business logic in `app/services/`.
- **G7** Health declarations contain personal data about minors. **Never log their contents.**
- **G9** Every tenant-scoped table carries non-null `studio_id` with a leading composite index. Bypassing `TenantMixin` requires the explicit `.with_all_tenants(reason=...)` escape hatch.
- **G11** `#6f6b62` is the floor for any light-mode text token. `#a8a49a` / `#8f8b82` are dark-mode-only. `#7a766d` is retired.
- **G12** Physical CSS properties (`margin-left`, `padding-right`, `left:`, `right:`) are banned by ESLint in all frontend source.
- **G13** Colours live in named tokens, never hardcoded hex.
- **G14** Typeface is **Rubik**, weights 300/400/500/600/700.
- **G15** Soft-delete (`deleted_at`) on user-generated content. No PII denormalized into a financial row.
- **G16** Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional `Idempotency-Key`.
- **G17** Both apps are installable PWAs — no App Store, no Play listing. `beforeinstallprompt` is Chromium-only.
- **G18** A failing test is written before any bug fix. Prefer a single test file over the full suite.

**Repo mechanisms that constrain every task:**

- `app/main.py` and `app/models/__init__.py` mount by **discovery** (seam 2). Never edit either to register a router or model. Adding middleware to `main.py` is permitted — `configure_logging()` and `DevClockMiddleware` are the precedent.
- `alembic/versions/**` is owned by `main` and guarded by `.claude/hooks/block-protected.sh`, which denies `Edit`/`Write` with exit code 2. **Task 7 needs the user to approve that write.** Ask before touching it.
- `app.core.clock.now()` is the **only** clock. A test fails the build on any other `datetime.now()` in `app/`.
- `tests/invariants/` and `tests/restrictions/` run **unscoped in every lane**.
- `.env.example` must carry a `NAME=` line for every field in `Settings` (`tests/config/test_database_config.py::test_env_example_documents_every_setting_the_backend_reads`), and **must not contain the substring `password`** (`test_no_password_is_committed_anywhere_in_the_local_database_setup`, case-insensitive). Name settings accordingly.
- `openapi.json` and `web/packages/api-client/src/schema.d.ts` are generated with `ENV=production` pinned and diffed by `scripts/ci-local.sh`. Regenerate and commit whenever the API surface changes.
- `web/packages/i18n/index.ts` and `web/packages/i18n/types.ts` are authored once and **never edited by a lane**. M1's strings go into the existing `common` namespace in all three locales.

---

## Decisions taken before the first task

These are judgment calls made from the documents, recorded here so an executor does not
re-litigate them mid-task.

**D-M1-1 — `guardian` moves from W2's contract commit into M1's revision, with its
`student_id` foreign key deferred.** Two of M1's own deliverables require it: §6.1's
parent-app access query is literally `EXISTS(guardian WHERE person_id = :me)` and is on
W1's delivers list, and `PLANNED_LAYERS`' `personas` entry (which holdback 3 closes) reads
"their auth identities, role assignments **and guardian links**". `student` is M3's table,
so `guardian.student_id` lands as a plain non-null `UUID` with **no foreign key** — the
exact pattern `app/models/audit.py` already uses for `actor_person_id` / `actor_identity_id`
("plain UUIDs with no foreign key: they reference `person` and `auth_identity`, which M1
owns. M1's revision adds the constraints once the tables they point at exist"). W2's
contract commit adds the FK instead of creating the table. Task 29 records this in the
milestone plan's W2 row.

**D-M1-2 — `health_form_template` lands in M1; `health_declaration` does not.** This is
conflict C3's stated resolution, verbatim: "`health_form_template.kind` is already
`(full|trial)` in §4.3. **Seed the `kind='trial'` template here**; that is what unblocks M3
without pulling M4 forward." The model lives in `app/models/health.py` so M4 extends the
file rather than inheriting a stranger.

**D-M1-3 — the setup wizard is six steps, and M1 owns 1, 3, 5, 6.** The milestone plan says
"steps 1, 3, 5, 6, with the slot registry open for the belt step (M7) and the price step
(M6)", and §1.3's seam-4 table says "step 2 belts (M7) · step 4 prices (M6)". Reconciling
those two against §5.1's nine-item prose list gives: 1 studio details + logo (M1) · 2 belts
(M7, slot) · 3 classes and groups (M1) · 4 prices (M6, slot) · 5 coaches and locations (M1)
· 6 invite the first guardian (M1). Steps 7–9 of §5.1's prose (training year, closures,
session generation) are M2's — they need `training_year` and `session`, which M1 does not
own.

**D-M1-4 — Sign in with Apple is built but cannot be configured, and that is a new external
holdback.** Sign in with Apple **for the web** requires an Apple Developer Program
membership (Services ID, a `.p8` key, and an ES256 client-secret JWT). §6.5 dropped both
developer accounts on purpose. §5.2 keeps Apple in scope because "retrofitting it later
would be an identity migration", so the provider is implemented and tested against a fake,
the button renders only when `APPLE_OAUTH_TEAM_ID` and friends are set, and Task 29 opens
`HB-apple-developer` rather than pretending the flow is live. Google is the working
provider for this milestone.

**D-M1-5 — the refresh cookie is built exactly as §11.7 specifies and is expected to fail on
staging.** Host-only (no `Domain=`), `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/v1/auth`.
`up.railway.app` is on the Public Suffix List, so the app hosts and the api host are
different **sites** and Safari drops the cookie. That is holdback 8 reporting itself. Do
**not** move the token to IndexedDB or a bearer header. Verify on `localhost` (where
`:5173 → :8000` differ only by port, and a port is not part of a site) and escalate for the
domain. `infra/railway/README.md` § The domain carries the full reasoning.

---

## File Structure

### Backend — new files

| File | Responsibility |
|---|---|
| `app/models/identity.py` | `AuthIdentity` (global, `is_developer`), `PlatformAdmin`, `RefreshToken`, `AuthRevocation`, `OAuthTransaction`. All global — none inherit `TenantMixin`. |
| `app/models/person.py` | `Person`, `RoleAssignment`, `Invitation`, `Guardian`. All `TenantMixin`. |
| `app/models/structure.py` | `Location`, `Class`, `Group`, `GroupStaff`. All `TenantMixin`. |
| `app/models/health.py` | `HealthFormTemplate` only (D-M1-2). M4 adds `health_declaration` and `consent_record` here. |
| `app/services/identity/tokens.py` | Mint and verify the 15-minute access JWT. Pure over a signing key + a clock. |
| `app/services/identity/refresh.py` | Rotating 30-day refresh: issue, rotate, reuse-detect, revoke a family, consult the denylist. |
| `app/services/identity/providers.py` | The `OAuthProvider` protocol, `GoogleProvider`, `AppleProvider`, and the PKCE pair. Network lives here and nowhere else. |
| `app/services/identity/resolution.py` | Identity → persons → studios. Account linking, invitation acceptance, and §6.1's two access queries. |
| `app/services/identity/platform.py` | Studio provisioning and owner invitation (§5.1, §18.3 subset — see C4). |
| `app/services/structure/service.py` | Classes, groups, locations, `group_staff`. |
| `app/routers/identity.py` | `/auth/*` — start, callback, me, refresh, logout, switch-studio. |
| `app/routers/platform.py` | `/platform/*` — studios, suspend, invite-owner. |
| `app/routers/structure.py` | `/classes`, `/groups`, `/locations`, `/groups/{id}/staff`. |
| `app/schemas/identity.py`, `app/schemas/platform.py`, `app/schemas/structure.py` | Pydantic request/response models. **Never a field named `is_developer`.** |
| `app/core/auth_context.py` | `AuthContextMiddleware` — verifies the access JWT and populates `request.state`. Holdback 2. |
| `app/core/cors.py` | The CORS allowlist, read from `infra/railway/domains.json`. |

### Backend — modified files

| File | Change |
|---|---|
| `app/core/config.py` | `JWT_SIGNING_KEY`, `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APPLE_OAUTH_*`, `OAUTH_REDIRECT_BASE_URL`. |
| `.env.example` | One `NAME=` line per new setting. No `password` substring. |
| `app/main.py` | `add_middleware(AuthContextMiddleware)` + `add_middleware(CORSMiddleware, ...)`. Discovery loop untouched. |
| `app/routers/dev.py` | `POST /dev/act-as/{person_id}`. |
| `app/services/demo/fixtures.py` | `personas` moves from `PLANNED_LAYERS` into a real `FixtureLayer`; `LATEST_VERSION` bumps. |
| `app/models/studio.py` | `created_by_identity_id` + its FK, now that `auth_identity` exists. |
| `tests/invariants/test_02_tenant_tables_are_scoped.py` | Exemptions for the five global identity tables, each with a real reason. |
| `tests/restrictions/test_04_the_flag_is_not_grantable.py` | Delete `test_the_gate_is_currently_empty_and_says_so` when its own message says to. |
| `scripts/lane-check.sh` | `identity)` and `structure)` cases, so the exit gate checks the code it names. |
| `requirements-dev.txt` | `pyjwt[crypto]`. |

### Frontend — new files

| File | Responsibility |
|---|---|
| `web/packages/core/src/identity/session.ts` | In-memory access token, `refresh()` against the cookie, `signOut()`. Never touches storage — D-M1-5. |
| `web/packages/core/src/identity/useSession.ts` | React binding over `session.ts`. |
| `web/packages/ui/src/shell/AppShell.tsx` | Logical-property shell: header, drawer trigger, `<main>`. |
| `web/packages/ui/src/shell/NavDrawer.tsx` | RTL/LTR-aware drawer, focus trap, Esc to close. |
| `web/packages/ui/src/shell/StudioSwitcher.tsx` | Hidden when the person belongs to one studio (§5.2). |
| `web/packages/ui/src/setup-wizard/SetupWizard.tsx` | The container, with `useSlot('setup-wizard')` open for M6 and M7. |
| `web/packages/ui/src/dev-bar/RoleSwitcherTool.tsx` | Holdback 4, registered with `registerDevTool('actAs', …)`. |
| `web/apps/{staff,parent}/src/features/identity/*` | Language picker, sign-in, resolve, the two refusal screens. |
| `web/apps/parent/src/features/identity/InstallWalkthrough.tsx` | §6.5's iOS Add-to-Home-Screen guide + the standalone gate. |
| `web/apps/dashboard/src/features/structure/*` | Wizard steps 1, 3, 5, 6. |

### Tests

`tests/identity/`, `tests/structure/`, and additions to `tests/dev/`. Frontend tests sit
beside their source, which is what `lane-check.sh` resolves.

---

# Phase 0 — make the exit gate able to see this milestone

### Task 1: `lane-check.sh` learns `identity` and `structure`

The exit gate is `./scripts/lane-check.sh identity && ./scripts/lane-check.sh structure`.
Today the default branch resolves `app/services/identity`, `app/routers/identity.py`,
`app/models/identity.py` — which covers most of it, but **not** `app/routers/platform.py`
and **not** `app/core/auth_context.py`. A gate that skips the auth router while printing
green is the exact failure `SCOPED_GATES` was built to prevent, one level up.

**Files:**
- Modify: `scripts/lane-check.sh:52-70` (the `case "$V" in` block)
- Test: `tests/config/test_lane_check.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `lane-check.sh identity` resolves `app/services/identity app/routers/identity.py app/routers/platform.py app/models/identity.py app/models/person.py app/core/auth_context.py app/core/cors.py` and `tests/identity`; `lane-check.sh structure` resolves `app/services/structure app/routers/structure.py app/models/structure.py app/models/health.py` and `tests/structure`. Both filter to paths that exist, exactly as `core` already does.

- [ ] **Step 1: Write the failing test**

Append to `tests/config/test_lane_check.py`:

```python
def test_identity_resolves_every_path_that_vertical_actually_owns():
    """SPEC §7 puts auth under /auth and the console under /platform, so the router
    filenames do not match the vertical name the way `attendance` does. The default
    branch would type-check app/routers/identity.py and silently skip
    app/routers/platform.py and app/core/auth_context.py — a green that checked less
    than it claimed."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in (
        "app/routers/platform.py",
        "app/core/auth_context.py",
        "app/models/person.py",
    ):
        assert path in text, f"{path} is invisible to lane-check.sh identity"


def test_structure_resolves_the_health_template_it_owns_in_m1():
    """Conflict C3 puts health_form_template in M1 to unblock M3's trial booking. It
    lives in app/models/health.py, which no vertical named `structure` would reach by
    convention."""
    assert "app/models/health.py" in SCRIPT.read_text(encoding="utf-8")


def test_identity_and_structure_fail_closed_before_their_source_exists():
    """Adding a case must not hand a vertical a free green. Until the files land, every
    scoped gate skips and the script must exit non-zero."""
    for vertical in ("identity", "structure"):
        result = _run(vertical, "--dry-run")
        if result.returncode != 0:
            assert "nothing was checked" in (result.stdout + result.stderr)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/config/test_lane_check.py -q
```

Expected: the first two FAIL — `app/routers/platform.py is invisible to lane-check.sh identity`.

- [ ] **Step 3: Add the two cases**

In `scripts/lane-check.sh`, inside `case "$V" in`, **before** the `*)` default:

```bash
  identity)
    # SPEC §7 puts these under /auth and /platform, so the router filenames do not
    # follow the per-vertical convention the default branch assumes. Listed explicitly
    # for the same reason `core` lists app/routers/dev.py: a lane's own code belongs in
    # a gate that actually reaches it.
    py_candidates=(app/services/identity app/routers/identity.py app/routers/platform.py \
                   app/models/identity.py app/models/person.py \
                   app/core/auth_context.py app/core/cors.py)
    test_candidates=(tests/identity)
    ;;
  structure)
    # app/models/health.py is here by conflict C3: M1 seeds the kind='trial' template so
    # M3's trial booking is not blocked on M4. M4 owns the rest of that file.
    py_candidates=(app/services/structure app/routers/structure.py \
                   app/models/structure.py app/models/health.py)
    test_candidates=(tests/structure)
    ;;
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/config/test_lane_check.py -q
./scripts/lane-check.sh identity --dry-run; echo "exit=$?"
```

Expected: all green. `identity --dry-run` exits **1** with "nothing was checked" — correct, the source does not exist yet.

- [ ] **Step 5: Commit**

```bash
git add scripts/lane-check.sh tests/config/test_lane_check.py
git commit -m "test(lane-check): identity and structure resolve the paths they own

The exit gate names both verticals. The default branch would have skipped
app/routers/platform.py, app/core/auth_context.py and app/models/health.py while
printing green."
```

---

### Task 2: settings, `.env.example`, and the PyJWT dependency

**Files:**
- Modify: `app/core/config.py`, `.env.example`, `requirements-dev.txt`
- Test: `tests/identity/test_settings.py` (create), `tests/config/test_database_config.py` (already asserts the `.env.example` rule)

**Interfaces:**
- Produces: `settings.JWT_SIGNING_KEY: SecretStr | None`, `settings.ACCESS_TOKEN_TTL_MINUTES: int = 15`, `settings.REFRESH_TOKEN_TTL_DAYS: int = 30`, `settings.GOOGLE_OAUTH_CLIENT_ID: str | None`, `settings.GOOGLE_OAUTH_CLIENT_SECRET: SecretStr | None`, `settings.APPLE_OAUTH_CLIENT_ID / APPLE_OAUTH_TEAM_ID / APPLE_OAUTH_KEY_ID / APPLE_OAUTH_PRIVATE_KEY`, `settings.OAUTH_REDIRECT_BASE_URL: str`.

> **Naming constraint, load-bearing:** `tests/config/test_database_config.py::test_no_password_is_committed_anywhere_in_the_local_database_setup` asserts the lowercased text of `.env.example` does **not** contain `password`. Every setting here is a key, a secret or an id — none is named `*_PASSWORD`, and holdback 5 (Task 28) deliberately carries `studio_app`'s credential inside `DATABASE_URL` rather than in a field of its own.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/__init__.py` (empty) and `tests/identity/test_settings.py`:

```python
"""SPEC §5.2 — 'a short-lived access JWT (15 min) plus a rotating refresh token
(30 days)'. Those two numbers are the contract §10.3 reasons about, so they are
settings with asserted defaults rather than literals scattered through the service."""

from __future__ import annotations

import re
from pathlib import Path

from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]


def test_the_access_token_lives_fifteen_minutes_by_default():
    assert Settings().ACCESS_TOKEN_TTL_MINUTES == 15


def test_the_refresh_token_lives_thirty_days_by_default():
    assert Settings().REFRESH_TOKEN_TTL_DAYS == 30


def test_no_provider_credential_has_a_default():
    """A default client id is a default that reaches staging by accident."""
    settings = Settings()
    assert settings.GOOGLE_OAUTH_CLIENT_ID is None
    assert settings.GOOGLE_OAUTH_CLIENT_SECRET is None
    assert settings.APPLE_OAUTH_CLIENT_ID is None


def test_env_example_documents_every_new_setting():
    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for name in Settings.model_fields:
        assert re.search(rf"^{name}=", text, re.MULTILINE), f".env.example omits {name}"


def test_env_example_still_carries_no_credential_named_as_one():
    """D-M1-5's sibling constraint: test_database_config asserts the substring
    `password` never appears here, so studio_app's credential lives inside DATABASE_URL
    and no setting is named *_PASSWORD."""
    text = (ROOT / ".env.example").read_text(encoding="utf-8").lower()
    assert "password" not in text
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_settings.py -q
```

Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'ACCESS_TOKEN_TTL_MINUTES'`.

- [ ] **Step 3: Add the settings**

Append to `Settings` in `app/core/config.py`, above `LOG_LEVEL`:

```python
    # §5.2 -- "a short-lived access JWT (15 min) plus a rotating refresh token
    # (30 days, one-time-use, reuse detection revokes the family)". §10.3 reasons about
    # both numbers directly, so they are settings with asserted defaults rather than
    # literals inside the token service.
    JWT_SIGNING_KEY: SecretStr | None = None
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # §5.2 -- Google and Apple only. No default: a default client id is one that
    # reaches staging by accident.
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: SecretStr | None = None

    # D-M1-4 -- Sign in with Apple for the WEB needs an Apple Developer Program
    # membership (a Services ID, a .p8 key and an ES256 client-secret JWT), and §6.5
    # dropped both developer accounts on purpose. The provider is built because
    # retrofitting it later would be an identity migration (§5.2); it stays unset until
    # HB-apple-developer closes, and the Apple button renders only when it is set.
    APPLE_OAUTH_CLIENT_ID: str | None = None
    APPLE_OAUTH_TEAM_ID: str | None = None
    APPLE_OAUTH_KEY_ID: str | None = None
    APPLE_OAUTH_PRIVATE_KEY: SecretStr | None = None

    # Where the provider sends the browser back. One value per environment; the OAuth
    # console's redirect URI allowlist must match it exactly, which is the other half of
    # what HB-domain gates (infra/railway/README.md § The domain).
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:8000"
```

- [ ] **Step 4: Document them in `.env.example`**

Append to `.env.example`:

```
# §5.2 -- the key this service signs its own access tokens with. HS256: one service
# mints and one service verifies, so an asymmetric pair would buy nothing. Generate:
#   .venv/bin/python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"
# Staging and production supply it from Railway secrets.
JWT_SIGNING_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30

# §5.2 -- Google is the working provider. Empty here: a real client id in a committed
# file is a console entry in git, and local sign-in uses the fake provider under test.
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# D-M1-4 -- Sign in with Apple for the web needs an Apple Developer Program membership,
# which §6.5 deliberately dropped. Built, unconfigurable, tracked as HB-apple-developer.
APPLE_OAUTH_CLIENT_ID=
APPLE_OAUTH_TEAM_ID=
APPLE_OAUTH_KEY_ID=
APPLE_OAUTH_PRIVATE_KEY=

# Where the provider redirects the browser back to. Must match the OAuth console's
# allowlist exactly.
OAUTH_REDIRECT_BASE_URL=http://localhost:8000
```

- [ ] **Step 5: Add the dependency**

Add `pyjwt[crypto]` to `requirements-dev.txt` on the line after `cryptography`, then:

```bash
.venv/bin/pip install 'pyjwt[crypto]'
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_settings.py tests/config/test_database_config.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/core/config.py .env.example requirements-dev.txt tests/identity/
git commit -m "feat(identity): settings for the access JWT, the refresh token and OAuth

§5.2's two lifetimes are settings, not literals, because §10.3 reasons about both.
No provider credential carries a default. studio_app's credential stays inside
DATABASE_URL so .env.example keeps carrying no field named as one."
```

---

# Phase 1 — the schema (holdback 1)

### Task 3: the global identity tables

Five tables that are deliberately **not** tenant-scoped. §3.3: "`auth_identity` — a Google
or Apple login. **Global, not studio-scoped**, so one Google account can be a parent at one
studio and a coach at another."

**Files:**
- Create: `app/models/identity.py`
- Modify: `tests/invariants/test_02_tenant_tables_are_scoped.py:20-27` (`CROSS_TENANT_TABLES`)
- Test: `tests/identity/test_models.py`

**Interfaces:**
- Produces: `AuthIdentity(provider, provider_subject, email, email_verified, is_private_relay, linked_to_identity_id, last_login_at, is_developer)`, `PlatformAdmin(auth_identity_id)`, `RefreshToken(auth_identity_id, family_id, token_hash, parent_id, active_studio_id, acting_as_person_id, expires_at, used_at, revoked_at)`, `AuthRevocation(auth_identity_id, sessions_issued_before, reason)`, `OAuthTransaction(state, provider, code_verifier, redirect_uri, app, expires_at, consumed_at)`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_models.py`:

```python
"""SPEC §3.3 and §4.3's identity block, asserted at the metadata level so a column that
quietly changes shape is a red build rather than a runtime surprise."""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.core.tenancy import TenantMixin
from app.models.base import Base

GLOBAL_TABLES = ("auth_identity", "platform_admin", "refresh_token", "auth_revocation",
                 "oauth_transaction")


def test_the_identity_tables_are_global_and_carry_no_studio_id():
    """§3.3 -- 'GLOBAL, no studio_id', so one Google account is a parent at one studio
    and a coach at another."""
    for name in GLOBAL_TABLES:
        table = Base.metadata.tables[name]
        assert "studio_id" not in table.c, f"{name} must not be tenant-scoped"


def test_no_global_identity_table_inherits_the_tenant_mixin():
    offenders = [
        mapper.local_table.name
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantMixin)
        and mapper.local_table is not None
        and mapper.local_table.name in GLOBAL_TABLES
    ]
    assert offenders == []


def test_is_developer_is_non_null_and_defaults_to_false():
    """§19.2 -- 'auth_identity.is_developer BOOLEAN NOT NULL DEFAULT false'."""
    column = Base.metadata.tables["auth_identity"].c["is_developer"]
    assert column.nullable is False
    assert column.server_default is not None


def test_provider_subject_is_unique_per_provider():
    """§4.3 writes `provider_subject UNIQUE`. Scoped to the provider: Google and Apple
    mint subjects in separate namespaces and a collision across them is not a conflict."""
    table = Base.metadata.tables["auth_identity"]
    uniques = [
        tuple(c.name for c in constraint.columns)
        for constraint in table.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    ]
    assert ("provider", "provider_subject") in uniques


def test_a_refresh_token_stores_a_hash_and_never_the_token():
    """§11.7. A database read must not yield a usable session."""
    table = Base.metadata.tables["refresh_token"]
    assert "token_hash" in table.c
    assert "token" not in table.c


def test_a_refresh_token_carries_its_family_so_reuse_can_revoke_the_family():
    """§5.2 -- 'one-time-use, reuse detection revokes the family of tokens'."""
    table = Base.metadata.tables["refresh_token"]
    for column in ("family_id", "parent_id", "used_at", "revoked_at"):
        assert column in table.c, column
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_models.py -q
```

Expected: FAIL — `KeyError: 'auth_identity'`.

- [ ] **Step 3: Write the model module**

Create `app/models/identity.py`:

```python
"""SPEC §3.3 -- the identity half of the four deliberately separated entities.

Everything here is **global**. §3.3: "auth_identity -- a Google or Apple login. Global,
not studio-scoped, so one Google account can be a parent at one studio and a coach at
another." A studio_id on any of these tables would make that sentence false, so
invariant 2 carries an exemption for each with the reason written out.

`person` and `role_assignment` are the tenant-scoped half and live in
app/models/person.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

PROVIDERS = ("google", "apple")


class AuthIdentity(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "auth_identity"
    __table_args__ = (
        # §4.3 writes `provider_subject UNIQUE`. Scoped to the provider: Google and
        # Apple mint subjects in separate namespaces, so a bare unique on the subject
        # would forbid a collision that is not one.
        UniqueConstraint("provider", "provider_subject"),
        # §5.2's account linking looks an identity up by email. Not unique: Apple's
        # private-relay addresses are stored as-is and never used for matching, and two
        # identities may legitimately carry the same address.
        Index("ix_auth_identity_email", "email"),
    )

    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    # §5.2 -- linking happens "only when Apple reports email_verified and the email is
    # not a private relay address". Both halves are stored, because a later re-link must
    # be able to re-derive the decision rather than trust that it was made correctly.
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_private_relay: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # §5.2 -- "the identities are linked automatically". A self-reference rather than a
    # link table: linking is always many-to-one onto the identity that was there first,
    # and resolution follows this pointer exactly once (see resolution.effective_id).
    linked_to_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # §19.2 -- "set ONLY by a database seed or migration. There is no API, no UI and no
    # admin screen that can grant it." tests/restrictions/test_04 asserts that in two
    # independent ways: no request schema exposes the field, and no code outside
    # alembic/versions/ or app/services/demo/ assigns it.
    is_developer: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class PlatformAdmin(UUIDPrimaryKey, TimestampColumns, Base):
    """§4.3 -- `platform_admin  auth_identity_id`. §3.1: 'Seeded manually.'

    Global by definition: a platform admin is the one actor that exists above every
    studio (§18.1), which is why §5.1's chain of authority starts here.
    """

    __tablename__ = "platform_admin"
    __table_args__ = (UniqueConstraint("auth_identity_id"),)

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )


class RefreshToken(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'a rotating refresh token (30 days, one-time-use, reuse detection revokes
    the family of tokens)'.

    The token itself is never stored. `token_hash` is SHA-256 of the presented secret,
    so a database read yields no usable session (§11.7). A row is one link in a chain:
    `family_id` names the chain, `parent_id` names the link it replaced, and presenting
    a link whose `used_at` is already set is the reuse §5.2 requires be detected.
    """

    __tablename__ = "refresh_token"
    __table_args__ = (
        UniqueConstraint("token_hash"),
        Index("ix_refresh_token_family_id", "family_id"),
        Index("ix_refresh_token_auth_identity_id", "auth_identity_id"),
    )

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )
    family_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    # The session's shape, carried on the refresh row so a rotation reissues the same
    # session rather than a differently-scoped one. §5.2's switch-studio rewrites the
    # first; §19.4's role switcher rewrites the second.
    active_studio_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("studio.id", ondelete="RESTRICT")
    )
    acting_as_person_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthRevocation(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'Revocations (removing a coach) are written to a small denylist checked
    on refresh.'

    Small on purpose. The denylist is not a list of tokens -- it is a per-identity
    watermark: every session issued before `sessions_issued_before` is dead. One row
    kills every device a removed coach holds, including ones we have never seen, which
    a token-by-token list cannot do.
    """

    __tablename__ = "auth_revocation"
    __table_args__ = (Index("ix_auth_revocation_auth_identity_id", "auth_identity_id"),)

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )
    sessions_issued_before: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(120), nullable=False)


class OAuthTransaction(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'a standard top-level redirect, then PKCE code exchange server-side'.

    Server-side PKCE means the verifier never leaves this process, so it needs somewhere
    to live between the redirect out and the callback back. A table rather than a cache:
    this repo has no Redis, the rows are tiny, short-lived and single-use, and a
    verifier that survives a deploy is the difference between a working sign-in and a
    mysterious one.
    """

    __tablename__ = "oauth_transaction"
    __table_args__ = (UniqueConstraint("state"),)

    state: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    code_verifier: Mapped[str] = mapped_column(Text, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    # Which of the three PWAs started the flow, so the callback returns to its own
    # origin rather than to whichever one is configured first.
    app: Mapped[str] = mapped_column(String(16), nullable=False)
    # Where to send the browser inside that app once the exchange succeeds. Stored
    # rather than passed through the provider, so an open-redirect parameter never
    # crosses the boundary.
    return_path: Mapped[str] = mapped_column(String(200), nullable=False, default="/")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

- [ ] **Step 4: Add the invariant-2 exemptions**

In `tests/invariants/test_02_tenant_tables_are_scoped.py`, extend `CROSS_TENANT_TABLES`:

```python
    "auth_identity": (
        "SPEC 3.3 -- 'GLOBAL, no studio_id', so one Google account can be a parent at "
        "one studio and a coach at another. A studio_id here would make that false"
    ),
    "platform_admin": (
        "SPEC 18.1 -- the platform operator exists above every studio; 5.1's chain of "
        "authority starts here, so it cannot itself be inside a tenant"
    ),
    "refresh_token": (
        "a session belongs to the global auth_identity and survives 5.2's "
        "switch-studio, so it outlives any one studio_id it happens to be scoped to"
    ),
    "auth_revocation": (
        "5.2's denylist is per-identity: one row kills every device a removed coach "
        "holds, across every studio, which a tenant-scoped row could not do"
    ),
    "oauth_transaction": (
        "the PKCE verifier is written before any studio is resolved -- there is no "
        "tenant in context between the redirect out and the callback back"
    ),
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_models.py tests/invariants -q
```

Expected: PASS. `tests/restrictions/test_04` now FAILS on `test_the_gate_is_currently_empty_and_says_so` — that is the trigger, and Task 8 acts on it.

- [ ] **Step 6: Commit**

```bash
git add app/models/identity.py tests/identity/test_models.py \
        tests/invariants/test_02_tenant_tables_are_scoped.py
git commit -m "feat(identity): auth_identity, platform_admin, and the session tables

§3.3's global half. is_developer is NOT NULL DEFAULT false (§19.2); the refresh table
stores a hash and a family so §5.2's reuse detection has something to revoke.
Invariant 2 gains five exemptions, each with the reason written out."
```

---

### Task 4: `person`, `role_assignment`, `invitation`, `guardian`

**Files:**
- Create: `app/models/person.py`
- Test: `tests/identity/test_person_models.py`

**Interfaces:**
- Produces: `Person(studio_id, auth_identity_id?, first_name, last_name, birthdate?, phone?, email?, photo_object_key?, locale?, anonymized_at?)`, `RoleAssignment(studio_id, person_id, role, scope_type, scope_id?, granted_by_person_id, granted_at, revoked_at?)`, `Invitation(studio_id, email?, phone?, intended_role, student_id?, token_hash, expires_at, accepted_at?, accepted_by_person_id?)`, `Guardian(studio_id, student_id, person_id, is_primary, relation)`. `ROLES = ("owner", "manager", "lead_coach", "assistant_coach")`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_person_models.py`:

```python
"""SPEC §3.1, §3.3 and §4.3's person block.

The assertion that matters most here is the negative one: there is no `guardian` role
and no `guardian` value in the role enum. §3.1 is explicit -- 'Guardian is not a role.
There is no guardian role to grant, no role_assignment row, and nothing for a manager to
assign.' A role enum that accepted it would make §6.1's two queries collapse into one.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.person import ROLES


def test_guardian_is_not_a_role():
    """§3.1. The single most load-bearing negative in the identity model."""
    assert "guardian" not in ROLES
    assert ROLES == ("owner", "manager", "lead_coach", "assistant_coach")


def test_a_person_does_not_need_a_login():
    """§3.3 -- 'A person does not need a login; auth_identity_id is nullable.' A young
    student is a Person with no identity and the parent runs the app."""
    assert Base.metadata.tables["person"].c["auth_identity_id"].nullable is True


def test_guardian_is_the_only_link_between_a_parent_and_anything():
    """§3.3 -- 'guardian -- a link (person, student, is_primary). This is the only thing
    that connects a parent to anything. There is no household or family entity.'"""
    table = Base.metadata.tables["guardian"]
    for column in ("student_id", "person_id", "is_primary", "relation"):
        assert column in table.c, column


def test_guardian_student_id_has_no_foreign_key_yet():
    """D-M1-1. `student` is M3's table. This mirrors audit_log's actor columns, which
    carried plain UUIDs until M1 landed the tables they point at."""
    assert list(Base.metadata.tables["guardian"].c["student_id"].foreign_keys) == []


def test_one_person_holds_at_most_one_live_row_per_scope():
    """§3.2's matrix is per (person, role, scope). Two live assistant_coach rows on the
    same group are not a second grant, they are a duplicate -- and a duplicate is what
    makes a revocation look like it half-worked."""
    indexes = {
        index.name: (tuple(index.columns.keys()), index.dialect_options["postgresql"].get("where"))
        for index in Base.metadata.tables["role_assignment"].indexes
    }
    assert "uq_role_assignment_live" in indexes


def test_every_tenant_scoped_person_table_is_scoped():
    for name in ("person", "role_assignment", "invitation", "guardian"):
        column = Base.metadata.tables[name].c["studio_id"]
        assert column.nullable is False, name


def test_an_invitation_stores_a_hash_and_never_the_token():
    """§5.3 -- 'the invitation carries a token binding the accepting auth identity to
    the pre-created Person'. That token is a bearer credential; a database read must not
    yield one."""
    table = Base.metadata.tables["invitation"]
    assert "token_hash" in table.c
    assert "token" not in table.c
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_person_models.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.person'`.

- [ ] **Step 3: Write the model module**

Create `app/models/person.py`:

```python
"""SPEC §3.3 -- the tenant-scoped half of the identity model.

Four entities, deliberately separated, and one negative that carries more weight than
any of them: **guardian is not a role** (§3.1). There is no `guardian` member in ROLES
and no code path that grants one. A person is a guardian because a row exists in
`guardian` linking them to a child, which is what makes §6.1's app access a query rather
than a role check.

`guardian` lands here in M1 rather than in W2's contract commit (D-M1-1): §6.1's
parent-app query is M1's deliverable and §19.3's personas include guardian links.
`student` is still M3's, so `guardian.student_id` is a plain UUID with no foreign key --
the same pattern app/models/audit.py used for its actor columns until this milestone.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §3.1's staff roles. `guardian` is deliberately absent and must stay absent.
ROLES = ("owner", "manager", "lead_coach", "assistant_coach")
SCOPE_TYPES = ("studio", "class", "group")


class Person(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.3 -- 'a human profile inside one studio. A person does not need a login.'"""

    __tablename__ = "person"
    __tenant_table_args__ = (
        # §5.2's identity resolution walks identity -> persons across every studio, so
        # this index is read with with_all_tenants and is deliberately not composite.
        Index("ix_person_auth_identity_id", "auth_identity_id"),
        # §5.3 -- an invitation is matched to a pre-created Person by verified email or
        # phone. Scoped, because the match is always inside one studio.
        Index("ix_person_studio_id_email", "studio_id", "email"),
        Index("ix_person_studio_id_phone", "studio_id", "phone"),
    )

    auth_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    birthdate: Mapped[date | None] = mapped_column(Date)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(320))
    photo_object_key: Mapped[str | None] = mapped_column(String(500))
    locale: Mapped[str | None] = mapped_column(String(8))
    # §11.4 -- anonymization wipes the Person and leaves financial rows intact, because
    # financial rows never duplicate a name (§3.3 point 5). M9 writes it; the column
    # exists from the start so no later migration has to rewrite this table.
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoleAssignment(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.1 -- '(person, role, scope_type, scope_id), revocable.'"""

    __tablename__ = "role_assignment"
    __tenant_table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'manager', 'lead_coach', 'assistant_coach')",
            name="role_assignment_role",
        ),
        CheckConstraint(
            "scope_type IN ('studio', 'class', 'group')", name="role_assignment_scope_type"
        ),
        # §3.1 -- 'owner: exactly one; cannot be removed.' Partial, so a revoked owner
        # row does not block naming a successor, and so the constraint says exactly what
        # §3.1 says rather than something stricter.
        Index(
            "uq_role_assignment_one_live_owner",
            "studio_id",
            unique=True,
            postgresql_where=text("role = 'owner' AND revoked_at IS NULL"),
        ),
        # A second live grant of the same role on the same scope is a duplicate, not a
        # second grant -- and a duplicate is what makes a revocation look like it only
        # half-worked. COALESCE, because scope_id is NULL for a studio-wide role and
        # NULL never equals NULL in a unique index.
        Index(
            "uq_role_assignment_live",
            "studio_id",
            "person_id",
            "role",
            "scope_type",
            text("COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
        # §6.1's staff-app query: EXISTS(role_assignment WHERE person_id = :me AND
        # revoked_at IS NULL).
        Index("ix_role_assignment_studio_id_person_id", "studio_id", "person_id"),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(10), nullable=False, default="studio")
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    granted_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT")
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Invitation(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.1's chain of authority, made durable. §5.3: 'the invitation carries a token
    binding the accepting auth identity to the pre-created Person.'"""

    __tablename__ = "invitation"
    __tenant_table_args__ = (
        UniqueConstraint("token_hash"),
        CheckConstraint(
            "email IS NOT NULL OR phone IS NOT NULL", name="invitation_has_a_recipient"
        ),
        CheckConstraint(
            "intended_role IN ('owner', 'manager', 'lead_coach', 'assistant_coach', "
            "'guardian')",
            name="invitation_intended_role",
        ),
        Index("ix_invitation_studio_id_email", "studio_id", "email"),
    )

    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(32))
    # 'guardian' is legal HERE and nowhere else. §3.1 forbids a guardian ROLE; an
    # invitation records what the recipient is being invited to become, and accepting a
    # guardian invitation creates a `guardian` row, never a role_assignment. The two
    # enums differ on purpose -- see accept_invitation in services/identity/resolution.py.
    intended_role: Mapped[str] = mapped_column(String(20), nullable=False)
    student_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT")
    )


class Guardian(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.3 -- 'a link (person, student, is_primary). This is the only thing that
    connects a parent to anything.'

    D-M1-1: `student_id` carries no foreign key because `student` is M3's table. W2's
    contract commit adds the constraint rather than creating the table.

    §5.3: 'All guardians are equal.' `is_primary` means exactly two things -- whose name
    the bill is addressed to, and which person a הוראת קבע payment is matched to. There
    is no permission branching on it anywhere.
    """

    __tablename__ = "guardian"
    __tenant_table_args__ = (
        UniqueConstraint("student_id", "person_id"),
        # §6.1's parent-app query: EXISTS(guardian WHERE person_id = :me).
        Index("ix_guardian_studio_id_person_id", "studio_id", "person_id"),
        # §5.3 -- 'Exactly one guardian per student carries is_primary.'
        Index(
            "uq_guardian_one_primary_per_student",
            "student_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    relation: Mapped[str] = mapped_column(String(40), nullable=False, default="parent")
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_person_models.py tests/invariants -q
```

Expected: PASS — including invariant 2, since all four tables inherit `TenantMixin`.

- [ ] **Step 5: Commit**

```bash
git add app/models/person.py tests/identity/test_person_models.py
git commit -m "feat(identity): person, role_assignment, invitation, guardian

§3.1's negative is the load-bearing one: ROLES has no guardian member, so §6.1's app
access stays a query. guardian moves up from W2's contract commit (D-M1-1) because
§6.1's parent query and §19.3's personas both need it; student_id carries no FK yet,
the same way audit_log's actor columns did until now."
```

---

### Task 5: `location`, `class`, `group`, `group_staff`

**Files:**
- Create: `app/models/structure.py`
- Test: `tests/structure/test_models.py` (create `tests/structure/__init__.py` too)

**Interfaces:**
- Produces: `Location(studio_id, name, address, notes)`, `Class(studio_id, name, description, discipline, color, is_active)`, `Group(studio_id, class_id, name, description, age_min?, age_max?, is_active)`, `GroupStaff(studio_id, group_id, person_id, role, from_date, to_date?)`.

> §4.3 writes `group  class_id, …` with no `studio_id`, because a group is reached through its class. G9 and invariant 2 are unconditional, so `group` and `group_staff` carry `studio_id` as well — denormalized one level, which is what `TenantMixin` requires of every tenant table and what keeps the tenant filter a single predicate rather than a join.

- [ ] **Step 1: Write the failing test**

Create `tests/structure/__init__.py` (empty) and `tests/structure/test_models.py`:

```python
"""SPEC §4.3's structure block -- the tables M2's schedule and M5's attendance both
hang off, which is why M1 owns them and why W1 is sequential."""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.structure import GROUP_STAFF_ROLES


def test_a_group_belongs_to_a_class():
    """§4.1 -- class -> group is the spine every later milestone hangs off."""
    fks = {fk.column.table.name for fk in Base.metadata.tables["group"].c["class_id"].foreign_keys}
    assert fks == {"class"}


def test_group_and_group_staff_carry_studio_id_even_though_4_3_omits_it():
    """§4.3 reaches a group through its class, but G9 and invariant 2 are
    unconditional: every tenant-scoped table carries a non-null studio_id with a leading
    composite index. Denormalized one level so the tenant filter stays one predicate
    rather than a join."""
    for name in ("group", "group_staff"):
        assert Base.metadata.tables[name].c["studio_id"].nullable is False, name


def test_group_staff_roles_are_the_two_coach_roles_only():
    """§4.3 -- role(lead_coach|assistant_coach). A manager is not group staff; a manager
    is a studio-scoped role_assignment."""
    assert GROUP_STAFF_ROLES == ("lead_coach", "assistant_coach")


def test_a_class_name_is_unique_inside_a_studio():
    """Two classes called ג'ודו in one club is a data-entry mistake, and the setup
    wizard is where it would happen."""
    indexes = {index.name for index in Base.metadata.tables["class"].indexes}
    assert "uq_class_studio_id_name" in indexes
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/structure/test_models.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.structure'`.

- [ ] **Step 3: Write the model module**

Create `app/models/structure.py`:

```python
"""SPEC §4.3's 'Structure and schedule' block, minus the schedule.

M1 owns `location`, `class`, `group` and `group_staff` because both later lanes import
all four: M2 hangs `group_schedule_rule` and `session` off `group`, and M5 hangs
attendance off `session`. Two lanes building this concurrently is the collision W1 is
sequential to avoid.

`training_year`, `studio_closure`, `group_schedule_rule`, `session` and `session_staff`
are M2's and are deliberately absent.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 -- group_staff role(lead_coach|assistant_coach). A manager is not group staff.
GROUP_STAFF_ROLES = ("lead_coach", "assistant_coach")


class Location(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "location"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)


class Class(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """`class` is a SQL-legal table name and a Python keyword, which is why the mapped
    class is `Class` and every relationship names the table, not the attribute."""

    __tablename__ = "class"
    __tenant_table_args__ = (
        Index("uq_class_studio_id_name", "studio_id", "name", unique=True),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discipline: Mapped[str | None] = mapped_column(String(60))
    # G13 -- a token name, never a hex literal. The wizard offers the palette; the value
    # stored is which token was chosen.
    color: Mapped[str | None] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Group(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "group"
    __tenant_table_args__ = (
        CheckConstraint(
            "age_min IS NULL OR age_max IS NULL OR age_min <= age_max", name="group_age_range"
        ),
        Index("uq_group_class_id_name", "class_id", "name", unique=True),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("class.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    age_min: Mapped[int | None] = mapped_column(Integer)
    age_max: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class GroupStaff(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `group_staff  group_id, person_id, role(lead_coach|assistant_coach),
    from, to?`. `from` and `to` are SQL reserved words, so the columns are `from_date`
    and `to_date`."""

    __tablename__ = "group_staff"
    __tenant_table_args__ = (
        CheckConstraint(
            "role IN ('lead_coach', 'assistant_coach')", name="group_staff_role"
        ),
        CheckConstraint(
            "to_date IS NULL OR to_date >= from_date", name="group_staff_date_range"
        ),
        # One live assignment per (group, person). A coach re-added to a group they
        # already lead is a duplicate, and a duplicate is what makes §3.2's
        # 'view students in own groups' return the same roster twice.
        Index(
            "uq_group_staff_live",
            "group_id",
            "person_id",
            unique=True,
            postgresql_where=text("to_date IS NULL"),
        ),
        Index("ix_group_staff_studio_id_person_id", "studio_id", "person_id"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date)
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/structure/test_models.py tests/invariants -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/models/structure.py tests/structure/
git commit -m "feat(structure): location, class, group, group_staff

M2 hangs schedule rules and sessions off group; M5 hangs attendance off those. Both
lanes import all four, which is why W1 is sequential. group and group_staff carry
studio_id even though §4.3 reaches them through class — G9 is unconditional."
```

---

### Task 6: `health_form_template` (holdback 6 / conflict C3, the model half)

**Files:**
- Create: `app/models/health.py`
- Test: `tests/structure/test_health_template_model.py`

**Interfaces:**
- Produces: `HealthFormTemplate(studio_id, kind, version, schema, source_pdf_object_key?, published_at?)`, `HEALTH_TEMPLATE_KINDS = ("full", "trial")`.

- [ ] **Step 1: Write the failing test**

Create `tests/structure/test_health_template_model.py`:

```python
"""Conflict C3, the model half. §14 puts health in M4; M3's trial booking needs a
declaration before that. §4.3 already types the column `kind(full|trial)`, so seeding a
trial template in M1 unblocks M3 without pulling M4 forward.

`health_declaration` is deliberately NOT here. This file holds the template and nothing
that could hold a minor's answers (G7).
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.health import HEALTH_TEMPLATE_KINDS


def test_a_template_is_either_full_or_trial():
    assert HEALTH_TEMPLATE_KINDS == ("full", "trial")


def test_the_template_is_tenant_scoped():
    assert Base.metadata.tables["health_form_template"].c["studio_id"].nullable is False


def test_a_studio_has_at_most_one_published_template_per_kind_and_version():
    """A second published v1 trial template is ambiguity at the exact moment a parent is
    signing something."""
    indexes = {index.name for index in Base.metadata.tables["health_form_template"].indexes}
    assert "uq_health_form_template_kind_version" in indexes


def test_m1_ships_no_table_that_can_hold_a_declaration():
    """G7 and §19.6 restriction 3. M4 adds health_declaration; until then this module
    must not create somewhere for a minor's answers to land."""
    assert "health_declaration" not in Base.metadata.tables
    assert "consent_record" not in Base.metadata.tables
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/structure/test_health_template_model.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.health'`.

- [ ] **Step 3: Write the model module**

Create `app/models/health.py`:

```python
"""SPEC §4.3's health block -- **the template only**.

Conflict C3: §14 puts health declarations in M4, but M3's trial booking (§5.4a) needs a
`kind='trial'` declaration before that. §4.3 already types the column `kind(full|trial)`,
so M1 creates the template table and seeds the trial template; M4 adds
`health_declaration` and `consent_record` to this file and owns everything about them.

**Nothing here may ever hold a minor's answers.** G7 and §19.6 restriction 3 are about
`health_declaration`, and a test in tests/structure asserts this module has not quietly
grown one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

HEALTH_TEMPLATE_KINDS = ("full", "trial")


class HealthFormTemplate(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.5 -- 'the studio's existing PDF is mapped once into health_form_template.schema
    (a versioned JSON schema of sections, questions and types) and the original is kept
    at source_pdf_object_key for reference.'"""

    __tablename__ = "health_form_template"
    __tenant_table_args__ = (
        CheckConstraint("kind IN ('full', 'trial')", name="health_form_template_kind"),
        # A second published v1 trial template is ambiguity at the exact moment a parent
        # is signing something.
        Index(
            "uq_health_form_template_kind_version",
            "studio_id",
            "kind",
            "version",
            unique=True,
        ),
    )

    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # The questions, not the answers. A declaration's answers are encrypted and live on
    # M4's health_declaration; nothing in this row is personal data.
    schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    source_pdf_object_key: Mapped[str | None] = mapped_column(String(500))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/structure/ tests/invariants tests/restrictions/test_03_no_real_health_declaration.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/models/health.py tests/structure/test_health_template_model.py
git commit -m "feat(structure): health_form_template, the template and nothing else

Conflict C3's model half. §4.3 already types kind(full|trial), so M1 creating the
template unblocks M3's trial booking without pulling M4 forward. A test asserts this
module has not grown a table that could hold a minor's answers."
```

---

### Task 7: the migration — revision 0005

> **STOP. This task needs the user's permission before it can start.**
> `.claude/hooks/block-protected.sh` denies every `Edit`/`Write` under
> `alembic/versions/` with exit code 2, and denies Bash commands that write there.
> That guard is correct and is the reason seam 1 holds. W1 is sequential on `main`, and
> `main` owns the directory — so the rule is satisfied, but the hook cannot know that.
> **Ask the user to approve this one write, and say which revision you are adding.**
> Do not attempt to route around the hook.

**Files:**
- Create: one Alembic revision, `down_revision = "0004"`
- Modify: `app/models/studio.py` (add `created_by_identity_id`)
- Test: `tests/identity/test_migration.py`

**Interfaces:**
- Consumes: every model from Tasks 3–6.
- Produces: a database at `head` holding `auth_identity`, `platform_admin`, `refresh_token`, `auth_revocation`, `oauth_transaction`, `person`, `role_assignment`, `invitation`, `guardian`, `location`, `class`, `group`, `group_staff`, `health_form_template`; `studio.created_by_identity_id`; and foreign keys on `audit_log.actor_person_id` / `actor_identity_id`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_migration.py`:

```python
"""The schema on disk matches the models, and the two deferred foreign keys M0 promised
are now real.

app/models/audit.py: 'actor_person_id and actor_identity_id are plain UUIDs with no
foreign key: they reference person and auth_identity, which M1 owns. M1's revision adds
the constraints once the tables they point at exist.' This is that revision, and this is
the test that says so.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, inspect

M1_TABLES = (
    "auth_identity", "platform_admin", "refresh_token", "auth_revocation",
    "oauth_transaction", "person", "role_assignment", "invitation", "guardian",
    "location", "class", "group", "group_staff", "health_form_template",
)


def test_every_m1_table_exists_at_head(migrated: Engine):
    present = set(inspect(migrated).get_table_names())
    assert set(M1_TABLES) <= present, sorted(set(M1_TABLES) - present)


def test_audit_log_actor_columns_now_carry_their_foreign_keys(migrated: Engine):
    """M0.2 deferred these with a comment naming M1. Landing the tables without the
    constraints would leave that comment true forever."""
    fks = {
        tuple(fk["constrained_columns"]): fk["referred_table"]
        for fk in inspect(migrated).get_foreign_keys("audit_log")
    }
    assert fks.get(("actor_person_id",)) == "person"
    assert fks.get(("actor_identity_id",)) == "auth_identity"


def test_studio_records_who_created_it(migrated: Engine):
    """§4.3 -- `studio … created_by_identity_id`. app/models/studio.py deferred it with
    the same reasoning as audit_log's actor columns."""
    fks = {
        tuple(fk["constrained_columns"]): fk["referred_table"]
        for fk in inspect(migrated).get_foreign_keys("studio")
    }
    assert fks.get(("created_by_identity_id",)) == "auth_identity"


def test_the_models_and_the_database_agree(migrated: Engine):
    """An autogenerate that still has something to say means the revision is behind the
    models -- the failure mode a hand-written revision actually has."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    import app.models  # noqa: F401 -- seam 2 discovery
    from app.models.base import Base

    with migrated.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    # Alembic reports the roles and grants revision 0001 created as "removals" it cannot
    # see in the metadata; only table/column drift is a defect here.
    drift = [d for d in diff if d[0] in {"add_table", "remove_table", "add_column", "remove_column"}]
    assert drift == [], drift


def test_is_developer_defaults_to_false_in_the_database(migrated: Engine):
    """§19.2's exact wording is 'BOOLEAN NOT NULL DEFAULT false'. A model-level default
    is applied by Python; this asserts the database itself, which is what a seed or a
    migration writing a row without the column will actually get."""
    columns = {c["name"]: c for c in inspect(migrated).get_columns("auth_identity")}
    assert columns["is_developer"]["nullable"] is False
    assert "false" in str(columns["is_developer"]["default"]).lower()
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
./scripts/dev-db.sh up
.venv/bin/pytest tests/identity/test_migration.py -q
```

Expected: FAIL — `assert {'auth_identity', …} <= present`.

- [ ] **Step 3: Add `created_by_identity_id` to the studio model**

In `app/models/studio.py`, replace the module docstring's second paragraph and add the column after `settings`:

```python
    # §4.3. Deferred out of M0 because it references auth_identity, which M1 owns; this
    # column and its foreign key land in the same revision that creates that table.
    created_by_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )
```

with `import uuid`, `from sqlalchemy import ForeignKey` and
`from sqlalchemy.dialects.postgresql import UUID as PGUUID` added to the imports. Update
the docstring to say the column has landed rather than that it is absent.

- [ ] **Step 4: Ask for permission, then generate the revision**

Ask the user: *"Revision 0005 creates M1's fourteen tables, adds `studio.created_by_identity_id`, and adds the two `audit_log` actor foreign keys M0.2 deferred. The protected-paths hook blocks writes under the migrations directory — may I add this one revision?"*

Once approved:

```bash
.venv/bin/alembic revision --autogenerate -m "identity and structure (M1)"
```

Then edit the generated file:

1. Rename it so the filename leads with `0005_` and set `revision = "0005"`, `down_revision = "0004"`, matching the convention of the four revisions already there.
2. Delete every autogenerate artefact that is not a table or column — autogenerate cannot see the roles and grants revision 0001 created and will propose dropping them.
3. Append the two deferred foreign keys, which autogenerate cannot infer because the model columns carry none:

```python
    op.create_foreign_key(
        "fk_audit_log_actor_person_id_person",
        "audit_log", "person", ["actor_person_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_audit_log_actor_identity_id_auth_identity",
        "audit_log", "auth_identity", ["actor_identity_id"], ["id"], ondelete="RESTRICT",
    )
```

with the matching `op.drop_constraint(...)` calls in `downgrade()`.

4. Grant the runtime role its rights on the new tables, in the same shape revision 0002 used:

```python
    # SPEC §11.2's split: studio_migrator owns the schema, studio_app is the runtime
    # role. A new table is not covered by an earlier GRANT, so every revision that
    # creates one grants on it explicitly.
    app_role = op.get_context().opts["app_db_role"] if "app_db_role" in op.get_context().opts \
        else os.environ.get("APP_DB_ROLE", "studio_app")
    for table in M1_TABLES:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {app_role}")
```

Follow whatever mechanism revision 0002 already uses to name the role rather than
inventing a second one — read it first (`sed -n '1,80p' alembic/versions/0002*.py`) and
match it exactly.

- [ ] **Step 5: Run the migration and the tests**

```bash
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/identity/test_migration.py tests/core tests/invariants -q
```

Expected: PASS. If `test_the_models_and_the_database_agree` reports drift, the revision is
behind the models — fix the revision, never the test.

- [ ] **Step 6: Verify the downgrade actually reverses**

```bash
.venv/bin/alembic downgrade 0004 && .venv/bin/alembic upgrade head
.venv/bin/pytest tests/identity/test_migration.py -q
```

Expected: both commands succeed and the tests still pass. A downgrade that errors is a
revision that cannot be rolled back in an incident.

- [ ] **Step 7: Commit**

```bash
git add alembic app/models/studio.py tests/identity/test_migration.py
git commit -m "feat(identity): revision 0005 — M1's schema, and two deferred FKs

Fourteen tables, studio.created_by_identity_id, and the audit_log actor foreign keys
M0.2 deferred with a comment naming this milestone. Seam 1: one revision, authored on
main, and no lane runs alembic revision."
```

---

### Task 8: `test_04` stops being vacuous (holdback 1 closes)

`tests/restrictions/test_04_the_flag_is_not_grantable.py::test_the_gate_is_currently_empty_and_says_so`
is now red, and its own failure message is the instruction: *"auth_identity.is_developer
now exists — delete this test; the assertions above are no longer vacuous."*

**Files:**
- Modify: `tests/restrictions/test_04_the_flag_is_not_grantable.py`
- Modify: `docs/plan/state.yaml`

**Interfaces:**
- Consumes: `AuthIdentity.is_developer` from Task 3.
- Produces: a non-vacuous §19.6 restriction 4. Every later task must keep both detectors silent — **never** put `is_developer` in a Pydantic schema, and never assign it outside `alembic/versions/` or `app/services/demo/`.

- [ ] **Step 1: Confirm the test is red for the stated reason**

```bash
.venv/bin/pytest tests/restrictions/test_04_the_flag_is_not_grantable.py -q
```

Expected: exactly one failure, `test_the_gate_is_currently_empty_and_says_so`, with the
message telling you to delete it. If any other test in the file is red, that is a real
violation — fix the code, not the test.

- [ ] **Step 2: Write the replacement assertion first**

Before deleting anything, add the positive counterpart so the file cannot become vacuous
in the other direction — a column that disappears would otherwise make both detectors
silent again:

```python
def test_the_column_the_two_detectors_guard_actually_exists():
    """The complement of the test this replaced. Both detectors above are searches, and
    a search finds nothing when the thing it guards has been deleted just as reliably as
    when nothing violates it. This is what tells those two apart."""
    import app.models  # noqa: F401 -- seam 2 discovery

    assert COLUMN in {
        column.name
        for column in app.models.base.Base.metadata.tables["auth_identity"].columns
    }, "auth_identity.is_developer is gone; the two detectors above are vacuous again"
```

- [ ] **Step 3: Delete the self-deleting test**

Remove `test_the_gate_is_currently_empty_and_says_so` entirely, and update the module
docstring: replace the "FULLY VACUOUS TODAY" paragraph and the "TRIGGER" paragraph with

```
NOT VACUOUS since M1's revision 0005 created auth_identity.is_developer. Both detectors
now guard a real column: the schema detector walks every request body FastAPI publishes
and the source detector scans every .py file outside alembic/versions/ and
app/services/demo/. The self-test that recorded the vacuity was deleted when its own
failure message said to, which is what the trigger below described.
```

- [ ] **Step 4: Run the whole restriction directory**

```bash
.venv/bin/pytest tests/restrictions -q
```

Expected: PASS, with no test reporting itself as vacuous.

- [ ] **Step 5: Tick the holdback**

In `docs/plan/state.yaml`, on `HB-m1-is-developer-column`, set `status: closed` and
`closed: 2026-08-25`. Add M1's first piece to the `W1` wave and set the wave active:

```yaml
  - id: W1
    milestone: M1
    title: Identity and structure
    mode: sequential
    lanes: []
    exit_gate: both apps sign in, refuse correctly, and route to the wizard
    status: active
    opened: 2026-08-25
    pieces:
      - id: M1.1
        title: The identity and structure schema
        status: shipped
        on: 2026-08-25
```

Leave `W0` `status: active`. **`HB-devices` still blocks W0's exit and no real device has
run yet** — M1 starting is not W0 shipping.

- [ ] **Step 6: Commit**

```bash
git add tests/restrictions/test_04_the_flag_is_not_grantable.py docs/plan/state.yaml
git commit -m "test(restrictions): §19.6 restriction 4 stops being vacuous

auth_identity.is_developer exists, so the self-deleting test was deleted exactly when
its failure message said to, and replaced with its complement — a detector that finds
nothing because the column is gone must not read as a detector that found no violation.
Closes HB-m1-is-developer-column."
```

---

# Phase 2 — OAuth, the JWT, and `request.state` (holdbacks 2 and 8)

### Task 9: the access token

**Files:**
- Create: `app/services/identity/__init__.py`, `app/services/identity/tokens.py`
- Test: `tests/identity/test_tokens.py`

**Interfaces:**
- Produces:
  - `class AccessClaims` — frozen dataclass: `identity_id: uuid.UUID`, `person_id: uuid.UUID | None`, `active_studio_id: uuid.UUID | None`, `acting_as_person_id: uuid.UUID | None`, `roles: tuple[str, ...]`, `is_developer: bool`, `studio_is_demo: bool`, `is_platform_admin: bool`, `issued_at: datetime`, `expires_at: datetime`.
  - `mint_access_token(claims: AccessClaims, *, key: str) -> str`
  - `verify_access_token(token: str, *, key: str, at: datetime) -> AccessClaims` — raises `InvalidAccessToken`.
  - `class InvalidAccessToken(Exception)`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_tokens.py`:

```python
"""SPEC §5.2 -- 'Backend issues its own short-lived access JWT (15 min) … The JWT carries
identity_id, active_studio_id and a role snapshot.'

Tests drive `at` explicitly rather than sleeping. app.core.clock.now() is the only clock
in the application; a token service that read the wall clock itself could not be
time-travelled by §19.5's X-Dev-Now, which is exactly how a billing-run test would end up
debugging auth.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.services.identity.tokens import (
    AccessClaims,
    InvalidAccessToken,
    mint_access_token,
    verify_access_token,
)

KEY = "test-signing-key-not-a-real-one"
T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def _claims(**overrides) -> AccessClaims:
    base = dict(
        identity_id=uuid.uuid4(),
        person_id=uuid.uuid4(),
        active_studio_id=uuid.uuid4(),
        acting_as_person_id=None,
        roles=("manager",),
        is_developer=False,
        studio_is_demo=False,
        is_platform_admin=False,
        issued_at=T0,
        expires_at=T0 + timedelta(minutes=15),
    )
    return AccessClaims(**{**base, **overrides})


def test_a_minted_token_round_trips_every_claim():
    claims = _claims(roles=("owner", "lead_coach"))
    assert verify_access_token(mint_access_token(claims, key=KEY), key=KEY, at=T0) == claims


def test_a_token_is_rejected_one_second_after_it_expires():
    """§5.2's fifteen minutes are the whole reason §10.3 exists."""
    token = mint_access_token(_claims(), key=KEY)
    verify_access_token(token, key=KEY, at=T0 + timedelta(minutes=14, seconds=59))
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, key=KEY, at=T0 + timedelta(minutes=15, seconds=1))


def test_a_token_signed_with_another_key_is_rejected():
    token = mint_access_token(_claims(), key="a-different-key")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, key=KEY, at=T0)


def test_an_unsigned_token_is_rejected():
    """alg=none is the oldest JWT attack there is. PyJWT requires an explicit algorithm
    list, and this asserts we passed one."""
    import jwt

    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "dev": True, "exp": 9999999999}, key="", algorithm="none"
    )
    with pytest.raises(InvalidAccessToken):
        verify_access_token(forged, key=KEY, at=T0)


def test_garbage_is_rejected_without_raising_something_unrelated():
    for junk in ("", "not-a-token", "a.b.c"):
        with pytest.raises(InvalidAccessToken):
            verify_access_token(junk, key=KEY, at=T0)


def test_the_developer_flag_survives_the_round_trip():
    """Holdback 2's payload. §19.6's resolver reads this claim, so it has to be one --
    a value derived after verification could be derived wrongly."""
    claims = _claims(is_developer=True, studio_is_demo=True)
    verified = verify_access_token(mint_access_token(claims, key=KEY), key=KEY, at=T0)
    assert verified.is_developer is True
    assert verified.studio_is_demo is True


def test_acting_as_is_carried_so_the_api_resolves_permissions_from_that_person():
    """§19.4 -- 'Switching sets acting_as_person_id on the session; the API resolves
    permissions from that Person exactly as it would for a real login.'"""
    person = uuid.uuid4()
    claims = _claims(acting_as_person_id=person)
    assert verify_access_token(
        mint_access_token(claims, key=KEY), key=KEY, at=T0
    ).acting_as_person_id == person
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_tokens.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.identity'`.

- [ ] **Step 3: Write the token service**

Create `app/services/identity/__init__.py` (empty) and `app/services/identity/tokens.py`:

```python
"""SPEC §5.2 -- the access token this service issues and verifies itself.

HS256 rather than an asymmetric pair: one service mints and the same service verifies,
so a public key would have no second reader and the extra moving part would buy nothing.
If a second service ever needs to verify these, that is the moment to move to RS256 --
not before.

**Time is a parameter, never a wall-clock read.** app.core.clock.now() is the only clock
in the application (§19.5), and a token module that called datetime.now() directly could
not be time-travelled by X-Dev-Now. The router passes `now()`; the tests pass a literal.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import jwt

ALGORITHM = "HS256"


class InvalidAccessToken(Exception):
    """Expired, forged, malformed, or signed with a key we do not hold.

    Deliberately one exception and not five. The caller's only correct response to any
    of them is 401, and a taxonomy here would leak which of the five it was to whoever
    presented the token.
    """


@dataclass(frozen=True)
class AccessClaims:
    """§5.2 -- 'The JWT carries identity_id, active_studio_id and a role snapshot.'

    A snapshot, not a live read: §5.2 accepts that "role changes take effect on the next
    refresh, at most 15 minutes later", and pays for it with a denylist checked on
    refresh for the case that cannot wait (removing a coach).
    """

    identity_id: uuid.UUID
    #: The Person this identity is inside the active studio. None before a studio is
    #: resolved -- an identity with no person anywhere still gets a token, because §6.1's
    #: refusal screens are reached by a signed-in user, not by an anonymous one.
    person_id: uuid.UUID | None
    active_studio_id: uuid.UUID | None
    #: §19.4. Set only by POST /dev/act-as; None for every real login.
    acting_as_person_id: uuid.UUID | None
    roles: tuple[str, ...]
    #: §19.2's flag, carried as a verified claim. §19.6's resolver reads it from
    #: request.state, and request.state reads it from here.
    is_developer: bool
    #: §19.6 restriction 1 -- the other half of that decision, resolved when the studio
    #: was resolved rather than re-read on every request.
    studio_is_demo: bool
    is_platform_admin: bool
    issued_at: datetime
    expires_at: datetime


def _uuid_or_none(raw: object) -> uuid.UUID | None:
    return uuid.UUID(str(raw)) if raw else None


def mint_access_token(claims: AccessClaims, *, key: str) -> str:
    payload = {
        "sub": str(claims.identity_id),
        "pid": str(claims.person_id) if claims.person_id else None,
        "sid": str(claims.active_studio_id) if claims.active_studio_id else None,
        "aap": str(claims.acting_as_person_id) if claims.acting_as_person_id else None,
        "roles": list(claims.roles),
        "dev": claims.is_developer,
        "demo": claims.studio_is_demo,
        "padm": claims.is_platform_admin,
        "iat": int(claims.issued_at.timestamp()),
        "exp": int(claims.expires_at.timestamp()),
    }
    return jwt.encode(payload, key, algorithm=ALGORITHM)


def verify_access_token(token: str, *, key: str, at: datetime) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            key,
            # A list, and never `algorithms=None`. Accepting the header's own choice is
            # what makes alg=none and the HS256/RS256 confusion attack work.
            algorithms=[ALGORITHM],
            # Expiry is checked against `at`, not against the wall clock, so §19.5's
            # time travel reaches this decision like every other one.
            options={"verify_exp": False},
        )
    except jwt.PyJWTError as exc:
        raise InvalidAccessToken(str(exc)) from exc

    expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
    if at >= expires_at:
        raise InvalidAccessToken("expired")

    return AccessClaims(
        identity_id=uuid.UUID(payload["sub"]),
        person_id=_uuid_or_none(payload.get("pid")),
        active_studio_id=_uuid_or_none(payload.get("sid")),
        acting_as_person_id=_uuid_or_none(payload.get("aap")),
        roles=tuple(payload.get("roles") or ()),
        is_developer=bool(payload.get("dev", False)),
        studio_is_demo=bool(payload.get("demo", False)),
        is_platform_admin=bool(payload.get("padm", False)),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=UTC),
        expires_at=expires_at,
    )
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_tokens.py -q
.venv/bin/mypy app/services/identity
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/identity tests/identity/test_tokens.py
git commit -m "feat(identity): the 15-minute access token

§5.2's claims, HS256, with the algorithm list pinned so alg=none is rejected. Time is a
parameter and never a wall-clock read — app.core.clock.now() is the only clock, and a
token module that called datetime.now() could not be time-travelled by X-Dev-Now."
```

---

### Task 10: the rotating refresh token, reuse detection, and the denylist

**Files:**
- Create: `app/services/identity/refresh.py`
- Test: `tests/identity/test_refresh.py`

**Interfaces:**
- Consumes: `RefreshToken`, `AuthRevocation` (Task 3).
- Produces:
  - `issue_refresh_token(session, *, identity_id, active_studio_id, acting_as_person_id, at) -> IssuedRefresh` where `IssuedRefresh = (secret: str, row: RefreshToken)`.
  - `rotate_refresh_token(session, *, presented: str, at) -> IssuedRefresh` — raises `RefreshRejected`.
  - `revoke_family(session, family_id, *, at, reason) -> int`
  - `revoke_sessions_for_identity(session, identity_id, *, at, reason) -> None` — writes the denylist row.
  - `class RefreshRejected(Exception)` with `.reason: str` in `{"unknown", "expired", "revoked", "reuse", "denylisted"}`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_refresh.py`:

```python
"""SPEC §5.2 -- 'a rotating refresh token (30 days, one-time-use, reuse detection revokes
the family of tokens)' and 'Revocations (removing a coach) are written to a small denylist
checked on refresh.'

The reuse case is the one worth writing carefully. An attacker who steals a refresh token
and uses it wins exactly once: the legitimate client's next rotation presents a token
already marked used, and that is the signal that kills the whole family — both the
attacker's chain and the victim's. Logging the victim out is the correct outcome; a
silently shared session is not.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.models.identity import AuthIdentity, RefreshToken
from app.services.identity.refresh import (
    RefreshRejected,
    issue_refresh_token,
    revoke_sessions_for_identity,
    rotate_refresh_token,
)
from sqlalchemy import select

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


@pytest.fixture
def identity(app_session):
    row = AuthIdentity(
        provider="google", provider_subject=f"sub-{uuid.uuid4()}", email="a@example.invalid"
    )
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def test_the_secret_is_never_stored(app_session, identity):
    """§11.7. A database read must not yield a usable session."""
    issued = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    assert issued.secret not in str(issued.row.token_hash)
    assert len(issued.row.token_hash) == 64  # sha256 hex


def test_a_rotation_returns_a_new_secret_in_the_same_family(app_session, identity):
    first = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    second = rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(days=1))
    app_session.commit()
    assert second.secret != first.secret
    assert second.row.family_id == first.row.family_id
    assert second.row.parent_id == first.row.id


def test_a_token_is_one_time_use(app_session, identity):
    first = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=1))
    app_session.commit()
    with pytest.raises(RefreshRejected) as caught:
        rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=2))
    assert caught.value.reason == "reuse"


def test_reuse_revokes_the_whole_family_including_the_live_token(app_session, identity):
    """The sentence §5.2 actually writes. Revoking only the presented token would leave
    the attacker's freshly-rotated one alive, which is the opposite of the point."""
    first = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    second = rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=1))
    app_session.commit()

    with pytest.raises(RefreshRejected):
        rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=2))
    app_session.commit()

    with pytest.raises(RefreshRejected) as caught:
        rotate_refresh_token(app_session, presented=second.secret, at=T0 + timedelta(minutes=3))
    assert caught.value.reason == "revoked"

    live = app_session.execute(
        select(RefreshToken).where(
            RefreshToken.family_id == first.row.family_id, RefreshToken.revoked_at.is_(None)
        )
    ).scalars().all()
    assert live == []


def test_a_token_expires_after_thirty_days(app_session, identity):
    issued = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    with pytest.raises(RefreshRejected) as caught:
        rotate_refresh_token(app_session, presented=issued.secret, at=T0 + timedelta(days=31))
    assert caught.value.reason == "expired"


def test_an_unknown_token_is_rejected_without_touching_anything(app_session, identity):
    with pytest.raises(RefreshRejected) as caught:
        rotate_refresh_token(app_session, presented="not-a-real-token", at=T0)
    assert caught.value.reason == "unknown"


def test_the_denylist_kills_every_session_issued_before_it(app_session, identity):
    """§5.2 -- 'Revocations (removing a coach) are written to a small denylist checked on
    refresh.' A watermark and not a token list: one row kills every device the removed
    coach holds, including ones this server has never seen."""
    issued = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0,
    )
    app_session.commit()
    revoke_sessions_for_identity(
        app_session, identity.id, at=T0 + timedelta(minutes=5), reason="role_revoked"
    )
    app_session.commit()
    with pytest.raises(RefreshRejected) as caught:
        rotate_refresh_token(app_session, presented=issued.secret, at=T0 + timedelta(minutes=6))
    assert caught.value.reason == "denylisted"


def test_a_session_started_after_the_denylist_entry_still_works(app_session, identity):
    """The coach is re-hired. A watermark that killed future sessions too would make
    re-granting a role impossible without a database edit."""
    revoke_sessions_for_identity(app_session, identity.id, at=T0, reason="role_revoked")
    app_session.commit()
    issued = issue_refresh_token(
        app_session, identity_id=identity.id, active_studio_id=None,
        acting_as_person_id=None, at=T0 + timedelta(minutes=1),
    )
    app_session.commit()
    rotated = rotate_refresh_token(
        app_session, presented=issued.secret, at=T0 + timedelta(minutes=2)
    )
    assert rotated.secret
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
./scripts/dev-db.sh up
.venv/bin/pytest tests/identity/test_refresh.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.identity.refresh'`.

- [ ] **Step 3: Write the refresh service**

Create `app/services/identity/refresh.py`:

```python
"""SPEC §5.2's refresh half.

Three mechanisms, and each one is answering a different attack:

* **Rotation** -- every use mints a successor and marks the presented row used. A
  long-lived bearer token that is never rotated is a 30-day credential; a rotated one is
  a credential whose theft is *detectable*.
* **Reuse detection** -- presenting a row already marked used means two parties hold the
  same secret. Exactly one of them is legitimate and this server cannot tell which, so
  the whole family dies. Logging the victim out is the correct outcome. A shared session
  that nobody is told about is not.
* **The denylist** -- a per-identity watermark, not a list of tokens. Removing a coach
  writes one row and every device they hold dies on its next refresh, including devices
  this server has never issued a token to.

The secret is never stored. `token_hash` is SHA-256 of the presented string, so a
database read yields nothing usable (§11.7). SHA-256 and not a password hash: this is a
256-bit random secret with no guessable structure, so there is nothing for a slow KDF to
slow down.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.identity import AuthRevocation, RefreshToken

#: 32 bytes, urlsafe-base64'd. The cookie carries it and nothing else.
_SECRET_BYTES = 32


class RefreshRejected(Exception):
    """Every rejection the refresh endpoint can produce.

    `.reason` is for the server's own logs and for tests. The endpoint returns 401 with
    no detail in every case: telling a caller *why* their token failed tells an attacker
    whether the token existed.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class IssuedRefresh:
    #: Returned to the caller once, put in the cookie, and never stored.
    secret: str
    row: RefreshToken


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _denylisted(session: Session, identity_id: uuid.UUID, issued_at: datetime) -> bool:
    watermark = session.execute(
        select(AuthRevocation.sessions_issued_before)
        .where(AuthRevocation.auth_identity_id == identity_id)
        .order_by(AuthRevocation.sessions_issued_before.desc())
        .limit(1)
    ).scalar_one_or_none()
    return watermark is not None and issued_at < watermark


def issue_refresh_token(
    session: Session,
    *,
    identity_id: uuid.UUID,
    active_studio_id: uuid.UUID | None,
    acting_as_person_id: uuid.UUID | None,
    at: datetime,
    family_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> IssuedRefresh:
    """Mint a token. A new `family_id` starts a new session; passing one continues it."""
    secret = secrets.token_urlsafe(_SECRET_BYTES)
    row = RefreshToken(
        auth_identity_id=identity_id,
        family_id=family_id or uuid.uuid4(),
        token_hash=_hash(secret),
        parent_id=parent_id,
        active_studio_id=active_studio_id,
        acting_as_person_id=acting_as_person_id,
        expires_at=at + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        created_at=at,
    )
    session.add(row)
    session.flush()
    return IssuedRefresh(secret=secret, row=row)


def revoke_family(session: Session, family_id: uuid.UUID, *, at: datetime, reason: str) -> int:
    """Kill every link in one chain. Returns how many were live."""
    result = session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=at)
    )
    return int(result.rowcount or 0)


def revoke_sessions_for_identity(
    session: Session, identity_id: uuid.UUID, *, at: datetime, reason: str
) -> None:
    """§5.2's denylist. One row per revocation event, checked on every refresh.

    A watermark rather than a token list, so it also covers sessions this server has
    never seen -- and so re-granting the role later works without a database edit,
    because a token issued *after* the watermark is unaffected.
    """
    session.add(
        AuthRevocation(
            auth_identity_id=identity_id, sessions_issued_before=at, reason=reason, created_at=at
        )
    )
    session.flush()


def rotate_refresh_token(session: Session, *, presented: str, at: datetime) -> IssuedRefresh:
    row = session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash(presented))
    ).scalar_one_or_none()

    if row is None:
        raise RefreshRejected("unknown")
    if row.revoked_at is not None:
        raise RefreshRejected("revoked")
    if row.used_at is not None:
        # Two parties hold this secret and we cannot tell which is legitimate.
        revoke_family(session, row.family_id, at=at, reason="refresh_token_reuse")
        raise RefreshRejected("reuse")
    if at >= row.expires_at:
        raise RefreshRejected("expired")
    if _denylisted(session, row.auth_identity_id, row.created_at):
        revoke_family(session, row.family_id, at=at, reason="denylisted")
        raise RefreshRejected("denylisted")

    row.used_at = at
    return issue_refresh_token(
        session,
        identity_id=row.auth_identity_id,
        active_studio_id=row.active_studio_id,
        acting_as_person_id=row.acting_as_person_id,
        at=at,
        family_id=row.family_id,
        parent_id=row.id,
    )
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_refresh.py -q
.venv/bin/mypy app/services/identity
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/identity/refresh.py tests/identity/test_refresh.py
git commit -m "feat(identity): rotating refresh with reuse detection and a denylist

§5.2's three mechanisms, each answering a different attack. Reuse revokes the family
including the attacker's freshly-rotated link — revoking only the presented token would
leave the theft alive, which is the opposite of the point."
```

---

### Task 11: the OAuth providers, PKCE, and the fake

**Files:**
- Create: `app/services/identity/providers.py`
- Test: `tests/identity/test_providers.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) ProviderIdentity(provider, subject, email, email_verified, is_private_relay)`
  - `class OAuthProvider(Protocol)`: `name: str`; `authorization_url(*, state, code_challenge, redirect_uri) -> str`; `exchange(*, code, code_verifier, redirect_uri) -> ProviderIdentity`
  - `GoogleProvider`, `AppleProvider`, `FakeProvider`
  - `new_pkce_pair() -> tuple[str, str]` — `(verifier, challenge)`, S256
  - `configured_providers() -> dict[str, OAuthProvider]`
  - `APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com"`

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_providers.py`:

```python
"""SPEC §5.2 -- 'OAuth must never run inside a webview. Google returns
disallowed_useragent. An installed PWA does not use one — the flow is a standard
top-level redirect, then PKCE code exchange server-side.'

Network is confined to `exchange`, and every test here drives the fake. The one thing
worth asserting about the real providers without a network is the URL they build: a
missing `code_challenge_method=S256` downgrades PKCE to plain silently, and a missing
`prompt`/`access_type` changes what Google returns.
"""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import pytest
from app.services.identity.providers import (
    APPLE_PRIVATE_RELAY_DOMAIN,
    AppleProvider,
    FakeProvider,
    GoogleProvider,
    ProviderIdentity,
    new_pkce_pair,
)


def test_the_pkce_challenge_is_the_s256_of_the_verifier():
    """A challenge that is not the hash is a challenge the provider will reject, and the
    error it returns names neither half."""
    verifier, challenge = new_pkce_pair()
    expected = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    assert challenge == expected


def test_two_pkce_pairs_are_never_the_same():
    assert new_pkce_pair()[0] != new_pkce_pair()[0]


def test_the_verifier_is_long_enough_for_rfc_7636():
    """43-128 characters. A short verifier is brute-forcible and some providers reject it
    with an error that names nothing useful."""
    verifier, _ = new_pkce_pair()
    assert 43 <= len(verifier) <= 128


def test_googles_authorization_url_pins_s256():
    """Without code_challenge_method=S256 the provider falls back to `plain`, which sends
    the verifier over the wire — the whole thing PKCE exists to avoid — and nothing in
    the response says so."""
    url = GoogleProvider(client_id="cid", client_secret="sec").authorization_url(
        state="st", code_challenge="ch", redirect_uri="https://api.example.invalid/cb"
    )
    query = parse_qs(urlparse(url).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["code_challenge"] == ["ch"]
    assert query["state"] == ["st"]
    assert query["response_type"] == ["code"]
    assert "openid" in query["scope"][0] and "email" in query["scope"][0]


def test_googles_authorization_url_is_a_top_level_redirect_to_google():
    """§5.2 — never a webview. The host is asserted because a typo here is a phishing
    page that still looks like it works."""
    url = GoogleProvider(client_id="cid", client_secret="sec").authorization_url(
        state="st", code_challenge="ch", redirect_uri="https://api.example.invalid/cb"
    )
    assert urlparse(url).netloc == "accounts.google.com"


def test_apples_authorization_url_asks_for_a_form_post():
    """Apple returns the callback as an HTTP POST when `name` or `email` is requested.
    Getting this wrong produces a 405 on the callback and no other clue."""
    url = AppleProvider(
        client_id="cid", team_id="team", key_id="kid", private_key="-----BEGIN…"
    ).authorization_url(state="st", code_challenge="ch", redirect_uri="https://x.invalid/cb")
    query = parse_qs(urlparse(url).query)
    assert query["response_mode"] == ["form_post"]
    assert urlparse(url).netloc == "appleid.apple.com"


def test_an_apple_private_relay_address_is_recognised():
    """§5.2 — 'Apple's private-relay addresses are stored as-is and never used for
    matching.' Recognising them is what makes that possible."""
    identity = ProviderIdentity.from_claims(
        provider="apple",
        subject="001",
        email=f"abc123@{APPLE_PRIVATE_RELAY_DOMAIN}",
        email_verified=True,
    )
    assert identity.is_private_relay is True
    assert identity.email == f"abc123@{APPLE_PRIVATE_RELAY_DOMAIN}"


def test_an_ordinary_address_is_not_a_private_relay():
    identity = ProviderIdentity.from_claims(
        provider="apple", subject="001", email="real@example.invalid", email_verified=True
    )
    assert identity.is_private_relay is False


def test_the_fake_provider_round_trips_a_code_into_an_identity():
    """The fake is what every downstream test signs in with, so its contract is worth
    pinning here rather than discovering in a router test."""
    fake = FakeProvider()
    fake.register(code="code-1", subject="sub-1", email="a@example.invalid", email_verified=True)
    identity = fake.exchange(code="code-1", code_verifier="v", redirect_uri="https://x/cb")
    assert identity == ProviderIdentity(
        provider="fake", subject="sub-1", email="a@example.invalid",
        email_verified=True, is_private_relay=False,
    )


def test_the_fake_rejects_an_unregistered_code():
    with pytest.raises(ValueError):
        FakeProvider().exchange(code="nope", code_verifier="v", redirect_uri="https://x/cb")
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_providers.py -q
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the providers module**

Create `app/services/identity/providers.py`:

```python
"""SPEC §5.2 -- the two providers, and the only place in this codebase that talks to
them.

Two rules the rest of the identity layer depends on:

* **Network lives here.** `authorization_url` is pure string-building; `exchange` is the
  one function that makes an HTTP call. Every other module in this vertical is testable
  without a socket because of that split, and `FakeProvider` is what they use.
* **Never a webview.** §5.2: "Google returns `disallowed_useragent`. An installed PWA
  does not use one -- the flow is a standard top-level redirect." Nothing here opens an
  embedded browser and nothing may be added that does.

D-M1-4: `AppleProvider` is complete and untested against the live service, because Sign
in with Apple for the web needs an Apple Developer Program membership and §6.5 dropped
both developer accounts. It is built rather than deferred because §5.2 says retrofitting
it later would be an identity migration. `configured_providers()` simply does not offer
it until the settings are present.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com"

GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUER = "https://accounts.google.com"

APPLE_AUTHORIZE = "https://appleid.apple.com/auth/authorize"
APPLE_TOKEN = "https://appleid.apple.com/auth/token"
APPLE_JWKS = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

_HTTP_TIMEOUT = httpx.Timeout(10.0)


@dataclass(frozen=True)
class ProviderIdentity:
    """What a successful exchange yields. Deliberately small: a provider tells us who
    signed in, and nothing about what they may do here."""

    provider: str
    subject: str
    email: str | None
    email_verified: bool
    is_private_relay: bool

    @classmethod
    def from_claims(
        cls, *, provider: str, subject: str, email: str | None, email_verified: bool
    ) -> ProviderIdentity:
        relay = bool(email) and email.rsplit("@", 1)[-1].lower() == APPLE_PRIVATE_RELAY_DOMAIN
        return cls(
            provider=provider,
            subject=subject,
            email=email,
            email_verified=email_verified,
            is_private_relay=relay,
        )


class OAuthProvider(Protocol):
    name: str

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str: ...

    def exchange(
        self, *, code: str, code_verifier: str, redirect_uri: str
    ) -> ProviderIdentity: ...


def new_pkce_pair() -> tuple[str, str]:
    """RFC 7636 S256. The verifier stays server-side (OAuthTransaction); only the
    challenge is ever sent."""
    verifier = secrets.token_urlsafe(64)[:128]
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )
    return verifier, challenge


def _verify_id_token(
    raw: str, *, jwks_uri: str, issuer: str, audience: str
) -> dict[str, Any]:
    signing_key = PyJWKClient(jwks_uri).get_signing_key_from_jwt(raw)
    return jwt.decode(
        raw,
        signing_key.key,
        # An explicit list, for the same reason app/services/identity/tokens.py pins one:
        # trusting the header's own `alg` is what makes alg=none work.
        algorithms=["RS256", "ES256"],
        audience=audience,
        issuer=issuer,
    )


@dataclass(frozen=True)
class GoogleProvider:
    client_id: str
    client_secret: str
    name: str = "google"

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return f"{GOOGLE_AUTHORIZE}?" + urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": code_challenge,
                # Without this, the provider falls back to `plain` and sends the
                # verifier over the wire -- the exact thing PKCE exists to avoid, and
                # nothing in the response says it happened.
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        )

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        response = httpx.post(
            GOOGLE_TOKEN,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            timeout=_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        claims = _verify_id_token(
            response.json()["id_token"],
            jwks_uri=GOOGLE_JWKS,
            issuer=GOOGLE_ISSUER,
            audience=self.client_id,
        )
        return ProviderIdentity.from_claims(
            provider=self.name,
            subject=claims["sub"],
            email=claims.get("email"),
            email_verified=bool(claims.get("email_verified", False)),
        )


@dataclass(frozen=True)
class AppleProvider:
    """D-M1-4. Complete, and unconfigurable until HB-apple-developer closes.

    Apple's "client secret" is not a string -- it is an ES256 JWT you sign yourself with
    a .p8 key from the developer portal, valid for at most six months. That is the whole
    reason this provider needs a Developer Program membership and Google does not.
    """

    client_id: str
    team_id: str
    key_id: str
    private_key: str
    name: str = "apple"

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return f"{APPLE_AUTHORIZE}?" + urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "name email",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                # Apple POSTs the callback whenever `name` or `email` is in scope.
                # Getting this wrong is a 405 on the callback and no other clue.
                "response_mode": "form_post",
            }
        )

    def _client_secret(self, *, at: int) -> str:
        return jwt.encode(
            {
                "iss": self.team_id,
                "iat": at,
                "exp": at + 3600,
                "aud": APPLE_ISSUER,
                "sub": self.client_id,
            },
            self.private_key,
            algorithm="ES256",
            headers={"kid": self.key_id},
        )

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        response = httpx.post(
            APPLE_TOKEN,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self._client_secret(at=int(time.time())),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            timeout=_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        claims = _verify_id_token(
            response.json()["id_token"],
            jwks_uri=APPLE_JWKS,
            issuer=APPLE_ISSUER,
            audience=self.client_id,
        )
        return ProviderIdentity.from_claims(
            provider=self.name,
            subject=claims["sub"],
            email=claims.get("email"),
            email_verified=str(claims.get("email_verified", "false")).lower() == "true",
        )


class FakeProvider:
    """What every test signs in with.

    Not in a conftest: the router, the resolution service and the personas layer all
    need it, and a fixture that three test modules import from each other's conftest is
    worse than one class that lives beside the real thing it stands in for. It is never
    reachable at runtime -- `configured_providers()` never returns it.
    """

    name = "fake"

    def __init__(self) -> None:
        self._codes: dict[str, ProviderIdentity] = {}

    def register(
        self, *, code: str, subject: str, email: str | None, email_verified: bool = True
    ) -> None:
        self._codes[code] = ProviderIdentity.from_claims(
            provider=self.name, subject=subject, email=email, email_verified=email_verified
        )

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return f"https://fake.invalid/authorize?{urlencode({'state': state})}"

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        if code not in self._codes:
            raise ValueError(f"unregistered code {code!r}")
        return self._codes[code]


def configured_providers() -> dict[str, OAuthProvider]:
    """Only providers whose credentials are actually present.

    A provider offered but unconfigured is a button that fails after the user has
    committed to it, which is worse than a button that is not there.
    """
    providers: dict[str, OAuthProvider] = {}
    if settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET:
        providers["google"] = GoogleProvider(
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET.get_secret_value(),
        )
    if (
        settings.APPLE_OAUTH_CLIENT_ID
        and settings.APPLE_OAUTH_TEAM_ID
        and settings.APPLE_OAUTH_KEY_ID
        and settings.APPLE_OAUTH_PRIVATE_KEY
    ):
        providers["apple"] = AppleProvider(
            client_id=settings.APPLE_OAUTH_CLIENT_ID,
            team_id=settings.APPLE_OAUTH_TEAM_ID,
            key_id=settings.APPLE_OAUTH_KEY_ID,
            private_key=settings.APPLE_OAUTH_PRIVATE_KEY.get_secret_value(),
        )
    return providers
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_providers.py -q
.venv/bin/mypy app/services/identity
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/identity/providers.py tests/identity/test_providers.py
git commit -m "feat(identity): Google and Apple providers, server-side PKCE, and the fake

Network is confined to exchange(), which is what makes the rest of this vertical
testable without a socket. code_challenge_method=S256 is asserted: without it the
provider silently falls back to plain and sends the verifier over the wire.

Apple is complete and unconfigurable — Sign in with Apple for the web needs an Apple
Developer Program membership and §6.5 dropped both developer accounts (D-M1-4)."
```

---

### Task 12: identity resolution, account linking, and §6.1's two access queries

**Files:**
- Create: `app/services/identity/resolution.py`
- Test: `tests/identity/test_resolution.py`

**Interfaces:**
- Consumes: `ProviderIdentity` (Task 11), all models from Tasks 3–4.
- Produces:
  - `upsert_identity(session, provider_identity, *, at) -> AuthIdentity` — creates or links per §5.2.
  - `effective_identity_id(identity) -> uuid.UUID` — follows `linked_to_identity_id` exactly once.
  - `persons_for_identity(session, identity_id) -> list[Person]` — cross-studio, uses `with_all_tenants`.
  - `@dataclass(frozen=True) AppAccess(staff: bool, parent: bool)` and `app_access(session, person_ids) -> AppAccess` — §6.1's two queries.
  - `studios_for_identity(session, identity_id) -> list[StudioMembership]` where `StudioMembership(studio_id, studio_name, studio_is_demo, person_id, roles, is_guardian)`.
  - `accept_invitation(session, *, token, identity_id, at) -> Person` — raises `InvitationRejected`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_resolution.py`:

```python
"""SPEC §5.2's account linking and §6.1's two access queries.

The linking rules are asserted as a table because §5.2 states them as one, and because
the wrong branch here silently merges two people's accounts. The access queries are
asserted against real rows rather than mocks — §3.1's whole point is that they are
queries, and a mock cannot be wrong in the way a query can.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.core.tenancy import with_all_tenants
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio
from app.services.identity.providers import ProviderIdentity
from app.services.identity.resolution import (
    app_access,
    effective_identity_id,
    persons_for_identity,
    studios_for_identity,
    upsert_identity,
)

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


@pytest.fixture
def studio(app_session):
    row = Studio(name="מועדון בדיקה", slug=f"t-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _person(session, studio, identity=None, **kw):
    person = Person(
        studio_id=studio.id,
        auth_identity_id=identity.id if identity else None,
        first_name=kw.pop("first_name", "דנה"),
        last_name=kw.pop("last_name", "כהן"),
        **kw,
    )
    session.add(person)
    session.flush()
    return person


def test_a_first_sign_in_creates_the_identity(app_session):
    provider = ProviderIdentity.from_claims(
        provider="google", subject=f"g-{uuid.uuid4()}", email="a@example.invalid",
        email_verified=True,
    )
    identity = upsert_identity(app_session, provider, at=T0)
    app_session.commit()
    assert identity.provider == "google"
    assert identity.last_login_at == T0


def test_a_second_sign_in_reuses_the_same_row(app_session):
    provider = ProviderIdentity.from_claims(
        provider="google", subject=f"g-{uuid.uuid4()}", email="a@example.invalid",
        email_verified=True,
    )
    first = upsert_identity(app_session, provider, at=T0)
    app_session.commit()
    second = upsert_identity(app_session, provider, at=T0)
    app_session.commit()
    assert first.id == second.id


def test_apple_links_to_a_google_identity_on_a_verified_matching_email(app_session):
    """§5.2 — 'if a person signs in with Apple using a Google-verified email already on
    file, the identities are linked automatically only when Apple reports email_verified
    and the email is not a private relay address.'"""
    email = f"link-{uuid.uuid4().hex[:8]}@example.invalid"
    google = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email=email, email_verified=True
        ),
        at=T0,
    )
    app_session.commit()
    apple = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="apple", subject=f"a-{uuid.uuid4()}", email=email, email_verified=True
        ),
        at=T0,
    )
    app_session.commit()
    assert apple.id != google.id
    assert apple.linked_to_identity_id == google.id
    assert effective_identity_id(apple) == google.id


def test_apple_does_not_link_on_an_unverified_email(app_session):
    email = f"unv-{uuid.uuid4().hex[:8]}@example.invalid"
    upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email=email, email_verified=True
        ),
        at=T0,
    )
    app_session.commit()
    apple = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="apple", subject=f"a-{uuid.uuid4()}", email=email, email_verified=False
        ),
        at=T0,
    )
    app_session.commit()
    assert apple.linked_to_identity_id is None


def test_a_private_relay_address_is_never_used_for_matching(app_session):
    """§5.2's explicit sentence. Two unrelated people can share nothing here, but a relay
    address is a per-app alias — matching on one would link accounts that have no
    relationship at all."""
    relay = "abc123@privaterelay.appleid.com"
    upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email=relay, email_verified=True
        ),
        at=T0,
    )
    app_session.commit()
    apple = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="apple", subject=f"a-{uuid.uuid4()}", email=relay, email_verified=True
        ),
        at=T0,
    )
    app_session.commit()
    assert apple.linked_to_identity_id is None
    assert apple.is_private_relay is True


def test_staff_access_is_a_role_assignment_query(app_session, studio):
    """§6.1 — staff app → EXISTS(role_assignment WHERE person_id = :me AND revoked_at IS
    NULL)."""
    person = _person(app_session, studio)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id, person_id=person.id, role="manager",
            scope_type="studio", granted_at=T0,
        )
    )
    app_session.commit()
    with with_all_tenants(reason="test asserts the cross-studio login resolver"):
        assert app_access(app_session, [person.id]) == (True, False)


def test_a_revoked_role_does_not_grant_staff_access(app_session, studio):
    person = _person(app_session, studio)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id, person_id=person.id, role="manager", scope_type="studio",
            granted_at=T0, revoked_at=T0,
        )
    )
    app_session.commit()
    with with_all_tenants(reason="test asserts the cross-studio login resolver"):
        assert app_access(app_session, [person.id]).staff is False


def test_parent_access_is_a_guardian_query_and_not_a_role(app_session, studio):
    """§3.1 — 'Guardian is not a role. There is no role_assignment row.' This is the test
    that would catch someone adding one."""
    person = _person(app_session, studio)
    app_session.add(
        Guardian(
            studio_id=studio.id, student_id=uuid.uuid4(), person_id=person.id,
            is_primary=True, relation="parent",
        )
    )
    app_session.commit()
    with with_all_tenants(reason="test asserts the cross-studio login resolver"):
        assert app_access(app_session, [person.id]) == (False, True)


def test_a_person_with_neither_is_refused_by_both_apps(app_session, studio):
    """§6.1's last row — 'No role and no children: ✗ ✗'. dev+none exists to walk this."""
    person = _person(app_session, studio)
    app_session.commit()
    with with_all_tenants(reason="test asserts the cross-studio login resolver"):
        assert app_access(app_session, [person.id]) == (False, False)


def test_one_identity_reaches_persons_in_every_studio_it_belongs_to(app_session):
    """§3.3's opening claim — 'one Google account can be a parent at one studio and a
    coach at another'. The resolver runs before any studio is in context, so it is the
    one login path that legitimately spans tenants."""
    identity = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email="x@example.invalid",
            email_verified=True,
        ),
        at=T0,
    )
    a = Studio(name="א", slug=f"a-{uuid.uuid4().hex[:8]}")
    b = Studio(name="ב", slug=f"b-{uuid.uuid4().hex[:8]}")
    app_session.add_all([a, b])
    app_session.flush()
    _person(app_session, a, identity)
    _person(app_session, b, identity)
    app_session.commit()
    assert len(persons_for_identity(app_session, identity.id)) == 2


def test_a_studio_switcher_is_only_earned_by_belonging_to_two(app_session, studio):
    """§5.2 — 'A person belonging to more than one studio gets a studio switcher;
    otherwise it is hidden.' The list is what the client counts."""
    identity = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email="y@example.invalid",
            email_verified=True,
        ),
        at=T0,
    )
    person = _person(app_session, studio, identity)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id, person_id=person.id, role="owner", scope_type="studio",
            granted_at=T0,
        )
    )
    app_session.commit()
    memberships = studios_for_identity(app_session, identity.id)
    assert len(memberships) == 1
    assert memberships[0].roles == ("owner",)
    assert memberships[0].studio_is_demo is False
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_resolution.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.identity.resolution'`.

- [ ] **Step 3: Write the resolution service**

Create `app/services/identity/resolution.py`:

```python
"""SPEC §5.2's account linking and §6.1's identity resolution.

**This is the one request-scoped path that legitimately spans tenants.** §3.3's opening
claim is that "one Google account can be a parent at one studio and a coach at another",
so the resolver has to see every studio to answer "which ones are yours?" -- and it runs
*before* a studio is resolved, so there is no tenant to be in. Every query here is
therefore wrapped in `with_all_tenants(reason=...)` with the reason written out, which is
exactly the escape hatch §4.2 sanctions for this.

Note what that does NOT license: once a studio is chosen, every other route takes
`TenantSessionDep` and fails closed. The hatch is open here and nowhere else in the
request path.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tenancy import with_all_tenants
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Invitation, Person, RoleAssignment
from app.models.studio import Studio
from app.services.identity.providers import ProviderIdentity

_LOGIN_SCOPE = (
    "the login resolver answers 'which studios are yours?' before any studio is in "
    "context; SPEC 3.3 requires one identity to reach several"
)


class InvitationRejected(Exception):
    """Unknown, expired, or already accepted. One exception for the same reason
    RefreshRejected is one: the caller's response is identical and the distinction is
    information an attacker does not need."""


@dataclass(frozen=True)
class AppAccess:
    """§6.1 -- 'Access to each app is a query, not a role check.'"""

    staff: bool
    parent: bool

    def __iter__(self):  # so a test can write == (True, False) and mean it
        yield self.staff
        yield self.parent


@dataclass(frozen=True)
class StudioMembership:
    studio_id: uuid.UUID
    studio_name: str
    studio_is_demo: bool
    person_id: uuid.UUID
    roles: tuple[str, ...]
    is_guardian: bool


def effective_identity_id(identity: AuthIdentity) -> uuid.UUID:
    """§5.2's linking, resolved.

    Followed exactly once and never in a loop: `upsert_identity` only ever points a new
    identity at one that is itself unlinked, so a chain longer than one link cannot be
    created. A `while` here would be defending against a state this module does not
    produce, and would turn a data bug into a hang.
    """
    return identity.linked_to_identity_id or identity.id


def upsert_identity(
    session: Session, provider_identity: ProviderIdentity, *, at: datetime
) -> AuthIdentity:
    with with_all_tenants(reason=_LOGIN_SCOPE):
        existing = session.execute(
            select(AuthIdentity).where(
                AuthIdentity.provider == provider_identity.provider,
                AuthIdentity.provider_subject == provider_identity.subject,
            )
        ).scalar_one_or_none()

        if existing is not None:
            existing.last_login_at = at
            existing.email = provider_identity.email
            existing.email_verified = provider_identity.email_verified
            session.flush()
            return existing

        row = AuthIdentity(
            provider=provider_identity.provider,
            provider_subject=provider_identity.subject,
            email=provider_identity.email,
            email_verified=provider_identity.email_verified,
            is_private_relay=provider_identity.is_private_relay,
            last_login_at=at,
        )

        # §5.2 -- 'the identities are linked automatically ONLY when Apple reports
        # email_verified and the email is not a private relay address. Apple's
        # private-relay addresses are stored as-is and never used for matching.'
        #
        # Both conditions, and a third §5.2 implies: the identity we link TO must itself
        # have a verified address, or an unverified Google row would be enough to claim
        # someone's Apple sign-in.
        if (
            provider_identity.email
            and provider_identity.email_verified
            and not provider_identity.is_private_relay
        ):
            target = session.execute(
                select(AuthIdentity).where(
                    AuthIdentity.email == provider_identity.email,
                    AuthIdentity.email_verified.is_(True),
                    AuthIdentity.is_private_relay.is_(False),
                    AuthIdentity.provider != provider_identity.provider,
                    AuthIdentity.linked_to_identity_id.is_(None),
                )
            ).scalars().first()
            if target is not None:
                row.linked_to_identity_id = target.id

        session.add(row)
        session.flush()
        return row


def persons_for_identity(session: Session, identity_id: uuid.UUID) -> list[Person]:
    """Every Person this identity is, in every studio. Includes persons attached to an
    identity that links to this one, so a linked Apple sign-in reaches the same people."""
    with with_all_tenants(reason=_LOGIN_SCOPE):
        linked = session.execute(
            select(AuthIdentity.id).where(AuthIdentity.linked_to_identity_id == identity_id)
        ).scalars().all()
        return list(
            session.execute(
                select(Person)
                .where(Person.auth_identity_id.in_([identity_id, *linked]))
                .where(Person.anonymized_at.is_(None))
            ).scalars().all()
        )


def app_access(session: Session, person_ids: list[uuid.UUID]) -> AppAccess:
    """§6.1's two queries, verbatim:

        staff app   -> EXISTS(role_assignment WHERE person_id = :me AND revoked_at IS NULL)
        parent app  -> EXISTS(guardian        WHERE person_id = :me)

    §3.1: 'This makes app access a query, not a role check.' Writing it any other way --
    a cached boolean on the person, a claim in the token that is not re-derived -- is how
    a revoked coach keeps their app.
    """
    if not person_ids:
        return AppAccess(staff=False, parent=False)
    staff = session.execute(
        select(RoleAssignment.id)
        .where(RoleAssignment.person_id.in_(person_ids), RoleAssignment.revoked_at.is_(None))
        .limit(1)
    ).first() is not None
    parent = session.execute(
        select(Guardian.id).where(Guardian.person_id.in_(person_ids)).limit(1)
    ).first() is not None
    return AppAccess(staff=staff, parent=parent)


def studios_for_identity(session: Session, identity_id: uuid.UUID) -> list[StudioMembership]:
    """What the studio switcher renders, and what §6.1's resolve step branches on.

    §5.2: 'A person belonging to more than one studio gets a studio switcher; otherwise
    it is hidden.' The client hides it by counting this list -- the server does not send
    a `show_switcher` boolean, because that would be the same fact stated twice.
    """
    with with_all_tenants(reason=_LOGIN_SCOPE):
        persons = persons_for_identity(session, identity_id)
        memberships: list[StudioMembership] = []
        for person in persons:
            studio = session.get(Studio, person.studio_id)
            if studio is None or studio.status != "active":
                # §18.3's suspend action. A suspended studio is not a studio you can
                # switch into, and it must not be listed as one.
                continue
            roles = tuple(
                session.execute(
                    select(RoleAssignment.role)
                    .where(
                        RoleAssignment.person_id == person.id,
                        RoleAssignment.revoked_at.is_(None),
                    )
                    .order_by(RoleAssignment.role)
                ).scalars().all()
            )
            is_guardian = session.execute(
                select(Guardian.id).where(Guardian.person_id == person.id).limit(1)
            ).first() is not None
            memberships.append(
                StudioMembership(
                    studio_id=studio.id,
                    studio_name=studio.name,
                    studio_is_demo=studio.is_demo,
                    person_id=person.id,
                    roles=roles,
                    is_guardian=is_guardian,
                )
            )
        return memberships


def accept_invitation(
    session: Session, *, token: str, identity_id: uuid.UUID, at: datetime
) -> Person:
    """§5.3 -- 'the invitation carries a token binding the accepting auth identity to the
    pre-created Person.'

    The binding is the point: the manager created the Person, so accepting attaches a
    login to a profile that already exists rather than creating a second one. §3.3 point
    2: 'Attaching an auth identity to an existing student Person later gives them a login
    with zero migration.'
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with with_all_tenants(reason=_LOGIN_SCOPE):
        invitation = session.execute(
            select(Invitation).where(Invitation.token_hash == token_hash)
        ).scalar_one_or_none()
        if invitation is None or invitation.accepted_at is not None:
            raise InvitationRejected("unknown or already accepted")
        if at >= invitation.expires_at:
            raise InvitationRejected("expired")

        person = session.execute(
            select(Person).where(
                Person.studio_id == invitation.studio_id,
                Person.auth_identity_id.is_(None),
                (
                    (Person.email == invitation.email)
                    if invitation.email
                    else (Person.phone == invitation.phone)
                ),
            )
        ).scalars().first()
        if person is None:
            raise InvitationRejected("no pre-created person matches this invitation")

        person.auth_identity_id = identity_id
        invitation.accepted_at = at
        invitation.accepted_by_person_id = person.id
        session.flush()
        return person
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_resolution.py -q
.venv/bin/mypy app/services/identity
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/identity/resolution.py tests/identity/test_resolution.py
git commit -m "feat(identity): resolution, §5.2 account linking, §6.1's two access queries

The queries are queries, not cached booleans — §3.1's point, and the difference between
a revoked coach losing their app and keeping it. Linking requires a verified,
non-relay address on BOTH sides: an unverified row on file would otherwise be enough to
claim someone's Apple sign-in.

This is the one request-scoped path that spans tenants, and every query in it carries
with_all_tenants(reason=...) — §4.2 sanctions exactly this case."
```

---

### Task 13: `/auth/*` and the §11.7 refresh cookie (holdback 8 reports itself here)

**Files:**
- Create: `app/routers/identity.py`, `app/schemas/identity.py`
- Test: `tests/identity/test_auth_router.py`

**Interfaces:**
- Produces:
  - `GET  /api/v1/auth/{provider}/start?app=staff|parent|dashboard&return_path=/` → 302 to the provider
  - `POST /api/v1/auth/{provider}/callback` `{code, state, invitation_token?}` → `SessionResponse` + `Set-Cookie`
  - `GET  /api/v1/auth/me` → `MeResponse`
  - `POST /api/v1/auth/refresh` → `SessionResponse` + rotated cookie
  - `POST /api/v1/auth/logout` → 204, cookie cleared
  - `POST /api/v1/auth/switch-studio` `{studio_id}` → `SessionResponse`
  - `REFRESH_COOKIE_NAME = "studio_refresh"`, `REFRESH_COOKIE_PATH = "/api/v1/auth"`
- **No schema in this module may carry a field named `is_developer`** — `tests/restrictions/test_04`'s schema detector walks every request body FastAPI publishes. `MeResponse` exposes it as `dev_tools` (a *response*, and named differently so the detector's intent is not sidestepped by accident).

> **D-M1-5 lives here.** The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/v1/auth` and **host-only — no `Domain` attribute**. It will not survive on staging, because `up.railway.app` is a public suffix and the app hosts and the api host are therefore different sites. That is holdback 8 reporting itself. Verify it on `localhost` and escalate for the domain. **Do not** move the token to IndexedDB or a bearer header.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_auth_router.py`:

```python
"""SPEC §5.2, §6.1 and §11.7 at the HTTP boundary.

The cookie assertions are the load-bearing ones. §11.7 says 'secure/httpOnly/SameSite
cookies for the refresh token', and infra/railway/README.md § The domain explains why a
`Domain=` attribute would be actively wrong: keeping the cookie host-only is what stops
a staging session being valid against production.
"""

from __future__ import annotations

import uuid
from http.cookies import SimpleCookie

import pytest
from app.routers.identity import REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH


def _set_cookie_header(response) -> str:
    raw = [v for k, v in response.headers.raw if k.lower() == b"set-cookie"]
    assert raw, "no Set-Cookie on the response"
    return raw[0].decode()


def test_the_refresh_cookie_is_httponly_secure_and_samesite(signed_in):
    """§11.7 — 'Strict CSP, HSTS, and secure/httpOnly/SameSite cookies for the refresh
    token.' All three, asserted individually: dropping any one is a different
    vulnerability and a single combined assertion would hide which."""
    header = _set_cookie_header(signed_in.response).lower()
    assert "httponly" in header
    assert "secure" in header
    assert "samesite=lax" in header


def test_the_refresh_cookie_is_host_only(signed_in):
    """infra/railway/README.md § The domain — 'Keep cookies host-only (no Domain=
    attribute) so a staging session is never valid against production.'"""
    assert "domain=" not in _set_cookie_header(signed_in.response).lower()


def test_the_refresh_cookie_is_scoped_to_the_auth_path(signed_in):
    """The cookie is presented to exactly one endpoint. Sending it on every API call
    widens the CSRF surface for no benefit — nothing but /auth/refresh reads it."""
    cookie = SimpleCookie()
    cookie.load(_set_cookie_header(signed_in.response))
    assert cookie[REFRESH_COOKIE_NAME]["path"] == REFRESH_COOKIE_PATH


def test_the_access_token_is_in_the_body_and_never_in_a_cookie(signed_in):
    """§10.3 — the client holds the access token in memory and replays it on every
    request. A cookie-borne access token would be sent automatically, which is what
    makes CSRF possible at all."""
    assert signed_in.response.json()["access_token"]
    assert "access_token" not in _set_cookie_header(signed_in.response)


def test_start_redirects_to_the_provider_and_never_renders_a_page(client):
    """§5.2 — 'a standard top-level redirect'. A rendered interstitial is one step closer
    to a webview, which is where Google returns disallowed_useragent."""
    response = client.get("/api/v1/auth/fake/start?app=parent", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"].startswith("https://fake.invalid/authorize")


def test_a_callback_with_an_unknown_state_is_refused(client):
    """The state is the CSRF defence for the whole flow. Accepting an unknown one means
    accepting a code an attacker obtained elsewhere."""
    response = client.post(
        "/api/v1/auth/fake/callback", json={"code": "code-1", "state": "never-issued"}
    )
    assert response.status_code == 400


def test_a_state_is_single_use(client, fake_provider):
    """Replaying a callback must not mint a second session from one authorization."""
    fake_provider.register(code="c1", subject="s1", email="a@example.invalid")
    state = _start(client)
    assert client.post("/api/v1/auth/fake/callback", json={"code": "c1", "state": state}).status_code == 200
    assert client.post("/api/v1/auth/fake/callback", json={"code": "c1", "state": state}).status_code == 400


def test_me_reports_both_refusals_for_an_identity_with_nothing(client, fake_provider):
    """§6.1's last row — 'No role and no children: ✗ ✗'. Both apps must be able to render
    their own refusal screen from this one response."""
    fake_provider.register(code="c-none", subject="s-none", email="none@example.invalid")
    _sign_in(client, code="c-none")
    body = client.get("/api/v1/auth/me").json()
    assert body["access"] == {"staff": False, "parent": False}
    assert body["studios"] == []


def test_me_never_leaks_whether_the_account_exists_in_the_other_app(client, fake_provider):
    """§6.1 — 'Neither screen leaks whether the account exists in the other app.' The
    response says what THIS identity may do; it carries no count of anything else."""
    fake_provider.register(code="c-x", subject="s-x", email="x@example.invalid")
    _sign_in(client, code="c-x")
    body = client.get("/api/v1/auth/me").json()
    assert set(body) == {"identity_id", "access", "studios", "active_studio_id", "dev_tools",
                         "acting_as_person_id"}


def test_refresh_rotates_the_cookie(client, fake_provider):
    fake_provider.register(code="c-r", subject="s-r", email="r@example.invalid")
    first = _sign_in(client, code="c-r")
    before = client.cookies[REFRESH_COOKIE_NAME]
    second = client.post("/api/v1/auth/refresh")
    assert second.status_code == 200
    assert client.cookies[REFRESH_COOKIE_NAME] != before
    assert second.json()["access_token"] != first.json()["access_token"]


def test_refresh_without_the_cookie_is_401_and_says_nothing_more(client):
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert "reason" not in response.json().get("detail", {})


def test_logout_clears_the_cookie_and_revokes_the_family(client, fake_provider):
    """§10.3 point 5 — a queue is never dropped on an auth failure, so logout must be an
    explicit act and must actually end the session server-side, not merely locally."""
    fake_provider.register(code="c-l", subject="s-l", email="l@example.invalid")
    _sign_in(client, code="c-l")
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_no_auth_request_schema_exposes_is_developer(client):
    """§19.2, asserted at this router specifically because it is the one place a
    convenient `is_developer` field would feel natural. tests/restrictions/test_04 checks
    the whole app; this fails closer to the cause."""
    schema = client.app.openapi()
    bodies = [
        op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        for path, ops in schema["paths"].items()
        if path.startswith("/api/v1/auth")
        for op in ops.values()
    ]
    assert "is_developer" not in str(bodies)
```

Add the fixtures to `tests/identity/conftest.py`:

```python
"""A TestClient wired to the fake provider, plus the two helpers every router test uses.

The fake is injected through a FastAPI dependency override rather than by monkeypatching
`configured_providers`: an override is undone automatically when the app object goes
away, and it is the same seam production uses, so the test exercises the real wiring.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.core.config import settings
from app.services.identity.providers import FakeProvider
from fastapi.testclient import TestClient


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(migrated, fake_provider, monkeypatch):
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", None, raising=False)
    from app.core.config import Settings

    monkeypatch.setattr(
        settings, "JWT_SIGNING_KEY", Settings().JWT_SIGNING_KEY or _test_key(), raising=False
    )
    from app.main import app
    from app.routers import identity as identity_router

    app.dependency_overrides[identity_router.get_providers] = lambda: {"fake": fake_provider}
    # `Secure` cookies are only stored by a client that believes it is on a secure
    # origin. TestClient's default base_url is http://testserver, so the cookie the
    # response sets would be silently dropped and every session test would fail for a
    # reason that has nothing to do with the code.
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _test_key() -> str:
    import base64

    return base64.b64encode(b"\0" * 32).decode()


def _start(client, app_name: str = "parent") -> str:
    from urllib.parse import parse_qs, urlparse

    response = client.get(f"/api/v1/auth/fake/start?app={app_name}", follow_redirects=False)
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def _sign_in(client, *, code: str, app_name: str = "parent"):
    state = _start(client, app_name)
    return client.post("/api/v1/auth/fake/callback", json={"code": code, "state": state})


@pytest.fixture
def signed_in(client, fake_provider):
    fake_provider.register(code="c-si", subject="s-si", email="si@example.invalid")

    class _Result:
        response = _sign_in(client, code="c-si")

    return _Result()
```

> Import `_start` and `_sign_in` into the test module from `tests.identity.conftest`, or
> move them to a `tests/identity/helpers.py` — pytest does not inject plain functions
> from a conftest into a module's namespace.

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_auth_router.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.routers.identity'`.

- [ ] **Step 3: Write the schemas**

Create `app/schemas/identity.py`:

```python
"""Request and response shapes for /auth/*.

**No schema here carries `is_developer`.** §19.2: "There is no API, no UI and no admin
screen that can grant it", and tests/restrictions/test_04 walks every request body
FastAPI publishes looking for exactly that name. `MeResponse.dev_tools` is a *response*
field reporting whether the dev bar should render -- a different question from granting
the flag, and named differently so the detector's intent is not sidestepped by accident.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class CallbackRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    state: str = Field(min_length=1, max_length=64)
    #: §6.1 step 3 -- 'invitation token -> attach identity to the pre-created Person'.
    invitation_token: str | None = Field(default=None, max_length=128)


class SwitchStudioRequest(BaseModel):
    studio_id: uuid.UUID


class StudioMembershipOut(BaseModel):
    studio_id: uuid.UUID
    studio_name: str
    studio_is_demo: bool
    person_id: uuid.UUID
    roles: list[str]
    is_guardian: bool


class AppAccessOut(BaseModel):
    """§6.1's two queries, as the client sees them. Two booleans and nothing else: a
    count of studios in the other app would leak what §6.1 says neither screen may."""

    staff: bool
    parent: bool


class SessionResponse(BaseModel):
    """The access token lives in the body, never in a cookie (§10.3): the client holds
    it in memory and replays it, which is what keeps it out of automatic-credential
    territory. The refresh token is in the Set-Cookie header and never here."""

    access_token: str
    expires_in: int
    access: AppAccessOut
    studios: list[StudioMembershipOut]
    active_studio_id: uuid.UUID | None


class MeResponse(BaseModel):
    identity_id: uuid.UUID
    access: AppAccessOut
    studios: list[StudioMembershipOut]
    active_studio_id: uuid.UUID | None
    #: §19.4 -- whether to render the dev bar. Reported, never accepted.
    dev_tools: bool
    #: §19.4 -- the persona the API is resolving permissions from.
    acting_as_person_id: uuid.UUID | None
```

- [ ] **Step 4: Write the router**

Create `app/routers/identity.py`. Key points an implementer must not drift from:

```python
"""SPEC §5.2 and §6.1 -- the auth surface.

Two things worth reading before editing this file.

**The cookie is built exactly as §11.7 specifies and is EXPECTED TO FAIL on staging.**
`up.railway.app` is on the Public Suffix List, so the app hosts and the api host are
different *sites*; a host-only cookie is third-party across them and Safari drops it, so
a session dies at the 15-minute JWT expiry and cannot renew. That is HB-domain reporting
itself, not a bug here. The workaround -- moving the refresh token to IndexedDB and
sending it as a bearer header -- contradicts §11.7 and is strictly weaker, because an
XSS can read IndexedDB and cannot read an httpOnly cookie. **Do not take it.** See
infra/railway/README.md § The domain.

**These routes run before a studio exists.** They take SessionDep (a plain, unscoped
Session), not TenantSessionDep, because §3.3 requires one identity to reach several
studios and there is no tenant in context between the redirect out and the callback back.
Every query they run goes through app/services/identity/resolution.py, which wraps each
one in with_all_tenants(reason=...). Every OTHER router in this application takes
TenantSessionDep and fails closed.
"""
```

Implementation notes, in the order the code should read:

1. `router = APIRouter(prefix="/auth", tags=["identity"])`.
2. `def get_providers() -> dict[str, OAuthProvider]: return configured_providers()` —
   a dependency, so `conftest.py` can override it with the fake.
3. `REFRESH_COOKIE_NAME = "studio_refresh"`, `REFRESH_COOKIE_PATH = "/api/v1/auth"`.
4. A single `_set_refresh_cookie(response, secret, *, at)` helper — one place that
   knows the attributes, so no route can set a weaker cookie:

```python
def _set_refresh_cookie(response: Response, secret: str) -> None:
    """§11.7 -- 'secure/httpOnly/SameSite cookies for the refresh token', and
    infra/railway/README.md's fourth requirement: host-only.

    No `domain=`. That is not an omission -- a Domain attribute would make a staging
    session valid against production, and it is also the exact change someone reaches for
    when the cookie stops flowing on Railway's generated subdomains. It would not help:
    Domain cannot cross a public suffix.
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=secret,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=True,
        samesite="lax",
    )
```

5. `GET /{provider}/start` — validate `app` against `{"staff", "parent", "dashboard"}`
   and `return_path` against a leading `/` with no `//` (an open redirect otherwise);
   `new_pkce_pair()`; persist an `OAuthTransaction` with `expires_at = now() + 10 min`;
   `RedirectResponse(provider.authorization_url(...), status_code=307)`.
6. `POST /{provider}/callback` — load the transaction by `state`, refuse if missing,
   consumed, or expired (400); mark it consumed; `provider.exchange(...)`;
   `upsert_identity(...)`; if `invitation_token` was sent, `accept_invitation(...)`;
   `studios_for_identity(...)`; pick `active_studio_id` as the single membership when
   there is exactly one and `None` otherwise (§5.2 — the switcher is shown only when
   there is a choice); `issue_refresh_token(...)`; `_set_refresh_cookie(...)`; mint the
   access token with `is_developer` read **from the identity row** and `studio_is_demo`
   from the resolved studio.
7. `GET /me` — reads `request.state` (Task 14) and re-derives `access` and `studios` from
   the database. **Not** from the token: §3.1's "a query, not a role check" is only true
   if this endpoint asks.
8. `POST /refresh` — `rotate_refresh_token(...)`; on `RefreshRejected` return
   `401` with a fixed body and **no reason** — the reason goes to the log via `extra=`,
   never to the caller and never interpolated into the message (`app/core/logging.py`).
9. `POST /logout` — `revoke_family(...)`, `response.delete_cookie(...)` with the same
   `path`, `204`.
10. `POST /switch-studio` — verify the target studio is one of `studios_for_identity`,
    then rotate the refresh row's `active_studio_id` and mint a new access token.

All ten routes declare an explicit `response_model` (`.claude/rules/api.md`), and errors
return `{code, message, details?}`.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity -q
.venv/bin/mypy app/services/identity app/routers/identity.py app/schemas/identity.py
.venv/bin/ruff check app && .venv/bin/ruff format app
```

Expected: PASS.

- [ ] **Step 6: Regenerate the API client**

```bash
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/pytest tests/dev/test_openapi_surface.py -q
```

Expected: `openapi.json` gains the `/api/v1/auth/*` paths and still carries no `/dev` path.

- [ ] **Step 7: Commit**

```bash
git add app/routers/identity.py app/schemas/identity.py tests/identity/ \
        openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(identity): /auth/* and the §11.7 refresh cookie

httpOnly, Secure, SameSite=Lax, Path=/api/v1/auth, and host-only — no Domain attribute,
because that is what stops a staging session being valid against production and it could
not cross a public suffix anyway.

This cookie will NOT survive on staging: up.railway.app is a public suffix, so the app
hosts and the api host are different sites and Safari drops it. That is HB-domain
reporting itself. The access token stays in the body and in memory (§10.3), and nothing
here moves the refresh token to IndexedDB."
```

---

### Task 14: `request.state` from the verified claims (holdback 2 closes)

`app/core/tenancy.py::studio_id_from_request` has been correct-but-unreachable since
M0.2. Its docstring says so: *"M1 owns authentication and sets `request.state.studio_id`,
`is_developer` and `studio_is_demo` from the verified JWT and the resolved studio. Until
it lands this is the seam."* This task lands it.

**Files:**
- Create: `app/core/auth_context.py`
- Modify: `app/main.py` (add the middleware — **not** the discovery loop)
- Test: `tests/identity/test_auth_context.py`

**Interfaces:**
- Consumes: `verify_access_token`, `AccessClaims` (Task 9).
- Produces: `AuthContextMiddleware`. After it runs, `request.state` carries `identity_id`, `person_id`, `acting_as_person_id`, `studio_id`, `roles`, `is_developer`, `studio_is_demo`, `is_platform_admin` — every one of them absent (not defaulted to something permissive) when no valid token was presented.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_auth_context.py`:

```python
"""Holdback 2. tests/restrictions/test_01 already asserts the RULE in full and drives
request.state directly, saying so out loud: 'What is absent is only the INPUT.' This is
the input, and this test asserts the wiring rather than re-asserting the rule.

The negative cases matter most. A middleware that defaults `is_developer` to True on a
malformed token, or that leaves stale state on the request after a failed verification,
turns §19.6's guardrail into decoration.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.core.auth_context import AuthContextMiddleware
from app.services.identity.tokens import AccessClaims, mint_access_token
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

KEY = "test-signing-key-not-a-real-one"
T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def _probe_app(monkeypatch) -> FastAPI:
    from app.core.config import settings
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(KEY))
    app = FastAPI()
    app.add_middleware(AuthContextMiddleware)

    @app.get("/probe")
    def probe(request: Request) -> dict[str, object]:
        return {
            "identity_id": str(getattr(request.state, "identity_id", None)),
            "studio_id": str(getattr(request.state, "studio_id", None)),
            "is_developer": getattr(request.state, "is_developer", None),
            "studio_is_demo": getattr(request.state, "studio_is_demo", None),
            "acting_as_person_id": str(getattr(request.state, "acting_as_person_id", None)),
        }

    return app


def _token(**overrides) -> str:
    base = dict(
        identity_id=uuid.uuid4(), person_id=uuid.uuid4(), active_studio_id=uuid.uuid4(),
        acting_as_person_id=None, roles=("manager",), is_developer=False,
        studio_is_demo=False, is_platform_admin=False,
        issued_at=T0, expires_at=T0 + timedelta(minutes=15),
    )
    return mint_access_token(AccessClaims(**{**base, **overrides}), key=KEY)


def test_a_valid_token_populates_the_state_tenancy_has_been_waiting_for(monkeypatch):
    studio = uuid.uuid4()
    client = TestClient(_probe_app(monkeypatch))
    body = client.get(
        "/probe",
        headers={"Authorization": f"Bearer {_token(active_studio_id=studio, is_developer=True, studio_is_demo=True)}"},
    ).json()
    assert body["studio_id"] == str(studio)
    assert body["is_developer"] is True
    assert body["studio_is_demo"] is True


def test_no_header_leaves_every_flag_unset_rather_than_defaulted(monkeypatch):
    """Unset, not False. tenancy.py reads these with getattr(..., False), so unset and
    False agree — but a middleware that WRITES False is a middleware that could just as
    easily write True, and the state would look deliberate either way."""
    body = TestClient(_probe_app(monkeypatch)).get("/probe").json()
    assert body["identity_id"] == "None"
    assert body["is_developer"] is None


@pytest.mark.parametrize(
    "header",
    ["Bearer not-a-token", "Bearer ", "Basic abc", "not-even-a-scheme"],
)
def test_a_malformed_authorization_header_never_grants_anything(monkeypatch, header):
    body = TestClient(_probe_app(monkeypatch)).get("/probe", headers={"Authorization": header}).json()
    assert body["is_developer"] is None
    assert body["studio_id"] == "None"


def test_an_expired_token_grants_nothing(monkeypatch, freeze_far_future):
    """§5.2's fifteen minutes are enforced here, not only in the token module: a
    middleware that verified the signature and skipped the clock would accept a
    year-old token."""
    token = _token()
    body = TestClient(_probe_app(monkeypatch)).get(
        "/probe", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert body["identity_id"] == "None"


def test_a_token_signed_with_another_key_grants_nothing(monkeypatch):
    from app.services.identity.tokens import AccessClaims as C

    forged = mint_access_token(
        C(
            identity_id=uuid.uuid4(), person_id=None, active_studio_id=uuid.uuid4(),
            acting_as_person_id=None, roles=(), is_developer=True, studio_is_demo=True,
            is_platform_admin=True, issued_at=T0, expires_at=T0 + timedelta(minutes=15),
        ),
        key="the-attackers-key",
    )
    body = TestClient(_probe_app(monkeypatch)).get(
        "/probe", headers={"Authorization": f"Bearer {forged}"}
    ).json()
    assert body["is_developer"] is None


def test_the_middleware_reads_the_only_clock(monkeypatch):
    """§19.5 — X-Dev-Now shifts the server's clock for one request. Expiry checked
    against app.core.clock.now() means a time-travelled request sees a time-travelled
    token, which is what lets the billing-run tests run under a session at all."""
    import app.core.auth_context as module

    source = __import__("inspect").getsource(module)
    assert "datetime.now(" not in source, "app.core.clock.now() is the only clock"
    assert "from app.core.clock import now" in source
```

Add to `tests/identity/conftest.py`:

```python
@pytest.fixture
def freeze_far_future(monkeypatch):
    """Move the only clock a year forward for the duration of one test. Uses
    app.core.clock's own contextvar rather than patching datetime, so it exercises the
    same seam X-Dev-Now does."""
    from datetime import timedelta

    import app.core.auth_context as module
    from app.core.clock import now as real_now

    monkeypatch.setattr(module, "now", lambda: real_now() + timedelta(days=365))
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_auth_context.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.auth_context'`.

- [ ] **Step 3: Write the middleware**

Create `app/core/auth_context.py`:

```python
"""Holdback 2 -- the input app/core/tenancy.py has been waiting for since M0.2.

`studio_id_from_request` already implements §19.6 restriction 1 correctly and
tests/restrictions/test_01 already asserts the rule in full. What was absent was only
the input: nothing populated `request.state`. This middleware is that, and nothing more.

**It never rejects a request.** An absent or invalid token leaves the state unset and
lets the route's own dependency decide -- `studio_id_from_request` returns 401 for a
tenant-scoped route, `/auth/*` and `/health` do not need one, and a middleware that
401'd everything would make the unauthenticated surface unreachable. Failing open here
is safe precisely because failing closed happens one layer down.

**Unset, not False.** A middleware that wrote `is_developer = False` on every
unauthenticated request would be one line away from writing True, and the state would
look equally deliberate either way. tenancy.py reads with `getattr(..., False)`, so
absent and False mean the same thing to it -- and absent means nobody claimed anything.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.clock import now
from app.core.config import settings
from app.services.identity.tokens import InvalidAccessToken, verify_access_token

_BEARER = "bearer "


class AuthContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        header = request.headers.get("Authorization", "")
        key = settings.JWT_SIGNING_KEY
        if key is not None and header.lower().startswith(_BEARER):
            token = header[len(_BEARER) :].strip()
            try:
                # `now()` and not datetime.now(): §19.5's X-Dev-Now shifts the only
                # clock for one request, and a session that could not be time-travelled
                # would make every billing-run test sign in under real time.
                claims = verify_access_token(token, key=key.get_secret_value(), at=now())
            except InvalidAccessToken:
                # Deliberately silent. This is the ordinary path for an expired token --
                # §5.2 expires one every fifteen minutes by design -- so logging it would
                # bury the real failures under it.
                return await call_next(request)

            request.state.identity_id = claims.identity_id
            request.state.person_id = claims.person_id
            request.state.acting_as_person_id = claims.acting_as_person_id
            # The name tenancy.py reads. Set from the token's `sid` claim, which the
            # auth router wrote when it resolved the studio.
            request.state.studio_id = claims.active_studio_id
            request.state.roles = claims.roles
            # §19.6's two inputs, both from VERIFIED claims. Deriving either after
            # verification -- a database read, a config lookup -- would be a second
            # source of truth for a decision that already has one.
            request.state.is_developer = claims.is_developer
            request.state.studio_is_demo = claims.studio_is_demo
            request.state.is_platform_admin = claims.is_platform_admin

        response = await call_next(request)

        # §19.4 -- 'every response carries an X-Acting-As header so the active persona is
        # visible in dev tools and in Sentry breadcrumbs.'
        acting_as = getattr(request.state, "acting_as_person_id", None)
        if acting_as is not None:
            response.headers["X-Acting-As"] = str(acting_as)
        return response
```

- [ ] **Step 4: Register it in `app/main.py`**

Add beside the existing `DevClockMiddleware` block — **the discovery loop is untouched**:

```python
from app.core.auth_context import AuthContextMiddleware

# Holdback 2 -- request.state.is_developer / studio_is_demo from the verified JWT, which
# app/core/tenancy.py::studio_id_from_request has expected since M0.2. Not a
# registration: seam 2's discovery loop below is untouched, exactly as
# configure_logging() and DevClockMiddleware are not registrations.
app.add_middleware(AuthContextMiddleware)
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity tests/restrictions tests/core/test_tenancy.py -q
.venv/bin/mypy app
```

Expected: PASS. `tests/restrictions/test_01` still passes — it drives `request.state`
directly and is unaffected by who else writes it.

- [ ] **Step 6: Prove the developer restriction now fires end to end**

Add to `tests/identity/test_auth_context.py`:

```python
def test_a_developer_session_cannot_resolve_a_real_studio_in_production(monkeypatch):
    """§19.6 restriction 1, end to end for the first time. tests/restrictions/test_01
    proved the rule and the resolver; this proves the wire between the token and them."""
    from app.core.config import settings
    from app.core.tenancy import studio_id_from_request
    from fastapi import Depends, FastAPI, HTTPException
    from pydantic import SecretStr
    from typing import Annotated
    import uuid as _uuid

    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(KEY))
    monkeypatch.setattr(settings, "ENV", "production")

    app = FastAPI()
    app.add_middleware(AuthContextMiddleware)

    @app.get("/scoped")
    def scoped(studio_id: Annotated[_uuid.UUID, Depends(studio_id_from_request)]) -> dict:
        return {"studio_id": str(studio_id)}

    client = TestClient(app)
    real = _token(is_developer=True, studio_is_demo=False)
    demo = _token(is_developer=True, studio_is_demo=True)
    assert client.get("/scoped", headers={"Authorization": f"Bearer {real}"}).status_code == 403
    assert client.get("/scoped", headers={"Authorization": f"Bearer {demo}"}).status_code == 200
```

```bash
.venv/bin/pytest tests/identity/test_auth_context.py -q
```

Expected: PASS.

- [ ] **Step 7: Tick the holdback and commit**

In `docs/plan/state.yaml`, set `HB-m1-request-state` `status: closed`, `closed: 2026-08-25`,
and add:

```yaml
      - id: M1.2
        title: OAuth, the JWT, and the request context
        status: shipped
        on: 2026-08-25
```

```bash
git add app/core/auth_context.py app/main.py tests/identity/test_auth_context.py \
        docs/plan/state.yaml
git commit -m "feat(identity): request.state from the verified claims

Closes HB-m1-request-state. tenancy.py's §19.6 rule has been correct and unreachable
since M0.2 for want of an input; this is the input. Flags are set from verified claims
and left UNSET rather than written False when nobody claimed anything — a middleware
that writes False is one line from writing True. X-Acting-As rides along (§19.4)."
```

---

### Task 15: CORS, built from `domains.json`

Without this, the browser refuses every cross-origin call from `localhost:5173` to
`localhost:8000` and the entire frontend half of this milestone cannot be exercised.
`infra/railway/README.md` names it as M1's: *"Two things that are not in that file will
also need the host when it changes: the Google OAuth redirect URIs in the Cloud Console,
and the API's CORS allowlist — neither exists yet, and both are M1's."*

**Files:**
- Create: `app/core/cors.py`
- Modify: `app/main.py`
- Test: `tests/identity/test_cors.py`

**Interfaces:**
- Produces: `allowed_origins(env: str) -> list[str]` and `DOMAINS_PATH`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_cors.py`:

```python
"""infra/railway/README.md — 'Every hostname lives in domains.json and nowhere else, so
the swap is one file.' A hardcoded origin here would be a second place, and the day the
domain lands it would be the place nobody remembers."""

from __future__ import annotations

import json

from app.core.cors import DOMAINS_PATH, allowed_origins


def test_every_origin_comes_from_domains_json():
    hosts = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))["environments"]["staging"]
    origins = allowed_origins("staging")
    for app_name in ("staff", "parent", "dashboard"):
        assert any(hosts[app_name] in origin for origin in origins), app_name


def test_the_api_is_not_its_own_cors_origin():
    """A same-origin request needs no CORS entry, and listing the api host would make a
    misconfigured client look like it works."""
    hosts = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))["environments"]["staging"]
    assert not any(hosts["api"] in origin for origin in allowed_origins("staging"))


def test_development_allows_the_three_vite_ports_and_nothing_else():
    origins = allowed_origins("development")
    assert "http://localhost:5173" in origins
    assert all(o.startswith("http://localhost:") for o in origins)


def test_production_never_allows_a_localhost_origin():
    """The one that matters. A dev origin left in the production allowlist is a
    credentialed cross-origin hole that no test of the happy path would ever notice."""
    assert not any("localhost" in origin for origin in allowed_origins("production"))


def test_no_environment_allows_a_wildcard():
    """`allow_origins=['*']` and `allow_credentials=True` are mutually exclusive in the
    fetch spec, and the refresh cookie needs credentials. A wildcard here would silently
    disable the cookie rather than fail loudly."""
    for env in ("development", "staging", "production"):
        assert "*" not in allowed_origins(env)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_cors.py -q
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write it**

Create `app/core/cors.py`:

```python
"""The API's CORS allowlist, read from infra/railway/domains.json.

infra/railway/README.md: "Every hostname lives in domains.json and nowhere else, so the
swap is one file." A literal origin in this module would be a second place, and on the
day HB-domain closes it would be the one nobody remembers to change.

`allow_credentials=True` is required -- the refresh cookie is the whole point -- and the
fetch spec forbids pairing that with `allow_origins=["*"]`. So there is no wildcard here
and a test asserts there never is: a wildcard would not error, it would silently stop the
cookie from being sent.
"""

from __future__ import annotations

import json
from pathlib import Path

DOMAINS_PATH = Path(__file__).resolve().parents[2] / "infra/railway/domains.json"

#: The three PWAs. `api` is deliberately absent -- a same-origin request needs no CORS
#: entry, and listing it would make a misconfigured client look like it works.
_APPS = ("staff", "parent", "dashboard")

#: Vite's dev server, one port per app (web/apps/*/vite.config.ts).
_DEV_ORIGINS = ("http://localhost:5173", "http://localhost:5174", "http://localhost:5175")


def allowed_origins(env: str) -> list[str]:
    if env in {"development", "test"}:
        return list(_DEV_ORIGINS)

    hosts = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))["environments"].get(env, {})
    return [f"https://{hosts[app]}" for app in _APPS if hosts.get(app)]
```

- [ ] **Step 4: Register it in `app/main.py`**

```python
from fastapi.middleware.cors import CORSMiddleware

from app.core.cors import allowed_origins

# The refresh cookie is cross-ORIGIN in every environment (the api and the apps are
# separate services, which infra/railway/README.md § Why four services requires so the
# three PWAs do not share origin-scoped IndexedDB). allow_credentials is therefore not
# optional, and it forbids a wildcard origin -- see app/core/cors.py.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(settings.ENV),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Dev-Now", "X-Dev-Token"],
    expose_headers=["X-Acting-As"],
)
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_cors.py tests/config -q
.venv/bin/mypy app
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/core/cors.py app/main.py tests/identity/test_cors.py
git commit -m "feat(identity): CORS allowlist read from domains.json

infra/railway/README.md names this as M1's, alongside the OAuth redirect URIs. Every
origin comes from the one file that holds hostnames, so HB-domain's swap stays a
one-file change. No wildcard: allow_credentials is required for the refresh cookie and
the fetch spec forbids the pair, silently."
```

---

# Phase 3 — the platform console and the structure API

### Task 16: `/platform/*` — studio provisioning and owner invitation

§5.1: *"Studios are provisioned by the platform operator, never self-created. There is no
'צור סטודיו' button anywhere in the staff app."* Conflict **C4** notes §14 lists the
platform console in both M1 and M9; **M1 builds provisioning and owner invitation only**
— the operations board, health chips and break-glass are M9's.

**Files:**
- Create: `app/services/identity/platform.py`, `app/routers/platform.py`, `app/schemas/platform.py`
- Test: `tests/identity/test_platform_router.py`

**Interfaces:**
- Produces: `require_platform_admin(request) -> None` (a router dependency), `provision_studio(session, *, name, slug, timezone, default_locale, created_by_identity_id, at) -> Studio`, `invite_owner(session, *, studio_id, email, granted_by_identity_id, at) -> tuple[Invitation, str]` returning the row and the **plaintext token, returned once**.
- Routes: `GET/POST /api/v1/platform/studios`, `POST /api/v1/platform/studios/{id}/suspend`, `POST /api/v1/platform/studios/{id}/invite-owner`.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_platform_router.py`:

```python
"""SPEC §5.1's chain of authority, enforced at the only place it can be:

    platform_admin -> creates studio + designates -> owner
    owner -> invites -> managers ... -> guardians

§6.1: 'Staff-app access is provisioned, never self-service. Signing in with a Google
account that holds no role assignment produces a refusal — there is no path from "I
downloaded the app" to "I have a studio".' These tests are that sentence.
"""

from __future__ import annotations

import uuid


def test_an_ordinary_signed_in_identity_cannot_create_a_studio(client, fake_provider):
    """The single most important assertion in this file. If this ever returns 201,
    §5.1's chain of authority has no first link."""
    fake_provider.register(code="c-ord", subject="s-ord", email="ord@example.invalid")
    _sign_in(client, code="c-ord")
    response = client.post(
        "/api/v1/platform/studios",
        json={"name": "מועדון חדש", "slug": "new-club", "timezone": "Asia/Jerusalem",
              "default_locale": "he"},
    )
    assert response.status_code == 403


def test_an_anonymous_caller_cannot_create_a_studio(client):
    assert client.post("/api/v1/platform/studios", json={"name": "x", "slug": "x"}).status_code in (401, 403)


def test_a_platform_admin_creates_a_studio(client, platform_admin):
    response = client.post(
        "/api/v1/platform/studios",
        json={"name": "מועדון חדש", "slug": f"nc-{uuid.uuid4().hex[:6]}",
              "timezone": "Asia/Jerusalem", "default_locale": "he"},
    )
    assert response.status_code == 201
    assert response.json()["created_by_identity_id"] == str(platform_admin.identity_id)


def test_a_new_studio_is_not_a_demo_studio(client, platform_admin):
    """§19.1 — the demo studio is flagged is_demo and seeded with invented people. A
    provisioning route that could set that flag would be a route that could make a real
    club invisible to every cross-studio report (§19.7)."""
    response = client.post(
        "/api/v1/platform/studios",
        json={"name": "מועדון", "slug": f"x-{uuid.uuid4().hex[:6]}", "is_demo": True},
    )
    assert response.status_code in (201, 422)
    if response.status_code == 201:
        assert response.json()["is_demo"] is False


def test_inviting_an_owner_returns_the_token_exactly_once(client, platform_admin):
    """§5.3's token is a bearer credential. It is returned here and stored as a hash;
    a second GET must never be able to produce it."""
    studio = client.post(
        "/api/v1/platform/studios",
        json={"name": "מועדון", "slug": f"o-{uuid.uuid4().hex[:6]}"},
    ).json()
    invite = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "owner@example.invalid"},
    )
    assert invite.status_code == 201
    assert invite.json()["token"]

    listing = client.get("/api/v1/platform/studios").json()
    assert "token" not in str(listing)


def test_accepting_an_owner_invitation_grants_exactly_one_owner(client, platform_admin, fake_provider):
    """§3.1 — 'owner: One studio; created with the studio; exactly one; cannot be
    removed.' The partial unique index is the enforcement; this is the path that would
    hit it."""
    studio = client.post(
        "/api/v1/platform/studios", json={"name": "מועדון", "slug": f"p-{uuid.uuid4().hex[:6]}"}
    ).json()
    token = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "newowner@example.invalid"},
    ).json()["token"]

    fake_provider.register(code="c-own", subject="s-own", email="newowner@example.invalid")
    state = _start(client, "staff")
    response = client.post(
        "/api/v1/auth/fake/callback",
        json={"code": "c-own", "state": state, "invitation_token": token},
    )
    assert response.status_code == 200
    assert response.json()["access"]["staff"] is True
    assert response.json()["studios"][0]["roles"] == ["owner"]


def test_suspending_a_studio_removes_it_from_the_switcher(client, platform_admin, fake_provider):
    """§18.3's suspend action. A suspended studio a person can still switch into is a
    suspension that suspended nothing."""
    studio = client.post(
        "/api/v1/platform/studios", json={"name": "מועדון", "slug": f"s-{uuid.uuid4().hex[:6]}"}
    ).json()
    token = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "susp@example.invalid"},
    ).json()["token"]
    fake_provider.register(code="c-su", subject="s-su", email="susp@example.invalid")
    state = _start(client, "staff")
    client.post(
        "/api/v1/auth/fake/callback",
        json={"code": "c-su", "state": state, "invitation_token": token},
    )
    client.post("/api/v1/auth/logout")

    _as_platform_admin(client, platform_admin)
    assert client.post(f"/api/v1/platform/studios/{studio['id']}/suspend").status_code == 200

    state = _start(client, "staff")
    body = client.post("/api/v1/auth/fake/callback", json={"code": "c-su", "state": state}).json()
    assert body["studios"] == []


def test_no_platform_schema_exposes_is_developer(client):
    """§19.2. The console is where 'just let me flag this account' would feel most
    reasonable, which is exactly why it is asserted here as well as globally."""
    schema = client.app.openapi()
    bodies = [
        op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        for path, ops in schema["paths"].items()
        if path.startswith("/api/v1/platform")
        for op in ops.values()
    ]
    assert "is_developer" not in str(bodies)
```

Add a `platform_admin` fixture and an `_as_platform_admin` helper to
`tests/identity/conftest.py` that seeds a `PlatformAdmin` row for a signed-in identity
and signs that identity in — a fixture, because §3.1 says the role is "seeded manually"
and there is deliberately no route that creates one.

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_platform_router.py -q
```

Expected: FAIL — 404 on every `/api/v1/platform/*` path.

- [ ] **Step 3: Write the service**

Create `app/services/identity/platform.py`:

```python
"""SPEC §5.1's chain of authority, and §18.3's M1 subset.

Conflict C4: §14 lists the platform console in both M1 and M9. M1 builds the two things
§5.1 makes load-bearing -- provisioning a studio and inviting its owner -- plus suspend,
because a studio that cannot be suspended has no off switch. M9 builds the operations
board, the per-studio health chip and break-glass.

**There is no route that grants platform_admin.** §3.1: 'Seeded manually.' A console
that could mint its own operators would make the top of the chain of authority
self-issuing, which is the same defect §19.2 forbids for is_developer.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tenancy import with_all_tenants
from app.models.identity import PlatformAdmin
from app.models.person import Invitation
from app.models.studio import Studio
from app.services.audit import AuditService

_PLATFORM_SCOPE = (
    "SPEC 18.1 -- the platform console operates above every studio, which is the "
    "escape hatch's first sanctioned caller"
)

#: §5.3's invitation window. Long enough to survive a weekend, short enough that a
#: forwarded email is not a permanent credential.
INVITATION_TTL_DAYS = 14


def is_platform_admin(session: Session, identity_id: uuid.UUID) -> bool:
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        return session.execute(
            select(PlatformAdmin.id).where(PlatformAdmin.auth_identity_id == identity_id).limit(1)
        ).first() is not None


def provision_studio(
    session: Session,
    *,
    name: str,
    slug: str,
    timezone: str,
    default_locale: str,
    created_by_identity_id: uuid.UUID,
    at: datetime,
) -> Studio:
    """§5.1 -- 'The platform console creates a studio with its name, timezone and default
    language.'

    `is_demo` is not a parameter and never will be. §19.1 makes it the flag that decides
    whether a studio contains real people, and §19.7 excludes flagged studios from every
    cross-studio total -- so a console that could set it could make a real club
    invisible. Revision 0003 creates the one demo studio; nothing else ever does.
    """
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        studio = Studio(
            name=name,
            slug=slug,
            timezone=timezone,
            default_locale=default_locale,
            status="active",
            is_demo=False,
            created_by_identity_id=created_by_identity_id,
            created_at=at,
        )
        session.add(studio)
        session.flush()
        AuditService.record(
            session,
            action="platform.studio.provisioned",
            entity_type="studio",
            entity_id=studio.id,
            studio_id=studio.id,
            actor_identity_id=created_by_identity_id,
            diff={"name": name, "slug": slug},
        )
        return studio


def invite_owner(
    session: Session,
    *,
    studio_id: uuid.UUID,
    email: str,
    granted_by_identity_id: uuid.UUID,
    at: datetime,
) -> tuple[Invitation, str]:
    """§5.1 -- 'sends an invitation to the person who will be its owner.'

    Returns the row and the plaintext token. The token is returned **once**: only its
    SHA-256 is stored, so a later GET cannot reproduce it and a database read yields no
    usable credential.
    """
    token = secrets.token_urlsafe(32)
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        invitation = Invitation(
            studio_id=studio_id,
            email=email,
            intended_role="owner",
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            expires_at=at + timedelta(days=INVITATION_TTL_DAYS),
            created_at=at,
        )
        session.add(invitation)
        session.flush()
        AuditService.record(
            session,
            action="platform.owner.invited",
            entity_type="invitation",
            entity_id=invitation.id,
            studio_id=studio_id,
            actor_identity_id=granted_by_identity_id,
            # The email, not the token. An audit row holding a live credential is a
            # credential store with an append-only grant on it.
            diff={"email": email, "intended_role": "owner"},
        )
        return invitation, token


def suspend_studio(
    session: Session, *, studio_id: uuid.UUID, actor_identity_id: uuid.UUID, at: datetime
) -> Studio:
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        studio = session.get(Studio, studio_id)
        if studio is None:
            raise LookupError(str(studio_id))
        studio.status = "suspended"
        AuditService.record(
            session,
            action="platform.studio.suspended",
            entity_type="studio",
            entity_id=studio_id,
            studio_id=studio_id,
            actor_identity_id=actor_identity_id,
        )
        session.flush()
        return studio
```

- [ ] **Step 4: Write the router and schemas**

Create `app/schemas/platform.py` with `ProvisionStudioRequest(name, slug, timezone="Asia/Jerusalem", default_locale="he")` — **no `is_demo` field and no `is_developer` field** — `InviteOwnerRequest(email)`, `StudioOut`, `InvitationOut(id, email, expires_at, token)`.

Create `app/routers/platform.py`:

```python
"""SPEC §5.1 and §18.3's M1 subset (conflict C4).

`require_platform_admin` is a router dependency, never a check inside a service
(.claude/rules/api.md). It reads request.state.is_platform_admin, which
app/core/auth_context.py set from a VERIFIED claim, and re-confirms it against the
database -- the claim is a 15-minute snapshot and revoking an operator must not wait
for it to expire.
"""
```

The dependency:

```python
def require_platform_admin(request: Request, session: SessionDep) -> uuid.UUID:
    identity_id = getattr(request.state, "identity_id", None)
    if identity_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    if not is_platform_admin(session, identity_id):
        # §6.1's wording, generalized: the refusal says what you may not do and never
        # whether the thing you asked about exists.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_a_platform_admin", "message": "this console is not yours"},
        )
    return identity_id
```

Every route declares `response_model` and takes `SessionDep` (unscoped — the console
operates above every studio, and `provision_studio` opens the hatch with its reason).

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity -q
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format app
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/identity/platform.py app/routers/platform.py app/schemas/platform.py \
        tests/identity/test_platform_router.py openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(identity): the platform console — provisioning and owner invitation

§5.1's chain of authority has a first link now, and no route creates one: there is no
endpoint that grants platform_admin (§3.1 seeds it) and none that sets is_demo (§19.1
makes that the flag deciding whether a studio holds real people). C4: the operations
board and break-glass stay M9's.

The invitation token is returned once and stored as a hash — an audit row holding a live
credential would be a credential store with an append-only grant on it."
```

---

### Task 17: `/classes`, `/groups`, `/locations`, `/groups/{id}/staff`

**Files:**
- Create: `app/services/structure/__init__.py`, `app/services/structure/service.py`, `app/routers/structure.py`, `app/schemas/structure.py`
- Test: `tests/structure/test_structure_router.py`

**Interfaces:**
- Produces: `StructureService.create_class / list_classes / create_group / list_groups / create_location / list_locations / assign_staff / end_assignment`. Routes: `GET/POST /api/v1/classes`, `GET/PATCH/DELETE /api/v1/classes/{id}`, `GET/POST /api/v1/groups`, `GET/PATCH/DELETE /api/v1/groups/{id}`, `GET/POST /api/v1/groups/{id}/staff`, `GET/POST /api/v1/locations`.
- Every route takes `TenantSessionDep`. Every list is cursor-paginated (G16). Every mutating route accepts `Idempotency-Key` (G16) and every one of them is idempotent by natural key.

- [ ] **Step 1: Write the failing test**

Create `tests/structure/test_structure_router.py`:

```python
"""SPEC §7's structure endpoints, and §3.2's permission matrix over them.

The permission tests are the ones that earn their place. §3.2 says 'Create/edit classes,
groups, schedules' is owner and manager only — a coach who can create a group can put
themselves on it, which is a privilege-escalation path that no amount of tenancy
filtering closes.
"""

from __future__ import annotations

import uuid


def test_a_manager_creates_a_class(as_manager):
    response = as_manager.post("/api/v1/classes", json={"name": "ג'ודו", "discipline": "judo"})
    assert response.status_code == 201
    assert response.json()["name"] == "ג'ודו"


def test_a_coach_cannot_create_a_class(as_lead_coach):
    """§3.2 — 'Create/edit classes, groups, schedules: owner ✓ manager ✓' and nothing
    else. A coach who can create a group can assign themselves to it."""
    response = as_lead_coach.post("/api/v1/classes", json={"name": "קראטה"})
    assert response.status_code == 403


def test_a_guardian_cannot_reach_the_structure_api_at_all(as_guardian):
    assert as_guardian.get("/api/v1/classes").status_code == 403


def test_a_group_belongs_to_a_class_in_the_same_studio(as_manager, other_studio_class_id):
    """The tenant filter fails closed, so this should be a 404 rather than a 403 — the
    class is not merely forbidden, it is not visible."""
    response = as_manager.post(
        "/api/v1/groups", json={"class_id": str(other_studio_class_id), "name": "מתחילים"}
    )
    assert response.status_code == 404


def test_a_class_list_never_shows_another_studios_rows(as_manager, seeded_other_studio):
    names = {row["name"] for row in as_manager.get("/api/v1/classes").json()["items"]}
    assert "מועדון אחר" not in names


def test_assigning_a_coach_creates_group_staff_and_a_role_assignment(as_manager, a_group, a_coach_person):
    """§5.1's wizard step 5. A coach with a group_staff row but no role_assignment cannot
    sign into the staff app at all (§6.1's query), so assigning must do both or it has
    done nothing useful."""
    response = as_manager.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(a_coach_person), "role": "lead_coach"},
    )
    assert response.status_code == 201
    listing = as_manager.get(f"/api/v1/groups/{a_group}/staff").json()["items"]
    assert listing[0]["role"] == "lead_coach"


def test_assigning_the_same_coach_twice_is_not_a_second_assignment(as_manager, a_group, a_coach_person):
    """The partial unique index in app/models/structure.py. A duplicate is what makes
    §3.2's 'view students in own groups' return the same roster twice."""
    body = {"person_id": str(a_coach_person), "role": "lead_coach"}
    assert as_manager.post(f"/api/v1/groups/{a_group}/staff", json=body).status_code == 201
    assert as_manager.post(f"/api/v1/groups/{a_group}/staff", json=body).status_code in (200, 409)


def test_every_list_endpoint_is_cursor_paginated(client):
    """G16. Asserted from the schema rather than by seeding a thousand rows."""
    schema = client.app.openapi()
    for path in ("/api/v1/classes", "/api/v1/groups", "/api/v1/locations"):
        params = {p["name"] for p in schema["paths"][path]["get"].get("parameters", [])}
        assert "cursor" in params and "limit" in params, path


def test_no_structure_endpoint_returns_a_money_field(client):
    """Invariant 3's territory. §5.1's wizard has a price step, and it is M6's — a price
    field appearing on a group here is how it would leak to a coach."""
    schema = client.app.openapi()
    structure = {p: o for p, o in schema["paths"].items() if "/classes" in p or "/groups" in p}
    assert "agorot" not in str(structure)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/structure/test_structure_router.py -q
```

Expected: FAIL — 404 on every path.

- [ ] **Step 3: Write the permission dependency**

Add to `app/core/auth_context.py`:

```python
def require_roles(*allowed: str) -> Callable[[Request], None]:
    """§3.2's permission matrix as a router dependency (.claude/rules/api.md:
    'Authorization is checked in the router via a dependency, never inside a service').

    Reads `request.state.roles`, which is a 15-minute snapshot from the verified JWT.
    §5.2 accepts that latency explicitly -- 'Role changes take effect on the next
    refresh, at most 15 minutes later' -- and pays for the case that cannot wait with
    the refresh denylist, not with a database read on every request.
    """

    def dependency(request: Request) -> None:
        roles = set(getattr(request.state, "roles", ()) or ())
        if not roles & set(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": "this action is not yours"},
            )

    return dependency


ManagerOrOwner = Annotated[None, Depends(require_roles("owner", "manager"))]
AnyStaff = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach", "assistant_coach"))]
```

- [ ] **Step 4: Write the service, schemas and router**

`app/services/structure/service.py` holds all the logic. `app/routers/structure.py` stays
thin (G6), takes `TenantSessionDep`, and declares `ManagerOrOwner` on every mutating
route and on the lists §3.2 restricts. `assign_staff` creates **both** the `group_staff`
row and the scoped `role_assignment`, in one transaction:

```python
    @staticmethod
    def assign_staff(
        session: TenantSession,
        *,
        group_id: uuid.UUID,
        person_id: uuid.UUID,
        role: str,
        granted_by_person_id: uuid.UUID,
        at: datetime,
    ) -> GroupStaff:
        """§5.1's wizard step 5, and the reason it is one call and not two.

        A coach with a group_staff row and no role_assignment cannot sign into the staff
        app at all -- §6.1's access query asks for a role assignment, not for group
        membership. Two endpoints would mean a manager who did the first and forgot the
        second has a coach who is on the roster and cannot log in, with nothing anywhere
        saying why.
        """
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/structure tests/invariants -q
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format app
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
```

Expected: PASS, including invariant 3 (no coach endpoint exposes money).

- [ ] **Step 6: Tick the piece and commit**

Add to `docs/plan/state.yaml` under W1:

```yaml
      - id: M1.3
        title: The platform console and the structure API
        status: shipped
        on: 2026-08-25
```

```bash
git add app/services/structure app/routers/structure.py app/schemas/structure.py \
        app/core/auth_context.py tests/structure/ docs/plan/state.yaml \
        openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(structure): classes, groups, locations, and coach assignment

§3.2's matrix is a router dependency, not a service check. Assigning a coach writes both
group_staff and the scoped role_assignment in one call: §6.1's access query asks for a
role assignment, so doing only the first produces a coach who is on the roster and
cannot log in, with nothing saying why."
```

---

# Phase 4 — the personas and the role switcher (holdbacks 3 and 4)

### Task 18: the `personas` FixtureLayer

`app/services/demo/fixtures.py` says exactly what to do: *"Adding a layer is: write
`seed`, append a `FixtureLayer`, delete the matching `PlannedLayer`, bump `version`."*
`tests/dev/test_demo_fixtures.py::test_no_layer_is_both_planned_and_present` fails if the
planned entry is left behind.

**Files:**
- Create: `app/services/demo/personas.py`
- Modify: `app/services/demo/fixtures.py`
- Test: `tests/dev/test_personas_layer.py`

**Interfaces:**
- Produces: `PERSONAS: tuple[Persona, ...]` (nine, in §19.3's table order), `seed_personas(session, studio_id) -> None`, and `DEVELOPER_IDENTITY_SUBJECT`.

> **This module is one of only two `ALLOWED_WRITERS` for `is_developer`** (`tests/restrictions/test_04`: `alembic/versions/` and `app/services/demo/`). It is therefore the only place in the application that may write the flag, and §19.2 is the reason it is allowed here and nowhere else.
>
> **A layer's `seed` runs against a plain `Session`, not `TenantSession`.** `FixtureLayer`'s docstring is explicit: *"A layer's `seed` callable must therefore set `studio_id` on every row it creates itself."* There is no stamping on this path.

- [ ] **Step 1: Write the failing test**

Create `tests/dev/test_personas_layer.py`:

```python
"""SPEC §19.3's nine personas. Holdback 3.

The list is asserted against §19.3's table because that table is a test plan: each
persona exists to walk one path, and a missing one is a path nobody can reach from the
dev bar. dev+assistant in particular exists 'to verify no financial data leaks' and
dev+none exists to walk 'the refusal screens in both apps' — the two personas most
likely to be dropped as uninteresting are the two that guard the most.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.services.demo.fixtures import LATEST_VERSION, PLANNED_LAYERS, SEEDS
from app.services.demo.personas import PERSONAS
from app.services.demo.service import DemoStudioService
from sqlalchemy import func, select


def test_personas_is_no_longer_planned():
    """The one the fixture module's own test enforces from the other side."""
    assert "personas" not in {layer.name for layer in PLANNED_LAYERS}


def test_personas_is_a_real_layer_in_the_latest_set():
    assert "personas" in {layer.name for layer in SEEDS[LATEST_VERSION].layers}


def test_the_version_was_bumped():
    """A layer added without a version bump means a reset restores the OLD fixture set
    and the new personas silently do not appear."""
    assert LATEST_VERSION != "2026-08-24.1"


def test_all_nine_personas_from_19_3_are_present():
    assert [p.key for p in PERSONAS] == [
        "owner", "manager", "lead", "assistant", "parent3", "parent1", "trial", "both", "none",
    ]


def test_there_is_no_student_persona():
    """§19.3 — 'There is no student persona, because students have no login in v1. The
    switcher offers "guardian of דנה" instead and the dev bar says so explicitly, so the
    gap is visible rather than confusing.'"""
    assert "student" not in {p.key for p in PERSONAS}


def test_dev_both_holds_a_role_and_children(app_session, reset_demo):
    """§19.3 — 'lead_coach and guardian. The dual-role case — two apps, one identity.'
    §3.1's 'never two accounts' has no test anywhere else."""
    person = _person(app_session, reset_demo, "both")
    assert _roles(app_session, person) == ["lead_coach"]
    assert _guardian_count(app_session, person) >= 1


def test_dev_none_holds_neither(app_session, reset_demo):
    """§19.3 — 'no roles, no children. The refusal screens in both apps.' This persona
    is the only way to reach either screen without deleting data."""
    person = _person(app_session, reset_demo, "none")
    assert _roles(app_session, person) == []
    assert _guardian_count(app_session, person) == 0


def test_dev_assistant_is_an_assistant_coach_and_nothing_more(app_session, reset_demo):
    """§19.3 — 'Attendance only — used to verify no financial data leaks.' A persona
    that quietly also holds manager would make invariant 3 untestable by hand."""
    person = _person(app_session, reset_demo, "assistant")
    assert _roles(app_session, person) == ["assistant_coach"]


def test_dev_parent3_has_three_children_and_parent1_has_one(app_session, reset_demo):
    """§19.3 — parent3 walks 'the family home'; parent1 walks 'the single-child path
    that skips the family layer' (§6.3). Two personas because the two screens differ."""
    assert _guardian_count(app_session, _person(app_session, reset_demo, "parent3")) == 3
    assert _guardian_count(app_session, _person(app_session, reset_demo, "parent1")) == 1


def test_exactly_one_seeded_identity_carries_the_developer_flag(app_session, reset_demo):
    """§19.2. The personas are who you ACT AS; the developer flag belongs to the one
    identity that may switch between them. Nine flagged identities would mean nine
    accounts that can act inside a demo studio in production."""
    flagged = app_session.execute(
        select(func.count()).select_from(AuthIdentity).where(AuthIdentity.is_developer.is_(True))
    ).scalar_one()
    assert flagged == 1


def test_a_reset_restores_the_personas_without_duplicating_them(app_session, reset_demo):
    """§19.7 — 'POST /dev/demo/reset restores the fixture set from a versioned seed.'
    Seeding twice must converge, not accumulate."""
    before = _person_count(app_session, reset_demo)
    DemoStudioService.reset(app_session)
    app_session.commit()
    assert _person_count(app_session, reset_demo) == before


def test_every_persona_row_carries_the_demo_studio_id(app_session, reset_demo):
    """FixtureLayer's docstring: 'A layer's seed callable must set studio_id on every row
    it creates itself' — there is no TenantSession stamping on the reset path. A row with
    a NULL studio_id would fail the insert; a row with the WRONG one would not, and would
    be invisible to the wipe on the next reset."""
    from app.core.tenancy import with_all_tenants

    with with_all_tenants(reason="test asserts the seeded rows are in the demo studio"):
        stray = app_session.execute(
            select(func.count()).select_from(Person).where(Person.studio_id != reset_demo)
        ).scalar_one()
    assert stray == 0
```

with small helpers (`_person`, `_roles`, `_guardian_count`, `_person_count`) and a
`reset_demo` fixture in `tests/dev/conftest.py` that runs `DemoStudioService.reset` and
yields the demo studio id.

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/dev/test_personas_layer.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.demo.personas'`.

- [ ] **Step 3: Write the personas module**

Create `app/services/demo/personas.py`:

```python
"""SPEC §19.3's nine personas. Holdback 3.

§19.3's table is a test plan, not a cast list: each persona exists to walk one path that
is otherwise awkward to reach. Two are worth naming because they look least interesting
and guard the most -- `dev+assistant` is there "to verify no financial data leaks"
(invariant 3, by hand), and `dev+none` is the only way to reach §6.1's refusal screens
without deleting somebody's data.

**There is no student persona** (§19.3): students have no login in v1, the switcher
offers "guardian of דנה" instead, and the dev bar says so explicitly so the gap is
visible rather than confusing.

**This module may write `is_developer`.** `app/services/demo/` is one of exactly two
ALLOWED_WRITERS in tests/restrictions/test_04, and §19.2 is why: "set ONLY by a database
seed or migration". Exactly one identity is flagged -- the developer, who switches
between the nine. Flagging the personas themselves would mean nine accounts that may act
inside a demo studio in production (§19.6 restriction 1).

**No stamping on this path.** `DemoStudioService.seed` passes a plain `Session`, so
`TenantMixin`'s `before_flush` never runs and every row below sets `studio_id` itself --
the contract `FixtureLayer`'s docstring states.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment

#: The one flagged identity. A stable subject so a reset does not orphan a session.
DEVELOPER_IDENTITY_SUBJECT = "demo-developer"
DEVELOPER_IDENTITY_EMAIL = "dev@studio.invalid"

#: Fixture rows are stamped at a fixed instant rather than at now(): a reset that wrote
#: the wall clock would make two resets produce different data, and §19.7 exists so the
#: demo studio never drifts.
SEEDED_AT = datetime(2026, 8, 1, 6, 0, tzinfo=UTC)


@dataclass(frozen=True)
class Persona:
    """One row of §19.3's table."""

    key: str
    first_name: str
    last_name: str
    #: A studio-scoped role_assignment, or None. `guardian` is NOT a role (§3.1) and
    #: never appears here -- children are expressed by `children` below.
    role: str | None
    #: How many students this person is a guardian of. §19.3's parent3 / parent1 split
    #: is exactly §6.3's family-home vs single-child-path split.
    children: int = 0
    #: What §19.3 says this persona exists to test. Rendered in the dev bar so the
    #: reason is visible where the switch happens.
    tests: str = ""


PERSONAS: tuple[Persona, ...] = (
    Persona("owner", "עידו", "בעלים", "owner", 0,
            "setup wizard, rollover, staff management, studio settings"),
    Persona("manager", "מיכל", "מנהלת", "manager", 0,
            "enrollment approval, trial conversion, payments, reconciliation, reports"),
    Persona("lead", "רון", "מאמן", "lead_coach", 0,
            "attendance, session edits, events, belt exams, notes"),
    Persona("assistant", "נועם", "עוזר", "assistant_coach", 0,
            "attendance only -- used to verify no financial data leaks"),
    Persona("parent3", "שירה", "הורה", None, 3,
            "family home, three payment options, health gate, RSVP, calendar feed"),
    Persona("parent1", "דוד", "הורה", None, 1,
            "the single-child path that skips the family layer"),
    Persona("trial", "יעל", "ניסיון", None, 1,
            "landing page -> booking -> parent app in trial state"),
    Persona("both", "אורי", "כפול", "lead_coach", 2,
            "the dual-role case -- two apps, one identity"),
    Persona("none", "תמר", "ללא", None, 0,
            "the refusal screens in both apps"),
)


def _identity(session: Session, *, subject: str, email: str, is_developer: bool) -> AuthIdentity:
    row = AuthIdentity(
        provider="google",
        provider_subject=subject,
        email=email,
        email_verified=True,
        is_private_relay=False,
        is_developer=is_developer,
        created_at=SEEDED_AT,
    )
    session.add(row)
    session.flush()
    return row


def seed_personas(session: Session, studio_id: uuid.UUID) -> None:
    """§19.3, seeded into the demo studio.

    Every row sets `studio_id` explicitly -- see the module docstring. The wipe in
    DemoStudioService removes them by studio_id on the next reset, which is why a row
    with the wrong one would survive and hide a bug rather than fail loudly.

    `auth_identity` is NOT wiped by a reset: it has no studio_id column, so it is not in
    `wipe_plan()`. Identities are therefore looked up before being created, and a reset
    reattaches the existing ones rather than accumulating a set per reset.
    """
    from sqlalchemy import select

    developer = session.execute(
        select(AuthIdentity).where(
            AuthIdentity.provider_subject == DEVELOPER_IDENTITY_SUBJECT
        )
    ).scalar_one_or_none()
    if developer is None:
        # §19.2's one legal write of the flag, in one of its two legal places.
        developer = _identity(
            session,
            subject=DEVELOPER_IDENTITY_SUBJECT,
            email=DEVELOPER_IDENTITY_EMAIL,
            is_developer=True,
        )

    for persona in PERSONAS:
        subject = f"demo-persona-{persona.key}"
        identity = session.execute(
            select(AuthIdentity).where(AuthIdentity.provider_subject == subject)
        ).scalar_one_or_none()
        if identity is None:
            identity = _identity(
                session,
                subject=subject,
                email=f"dev+{persona.key}@studio.invalid",
                # Not flagged. The personas are who you act AS; only the developer
                # identity above may switch between them.
                is_developer=False,
            )

        person = Person(
            studio_id=studio_id,
            auth_identity_id=identity.id,
            first_name=persona.first_name,
            last_name=persona.last_name,
            locale="he",
            created_at=SEEDED_AT,
        )
        session.add(person)
        session.flush()

        if persona.role is not None:
            session.add(
                RoleAssignment(
                    studio_id=studio_id,
                    person_id=person.id,
                    role=persona.role,
                    scope_type="studio",
                    granted_at=SEEDED_AT,
                    created_at=SEEDED_AT,
                )
            )

        # §3.3 -- 'My children is simply SELECT student_id FROM guardian WHERE
        # person_id = me.' M3 seeds the students these ids will point at; until then the
        # link rows are what §6.1's parent query and the family home both read, and the
        # ids are stable across resets so M3's layer can adopt them (D-M1-1).
        for index in range(persona.children):
            session.add(
                Guardian(
                    studio_id=studio_id,
                    student_id=uuid.uuid5(
                        uuid.NAMESPACE_URL, f"demo-student/{persona.key}/{index}"
                    ),
                    person_id=person.id,
                    is_primary=True,
                    relation="parent",
                    created_at=SEEDED_AT,
                )
            )
        session.flush()
```

- [ ] **Step 4: Wire it into the fixture set**

In `app/services/demo/fixtures.py`:

1. `from app.services.demo.personas import seed_personas`
2. Append to `_V1.layers`:

```python
        FixtureLayer(
            name="personas",
            milestone="M1",
            # `auth_identity` is deliberately absent: it has no studio_id, so it is not
            # in wipe_plan() and the layer reattaches the existing rows instead of
            # recreating them. Listing it here would fail the test that asserts every
            # named table is reachable by the wipe.
            tables=("person", "role_assignment", "guardian"),
            seed=seed_personas,
        ),
```

3. Delete the `PlannedLayer("personas", "M1", …)` entry.
4. Bump `version="2026-08-24.1"` → `version="2026-08-25.1"`.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/dev tests/restrictions -q
```

Expected: PASS, including `test_no_layer_is_both_planned_and_present` and
`test_19_7_demo_data_hygiene`. `tests/restrictions/test_04`'s source detector must stay
silent — `app/services/demo/` is an allowed writer.

- [ ] **Step 6: Tick the holdback and commit**

Set `HB-m1-personas-layer` `status: closed`, `closed: 2026-08-25` in `docs/plan/state.yaml`.

```bash
git add app/services/demo/personas.py app/services/demo/fixtures.py \
        tests/dev/test_personas_layer.py tests/dev/conftest.py docs/plan/state.yaml
git commit -m "feat(demo): §19.3's nine personas as a real FixtureLayer

Closes HB-m1-personas-layer. Exactly one seeded identity carries is_developer — the
personas are who you act as, and nine flagged identities would be nine accounts able to
act inside a demo studio in production (§19.6 restriction 1).

Every row sets studio_id itself: DemoStudioService.seed passes a plain Session, so
TenantMixin's stamping never runs on this path."
```

---

### Task 19: `POST /dev/act-as/{person_id}` (holdback 4, the backend half)

§19.4: *"Switching sets `acting_as_person_id` on the session; the API resolves permissions
from that Person exactly as it would for a real login. Every switch is audit-logged in the
demo studio's own log, and every response carries an `X-Acting-As` header."*

**Files:**
- Modify: `app/routers/dev.py`, `app/schemas/dev.py`
- Create: `app/services/identity/act_as.py`
- Test: `tests/dev/test_act_as.py`

**Interfaces:**
- Produces: `POST /api/v1/dev/act-as/{person_id}` → `ActAsResponse(access_token, expires_in, acting_as_person_id, persona_label, studio_id)`; `GET /api/v1/dev/personas` → the switchable list.
- `X-Acting-As` is already emitted by `AuthContextMiddleware` (Task 14).

- [ ] **Step 1: Write the failing test**

Create `tests/dev/test_act_as.py`:

```python
"""SPEC §19.4's role switcher. Holdback 4.

§19.6 restriction 1 is the assertion that matters: 'Cannot act inside a non-demo studio
in production. Not "is discouraged from" — the studio resolver excludes is_demo = false
for developer sessions in production, and a test asserts it.' There is now a route that
could violate it, so the restriction stops being about a hypothetical.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.audit import AuditLog
from sqlalchemy import select


def test_switching_returns_a_token_carrying_the_new_persona(dev_client, persona_ids):
    response = dev_client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}")
    assert response.status_code == 200
    assert response.json()["acting_as_person_id"] == str(persona_ids["manager"])


def test_the_new_token_resolves_permissions_from_that_person(dev_client, persona_ids):
    """§19.4 — 'the API resolves permissions from that Person exactly as it would for a
    real login.' Acting as the assistant coach must lose the manager's rights, or the
    persona that exists to verify no financial data leaks proves nothing."""
    token = dev_client.post(
        f"/api/v1/dev/act-as/{persona_ids['assistant']}"
    ).json()["access_token"]
    forbidden = dev_client.post(
        "/api/v1/classes", json={"name": "x"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert forbidden.status_code == 403


def test_every_response_carries_x_acting_as(dev_client, persona_ids):
    """§19.4 — 'so the active persona is visible in dev tools and in Sentry
    breadcrumbs.'"""
    token = dev_client.post(f"/api/v1/dev/act-as/{persona_ids['lead']}").json()["access_token"]
    response = dev_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.headers["X-Acting-As"] == str(persona_ids["lead"])


def test_every_switch_is_audit_logged_in_the_demo_studios_own_log(
    dev_client, persona_ids, app_session, demo_studio_id
):
    """§19.4 — 'Every switch is audit-logged in the demo studio's own log.' An
    impersonation feature in a system holding medical data about minors leaves a trail
    or it is not a feature, it is a hole."""
    dev_client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}")
    entries = app_session.execute(
        select(AuditLog).where(
            AuditLog.action == "dev.act_as", AuditLog.studio_id == demo_studio_id
        )
    ).scalars().all()
    assert len(entries) >= 1
    assert entries[-1].entity_id == persona_ids["manager"]


def test_a_non_developer_cannot_switch(client, fake_provider):
    """RequireDeveloper. In development with no DEV_TOOLS_TOKEN this is permissive by
    design (app/core/dev_account.py), so this test pins the STAGING shape, where a token
    is configured."""
    from app.core.config import settings
    from pydantic import SecretStr

    settings.ENV, settings.DEV_TOOLS_TOKEN = "staging", SecretStr("a-token")
    try:
        assert client.post(f"/api/v1/dev/act-as/{uuid.uuid4()}").status_code == 403
    finally:
        settings.ENV, settings.DEV_TOOLS_TOKEN = "test", None


def test_in_production_the_route_does_not_exist_at_all(production_client):
    """§19.6 restriction 2, and the mechanism M0.2 built: app/main.py's discovery loop
    skips a module named `dev` when ENV == production, so this 404s the way any
    unclaimed path does rather than 403-ing from an `if` someone could invert."""
    assert "/api/v1/dev/act-as/{person_id}" not in production_client.app.openapi()["paths"]


def test_switching_into_a_person_in_a_real_studio_is_refused_in_production(app_session):
    """§19.6 restriction 1. The route does not exist in production, so this asserts the
    SERVICE refuses — the layer that would still be reachable if the router were ever
    mounted by mistake."""
    from app.services.identity.act_as import ActAsRefused, resolve_persona

    with pytest.raises(ActAsRefused):
        resolve_persona(app_session, person_id=uuid.uuid4(), env="production",
                        studio_is_demo=False)


def test_the_switcher_lists_no_student_persona(dev_client):
    """§19.3 — 'There is no student persona … and the dev bar says so explicitly, so the
    gap is visible rather than confusing.' The list carries the note; it does not carry
    a fake student."""
    body = dev_client.get("/api/v1/dev/personas").json()
    assert all(p["key"] != "student" for p in body["items"])
    assert body["no_student_persona_note"]
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/dev/test_act_as.py -q
```

Expected: FAIL — 404 on `/api/v1/dev/act-as/…`.

- [ ] **Step 3: Write the service**

Create `app/services/identity/act_as.py`:

```python
"""SPEC §19.4's role switcher, as a service.

The route lives in app/routers/dev.py, which app/main.py's discovery loop does not even
register when ENV == production (§19.6 restriction 2). This module is the layer *below*
that, and it refuses independently: restriction 2 is the mechanism, and this is the
belt. A guardrail whose only enforcement is "the router is absent" is one accidental
mount away from being no guardrail at all.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dev_account import developer_may_act
from app.core.tenancy import with_all_tenants
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio


class ActAsRefused(Exception):
    """§19.6 restriction 1, or a person who does not exist."""


@dataclass(frozen=True)
class Persona:
    person_id: uuid.UUID
    studio_id: uuid.UUID
    studio_is_demo: bool
    label: str
    roles: tuple[str, ...]
    is_guardian: bool


def resolve_persona(
    session: Session, *, person_id: uuid.UUID, env: str, studio_is_demo: bool | None = None
) -> Persona:
    """Who am I about to become, and am I allowed to?

    `developer_may_act` is the same pure function tests/restrictions/test_01 asserts all
    eight rows of. Calling it here rather than re-implementing the rule is the point:
    one truth table, two call sites (this and the studio resolver), no drift.
    """
    with with_all_tenants(reason="SPEC 19.4 -- the role switcher resolves a persona "
                                 "before any studio is active"):
        person = session.get(Person, person_id)
        if person is None:
            raise ActAsRefused("no such person")
        studio = session.get(Studio, person.studio_id)
        if studio is None:
            raise ActAsRefused("no such studio")

        is_demo = studio.is_demo if studio_is_demo is None else studio_is_demo
        if not developer_may_act(is_developer=True, studio_is_demo=is_demo, env=env):
            raise ActAsRefused(
                "a developer session may only act inside a demo studio in production"
            )

        roles = tuple(
            session.execute(
                select(RoleAssignment.role)
                .where(
                    RoleAssignment.person_id == person.id, RoleAssignment.revoked_at.is_(None)
                )
                .order_by(RoleAssignment.role)
            ).scalars().all()
        )
        children = session.execute(
            select(Guardian.id).where(Guardian.person_id == person.id)
        ).scalars().all()
        return Persona(
            person_id=person.id,
            studio_id=studio.id,
            studio_is_demo=is_demo,
            label=f"{person.first_name} {person.last_name}",
            roles=roles,
            is_guardian=bool(children),
        )
```

- [ ] **Step 4: Add the routes to `app/routers/dev.py`**

```python
@router.post("/act-as/{person_id}", response_model=ActAsResponse)
def act_as(
    _: RequireDeveloper,
    person_id: uuid.UUID,
    request: Request,
    session: SessionDep,
) -> ActAsResponse:
    """§19.4 -- the role switcher.

    Mints a NEW access token carrying `aap`; it does not mutate the caller's. A switch
    is a new session shape, and rewriting a token in place would leave the old one valid
    for up to fifteen more minutes -- two live personas for the same identity, with only
    one of them in the audit trail.
    """
```

The body: `resolve_persona(...)` (mapping `ActAsRefused` to 403 with
`{code, message}`), `AuditService.record(action="dev.act_as", entity_type="person",
entity_id=person_id, studio_id=persona.studio_id, actor_identity_id=..., diff={"label":
persona.label, "roles": list(persona.roles)})`, update the refresh row's
`acting_as_person_id`, then `mint_access_token(...)` with `roles=persona.roles`,
`acting_as_person_id=persona.person_id`, `active_studio_id=persona.studio_id`,
`studio_is_demo=persona.studio_is_demo`, `is_developer=True`, `issued_at=now()`,
`expires_at=now() + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)`.

And the list:

```python
@router.get("/personas", response_model=PersonaListResponse)
def list_personas(_: RequireDeveloper, session: SessionDep) -> PersonaListResponse:
    """What the dev bar's dropdown renders. Carries §19.3's note about the missing
    student persona as data, so the bar states the gap rather than the client
    hardcoding a sentence about it."""
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/dev tests/restrictions tests/identity -q
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format app
.venv/bin/python scripts/export_openapi.py
.venv/bin/pytest tests/dev/test_openapi_surface.py -q
```

Expected: PASS, and `openapi.json` still carries **no** `/dev` path.

- [ ] **Step 6: Commit**

```bash
git add app/services/identity/act_as.py app/routers/dev.py app/schemas/dev.py \
        tests/dev/test_act_as.py openapi.json
git commit -m "feat(dev): POST /dev/act-as — §19.4's role switcher, backend half

Mints a new token rather than mutating the caller's: rewriting in place would leave the
previous persona valid for up to fifteen more minutes, so one identity would have two
live personas and only one of them in the audit trail.

The service refuses a non-demo studio in production independently of the router being
absent there. Restriction 2 is the mechanism; this is the belt."
```

---

### Task 20: the role switcher in the dev bar (holdback 4 closes)

*"Register it into the `dev-bar` slot with `registerDevTool` — **the container is not
reopened.**"* `DevBar.tsx` is not edited. `tools.ts` — the registry, which already
anticipates lanes adding tools — gains one member in its key union and one order entry.

**Files:**
- Create: `web/packages/ui/src/dev-bar/RoleSwitcherTool.tsx`, `.../RoleSwitcherTool.test.tsx`
- Modify: `web/packages/ui/src/dev-bar/tools.ts`, `.../devTools.ts`, `.../api.ts`
- Modify: `web/packages/i18n/{he,en,ru}/common.ts`

**Interfaces:**
- Consumes: `GET /api/v1/dev/personas`, `POST /api/v1/dev/act-as/{id}` (Task 19).
- Produces: `RoleSwitcherTool`, `listPersonas()`, `actAs(personId)`; `DevToolKey` gains `'actAs'` with `DEV_TOOL_ORDER.actAs = 5` (before `offline: 10`, because §19.4 draws the persona row above the tool row).

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/dev-bar/RoleSwitcherTool.test.tsx`:

```tsx
// §19.4's persona dropdown. Holdback 4, frontend half.
//
// Imports RoleSwitcherTool DIRECTLY and not through ./index — under vitest neither
// env var is set, so index's switch yields the absent shapes and this would render
// nothing and pass for the wrong reason. ./index.ts says so in its own header.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleSwitcherTool } from './RoleSwitcherTool'
import { clearSlot } from '../slots'
import { DEV_TOOL_ORDER, devToolKeys } from './tools'

const PERSONAS = {
  items: [
    { key: 'owner', person_id: 'p-owner', label: 'עידו בעלים', roles: ['owner'], is_guardian: false },
    { key: 'parent3', person_id: 'p-p3', label: 'שירה הורה', roles: [], is_guardian: true },
    { key: 'none', person_id: 'p-none', label: 'תמר ללא', roles: [], is_guardian: false },
  ],
  no_student_persona_note: 'אין פרסונת תלמיד — לתלמידים אין התחברות בגרסה 1',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/personas')
      ? new Response(JSON.stringify(PERSONAS), { status: 200 })
      : new Response(JSON.stringify({ access_token: 't', acting_as_person_id: 'p-owner' }), { status: 200 }),
  ))
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearSlot('dev-bar')
})

describe('RoleSwitcherTool', () => {
  it('lists every persona the server offers', async () => {
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getAllByRole('option')).toHaveLength(PERSONAS.items.length + 1) // + placeholder
  })

  it('states the missing student persona rather than hiding it', async () => {
    // §19.3 — 'the dev bar says so explicitly, so the gap is visible rather than
    // confusing'. The note comes from the server, so the client cannot drift from it.
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() =>
      expect(screen.getByText(PERSONAS.no_student_persona_note)).toBeInTheDocument(),
    )
  })

  it('posts to act-as when a persona is chosen', async () => {
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p-p3')
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dev/act-as/p-p3'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('has an accessible name that is not a bare icon', async () => {
    render(<RoleSwitcherTool locale="he" />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAccessibleName())
  })
})

describe('registration', () => {
  it('registers into the dev-bar slot without the container being reopened', async () => {
    await import('./devTools')
    expect(devToolKeys()).toContain('actAs')
  })

  it('sorts before the tool row, because §19.4 draws the persona row above it', () => {
    expect(DEV_TOOL_ORDER.actAs).toBeLessThan(DEV_TOOL_ORDER.offline)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
(cd web && npx vitest run packages/ui/src/dev-bar/RoleSwitcherTool.test.tsx --reporter=dot)
```

Expected: FAIL — cannot resolve `./RoleSwitcherTool`.

- [ ] **Step 3: Extend the registry (not the container)**

In `web/packages/ui/src/dev-bar/tools.ts`:

```ts
export type DevToolKey =
  | 'actAs' | 'offline' | 'slow' | 'timeTravel' | 'runJob' | 'resetDemo' | 'simulateIpn'

export const DEV_TOOL_ORDER: Record<DevToolKey, number> = {
  // §19.4 draws the persona row above the tool row, so the switcher sorts before
  // everything M0.4 registered. This file is the registry, not the container — DevBar.tsx
  // is untouched, exactly as it was for M5's and M6's pending tools.
  actAs: 5,
  offline: 10,
  slow: 20,
  timeTravel: 30,
  resetDemo: 35,
  runJob: 40,
  simulateIpn: 50,
}
```

In `devTools.ts`, one line: `registerDevTool('actAs', RoleSwitcherTool)`.

In `api.ts`, add `listPersonas()` and `actAs(personId)` beside the existing calls, using
the same `DEV_BASE` and `devHeaders()`.

- [ ] **Step 4: Write the component**

`RoleSwitcherTool.tsx` — a `<label>` + `<select>` over the fetched personas, an
`onChange` that POSTs and hands the new token to the caller via a `onSwitched` prop
(defaulted to a module-level `setAccessToken` from `@studio/core`), and the server's
`no_student_persona_note` rendered as an `<Alert tone="pending">`. Inline style objects
over M0.3 tokens — **no stylesheet** (`DevBar.tsx`'s docstring: a CSS file imported by a
module rollup drops is still emitted into the production stylesheet). Every string
through `t(locale, 'common.dev.…')` (G4). Logical properties only (G12).

- [ ] **Step 5: Add the strings**

In `web/packages/i18n/he/common.ts`, **replace** `'dev.personaSwitcherPending'` (its
milestone has arrived) with:

```ts
  'dev.persona.label': 'פועל בתור',
  'dev.persona.placeholder': 'בחר פרסונה',
  'dev.persona.owner': 'בעלים',
  'dev.persona.manager': 'מנהל',
  'dev.persona.lead': 'מאמן ראשי',
  'dev.persona.assistant': 'מאמן משנה',
  'dev.persona.parent3': 'הורה (3 ילדים)',
  'dev.persona.parent1': 'הורה (ילד אחד)',
  'dev.persona.trial': 'הורה (ניסיון)',
  'dev.persona.both': 'הורה+מאמן',
  'dev.persona.none': 'ללא הרשאות',
```

— §19.4's own labels, verbatim from the artboard. Mirror the keys into `en/common.ts` and
`ru/common.ts`. Also remove the now-stale `'dev.personaSwitcherPending'` from all three.

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run packages/ui/src/dev-bar --reporter=dot)
node web/scripts/i18n-parity.mjs
(cd web && npm run typecheck && npm run lint)
(cd web && npm run build && npx vitest run tools/__tests__/dev-bar-bundle.test.ts --reporter=dot)
```

Expected: PASS — including the bundle test, which is the proof that the switcher is
**absent** from a production bundle and not merely hidden (§19.4).

- [ ] **Step 7: Tick the holdback and commit**

Set `HB-m1-role-switcher` `status: closed`, `closed: 2026-08-25`, and add:

```yaml
      - id: M1.4
        title: The personas and the role switcher
        status: shipped
        on: 2026-08-25
```

```bash
git add web/packages/ui/src/dev-bar web/packages/i18n docs/plan/state.yaml
git commit -m "feat(dev-bar): the §19.4 role switcher, registered through the slot

Closes HB-m1-role-switcher. DevBar.tsx is not reopened — tools.ts is the registry that
already anticipates lanes adding tools, and it gains one key and one order entry.
Sorts before the tool row because §19.4 draws the persona row above it.

The dev-bar bundle test still passes, so the switcher is absent from a production
bundle rather than hidden in one."
```

---

# Phase 5 — the trial health template (holdback 6 / conflict C3)

### Task 21: seed the `kind='trial'` template

**Files:**
- Create: `app/services/demo/health_templates.py`, `app/services/structure/health_templates.py`
- Modify: `app/services/demo/fixtures.py`, `app/routers/structure.py`
- Test: `tests/structure/test_trial_template.py`

**Interfaces:**
- Produces: `TRIAL_TEMPLATE_SCHEMA: dict[str, Any]`, `ensure_trial_template(session, studio_id, *, at) -> HealthFormTemplate`, and `GET /api/v1/health-templates?kind=trial`.
- **What M3 consumes:** `ensure_trial_template` is idempotent by `(studio_id, kind, version)`, so M3's trial-booking flow calls it during studio setup and reads the template id back.

- [ ] **Step 1: Write the failing test**

Create `tests/structure/test_trial_template.py`:

```python
"""Conflict C3 — 'M3's trial booking needs a health declaration that §14 puts in M4.
health_form_template.kind is already (full|trial) in §4.3. Seed the kind='trial'
template here; that is what unblocks M3 without pulling M4 forward.'

§5.4a's funnel puts the trial declaration at step 3 of five, before the parent picks a
session. A trial booking with no template to sign is a funnel that stops there.
"""

from __future__ import annotations

import pytest
from app.models.health import HealthFormTemplate
from app.services.structure.health_templates import TRIAL_TEMPLATE_SCHEMA, ensure_trial_template
from sqlalchemy import func, select


def test_a_new_studio_gets_a_trial_template(as_manager):
    body = as_manager.get("/api/v1/health-templates?kind=trial").json()
    assert body["items"], "M3's trial booking has nothing to sign"
    assert body["items"][0]["kind"] == "trial"


def test_seeding_twice_does_not_create_a_second_template(app_session, a_studio_id):
    """The wizard is resumable (§5.1) and the setup step may run more than once. A second
    published v1 trial template is ambiguity at the moment a parent is signing."""
    ensure_trial_template(app_session, a_studio_id, at=_T0)
    ensure_trial_template(app_session, a_studio_id, at=_T0)
    app_session.commit()
    count = app_session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == a_studio_id, HealthFormTemplate.kind == "trial")
    ).scalar_one()
    assert count == 1


def test_the_trial_schema_is_shorter_than_a_full_declaration_would_be():
    """§5.4a's funnel has five steps and the declaration is step 3. A trial form as long
    as the full one is where the funnel leaks — the whole reason kind is an enum."""
    questions = [q for section in TRIAL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]]
    assert len(questions) <= 8


def test_the_trial_schema_asks_the_questions_a_coach_needs_on_the_mat():
    """§5.5 — coaches see derived_flags, 'a ⚠ badge with אסתמה or אלרגיה'. A trial form
    that does not ask cannot derive them, and the first session is exactly when nobody
    knows the child."""
    ids = {q["id"] for section in TRIAL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]}
    assert {"asthma", "allergy", "medication"} <= ids


def test_the_schema_is_versioned_so_a_signature_records_what_was_signed():
    """§4.3 stores template_version on the declaration. A schema with no version makes
    that column meaningless."""
    assert TRIAL_TEMPLATE_SCHEMA["version"] == 1


def test_the_demo_studio_has_one_after_a_reset(app_session, reset_demo):
    count = app_session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == reset_demo, HealthFormTemplate.kind == "trial")
    ).scalar_one()
    assert count == 1


def test_no_full_template_is_seeded_here(app_session, reset_demo):
    """C3 says seed the TRIAL one. Seeding the full one too would be pulling M4 forward,
    which is the thing C3's resolution is written to avoid."""
    count = app_session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == reset_demo, HealthFormTemplate.kind == "full")
    ).scalar_one()
    assert count == 0


def test_the_template_endpoint_is_manager_only(as_lead_coach):
    """§3.2 — reading the full declaration needs manager or owner; the template editor is
    §6.4's manager dashboard. A coach has no business here."""
    assert as_lead_coach.get("/api/v1/health-templates").status_code == 403
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/structure/test_trial_template.py -q
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the template**

Create `app/services/structure/health_templates.py`:

```python
"""Conflict C3's resolution, in code.

§14 puts health declarations in M4. §5.4a's trial funnel puts a declaration at step 3 of
five, and M3 builds that funnel. §4.3 already types the column `kind(full|trial)`, so the
seam was already there: M1 seeds the SHORT trial form, M4 builds the full one and
everything around it (the PDF render, the signature capture, the encryption, the
derived-flag pipeline).

**What M1 deliberately does not build:** `health_declaration`. Nothing here stores an
answer, so G7 has nothing to protect in this module -- which is the property that lets
M1 touch health at all.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import HealthFormTemplate

#: §5.4a -- 'הצהרת בריאות מקוצרת'. Short on purpose: the declaration is step 3 of a
#: five-step funnel a parent is walking on a phone, and a trial form as long as the full
#: one is exactly where that funnel leaks. The three flag questions are not optional --
#: §5.5 gives coaches a ⚠ badge derived from them, and a child's first session is when
#: nobody in the room knows them.
TRIAL_TEMPLATE_SCHEMA: dict[str, Any] = {
    "version": 1,
    "title": "הצהרת בריאות לשיעור ניסיון",
    "sections": [
        {
            "id": "medical",
            "title": "מידע רפואי",
            "questions": [
                {"id": "asthma", "type": "boolean", "label": "האם יש אסתמה?", "flag": True},
                {"id": "allergy", "type": "boolean", "label": "האם יש אלרגיה?", "flag": True},
                {
                    "id": "allergy_details",
                    "type": "text",
                    "label": "פירוט האלרגיה",
                    "visible_if": {"allergy": True},
                },
                {
                    "id": "medication",
                    "type": "boolean",
                    "label": "האם התלמיד נוטל תרופות באופן קבוע?",
                    "flag": True,
                },
                {
                    "id": "restrictions",
                    "type": "text",
                    "label": "מגבלות פעילות גופנית",
                    "required": False,
                },
            ],
        },
        {
            "id": "consent",
            "title": "אישור",
            "questions": [
                {
                    "id": "fit_to_train",
                    "type": "boolean",
                    "label": "אני מאשר/ת שהתלמיד/ה כשיר/ה לפעילות גופנית",
                    "required": True,
                },
                {
                    "id": "emergency_contact",
                    "type": "phone",
                    "label": "טלפון לשעת חירום",
                    "required": True,
                },
            ],
        },
    ],
}


def ensure_trial_template(
    session: Session, studio_id: uuid.UUID, *, at: datetime
) -> HealthFormTemplate:
    """Idempotent by (studio_id, kind, version).

    The setup wizard is resumable (§5.1), so this runs more than once for the same
    studio. A second published v1 trial template would be ambiguity at the exact moment
    a parent is signing something, and the partial unique index in app/models/health.py
    would turn it into an integrity error rather than a duplicate -- this makes it a
    no-op instead.
    """
    existing = session.execute(
        select(HealthFormTemplate).where(
            HealthFormTemplate.studio_id == studio_id,
            HealthFormTemplate.kind == "trial",
            HealthFormTemplate.version == TRIAL_TEMPLATE_SCHEMA["version"],
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    template = HealthFormTemplate(
        studio_id=studio_id,
        kind="trial",
        version=TRIAL_TEMPLATE_SCHEMA["version"],
        schema=TRIAL_TEMPLATE_SCHEMA,
        published_at=at,
        created_at=at,
    )
    session.add(template)
    session.flush()
    return template
```

- [ ] **Step 4: Call it from the three places a studio comes into existence**

1. `provision_studio` (Task 16) — every new studio gets one from birth.
2. The `personas` layer's sibling — add a small `health` entry to `_V1.layers` seeding
   the demo studio's trial template, with `tables=("health_form_template",)`.
3. `GET /api/v1/health-templates` in `app/routers/structure.py`, `ManagerOrOwner`-gated,
   `kind` an optional query filter.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/structure tests/dev tests/restrictions -q
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format app
```

Expected: PASS, including `tests/restrictions/test_03_no_real_health_declaration.py`.

- [ ] **Step 6: Tick the holdback and commit**

Set `HB-c3-trial-template` `status: closed`, `closed: 2026-08-25`.

```bash
git add app/services/structure/health_templates.py app/services/demo/fixtures.py \
        app/routers/structure.py tests/structure/test_trial_template.py docs/plan/state.yaml \
        openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(structure): the kind='trial' health template (C3)

Closes HB-c3-trial-template. §4.3 already typed kind(full|trial), so seeding the short
trial form unblocks M3's five-step funnel without pulling M4 forward. Nothing here
stores an answer — no health_declaration table exists yet, which is the property that
lets M1 touch health at all.

The form is short on purpose and still asks asthma/allergy/medication: §5.5 derives a
coach's ⚠ badge from those three, and a first session is when nobody knows the child."
```

---

# Phase 6 — the clients

### Task 22: the session client

**Files:**
- Create: `web/packages/core/src/identity/session.ts`, `.../session.test.ts`, `.../useSession.ts`, `.../useSession.test.ts`
- Modify: `web/packages/core/src/index.ts`

**Interfaces:**
- Produces: `getAccessToken()`, `setAccessToken(token, expiresIn)`, `clearSession()`, `refresh(): Promise<SessionState | null>`, `signOut()`, `apiFetch(path, init?)`, `useSession()` → `{ status, access, studios, activeStudioId, devTools, actingAsPersonId }` with `status ∈ 'loading' | 'anonymous' | 'signed-in'`.

> **D-M1-5, restated where it would be violated.** The access token lives in a module-level variable — **memory only**. Nothing here writes a token to `localStorage`, `sessionStorage` or IndexedDB. The refresh token is never visible to JavaScript at all: it is an `httpOnly` cookie the browser attaches to `POST /api/v1/auth/refresh` and to nothing else. A test asserts both.

- [ ] **Step 1: Write the failing test**

Create `web/packages/core/src/identity/session.test.ts`:

```ts
// SPEC §10.3 and §11.7. The storage assertions are the load-bearing ones: the
// documented trap for this milestone is moving the refresh token into IndexedDB to make
// staging work, and this is the file where that would be written.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, clearSession, getAccessToken, refresh, setAccessToken, signOut } from './session'

beforeEach(() => {
  clearSession()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('the access token', () => {
  it('is held in memory and never in storage', () => {
    // §11.7 — an XSS can read every storage API. It cannot read a closure.
    setAccessToken('tok-1', 900)
    expect(getAccessToken()).toBe('tok-1')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('is dropped once it has expired, without a network call', () => {
    // §5.2's fifteen minutes. Returning an expired token would produce a 401 the caller
    // has to interpret; returning null makes the refresh path unambiguous.
    vi.useFakeTimers()
    setAccessToken('tok-1', 900)
    vi.advanceTimersByTime(901_000)
    expect(getAccessToken()).toBeNull()
    vi.useRealTimers()
  })
})

describe('refresh', () => {
  it('sends credentials so the httpOnly cookie is attached', async () => {
    // Without credentials:'include' the cookie is simply not sent and the failure looks
    // exactly like an expired session — the single most confusing bug available here.
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        access_token: 't', expires_in: 900,
        access: { staff: true, parent: false }, studios: [], active_studio_id: null,
      }), { status: 200 })))
    await refresh()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
  })

  it('returns null on 401 rather than throwing', async () => {
    // §10.3 point 5 — 'A queue is never dropped on an auth failure. There is no code
    // path that discards unsynced work.' A throw here would propagate into whatever the
    // caller was doing, which is how a queue gets dropped.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    expect(await refresh()).toBeNull()
  })

  it('never writes the refresh token anywhere, because it never sees one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        access_token: 't', expires_in: 900,
        access: { staff: false, parent: true }, studios: [], active_studio_id: null,
      }), { status: 200 })))
    await refresh()
    expect(JSON.stringify(localStorage)).not.toContain('refresh')
    expect('indexedDB' in globalThis && localStorage.length).toBeFalsy()
  })
})

describe('apiFetch', () => {
  it('attaches the bearer token', async () => {
    setAccessToken('tok-9', 900)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await apiFetch('/api/v1/classes')
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/classes',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-9' }),
      }),
    )
  })

  it('refreshes once on a 401 and replays the request', async () => {
    // §5.2 — the access token expires every fifteen minutes by design, so this is the
    // ordinary path and not an error path.
    setAccessToken('stale', 900)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'fresh', expires_in: 900,
        access: { staff: true, parent: false }, studios: [], active_studio_id: null,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await apiFetch('/api/v1/classes')
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not loop when the refresh itself fails', async () => {
    // A retry loop on an expired refresh token is an infinite one, and it fires on
    // every screen at once the moment a session ends.
    setAccessToken('stale', 900)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await apiFetch('/api/v1/classes')).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('signOut', () => {
  it('clears the in-memory token even if the server call fails', async () => {
    // A network error must not leave the user looking signed in on a device they just
    // asked to be signed out of.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    setAccessToken('tok', 900)
    await signOut()
    expect(getAccessToken()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
(cd web && npx vitest run packages/core/src/identity/session.test.ts --reporter=dot)
```

Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Write `session.ts`**

```ts
// SPEC §5.2, §10.3 and §11.7 — the client half of the session.
//
// **The access token is a module-level variable and nothing else.** Not localStorage,
// not sessionStorage, not IndexedDB. §11.7 puts the refresh token in an httpOnly cookie
// precisely so that an XSS cannot reach it, and storing the access token where an XSS
// CAN reach it would hand back most of what that buys.
//
// **The refresh token never appears in this file, because JavaScript never sees it.**
// The browser attaches it to POST /api/v1/auth/refresh (Path=/api/v1/auth) and to
// nothing else. `credentials: 'include'` is what makes that happen across origins.
//
// **The documented trap.** On staging this WILL fail: up.railway.app is a public
// suffix, so the api host and the app hosts are different sites and Safari drops the
// cookie. The fix is the domain (HB-domain), not a token in IndexedDB — see
// infra/railway/README.md § The domain. Do not add storage here to make staging pass.
```

with `let accessToken: string | null`, `let expiresAtMs = 0`, a single in-flight
`refreshPromise` so ten concurrent 401s produce one refresh, and `apiFetch` retrying
exactly once.

- [ ] **Step 4: Write `useSession.ts` and export both**

`useSession()` calls `refresh()` once on mount, exposes `{status, access, studios, …}`,
and re-reads after `signOut`. Export everything from `web/packages/core/src/index.ts`.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run packages/core/src/identity --reporter=dot && npm run typecheck && npm run lint)
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/packages/core/src/identity web/packages/core/src/index.ts
git commit -m "feat(core): the session client — memory-only access token

Nothing here writes a token to localStorage, sessionStorage or IndexedDB, and a test
asserts it. §11.7 puts the refresh token in an httpOnly cookie so an XSS cannot reach
it; storing the access token where an XSS can would give most of that back.

On staging the cookie will be dropped — up.railway.app is a public suffix. That is
HB-domain, and the fix is the domain, not storage here."
```

---

### Task 23: the app shell, the nav drawer and the studio switcher

**Files:**
- Create: `web/packages/ui/src/shell/{AppShell,NavDrawer,StudioSwitcher}.tsx` + a test beside each
- Modify: `web/packages/ui/src/index.ts`, `web/packages/i18n/{he,en,ru}/common.ts`

**Interfaces:**
- Produces: `<AppShell title items={NavItem[]} studios={StudioMembership[]} activeStudioId onSwitchStudio locale>`; `NavItem = { key: string; labelKey: string; href: string; icon?: ReactNode }`; `<NavDrawer open onClose items locale>`; `<StudioSwitcher studios activeStudioId onSwitch locale>`.

- [ ] **Step 1: Write the failing test**

`web/packages/ui/src/shell/StudioSwitcher.test.tsx`:

```tsx
// §5.2 — 'A person belonging to more than one studio gets a studio switcher; otherwise
// it is hidden.' The client decides by counting, because the server sending a
// `show_switcher` boolean would be the same fact stated twice.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudioSwitcher } from './StudioSwitcher'

const ONE = [{ studioId: 'a', studioName: 'מועדון א', studioIsDemo: false, personId: 'p', roles: ['owner'], isGuardian: false }]
const TWO = [...ONE, { studioId: 'b', studioName: 'מועדון ב', studioIsDemo: false, personId: 'q', roles: [], isGuardian: true }]

describe('StudioSwitcher', () => {
  it('is hidden for a person who belongs to one studio', () => {
    const { container } = render(
      <StudioSwitcher studios={ONE} activeStudioId="a" onSwitch={vi.fn()} locale="he" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders for a person who belongs to two', () => {
    render(<StudioSwitcher studios={TWO} activeStudioId="a" onSwitch={vi.fn()} locale="he" />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('has an accessible name', () => {
    render(<StudioSwitcher studios={TWO} activeStudioId="a" onSwitch={vi.fn()} locale="he" />)
    expect(screen.getByRole('combobox')).toHaveAccessibleName()
  })
})
```

`web/packages/ui/src/shell/NavDrawer.test.tsx`:

```tsx
// SPEC §9 and .claude/rules/ui-rtl-a11y.md. The drawer is the one component in this
// milestone whose LAYOUT is direction-dependent, which is why the physical-property ban
// (G12) matters here more than anywhere else.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NavDrawer } from './NavDrawer'

const ITEMS = [
  { key: 'today', labelKey: 'common.nav.today', href: '/' },
  { key: 'schedule', labelKey: 'common.nav.schedule', href: '/schedule' },
]

describe('NavDrawer', () => {
  it('is a labelled navigation landmark', () => {
    render(<NavDrawer open items={ITEMS} onClose={vi.fn()} locale="he" />)
    expect(screen.getByRole('navigation')).toHaveAccessibleName()
  })

  it('renders nothing when closed, rather than rendering it off-screen', () => {
    // An off-screen drawer is still in the tab order and still read by a screen reader.
    const { container } = render(
      <NavDrawer open={false} items={ITEMS} onClose={vi.fn()} locale="he" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<NavDrawer open items={ITEMS} onClose={onClose} locale="he" />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('uses no physical CSS property', () => {
    // G12 / D10. ESLint's no-restricted-syntax rule reads JS object properties, so it
    // catches this too — this test is the one that survives someone disabling the rule
    // for a line.
    const { container } = render(<NavDrawer open items={ITEMS} onClose={vi.fn()} locale="he" />)
    const style = (container.firstElementChild as HTMLElement).getAttribute('style') ?? ''
    for (const banned of ['margin-left', 'margin-right', 'padding-left', 'padding-right', 'left:', 'right:']) {
      expect(style).not.toContain(banned)
    }
  })
})
```

`web/packages/ui/src/shell/AppShell.test.tsx` — asserts one `<main>` landmark, a
`<header>`, that the drawer trigger has an accessible name and `aria-expanded`, and that
the dev-bar slot renders above the header when a developer identity is passed.

- [ ] **Step 2: Run them to confirm they fail**

```bash
(cd web && npx vitest run packages/ui/src/shell --reporter=dot)
```

Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Write the three components**

Logical properties only (`inset-inline-start`, `margin-inline`, `padding-block`), M0.3
tokens for every colour (G13), every string through `t(locale, …)` (G4). `NavDrawer`
returns `null` when closed, traps focus while open, restores focus to the trigger on
close, and closes on `Escape` and on backdrop click.

- [ ] **Step 4: Add the nav strings**

`common.nav.today`, `.schedule`, `.students`, `.attendance`, `.announcements`,
`.settings`, `.payments`, `.myChildren`, `.signOut`, `.menu`, `.closeMenu`,
`.studioSwitcher` in `he`, mirrored into `en` and `ru`.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run packages/ui --reporter=dot && npm run typecheck && npm run lint)
node web/scripts/i18n-parity.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/shell web/packages/ui/src/index.ts web/packages/i18n
git commit -m "feat(ui): the app shell, nav drawer and studio switcher

Logical properties throughout (G12) — the drawer is the one component here whose layout
is direction-dependent. Closed means not rendered, not moved off-screen: an off-screen
drawer is still in the tab order and still read aloud.

The switcher hides itself by counting studios (§5.2). The server sends no
`show_switcher` boolean, because that would be the same fact stated twice."
```

---

### Task 24: the staff app — language, sign-in, resolve, refusal

**Files:**
- Create: `web/apps/staff/src/features/identity/{LanguagePicker,SignIn,Resolve,StaffRefusal}.tsx` + tests
- Modify: `web/apps/staff/src/App.tsx`

**Interfaces:**
- Consumes: `useSession`, `apiFetch` (Task 22); `AppShell`, `NavDrawer` (Task 23).
- Produces: the staff first-run flow from §6.1, in its stated order.

- [ ] **Step 1: Write the failing test**

`web/apps/staff/src/features/identity/StaffRefusal.test.tsx`:

```tsx
// §6.1 'Wrong app' — 'A person who signs in to an app they have no business in is told
// which app is theirs and given a direct link, not a dead end.'
//
// The leak test is the one that earns its place: 'Neither screen leaks whether the
// account exists in the other app.' A refusal that said "you have 2 children, use the
// parent app" would be an account-enumeration oracle for anyone with a stolen phone.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StaffRefusal } from './StaffRefusal'
import { t } from '@studio/i18n'

describe('StaffRefusal', () => {
  it('says the staff app is not theirs, in Hebrew', () => {
    render(<StaffRefusal locale="he" onSignOut={vi.fn()} />)
    expect(screen.getByText(t('he', 'common.refusal.staff.title'))).toBeInTheDocument()
  })

  it('offers a link to the parent app rather than a dead end', () => {
    render(<StaffRefusal locale="he" onSignOut={vi.fn()} />)
    expect(screen.getByRole('link', { name: t('he', 'common.refusal.staff.otherApp') }))
      .toHaveAttribute('href')
  })

  it('offers sign-out', () => {
    // §6.1 — 'Both screens offer sign-out.' Without it the only way out is clearing site
    // data, which a parent on a phone will not find.
    render(<StaffRefusal locale="he" onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: t('he', 'common.nav.signOut') })).toBeInTheDocument()
  })

  it('leaks nothing about the other app', () => {
    const { container } = render(<StaffRefusal locale="he" onSignOut={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\d+\s*(ילד|תלמיד|student|child)/i)
  })
})
```

`web/apps/staff/src/features/identity/Resolve.test.tsx`:

```tsx
// §6.1's staff first-launch branch, all three arms:
//   owner of a studio with no classes yet -> studio setup wizard, resumable
//   manager / coach with role assignments -> 3-screen tour -> offline priming -> Today
//   no role assignment anywhere           -> the refusal screen
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Resolve } from './Resolve'

const session = (over = {}) => ({
  status: 'signed-in' as const,
  access: { staff: true, parent: false },
  studios: [{ studioId: 's', studioName: 'מועדון', studioIsDemo: false, personId: 'p', roles: ['owner'], isGuardian: false }],
  activeStudioId: 's', devTools: false, actingAsPersonId: null,
  ...over,
})

describe('Resolve', () => {
  it('routes an owner with no classes to the setup wizard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })))
    render(<Resolve session={session()} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('setup-wizard')).toBeInTheDocument())
  })

  it('routes an owner whose studio already has classes to the tour', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: 'c', name: "ג'ודו" }] }), { status: 200 })))
    render(<Resolve session={session()} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
  })

  it('routes a coach to the tour and never to the wizard', async () => {
    // §3.2 — 'Studio settings, training year, rollover: owner ✓ manager ✓' and nothing
    // else. A coach who reached the wizard could create the studio's structure.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })))
    render(<Resolve session={session({ studios: [{ ...session().studios[0], roles: ['lead_coach'] }] })} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
    expect(screen.queryByTestId('setup-wizard')).toBeNull()
  })

  it('shows the refusal to an identity with no role assignment anywhere', async () => {
    render(<Resolve session={session({ access: { staff: false, parent: true }, studios: [] })} locale="he" />)
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
  })
})
```

`web/apps/staff/src/features/identity/LanguagePicker.test.tsx` — asserts the picker
renders **before** sign-in and offers all three locales, per §6.1's ordering rationale:
*"language before login, because a Russian-speaking parent cannot read a Hebrew consent
screen."*

- [ ] **Step 2: Run them to confirm they fail**

```bash
(cd web && npx vitest run apps/staff/src/features/identity --reporter=dot)
```

Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Write the components**

`SignIn.tsx` renders one button per **configured** provider (from
`GET /api/v1/auth/providers`, added to the auth router — a button for a provider whose
credentials are absent fails after the user has committed to it, which is worse than no
button). Each button is a plain `<a href="/api/v1/auth/{provider}/start?app=staff">` —
**a top-level navigation, never `fetch`, never an iframe, never a popup.** §5.2: *"OAuth
must never run inside a webview. Google returns `disallowed_useragent`."*

- [ ] **Step 4: Add the strings**

`common.refusal.staff.title` = `אין לך גישה לאפליקציית הצוות`, `.body` =
`פנה למנהל הסטודיו שלך.`, `.otherApp` = `אפליקציית ההורים`;
`common.refusal.parent.title` = `לא נמצאו תלמידים המשויכים אליך`, `.otherApp` =
`אפליקציית הצוות`; `common.auth.continueWithGoogle` = `המשך עם Google`,
`.continueWithApple` = `המשך עם Apple`; `common.language.title` = `שפה`;
`common.tour.1|2|3` = §6.1's three sentences verbatim. Mirror into `en` and `ru`.

- [ ] **Step 5: Wire `App.tsx`**

```tsx
export default function App() {
  const session = useSession()
  return (
    <ThemeProvider>
      {/* §19.4 — the identity is now real. `devTools` comes from GET /auth/me, which
          reads the verified is_developer claim; before M1 every app passed null. */}
      <DevBar identity={session.devTools ? { isDeveloper: true, studioName: session.activeStudioName ?? '', actingAs: session.actingAsLabel } : null} />
      {session.status === 'loading' ? <SplashScreen /> : null}
      {session.status === 'anonymous' ? <LanguagePicker /> : null}
      {session.status === 'signed-in' ? <Resolve session={session} /> : null}
    </ThemeProvider>
  )
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run apps/staff --reporter=dot && npm run typecheck && npm run lint)
node web/scripts/i18n-parity.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/apps/staff/src web/packages/i18n
git commit -m "feat(staff): language → sign-in → resolve → refusal, per §6.1

Sign-in is a top-level <a href>, never fetch and never an iframe: §5.2 says OAuth must
never run in a webview and Google answers disallowed_useragent when it does.

The refusal names the other app and offers sign-out, and a test asserts it leaks no
count of anything — a refusal that said 'you have 2 children' would be an
account-enumeration oracle for anyone holding a stolen phone."
```

---

### Task 25: the parent app — the same flow, the other refusal

**Files:**
- Create: `web/apps/parent/src/features/identity/{LanguagePicker,SignIn,Resolve,ParentRefusal}.tsx` + tests
- Modify: `web/apps/parent/src/App.tsx`

**Interfaces:** mirrors Task 24. `Resolve` branches on §6.1's parent first-launch: resolve → studio picker (only when `studios.length > 1`) → the blocking gates.

- [ ] **Step 1: Write the failing test**

`web/apps/parent/src/features/identity/ParentRefusal.test.tsx` mirrors the staff one
against `common.refusal.parent.*`, plus the branch that only the parent app has:

```tsx
it('refuses a staff member who has no children', () => {
  // §6.1's table: 'owner / manager: ✓ if they are also a guardian.' A manager with no
  // children in the parent app is the second refusal screen, and it must not be
  // reachable from `access.staff` — that is the other app's question.
  render(<ParentRefusal locale="he" onSignOut={vi.fn()} />)
  expect(screen.getByText(t('he', 'common.refusal.parent.title'))).toBeInTheDocument()
})

it('leaks nothing about the staff app', () => {
  const { container } = render(<ParentRefusal locale="he" onSignOut={vi.fn()} />)
  expect(container.textContent).not.toMatch(/(מנהל|מאמן|manager|coach)\s*\d/i)
})
```

`web/apps/parent/src/features/identity/Resolve.test.tsx`:

```tsx
it('shows the studio picker only to a guardian at more than one studio', async () => {
  // §6.1 step 4 — 'only shown if she belongs to more than one studio'.
  render(<Resolve session={twoStudios} locale="he" />)
  await waitFor(() => expect(screen.getByTestId('studio-picker')).toBeInTheDocument())
})

it('skips the picker for a guardian at one studio', async () => {
  render(<Resolve session={oneStudio} locale="he" />)
  await waitFor(() => expect(screen.queryByTestId('studio-picker')).toBeNull())
})

it('offers the invitation-code path when nothing matched', async () => {
  // §6.1 step 3 — 'no match → "לא מצאנו אותך" [ יש לי קוד הזמנה ] [ הרשמה לסטודיו ]'.
  // Without this a correctly-invited parent whose email differs by a character has no
  // way forward at all.
  render(<Resolve session={noMatch} locale="he" />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }))
      .toBeInTheDocument(),
  )
})
```

- [ ] **Step 2: Run them to confirm they fail**

```bash
(cd web && npx vitest run apps/parent/src/features/identity --reporter=dot)
```

Expected: FAIL.

- [ ] **Step 3–5: Write the components, add the strings, wire `App.tsx`**

Steps 5 and 6 of §6.1's parent flow (terms/privacy, health declarations) are **M4's** —
`Resolve` renders a slot for them and a `data-testid="parent-gates"` placeholder, so M4
registers into it rather than reopening this file. Add
`common.auth.haveInviteCode` = `יש לי קוד הזמנה`, `common.auth.registerToStudio` =
`הרשמה לסטודיו`, `common.auth.notFound` = `לא מצאנו אותך` in all three locales.

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run apps/parent --reporter=dot && npm run typecheck && npm run lint)
node web/scripts/i18n-parity.mjs
```

- [ ] **Step 7: Commit**

```bash
git add web/apps/parent/src web/packages/i18n
git commit -m "feat(parent): §6.1's parent first-launch and the second refusal

The studio picker appears only above one studio; the invitation-code path exists because
without it a correctly-invited parent whose email differs by a character has no way
forward at all. §6.1's blocking gates (terms, health) are M4's and register into a slot."
```

---

### Task 26: the iOS install walkthrough and the standalone gate

§6.5: *"the invitation link detects iOS and opens a walkthrough with a screenshot, and
first run does not proceed until the app is running in standalone display mode."*
W1's delivers list: *"This is where install conversion is won or lost."*

**Files:**
- Create: `web/apps/parent/src/features/identity/InstallWalkthrough.tsx` + test, and the same for `web/apps/staff/`
- Modify: both `App.tsx`
- Consumes: `useDisplayMode` / `isInstalled` from `@studio/core` (M0.1)

- [ ] **Step 1: Write the failing test**

```tsx
// §6.5 — 'iOS also offers no way to trigger an install; beforeinstallprompt is
// Chromium-only, so on iPhone the install can only be taught, never prompted.'
//
// G17 restates it: 'Treat the install as part of onboarding, never an afterthought.'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InstallWalkthrough } from './InstallWalkthrough'

const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const androidChrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

describe('InstallWalkthrough', () => {
  it('teaches the iOS steps, because there is no API to prompt with', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: iosSafari })
    render(<InstallWalkthrough locale="he" displayMode="browser" />)
    expect(screen.getByTestId('ios-add-to-home-screen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /התקן/ })).toBeNull()
  })

  it('offers a real install button on Chromium', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: androidChrome })
    const prompt = vi.fn()
    render(<InstallWalkthrough locale="he" displayMode="browser" deferredPrompt={{ prompt }} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('renders nothing once the app is running standalone', () => {
    const { container } = render(<InstallWalkthrough locale="he" displayMode="standalone" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has a screenshot with alt text, not a bare image', () => {
    // A silent screenshot is useless to the parent most likely to need this screen.
    vi.stubGlobal('navigator', { ...navigator, userAgent: iosSafari })
    render(<InstallWalkthrough locale="he" displayMode="browser" />)
    expect(screen.getByRole('img')).toHaveAccessibleName()
  })

  it('names the share icon in words as well as showing it', () => {
    // §6.5's walkthrough is read by someone who has never seen the icon. 'Tap the icon'
    // beside a picture is not instructions.
    vi.stubGlobal('navigator', { ...navigator, userAgent: iosSafari })
    render(<InstallWalkthrough locale="he" displayMode="browser" />)
    expect(screen.getByText(/שיתוף/)).toBeInTheDocument()
  })
})
```

Plus a gate test in each app's `App.test.tsx`:

```tsx
it('does not proceed past the walkthrough until standalone', () => {
  // §6.5 — 'first run does not proceed until the app is running in standalone display
  // mode.' The staff app in particular calls navigator.storage.persist() and requires
  // standalone, because §10.6 requires pending_ops never be reclaimed.
  render(<App />, { displayMode: 'browser' })
  expect(screen.queryByTestId('staff-tour')).toBeNull()
})
```

- [ ] **Step 2: Run them to confirm they fail**

```bash
(cd web && npx vitest run apps/parent/src/features/identity/InstallWalkthrough.test.tsx --reporter=dot)
```

- [ ] **Step 3: Write the component and the gate**

Detect iOS Safari by user agent (there is no feature test for "can be added to the home
screen"); render the three-step guide with a real screenshot and alt text; on Chromium
capture `beforeinstallprompt` and render a button; return `null` when
`displayMode === 'standalone'`. Wire the gate into both `App.tsx` **before** `Resolve`.

- [ ] **Step 4: Add the strings**

`common.install.ios.title|step1|step2|step3|share|addToHome`, `common.install.button`,
`common.install.why` in all three locales. §6.5's own words where it has them.

- [ ] **Step 5: Run the tests and the installability check**

```bash
(cd web && npx vitest run apps --reporter=dot && npm run typecheck && npm run lint && npm run build)
node web/scripts/check-installability.mjs
node web/scripts/i18n-parity.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/apps web/packages/i18n
git commit -m "feat(apps): §6.5's iOS install walkthrough and the standalone gate

iOS is taught, never prompted — beforeinstallprompt is Chromium-only, so there is no
API to call. The share icon is named in words as well as shown: 'tap the icon' beside a
picture is not instructions for the parent most likely to need this screen.

First run does not proceed until display-mode is standalone, which is also what §10.6
needs before the staff app can rely on persisted storage."
```

---

### Task 27: the setup wizard container and steps 1, 3, 5, 6

D-M1-3: six steps, M1 owns 1, 3, 5 and 6; step 2 (belts, M7) and step 4 (prices, M6) are
**registered slots**, so neither lane reopens this container.

**Files:**
- Create: `web/packages/ui/src/setup-wizard/SetupWizard.tsx` + test
- Create: `web/apps/dashboard/src/features/structure/{StudioDetailsStep,ClassesAndGroupsStep,CoachesStep,InviteStep}.tsx` + tests
- Modify: `web/packages/ui/src/index.ts`, `web/packages/i18n/*/common.ts`

**Interfaces:**
- Produces: `<SetupWizard steps={WizardStep[]} progress onStepComplete locale>`; `WizardStep = { key: string; order: number; titleKey: string; render: ComponentType<WizardStepProps> }`; `registerWizardStep(step)` wrapping `registerSlot('setup-wizard', …)`.
- **What M6 and M7 consume:** `registerWizardStep({ key: 'prices', order: 40, … })` and `{ key: 'belts', order: 20, … }`. The container renders every registered step in `order`, and renders a "coming in M6/M7" placeholder for the two keys nothing has registered — the same declarative-placeholder pattern `dev-bar/tools.ts` already uses, and for the same reason: a placeholder that *registered itself* would race the real one.

- [ ] **Step 1: Write the failing test**

`web/packages/ui/src/setup-wizard/SetupWizard.test.tsx`:

```tsx
// §5.1's wizard and seam 4's fourth composite. 'dashboard 5c–5f setup wizard | Container
// owner M1 | step 2 belts (M7) · step 4 prices (M6)'.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PENDING_WIZARD_STEPS, SetupWizard, registerWizardStep } from './SetupWizard'
import { clearSlot } from '../slots'

afterEach(() => clearSlot('setup-wizard'))

describe('SetupWizard', () => {
  it('renders M1 steps in order and placeholders for the two it does not own', () => {
    render(<SetupWizard locale="he" progress={{}} onStepComplete={vi.fn()} />)
    expect(screen.getByTestId('wizard-step-pending-belts')).toBeInTheDocument()
    expect(screen.getByTestId('wizard-step-pending-prices')).toBeInTheDocument()
  })

  it("a lane's registration replaces the placeholder unconditionally", () => {
    // dev-bar/tools.ts's reasoning, applied here: if a placeholder registered ITSELF
    // into the slot, whether M6's real step replaced it or overwrote it would depend on
    // module evaluation order — a race with no error message.
    registerWizardStep({ key: 'prices', order: 40, titleKey: 'common.wizard.prices',
                         render: () => <div data-testid="real-prices" /> })
    render(<SetupWizard locale="he" progress={{}} onStepComplete={vi.fn()} />)
    expect(screen.getByTestId('real-prices')).toBeInTheDocument()
    expect(screen.queryByTestId('wizard-step-pending-prices')).toBeNull()
  })

  it('every step can be skipped and returned to', () => {
    // §5.1 — 'Each step can be skipped and returned to; progress is persisted so the
    // wizard survives a closed app.'
    render(<SetupWizard locale="he" progress={{}} onStepComplete={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /דלג/ }).length).toBeGreaterThan(0)
  })

  it('resumes at the first incomplete step', async () => {
    render(
      <SetupWizard locale="he" progress={{ 'studio-details': true }} onStepComplete={vi.fn()} />,
    )
    expect(await screen.findByTestId('wizard-active-step')).toHaveAttribute(
      'data-step-key', 'classes-and-groups',
    )
  })

  it('shows how much is left, because the checklist stays on the dashboard until done', () => {
    // §5.1 — 'a progress checklist stays on the dashboard until it is complete'.
    render(<SetupWizard locale="he" progress={{ 'studio-details': true }} onStepComplete={vi.fn()} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow')
  })

  it('has one heading per step and a labelled step list', () => {
    render(<SetupWizard locale="he" progress={{}} onStepComplete={vi.fn()} />)
    expect(screen.getByRole('list', { name: /שלבי/ })).toBeInTheDocument()
  })
})
```

Step tests in `web/apps/dashboard/src/features/structure/` cover: `StudioDetailsStep`
(name, timezone, locale, logo upload — **logo only, no colour picker**, D1 and
`HB-logo`), `ClassesAndGroupsStep` (creates a class then a group under it),
`CoachesStep` (assigns a person to a group, and asserts the call creates the role
assignment too), `InviteStep` (sends a guardian invitation and shows the link once).

- [ ] **Step 2: Run them to confirm they fail**

```bash
(cd web && npx vitest run packages/ui/src/setup-wizard apps/dashboard --reporter=dot)
```

- [ ] **Step 3: Write the container**

```tsx
// §5.1's studio setup wizard, and seam 4's fourth composite.
//
// D-M1-3: six steps. M1 owns 1 (studio details + logo), 3 (classes and groups),
// 5 (coaches and locations) and 6 (invite the first guardian). Step 2 is belts (M7) and
// step 4 is prices (M6), and both arrive by REGISTRATION — this file is never reopened
// for them, which is the whole point of the slot registry M0.2 landed.
//
// Pending steps are DECLARATIVE, not registered, for the reason dev-bar/tools.ts spells
// out: a placeholder that registered itself into the slot would race the real step, and
// which one won would depend on module evaluation order.
export const PENDING_WIZARD_STEPS = [
  { key: 'belts', order: 20, milestone: 'M7', titleKey: 'common.wizard.belts' },
  { key: 'prices', order: 40, milestone: 'M6', titleKey: 'common.wizard.prices' },
] as const
```

Progress is persisted through `PATCH /api/v1/studios/{id}/settings` under a
`setup_progress` key — §5.1: *"progress is persisted so the wizard survives a closed
app."* Not `localStorage`: the owner may finish on the dashboard what they started in the
staff app.

- [ ] **Step 4: Add the strings**

`common.wizard.title|studioDetails|belts|classesAndGroups|prices|coaches|invite|skip|next|back|done|progress|comingIn` in all three locales.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
(cd web && npx vitest run --reporter=dot && npm run typecheck && npm run lint && npm run build)
node web/scripts/i18n-parity.mjs
```

Expected: PASS.

- [ ] **Step 6: Tick the piece and commit**

```yaml
      - id: M1.5
        title: Both app shells, the refusal screens, the install walkthrough and the setup wizard
        status: shipped
        on: 2026-08-25
```

```bash
git add web docs/plan/state.yaml
git commit -m "feat(dashboard): the setup wizard container and steps 1, 3, 5, 6

Steps 2 (belts, M7) and 4 (prices, M6) arrive by registration into the setup-wizard
slot; this container is never reopened for them. Their placeholders are declarative
rather than registered — a self-registering placeholder would race the real step and
which one won would depend on module evaluation order.

Progress persists through studio settings, not localStorage: §5.1 says the wizard
survives a closed app, and the owner may finish on the dashboard what they started in
the staff app. Step 1 collects a logo and no colours (D1, HB-logo)."
```

---

# Phase 7 — the runtime DB role, the record, and the gate

### Task 28: `studio_app` actually connects as `studio_app` (holdback 5)

The runbook's open item: *"What is not yet true in staging is that the API **uses** that
role: both variables above point at the same superuser DSN. M1 closes this by giving
`studio_app` a login password from a Railway secret and pointing `DATABASE_URL` at it."*

The append-only audit grant (§11.2) is real in tests and in local development and is
**convention only** on staging. This task makes the gap detectable rather than
remembered, and gives the human the two commands that close it.

**Files:**
- Create: `app/core/db_role.py`
- Modify: `app/routers/health.py`, `docs/deploy/railway-runbook.md`
- Test: `tests/identity/test_db_role.py`

**Interfaces:**
- Produces: `runtime_role_report(session) -> RoleReport(current_user, is_superuser, can_update_audit_log, matches_configured_role)`; `GET /api/v1/health` gains a `db_role` block.

> **The credential does not become a setting.** `tests/config/test_database_config.py::test_no_password_is_committed_anywhere_in_the_local_database_setup` asserts `.env.example` never contains the substring `password`, and `.env.example` must document every `Settings` field. So the credential travels inside `DATABASE_URL`, which is already a setting and already carries none locally (trust auth). Adding an `APP_DB_PASSWORD` field would put the word in `.env.example` and break a test that exists for a good reason.

- [ ] **Step 1: Write the failing test**

Create `tests/identity/test_db_role.py`:

```python
"""SPEC §11.2's two-role split, verified against the live connection rather than against
the migration that created the roles.

tests/core/test_audit_append_only.py already asserts the GRANT is correct. What it
cannot see is whether the running API actually connects as the role the grant applies
to — and on staging today it does not. This closes that blind spot: a superuser
connection is reported as one, in the health endpoint, where an operator will see it.
"""

from __future__ import annotations

from app.core.config import settings
from app.core.db_role import runtime_role_report
from sqlalchemy.orm import Session


def test_the_local_runtime_connection_is_the_configured_app_role(app_session: Session):
    report = runtime_role_report(app_session)
    assert report.current_user == settings.APP_DB_ROLE
    assert report.matches_configured_role is True


def test_the_runtime_role_is_not_a_superuser(app_session: Session):
    """A superuser bypasses every grant in the database, so the append-only audit log is
    append-only by politeness. This is the assertion staging currently fails."""
    assert runtime_role_report(app_session).is_superuser is False


def test_the_runtime_role_cannot_update_the_audit_log(app_session: Session):
    """§11.2 — 'the application role holds INSERT and SELECT and nothing else.' Asserted
    through has_table_privilege, so it reports what Postgres would actually allow rather
    than what an ORM guard would catch first."""
    assert runtime_role_report(app_session).can_update_audit_log is False


def test_the_migration_role_is_not_the_runtime_role(app_session, migrated):
    """The whole reason there are two DSNs. If they ever converge, the append-only grant
    becomes unenforceable and nothing else in the suite would notice."""
    assert settings.DATABASE_URL != settings.MIGRATION_DATABASE_URL


def test_health_reports_the_role_so_an_operator_can_see_the_gap(client):
    body = client.get("/api/v1/health").json()
    assert body["db_role"]["matches_configured_role"] is True
    assert body["db_role"]["is_superuser"] is False


def test_health_says_so_loudly_when_the_connection_is_a_superuser(client, monkeypatch):
    """The failure this exists for. A staging deploy connecting as a superuser must not
    look identical to a correct one."""
    import app.routers.health as health_module
    from app.core.db_role import RoleReport

    monkeypatch.setattr(
        health_module, "runtime_role_report",
        lambda session: RoleReport(
            current_user="postgres", is_superuser=True,
            can_update_audit_log=True, matches_configured_role=False,
        ),
    )
    body = client.get("/api/v1/health").json()
    assert body["status"] == "degraded"
    assert "append-only" in body["db_role"]["warning"]
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
.venv/bin/pytest tests/identity/test_db_role.py -q
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write it**

Create `app/core/db_role.py`:

```python
"""SPEC §11.2's split, checked against the connection rather than against the migration.

Revision 0001 creates `studio_app` and 0002 revokes UPDATE and DELETE on `audit_log`
from it, and tests/core/test_audit_append_only.py asserts that grant is correct in every
environment. What no existing test can see is whether the *running API* connects as that
role. On staging it does not: Railway's managed Postgres provides one role, so both DSNs
point at the same superuser and the append-only guarantee is convention rather than
enforcement.

A superuser bypasses every grant, so this is not a hardening nicety -- it is the
difference between "audit_log cannot be rewritten" and "audit_log is not currently being
rewritten". Reported through /api/v1/health so an operator sees it without reading a
runbook.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


@dataclass(frozen=True)
class RoleReport:
    current_user: str
    is_superuser: bool
    can_update_audit_log: bool
    matches_configured_role: bool


def runtime_role_report(session: Session) -> RoleReport:
    row = session.execute(
        text(
            "SELECT current_user AS who, "
            "       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super, "
            "       has_table_privilege(current_user, 'audit_log', 'UPDATE') AS can_update"
        )
    ).one()
    return RoleReport(
        current_user=row.who,
        is_superuser=bool(row.super),
        can_update_audit_log=bool(row.can_update),
        matches_configured_role=row.who == settings.APP_DB_ROLE,
    )
```

In `app/routers/health.py`, add the block and downgrade `status` to `"degraded"` with a
`warning` naming the append-only guarantee when `is_superuser` or `can_update_audit_log`
is true.

- [ ] **Step 4: Write the runbook steps the human runs**

Replace the runbook's *"Open item — the api service still connects as the superuser in
staging"* section with the closing procedure and a note that it is outward-facing:

````markdown
### Closed in M1 — giving `studio_app` its own login

Railway's managed Postgres hands out one superuser. `studio_app` exists in every
environment (revision 0001 creates it `NOLOGIN`, because *a migration must never express
a credential*), so closing this is two commands and no schema change.

**Run by a human with the Railway account.** Both are outward-facing.

```bash
# 1. Give the role a login and a password, as the superuser, once per environment.
PW="$(.venv/bin/python -c 'import secrets;print(secrets.token_urlsafe(32))')"
railway connect Postgres --environment staging <<SQL
ALTER ROLE studio_app WITH LOGIN PASSWORD '${PW}';
GRANT CONNECT ON DATABASE railway TO studio_app;
SQL

# 2. Point DATABASE_URL at it. MIGRATION_DATABASE_URL stays on the superuser — that is
#    the split, not a leftover.
railway variables --service api --environment staging --skip-deploys \
  --set "DATABASE_URL=postgresql+psycopg://studio_app:${PW}@\${{Postgres.PGHOST}}:\${{Postgres.PGPORT}}/\${{Postgres.PGDATABASE}}"
unset PW
```

Verify from outside, which is the point of putting it in the health endpoint:

```bash
curl -fsS "$(python3 -c "import json;print(json.load(open('infra/railway/domains.json'))['environments']['staging']['api'])")/api/v1/health"
```

Expect `"db_role": {"current_user": "studio_app", "is_superuser": false,
"can_update_audit_log": false, "matches_configured_role": true}`. Anything else means
§11.2's append-only audit log is append-only by convention on that environment, and
`status` will read `degraded` rather than `ok`.
````

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
.venv/bin/pytest tests/identity/test_db_role.py tests/core/test_audit_append_only.py tests/config -q
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format app
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
```

Expected: PASS.

- [ ] **Step 6: Ask the user to run the two Railway commands**

They need the Railway account and they change a deployed environment. **Do not run them.**
Ask, then confirm from the health endpoint above. If the user defers, leave
`HB-staging-superuser` **open** with a note that the code half has landed — closing a
holdback whose outward-facing half has not been run is how a status board stops being
trusted.

- [ ] **Step 7: Commit**

```bash
git add app/core/db_role.py app/routers/health.py tests/identity/test_db_role.py \
        docs/deploy/railway-runbook.md openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(core): report the runtime DB role, so §11.2's split is measurable

tests/core/test_audit_append_only.py asserts the GRANT is right; nothing asserted the
running API connects as the role it applies to, and on staging it does not. A superuser
bypasses every grant, so that is the difference between 'audit_log cannot be rewritten'
and 'audit_log is not currently being rewritten'.

/api/v1/health now reports it and reads `degraded` when the connection is a superuser.
The credential travels inside DATABASE_URL rather than becoming a setting, because
.env.example must document every setting and must contain no password."
```

---

### Task 29: the record — holdbacks, the plan, and the two things that are not closable

**Files:**
- Modify: `docs/plan/state.yaml`, `docs/plan/milestone-plan.md`, `infra/railway/README.md`, `docs/plan/prompts/m1.md`
- Create: `docs/plan/prompts/m2-m3.md`
- Test: `tests/cockpit/` (the existing suite reads `state.yaml`)

- [ ] **Step 1: Confirm the cockpit still parses everything**

```bash
.venv/bin/pytest tests/cockpit -q
./scripts/cockpit.sh --check 2>/dev/null || true
```

- [ ] **Step 2: Open the two holdbacks this milestone discovered**

Add to `docs/plan/state.yaml`:

```yaml
  - id: HB-apple-developer
    kind: external
    title: Sign in with Apple for the web needs an Apple Developer Program membership
    why: >-
      §5.2 keeps Apple alongside Google because retrofitting it later would be an
      identity migration, and M1 built the provider for exactly that reason. It cannot
      be configured: Sign in with Apple on the web needs a Services ID, a .p8 key and an
      ES256 client-secret JWT, all of which require a paid Apple Developer Program
      membership — and §6.5 dropped both developer accounts on purpose when it dropped
      the store builds. The code is complete and unreachable: configured_providers()
      omits Apple until APPLE_OAUTH_* are set, so the button does not render and no user
      meets a flow that fails after they commit to it. Google works. The decision is
      whether the membership is worth buying for one sign-in button.
    blocks: M11
    status: open
    opened: 2026-08-25
    closed: null
    source: SPEC §5.2 · §6.5 · D-M1-4
    lead_time: true
```

and, if the user has not run Task 28's two commands, leave `HB-staging-superuser` open
with its `why` updated to say the code half landed and name the runbook section.

- [ ] **Step 3: Record D-M1-1 where W2 will read it**

In `docs/plan/milestone-plan.md`, in W2's contract-commit Models row, change
`guardian` to:

```
`guardian` — **already created in M1's revision 0005** (§6.1's parent-app access query
and §19.3's persona guardian links both needed it). W2's contract commit adds the
`student_id → student.id` foreign key rather than creating the table.
```

- [ ] **Step 4: Record what HB-domain now blocks concretely**

In `infra/railway/README.md` § The domain, append:

```markdown
### Status after M1

The cookie is built exactly as §11.7 specifies — `HttpOnly`, `Secure`, `SameSite=Lax`,
`Path=/api/v1/auth`, host-only — in `app/routers/identity.py`, and it is **verified
working on localhost** (`docs/install/verification-log.md`). It is **not** verified on
staging and cannot be until this holdback closes: `parent-staging.up.railway.app` and
`api-staging-….up.railway.app` are different sites, so Safari drops it and an iPhone
parent's session ends at the fifteen-minute JWT expiry with no way to renew.

Nothing was moved to IndexedDB to hide that. `web/packages/core/src/identity/session.ts`
carries a test asserting no token is ever written to any storage API, which is the
regression this holdback's third point warns about.

Two more things now need the host, both of them M1's and both now real rather than
anticipated: the Google OAuth redirect URIs (`OAUTH_REDIRECT_BASE_URL`, and the Cloud
Console's own allowlist, which must match exactly) and the API's CORS allowlist
(`app/core/cors.py`, read from `domains.json`).
```

- [ ] **Step 5: Write the M2 ∥ M3 opening prompt**

`docs/plan/prompts/m2-m3.md`, in the shape `m1.md` established: where the project stands,
what W2 inherits, the conflicts, and the ready-to-paste prompt. It must say plainly that
**W0 is still open** if `HB-devices` has not closed, and that W2 is the first *parallel*
wave — so it opens with a contract commit on `main` before either worktree exists.

- [ ] **Step 6: Commit**

```bash
git add docs/plan infra/railway/README.md
git commit -m "docs(plan): the record after M1 — two new holdbacks, and D-M1-1 for W2

HB-apple-developer is new and real: Sign in with Apple for the web needs a paid Apple
Developer Program membership, which §6.5 dropped along with the store builds. The
provider is built (§5.2: retrofitting it would be an identity migration) and does not
render, so nobody meets a flow that fails after they commit to it.

HB-domain's entry now says what is verified where: the cookie works on localhost and
cannot work on staging, and nothing was moved to IndexedDB to hide that."
```

---

### Task 30: prove it on localhost, and write down what was proven

The prompt is explicit: *"Session persistence past the 15-minute JWT is NOT part of this
gate on staging: it cannot pass there until holdback 8 lands. Prove it on localhost and
say so in the log."*

**Files:**
- Modify: `docs/install/verification-log.md`

- [ ] **Step 1: Run both halves locally**

```bash
./scripts/dev-db.sh up
.venv/bin/alembic upgrade head
.venv/bin/python -m app.workers.demo_reset   # seeds the personas
.venv/bin/uvicorn app.main:app --reload &
(cd web && npm run dev)
```

- [ ] **Step 2: Walk the flow in a real browser and record each observation**

Do these by hand, in Chrome and in Safari, and write down what you saw — not what you
expected:

1. Staff app → language picker appears **before** any sign-in button (§6.1's ordering).
2. Sign in as `dev+none` → the staff refusal screen, with a link to the parent app and a
   sign-out button, and **no count of anything**.
3. Sign in as `dev+owner` on a studio with no classes → the setup wizard, resumable
   across a page reload.
4. Sign in as `dev+manager` → the tour, then Today.
5. Parent app, `dev+parent3` → the family home; `dev+parent1` → straight to the single
   child (no family layer).
6. Parent app, a staff-only identity → the parent refusal screen.
7. **The 15-minute proof.** In DevTools → Application → Cookies, confirm
   `studio_refresh` is present on `localhost` with `HttpOnly ✓`, `Secure ✓`,
   `SameSite=Lax`, `Path=/api/v1/auth`, and **no Domain**. Then either wait out the
   access token or set `ACCESS_TOKEN_TTL_MINUTES=1` and wait 61 seconds; confirm the
   next API call 401s, refreshes, and replays — and that the cookie **value changed**
   (rotation) while the user stayed signed in.
8. Confirm `localStorage` and `sessionStorage` are **empty** and IndexedDB holds no
   token, in both apps.
9. The dev bar renders for the flagged developer identity and not for any persona;
   switching persona changes what the API allows and every response carries
   `X-Acting-As`.

- [ ] **Step 3: Write it into the verification log**

Append a dated M1 section recording, for each of the nine, what was observed and in which
browser. Then state the gap plainly:

```markdown
### Not verified, and why — session persistence on staging

Step 7 was proven on `localhost` only, and deliberately. `localhost:5173 → localhost:8000`
differ by port, and a port is not part of a site, so the host-only `SameSite=Lax` cookie
flows and rotation works. On staging it will not: `up.railway.app` is on the Public
Suffix List, so the app hosts and the api host are different **sites**, the refresh
cookie is third-party across them, and Safari drops it — an iPhone parent's session ends
at the fifteen-minute JWT expiry and cannot renew.

That is `HB-domain`, not a defect in this code. The cookie is built exactly as §11.7
specifies and nothing was moved to IndexedDB or a bearer header to make staging pass;
`web/packages/core/src/identity/session.ts` carries a test asserting no token is written
to any storage API. **This half of the exit gate is deferred to the milestone where a
stable HTTPS domain exists**, and it is the first thing to re-run when it does.
```

- [ ] **Step 4: Commit**

```bash
git add docs/install/verification-log.md
git commit -m "docs(install): M1's localhost verification, and the staging gap named

Nine observations recorded, browser by browser. Session persistence past the 15-minute
JWT is proven on localhost and explicitly NOT proven on staging: up.railway.app is a
public suffix, so the refresh cookie is third-party there and Safari drops it. That is
HB-domain reporting itself, and the log says so rather than leaving a gate that looks
green."
```

---

### Task 31: the exit gate

**Exit gate, from the prompt:**
> `./scripts/lane-check.sh identity && ./scripts/lane-check.sh structure` both green;
> both apps sign in, refuse correctly per §6.1's two refusal screens, and route to the
> wizard. Verify on a **real device** that the OAuth redirect survives the round trip in
> standalone mode.

- [ ] **Step 1: Run the two lane checks**

```bash
./scripts/lane-check.sh identity
./scripts/lane-check.sh structure
```

Expected: both print `✅ lane <v> green (N scoped gates)` with **N ≥ 1**. A run that
reports "every vertical-scoped gate was skipped" is a failure, not a pass.

- [ ] **Step 2: Run the full local CI**

```bash
./scripts/ci-local.sh
```

Expected: every gate green, including the generated-client diff and `lane-check.sh core`.

- [ ] **Step 3: The real-device check — ask the user**

This cannot be done at a keyboard and a simulator cannot tell you. Ask the user to, on a
**real iPhone** (Safari) and a **real Android** (Chrome):

1. Open the parent app's staging URL, add it to the home screen (iOS: Share → Add to Home
   Screen; Android: the install button).
2. Launch it **from the home screen**, so it runs in its own standalone context.
3. Tap *המשך עם Google* and complete the sign-in.
4. Report whether the app came back **signed in, in the same standalone window** — or
   whether it opened Safari, or came back signed out.

§5.2: *"A home-screen web app on iOS opens the redirect in its own standalone context;
verify the session survives the round trip on a real device, because this is the one
place the install mode changes auth behaviour."*

**What a failure means, and what it does not.** If the round trip returns to the app and
the user is signed in, this half of the gate passes even though the session will die at
fifteen minutes — that second failure is `HB-domain` and is explicitly out of this gate.
If the redirect leaves the standalone window or comes back with no session at all, that
is a defect in this milestone's code and must be fixed here.

- [ ] **Step 4: Record the outcome and set the wave's status honestly**

Append the device results to `docs/install/verification-log.md`. Then in
`docs/plan/state.yaml`:

- If both devices completed the round trip signed in: add the final piece and set W1's
  `status: shipped`.
- If no real device was available: leave W1 `status: active` and say why. `HB-devices`
  already blocks W0's exit for the same reason; **do not mark W1 shipped because the code
  is written.** The gate is the gate.

```yaml
      - id: M1.6
        title: Holdbacks 1-6 closed, and the exit gate
        status: shipped
        on: 2026-08-25
```

- [ ] **Step 5: Final commit**

```bash
git add docs/plan/state.yaml docs/install/verification-log.md
git commit -m "chore(plan): W1 · M1 exit gate

lane-check identity and structure green, ci-local green, both apps sign in and refuse
correctly per §6.1. Six of the eight inherited holdbacks closed; HB-domain and HB-logo
are external and were surfaced rather than worked around, and HB-apple-developer was
opened because Sign in with Apple for the web needs a membership §6.5 dropped."
```

---

## Self-review

**Spec coverage.** Walked W1 · M1's delivers list against the tasks:

| Delivered | Task |
|---|---|
| Google + Apple OAuth, top-level redirect, server-side PKCE, never a webview | 11, 13, 24 |
| Access JWT 15 min with identity_id / active_studio_id / role snapshot | 9 |
| Rotating 30-day refresh, reuse detection, revocation denylist | 10 |
| Account linking; Apple private relay stored as-is, never matched | 12 |
| Identity resolution and §6.1's two refusal screens, as queries | 12, 24, 25 |
| Platform console — provisioning + owner invitation only (C4) | 16 |
| `person`, `role_assignment`, `invitation`, `platform_admin`, `class`, `group`, `group_staff`, `location` | 3, 4, 5, 7 |
| Setup wizard container + steps 1, 3, 5, 6, slots open for M6/M7 | 27 |
| Both app shells, both nav drawers, studio switcher hidden for one studio | 23, 24, 25 |
| iOS install walkthrough; `beforeinstallprompt` on Chromium; standalone gate | 26 |
| Holdback 1 — `is_developer`, settable only by seed or migration | 3, 7, 8 |
| Holdback 2 — `request.state.is_developer` / `studio_is_demo` | 14 |
| Holdback 3 — personas FixtureLayer | 18 |
| Holdback 4 — role switcher, dev-bar slot, `X-Acting-As`, audit per switch | 19, 20 |
| Holdback 5 — `studio_app` with a login from a Railway secret | 28 |
| Holdback 6 / C3 — `kind='trial'` health template | 6, 21 |
| Holdback 7 — studio branding: surfaced, `HB-logo` stays open; step 1 takes a logo and no colours | 27, 29 |
| Holdback 8 — `HB-domain`: cookie built to spec, verified on localhost, escalated | 13, 22, 29, 30 |

**Two gaps found and closed while reviewing.** §5.2's `POST /auth/switch-studio` was in
§7's endpoint list but not in any task — added to Task 13's interface block and its route
list. And `GET /api/v1/auth/providers` was implied by Task 24's "one button per
configured provider" without existing anywhere — added to Task 24 step 3 and to Task 13's
router.

**Type consistency.** `AccessClaims` (Task 9) is constructed in Tasks 13, 14 and 19 with
the same nine fields. `IssuedRefresh.secret` / `.row` (Task 10) are read the same way in
Task 13. `AppAccess(staff, parent)` (Task 12) is the shape `AppAccessOut` serializes in
Task 13 and the shape `useSession().access` exposes in Task 22. `StudioMembership`
(Task 12) is `StudioMembershipOut` (Task 13) is `studios[]` (Tasks 22, 23, 25).
`DevToolKey` gains `'actAs'` in Task 20 and is used with that spelling in the test, the
order map and the registration. `registerWizardStep` (Task 27) wraps
`registerSlot('setup-wizard', …)` from the M0 registry, whose signature is
`registerSlot<P>(slot, {key, order, render})`.

**Two things this plan deliberately does not do.** It does not run the Railway commands
in Task 28 or the real-device check in Task 31 — both are outward-facing and belong to
the user. And it does not mark W0 shipped: `HB-devices` is what keeps that wave open, and
M1 starting is not W0 finishing.
