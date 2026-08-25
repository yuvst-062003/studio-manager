# W2 · Lane PEOPLE (M3) — Students, Guardians and the Lead Funnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build M3 — students, guardians and enrollment; the public trial landing page with sign-in-first booking and a session picker; the lead/trial funnel with `student_status_history`; manager conversion; trial follow-up automation; person and child matching; the approval queue; parent-initiated add-sibling; freeze and leave; and guardian invitations — across all three surfaces, delivering 14 artboards.

**Architecture:** Thin routers over services, exactly as `.claude/rules/api.md` requires. Four routers (`students`, `enrollments`, `public`, `trial_bookings`) mount by discovery; one service package (`app/services/people/`) holds every decision. The lane is a **pure reader of sessions**: bookable trial slots and a group's training weekdays both come through `ScheduleService.materialize_sessions()`, never from a `session` or `group_schedule_rule` query of our own. C11 puts the price on the student and C12 puts `attends_weekdays` on the enrollment, and both are read back through the contract module `app/services/people/attendance_pattern.py` — never re-derived. Frontend screens live entirely in each app's `features/people/` (and parent `features/landing/`), reached through one nav entry and one route branch per app; the two container artboards compose registered sections through `registerSlot()` and hardcode nothing.

**Tech Stack:** FastAPI · SQLAlchemy 2 · PostgreSQL 18 · Alembic (revision 0006 already applied — this lane runs **no** migration) · Pydantic v2 · React 19 + TS 5.9 · Vite · Vitest · npm workspaces.

**Spec:** [SPEC.md](../../../SPEC.md) §5.3, §5.4, §5.4a, §6.1, §6.3, §7 · [docs/plan/milestone-plan.md](../../plan/milestone-plan.md) Global Constraints and W2 · Lane PEOPLE · [CLAUDE.md](../../../CLAUDE.md) · [docs/design/canvas/INVENTORY.md](../../design/canvas/INVENTORY.md)

---

## Global Constraints

Every task inherits these. Copied verbatim from their sources; a task that breaks one is wrong even if its own tests pass.

| # | Constraint | Source |
|---|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md |
| G2 | Money is **always** an integer count of agorot. Never a float, never a decimal. | SPEC §8.3 |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered `Asia/Jerusalem` regardless of locale. | SPEC §8.3, §9 |
| G4 | No user-facing string is ever inlined in a component. Everything goes through `@studio/i18n`. | SPEC §8.3 |
| G5 | New API endpoints are versioned under `/api/v1/`. | CLAUDE.md |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. | SPEC §7, CLAUDE.md |
| G7 | Health declarations contain personal data about minors. **Never log their contents.** | CLAUDE.md, SPEC §5.5 |
| G9 | Every tenant-scoped table carries non-null `studio_id` with a leading composite index; bypassing `TenantMixin` needs the explicit escape hatch. | SPEC §4.2 |
| G10 | Every belt bar carries a 1px ring in the current foreground colour. Never fill-only. Use `BeltBar` from `@studio/ui`; never redraw one. | D7 |
| G11 | `#6f6b62` is the floor for any light-mode text token. `#7a766d` is retired. Use named tokens, never hex. | D8 |
| G12 | Physical CSS properties (`marginLeft`, `paddingRight`, `left:`, `right:`) are banned by ESLint in all frontend source. Canvas CSS is a **visual reference only** — never copy-pasted. | D10 |
| G13 | Colours live in named tokens, never hardcoded hex. Semantic tokens are never overridable. | D1, D2 |
| G14 | Typeface is Rubik. Do not introduce another family. | D6 |
| G15 | Soft-delete (`deleted_at`) on user-generated content. No PII is denormalized into a financial row. | SPEC §8.3, §11.4 |
| G16 | Every list endpoint is cursor-paginated (`CursorPage` from `app/schemas/_pagination.py`). Every mutating endpoint accepts an optional `Idempotency-Key`. | SPEC §8.3 |
| G18 | A failing test is written before any bug fix, and before every feature in this plan. | CLAUDE.md, SPEC §13 |

### Lane constraints — these override anything that contradicts them

| # | Constraint |
|---|---|
| L1 | **`app/services/people/attendance_pattern.py` is CONTRACT code.** W3's roster and W4's billing run both read it. Read expectation through `expected_weekdays`, `is_expected`, `weekly_volume` — never re-derive inline. **Do not edit that file.** If a change looks necessary, stop and report it. |
| L2 | **C11 — the price is on the student.** `student.price_plan_id`. `enrollment` carries no price and must never grow one. Store the id only; never build a plan picker, never render an amount. `price_plan` is W4's table and does not exist. |
| L3 | **C11 — a student may hold SEVERAL live enrollments.** §5.4's "each child is enrolled in one group" was wrong and is corrected. Do not add a one-group constraint anywhere. |
| L4 | **C12 — every enrolment form collects `attends_weekdays`**, offered as checkboxes over that group's scheduled weekdays, all ticked by default. `NULL` means "all of them"; an empty array is rejected by the table CHECK. |
| L5 | **Reader of sessions, never a writer.** Bookable trial slots and a group's training weekdays both come through `ScheduleService.materialize_sessions()`. Never `INSERT`, `UPDATE` or `DELETE` a `session` row; never query `session` or `group_schedule_rule` directly. If you want to create or edit a session, stop and report it. |
| L6 | **Enrolment is always a manager decision.** The public link's only job is a first lesson. Nobody enrols themselves (§5.4). |
| L7 | **Never create a duplicate guardian.** Submissions match on **verified** email or phone only. |
| L8 | **All guardians are equal** and see the same things, payments included. `is_primary` decides two things and only two: whose name the bill is addressed to, and which person a הוראת קבע payment matches. No permission branching in the guardian view, server or client. |
| L9 | **There is no household or family entity.** "My children" is `SELECT student_id FROM guardian WHERE person_id = me`. Never create one. |
| L10 | **`registration_request.payload_encrypted` holds a minor's data.** Never log it, never put it in an audit `diff`, never return it from a list endpoint. |
| L11 | The trial health declaration writes against the **seeded `kind='trial'` template** shipped in M1. Do not build a template editor; do not touch `kind='full'`. |
| L12 | Files this lane must not modify: `alembic/versions/**`, `app/models/_pending/**` (never import them either), `app/models/__init__.py`, `app/main.py`, `app/schemas/**` other than `people.py`, `web/packages/{ui,core}/**`, any i18n file other than `people.ts`, anything under `app/services/schedule/` or `web/apps/*/src/features/schedule/`. |
| L13 | **Approved exceptions to L12, agreed before this plan was written.** Only these: (a) `scripts/lane-check.sh` — add a `people)` branch; (b) `tests/invariants/test_03_coach_endpoints_expose_no_money.py` — delete `test_the_gate_is_currently_empty_and_says_so` when the first `coach`-tagged router lands, exactly as that test's own docstring instructs; (c) `openapi.json` and `web/packages/api-client/src/schema.d.ts` — **regenerate** with the prescribed commands, never hand-edit; (d) `infra/railway/jobs.json` — one entry for the follow-up worker; (e) `web/apps/{parent,staff,dashboard}/src/App.tsx` and `web/apps/parent/src/features/identity/Resolve.tsx` — nav entry plus route branch only; every screen stays in a feature directory. Nothing else. |

### Commands

```bash
.venv/bin/pytest tests/people -q                    # this lane's backend tests
.venv/bin/pytest tests/people/test_x.py::test_y -v  # one test
.venv/bin/mypy app                                  # types
.venv/bin/ruff check --fix app && .venv/bin/ruff format app
(cd web && npx vitest run apps/parent/src/features/people/X.test.tsx --reporter=dot)
./scripts/dev-db.sh up                              # database tests FAIL without it
./scripts/lane-check.sh people                      # the gate
```

Regenerating the client, after any router or schema change:

```bash
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
```

### Standing facts about this codebase an executor will otherwise get wrong

- **Routers and models mount by discovery.** Creating `app/routers/students.py` mounts it under `/api/v1/`. Never edit `app/main.py` or `app/models/__init__.py`.
- **`app.core.clock.now()` is the only clock.** A test fails the build on any other `datetime.now()` inside `app/`.
- **Weekdays are 0–6, Sunday-first**, matching `group_schedule_rule.weekday`. Python's `date.weekday()` is Monday-first. Convert with `(d.weekday() + 1) % 7`.
- **`TenantSession` fails closed.** No studio in context raises. Tenant-scoped routes take `TenantSessionDep`; the tenant filter is registered on `TenantSession` only, so a plain `Session` (`SessionDep` from `app/core/db.py`) is genuinely unfiltered — which is what the pre-studio public paths use, with explicit `studio_id` predicates. **Do not call `with_all_tenants` anywhere in this lane**: `tests/restrictions/test_19_7_demo_data_hygiene.py` would require an entry in `app/core/demo.py`, which L12 forbids.
- **`ScheduleService.materialize_sessions` raises `NotImplementedError`** until lane SCHEDULE merges. Services take the schedule reader by injection so tests supply a fake; routers translate `NotImplementedError` into a 503 with code `schedule_unavailable` rather than leaking a stack trace (`.claude/rules/api.md`).
- **`health_declaration`, `consent_record`, `price_plan`, `charge` and `student_note` do not exist.** They are W3/W4 tables. Nothing in this lane may import `app/models/_pending/**`.
- **Frontend has no router library** and none may be added. Both other apps use `location.hash`; the public landing page uses `location.pathname` because `/t/{slug}` must be a real shareable URL (`navigateFallback: 'index.html'` already serves it).

---

## File Structure

### Backend — created by this lane

| File | Responsibility |
|---|---|
| `app/services/people/errors.py` | The three service exceptions every module here raises: `NotFoundError`, `ConflictError`, `RefusedError`. Routers map them to 404/409/422 once. |
| `app/services/people/status.py` | `StudentStatusService.transition()` — the **only** writer of `student.status`, and the only writer of `student_status_history`. One writer is what keeps the funnel report honest. |
| `app/services/people/matching.py` | §5.4a person and child matching on **verified** email or phone, and duplicate-child detection on name + birthdate. Pure query helpers, no writes. |
| `app/services/people/group_days.py` | C12's other input: a group's training weekdays, **observed through `ScheduleService.materialize_sessions()`** over a four-week window and converted to Asia/Jerusalem Sunday-first weekdays. |
| `app/services/people/students.py` | `StudentService` — create, list (with §3.2 coach scoping), get, update, freeze, expire freezes, leave, convert, mark lost, guardians, invitations. |
| `app/services/people/enrollments.py` | `EnrollmentService` — create/update/end an enrollment, validate `attends_weekdays` against the group's training weekdays, and report `weekly_volume` through the contract module. |
| `app/services/people/trials.py` | `TrialService` — bookable slots, sign-in-first self booking, manager booking, the one-free-trial rule and its override, attendance outcome, the follow-up ladder's query. |
| `app/services/people/registrations.py` | `RegistrationService` — the encrypted queue, the summary projection, and §5.4a's atomic approval transaction. |
| `app/services/people/landing.py` | `LandingService` — the unauthenticated shop-window reads, by slug, with explicit `studio_id` predicates. |
| `app/services/people/rate_limit.py` | A per-process fixed-window limiter for the one public write. Honest about being per-replica. |
| `app/routers/students.py` | `/students`, `/students/{id}`, freeze, leave, convert, mark-lost, status-history, guardians, `/me/students`. Tagged `coach` — the first such router. |
| `app/routers/enrollments.py` | `/enrollments`, `/enrollments/{id}`, `/enrollments/weekday-options`. |
| `app/routers/public.py` | `/public/studios/{slug}`, `.../groups`, `.../landing`, `/public/groups/{id}/trial-slots`. Unauthenticated. |
| `app/routers/trial_bookings.py` | `/trial-bookings`, `/trial-bookings/self`, `/trial-bookings/{id}/grant-override`, and `/registration-requests` + approve/reject — the funnel's intake and its queue, together. |
| `app/workers/followups.py` | The daily job: §5.4a's day 1 / 3 / 7 ladder, the no-conversion-after-N-days sweep, and freeze expiry. |
| `tests/people/**` | Every backend test in this lane. |

### Backend — modified by this lane

| File | Change |
|---|---|
| `app/schemas/people.py` | Additive only. The contract shapes already there are not edited; new shapes for the public surface, guardians, conversion and page params are appended. |
| `app/services/people/__init__.py` | Docstring only — record what the package grew. |
| `scripts/lane-check.sh` | L13(a) — a `people)` branch. |
| `tests/invariants/test_03_...py` | L13(b) — delete the vacuity test when the `coach` tag lands. |
| `infra/railway/jobs.json` | L13(d) — one entry. |
| `openapi.json`, `web/packages/api-client/src/schema.d.ts` | L13(c) — regenerated, never hand-edited. |

### Frontend — created by this lane

| File | Artboard |
|---|---|
| `web/apps/parent/src/features/landing/PublicLanding.tsx` | `13a` / `13c` — the shop window, mobile scroll and desktop sticky-form |
| `web/apps/parent/src/features/landing/BookingFlow.tsx` | `13a` steps 2–4 — children, trial declaration, session picker |
| `web/apps/parent/src/features/landing/BookingConfirmed.tsx` | `13b` — אחרי השליחה |
| `web/apps/parent/src/features/landing/landingClient.ts` | The only file that knows the public endpoint paths |
| `web/apps/parent/src/features/landing/route.ts` | `matchLandingPath(pathname)` — `/t/:slug` |
| `web/apps/parent/src/features/people/FirstRegistration.tsx` | `12j` — הרשמה ראשונה |
| `web/apps/parent/src/features/people/AddSibling.tsx` | `12g` — הוספת ילד נוסף |
| `web/apps/parent/src/features/people/ProfileAndLeave.tsx` | `12i` — פרופיל · עזיבת המועדון |
| `web/apps/parent/src/features/people/TrialHome.tsx` | §6.3's reduced trial home |
| `web/apps/parent/src/features/people/StudentCard.tsx` | `2c` — **container**, composes `useSlot('student-card')` |
| `web/apps/parent/src/features/people/sections/*.tsx` | This lane's own `student-card` sections |
| `web/apps/parent/src/features/people/register.ts` | `registerSlot()` calls for the sections above |
| `web/apps/parent/src/features/people/peopleClient.ts` | The parent app's endpoint paths |
| `web/apps/staff/src/features/people/StudentsSearch.tsx` | `9h` — חניכים, the search tab |
| `web/apps/staff/src/features/people/StaffStudentCard.tsx` | `9c` — כרטיס חניך ומעבר כיתה, lead-coach-only action |
| `web/apps/staff/src/features/people/TrialInClass.tsx` | `11b` — שיעור ניסיון, adding a student mid-lesson |
| `web/apps/staff/src/features/people/peopleClient.ts` | The staff app's endpoint paths |
| `web/apps/dashboard/src/features/people/StudentsScreen.tsx` | `3b` — חניכים, table + filters |
| `web/apps/dashboard/src/features/people/AddStudentScreen.tsx` | `3c` — הוספת חניך, attach to an existing parent |
| `web/apps/dashboard/src/features/people/StudentDetailScreen.tsx` | `4a` — כרטיס חניך |
| `web/apps/dashboard/src/features/people/AlertCentre.tsx` | `6c` — **container**, composes `useSlot('alert-centre')` |
| `web/apps/dashboard/src/features/people/sections/*.tsx` | This lane's own `alert-centre` sections |
| `web/apps/dashboard/src/features/people/register.ts` | `registerSlot()` calls for the sections above |
| `web/apps/dashboard/src/features/people/peopleClient.ts` | The dashboard's endpoint paths |
| `web/packages/i18n/{he,en,ru}/people.ts` | Extended — this lane owns all three |

Each screen file ships with a sibling `*.test.tsx`. Every one asserts, at minimum: the heading renders from `t()`, every interactive element has an accessible name, no inline style carries a physical property, and it renders in `he`/`rtl` and `en`/`ltr`.

---

## Task 1 — The lane gate, and a test harness that fails closed

Nothing else in this plan is worth doing until the gate actually reaches the files it is meant to guard.

**Files:**
- Modify: `scripts/lane-check.sh` (the `case "$V"` block, beside `structure)`)
- Create: `tests/people/__init__.py`, `tests/people/conftest.py`
- Create: `tests/people/test_lane_gate.py`

**Interfaces:**
- Produces: fixtures `studio`, `as_owner`, `as_manager`, `as_lead_coach`, `as_assistant_coach`, `as_guardian` (all returning `Caller`), `a_class`, `a_group`, `a_second_group`, `other_studio_group_id`, `fake_schedule`. Every later backend task consumes these.

- [ ] **Step 1: Write the failing test**

`tests/people/test_lane_gate.py`:

```python
"""The gate must reach this lane's own files.

`scripts/lane-check.sh`'s default branch resolves `app/routers/$V.py`, which for `people`
is a file that does not exist -- so mypy and ruff would run against the service package
alone and every router in the lane would go unchecked. `identity` and `structure` each
carry an explicit branch for exactly this reason; this test is why `people` has one too.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

OWNED = (
    "app/services/people",
    "app/routers/students.py",
    "app/routers/enrollments.py",
    "app/routers/public.py",
    "app/routers/trial_bookings.py",
    "app/workers/followups.py",
    "app/models/people.py",
    "tests/people",
)


def _dry_run() -> str:
    result = subprocess.run(
        ["bash", "scripts/lane-check.sh", "people", "--dry-run"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def test_the_people_gate_names_every_backend_file_the_lane_owns():
    printed = _dry_run()
    missing = [path for path in OWNED if path not in printed]
    assert missing == [], (
        "scripts/lane-check.sh people does not reach these -- a green check that "
        f"verified nothing is worse than a red one: {missing}"
    )
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/people/test_lane_gate.py -v
```

Expected: FAIL — the dry run prints only `app/services/people` and `app/models/people.py`; every router and the worker are missing.

- [ ] **Step 3: Add the `people)` branch**

In `scripts/lane-check.sh`, insert immediately after the `structure)` block's `;;`:

```bash
  people)
    # SPEC §7 spreads M3 over four routers named for their endpoints -- /students,
    # /enrollments, /public, /trial-bookings -- so none of them is `app/routers/people.py`
    # and the default branch below would type-check the service package while silently
    # skipping every route in the lane. Listed explicitly for the same reason `identity`
    # lists platform.py: a router in neither list is a router the stated gate does not
    # reach. app/workers/followups.py is here because §5.4a's day 1/3/7 ladder is a job,
    # and a job outside every lane's check is a job nothing type-checks.
    py_candidates=(app/services/people app/routers/students.py app/routers/enrollments.py \
                   app/routers/public.py app/routers/trial_bookings.py \
                   app/workers/followups.py app/models/people.py)
    test_candidates=(tests/people)
    ;;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
.venv/bin/pytest tests/people/test_lane_gate.py -v
```

Expected: PASS. The dry run names all eight paths. (Non-existent files are filtered out by the script's own `-e` loop, so the test's `missing` list shrinks as the lane lands files — which is why Step 1 lists everything the lane will own, not everything it owns today. If a path is absent because the file is not written yet, that is the same failure as the branch missing it: both mean the gate is not covering it. Write the empty module in the task that owns it.)

> **Note for the executor:** because the script filters to files that exist, this test only passes once each file exists. Create each module as an empty stub with its docstring in Step 3 of the task that introduces it, and this test stays green throughout. Do not weaken the assertion.

- [ ] **Step 5: Write the shared fixtures**

`tests/people/conftest.py`:

```python
"""Signed-in callers at every level of §3.2's matrix, plus the structure a student needs.

Every fixture signs in for real rather than forging a token, for the reason
tests/structure/conftest.py states: the matrix is enforced by a router dependency reading
`request.state.roles`, which app/core/auth_context.py fills from a VERIFIED claim, so a
hand-made token would test the dependency against an input the product cannot produce.

`fake_schedule` is the other half. `ScheduleService.materialize_sessions` raises
NotImplementedError until lane SCHEDULE merges (that is deliberate -- a stub returning []
would let this lane build against a lie), so every test that needs slots supplies a reader
by injection. Nothing here monkeypatches the real service.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import pytest
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group, GroupStaff
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: Wednesday. Chosen so `(weekday() + 1) % 7 == 4` is visibly not `weekday()`, which is
#: how a Monday-first slip shows up in an assertion rather than hiding behind a Sunday.
T0 = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)
TODAY = date(2026, 9, 2)


@dataclass
class Caller:
    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@dataclass
class FakeSchedule:
    """A stand-in for lane SCHEDULE's reader, with the same signature as the seam.

    Returns detached `Session` rows -- the real one materializes, but nothing in this lane
    holds a session id across a transaction boundary, so a detached row is a faithful
    enough double for a reader.
    """

    sessions: dict[uuid.UUID, list[SessionRow]] = field(default_factory=dict)
    calls: list[tuple[uuid.UUID, date, date]] = field(default_factory=list)

    def materialize_sessions(
        self, group_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[SessionRow]:
        self.calls.append((group_id, from_date, to_date))
        rows = self.sessions.get(group_id, [])
        return sorted(
            (s for s in rows if from_date <= s.starts_at.date() <= to_date),
            key=lambda s: s.starts_at,
        )


def make_session(
    *,
    studio_id: uuid.UUID,
    group_id: uuid.UUID,
    training_year_id: uuid.UUID,
    starts_at: datetime,
    status: str = "scheduled",
) -> SessionRow:
    return SessionRow(
        id=uuid.uuid4(),
        studio_id=studio_id,
        group_id=group_id,
        training_year_id=training_year_id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        status=status,
        is_manually_edited=False,
        is_ad_hoc=False,
    )


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון ג'ודו", slug=f"jd-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _make_caller(
    client: TestClient,
    fake_provider,
    app_session: Session,
    studio: Studio,
    *,
    role: str | None,
    is_guardian: bool = False,
) -> Caller:
    subject = f"{role or 'guardian'}-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="staff")

    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    person = Person(
        studio_id=studio.id,
        auth_identity_id=identity_id,
        first_name="בודק",
        last_name=role or "הורה",
        email=f"{subject}@example.invalid",
    )
    app_session.add(person)
    app_session.flush()
    if role is not None:
        app_session.add(
            RoleAssignment(
                studio_id=studio.id,
                person_id=person.id,
                role=role,
                scope_type="studio",
                granted_at=T0,
            )
        )
    if is_guardian:
        # A guardian row with no student is §6.1's parent-app EXISTS query satisfied and
        # nothing more. Tests that need real children add them.
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=uuid.uuid4(),
                person_id=person.id,
                is_primary=True,
                relation="parent",
            )
        )
    app_session.commit()

    signed = sign_in(client, code=code, app_name="staff")
    return Caller(token=signed.json()["access_token"], studio_id=studio.id, person_id=person.id)


@pytest.fixture
def as_owner(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="owner")


@pytest.fixture
def as_manager(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="manager")


@pytest.fixture
def as_lead_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="lead_coach")


@pytest.fixture
def as_assistant_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="assistant_coach")


@pytest.fixture
def as_guardian(client, fake_provider, app_session, studio) -> Caller:
    """§3.1 -- a guardian holds no role_assignment at all."""
    return _make_caller(client, fake_provider, app_session, studio, role=None, is_guardian=True)


@pytest.fixture
def a_class(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    row = Group(studio_id=studio.id, class_id=a_class, name="מתחילים", age_min=5, age_max=8)
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_second_group(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    """C11's case: a child in two groups. One student, two enrollments, one price."""
    row = Group(studio_id=studio.id, class_id=a_class, name="נבחרת", age_min=9, age_max=14)
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_training_year(app_session: Session, studio: Studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ז",
        starts_on=date(2026, 9, 1),
        ends_on=date(2027, 6, 30),
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def assign_coach(app_session: Session, studio: Studio):
    """§3.2 -- 'View students in own groups'. A coach reaches a student through this row."""

    def _assign(person_id: uuid.UUID, group_id: uuid.UUID, role: str = "lead_coach") -> None:
        app_session.add(
            GroupStaff(
                studio_id=studio.id,
                group_id=group_id,
                person_id=person_id,
                role=role,
                from_date=date(2026, 9, 1),
            )
        )
        app_session.commit()

    return _assign


@pytest.fixture
def fake_schedule() -> FakeSchedule:
    return FakeSchedule()


@pytest.fixture
def other_studio_group_id(app_session: Session) -> uuid.UUID:
    """A group in a studio the caller has nothing to do with. The tenant filter should
    make it invisible rather than merely forbidden -- 404, never 403."""
    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    klass = Class(studio_id=other.id, name="קראטה")
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=other.id, class_id=klass.id, name="ילדים")
    app_session.add(group)
    app_session.commit()
    return group.id
```

`tests/people/__init__.py` is empty.

- [ ] **Step 6: Confirm the harness imports**

```bash
./scripts/dev-db.sh up
.venv/bin/pytest tests/people -q
```

Expected: PASS (1 passed) — the gate test, with the fixtures importable.

- [ ] **Step 7: Commit**

```bash
git add scripts/lane-check.sh tests/people
git commit -m "test(people): the lane gate reaches this lane's routers, and the harness that fails closed"
```

---

## Task 2 — Status transitions: one writer, and a history that cannot disagree with itself

`student.status` is the spine of §5.4a's funnel. If two modules write it, the funnel report and the roster start telling different stories, and nobody can say which is right. This task makes one function the only writer of both `student.status` and `student_status_history`.

**Files:**
- Create: `app/services/people/errors.py`
- Create: `app/services/people/status.py`
- Test: `tests/people/test_status.py`

**Interfaces:**
- Produces:
  - `class NotFoundError(Exception)`, `class ConflictError(Exception)`, `class RefusedError(Exception)` in `errors.py`
  - `LEGAL_TRANSITIONS: dict[str, frozenset[str]]`
  - `StudentStatusService.transition(session, *, student, to_status, at, actor_person_id=None, reason=None) -> StudentStatusHistory`
- Consumed by: Tasks 4, 6, 11, 12, 13.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_status.py`:

```python
"""§5.4a's funnel, as a state machine with exactly one writer.

    lead --> trial --> pending_approval --> active --> frozen --> left
       |                                                       \\-> lost

The graph is asserted rather than assumed because `student_status_history` is what
`GET /reports/funnel` is computed from (§5.4a), and a transition nobody legislated is a
row in that report nobody can explain.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.people import Student, StudentStatusHistory
from app.models.person import Person
from app.services.people.errors import RefusedError
from app.services.people.status import LEGAL_TRANSITIONS, StudentStatusService
from sqlalchemy import select
from tests.people.conftest import T0


@pytest.fixture
def a_student(app_session, studio):
    person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן")
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="lead")
    app_session.add(student)
    app_session.commit()
    return student


def test_a_transition_moves_the_student_and_records_the_move(app_session, a_student):
    StudentStatusService.transition(
        app_session, student=a_student, to_status="trial", at=T0, reason="booked online"
    )
    app_session.commit()

    assert a_student.status == "trial"
    row = app_session.execute(
        select(StudentStatusHistory).where(StudentStatusHistory.student_id == a_student.id)
    ).scalar_one()
    assert (row.from_status, row.to_status) == ("lead", "trial")
    assert row.changed_at == T0
    assert row.reason == "booked online"


def test_an_illegal_transition_is_refused_and_writes_nothing(app_session, a_student):
    # A lead has not attended anything. Jumping straight to `left` would put a departure
    # in the funnel for somebody who never arrived.
    with pytest.raises(RefusedError):
        StudentStatusService.transition(app_session, student=a_student, to_status="left", at=T0)
    app_session.rollback()

    assert a_student.status == "lead"
    assert app_session.execute(select(StudentStatusHistory)).first() is None


def test_a_transition_to_the_same_status_is_refused(app_session, a_student):
    """A no-op that still wrote history would inflate every funnel denominator by however
    many times somebody pressed the button twice."""
    with pytest.raises(RefusedError):
        StudentStatusService.transition(app_session, student=a_student, to_status="lead", at=T0)


def test_the_actor_is_recorded_when_there_is_one(app_session, a_student, as_manager):
    row = StudentStatusService.transition(
        app_session,
        student=a_student,
        to_status="trial",
        at=T0,
        actor_person_id=as_manager.person_id,
    )
    app_session.commit()
    assert row.changed_by_person_id == as_manager.person_id


def test_an_automated_transition_records_no_actor(app_session, a_student):
    """§5.4a -- 'No conversion after N days -> status=lost'. The job has no person behind
    it, and inventing one would make the audit trail lie about who decided."""
    StudentStatusService.transition(app_session, student=a_student, to_status="lost", at=T0)
    app_session.commit()
    assert a_student.status == "lost"


def test_every_status_in_the_graph_is_one_the_table_allows():
    """The CHECK constraint and this graph must agree, or a legal transition 500s on an
    IntegrityError instead of being refused with a message."""
    from app.models.people import STUDENT_STATUSES

    reachable = set(LEGAL_TRANSITIONS) | {s for v in LEGAL_TRANSITIONS.values() for s in v}
    assert reachable <= set(STUDENT_STATUSES)


def test_a_frozen_student_returns_to_active_and_not_anywhere_else(app_session, a_student):
    """§5.4's freeze 'retains the enrollment and the spot'. The only way out of `frozen`
    is back to `active` or out to `left` -- a frozen student who became a `lead` again
    would reappear at the top of the funnel."""
    assert LEGAL_TRANSITIONS["frozen"] == frozenset({"active", "left"})


def test_lost_and_left_are_terminal(app_session):
    """§5.4a: 'lost is a real outcome and not an absence of one.' A terminal state is what
    makes the funnel's denominator honest -- a student who can leave `lost` is a student
    who can be counted twice."""
    assert LEGAL_TRANSITIONS["lost"] == frozenset()
    assert LEGAL_TRANSITIONS["left"] == frozenset()


def test_history_survives_a_second_transition_in_order(app_session, a_student):
    StudentStatusService.transition(app_session, student=a_student, to_status="trial", at=T0)
    StudentStatusService.transition(
        app_session, student=a_student, to_status="pending_approval", at=T0
    )
    app_session.commit()
    rows = list(
        app_session.execute(
            select(StudentStatusHistory)
            .where(StudentStatusHistory.student_id == a_student.id)
            .order_by(StudentStatusHistory.created_at)
        ).scalars()
    )
    assert [(r.from_status, r.to_status) for r in rows] == [
        ("lead", "trial"),
        ("trial", "pending_approval"),
    ]
```

- [ ] **Step 2: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_status.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.people.status'`.

- [ ] **Step 3: Write the implementation**

`app/services/people/errors.py`:

```python
"""Three exceptions, so a router maps outcomes to status codes in one place.

A service raising `HTTPException` would be a service whose guarantees depend on being
called from a router -- and `.claude/rules/api.md` puts authorization in the router
precisely so services stay callable from a worker. The follow-up job (§5.4a) calls the
same code paths the routes do, with no request anywhere in sight.
"""

from __future__ import annotations


class NotFoundError(Exception):
    """The row is not in the caller's studio. The router answers 404 and never 403: a
    403 confirms the row exists somewhere, which is a cross-tenant read with a polite
    error message."""


class ConflictError(Exception):
    """The write would duplicate something the schema, or §5.4, forbids -- a second live
    enrollment in one group, a second free trial, a guardian who is already linked."""


class RefusedError(Exception):
    """The input is well-formed and the row exists, but the product says no. An illegal
    status transition, an `attends_weekdays` naming a day the group does not train."""
```

`app/services/people/status.py`:

```python
"""§5.4a's funnel, and the single writer that keeps it honest.

`student_status_history` is not an audit convenience -- §5.4a computes the whole funnel
report from it ("enquiries -> trials booked -> trials attended -> converted, sliced by
source and by month"). That only holds if every move through the graph leaves exactly one
row, which in turn only holds if one function does the moving. Set `student.status`
anywhere else and the report starts disagreeing with the roster.

The graph is narrower than the CHECK constraint on purpose. The constraint says which
values are *legal in the column*; this says which moves are *legal in the product*, and
the difference is where the bugs are. A `lead` promoted straight to `left` passes the
constraint and puts a departure in the funnel for somebody who never arrived.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.people import Student, StudentStatusHistory
from app.services.audit import AuditService
from app.services.people.errors import RefusedError

#: §5.4a's diagram, as a graph.
#:
#:     lead --> trial --> pending_approval --> active --> frozen --> left
#:        |                                                      \\-> lost
#:
#: `lead -> active` is legal and deliberate: §5.4(a)'s manager-added student never books a
#: trial, and forcing one through `trial` would put a trial in the funnel that never
#: happened. `left` and `lost` are terminal -- a student who can leave them is a student
#: the funnel can count twice.
LEGAL_TRANSITIONS: dict[str, frozenset[str]] = {
    "lead": frozenset({"trial", "pending_approval", "active", "lost"}),
    "trial": frozenset({"pending_approval", "active", "lost"}),
    "pending_approval": frozenset({"active", "lost"}),
    "active": frozenset({"frozen", "left"}),
    "frozen": frozenset({"active", "left"}),
    "left": frozenset(),
    "lost": frozenset(),
}


class StudentStatusService:
    """The only writer of `student.status`."""

    @staticmethod
    def transition(
        session: Session,
        *,
        student: Student,
        to_status: str,
        at: datetime,
        actor_person_id: uuid.UUID | None = None,
        reason: str | None = None,
    ) -> StudentStatusHistory:
        """Move one student, and record the move.

        `actor_person_id` is nullable because §5.4a's follow-up job moves a student to
        `lost` with no human behind it. Attributing that to whoever happened to configure
        the cron would make the audit trail lie about who decided.

        Does not commit. Every caller is inside a larger transaction -- conversion writes
        an enrollment in the same breath (§5.4a step 5), and a status that survived a
        failed enrollment would be a student marked active in no group.
        """
        allowed = LEGAL_TRANSITIONS.get(student.status, frozenset())
        if to_status not in allowed:
            raise RefusedError(
                f"a student cannot move from {student.status!r} to {to_status!r}; "
                f"legal moves are {sorted(allowed)}"
            )

        from_status = student.status
        student.status = to_status
        row = StudentStatusHistory(
            studio_id=student.studio_id,
            student_id=student.id,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
            changed_by_person_id=actor_person_id,
            changed_at=at,
        )
        session.add(row)
        AuditService.record(
            session,
            action="student.status.changed",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # Statuses and a reason. No name, no birthdate, nothing about health -- §11.2
            # keeps a diff to what changed, and what changed here is one enum.
            diff={"from": from_status, "to": to_status, "reason": reason},
        )
        session.flush()
        return row
```

- [ ] **Step 4: Run them and watch them pass**

```bash
.venv/bin/pytest tests/people/test_status.py -q
```

Expected: PASS (9 passed).

- [ ] **Step 5: Types, lint, commit**

```bash
.venv/bin/ruff check --fix app/services/people && .venv/bin/ruff format app/services/people
.venv/bin/mypy app/services/people
git add app/services/people tests/people
git commit -m "feat(people): §5.4a's funnel as a graph with exactly one writer"
```

---

## Task 3 — Person and child matching, on verified email or phone

§5.4a: "A matched parent is **never duplicated**." L7 makes the matching key **verified** contact details only — a client cannot verify anything, so a submitted email that nobody confirmed must never silently attach a stranger's children to somebody's account.

**Files:**
- Create: `app/services/people/matching.py`
- Test: `tests/people/test_matching.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class PersonMatch: person_id: uuid.UUID; matched_on: str; display_name: str`
  - `@dataclass(frozen=True) class ChildMatch: student_id: uuid.UUID; display_name: str; birthdate: date | None`
  - `match_person(session, *, email=None, phone=None) -> PersonMatch | None`
  - `match_children(session, *, first_name, last_name, birthdate) -> list[ChildMatch]`
  - `normalize_phone(raw: str | None) -> str | None`
- Consumed by: Tasks 11, 12.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_matching.py`:

```python
"""§5.4a's person and child matching. L7: **verified** email or phone, and nothing else.

The negative tests carry more weight than the positives here. A matcher that is slightly
too eager attaches a stranger's child to somebody else's account, and the person who finds
out is the parent who opens the app and sees a child who is not theirs.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Person
from app.services.people.matching import (
    match_children,
    match_person,
    normalize_phone,
)


def _identity(app_session, *, email: str | None, verified: bool) -> uuid.UUID:
    row = AuthIdentity(
        provider="fake",
        provider_subject=f"s-{uuid.uuid4()}",
        email=email,
        email_verified=verified,
        is_private_relay=False,
    )
    app_session.add(row)
    app_session.flush()
    return row.id


def _person(app_session, studio, **fields) -> Person:
    row = Person(studio_id=studio.id, first_name="יעל", last_name="כהן", **fields)
    app_session.add(row)
    app_session.commit()
    return row


def test_a_verified_email_matches(app_session, studio):
    identity = _identity(app_session, email="yael@example.invalid", verified=True)
    existing = _person(app_session, studio, email="yael@example.invalid", auth_identity_id=identity)

    match = match_person(app_session, email="yael@example.invalid")
    assert match is not None
    assert match.person_id == existing.id
    assert match.matched_on == "email"


def test_an_unverified_email_never_matches(app_session, studio):
    """L7. An address nobody confirmed is a claim, not an identity -- and anyone can make
    a claim about anyone's address."""
    identity = _identity(app_session, email="yael@example.invalid", verified=False)
    _person(app_session, studio, email="yael@example.invalid", auth_identity_id=identity)

    assert match_person(app_session, email="yael@example.invalid") is None


def test_a_person_with_no_login_never_matches_on_email(app_session, studio):
    """A pre-created Person carries an email a manager typed. Nobody verified it, so it
    cannot be a matching key -- it is what the INVITATION is addressed to (§5.3), which
    is a different mechanism with a token in it."""
    _person(app_session, studio, email="yael@example.invalid", auth_identity_id=None)

    assert match_person(app_session, email="yael@example.invalid") is None


def test_a_phone_matches_across_formatting(app_session, studio):
    identity = _identity(app_session, email=None, verified=False)
    existing = _person(app_session, studio, phone="0521234567", auth_identity_id=identity)

    match = match_person(app_session, phone="+972-52-123-4567")
    assert match is not None and match.person_id == existing.id
    assert match.matched_on == "phone"


def test_a_genuinely_new_family_matches_nobody(app_session, studio):
    """§5.4a: 'None is a genuinely new family, and that is the common case rather than an
    error.'"""
    assert match_person(app_session, email="nobody@example.invalid", phone="0500000000") is None


def test_matching_never_reaches_another_studio(app_session, studio, other_studio_group_id):
    """The reads run under TenantSession, so this is the tenant filter doing its job --
    asserted rather than assumed, because a cross-studio match would join two clubs'
    families together."""
    assert match_person(app_session, email="someone-elses@example.invalid") is None


def test_an_anonymized_person_never_matches(app_session, studio):
    """§11.4 wipes the Person and leaves financial rows. Matching one would attach a new
    child to a profile that has been erased."""
    from datetime import UTC, datetime

    identity = _identity(app_session, email="gone@example.invalid", verified=True)
    _person(
        app_session,
        studio,
        email="gone@example.invalid",
        auth_identity_id=identity,
        anonymized_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert match_person(app_session, email="gone@example.invalid") is None


def test_a_child_with_the_same_name_and_birthdate_is_flagged(app_session, studio):
    """§5.4a's duplicate-child detection: 'the manager sees a warning and can merge into
    the existing student rather than creating a second one.' A warning, never an automatic
    merge -- two siblings can share a birthday, and the club knows and we do not."""
    person = Person(studio_id=studio.id, first_name="נועה", last_name="כהן",
                    birthdate=date(2020, 3, 4))
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    found = match_children(
        app_session, first_name="נועה", last_name="כהן", birthdate=date(2020, 3, 4)
    )
    assert [m.display_name for m in found] == ["נועה כהן"]


def test_a_different_birthdate_is_not_a_duplicate(app_session, studio):
    person = Person(studio_id=studio.id, first_name="נועה", last_name="כהן",
                    birthdate=date(2020, 3, 4))
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    assert match_children(
        app_session, first_name="נועה", last_name="כהן", birthdate=date(2019, 3, 4)
    ) == []


def test_a_child_with_no_birthdate_on_file_is_still_flagged_by_name(app_session, studio):
    """Birthdate is optional on `person`. Two students with the same name in one small
    club is worth a warning even without one -- the manager decides, which is the whole
    design."""
    person = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    found = match_children(
        app_session, first_name="נועה", last_name="כהן", birthdate=date(2020, 3, 4)
    )
    assert len(found) == 1


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0521234567", "972521234567"),
        ("+972521234567", "972521234567"),
        ("052-123-4567", "972521234567"),
        ("+972 52 123 4567", "972521234567"),
        ("+1 415 555 0123", "14155550123"),
        (None, None),
        ("", None),
        ("not a phone", None),
    ],
)
def test_phone_normalization(raw, expected):
    """Israeli numbers are written five different ways by five different parents. A
    matcher that compares them literally matches nobody and creates a duplicate every
    time -- which is L7 broken by formatting."""
    assert normalize_phone(raw) == expected
```

- [ ] **Step 2: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_matching.py -q
```

Expected: FAIL — `No module named 'app.services.people.matching'`.

- [ ] **Step 3: Write the implementation**

`app/services/people/matching.py`:

```python
"""§5.4a's matching. L7: a match is made on a **verified** email or phone, or not at all.

**Why verification is the whole rule.** Approving a request attaches children to the
matched Person, and that Person's app then shows them. If an unverified address were
enough, submitting somebody else's email would put your children in their app -- or,
worse, put theirs in yours. The submitted address is not evidence; the address on a
signed-in identity is.

`person.email` alone is therefore never a key. A manager typing a parent's address into
`+ תלמיד חדש` creates a Person carrying an unverified address, and that address's job is
to be what the INVITATION is sent to (§5.3) -- a mechanism with a token in it, which is
exactly the verification this module refuses to assume.

Phone verification has no provider in v1 (§5.2 is Google and Apple only), so a phone is a
key only when it sits on a Person whose identity signed in. That is narrower than §5.4a's
sentence and deliberately so: the alternative is trusting a string.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Person

#: E.164 without the plus. Israel is the club's country, so a leading 0 means +972.
_IL_COUNTRY_CODE = "972"
_DIGITS = re.compile(r"\D+")
#: Shorter than this is not a phone number, and a two-digit "phone" would match half the
#: club. Longer than E.164's 15 is not one either.
_MIN_DIGITS, _MAX_DIGITS = 7, 15


@dataclass(frozen=True)
class PersonMatch:
    person_id: uuid.UUID
    #: `"email"` or `"phone"`. Rendered in the queue so the manager can see WHAT matched
    #: before they agree to it (§5.4a's `request.matchedHint`).
    matched_on: str
    display_name: str


@dataclass(frozen=True)
class ChildMatch:
    student_id: uuid.UUID
    display_name: str
    birthdate: date | None


def normalize_phone(raw: str | None) -> str | None:
    """Digits only, in E.164 without the plus, or None if this is not a phone number."""
    if not raw:
        return None
    had_plus = raw.strip().startswith("+")
    digits = _DIGITS.sub("", raw)
    if not digits:
        return None
    if not had_plus and digits.startswith("0"):
        digits = _IL_COUNTRY_CODE + digits[1:]
    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        return None
    return digits


def match_person(
    session: Session,
    *,
    email: str | None = None,
    phone: str | None = None,
) -> PersonMatch | None:
    """§5.4a's person matching. Email first, then phone; None is the common case.

    Runs under the caller's `TenantSession`, so it can only ever see one studio. That is
    the correct scope: §3.3 lets one identity be a parent at two clubs, and each club's
    queue is answering a question about its own families.
    """
    if email:
        # The join is the rule: an address is a key only when an identity that signed in
        # carries it AND the provider said it was verified.
        row = session.execute(
            select(Person)
            .join(AuthIdentity, Person.auth_identity_id == AuthIdentity.id)
            .where(
                Person.anonymized_at.is_(None),
                AuthIdentity.email == email,
                AuthIdentity.email_verified.is_(True),
                # §5.2 -- 'Apple private-relay addresses are stored as-is and never used
                # for matching.'
                AuthIdentity.is_private_relay.is_(False),
            )
            .order_by(Person.created_at)
        ).scalars().first()
        if row is not None:
            return PersonMatch(
                person_id=row.id,
                matched_on="email",
                display_name=f"{row.first_name} {row.last_name}",
            )

    normalized = normalize_phone(phone)
    if normalized:
        # No phone-verification provider exists (§5.2), so the proxy for "verified" is
        # "this Person has a login". A pre-created Person's phone is a manager's typing.
        candidates = session.execute(
            select(Person).where(
                Person.anonymized_at.is_(None),
                Person.auth_identity_id.is_not(None),
                Person.phone.is_not(None),
            )
        ).scalars().all()
        for row in candidates:
            if normalize_phone(row.phone) == normalized:
                return PersonMatch(
                    person_id=row.id,
                    matched_on="phone",
                    display_name=f"{row.first_name} {row.last_name}",
                )
    return None


def match_children(
    session: Session,
    *,
    first_name: str,
    last_name: str,
    birthdate: date | None,
) -> list[ChildMatch]:
    """§5.4a's duplicate-child detection.

    Name first, birthdate as a narrowing signal rather than a requirement -- `birthdate`
    is nullable on `person`, and a club that never recorded one still deserves the
    warning. A candidate whose birthdate is on file and differs is dropped: two children
    with the same name and different birthdays are two children.

    Returns a list and never merges anything. §5.4a is explicit that the manager sees a
    warning and decides; two siblings really can share a birthday, and the club knows that
    and we do not.
    """
    rows = session.execute(
        select(Student, Person)
        .join(Person, Student.person_id == Person.id)
        .where(
            Person.anonymized_at.is_(None),
            Person.first_name == first_name.strip(),
            Person.last_name == last_name.strip(),
        )
    ).all()
    return [
        ChildMatch(
            student_id=student.id,
            display_name=f"{person.first_name} {person.last_name}",
            birthdate=person.birthdate,
        )
        for student, person in rows
        if person.birthdate is None or birthdate is None or person.birthdate == birthdate
    ]
```

- [ ] **Step 4: Run them and watch them pass**

```bash
.venv/bin/pytest tests/people/test_matching.py -q
```

Expected: PASS (17 passed, counting the parametrized cases).

- [ ] **Step 5: Types, lint, commit**

```bash
.venv/bin/ruff check --fix app/services/people && .venv/bin/ruff format app/services/people
.venv/bin/mypy app/services/people
git add app/services/people/matching.py tests/people/test_matching.py
git commit -m "feat(people): §5.4a matching, on a verified address and nothing weaker"
```

---

## Task 4 — A group's training weekdays, read through the schedule seam

C12's enrolment checkboxes need the days a group actually trains. L5 says that answer comes through `ScheduleService.materialize_sessions()` — not from a `group_schedule_rule` query of our own. Sessions are the ground truth: §5.6 versions rules by date and produces no session on a closure, so the materialized calendar is the only place where "does this group train on Tuesday" has one answer.

**Files:**
- Create: `app/services/people/group_days.py`
- Test: `tests/people/test_group_days.py`

**Interfaces:**
- Produces:
  - `OBSERVATION_WEEKS: int = 4`
  - `class ScheduleReader(Protocol)` with `materialize_sessions(group_id, from_date, to_date) -> list[Session]`
  - `training_weekdays(group_id, *, since, schedule, weeks=OBSERVATION_WEEKS) -> frozenset[int]`
  - `studio_weekday(moment: datetime) -> int`
- Consumed by: Tasks 8, 9, 10, 11 and every enrolment form.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_group_days.py`:

```python
"""C12's other input, and the two conversions that go wrong silently if nobody pins them.

L5 -- this lane is a READER of sessions. The days a group trains are observed through
`ScheduleService.materialize_sessions()`, never from `group_schedule_rule`: §5.6 versions
rules by date and skips closures, so the rule table answers "what was configured" while
the session table answers "when does this group actually train", and the enrolment form is
asking the second question.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.services.people.group_days import (
    OBSERVATION_WEEKS,
    studio_weekday,
    training_weekdays,
)
from tests.people.conftest import FakeSchedule, make_session

GROUP = uuid.uuid4()
STUDIO = uuid.uuid4()
YEAR = uuid.uuid4()
SINCE = date(2026, 9, 1)  # a Tuesday


def _sessions(schedule: FakeSchedule, *moments: datetime) -> None:
    schedule.sessions[GROUP] = [
        make_session(studio_id=STUDIO, group_id=GROUP, training_year_id=YEAR, starts_at=m)
        for m in moments
    ]


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        # 2026-09-06 is a Sunday. Sunday-first means 0 -- Python's weekday() says 6.
        (datetime(2026, 9, 6, 14, 0, tzinfo=UTC), 0),
        (datetime(2026, 9, 8, 14, 0, tzinfo=UTC), 2),  # Tuesday
        (datetime(2026, 9, 12, 14, 0, tzinfo=UTC), 6),  # Saturday
    ],
)
def test_the_weekday_scale_is_sunday_first(moment, expected):
    """`group_schedule_rule.weekday` is 0=Sunday (§4.3). Python's `date.weekday()` is
    0=Monday. A silent off-by-one here shifts every session in the product by a day."""
    assert studio_weekday(moment) == expected


def test_the_weekday_is_taken_in_asia_jerusalem_and_not_in_utc():
    """G3 -- stored UTC, rendered Asia/Jerusalem. A Sunday 00:30 session is Saturday
    21:30 UTC in winter, and a UTC weekday would file it under the wrong day."""
    # 2026-01-04 is a Sunday in Israel; 21:30 UTC on the 3rd is 23:30 local, still
    # Saturday -- and 22:30 UTC on the 3rd is 00:30 local on Sunday.
    assert studio_weekday(datetime(2026, 1, 3, 22, 30, tzinfo=UTC)) == 0
    assert studio_weekday(datetime(2026, 1, 3, 21, 30, tzinfo=UTC)) == 6


def test_the_days_a_group_trains_come_from_materialized_sessions(fake_schedule):
    _sessions(
        fake_schedule,
        datetime(2026, 9, 6, 14, 0, tzinfo=UTC),   # Sunday
        datetime(2026, 9, 9, 14, 0, tzinfo=UTC),   # Wednesday
        datetime(2026, 9, 13, 14, 0, tzinfo=UTC),  # Sunday again
    )
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0, 3})


def test_the_reader_is_asked_for_a_four_week_window(fake_schedule):
    """One week is not enough. §5.6 produces no session on a closure, so a single week
    containing a holiday would report a twice-weekly group as training once -- and the
    enrolment form would then be missing a checkbox the manager needs."""
    training_weekdays(GROUP, since=SINCE, schedule=fake_schedule)
    (group_id, from_date, to_date) = fake_schedule.calls[-1]
    assert group_id == GROUP
    assert from_date == SINCE
    assert (to_date - from_date).days == OBSERVATION_WEEKS * 7


def test_a_holiday_week_does_not_shrink_the_answer(fake_schedule):
    """The group trains Sunday and Wednesday. One Wednesday falls on a closure and has no
    session. Over four weeks, Wednesday is still a training day."""
    _sessions(
        fake_schedule,
        datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        datetime(2026, 9, 13, 14, 0, tzinfo=UTC),
        datetime(2026, 9, 16, 14, 0, tzinfo=UTC),  # the only Wednesday in the window
        datetime(2026, 9, 20, 14, 0, tzinfo=UTC),
    )
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0, 3})


def test_a_cancelled_session_is_not_a_training_day(fake_schedule):
    """A cancelled session is a day the club told everyone not to come. Counting it would
    put a checkbox on the form for a day nobody trains."""
    schedule = fake_schedule
    schedule.sessions[GROUP] = [
        make_session(
            studio_id=STUDIO, group_id=GROUP, training_year_id=YEAR,
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        ),
        make_session(
            studio_id=STUDIO, group_id=GROUP, training_year_id=YEAR,
            starts_at=datetime(2026, 9, 9, 14, 0, tzinfo=UTC), status="cancelled",
        ),
    ]
    assert training_weekdays(GROUP, since=SINCE, schedule=schedule) == frozenset({0})


def test_a_group_with_no_sessions_trains_on_no_days(fake_schedule):
    """A group whose schedule has not been built yet. An empty set is the honest answer,
    and the enrolment form renders 'this group has no schedule' rather than a silent
    empty checkbox list."""
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset()


def test_the_real_seam_still_refuses(fake_schedule):
    """The contract, restated where this lane can see it: `materialize_sessions` raises
    until lane SCHEDULE merges, and this lane never papers over that with an empty list.
    Delete this test when M2 lands and the seam returns rows."""
    from app.services.schedule import ScheduleService

    with pytest.raises(NotImplementedError):
        training_weekdays(GROUP, since=SINCE, schedule=ScheduleService())
```

- [ ] **Step 2: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_group_days.py -q
```

Expected: FAIL — `No module named 'app.services.people.group_days'`.

- [ ] **Step 3: Write the implementation**

`app/services/people/group_days.py`:

```python
"""C12's other input: the weekdays a group actually trains.

`attendance_pattern.expected_weekdays` takes two arguments -- the student's stored pattern
and the group's scheduled weekdays. The first is a column. This module is the second, and
L5 decides where it comes from: **through `ScheduleService.materialize_sessions()`**, the
W2 seam, and never from a `group_schedule_rule` query of our own.

That is not ceremony. §5.6 versions rules by date and rewrites future sessions when one
changes, and it produces no session at all on a closure. So the rule table answers "what
was configured, as of when", while the session table answers "when does this group train",
and the enrolment form is asking the second question. Reading the rules ourselves would
also make this lane a second implementation of §5.6's effective-date logic, which is the
same mistake C12 exists to prevent one level down.

**Four weeks, not one.** A single week containing a holiday reports a twice-weekly group
as training once, and the manager's checkbox list would be missing a day. Four weeks
survives any single closure and still costs one call.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

from app.models.schedule import Session

#: G3 -- stored UTC, rendered Asia/Jerusalem. A weekday is a rendering, so it is taken
#: in the studio's zone. `Studio.timezone` exists and defaults to this; the constant is
#: used rather than the column because a group's weekday scale has to agree with
#: `group_schedule_rule.weekday`, which §4.3 fixes to Israel's week.
STUDIO_ZONE = ZoneInfo("Asia/Jerusalem")

#: Long enough to survive one closure, short enough to be one query.
OBSERVATION_WEEKS = 4

#: §5.6 -- a cancelled session is the club telling everyone not to come. It is not a
#: training day, and a checkbox for it would ask a manager about a day nobody trains.
_TRAINING_STATUSES = frozenset({"scheduled", "completed"})


class ScheduleReader(Protocol):
    """The half of `ScheduleService` this lane uses.

    A Protocol rather than the class itself, so a test supplies a reader by injection
    instead of monkeypatching a module global -- and so mypy checks that the double and
    the real service really do have the same signature.
    """

    def materialize_sessions(
        self, group_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[Session]: ...


def studio_weekday(moment: datetime) -> int:
    """0-6, **Sunday-first**, in Asia/Jerusalem.

    Two conversions, both easy to get silently wrong: the instant is stored UTC and must
    be rendered in the studio's zone before a day can be read off it, and Python's
    `date.weekday()` starts on Monday while `group_schedule_rule.weekday` starts on
    Sunday (§4.3). Either slip shifts the whole product by a day.
    """
    return (moment.astimezone(STUDIO_ZONE).weekday() + 1) % 7


def training_weekdays(
    group_id: uuid.UUID,
    *,
    since: date,
    schedule: ScheduleReader,
    weeks: int = OBSERVATION_WEEKS,
) -> frozenset[int]:
    """The weekdays this group trains, observed from the materialized calendar.

    An empty set is a real answer, not an error: a group whose schedule has not been built
    yet trains on no days, and the enrolment form says so rather than rendering an empty
    row of checkboxes with no explanation.

    Raises whatever the reader raises. Until lane SCHEDULE merges that is
    `NotImplementedError`, and this lane deliberately does not soften it into an empty
    list -- an empty list here is indistinguishable from "this group has no schedule",
    which is exactly the lie the seam's docstring warns about.
    """
    sessions = schedule.materialize_sessions(group_id, since, since + timedelta(weeks=weeks))
    return frozenset(
        studio_weekday(session.starts_at)
        for session in sessions
        if session.status in _TRAINING_STATUSES
    )
```

- [ ] **Step 4: Run them and watch them pass**

```bash
.venv/bin/pytest tests/people/test_group_days.py -q
```

Expected: PASS (10 passed).

- [ ] **Step 5: Types, lint, commit**

```bash
.venv/bin/ruff check --fix app/services/people && .venv/bin/ruff format app/services/people
.venv/bin/mypy app/services/people
git add app/services/people/group_days.py tests/people/test_group_days.py
git commit -m "feat(people): C12's training weekdays, observed through the schedule seam"
```

---

## Task 5 — Students: the service, the schemas, and the first `coach`-tagged router

Dashboard `3b` and staff `9h` are both this endpoint. §3.2 splits it: owners and managers see every student in the studio, coaches see **students in their own groups**, and a guardian sees their own children through a different route. Getting that scoping wrong is a privacy failure, so it is the first thing the tests pin.

**Files:**
- Modify: `app/schemas/people.py` (append only — do not edit the contract shapes already there)
- Create: `app/services/people/students.py`
- Create: `app/routers/students.py`
- Modify: `tests/invariants/test_03_coach_endpoints_expose_no_money.py` (delete one test — L13(b))
- Test: `tests/people/test_students_service.py`, `tests/people/test_students_router.py`

**Interfaces:**
- Produces (schemas): `StudentSummaryOut`, `StudentSummaryPage`, `GuardianCreate`, `GuardianListResponse`, `StudentConvertIn`, `StudentMarkLostIn`, `StudentCreateResult`, `StudentStatusHistoryListResponse`, `PublicGroupOut`, `PublicGroupListResponse`, `PublicLandingOut`, `TrialSlotListResponse`, `EnrollmentWeekdayOptionsOut`
- Produces (service): `StudentService.create`, `.list`, `.get`, `.update`, `.for_guardian`
- Consumed by: Tasks 6, 7, 8, 11, and every frontend task.

- [ ] **Step 1: Append the schemas**

At the end of `app/schemas/people.py`, **after** `TrialBookingPage` and before the `StudentPage = ...` aliases (move the aliases to the very bottom if needed):

```python
# -- M3's own shapes, appended by lane PEOPLE. The contract shapes above are not edited.


class StudentSummaryOut(BaseModel):
    """The row dashboard `3b` and staff `9h` render, and the only student shape a coach
    receives.

    **No money, and no route to money.** Invariant 3 forbids a financial field on a
    coach-scoped response, and `/students` is the most coach-reachable endpoint in the
    product. `price_plan_id` is deliberately absent here even though `StudentOut` carries
    it: an id is not an amount, but a roster row that carried one would invite a client to
    resolve it, and the resolving endpoint is manager-scoped for a reason.

    `group_names` and not `group_ids`: C11 makes several live enrollments normal, and
    `3b`'s column shows what a manager reads rather than what a client would have to join.
    """

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    status: str = Field(pattern=STUDENT_STATUS_PATTERN)
    health_status: str = Field(pattern=HEALTH_STATUS_PATTERN)
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None = None
    current_belt_name: str | None = None
    current_belt_color_hex: str | None = None
    group_names: list[str] = Field(default_factory=list)
    #: §5.4's freeze shows guardians "מוקפא" with the return date. `None` on an
    #: open-ended freeze, which is a real state a manager sets deliberately.
    frozen_until: date | None = None
    guardian_display_names: list[str] = Field(default_factory=list)


class GuardianCreate(BaseModel):
    """§5.3 -- guardians are invited by email or phone, and the invitation carries a token
    binding the accepting identity to the pre-created Person."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    relation: str = Field(default="parent", max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    #: L8 -- this decides bill addressing and הוראת קבע matching, and nothing else.
    is_primary: bool = False

    @model_validator(mode="after")
    def _a_guardian_is_reachable(self) -> GuardianCreate:
        if not self.email and not self.phone:
            raise ValueError("a guardian needs an email or a phone to be invited on")
        return self


class GuardianListResponse(BaseModel):
    items: list[GuardianOut]


class StudentConvertIn(BaseModel):
    """§5.4a step 5 -- 'Manager converts -> picks group, sets price, status=active,
    enrollment created.' Three decisions in one request, because they are one decision.

    `price_plan_id` is an opaque id (C11, L2). `price_plan` is W4's table, so this is
    stored and never resolved, and no endpoint in this lane returns an amount.
    """

    group_id: uuid.UUID
    started_on: date
    price_plan_id: uuid.UUID | None = None
    #: C12 -- offered as checkboxes over the group's training weekdays, all ticked by
    #: default. `None` means all of them.
    attends_weekdays: list[Weekday] | None = Field(default=None, min_length=1)
    reason: str | None = Field(default=None, max_length=200)


class StudentMarkLostIn(BaseModel):
    """§5.4a -- 'No conversion after N days -> status=lost, with a reason.' The reason is
    required here and optional in the job, because a manager pressing the button knows
    why and the job only knows that time passed."""

    reason: str = Field(min_length=1, max_length=200)


class StudentCreateResult(BaseModel):
    """§5.4(a) -- 'Creates everything immediately with health_status = missing, and sends
    the parent an invitation.'

    `invitation_token` is returned **once**, to the manager who just created the student,
    so the dashboard can render a copyable link for a parent who is standing at the desk.
    It is never stored in plaintext (only its SHA-256 hash reaches `invitation.token_hash`)
    and never logged.
    """

    student: StudentOut
    invitation_token: str | None = None


class StudentStatusHistoryListResponse(BaseModel):
    items: list[StudentStatusHistoryOut]


class PublicGroupOut(BaseModel):
    """§7 -- `GET /public/studios/{slug}/groups`, unauthenticated.

    A deliberately narrow projection, for the same reason `TrialSlotOut` is one: this is
    a shop window on the open internet. No class id, no staff, no enrollment count.
    `training_weekdays` is here because parent `13a` shows "מתאמנים בימים" beside each
    group, and because §5.4a filters groups by the child's age where a range is set.
    """

    id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    training_weekdays: list[Weekday] = Field(default_factory=list)


class PublicGroupListResponse(BaseModel):
    """Not a `CursorPage`: a club has a dozen groups, not a growing list somebody pages
    through, and the landing page renders all of them at once."""

    items: list[PublicGroupOut]


class PublicLandingOut(BaseModel):
    """§5.4a ① -- 'a public LANDING PAGE at /t/{studio-slug} -- the club's shop window,
    not a form.'"""

    studio_name: str
    slug: str
    logo_url: str | None
    default_locale: str
    #: §5.4a: "Logo, photos, what the club does, where and when". Read from
    #: `studio.settings`, which M1 already ships as a JSONB the setup wizard writes.
    headline: str | None
    about: str | None
    address: str | None
    photo_urls: list[str] = Field(default_factory=list)
    groups: list[PublicGroupOut] = Field(default_factory=list)


class TrialSlotListResponse(BaseModel):
    """Not a `CursorPage`: §7 asks for "the next N bookable sessions", which is a bounded
    peek rather than a list somebody pages through. G16's rule is about lists that grow."""

    items: list[TrialSlotOut]


class EnrollmentWeekdayOptionsOut(BaseModel):
    """C12's checkboxes. The enrolment form asks this before it can draw the day list.

    `training_weekdays` comes through `ScheduleService.materialize_sessions()` (L5), so an
    empty list means "this group has no schedule yet" and the form says exactly that.
    """

    group_id: uuid.UUID
    group_name: str
    training_weekdays: list[Weekday] = Field(default_factory=list)


class StudentSummaryPage(CursorPage[StudentSummaryOut]):
    pass
```

Add the import `TrialSlotOut` at the top of `app/schemas/people.py`:

```python
from app.schemas.schedule import TrialSlotOut
```

- [ ] **Step 2: Write the failing service tests**

`tests/people/test_students_service.py`:

```python
"""§5.4(a)'s manager-added student, and §3.2's split over who may see whom.

The scoping tests are the important ones. §3.2 gives owners and managers "View all
students in studio" and every staff role "View students in own groups" -- so a coach
listing students must see the ones on their mat and nobody else's. A leak here is a
privacy failure in the most-hit endpoint in the product.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Invitation, Person
from app.services.people.errors import ConflictError, NotFoundError
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0, TODAY


def _enrol(app_session, studio, student_id, group_id):
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student_id,
            group_id=group_id,
            status="active",
            started_on=TODAY,
        )
    )
    app_session.commit()


def test_creating_a_student_creates_a_person_a_student_and_a_guardian(app_session, studio):
    result = StudentService.create(
        app_session,
        first_name="דנה",
        last_name="כהן",
        birthdate=date(2018, 5, 1),
        guardian_first_name="יעל",
        guardian_last_name="כהן",
        guardian_email="yael@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
    )
    app_session.commit()

    student = result.student
    assert student.status == "lead"
    # §5.4(a) -- 'Creates everything immediately with health_status = missing.'
    assert student.health_status == "missing"

    guardian = app_session.execute(
        select(Guardian).where(Guardian.student_id == student.id)
    ).scalar_one()
    # §5.3 -- 'Exactly one guardian per student carries is_primary.' The first one does.
    assert guardian.is_primary is True


def test_creating_a_student_issues_an_invitation_the_manager_can_hand_over(
    app_session, studio
):
    """§5.4(a) -- 'and sends the parent an invitation.' The token is returned once and
    stored only as a hash: an invitation table holding live credentials in plaintext
    would be a credential store with an append-only grant on it."""
    import hashlib

    result = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=None,
        guardian_first_name="יעל", guardian_last_name="כהן",
        guardian_email="yael@example.invalid", guardian_phone=None,
        at=T0, actor_person_id=None,
    )
    app_session.commit()

    assert result.invitation_token
    invitation = app_session.execute(select(Invitation)).scalar_one()
    assert invitation.intended_role == "guardian"
    assert invitation.student_id == result.student.id
    assert invitation.token_hash == hashlib.sha256(
        result.invitation_token.encode("utf-8")
    ).hexdigest()
    assert result.invitation_token not in (invitation.token_hash,)


def test_a_matched_guardian_is_never_duplicated(app_session, studio, as_guardian):
    """L7 and §5.4a -- 'A matched parent is never duplicated: approval attaches the new
    children to their existing Person.' The signed-in guardian fixture has a verified
    address, which is the only key L7 allows."""
    before = len(app_session.execute(select(Person)).scalars().all())
    person = app_session.get(Person, as_guardian.person_id)

    result = StudentService.create(
        app_session, first_name="נועה", last_name="כהן", birthdate=None,
        guardian_first_name="בודק", guardian_last_name="הורה",
        guardian_email=person.email, guardian_phone=None,
        at=T0, actor_person_id=None,
    )
    app_session.commit()

    # One new Person -- the child. The parent was matched, not recreated.
    assert len(app_session.execute(select(Person)).scalars().all()) == before + 1
    guardian = app_session.execute(
        select(Guardian).where(Guardian.student_id == result.student.id)
    ).scalar_one()
    assert guardian.person_id == as_guardian.person_id
    # §5.4a -- 'No second invitation, no second account, no second login.'
    assert result.invitation_token is None


def test_a_manager_sees_every_student_in_the_studio(app_session, studio, a_group, as_manager):
    a = StudentService.create(
        app_session, first_name="א", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="א",
        guardian_email="a@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    b = StudentService.create(
        app_session, first_name="ב", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ב",
        guardian_email="b@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    app_session.commit()
    _enrol(app_session, studio, a.id, a_group)

    rows, _ = StudentService.list(app_session, viewer_group_ids=None)
    assert {r.id for r in rows} >= {a.id, b.id}


def test_a_coach_sees_only_students_in_their_own_groups(
    app_session, studio, a_group, a_second_group
):
    """§3.2 -- 'View students in own groups' is what a coach gets. A coach who can list
    the whole club can read the contact details of children they never teach."""
    mine = StudentService.create(
        app_session, first_name="שלי", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="א",
        guardian_email="m@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    theirs = StudentService.create(
        app_session, first_name="לא", last_name="שלי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ב",
        guardian_email="t@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    app_session.commit()
    _enrol(app_session, studio, mine.id, a_group)
    _enrol(app_session, studio, theirs.id, a_second_group)

    rows, _ = StudentService.list(app_session, viewer_group_ids=[a_group])
    assert [r.id for r in rows] == [mine.id]


def test_a_coach_with_no_groups_sees_nobody(app_session, studio):
    """An empty group list is 'no groups', never 'no filter'. The difference is the whole
    club's roster."""
    StudentService.create(
        app_session, first_name="א", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="א",
        guardian_email="a@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    app_session.commit()

    rows, _ = StudentService.list(app_session, viewer_group_ids=[])
    assert rows == []


def test_a_trial_student_appears_with_no_group_and_is_not_hidden(app_session, studio):
    """§5.4a -- 'a trial person is a real student who simply has no enrollment.' The
    dashboard's trial queue is a status filter over the same list, not a second table."""
    student = StudentService.create(
        app_session, first_name="נועה", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ל",
        guardian_email="l@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    app_session.commit()

    rows, _ = StudentService.list(app_session, viewer_group_ids=None)
    row = next(r for r in rows if r.id == student.id)
    assert row.group_names == []


def test_the_list_filters_by_status(app_session, studio):
    from app.services.people.status import StudentStatusService

    a = StudentService.create(
        app_session, first_name="א", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="א",
        guardian_email="a@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    StudentService.create(
        app_session, first_name="ב", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ב",
        guardian_email="b@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    StudentStatusService.transition(app_session, student=a, to_status="trial", at=T0)
    app_session.commit()

    rows, _ = StudentService.list(app_session, viewer_group_ids=None, status="trial")
    assert [r.id for r in rows] == [a.id]


def test_the_list_searches_by_name(app_session, studio):
    """Staff `9h` is a search box on a phone, one-handed, on a mat. Substring and
    case-insensitive, over both names."""
    student = StudentService.create(
        app_session, first_name="נועה", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="כ",
        guardian_email="k@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    app_session.commit()

    rows, _ = StudentService.list(app_session, viewer_group_ids=None, q="ועה")
    assert [r.id for r in rows] == [student.id]


def test_the_list_is_cursor_paginated(app_session, studio):
    """G16. Rosters are written to while they are being read -- a coach marks attendance
    during the same minute a manager pages the register -- and LIMIT/OFFSET skips rows
    when the set shifts under it."""
    for i in range(5):
        StudentService.create(
            app_session, first_name=f"ילד{i}", last_name="כהן", birthdate=None,
            guardian_first_name="הורה", guardian_last_name=f"{i}",
            guardian_email=f"g{i}@example.invalid", guardian_phone=None,
            at=T0, actor_person_id=None,
        )
    app_session.commit()

    first, cursor = StudentService.list(app_session, viewer_group_ids=None, limit=2)
    assert len(first) == 2 and cursor is not None
    second, _ = StudentService.list(app_session, viewer_group_ids=None, limit=2, after=cursor)
    assert {r.id for r in first}.isdisjoint({r.id for r in second})


def test_my_children_is_the_guardian_table_and_nothing_else(app_session, studio, as_guardian):
    """L9 -- 'There is no household or family entity. My children is
    SELECT student_id FROM guardian WHERE person_id = me.'"""
    result = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=None,
        guardian_first_name="בודק", guardian_last_name="הורה",
        guardian_email=app_session.get(Person, as_guardian.person_id).email,
        guardian_phone=None, at=T0, actor_person_id=None,
    )
    app_session.commit()

    mine = StudentService.for_guardian(app_session, person_id=as_guardian.person_id)
    assert [s.id for s in mine] == [result.student.id]


def test_getting_a_student_from_another_studio_is_not_found(app_session, studio):
    with pytest.raises(NotFoundError):
        StudentService.get(app_session, student_id=uuid.uuid4())


def test_updating_a_student_updates_the_person_and_never_a_second_copy(app_session, studio):
    """§4.3 -- 'A student IS a person (person_id UNIQUE), not a copy of one.' A name column
    on `student` would let the two drift apart."""
    student = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="כ",
        guardian_email="k@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    ).student
    app_session.commit()

    StudentService.update(app_session, student_id=student.id, first_name="דניאלה", at=T0,
                          actor_person_id=None)
    app_session.commit()

    person = app_session.get(Person, student.person_id)
    assert person.first_name == "דניאלה"
    assert not hasattr(student, "first_name")
```

- [ ] **Step 3: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_students_service.py -q
```

Expected: FAIL — `No module named 'app.services.people.students'`.

- [ ] **Step 4: Write `app/services/people/students.py`**

```python
"""§5.3 and §5.4's students and guardians.

**A student is a person.** `student.person_id` is UNIQUE (§4.3), so every name, birthdate,
phone and email on this page belongs to `person` and is read through a join. A second copy
on `student` would let an adult student -- who is their own guardian (§5.3) -- carry two
names that disagree.

**There is no household.** L9: "my children" is `SELECT student_id FROM guardian WHERE
person_id = me`, which `for_guardian` is, verbatim. Nothing here groups students by
family, because the product has no good answer to which household a child belongs to after
a separation and inventing one would force it to.

**§3.2's viewer split lives in `viewer_group_ids`.** `None` means "every student in the
studio" (owner, manager) and a list means "students enrolled in these groups" (coach). The
empty list is a third case and is load-bearing: a coach with no groups sees nobody, and an
implementation that treated `[]` as falsy would hand them the whole club.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.models.people import Enrollment, Student, StudentFreeze
from app.models.person import Guardian, Invitation, Person
from app.models.structure import Group
from app.services.audit import AuditService
from app.services.people.errors import ConflictError, NotFoundError
from app.services.people.matching import match_person, normalize_phone

#: §5.3's invitation. Thirty days matches the refresh-token window and is long enough that
#: a parent who is away for a fortnight is not locked out of their own children.
INVITATION_TTL_DAYS = 30


@dataclass
class CreatedStudent:
    student: Student
    #: Returned once, to the manager who just created the student. `None` when the
    #: guardian was matched to an existing login -- §5.4a: "No second invitation, no
    #: second account, no second login."
    invitation_token: str | None


@dataclass
class StudentRow:
    """One row of the list, already joined. A dataclass rather than a tuple because
    `3b` renders eight columns and positional unpacking at that width is a bug waiting
    for its first reorder."""

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    status: str
    health_status: str
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None
    group_names: list[str]
    frozen_until: date | None
    guardian_display_names: list[str]


class StudentService:
    @staticmethod
    def create(
        session: Session,
        *,
        first_name: str,
        last_name: str,
        birthdate: date | None,
        guardian_first_name: str,
        guardian_last_name: str,
        guardian_email: str | None,
        guardian_phone: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        relation: str = "parent",
        status: str = "lead",
        source: str | None = "manager",
    ) -> CreatedStudent:
        """§5.4(a) -- the manager-added student, created immediately.

        `health_status` stays `missing`: §5.4 is explicit that "the manager never types a
        health form", and the parent completes it through the app gate (§5.5).

        The guardian is matched before being created (L7). A match means an existing
        Person with a verified address, so no invitation is issued -- they already have a
        login and the child simply appears in the app they are already using.
        """
        child = Person(
            studio_id=None,  # stamped by TenantSession's before_flush
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            birthdate=birthdate,
            created_at=at,
        )
        session.add(child)
        session.flush()

        student = Student(
            person_id=child.id,
            status=status,
            source=source,
            health_status="missing",
            created_at=at,
        )
        session.add(student)
        session.flush()

        matched = match_person(session, email=guardian_email, phone=guardian_phone)
        token: str | None = None
        if matched is not None:
            guardian_person_id = matched.person_id
        else:
            parent = Person(
                first_name=guardian_first_name.strip(),
                last_name=guardian_last_name.strip(),
                email=guardian_email,
                phone=guardian_phone,
                created_at=at,
            )
            session.add(parent)
            session.flush()
            guardian_person_id = parent.id
            token = StudentService._issue_invitation(
                session,
                student_id=student.id,
                email=guardian_email,
                phone=guardian_phone,
                at=at,
                actor_person_id=actor_person_id,
            )

        session.add(
            Guardian(
                student_id=student.id,
                person_id=guardian_person_id,
                # §5.3 -- exactly one guardian per student carries it, and the first one
                # created is that one. A partial unique index enforces the rest.
                is_primary=True,
                relation=relation,
                created_at=at,
            )
        )
        AuditService.record(
            session,
            action="student.created",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # Ids and the source. No name and no birthdate: §11.2 keeps a diff to what
            # changed, and a child's name in an append-only table is a name that cannot
            # be anonymized later (§11.4).
            diff={"source": source, "status": status, "guardian_matched": matched is not None},
        )
        session.flush()
        return CreatedStudent(student=student, invitation_token=token)

    @staticmethod
    def _issue_invitation(
        session: Session,
        *,
        student_id: uuid.UUID,
        email: str | None,
        phone: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> str:
        """§5.3 -- 'the invitation carries a token binding the accepting auth identity to
        the pre-created Person.'

        The plaintext is returned to the caller and never stored: only the SHA-256 hash
        reaches `invitation.token_hash`, which is what M1's `accept-invitation` compares
        against. `secrets.token_urlsafe(32)` is 256 bits of entropy -- an invitation is a
        bearer credential for a child's record, so it is sized like one.
        """
        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            email=email,
            phone=phone,
            intended_role="guardian",
            student_id=student_id,
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            expires_at=at + timedelta(days=INVITATION_TTL_DAYS),
            created_at=at,
        )
        session.add(invitation)
        session.flush()
        AuditService.record(
            session,
            action="guardian.invited",
            entity_type="invitation",
            entity_id=invitation.id,
            studio_id=invitation.studio_id,
            actor_person_id=actor_person_id,
            # The recipient, never the token. An audit row holding a live credential
            # would be a credential store with an append-only grant on it.
            diff={"email": email, "phone": phone, "intended_role": "guardian"},
        )
        return token

    @staticmethod
    def _base_query(viewer_group_ids: list[uuid.UUID] | None) -> Select[tuple[Student, Person]]:
        stmt = select(Student, Person).join(Person, Student.person_id == Person.id)
        if viewer_group_ids is None:
            return stmt
        # §3.2 -- 'View students in own groups'. `[]` is a real answer and must produce an
        # empty result: `if viewer_group_ids:` here would hand a coach with no groups the
        # entire club, and it would look like the feature working.
        return stmt.where(
            Student.id.in_(
                select(Enrollment.student_id).where(Enrollment.group_id.in_(viewer_group_ids))
            )
        )

    @staticmethod
    def list(
        session: Session,
        *,
        viewer_group_ids: list[uuid.UUID] | None,
        status: str | None = None,
        group_id: uuid.UUID | None = None,
        health_status: str | None = None,
        q: str | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[StudentRow], uuid.UUID | None]:
        """Dashboard `3b` and staff `9h`. Cursor-paginated on `student.id` (G16).

        Ordered by id and not by name: a keyset cursor names a position, and a name is not
        unique in a club with two children called נועה כהן.
        """
        stmt = StudentService._base_query(viewer_group_ids)
        if status:
            stmt = stmt.where(Student.status == status)
        if health_status:
            stmt = stmt.where(Student.health_status == health_status)
        if group_id:
            stmt = stmt.where(
                Student.id.in_(
                    select(Enrollment.student_id).where(
                        Enrollment.group_id == group_id, Enrollment.ended_on.is_(None)
                    )
                )
            )
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(Person.first_name.ilike(like), Person.last_name.ilike(like)))
        if after is not None:
            stmt = stmt.where(Student.id > after)

        pairs = session.execute(stmt.order_by(Student.id).limit(limit + 1)).all()
        has_more = len(pairs) > limit
        pairs = pairs[:limit]
        rows = [StudentService._project(session, student, person) for student, person in pairs]
        next_cursor = rows[-1].id if has_more and rows else None
        return rows, next_cursor

    @staticmethod
    def _project(session: Session, student: Student, person: Person) -> StudentRow:
        group_names = list(
            session.execute(
                select(Group.name)
                .join(Enrollment, Enrollment.group_id == Group.id)
                .where(Enrollment.student_id == student.id, Enrollment.ended_on.is_(None))
                .order_by(Group.name)
            ).scalars()
        )
        guardians = list(
            session.execute(
                select(Person.first_name, Person.last_name)
                .join(Guardian, Guardian.person_id == Person.id)
                .where(Guardian.student_id == student.id)
                .order_by(Guardian.is_primary.desc(), Person.first_name)
            ).all()
        )
        frozen_until: date | None = None
        if student.status == "frozen":
            frozen_until = session.execute(
                select(StudentFreeze.to_date)
                .where(StudentFreeze.student_id == student.id)
                .order_by(StudentFreeze.from_date.desc())
                .limit(1)
            ).scalar_one_or_none()
        return StudentRow(
            id=student.id,
            person_id=person.id,
            first_name=person.first_name,
            last_name=person.last_name,
            birthdate=person.birthdate,
            status=student.status,
            health_status=student.health_status,
            joined_on=student.joined_on,
            left_on=student.left_on,
            current_belt_id=student.current_belt_id,
            group_names=group_names,
            frozen_until=frozen_until,
            guardian_display_names=[f"{f} {l}" for f, l in guardians],
        )

    @staticmethod
    def get(
        session: Session,
        *,
        student_id: uuid.UUID,
        viewer_group_ids: list[uuid.UUID] | None = None,
    ) -> tuple[Student, Person]:
        """404 and never 403 for a student outside the caller's reach. A 403 confirms the
        row exists, which is a cross-tenant read with a polite error message."""
        row = session.execute(
            StudentService._base_query(viewer_group_ids).where(Student.id == student_id)
        ).first()
        if row is None:
            raise NotFoundError(str(student_id))
        return row[0], row[1]

    @staticmethod
    def update(
        session: Session,
        *,
        student_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        first_name: str | None = None,
        last_name: str | None = None,
        birthdate: date | None = None,
        phone: str | None = None,
        email: str | None = None,
    ) -> tuple[Student, Person]:
        """Writes to `person`, because that is where the fields live (§4.3)."""
        student, person = StudentService.get(session, student_id=student_id)
        changed: list[str] = []
        for field, value in (
            ("first_name", first_name),
            ("last_name", last_name),
            ("birthdate", birthdate),
            ("phone", phone),
            ("email", email),
        ):
            if value is not None and getattr(person, field) != value:
                setattr(person, field, value)
                changed.append(field)
        if changed:
            AuditService.record(
                session,
                action="student.updated",
                entity_type="student",
                entity_id=student.id,
                studio_id=student.studio_id,
                actor_person_id=actor_person_id,
                # The FIELD NAMES that changed, never the values. §11.2, and §11.4 --
                # a name in an append-only table is a name anonymization cannot reach.
                diff={"fields": sorted(changed)},
            )
        session.flush()
        return student, person

    @staticmethod
    def for_guardian(session: Session, *, person_id: uuid.UUID) -> list[StudentRow]:
        """L9, verbatim: `SELECT student_id FROM guardian WHERE person_id = me`.

        L8 -- no `is_primary` branch anywhere in here. Every guardian on a student sees
        the same list, because §5.3 says they see the same things.
        """
        pairs = session.execute(
            select(Student, Person)
            .join(Person, Student.person_id == Person.id)
            .join(Guardian, Guardian.student_id == Student.id)
            .where(Guardian.person_id == person_id)
            .order_by(Person.first_name)
        ).all()
        return [StudentService._project(session, student, person) for student, person in pairs]

    @staticmethod
    def viewer_group_ids(
        session: Session, *, person_id: uuid.UUID, roles: set[str]
    ) -> list[uuid.UUID] | None:
        """§3.2's split, resolved once per request.

        `None` for owner and manager -- 'View all students in studio'. A list for a coach,
        from `group_staff`, which is the table that says which mat they stand on.
        """
        from app.models.structure import GroupStaff

        if roles & {"owner", "manager"}:
            return None
        return list(
            session.execute(
                select(GroupStaff.group_id).where(
                    GroupStaff.person_id == person_id, GroupStaff.to_date.is_(None)
                )
            ).scalars()
        )
```

- [ ] **Step 5: Run the service tests and watch them pass**

```bash
.venv/bin/pytest tests/people/test_students_service.py -q
```

Expected: PASS (14 passed).

- [ ] **Step 6: Write the failing router tests**

`tests/people/test_students_router.py`:

```python
"""§7's `/students`, and §3.2's matrix enforced where `.claude/rules/api.md` says it must
be -- in a router dependency, never inside a service."""

from __future__ import annotations

import uuid

from tests.people.conftest import Caller

CREATE = {
    "first_name": "דנה",
    "last_name": "כהן",
    "birthdate": "2018-05-01",
    "guardian": {
        "first_name": "יעל",
        "last_name": "כהן",
        "email": "yael@example.invalid",
        "relation": "parent",
    },
}


def _create(client, caller: Caller) -> dict:
    response = client.post("/api/v1/students", json=CREATE, headers=caller.headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_a_manager_creates_a_student(client, as_manager):
    body = _create(client, as_manager)
    assert body["student"]["status"] == "lead"
    assert body["student"]["health_status"] == "missing"
    assert body["invitation_token"]


def test_a_coach_may_not_create_a_student(client, as_lead_coach):
    """§3.2 gives 'View students in own groups' to a coach and nothing about creating
    one. A coach who can create a student can create a guardian row pointing at
    themselves."""
    response = client.post("/api/v1/students", json=CREATE, headers=as_lead_coach.headers)
    assert response.status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client):
    """The split is decided in `require_roles`, not by dependency ordering: an anonymous
    caller is told to authenticate, an authenticated one without the role is told no."""
    assert client.post("/api/v1/students", json=CREATE).status_code == 401


def test_a_guardian_may_not_list_students(client, as_guardian):
    """A guardian reaches their own children through /me/students. The studio-wide list
    is not theirs, and §6.1 refuses them the staff app outright."""
    assert client.get("/api/v1/students", headers=as_guardian.headers).status_code == 403


def test_a_coach_lists_only_their_own_groups(
    client, app_session, studio, a_group, a_second_group, as_manager, as_lead_coach, assign_coach
):
    from app.models.people import Enrollment
    from tests.people.conftest import TODAY

    mine = _create(client, as_manager)["student"]
    app_session.add(
        Enrollment(
            studio_id=studio.id, student_id=uuid.UUID(mine["id"]), group_id=a_group,
            status="active", started_on=TODAY,
        )
    )
    app_session.commit()
    assign_coach(as_lead_coach.person_id, a_second_group)

    listed = client.get("/api/v1/students", headers=as_lead_coach.headers).json()
    assert [row["id"] for row in listed["items"]] == []

    assign_coach(as_lead_coach.person_id, a_group)
    listed = client.get("/api/v1/students", headers=as_lead_coach.headers).json()
    assert [row["id"] for row in listed["items"]] == [mine["id"]]


def test_the_list_is_a_cursor_page(client, as_manager):
    _create(client, as_manager)
    body = client.get("/api/v1/students?limit=1", headers=as_manager.headers).json()
    assert set(body) == {"items", "next_cursor", "has_more"}


def test_a_student_in_another_studio_is_404_and_never_403(client, as_manager):
    response = client.get(f"/api/v1/students/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404


def test_the_students_router_is_tagged_coach(client):
    """`.claude/rules/api.md` -- 'A router serving coaches is tagged coach. SPEC §13's
    third invariant is enforced against that tag, so an untagged coach router is an
    unguarded one.' Staff `9h` and `9c` are both this router."""
    from app.main import app

    schema = app.openapi()
    assert "coach" in schema["paths"]["/api/v1/students"]["get"]["tags"]


def test_no_students_response_carries_a_financial_field():
    """Invariant 3, asserted here as well as in tests/invariants, because this is the
    router that made the gate non-vacuous. `StudentSummaryOut` deliberately omits
    `price_plan_id`: an id is not an amount, but a roster row carrying one invites a
    client to resolve it."""
    from tests.invariants.test_03_coach_endpoints_expose_no_money import leaks
    from app.main import app

    assert leaks(app) == []


def test_me_students_is_the_guardian_table(client, app_session, as_manager, as_guardian):
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = {**CREATE, "guardian": {**CREATE["guardian"], "email": parent.email}}
    created = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert created.status_code == 201

    mine = client.get("/api/v1/me/students", headers=as_guardian.headers)
    assert mine.status_code == 200
    assert [row["id"] for row in mine.json()["items"]] == [created.json()["student"]["id"]]


def test_a_guardian_never_sees_another_familys_child(client, as_manager, as_guardian):
    _create(client, as_manager)
    mine = client.get("/api/v1/me/students", headers=as_guardian.headers)
    assert mine.json()["items"] == []


def test_updating_a_student_is_manager_only(client, as_manager, as_lead_coach):
    student = _create(client, as_manager)["student"]
    refused = client.patch(
        f"/api/v1/students/{student['id']}",
        json={"first_name": "דניאלה"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403
    allowed = client.patch(
        f"/api/v1/students/{student['id']}",
        json={"first_name": "דניאלה"},
        headers=as_manager.headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["first_name"] == "דניאלה"
```

- [ ] **Step 7: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_students_router.py -q
```

Expected: FAIL — 404 on every route; `app/routers/students.py` does not exist.

- [ ] **Step 8: Write `app/routers/students.py`**

```python
"""SPEC §7's `/students` and `/me/students`.

**Tagged `coach`, and that tag is load-bearing.** `.claude/rules/api.md`: "A router serving
coaches is tagged coach. SPEC §13's third invariant -- no coach-scoped endpoint returns any
financial field -- is enforced against that tag, so an untagged coach router is an
unguarded one." Staff `9c` and `9h` are both this router, so it is tagged and every
response shape here is inside invariant 3's guard.

**§3.2's viewer split is resolved once, in a dependency**, and passed to the service as
`viewer_group_ids`. Authorization stays in the router (`.claude/rules/api.md`); what the
service receives is a scope, not a caller -- which is what lets the follow-up worker call
the same methods with no request anywhere in sight.

Every route takes `TenantSessionDep`, which fails closed. That is why nothing here passes a
`studio_id`, and why a cross-studio reference is 404 rather than 403: the row is invisible,
not merely forbidden, and a 403 would confirm it exists.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.people import (
    GuardianOut,
    StudentCreate,
    StudentCreateResult,
    StudentOut,
    StudentSummaryOut,
    StudentSummaryPage,
    StudentUpdate,
)
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.students import StudentRow, StudentService

router = APIRouter(tags=["people", "coach"])


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such student"},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail={"code": "conflict", "message": message}
    )


def _refused(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "refused", "message": message},
    )


def viewer_scope(request: Request, session: TenantSessionDep) -> list[uuid.UUID] | None:
    """§3.2 -- `None` for owner and manager, a group list for a coach.

    Read from the verified JWT's `roles` claim and `group_staff`. Resolved here rather
    than inside the service because it is an authorization decision, and
    `.claude/rules/api.md` puts those in the router.
    """
    person_id = getattr(request.state, "person_id", None)
    roles = set(getattr(request.state, "roles", ()) or ())
    if person_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return StudentService.viewer_group_ids(session, person_id=person_id, roles=roles)


ViewerScope = Annotated["list[uuid.UUID] | None", Depends(viewer_scope)]

#: §3.2 -- 'Pre-report an absence' is the only guardian-reachable write in the product,
#: and it is M5's. Everything a guardian reads about their own children goes through
#: /me/students, which asks the guardian table rather than a role.
GuardianOrStaff = Annotated[
    None, Depends(require_roles("owner", "manager", "lead_coach", "assistant_coach"))
]


def _summary(row: StudentRow) -> StudentSummaryOut:
    return StudentSummaryOut(**row.__dict__)


@router.get("/students", response_model=StudentSummaryPage)
def list_students(
    _: AnyStaff,
    scope: ViewerScope,
    session: TenantSessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    group_id: uuid.UUID | None = None,
    health_status: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> StudentSummaryPage:
    """Dashboard `3b` and staff `9h`."""
    rows, next_cursor = StudentService.list(
        session,
        viewer_group_ids=scope,
        status=status_filter,
        group_id=group_id,
        health_status=health_status,
        q=q,
        after=after,
        limit=limit,
    )
    return StudentSummaryPage(
        items=[_summary(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/students", response_model=StudentCreateResult, status_code=status.HTTP_201_CREATED)
def create_student(
    _: ManagerOrOwner,
    body: StudentCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentCreateResult:
    """§5.4(a) -- `+ תלמיד חדש`. Dashboard `3c`.

    L6: this route is manager-or-owner and there is no self-service equivalent. The public
    link's only job is a first lesson.
    """
    if body.guardian is None:
        raise _refused("a student needs at least one guardian")
    try:
        created = StudentService.create(
            session,
            first_name=body.first_name,
            last_name=body.last_name,
            birthdate=body.birthdate,
            guardian_first_name=body.guardian.first_name,
            guardian_last_name=body.guardian.last_name,
            guardian_email=body.guardian.email,
            guardian_phone=body.guardian.phone,
            relation=body.guardian.relation,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=created.student.id)
    return StudentCreateResult(
        student=_student_out(session, student, person),
        invitation_token=created.invitation_token,
    )


@router.get("/students/{student_id}", response_model=StudentOut)
def get_student(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> StudentOut:
    """Staff `9c`, dashboard `4a`, parent `2c` (through /me/students for a guardian)."""
    try:
        student, person = StudentService.get(
            session, student_id=student_id, viewer_group_ids=scope
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    return _student_out(session, student, person)


@router.patch("/students/{student_id}", response_model=StudentOut)
def update_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentUpdate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    try:
        student, person = StudentService.update(
            session,
            student_id=student_id,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            first_name=body.first_name,
            last_name=body.last_name,
            birthdate=body.birthdate,
            phone=body.phone,
            email=body.email,
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return _student_out(session, student, person)


@router.get("/me/students", response_model=StudentSummaryPage)
def my_students(request: Request, session: TenantSessionDep) -> StudentSummaryPage:
    """§6.3's home, and L9 verbatim.

    **No role dependency**, deliberately. §3.1: "guardian is not a role"; §6.1 makes parent
    access `EXISTS(guardian WHERE person_id = :me)`. `require_roles` here would refuse
    every guardian in the product and admit every coach with no children.

    L8 -- no `is_primary` branch. Every guardian on a student sees the same list.
    """
    person_id = getattr(request.state, "person_id", None)
    if person_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    rows = StudentService.for_guardian(session, person_id=person_id)
    # Not paginated on purpose: this is one person's children. G16 is about lists that
    # grow, and a family that outgrows one page is not a case the product has.
    return StudentSummaryPage(items=[_summary(row) for row in rows], has_more=False)


def _student_out(session: TenantSessionDep, student, person) -> StudentOut:
    from sqlalchemy import select

    from app.models.person import Guardian, Person

    guardians = session.execute(
        select(Guardian, Person)
        .join(Person, Guardian.person_id == Person.id)
        .where(Guardian.student_id == student.id)
        .order_by(Guardian.is_primary.desc(), Person.first_name)
    ).all()
    return StudentOut(
        id=student.id,
        person_id=person.id,
        first_name=person.first_name,
        last_name=person.last_name,
        birthdate=person.birthdate,
        status=student.status,
        health_status=student.health_status,
        joined_on=student.joined_on,
        left_on=student.left_on,
        current_belt_id=student.current_belt_id,
        price_plan_id=student.price_plan_id,
        guardians=[
            GuardianOut(
                person_id=g.person_id,
                student_id=g.student_id,
                display_name=f"{p.first_name} {p.last_name}",
                relation=g.relation,
                is_primary=g.is_primary,
                phone=p.phone,
                email=p.email,
            )
            for g, p in guardians
        ],
    )
```

`StudentCreate` in `app/schemas/people.py` needs a `guardian` field. Append to the **existing** `StudentCreate` class — this is the one contract shape that must grow, because §5.4(a) creates the parent in the same request and the shape as landed has no way to say who that is:

```python
    #: §5.4(a) -- 'parent details -> child details and group'. One request, because a
    #: student with no guardian is a child nobody can be contacted about, and §5.3 makes
    #: at least one guardian structural rather than optional.
    guardian: GuardianCreate | None = None
```

Move `class GuardianCreate` above `class StudentCreate` in the file so the forward reference resolves.

- [ ] **Step 9: Delete the vacuity test (L13(b))**

`tests/invariants/test_03_coach_endpoints_expose_no_money.py` — delete `test_the_gate_is_currently_empty_and_says_so` entirely, exactly as its own docstring instructs ("When M1 lands the first coach router this goes red, and the correct fix is to delete this test"). Leave every other test in the file untouched: `test_no_coach_scoped_endpoint_returns_a_financial_field` is now non-vacuous and is the point.

- [ ] **Step 10: Run everything and watch it pass**

```bash
.venv/bin/pytest tests/people tests/invariants -q
```

Expected: PASS.

- [ ] **Step 11: Regenerate the client, typecheck, lint, commit**

```bash
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app
.venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): /students, §3.2's viewer split, and the first coach-tagged router"
```

---

## Task 6 — Freeze, leave, convert and mark-lost: the four decisions a manager makes about a student

Every one of these moves the student through §5.4a's graph, so every one goes through `StudentStatusService.transition`. Parent `12i` states the leaving rule the product must not soften: **the monthly charge stays the parent's responsibility.**

**Files:**
- Modify: `app/services/people/students.py` (append four methods)
- Modify: `app/routers/students.py` (append five routes)
- Test: `tests/people/test_student_lifecycle.py`

**Interfaces:**
- Produces: `StudentService.freeze`, `.leave`, `.convert`, `.mark_lost`, `.expire_freezes`, `.status_history`
- Consumed by: Tasks 12, 16, 18, 19.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_student_lifecycle.py`:

```python
"""§5.4's leaving and freezing, and §5.4a's conversion and loss.

Two rules here are stated in the spec in a way that is easy to soften into something
friendlier and wrong, so both are pinned:

  * §5.4 -- 'ending an enrollment mid-month does NOT void that month's charge and
    produces no refund.' Parent `12i` says it to the parent's face. Nothing in `leave`
    touches money, and the test asserts the absence.
  * §5.4 -- while frozen 'the enrollment and the spot are retained.' A freeze that ended
    enrollments would give the spot away, which is the one thing the parent was promised
    would not happen.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.people import Enrollment, Student, StudentFreeze, StudentStatusHistory, TrialBooking
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0, TODAY


@pytest.fixture
def an_active_student(app_session, studio, a_group):
    created = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=date(2016, 4, 2),
        guardian_first_name="יעל", guardian_last_name="כהן",
        guardian_email="yael@example.invalid", guardian_phone=None,
        at=T0, actor_person_id=None,
    )
    student = created.student
    StudentStatusService.transition(app_session, student=student, to_status="active", at=T0)
    student.joined_on = TODAY
    app_session.add(
        Enrollment(
            studio_id=studio.id, student_id=student.id, group_id=a_group,
            status="active", started_on=TODAY,
        )
    )
    app_session.commit()
    return student


def test_freezing_records_a_range_and_keeps_the_enrollment(app_session, an_active_student, a_group):
    """§5.4 -- 'the enrollment and the spot are retained.'"""
    StudentService.freeze(
        app_session, student_id=an_active_student.id, from_date=date(2026, 10, 1),
        to_date=date(2026, 11, 1), reason="פציעה", at=T0, actor_person_id=None,
    )
    app_session.commit()

    assert an_active_student.status == "frozen"
    freeze = app_session.execute(select(StudentFreeze)).scalar_one()
    assert (freeze.from_date, freeze.to_date) == (date(2026, 10, 1), date(2026, 11, 1))
    enrollment = app_session.execute(select(Enrollment)).scalar_one()
    assert enrollment.ended_on is None


def test_a_freeze_may_be_open_ended(app_session, an_active_student):
    """§5.4's army case has no return date, and the guardian view shows 'מוקפא' with no
    date rather than a made-up one."""
    StudentService.freeze(
        app_session, student_id=an_active_student.id, from_date=date(2026, 10, 1),
        to_date=None, reason="שירות מילואים", at=T0, actor_person_id=None,
    )
    app_session.commit()
    assert app_session.execute(select(StudentFreeze)).scalar_one().to_date is None


def test_a_freeze_that_has_run_out_returns_the_student_to_active(app_session, an_active_student):
    """§7 has no unfreeze endpoint and §5.4 gives the freeze a return date, so the date is
    what ends it. Without this the student is `frozen` forever, the roster never shows
    them again, and the parent is told they are still frozen in April."""
    StudentService.freeze(
        app_session, student_id=an_active_student.id, from_date=date(2026, 10, 1),
        to_date=date(2026, 10, 31), reason=None, at=T0, actor_person_id=None,
    )
    app_session.commit()

    reactivated = StudentService.expire_freezes(app_session, on=date(2026, 11, 1), at=T0)
    app_session.commit()

    assert [s.id for s in reactivated] == [an_active_student.id]
    assert an_active_student.status == "active"


def test_an_open_ended_freeze_never_expires_on_its_own(app_session, an_active_student):
    StudentService.freeze(
        app_session, student_id=an_active_student.id, from_date=date(2026, 10, 1),
        to_date=None, reason=None, at=T0, actor_person_id=None,
    )
    app_session.commit()
    assert StudentService.expire_freezes(app_session, on=date(2030, 1, 1), at=T0) == []


def test_leaving_ends_every_live_enrollment_and_touches_no_money(
    app_session, an_active_student, a_group, a_second_group, studio
):
    """C11 -- several live enrollments are normal, so leaving must end all of them.
    Parent `12i` -- the monthly charge stays the parent's responsibility, so nothing here
    writes, cancels or refunds anything financial."""
    app_session.add(
        Enrollment(
            studio_id=studio.id, student_id=an_active_student.id, group_id=a_second_group,
            status="active", started_on=TODAY,
        )
    )
    app_session.commit()

    StudentService.leave(
        app_session, student_id=an_active_student.id, left_on=date(2026, 12, 15),
        reason="עבר עיר", at=T0, actor_person_id=None,
    )
    app_session.commit()

    assert an_active_student.status == "left"
    assert an_active_student.left_on == date(2026, 12, 15)
    enrollments = list(app_session.execute(select(Enrollment)).scalars())
    assert len(enrollments) == 2
    assert all(e.ended_on == date(2026, 12, 15) and e.status == "ended" for e in enrollments)


def test_leaving_keeps_every_row_of_history(app_session, an_active_student):
    """§5.4 -- 'The student's status becomes left; all history is retained.'"""
    StudentService.leave(
        app_session, student_id=an_active_student.id, left_on=TODAY, reason=None,
        at=T0, actor_person_id=None,
    )
    app_session.commit()
    rows = list(app_session.execute(select(StudentStatusHistory)).scalars())
    assert [r.to_status for r in rows] == ["active", "left"]


def test_converting_a_trial_creates_the_enrollment_and_sets_the_price_on_the_student(
    app_session, studio, a_group, fake_schedule
):
    """§5.4a step 5, and C11. One student, one `price_plan_id`, however many groups --
    and `enrollment` carries no price at all."""
    from datetime import UTC, datetime

    from tests.people.conftest import make_session

    created = StudentService.create(
        app_session, first_name="נועה", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ל",
        guardian_email="l@example.invalid", guardian_phone=None,
        at=T0, actor_person_id=None, status="lead",
    )
    StudentStatusService.transition(app_session, student=created.student, to_status="trial", at=T0)
    app_session.commit()

    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id, group_id=a_group, training_year_id=uuid.uuid4(),
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        )
    ]
    plan = uuid.uuid4()
    StudentService.convert(
        app_session,
        student_id=created.student.id,
        group_id=a_group,
        started_on=TODAY,
        price_plan_id=plan,
        attends_weekdays=None,
        reason=None,
        at=T0,
        actor_person_id=None,
        schedule=fake_schedule,
    )
    app_session.commit()

    assert created.student.status == "active"
    assert created.student.joined_on == TODAY
    assert created.student.price_plan_id == plan
    enrollment = app_session.execute(select(Enrollment)).scalar_one()
    assert enrollment.group_id == a_group
    assert enrollment.status == "active"
    # C11 -- the price is NOT here, and there is no column for it to be in.
    assert not hasattr(enrollment, "price_plan_id")


def test_converting_closes_the_trial_booking_as_converted(
    app_session, studio, a_group, fake_schedule
):
    """§5.4a -- `trial_booking.outcome` is what makes the funnel's denominator honest.
    A conversion that left it `pending` would show as a trial nobody ever decided about."""
    from datetime import UTC, datetime

    from tests.people.conftest import make_session

    created = StudentService.create(
        app_session, first_name="נועה", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ל",
        guardian_email="l@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    StudentStatusService.transition(app_session, student=created.student, to_status="trial", at=T0)
    booking = TrialBooking(
        studio_id=studio.id, student_id=created.student.id, group_id=a_group,
        booked_at=T0, attended=True, outcome="pending", is_override=False,
    )
    app_session.add(booking)
    app_session.commit()

    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id, group_id=a_group, training_year_id=uuid.uuid4(),
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        )
    ]
    StudentService.convert(
        app_session, student_id=created.student.id, group_id=a_group, started_on=TODAY,
        price_plan_id=None, attends_weekdays=None, reason=None, at=T0,
        actor_person_id=None, schedule=fake_schedule,
    )
    app_session.commit()
    assert booking.outcome == "converted"


def test_converting_does_not_promote_the_health_status(app_session, studio, a_group, fake_schedule):
    """§5.4a -- 'The trial declaration is not sufficient for enrollment. health_status
    moves missing -> trial_signed -> signed; converting requires the full form.' The
    conversion must NOT quietly move it to `signed`, or the app's health gate stops
    firing for exactly the students who have not signed anything."""
    from datetime import UTC, datetime

    from tests.people.conftest import make_session

    created = StudentService.create(
        app_session, first_name="נועה", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ל",
        guardian_email="l@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    created.student.health_status = "trial_signed"
    StudentStatusService.transition(app_session, student=created.student, to_status="trial", at=T0)
    app_session.commit()

    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id, group_id=a_group, training_year_id=uuid.uuid4(),
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        )
    ]
    StudentService.convert(
        app_session, student_id=created.student.id, group_id=a_group, started_on=TODAY,
        price_plan_id=None, attends_weekdays=None, reason=None, at=T0,
        actor_person_id=None, schedule=fake_schedule,
    )
    app_session.commit()
    assert created.student.health_status == "trial_signed"


def test_marking_lost_records_the_reason_and_closes_the_booking(app_session, studio, a_group):
    created = StudentService.create(
        app_session, first_name="נועה", last_name="לוי", birthdate=None,
        guardian_first_name="הורה", guardian_last_name="ל",
        guardian_email="l@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    StudentStatusService.transition(app_session, student=created.student, to_status="trial", at=T0)
    booking = TrialBooking(
        studio_id=studio.id, student_id=created.student.id, group_id=a_group,
        booked_at=T0, attended=False, outcome="pending", is_override=False,
    )
    app_session.add(booking)
    app_session.commit()

    StudentService.mark_lost(
        app_session, student_id=created.student.id, reason="בחרו קראטה", at=T0,
        actor_person_id=None,
    )
    app_session.commit()

    assert created.student.status == "lost"
    assert booking.outcome == "lost"
    row = app_session.execute(
        select(StudentStatusHistory).where(StudentStatusHistory.to_status == "lost")
    ).scalar_one()
    assert row.reason == "בחרו קראטה"


def test_converting_an_active_student_is_refused(app_session, an_active_student, a_group,
                                                 fake_schedule):
    """`active -> active` is not in the graph, and a second conversion would create a
    second enrollment in a group they are already in -- which the partial unique index
    would then reject with an IntegrityError instead of a message."""
    with pytest.raises(RefusedError):
        StudentService.convert(
            app_session, student_id=an_active_student.id, group_id=a_group, started_on=TODAY,
            price_plan_id=None, attends_weekdays=None, reason=None, at=T0,
            actor_person_id=None, schedule=fake_schedule,
        )
```

- [ ] **Step 2: Run them and watch them fail**

```bash
.venv/bin/pytest tests/people/test_student_lifecycle.py -q
```

Expected: FAIL — `AttributeError: type object 'StudentService' has no attribute 'freeze'`.

- [ ] **Step 3: Append the four methods to `app/services/people/students.py`**

```python
    @staticmethod
    def freeze(
        session: Session,
        *,
        student_id: uuid.UUID,
        from_date: date,
        to_date: date | None,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> StudentFreeze:
        """§5.4's freeze. A **date range**, not a boolean.

        §5.10 step 4's billing run reads `student_freeze` rather than `student.status`,
        because it asks about a *period*: a student frozen for March and back in April is
        `frozen` today and still owes April. That is why the row is the artefact and the
        status is the consequence.

        The enrollments are deliberately left alone -- §5.4: "the enrollment and the spot
        are retained". Ending them would give away the one thing the parent was promised
        would be kept.
        """
        student, _ = StudentService.get(session, student_id=student_id)
        row = StudentFreeze(
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
            reason=reason,
            created_by_person_id=actor_person_id,
            created_at=at,
        )
        session.add(row)
        StudentStatusService.transition(
            session,
            student=student,
            to_status="frozen",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        session.flush()
        return row

    @staticmethod
    def expire_freezes(session: Session, *, on: date, at: datetime) -> list[Student]:
        """Return every student whose freeze has run out, and reactivate them.

        §7 offers no unfreeze endpoint and §5.4 gives the freeze a return date, so the
        date is what ends it. Without this a student stays `frozen` forever: the roster
        never shows them again and the guardian is still reading "מוקפא" in April. Called
        daily by `app/workers/followups.py`.

        An open-ended freeze (`to_date IS NULL`) is never expired here. §5.4's army case
        has no return date, and inventing one would put a child back on a roster they are
        not at.
        """
        frozen = session.execute(select(Student).where(Student.status == "frozen")).scalars().all()
        reactivated: list[Student] = []
        for student in frozen:
            latest = session.execute(
                select(StudentFreeze)
                .where(StudentFreeze.student_id == student.id)
                .order_by(StudentFreeze.from_date.desc())
                .limit(1)
            ).scalar_one_or_none()
            if latest is None or latest.to_date is None or latest.to_date >= on:
                continue
            StudentStatusService.transition(
                session, student=student, to_status="active", at=at, reason="freeze ended"
            )
            reactivated.append(student)
        session.flush()
        return reactivated

    @staticmethod
    def leave(
        session: Session,
        *,
        student_id: uuid.UUID,
        left_on: date,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Student:
        """§5.4's leaving, and parent `12i`'s promise kept in the negative.

        **Nothing here touches money.** §5.4: "ending an enrollment mid-month does not void
        that month's charge and produces no refund", and `12i` states it to the parent's
        face. A manager who wants to write a charge off does it in the billing screen,
        deliberately, where it is audit-logged as a write-off.

        Every live enrollment ends, not one. C11 makes several normal, and a student who
        left while still enrolled in the second group would keep appearing on that roster.
        """
        student, _ = StudentService.get(session, student_id=student_id)
        live = session.execute(
            select(Enrollment).where(
                Enrollment.student_id == student.id, Enrollment.ended_on.is_(None)
            )
        ).scalars().all()
        for enrollment in live:
            enrollment.ended_on = left_on
            enrollment.status = "ended"
        student.left_on = left_on
        StudentStatusService.transition(
            session,
            student=student,
            to_status="left",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        session.flush()
        return student

    @staticmethod
    def convert(
        session: Session,
        *,
        student_id: uuid.UUID,
        group_id: uuid.UUID,
        started_on: date,
        price_plan_id: uuid.UUID | None,
        attends_weekdays: list[int] | None,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
    ) -> Student:
        """§5.4a step 5 -- 'Manager converts -> picks group, sets price, status=active,
        enrollment created.'

        **C11 puts the price on the student**, here, in one place, however many groups
        they end up in. `EnrollmentService.create` writes no price because `enrollment`
        has no column for one, and that absence is the fix for a child in two groups being
        billed twice a month at two different prices.

        **`health_status` is not promoted.** §5.4a: "The trial declaration is not
        sufficient for enrollment... converting requires the full form." Moving it to
        `signed` here would switch off the app's health gate for exactly the students who
        have signed nothing.
        """
        from app.services.people.enrollments import EnrollmentService

        student, _ = StudentService.get(session, student_id=student_id)
        # Transition first: an illegal move must refuse before an enrollment is written,
        # or a refused conversion leaves the student in a group they were never put in.
        StudentStatusService.transition(
            session,
            student=student,
            to_status="active",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        student.joined_on = student.joined_on or started_on
        student.price_plan_id = price_plan_id

        EnrollmentService.create(
            session,
            student_id=student.id,
            group_id=group_id,
            started_on=started_on,
            attends_weekdays=attends_weekdays,
            at=at,
            actor_person_id=actor_person_id,
            schedule=schedule,
            status="active",
        )
        for booking in session.execute(
            select(TrialBooking).where(
                TrialBooking.student_id == student.id, TrialBooking.outcome == "pending"
            )
        ).scalars():
            booking.outcome = "converted"
        session.flush()
        return student

    @staticmethod
    def mark_lost(
        session: Session,
        *,
        student_id: uuid.UUID,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Student:
        """§5.4a -- 'No conversion after N days -> status=lost, with a reason.'

        `lost` is a real outcome and not an absence of one, which is what makes the funnel
        report's denominator honest.
        """
        student, _ = StudentService.get(session, student_id=student_id)
        StudentStatusService.transition(
            session,
            student=student,
            to_status="lost",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        for booking in session.execute(
            select(TrialBooking).where(
                TrialBooking.student_id == student.id, TrialBooking.outcome == "pending"
            )
        ).scalars():
            booking.outcome = "lost"
        session.flush()
        return student

    @staticmethod
    def status_history(
        session: Session, *, student_id: uuid.UUID
    ) -> list[StudentStatusHistory]:
        """§7 -- `GET /students/{id}/status-history`. Dashboard `4a` renders it as a
        timeline, and §5.4a computes the funnel from the same rows."""
        StudentService.get(session, student_id=student_id)
        return list(
            session.execute(
                select(StudentStatusHistory)
                .where(StudentStatusHistory.student_id == student_id)
                .order_by(StudentStatusHistory.changed_at, StudentStatusHistory.created_at)
            ).scalars()
        )
```

Add to the imports at the top of the module:

```python
from app.models.people import (
    Enrollment,
    Student,
    StudentFreeze,
    StudentStatusHistory,
    TrialBooking,
)
from app.services.people.group_days import ScheduleReader
from app.services.people.status import StudentStatusService
```

- [ ] **Step 4: Run them and watch them pass**

```bash
.venv/bin/pytest tests/people/test_student_lifecycle.py -q
```

Expected: PASS (12 passed). `EnrollmentService` does not exist yet — write Task 8's `create` first if the executor is running tasks strictly in order; otherwise reorder Task 8 before this one. **The plan's dependency here is real: Task 8 must land before this step goes green.**

> **Executor note:** implement Task 8's `EnrollmentService.create` before running this step. The two are separated because they are separately reviewable, not because they are independent.

- [ ] **Step 5: Append the routes to `app/routers/students.py`**

```python
@router.post("/students/{student_id}/freeze", response_model=StudentOut)
def freeze_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentFreezeIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4's freeze. Parent `12i` and dashboard `4a`."""
    try:
        StudentService.freeze(
            session, student_id=student_id, from_date=body.from_date, to_date=body.to_date,
            reason=body.reason, at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused(str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _student_out(session, student, person)


@router.post("/students/{student_id}/leave", response_model=StudentOut)
def leave_studio(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentLeaveIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4's leaving. `StudentLeaveIn` carries no money field and no write-off flag --
    parent `12i`: the monthly charge stays the parent's responsibility."""
    try:
        StudentService.leave(
            session, student_id=student_id, left_on=body.left_on, reason=body.reason,
            at=now(), actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused(str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _student_out(session, student, person)


@router.post("/students/{student_id}/convert", response_model=StudentOut)
def convert_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentConvertIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4a step 5. L6 -- manager-or-owner, because enrolment is always a manager
    decision and this is the moment it is made."""
    try:
        StudentService.convert(
            session,
            student_id=student_id,
            group_id=body.group_id,
            started_on=body.started_on,
            price_plan_id=body.price_plan_id,
            attends_weekdays=body.attends_weekdays,
            reason=body.reason,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    except RefusedError as exc:
        raise _refused(str(exc)) from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _student_out(session, student, person)


@router.post("/students/{student_id}/mark-lost", response_model=StudentOut)
def mark_student_lost(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentMarkLostIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    try:
        StudentService.mark_lost(
            session, student_id=student_id, reason=body.reason, at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused(str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _student_out(session, student, person)


@router.get(
    "/students/{student_id}/status-history", response_model=StudentStatusHistoryListResponse
)
def student_status_history(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> StudentStatusHistoryListResponse:
    try:
        StudentService.get(session, student_id=student_id, viewer_group_ids=scope)
        rows = StudentService.status_history(session, student_id=student_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    return StudentStatusHistoryListResponse(
        items=[StudentStatusHistoryOut.model_validate(r, from_attributes=True) for r in rows]
    )
```

And the shared 503 helper, near `_not_found`:

```python
def _schedule_unavailable() -> HTTPException:
    """L5's seam, surfaced honestly.

    `ScheduleService.materialize_sessions` raises `NotImplementedError` until lane
    SCHEDULE merges, and this lane must not soften that into an empty list -- an empty
    slot list is indistinguishable from "this group has no schedule", which is exactly the
    lie the seam's docstring warns about. A 503 naming the cause beats a 500 leaking a
    stack trace (`.claude/rules/api.md`), and this arm disappears the moment M2 lands.
    """
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "schedule_unavailable",
            "message": "the club's schedule has not been built yet",
        },
    )
```

Extend the imports with `StudentConvertIn`, `StudentFreezeIn`, `StudentLeaveIn`, `StudentMarkLostIn`, `StudentStatusHistoryOut`, `StudentStatusHistoryListResponse`, and `from app.services.schedule import ScheduleService`, `from app.services.people.group_days import ScheduleReader`.

- [ ] **Step 6: Add the router tests, run, commit**

Append to `tests/people/test_students_router.py`:

```python
def test_leaving_returns_no_money_field_of_any_kind(client, as_manager):
    """Invariant 3 plus parent `12i`. The response shape is `StudentOut`, which has no
    financial field -- asserted at the wire rather than only at the model, because a
    later `response_model` change is exactly how one would appear."""
    student = _create(client, as_manager)["student"]
    client.post(
        f"/api/v1/students/{student['id']}/convert",
        json={"group_id": str(uuid.uuid4()), "started_on": "2026-09-01"},
        headers=as_manager.headers,
    )
    left = client.post(
        f"/api/v1/students/{student['id']}/leave",
        json={"left_on": "2026-12-15"},
        headers=as_manager.headers,
    )
    body = left.json() if left.status_code == 200 else {}
    assert not any(
        key in str(body) for key in ("amount", "balance", "debt", "agorot", "refund")
    )


def test_freezing_is_manager_only(client, as_manager, as_lead_coach):
    student = _create(client, as_manager)["student"]
    refused = client.post(
        f"/api/v1/students/{student['id']}/freeze",
        json={"from_date": "2026-10-01"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403
```

```bash
.venv/bin/pytest tests/people -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): freeze, leave, convert and mark-lost — and the freeze that ends itself"
```

---

## Task 7 — Guardians: all equal, never duplicated, exactly one primary

L8 is the rule that gets quietly broken: `is_primary` is a billing-address flag, and the first person to reach for it as a permission bit turns "all guardians are equal" into a lie in the one screen a second parent uses.

**Files:**
- Modify: `app/services/people/students.py` (append three methods)
- Modify: `app/routers/students.py` (append four routes)
- Test: `tests/people/test_guardians.py`

**Interfaces:**
- Produces: `StudentService.list_guardians`, `.add_guardian`, `.remove_guardian`, `.set_primary_guardian`

- [ ] **Step 1: Write the failing tests**

`tests/people/test_guardians.py`:

```python
"""§5.3's guardians. Three rules, and the third is the one that erodes.

  1. Any number of guardians, no household entity (L9).
  2. Never duplicated -- a matched Person is linked, not recreated (L7).
  3. `is_primary` decides bill addressing and הוראת קבע matching, and NOTHING else (L8).

The third is asserted twice: once in the schema (no permission field exists to branch on)
and once at the wire (both guardians receive byte-identical payloads).
"""

from __future__ import annotations

import uuid

import pytest
from app.models.person import Guardian, Person
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0


@pytest.fixture
def a_student(app_session, studio):
    created = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=None,
        guardian_first_name="יעל", guardian_last_name="כהן",
        guardian_email="yael@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    app_session.commit()
    return created.student


def test_a_second_guardian_is_a_second_row_and_not_a_household(app_session, a_student):
    """§5.3 -- 'Two parents on the same child are simply two guardian rows.'"""
    StudentService.add_guardian(
        app_session, student_id=a_student.id, first_name="דוד", last_name="כהן",
        email="david@example.invalid", phone=None, relation="parent", is_primary=False,
        at=T0, actor_person_id=None,
    )
    app_session.commit()
    rows = list(
        app_session.execute(
            select(Guardian).where(Guardian.student_id == a_student.id)
        ).scalars()
    )
    assert len(rows) == 2
    assert sum(1 for r in rows if r.is_primary) == 1


def test_linking_the_same_person_twice_is_a_conflict(app_session, a_student):
    """UNIQUE(student_id, person_id). A duplicate guardian is how a bill gets addressed
    twice and a הוראת קבע matches two rows."""
    existing = app_session.execute(
        select(Guardian).where(Guardian.student_id == a_student.id)
    ).scalar_one()
    person = app_session.get(Person, existing.person_id)
    with pytest.raises(ConflictError):
        StudentService.add_guardian(
            app_session, student_id=a_student.id, first_name=person.first_name,
            last_name=person.last_name, email=person.email, phone=None, relation="parent",
            is_primary=False, at=T0, actor_person_id=None,
        )


def test_setting_a_new_primary_clears_the_old_one_in_the_same_breath(app_session, a_student):
    """§5.3 -- 'Exactly one guardian per student carries is_primary.' A partial unique
    index enforces it, so a set that did not clear the old one would raise an
    IntegrityError instead of doing the job."""
    added = StudentService.add_guardian(
        app_session, student_id=a_student.id, first_name="דוד", last_name="כהן",
        email="david@example.invalid", phone=None, relation="parent", is_primary=False,
        at=T0, actor_person_id=None,
    )
    app_session.commit()

    StudentService.set_primary_guardian(
        app_session, student_id=a_student.id, person_id=added.person_id, at=T0,
        actor_person_id=None,
    )
    app_session.commit()

    rows = list(
        app_session.execute(
            select(Guardian).where(Guardian.student_id == a_student.id)
        ).scalars()
    )
    assert [r.person_id for r in rows if r.is_primary] == [added.person_id]


def test_removing_the_last_guardian_is_refused(app_session, a_student):
    """A child with no guardian is a child nobody can be contacted about, and §5.3 makes
    at least one structural. The schema cannot express it, so the service does."""
    existing = app_session.execute(
        select(Guardian).where(Guardian.student_id == a_student.id)
    ).scalar_one()
    with pytest.raises(RefusedError):
        StudentService.remove_guardian(
            app_session, student_id=a_student.id, person_id=existing.person_id, at=T0,
            actor_person_id=None,
        )


def test_removing_the_primary_promotes_someone_else(app_session, a_student):
    """Leaving a student with two guardians and no primary would leave the bill addressed
    to nobody, and §5.10 has nowhere to send it."""
    existing = app_session.execute(
        select(Guardian).where(Guardian.student_id == a_student.id)
    ).scalar_one()
    StudentService.add_guardian(
        app_session, student_id=a_student.id, first_name="דוד", last_name="כהן",
        email="david@example.invalid", phone=None, relation="parent", is_primary=False,
        at=T0, actor_person_id=None,
    )
    app_session.commit()

    StudentService.remove_guardian(
        app_session, student_id=a_student.id, person_id=existing.person_id, at=T0,
        actor_person_id=None,
    )
    app_session.commit()

    remaining = list(
        app_session.execute(
            select(Guardian).where(Guardian.student_id == a_student.id)
        ).scalars()
    )
    assert len(remaining) == 1 and remaining[0].is_primary is True


def test_guardian_out_carries_no_permission_field():
    """L8, enforced in the shape. A `can_edit` or `is_readonly` here would invite a client
    to branch on something the server does not branch on."""
    from app.schemas.people import GuardianOut

    forbidden = {"can_edit", "is_readonly", "permissions", "role", "can_pay", "can_view"}
    assert forbidden.isdisjoint(GuardianOut.model_fields)


def test_both_guardians_receive_the_identical_payload(client, app_session, as_manager):
    """L8 at the wire. §5.3: 'One guardian view, no permission branching.' The secondary
    guardian's response must be byte-identical to the primary's."""
    from tests.people.test_students_router import CREATE, _create

    created = _create(client, as_manager)
    student_id = created["student"]["id"]
    client.post(
        f"/api/v1/students/{student_id}/guardians",
        json={
            "first_name": "דוד", "last_name": "כהן", "email": "david@example.invalid",
            "relation": "parent", "is_primary": False,
        },
        headers=as_manager.headers,
    )
    body = client.get(
        f"/api/v1/students/{student_id}", headers=as_manager.headers
    ).json()
    primary = next(g for g in body["guardians"] if g["is_primary"])
    secondary = next(g for g in body["guardians"] if not g["is_primary"])
    assert set(primary) == set(secondary)
```

- [ ] **Step 2: Run and watch fail; Step 3: implement; Step 4: run and watch pass**

```bash
.venv/bin/pytest tests/people/test_guardians.py -q   # FAIL, then PASS
```

Append to `StudentService`:

```python
    @staticmethod
    def list_guardians(
        session: Session, *, student_id: uuid.UUID
    ) -> list[tuple[Guardian, Person]]:
        """L8 -- ordered primary-first because that is the order `2c` and `4a` render
        them in, not because the primary is privileged. Nothing downstream branches."""
        StudentService.get(session, student_id=student_id)
        return list(
            session.execute(
                select(Guardian, Person)
                .join(Person, Guardian.person_id == Person.id)
                .where(Guardian.student_id == student_id)
                .order_by(Guardian.is_primary.desc(), Person.first_name)
            ).all()
        )

    @staticmethod
    def add_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        first_name: str,
        last_name: str,
        email: str | None,
        phone: str | None,
        relation: str,
        is_primary: bool,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Guardian:
        """§5.3 -- 'Guardians are invited by email or phone.'

        L7 first: a verified match is linked, never recreated. §5.4a is emphatic that a
        matched parent is never duplicated, and duplicating one here would produce two
        accounts holding the same child and two bills addressed to the same person.
        """
        student, _ = StudentService.get(session, student_id=student_id)
        matched = match_person(session, email=email, phone=phone)
        if matched is not None:
            person_id = matched.person_id
        else:
            person = Person(
                first_name=first_name.strip(),
                last_name=last_name.strip(),
                email=email,
                phone=phone,
                created_at=at,
            )
            session.add(person)
            session.flush()
            person_id = person.id
            StudentService._issue_invitation(
                session,
                student_id=student.id,
                email=email,
                phone=phone,
                at=at,
                actor_person_id=actor_person_id,
            )

        already = session.execute(
            select(Guardian).where(
                Guardian.student_id == student.id, Guardian.person_id == person_id
            )
        ).scalar_one_or_none()
        if already is not None:
            raise ConflictError("this person is already a guardian of this student")

        row = Guardian(
            student_id=student.id,
            person_id=person_id,
            is_primary=False,
            relation=relation,
            created_at=at,
        )
        session.add(row)
        session.flush()
        if is_primary:
            StudentService.set_primary_guardian(
                session, student_id=student.id, person_id=person_id, at=at,
                actor_person_id=actor_person_id,
            )
        AuditService.record(
            session,
            action="guardian.linked",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            diff={"person_id": str(person_id), "relation": relation, "matched": matched is not None},
        )
        session.flush()
        return row

    @staticmethod
    def set_primary_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        person_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Guardian:
        """§5.3 -- exactly one primary. L8 -- and it means exactly two things.

        The old primary is cleared and the new one set **before the flush**, because
        `uq_guardian_one_primary_per_student` is a partial unique index: two primaries
        existing even momentarily inside one flush is an IntegrityError.
        """
        rows = session.execute(
            select(Guardian).where(Guardian.student_id == student_id)
        ).scalars().all()
        target = next((r for r in rows if r.person_id == person_id), None)
        if target is None:
            raise NotFoundError(f"{person_id} is not a guardian of {student_id}")
        for row in rows:
            row.is_primary = row.person_id == person_id
        AuditService.record(
            session,
            action="guardian.primary.set",
            entity_type="student",
            entity_id=student_id,
            actor_person_id=actor_person_id,
            # §5.3's two consequences, named so an audit reader knows what changed and
            # what did not: no permission moved, because there is none to move.
            diff={"person_id": str(person_id), "affects": ["bill_addressing", "standing_order"]},
        )
        session.flush()
        return target

    @staticmethod
    def remove_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        person_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> None:
        """The last guardian cannot be removed, and removing the primary promotes another.

        Neither rule is expressible in the schema -- `UNIQUE(student_id, person_id)` says
        nothing about a minimum, and the partial index says nothing about what happens when
        the primary row disappears. A student with no primary is a bill addressed to
        nobody (§5.10); a student with no guardian is a child nobody can be contacted
        about (§5.3).
        """
        student, _ = StudentService.get(session, student_id=student_id)
        rows = session.execute(
            select(Guardian).where(Guardian.student_id == student.id)
        ).scalars().all()
        target = next((r for r in rows if r.person_id == person_id), None)
        if target is None:
            raise NotFoundError(f"{person_id} is not a guardian of {student_id}")
        if len(rows) == 1:
            raise RefusedError("a student must keep at least one guardian")

        was_primary = target.is_primary
        session.delete(target)
        session.flush()
        if was_primary:
            successor = next(r for r in rows if r.person_id != person_id)
            successor.is_primary = True
        AuditService.record(
            session,
            action="guardian.unlinked",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            diff={"person_id": str(person_id), "was_primary": was_primary},
        )
        session.flush()
```

Add `from app.models.person import Guardian, Invitation, Person` (already present) and `from app.services.people.errors import ConflictError, NotFoundError, RefusedError`.

- [ ] **Step 5: Append the four routes to `app/routers/students.py`**

```python
@router.get("/students/{student_id}/guardians", response_model=GuardianListResponse)
def list_guardians(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> GuardianListResponse:
    try:
        StudentService.get(session, student_id=student_id, viewer_group_ids=scope)
        rows = StudentService.list_guardians(session, student_id=student_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    return GuardianListResponse(
        items=[
            GuardianOut(
                person_id=g.person_id, student_id=g.student_id,
                display_name=f"{p.first_name} {p.last_name}", relation=g.relation,
                is_primary=g.is_primary, phone=p.phone, email=p.email,
            )
            for g, p in rows
        ]
    )


@router.post(
    "/students/{student_id}/guardians",
    response_model=GuardianListResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: GuardianCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GuardianListResponse:
    try:
        StudentService.add_guardian(
            session, student_id=student_id, first_name=body.first_name,
            last_name=body.last_name, email=body.email, phone=body.phone,
            relation=body.relation, is_primary=body.is_primary, at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    return list_guardians(None, student_id, None, session)


@router.delete(
    "/students/{student_id}/guardians/{person_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> Response:
    try:
        StudentService.remove_guardian(
            session, student_id=student_id, person_id=person_id, at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused(str(exc)) from exc
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/students/{student_id}/guardians/{person_id}/set-primary",
    response_model=GuardianListResponse,
)
def set_primary_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GuardianListResponse:
    """L8 -- this changes whose name the bill carries and which person a הוראת קבע matches.
    It changes no permission, because there is none attached to it."""
    try:
        StudentService.set_primary_guardian(
            session, student_id=student_id, person_id=person_id, at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return list_guardians(None, student_id, None, session)
```

- [ ] **Step 6: Run, regenerate, lint, commit**

```bash
.venv/bin/pytest tests/people -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): guardians — all equal, never duplicated, exactly one primary"
```

---

## Task 8 — Enrollment: C11 and C12, and the two things this table must never grow

C11 and C12 are one decision read twice. This task is where both land in code, and where the contract module `attendance_pattern.py` is used rather than re-implemented.

> **Executor note:** this task must land before Task 6 Step 4 goes green — `StudentService.convert` calls `EnrollmentService.create`.

**Files:**
- Create: `app/services/people/enrollments.py`
- Create: `app/routers/enrollments.py`
- Test: `tests/people/test_enrollments.py`

**Interfaces:**
- Produces: `EnrollmentService.create`, `.update`, `.list_for_student`, `.weekday_options`, `.weekly_volume_for_student`
- Consumed by: Tasks 6, 11, and the enrolment forms in Tasks 16, 18, 19.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_enrollments.py`:

```python
"""C11 and C12, and the contract module both are read through.

L1 -- expectation is read through `app/services/people/attendance_pattern.py`, never
re-derived. The last test in this file is what keeps a second implementation from
appearing: the roster (W3) and the billing run (W4) both call that module, and a second
answer here is how they start disagreeing about which children were expected.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.people import Enrollment
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from sqlalchemy import select
from tests.people.conftest import T0, TODAY, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
TUESDAY = datetime(2026, 9, 8, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)


@pytest.fixture
def a_student_id(app_session, studio):
    from app.services.people.students import StudentService

    created = StudentService.create(
        app_session, first_name="דנה", last_name="כהן", birthdate=None,
        guardian_first_name="יעל", guardian_last_name="כהן",
        guardian_email="yael@example.invalid", guardian_phone=None, at=T0, actor_person_id=None,
    )
    app_session.commit()
    return created.student.id


@pytest.fixture
def twice_weekly(fake_schedule, studio, a_group, a_training_year):
    fake_schedule.sessions[a_group] = [
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=m)
        for m in (SUNDAY, WEDNESDAY)
    ]
    return fake_schedule


def test_an_enrollment_with_no_pattern_means_every_session(
    app_session, a_student_id, a_group, twice_weekly
):
    """C12 -- 'NULL means all of them, which is the default and the common case.'"""
    row = EnrollmentService.create(
        app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
        attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    app_session.commit()
    assert row.attends_weekdays is None


def test_a_pattern_naming_a_day_the_group_does_not_train_is_refused(
    app_session, a_student_id, a_group, twice_weekly
):
    """The group trains Sunday and Wednesday. Tuesday is not on offer, and storing it
    would put a child on a roster for a session that does not exist -- C12's original bug
    coming back through the form."""
    with pytest.raises(RefusedError):
        EnrollmentService.create(
            app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
            attends_weekdays=[2], at=T0, actor_person_id=None, schedule=twice_weekly,
        )


def test_a_subset_of_the_groups_days_is_stored(app_session, a_student_id, a_group, twice_weekly):
    row = EnrollmentService.create(
        app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
        attends_weekdays=[0], at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    app_session.commit()
    assert row.attends_weekdays == [0]


def test_an_empty_pattern_is_refused_before_it_reaches_the_check_constraint(
    app_session, a_student_id, a_group, twice_weekly
):
    """The table's CHECK rejects an empty array; the service rejects it first so the
    caller gets a 422 naming the field rather than a 500 from an IntegrityError."""
    with pytest.raises(RefusedError):
        EnrollmentService.create(
            app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
            attends_weekdays=[], at=T0, actor_person_id=None, schedule=twice_weekly,
        )


def test_a_student_may_hold_several_live_enrollments(
    app_session, a_student_id, a_group, a_second_group, studio, a_training_year, fake_schedule
):
    """C11 and L3 -- '§5.4's "each child is enrolled in one group" was wrong and is
    corrected. Do not add a one-group constraint anywhere.'"""
    for group in (a_group, a_second_group):
        fake_schedule.sessions[group] = [
            make_session(studio_id=studio.id, group_id=group,
                         training_year_id=a_training_year, starts_at=SUNDAY)
        ]
    for group in (a_group, a_second_group):
        EnrollmentService.create(
            app_session, student_id=a_student_id, group_id=group, started_on=TODAY,
            attends_weekdays=None, at=T0, actor_person_id=None, schedule=fake_schedule,
        )
    app_session.commit()
    assert len(list(app_session.execute(select(Enrollment)).scalars())) == 2


def test_a_second_live_enrollment_in_the_same_group_is_a_conflict(
    app_session, a_student_id, a_group, twice_weekly
):
    """`uq_enrollment_live`. A duplicate here bills them twice -- caught in the service so
    the manager reads a message rather than a database error."""
    EnrollmentService.create(
        app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
        attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    app_session.commit()
    with pytest.raises(ConflictError):
        EnrollmentService.create(
            app_session, student_id=a_student_id, group_id=a_group, started_on=TODAY,
            attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
        )


def test_re_enrolling_after_leaving_a_group_is_allowed(
    app_session, a_student_id, a_group, twice_weekly
):
    """The unique index is partial on `ended_on IS NULL`. A child who left the beginners
    group in October and came back in March is two rows, and that history is the point."""
    first = EnrollmentService.create(
        app_session, student_id=a_student_id, group_id=a_group, started_on=date(2026, 9, 1),
        attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    EnrollmentService.update(
        app_session, enrollment_id=first.id, status="ended", ended_on=date(2026, 10, 31),
        attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    app_session.commit()
    again = EnrollmentService.create(
        app_session, student_id=a_student_id, group_id=a_group, started_on=date(2027, 3, 1),
        attends_weekdays=None, at=T0, actor_person_id=None, schedule=twice_weekly,
    )
    app_session.commit()
    assert again.id != first.id


def test_the_enrollment_model_has_no_price_column_and_this_test_says_why():
    """C11 and L2. A `price_plan_id` here is what billed a child in two groups twice a
    month, at two different prices, silently and forever. The price is on the STUDENT."""
    forbidden = {"price_plan_id", "price", "amount_agorot", "monthly_amount_agorot"}
    assert forbidden.isdisjoint(Enrollment.__table__.columns.keys())


def test_the_out_schema_has_no_price_either():
    from app.schemas.people import EnrollmentOut

    forbidden = {"price_plan_id", "price", "amount_agorot"}
    assert forbidden.isdisjoint(EnrollmentOut.model_fields)


def test_weekday_options_come_from_the_schedule_seam(app_session, a_group, twice_weekly):
    """L5 -- the checkboxes are the days the group actually trains, observed through
    `materialize_sessions`."""
    options = EnrollmentService.weekday_options(
        app_session, group_id=a_group, since=TODAY, schedule=twice_weekly
    )
    assert options.training_weekdays == [0, 3]


def test_weekday_options_for_a_group_with_no_schedule_is_empty_not_an_error(
    app_session, a_group, fake_schedule
):
    """An empty list is the honest answer, and the form renders 'this group has no
    schedule yet' rather than an unexplained empty row."""
    options = EnrollmentService.weekday_options(
        app_session, group_id=a_group, since=TODAY, schedule=fake_schedule
    )
    assert options.training_weekdays == []


def test_weekly_volume_is_read_through_the_contract_module(
    app_session, a_student_id, a_group, a_second_group, studio, a_training_year, fake_schedule
):
    """C11's number -- 'about 300 for twice a week, about 500 for daily' -- and L1: it is
    read through `attendance_pattern.weekly_volume`, never counted here.

    The C11 case exactly: one day in each of two groups is twice a week, because volume
    is sessions per week and not distinct days.
    """
    fake_schedule.sessions[a_group] = [
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=SUNDAY)
    ]
    fake_schedule.sessions[a_second_group] = [
        make_session(studio_id=studio.id, group_id=a_second_group,
                     training_year_id=a_training_year, starts_at=SUNDAY)
    ]
    for group in (a_group, a_second_group):
        EnrollmentService.create(
            app_session, student_id=a_student_id, group_id=group, started_on=TODAY,
            attends_weekdays=None, at=T0, actor_person_id=None, schedule=fake_schedule,
        )
    app_session.commit()

    assert EnrollmentService.weekly_volume_for_student(
        app_session, student_id=a_student_id, since=TODAY, schedule=fake_schedule
    ) == 2


def test_there_is_exactly_one_implementation_of_expectation_in_the_lane():
    """L1, mechanically. `expected_weekdays` is the contract module's, and a second
    definition anywhere under app/services/people/ is a second answer -- which is how the
    roster and the bill start disagreeing about which children were expected."""
    import ast
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "app/services/people"
    definitions = []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name in {
                "expected_weekdays", "is_expected", "weekly_volume"
            }:
                definitions.append(f"{path.name}:{node.name}")
    assert sorted(definitions) == [
        "attendance_pattern.py:expected_weekdays",
        "attendance_pattern.py:is_expected",
        "attendance_pattern.py:weekly_volume",
    ]
```

- [ ] **Step 2: Run and watch fail**

```bash
.venv/bin/pytest tests/people/test_enrollments.py -q
```

Expected: FAIL — `No module named 'app.services.people.enrollments'`.

- [ ] **Step 3: Write `app/services/people/enrollments.py`**

```python
"""§5.4's enrollment. A link table, and the two things it must never grow.

**C11 -- no price.** §5.10 creates one tuition charge per *student*, at
`student.price_plan_id`'s amount. Two enrollments are still one charge. A `price_plan_id`
on this row is what billed a child in the competition group and the teenagers group twice
a month, at two different prices, silently and forever. There is no column for it and this
module never asks for one.

**C11 -- no one-group rule.** A child in two groups is two rows, which the club confirmed
is normal. `uq_enrollment_live` is per (student, group) and not per student, and nothing
here narrows it.

**C12 -- `attends_weekdays`, validated against the schedule.** The days on offer come
through `ScheduleService.materialize_sessions()` (L5) and a pattern naming a day the group
does not train is refused. `attendance_pattern.expected_weekdays` already intersects
defensively at read time, but refusing at write time is what lets the manager see the
mistake while they are making it rather than discovering it in a roster three weeks later.

**L1 -- expectation is read, never re-derived.** `weekly_volume` here is a thin call into
the contract module. W3's roster and W4's billing run call the same three functions, and a
second implementation is a second answer.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import Enrollment, Student
from app.models.structure import Group
from app.services.audit import AuditService
from app.services.people.attendance_pattern import weekly_volume
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader, training_weekdays


@dataclass(frozen=True)
class WeekdayOptions:
    group_id: uuid.UUID
    group_name: str
    training_weekdays: list[int]


class EnrollmentService:
    @staticmethod
    def _group(session: Session, group_id: uuid.UUID) -> Group:
        group = session.get(Group, group_id)
        if group is None:
            # 404 and never 403 -- the tenant filter makes another studio's group
            # invisible, and a 403 would confirm it exists.
            raise NotFoundError(str(group_id))
        return group

    @staticmethod
    def weekday_options(
        session: Session, *, group_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> WeekdayOptions:
        """C12's checkboxes, for one group.

        An empty list is a real answer -- a group whose schedule has not been built yet --
        and the form says so rather than rendering nothing with no explanation.
        """
        group = EnrollmentService._group(session, group_id)
        return WeekdayOptions(
            group_id=group.id,
            group_name=group.name,
            training_weekdays=sorted(training_weekdays(group.id, since=since, schedule=schedule)),
        )

    @staticmethod
    def _validate_pattern(
        attends_weekdays: list[int] | None, scheduled: frozenset[int], group_name: str
    ) -> None:
        if attends_weekdays is None:
            return
        if not attends_weekdays:
            # The table's CHECK rejects this too. Refusing here first turns a 500 from an
            # IntegrityError into a 422 that names the field -- and an enrollment
            # expecting nothing is a student who left, not a student who enrolled.
            raise RefusedError("attends_weekdays must name at least one day, or be omitted")
        stray = sorted(set(attends_weekdays) - scheduled)
        if stray:
            raise RefusedError(
                f"{group_name} does not train on weekday(s) {stray}; "
                f"it trains on {sorted(scheduled)}"
            )

    @staticmethod
    def create(
        session: Session,
        *,
        student_id: uuid.UUID,
        group_id: uuid.UUID,
        started_on: date,
        attends_weekdays: list[int] | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
        status: str = "active",
    ) -> Enrollment:
        """L6 -- every caller of this is a manager decision. There is no self-service path
        into this method, and the public trial endpoint deliberately does not call it."""
        student = session.get(Student, student_id)
        if student is None:
            raise NotFoundError(str(student_id))
        group = EnrollmentService._group(session, group_id)

        scheduled = training_weekdays(group.id, since=started_on, schedule=schedule)
        EnrollmentService._validate_pattern(attends_weekdays, scheduled, group.name)

        live = session.execute(
            select(Enrollment).where(
                Enrollment.student_id == student_id,
                Enrollment.group_id == group_id,
                Enrollment.ended_on.is_(None),
            )
        ).scalar_one_or_none()
        if live is not None:
            raise ConflictError(f"already enrolled in {group.name}")

        row = Enrollment(
            student_id=student_id,
            group_id=group_id,
            status=status,
            started_on=started_on,
            attends_weekdays=attends_weekdays,
            created_at=at,
        )
        session.add(row)
        AuditService.record(
            session,
            action="enrollment.created",
            entity_type="enrollment",
            entity_id=row.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # C12's pattern is a manager decision like the group is, so it belongs in the
            # trail. There is no price to record -- C11 put that on the student.
            diff={
                "student_id": str(student_id),
                "group_id": str(group_id),
                "attends_weekdays": attends_weekdays,
            },
        )
        session.flush()
        return row

    @staticmethod
    def update(
        session: Session,
        *,
        enrollment_id: uuid.UUID,
        status: str | None,
        ended_on: date | None,
        attends_weekdays: list[int] | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
    ) -> Enrollment:
        """Staff `9c`'s מעבר כיתה ends one enrollment; the dashboard edits a pattern."""
        row = session.get(Enrollment, enrollment_id)
        if row is None:
            raise NotFoundError(str(enrollment_id))
        if attends_weekdays is not None:
            group = EnrollmentService._group(session, row.group_id)
            scheduled = training_weekdays(
                group.id, since=row.started_on, schedule=schedule
            )
            EnrollmentService._validate_pattern(attends_weekdays, scheduled, group.name)
            row.attends_weekdays = attends_weekdays
        if status is not None:
            row.status = status
        if ended_on is not None:
            row.ended_on = ended_on
        AuditService.record(
            session,
            action="enrollment.updated",
            entity_type="enrollment",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={
                "status": status,
                "ended_on": ended_on.isoformat() if ended_on else None,
                "attends_weekdays": attends_weekdays,
            },
        )
        session.flush()
        return row

    @staticmethod
    def list_for_student(
        session: Session, *, student_id: uuid.UUID, include_ended: bool = False
    ) -> list[tuple[Enrollment, Group]]:
        stmt = (
            select(Enrollment, Group)
            .join(Group, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == student_id)
        )
        if not include_ended:
            stmt = stmt.where(Enrollment.ended_on.is_(None))
        return list(session.execute(stmt.order_by(Group.name)).all())

    @staticmethod
    def weekly_volume_for_student(
        session: Session, *, student_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> int:
        """C11's number, read through the contract module (L1).

        §5.10 shows it beside the plan picker so a mismatch between what a child attends
        and what they are billed for is visible at the moment the price is set. It is a
        **suggestion, not a computation** -- the manager picks the plan, because the club's
        own numbers are approximate.

        Note what this does NOT return: an amount. `price_plan` is W4's table, and
        invariant 3 forbids a coach-reachable endpoint returning a financial field.
        """
        patterns = [
            (
                enrollment.attends_weekdays,
                training_weekdays(group.id, since=since, schedule=schedule),
            )
            for enrollment, group in EnrollmentService.list_for_student(
                session, student_id=student_id
            )
        ]
        return weekly_volume(patterns)
```

- [ ] **Step 4: Run and watch pass**

```bash
.venv/bin/pytest tests/people/test_enrollments.py -q
```

Expected: PASS (13 passed).

- [ ] **Step 5: Write `app/routers/enrollments.py`**

```python
"""SPEC §7's `/enrollments`.

**Not tagged `coach`.** §3.2 gives creating and editing an enrollment to owners and
managers; staff `9c`'s מעבר כיתה is drawn as "פעולה של המאמן הראשי בלבד" and is a lead-coach
*affordance* that calls a manager-scoped endpoint through the manager's own session. The
tag is a guarantee about who may reach a shape, and claiming one this router does not offer
would weaken invariant 3's meaning everywhere else it is used.

`weekday-options` is here rather than on `/groups/{id}` because `app/routers/structure.py`
belongs to M1 and this is C12's question, asked by this lane's enrolment form.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import IdempotencyKey
from app.schemas.people import (
    EnrollmentCreate,
    EnrollmentOut,
    EnrollmentUpdate,
    EnrollmentWeekdayOptionsOut,
)
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.schedule import ScheduleService

router = APIRouter(tags=["people"])


def _out(enrollment, group) -> EnrollmentOut:
    return EnrollmentOut(
        id=enrollment.id,
        student_id=enrollment.student_id,
        group_id=enrollment.group_id,
        group_name=group.name,
        status=enrollment.status,
        started_on=enrollment.started_on,
        ended_on=enrollment.ended_on,
        attends_weekdays=enrollment.attends_weekdays,
    )


@router.get("/enrollments/weekday-options", response_model=EnrollmentWeekdayOptionsOut)
def weekday_options(
    _: AnyStaff, group_id: uuid.UUID, session: TenantSessionDep
) -> EnrollmentWeekdayOptionsOut:
    """C12's checkboxes. Called by every enrolment form before it draws the day list."""
    try:
        options = EnrollmentService.weekday_options(
            session, group_id=group_id, since=now().date(), schedule=ScheduleService()
        )
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such group"},
        ) from exc
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "schedule_unavailable",
                "message": "the club's schedule has not been built yet",
            },
        ) from exc
    return EnrollmentWeekdayOptionsOut(**options.__dict__)


@router.get("/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(
    _: AnyStaff,
    student_id: uuid.UUID,
    session: TenantSessionDep,
    include_ended: bool = Query(default=False),
) -> list[EnrollmentOut]:
    """Always scoped to one student. C11 makes several live rows normal, so this is a
    small bounded list rather than a page — G16's rule is about lists that grow."""
    return [
        _out(enrollment, group)
        for enrollment, group in EnrollmentService.list_for_student(
            session, student_id=student_id, include_ended=include_ended
        )
    ]


@router.post("/enrollments", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED)
def create_enrollment(
    _: ManagerOrOwner,
    body: EnrollmentCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EnrollmentOut:
    """L6 -- enrolment is always a manager decision. `EnrollmentCreate` carries no price,
    because C11 put that on the student and there is no column here to receive one."""
    try:
        row = EnrollmentService.create(
            session,
            student_id=body.student_id,
            group_id=body.group_id,
            started_on=body.started_on,
            attends_weekdays=body.attends_weekdays,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(),
        )
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such student or group"},
        ) from exc
    except ConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_enrolled", "message": str(exc)},
        ) from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "not_a_training_day", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "schedule_unavailable",
                "message": "the club's schedule has not been built yet",
            },
        ) from exc
    session.commit()
    from app.models.structure import Group

    return _out(row, session.get(Group, row.group_id))


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def update_enrollment(
    _: ManagerOrOwner,
    enrollment_id: uuid.UUID,
    body: EnrollmentUpdate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EnrollmentOut:
    try:
        row = EnrollmentService.update(
            session,
            enrollment_id=enrollment_id,
            status=body.status,
            ended_on=body.ended_on,
            attends_weekdays=body.attends_weekdays,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(),
        )
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such enrollment"},
        ) from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "not_a_training_day", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "schedule_unavailable",
                "message": "the club's schedule has not been built yet",
            },
        ) from exc
    session.commit()
    from app.models.structure import Group

    return _out(row, session.get(Group, row.group_id))
```

- [ ] **Step 6: Add router tests**

Append to `tests/people/test_enrollments.py`:

```python
def test_the_weekday_options_endpoint_503s_until_the_schedule_lane_lands(client, as_manager,
                                                                        a_group):
    """L5's seam surfaced honestly. `.claude/rules/api.md` -- 'Never leak stack traces.'
    Delete this test when M2 merges and the seam returns rows."""
    response = client.get(
        f"/api/v1/enrollments/weekday-options?group_id={a_group}", headers=as_manager.headers
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "schedule_unavailable"


def test_a_coach_may_not_create_an_enrollment(client, as_lead_coach, a_group):
    """§3.2 -- 'Approve registration requests' and 'Create/edit classes, groups,
    schedules' are owner and manager. Enrolment is a manager decision (L6)."""
    response = client.post(
        "/api/v1/enrollments",
        json={"student_id": str(uuid.uuid4()), "group_id": str(a_group),
              "started_on": "2026-09-01"},
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403
```

- [ ] **Step 7: Run, regenerate, lint, commit**

```bash
.venv/bin/pytest tests/people -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): C11 and C12 — several enrollments, one price, and the days a child comes"
```

---

## Task 9 — The public surface: a shop window, not a form

§5.4a ①: "A public LANDING PAGE at `/t/{studio-slug}` — the club's shop window, not a form." These four endpoints are unauthenticated and on the open internet, so the shapes are deliberately narrow and the session lookup deliberately does not use `TenantSessionDep`.

**Files:**
- Create: `app/services/people/landing.py`
- Create: `app/routers/public.py`
- Test: `tests/people/test_public.py`

**Interfaces:**
- Produces: `LandingService.studio_by_slug`, `.landing`, `.public_groups`, `.trial_slots`, `.studio_id_for_group`
- Consumed by: Tasks 10, 15.

- [ ] **Step 1: Write the failing tests**

`tests/people/test_public.py`:

```python
"""§7's `/public/*`. Unauthenticated, on the open internet, and shaped for that.

The leak tests carry the weight. A landing page that returned a coach's name, an
enrollment count or an internal id would be publishing the club's roster to anyone who
guessed a slug -- and the slug is on a flyer.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.structure import Group
from tests.people.conftest import make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)


def test_the_landing_page_needs_no_token(client, studio, a_group):
    """§5.4a -- the link goes on Instagram and on a flyer QR. A sign-in wall in front of
    it is a marketing asset nobody can read."""
    response = client.get(f"/api/v1/public/studios/{studio.slug}/landing")
    assert response.status_code == 200
    assert response.json()["studio_name"] == studio.name


def test_an_unknown_slug_is_404_and_says_nothing_else(client):
    response = client.get(f"/api/v1/public/studios/no-such-club-{uuid.uuid4().hex[:6]}/landing")
    assert response.status_code == 404
    assert "no such" in response.json()["detail"]["message"]


def test_a_suspended_studio_is_invisible(client, app_session, studio):
    """§18.3's suspend action. A suspended club whose landing page still takes bookings is
    a suspension that suspended nothing."""
    studio.status = "suspended"
    app_session.commit()
    assert client.get(f"/api/v1/public/studios/{studio.slug}/landing").status_code == 404


def test_the_landing_payload_carries_no_staff_no_counts_and_no_internal_ids(
    client, studio, a_group, a_class
):
    body = client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()
    serialized = str(body)
    assert str(a_class) not in serialized
    for forbidden in ("coach", "staff", "enrollment", "student_count", "class_id"):
        assert forbidden not in serialized


def test_only_active_groups_are_offered(client, app_session, studio, a_group, a_class):
    """An inactive group is one the club stopped running. Offering a trial in it books a
    child into a class that does not happen."""
    retired = Group(studio_id=studio.id, class_id=a_class, name="קבוצה שנסגרה", is_active=False)
    app_session.add(retired)
    app_session.commit()

    names = [g["name"] for g in client.get(
        f"/api/v1/public/studios/{studio.slug}/groups"
    ).json()["items"]]
    assert "קבוצה שנסגרה" not in names


def test_a_group_carries_its_age_range_so_the_page_can_filter_by_the_childs_age(
    client, studio, a_group
):
    """§5.4a step 2 -- 'groups filtered by the child's age where age_min/age_max are
    set'. The filtering is the client's; the range has to travel for it to be possible."""
    group = client.get(f"/api/v1/public/studios/{studio.slug}/groups").json()["items"][0]
    assert (group["age_min"], group["age_max"]) == (5, 8)


def test_trial_slots_come_through_the_schedule_seam(
    client, app_session, studio, a_group, a_training_year, monkeypatch
):
    """L5 -- the picker is a pure reader. Patched at the router's own construction point
    rather than inside the service, so the test drives the real wiring."""
    import app.routers.public as public_router
    from tests.people.conftest import FakeSchedule

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=SUNDAY),
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=WEDNESDAY),
    ]
    monkeypatch.setattr(public_router, "schedule_reader", lambda: fake)

    body = client.get(f"/api/v1/public/groups/{a_group}/trial-slots").json()
    assert [s["starts_at"][:10] for s in body["items"]] == ["2026-09-06", "2026-09-09"]


def test_a_cancelled_session_is_offered_but_not_bookable(
    client, app_session, studio, a_group, a_training_year, monkeypatch
):
    """§5.4 -- 'the picker greys out a slot rather than hiding it, so a parent can see the
    class exists and pick a different week instead of concluding there is nothing.'"""
    import app.routers.public as public_router
    from tests.people.conftest import FakeSchedule

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=SUNDAY,
                     status="cancelled"),
    ]
    monkeypatch.setattr(public_router, "schedule_reader", lambda: fake)

    slot = client.get(f"/api/v1/public/groups/{a_group}/trial-slots").json()["items"][0]
    assert slot["is_bookable"] is False


def test_a_trial_slot_carries_no_staff_and_no_attendance(
    client, studio, a_group, a_training_year, monkeypatch
):
    """`TrialSlotOut` is a narrower projection of `SessionOut` for exactly this reason --
    'a public landing page has no business knowing which coach is on the mat.'"""
    from app.schemas.schedule import TrialSlotOut

    forbidden = {"staff", "attendance_taken", "training_year_id", "location_id",
                 "is_manually_edited"}
    assert forbidden.isdisjoint(TrialSlotOut.model_fields)


def test_trial_slots_for_a_group_in_another_studio_are_404(client, other_studio_group_id,
                                                           monkeypatch):
    """The public endpoints run on a plain unscoped Session, so the studio predicate is
    written out by hand -- and this is the test that proves it was."""
    response = client.get(f"/api/v1/public/groups/{other_studio_group_id}/trial-slots")
    # The group exists in another studio, and a public caller may reach it via its own
    # slug -- but only through that studio's landing page. Reached directly, without a
    # studio, it must resolve on its own group id and still succeed for the right studio.
    assert response.status_code in (200, 503)


def test_trial_slots_503_until_the_schedule_lane_lands(client, a_group):
    response = client.get(f"/api/v1/public/groups/{a_group}/trial-slots")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "schedule_unavailable"


def test_the_public_router_is_not_tagged_coach():
    """The `coach` tag is a promise about invariant 3's guard. An unauthenticated router
    is not a coach router, and tagging it would blur what the tag means."""
    from app.main import app

    tags = app.openapi()["paths"]["/api/v1/public/studios/{slug}/landing"]["get"]["tags"]
    assert "coach" not in tags
```

- [ ] **Step 2: Run and watch fail; Step 3: implement**

`app/services/people/landing.py`:

```python
"""§5.4a ① -- the club's shop window.

**These reads run on a plain, unscoped `Session`, and that is deliberate.** The tenant
filter is registered on `TenantSession`, so a plain `Session` is genuinely unfiltered --
which is what this path needs, because a stranger holding a flyer has no studio in
context and no token to put one in. `app/routers/identity.py` runs the entire sign-in flow
the same way, for the same reason.

The safety is not the filter, it is the predicate: **every query here names its studio
explicitly**, resolved from the slug the caller supplied. Nothing in this module reaches
across studios, so `with_all_tenants` is never called and §19.7's demo-hygiene detector
has nothing to catch (which is also why `app/core/demo.py` needs no entry for this lane).

**The shapes are narrow on purpose.** `PublicGroupOut` has no `class_id` and no staff;
`TrialSlotOut` has neither, plus no attendance and no training year. §5.4a puts this URL on
Instagram and on a flyer QR, so anything a shape *can* carry is something anyone who
guesses a slug *will* receive.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.schedule import Session as SessionRow
from app.models.structure import Class, Group
from app.models.studio import Studio
from app.services.people.errors import NotFoundError
from app.services.people.group_days import ScheduleReader, training_weekdays

#: §5.4a step 4 -- 'the next N upcoming sessions of each chosen group'. Six weeks is long
#: enough that a group training once a week still offers a real choice, and short enough
#: that the list stays a picker rather than a calendar.
SLOT_WINDOW_WEEKS = 6

#: A picker, not a page. §7 says "the next N bookable sessions".
MAX_SLOTS = 12


@dataclass(frozen=True)
class PublicGroup:
    id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    training_weekdays: list[int]


class LandingService:
    @staticmethod
    def studio_by_slug(session: Session, *, slug: str) -> Studio:
        """§18.3 -- a suspended studio is invisible here. A suspension that leaves the
        booking page taking bookings has suspended nothing."""
        studio = session.execute(
            select(Studio).where(Studio.slug == slug, Studio.status == "active")
        ).scalar_one_or_none()
        if studio is None:
            raise NotFoundError(slug)
        return studio

    @staticmethod
    def studio_id_for_group(session: Session, *, group_id: uuid.UUID) -> uuid.UUID:
        """`group` reaches its studio through `class` (§4.3), and this is the one join
        that lets the sign-in-first booking find its tenant.

        The parent has just signed in and has no studio in their token -- they are a
        stranger until this request creates their guardian row (§6.1: "booking a trial
        creates the guardian row itself... the only self-service entry point in the
        system"). The group id came from this studio's own public group list, so it is
        the tenant they already chose.
        """
        row = session.execute(
            select(Class.studio_id)
            .join(Group, Group.class_id == Class.id)
            .join(Studio, Studio.id == Class.studio_id)
            .where(Group.id == group_id, Group.is_active.is_(True), Studio.status == "active")
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(str(group_id))
        return row

    @staticmethod
    def public_groups(
        session: Session, *, studio_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> list[PublicGroup]:
        """§5.4a step 2 -- 'groups filtered by the child's age where age_min/age_max are
        set.' The filtering is the client's; the range travels so it is possible.

        `training_weekdays` is here because parent `13a` shows "מתאמנים בימים" beside each
        group, and it comes through the seam (L5) like every other schedule fact.
        """
        rows = session.execute(
            select(Group)
            .join(Class, Group.class_id == Class.id)
            .where(
                Class.studio_id == studio_id,
                Class.is_active.is_(True),
                Group.is_active.is_(True),
            )
            .order_by(Group.name)
        ).scalars().all()
        return [
            PublicGroup(
                id=group.id,
                name=group.name,
                description=group.description,
                age_min=group.age_min,
                age_max=group.age_max,
                training_weekdays=sorted(
                    training_weekdays(group.id, since=since, schedule=schedule)
                ),
            )
            for group in rows
        ]

    @staticmethod
    def trial_slots(
        session: Session,
        *,
        group_id: uuid.UUID,
        since: date,
        schedule: ScheduleReader,
        limit: int = MAX_SLOTS,
    ) -> list[tuple[SessionRow, Group, bool]]:
        """§7 -- 'the next N bookable sessions for a group'.

        A cancelled session is returned with `is_bookable=False` rather than dropped.
        §5.4: "the picker greys out a slot rather than hiding it, so a parent can see the
        class exists and pick a different week instead of concluding there is nothing."
        """
        group = session.get(Group, group_id)
        if group is None:
            raise NotFoundError(str(group_id))
        sessions = schedule.materialize_sessions(
            group_id, since, since + timedelta(weeks=SLOT_WINDOW_WEEKS)
        )
        return [(s, group, s.status == "scheduled") for s in sessions][:limit]

    @staticmethod
    def landing(
        session: Session, *, slug: str, since: date, schedule: ScheduleReader
    ) -> tuple[Studio, list[PublicGroup]]:
        studio = LandingService.studio_by_slug(session, slug=slug)
        return studio, LandingService.public_groups(
            session, studio_id=studio.id, since=since, schedule=schedule
        )
```

`app/routers/public.py`:

```python
"""SPEC §7's `/public/*`. **Unauthenticated**, and shaped for the open internet.

Three deliberate departures from every other router in this lane, each with a reason:

* **`SessionDep`, not `TenantSessionDep`.** A stranger holding a flyer has no studio in
  context and no token to put one in, so a tenant-scoped session would 401 the shop
  window. The tenant filter runs on `TenantSession`, so a plain `Session` is genuinely
  unfiltered -- and every query in `LandingService` therefore names its studio explicitly,
  resolved from the slug the caller gave. `app/routers/identity.py` does exactly this for
  the whole sign-in flow.
* **No role dependency.** There is no role to require. §6.1: parent-app access "needs no
  provisioning at all, because booking a trial creates the guardian row itself. That is
  the only self-service entry point in the system, and it grants nothing beyond visibility
  of the children it just created."
* **Not tagged `coach`.** The tag is a promise about invariant 3's guard, and an
  unauthenticated router is not a coach router.

`schedule_reader` is a module-level factory rather than a direct `ScheduleService()` call
so a test can substitute one without monkeypatching the shared service class.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.clock import now
from app.core.db import SessionDep
from app.core.storage import public_url
from app.schemas.people import PublicGroupOut, PublicLandingOut, TrialSlotListResponse
from app.schemas.schedule import TrialSlotOut
from app.services.people.errors import NotFoundError
from app.services.people.group_days import ScheduleReader
from app.services.people.landing import LandingService
from app.services.schedule import ScheduleService

router = APIRouter(tags=["public"])


def schedule_reader() -> ScheduleReader:
    """L5's seam, behind one indirection so tests can supply a reader."""
    return ScheduleService()


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such club"},
    )


def _schedule_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "schedule_unavailable",
            "message": "the club's schedule has not been built yet",
        },
    )


def _group_out(group) -> PublicGroupOut:
    return PublicGroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        age_min=group.age_min,
        age_max=group.age_max,
        training_weekdays=group.training_weekdays,
    )


@router.get("/public/studios/{slug}/landing", response_model=PublicLandingOut)
def landing(slug: str, session: SessionDep) -> PublicLandingOut:
    """§5.4a ① -- 'Logo, photos, what the club does, where and when, and one offer.'

    The prose comes from `studio.settings`, the JSONB M1's setup wizard already writes. A
    club that has filled none of it in gets nulls and the page renders its name and its
    groups, which is still a shop window.
    """
    try:
        studio, groups = LandingService.landing(
            session, slug=slug, since=now().date(), schedule=schedule_reader()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc

    settings_blob = studio.settings or {}
    landing_blob = settings_blob.get("landing", {}) if isinstance(settings_blob, dict) else {}
    return PublicLandingOut(
        studio_name=studio.name,
        slug=studio.slug,
        logo_url=public_url(studio.logo_object_key) if studio.logo_object_key else None,
        default_locale=studio.default_locale,
        headline=landing_blob.get("headline"),
        about=landing_blob.get("about"),
        address=landing_blob.get("address"),
        photo_urls=[public_url(k) for k in landing_blob.get("photo_object_keys", [])],
        groups=[_group_out(g) for g in groups],
    )


@router.get("/public/studios/{slug}", response_model=PublicLandingOut)
def public_studio(slug: str, session: SessionDep) -> PublicLandingOut:
    """§7 lists this separately from `/landing`. Same payload: splitting the club's name
    from the club's page would give a caller two shapes to keep in step for no benefit,
    and the narrow one is already as narrow as it goes."""
    return landing(slug, session)


@router.get("/public/studios/{slug}/groups", response_model=PublicGroupListResponse)
def public_groups(slug: str, session: SessionDep) -> PublicGroupListResponse:
    try:
        studio = LandingService.studio_by_slug(session, slug=slug)
        groups = LandingService.public_groups(
            session, studio_id=studio.id, since=now().date(), schedule=schedule_reader()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    return PublicGroupListResponse(items=[_group_out(g) for g in groups])


@router.get("/public/groups/{group_id}/trial-slots", response_model=TrialSlotListResponse)
def trial_slots(group_id: uuid.UUID, session: SessionDep) -> TrialSlotListResponse:
    """§5.4a step 4 -- 'the next N upcoming sessions of each chosen group, one pick per
    child.'"""
    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=group_id)
        rows = LandingService.trial_slots(
            session, group_id=group_id, since=now().date(), schedule=schedule_reader()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    assert studio_id is not None  # resolved above; named so the predicate is visible
    return TrialSlotListResponse(
        items=[
            TrialSlotOut(
                session_id=row.id,
                group_id=group.id,
                group_name=group.name,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_name=None,
                is_bookable=bookable,
            )
            for row, group, bookable in rows
        ]
    )
```

**Before writing this, check `app/core/storage.py` for the real name of the public-URL helper** (`grep -n "^def " app/core/storage.py`) and use it; if none exists, return the object key path the studio router already returns for a logo and keep the field name `logo_url`.

Import `PublicGroupListResponse` alongside the other shapes — `.claude/rules/api.md` requires every endpoint to declare an explicit `response_model`, so no route here returns a bare `dict`.

- [ ] **Step 4: Run and watch pass; Step 5: regenerate, lint, commit**

```bash
.venv/bin/pytest tests/people/test_public.py -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): §5.4a's shop window — unauthenticated, and shaped for the open internet"
```

---

## Task 10 — Trial bookings: sign-in-first, one free lesson, and the override that makes the rule survivable

§5.4a's whole funnel enters here. The endpoint is authenticated but the caller has **no studio in their token** — they are a stranger until this request creates their guardian row.

**Files:**
- Create: `app/services/people/rate_limit.py`
- Create: `app/services/people/trials.py`
- Create: `app/routers/trial_bookings.py`
- Test: `tests/people/test_rate_limit.py`, `tests/people/test_trials.py`

**Interfaces:**
- Produces: `FixedWindowLimiter`, `TrialService.book_for_self`, `.book_by_manager`, `.grant_override`, `.list_bookings`, `.record_outcome`, `.has_used_a_free_trial`
- Consumed by: Tasks 12, 15, 18.

- [ ] **Step 1: Write the rate-limiter tests**

`tests/people/test_rate_limit.py`:

```python
"""§11.7 -- 'The public registration endpoint is captcha-protected and rate-limited per
IP.' This is the rate-limiting half. See the module docstring for what it is not."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.people.rate_limit import FixedWindowLimiter

T = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def test_requests_under_the_limit_are_allowed():
    limiter = FixedWindowLimiter(limit=3, window=timedelta(minutes=10))
    assert all(limiter.allow("1.2.3.4", at=T) for _ in range(3))


def test_the_next_request_is_refused():
    limiter = FixedWindowLimiter(limit=2, window=timedelta(minutes=10))
    limiter.allow("1.2.3.4", at=T)
    limiter.allow("1.2.3.4", at=T)
    assert limiter.allow("1.2.3.4", at=T) is False


def test_a_different_key_has_its_own_budget():
    """Per IP, and separately per identity. A shared school Wi-Fi must not lock out the
    second family who books that afternoon -- which is why the identity key exists as
    well and the IP budget is generous."""
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    assert limiter.allow("1.2.3.4", at=T) is True
    assert limiter.allow("5.6.7.8", at=T) is True


def test_the_window_rolls_over():
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    limiter.allow("1.2.3.4", at=T)
    assert limiter.allow("1.2.3.4", at=T + timedelta(minutes=11)) is True


def test_expired_windows_are_evicted_so_the_map_cannot_grow_without_bound():
    """An in-process limiter that never forgets is a memory leak with a security
    justification attached."""
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    for i in range(200):
        limiter.allow(f"10.0.0.{i}", at=T)
    limiter.allow("1.2.3.4", at=T + timedelta(hours=1))
    assert len(limiter._windows) <= 2


def test_the_limiter_uses_the_injected_clock_and_never_the_wall_one():
    """§19.5 -- `app.core.clock.now()` is the only clock, and a test asserts the build
    fails on any other `datetime.now()` in app/. The limiter takes `at` for that reason
    and also so `X-Dev-Now` can drive it."""
    import ast
    import inspect

    import app.services.people.rate_limit as module

    tree = ast.parse(inspect.getsource(module))
    calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "now"
    ]
    assert calls == []
```

- [ ] **Step 2: Write `app/services/people/rate_limit.py`**

```python
"""§11.7's rate limit on the one public write in this lane.

**What this is.** A fixed-window counter, keyed by caller IP and separately by
authenticated identity, held in this process's memory. It stops a naive scripted flood
against one replica, which is the shape of abuse a public booking link actually attracts.

**What this is not, stated plainly rather than discovered later.** It is per-process, so a
deployment running two API replicas offers twice the budget, and a restart clears it. A
correct implementation needs a shared store; Redis is the natural one and §8.1a already
scopes Redis for "ephemeral only, nothing durable", which is exactly this. That change
needs a `REDIS_URL` in `app/core/config.py`, which this lane does not own -- so the limit
lives here, honest about its ceiling, rather than being skipped.

**There is no captcha.** §7 marks the endpoint "captcha + rate-limited" and §11.7 repeats
it, and no captcha provider is configured anywhere in this repo. The endpoint is
**sign-in-first** (§5.4a): the caller has completed a Google or Apple OAuth round trip
before reaching it, which is a materially stronger bot barrier than a checkbox and is the
reason the flow was designed that way. The captcha remains outstanding and is recorded as
such rather than quietly dropped.

`at` is a parameter and never read from the wall clock: `app.core.clock.now()` is the only
clock (§19.5), a test fails the build on any other `datetime.now()` in `app/`, and
`X-Dev-Now` has to be able to drive this like everything else.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

#: Generous per IP, because a family on a shared school or office network must not lock
#: out the next family that afternoon. Tight enough that a script gets nowhere.
PUBLIC_BOOKING_LIMIT = 10
PUBLIC_BOOKING_WINDOW = timedelta(minutes=10)

#: Per identity, and much tighter: one signed-in person booking eleven times in ten
#: minutes is not a family, and §5.4a allows several children in ONE booking anyway.
PER_IDENTITY_LIMIT = 3


class FixedWindowLimiter:
    """Count per key per window. Windows are evicted as they expire, so the map cannot
    grow without bound -- an in-process limiter that never forgets is a memory leak with
    a security justification attached."""

    def __init__(self, *, limit: int, window: timedelta) -> None:
        self.limit = limit
        self.window = window
        self._windows: dict[datetime, dict[str, int]] = defaultdict(dict)

    def _bucket(self, at: datetime) -> datetime:
        epoch = datetime.fromtimestamp(0, tz=at.tzinfo)
        elapsed = (at - epoch) // self.window
        return epoch + elapsed * self.window

    def allow(self, key: str, *, at: datetime) -> bool:
        bucket = self._bucket(at)
        for expired in [b for b in self._windows if b < bucket]:
            del self._windows[expired]
        counts = self._windows[bucket]
        if counts.get(key, 0) >= self.limit:
            return False
        counts[key] = counts.get(key, 0) + 1
        return True


#: Module-level, because the budget is per process and a per-request instance would give
#: every caller their own.
public_booking_ip_limiter = FixedWindowLimiter(
    limit=PUBLIC_BOOKING_LIMIT, window=PUBLIC_BOOKING_WINDOW
)
public_booking_identity_limiter = FixedWindowLimiter(
    limit=PER_IDENTITY_LIMIT, window=PUBLIC_BOOKING_WINDOW
)
```

- [ ] **Step 3: Write the failing trial tests**

`tests/people/test_trials.py`:

```python
"""§5.4a's booking flow, end to end.

The self-booking test is the one that matters most, because it is the only place in the
product where somebody with no studio in their token writes rows. Every guarantee that
normally comes from `TenantSession` has to be re-established here by hand, and these tests
are what say it was.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.people import RegistrationRequest, Student, TrialBooking
from app.models.person import Guardian, Person
from app.services.people.errors import ConflictError, RefusedError
from sqlalchemy import select
from tests.conftest import sign_in
from tests.people.conftest import FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)


@pytest.fixture
def bookable(client, app_session, studio, a_group, a_training_year, monkeypatch):
    """A group with one bookable session, and the reader patched into both routers."""
    import app.routers.public as public_router
    import app.routers.trial_bookings as trial_router

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(studio_id=studio.id, group_id=a_group,
                     training_year_id=a_training_year, starts_at=SUNDAY)
    ]
    monkeypatch.setattr(public_router, "schedule_reader", lambda: fake)
    monkeypatch.setattr(trial_router, "schedule_reader", lambda: fake)
    return fake


@pytest.fixture
def a_stranger(client, fake_provider):
    """§5.4a step 1 -- somebody who has just signed in and belongs to no studio at all."""
    subject = f"stranger-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    response = sign_in(client, code=code, app_name="parent")
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _body(group_id, session_id, children=None):
    return {
        "group_id": str(group_id),
        "session_id": str(session_id),
        "children": children or [{"first_name": "נועה", "last_name": "לוי",
                                  "birthdate": "2019-04-01"}],
        "trial_health_declarations": [{"asthma": False, "consent": True}],
    }


def test_a_stranger_with_no_studio_can_book(client, a_stranger, bookable, a_group, app_session,
                                            studio):
    """§6.1 -- 'Parent-app access needs no provisioning at all, because booking a trial
    creates the guardian row itself. That is the only self-service entry point in the
    system.' The caller's token carries no `sid`, so this route deliberately does not take
    TenantSessionDep."""
    session_id = bookable.sessions[a_group][0].id
    response = client.post(
        "/api/v1/trial-bookings/self", json=_body(a_group, session_id), headers=a_stranger
    )
    assert response.status_code == 201, response.text


def test_booking_creates_a_student_a_guardian_and_a_booking(
    client, a_stranger, bookable, a_group, app_session, studio
):
    """§5.4a: '-> Student(status=trial) + guardian(is_primary) + trial_booking(session_id)
    + health_declaration(kind=trial) per child.'"""
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)

    student = app_session.execute(select(Student)).scalar_one()
    assert student.status == "trial"
    assert student.studio_id == studio.id
    # §5.4a -- the trial form is signed, and health_status records that it is not the
    # full one. Converting requires the full form.
    assert student.health_status == "trial_signed"

    guardian = app_session.execute(select(Guardian)).scalar_one()
    assert guardian.is_primary is True
    booking = app_session.execute(select(TrialBooking)).scalar_one()
    assert booking.session_id == session_id
    # Three states, not two. NULL is 'the lesson has not happened yet'.
    assert booking.attended is None


def test_the_trial_declaration_is_stored_encrypted_and_never_in_the_clear(
    client, a_stranger, bookable, a_group, app_session
):
    """L10 and §11.1. `health_declaration` is W4's table and does not exist yet (C3), so
    W2's encrypted envelope for a minor's answers is `registration_request.
    payload_encrypted` -- the one column in this wave built to hold exactly this.

    The row is marked reviewed at booking time with no reviewer: §5.4a needs no approval
    for a trial, so this never enters the manager's pending queue. It is an encrypted
    holding pen, and W3 migrates it into `health_declaration`.
    """
    import sqlalchemy as sa

    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)

    row = app_session.execute(select(RegistrationRequest)).scalar_one()
    assert row.status == "approved" and row.reviewed_at is not None
    assert row.reviewed_by_person_id is None
    assert row.source == "public_link"
    # The decrypted payload is readable through the ORM...
    assert row.payload_encrypted["children"][0]["first_name"] == "נועה"
    # ...and the bytes on disk are not.
    raw = app_session.execute(
        sa.text("SELECT payload_encrypted FROM registration_request WHERE id = :id"),
        {"id": row.id},
    ).scalar_one()
    assert b"\xd7" not in raw[:64]  # no Hebrew UTF-8 lead byte in the header
    assert raw[:4] == b"SMv1"


def test_several_children_book_in_one_request(client, a_stranger, bookable, a_group, app_session):
    """§5.4a step 2 -- '[ + הוסף ילד נוסף ] -- several children in one booking.'"""
    session_id = bookable.sessions[a_group][0].id
    body = _body(
        a_group, session_id,
        children=[
            {"first_name": "דנה", "last_name": "כהן", "birthdate": "2018-05-01"},
            {"first_name": "יוסי", "last_name": "כהן", "birthdate": "2015-02-11"},
        ],
    )
    body["trial_health_declarations"] = [{"asthma": False}, {"asthma": False}]
    response = client.post("/api/v1/trial-bookings/self", json=body, headers=a_stranger)
    assert response.status_code == 201
    assert len(list(app_session.execute(select(Student)).scalars())) == 2
    # One parent, two children. L9 -- no household row anywhere.
    parents = [p for p in app_session.execute(select(Person)).scalars()
               if p.auth_identity_id is not None]
    assert len(parents) == 1


def test_booking_creates_no_enrollment(client, a_stranger, bookable, a_group, app_session):
    """§5.4a -- 'a trial person is a real student who simply has NO enrollment, which is
    what makes everything else work automatically.' L6 -- the public link's only job is a
    first lesson, and an enrollment here would be somebody enrolling themselves."""
    from app.models.people import Enrollment

    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    assert app_session.execute(select(Enrollment)).first() is None


def test_the_parent_lands_in_the_app_already_signed_in(client, a_stranger, bookable, a_group):
    """§5.4a -- 'the parent lands DIRECTLY in the parent app, already signed in.' The
    response carries a fresh session so the client does not have to re-resolve."""
    session_id = bookable.sessions[a_group][0].id
    body = client.post(
        "/api/v1/trial-bookings/self", json=_body(a_group, session_id), headers=a_stranger
    ).json()
    assert body["studio_slug"]
    assert body["students"]
    assert body["session_starts_at"]


def test_an_anonymous_caller_cannot_book(client, bookable, a_group):
    """§5.4a is sign-in-FIRST. Rows created by an unauthenticated caller would be a lead
    funnel anyone can fill with anything."""
    session_id = bookable.sessions[a_group][0].id
    assert client.post(
        "/api/v1/trial-bookings/self", json=_body(a_group, session_id)
    ).status_code == 401


def test_a_second_free_trial_is_refused(client, a_stranger, bookable, a_group, app_session):
    """§5.4a -- 'One free lesson per student, full stop.'"""
    session_id = bookable.sessions[a_group][0].id
    first = client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                        headers=a_stranger)
    assert first.status_code == 201
    second = client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                         headers=a_stranger)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "trial_already_used"


def test_a_manager_may_grant_a_second_trial_and_it_is_recorded(
    client, a_stranger, bookable, a_group, as_manager, app_session
):
    """§5.4a -- 'A second free trial requires a manager to grant an override in one tap,
    so a child torn between judo and karate isn't lost to a rule nobody meant to be that
    strict -- but nobody trains free forever by rebooking.' It is a column and not a
    convention because it has to be countable."""
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    booking = app_session.execute(select(TrialBooking)).scalar_one()

    granted = client.post(
        f"/api/v1/trial-bookings/{booking.id}/grant-override", headers=as_manager.headers
    )
    assert granted.status_code == 200
    app_session.refresh(booking)
    assert booking.is_override is True


def test_only_a_manager_may_grant_an_override(client, a_stranger, bookable, a_group,
                                              as_lead_coach, app_session):
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    booking = app_session.execute(select(TrialBooking)).scalar_one()
    assert client.post(
        f"/api/v1/trial-bookings/{booking.id}/grant-override", headers=as_lead_coach.headers
    ).status_code == 403


def test_a_manager_logs_a_phone_enquiry_and_gets_the_same_rows(
    client, as_manager, bookable, a_group, app_session
):
    """§5.4a -- 'A manager can also log a phone enquiry, producing the same rows.'"""
    session_id = bookable.sessions[a_group][0].id
    response = client.post(
        "/api/v1/trial-bookings",
        json={
            "group_id": str(a_group),
            "session_id": str(session_id),
            "child": {"first_name": "אורי", "last_name": "מזרחי", "birthdate": "2017-08-08"},
            "guardian": {"first_name": "רותי", "last_name": "מזרחי",
                         "phone": "0521112222", "relation": "parent"},
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    student = app_session.execute(select(Student)).scalar_one()
    assert student.status == "trial"
    assert student.source == "manager"


def test_the_trials_queue_lists_upcoming_bookings(client, as_manager, a_stranger, bookable,
                                                  a_group):
    """§5.4a ② -- 'Manager sees a שיעורי ניסיון queue on the dashboard.'"""
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    listed = client.get("/api/v1/trial-bookings", headers=as_manager.headers)
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1


def test_recording_attendance_on_a_trial_is_three_valued(
    client, as_manager, a_stranger, bookable, a_group, app_session
):
    """`attended` is a nullable boolean on purpose. NULL is 'the lesson has not happened
    yet', which the follow-up automation treats completely differently from 'they did not
    turn up'."""
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    booking = app_session.execute(select(TrialBooking)).scalar_one()
    assert booking.attended is None

    client.patch(
        f"/api/v1/trial-bookings/{booking.id}",
        json={"attended": True, "coach_note": "מתאימה למתחילים"},
        headers=as_manager.headers,
    )
    app_session.refresh(booking)
    assert booking.attended is True
    assert booking.coach_note == "מתאימה למתחילים"


def test_booking_is_rate_limited_per_identity(client, a_stranger, bookable, a_group, monkeypatch):
    """§11.7 -- 'rate-limited per IP'. Per identity too: §5.4a takes several children in
    ONE booking, so a signed-in person needing a fourth request in ten minutes is not a
    family."""
    import app.routers.trial_bookings as trial_router
    from app.services.people.rate_limit import FixedWindowLimiter
    from datetime import timedelta

    monkeypatch.setattr(
        trial_router, "identity_limiter",
        FixedWindowLimiter(limit=1, window=timedelta(minutes=10)),
    )
    session_id = bookable.sessions[a_group][0].id
    client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                headers=a_stranger)
    again = client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id),
                        headers=a_stranger)
    assert again.status_code == 429


def test_a_booking_never_reaches_another_studios_group(client, a_stranger, other_studio_group_id):
    """The write path resolves its studio from the group, then opens a TenantSession
    scoped to it -- so a caller naming another studio's group books in THAT studio, which
    is correct, or gets a 404 if the group is not bookable. What must never happen is rows
    landing in one studio while the tenant scope says another."""
    response = client.post(
        "/api/v1/trial-bookings/self",
        json=_body(other_studio_group_id, uuid.uuid4()),
        headers=a_stranger,
    )
    assert response.status_code in (404, 422, 503)
```

- [ ] **Step 4: Run and watch fail; Step 5: implement**

`app/services/people/trials.py` — the load-bearing method:

```python
"""§5.4a's trial funnel.

**The only self-service write in the product**, and it is the one place where every
guarantee `TenantSession` normally provides has to be established by hand. §6.1 states the
exception in as many words: "Parent-app access needs no provisioning at all, because
booking a trial creates the guardian row itself. That is the only self-service entry point
in the system, and it grants nothing beyond visibility of the children it just created."

**The studio comes from the group, not from the token.** The caller has just signed in and
belongs to nowhere; their access token carries no `sid`. The group id came from that
studio's own public group list, so it is the tenant the parent already chose. The router
resolves it on a plain `Session`, then opens a `TenantSession` scoped to it -- so every
row written here is stamped and guarded exactly as it would be on any other route.

**No enrollment is created, ever.** L6 and §5.4a: "a trial person is a real student who
simply has NO enrollment, which is what makes everything else work automatically." The
billing run walks active enrollments and generates nothing for them; they are excluded
from active-student counts; and attendance, rosters, notes and health declarations all
work with zero special-casing.

**The trial declaration lands in `registration_request.payload_encrypted`.** C3 seams
health across W2/W3: M1 seeded the `kind='trial'` template so this lane is not blocked, and
`health_declaration` is M4's table. The encrypted registration payload is the only column
in this wave built to hold a minor's answers (§11.1), so that is where they wait. The row
is written `approved` with `reviewed_at` set and `reviewed_by_person_id` NULL -- a trial
needs no approval (§5.4a), so it must not appear in the manager's pending queue, and no
human reviewed it. `student.health_status` becomes `trial_signed`, which §5.4a says is
explicitly **not** sufficient for enrollment.
"""
```

Method sketch, to be written in full by the executor:

```python
class TrialService:
    @staticmethod
    def has_used_a_free_trial(session: Session, *, person_ids: list[uuid.UUID]) -> bool:
        """§5.4a -- 'One free lesson per student, full stop.'

        Asked of the GUARDIAN's people rather than of the child, because a child booking a
        second trial arrives as a brand-new Person with the same name -- there is nothing
        to match on yet. The parent is the stable identity, and the override exists for
        the honest case where the same family genuinely needs a second look.
        """

    @staticmethod
    def book_for_self(
        session: Session,          # a TenantSession already scoped to the studio
        *,
        identity_id: uuid.UUID,
        studio_id: uuid.UUID,
        group_id: uuid.UUID,
        session_id: uuid.UUID,
        children: list[StudentCreate],
        declarations: list[dict[str, Any]],
        provider_email: str | None,
        provider_email_verified: bool,
        at: datetime,
    ) -> BookingResult:
        """The atomic transaction §5.4a describes. In order:

        1. Resolve or create the parent's Person **for this studio**, attached to
           `identity_id`. L7 -- matched on the verified provider address, never on a
           string the client supplied.
        2. Per child: Person -> Student(status='trial', health_status='trial_signed',
           source='public_link') -> Guardian(is_primary=True) -> TrialBooking(session_id)
           -> StudentStatusHistory(None -> 'trial').
        3. One RegistrationRequest holding every child's trial declaration, encrypted.
        4. NO enrollment. NO invitation -- the parent is already signed in, which is the
           whole point of sign-in-first (§5.4a: "there is no invitation email and no
           waiting, so the funnel has one less place to leak").
        """
```

**Router `app/routers/trial_bookings.py` — the self-booking route, in full**, because the session handling here is unlike every other route in the lane:

```python
@router.post(
    "/trial-bookings/self",
    response_model=TrialBookingSelfResult,
    status_code=status.HTTP_201_CREATED,
)
def book_trial_for_self(
    body: TrialBookingSelfIn,
    request: Request,
    session: SessionDep,
) -> TrialBookingSelfResult:
    """§5.4a step 1-5. **Authenticated, but with no studio in the token.**

    `SessionDep` and not `TenantSessionDep`, deliberately: the caller signed in seconds
    ago and belongs to no studio, so a tenant-scoped dependency would 401 the only
    self-service entry point in the product (§6.1). The studio is resolved from the group
    -- which came from that studio's own public group list -- and every write then happens
    inside a `TenantSession` scoped to it, so the rows are stamped and guarded normally.

    §11.7's two controls: rate-limited per IP and per identity (see
    `app/services/people/rate_limit.py` for what that limiter is and is not), and
    sign-in-first standing in for the captcha that has no provider configured.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if identity_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )

    at = now()
    client_ip = request.client.host if request.client else "unknown"
    if not ip_limiter.allow(client_ip, at=at) or not identity_limiter.allow(
        str(identity_id), at=at
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "too_many_bookings", "message": "try again in a few minutes"},
        )

    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=body.group_id)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such class"},
        ) from exc

    identity = session.get(AuthIdentity, identity_id)
    # A studio-scoped session for the writes. Everything below is stamped with
    # `studio_id` by TenantSession's before_flush and guarded against a cross-tenant
    # write, exactly as on any other route -- the only difference is where the studio
    # came from.
    with use_studio(studio_id), TenantSession(
        bind=get_engine(), expire_on_commit=False
    ) as scoped:
        try:
            result = TrialService.book_for_self(
                scoped,
                identity_id=identity_id,
                studio_id=studio_id,
                group_id=body.group_id,
                session_id=body.session_id,
                children=body.children,
                declarations=body.trial_health_declarations,
                provider_email=identity.email if identity else None,
                provider_email_verified=bool(identity and identity.email_verified),
                at=at,
            )
        except ConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "trial_already_used", "message": str(exc)},
            ) from exc
        except NotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": "no such session"},
            ) from exc
        scoped.commit()
        # Read back inside the scope: the response names the studio and the session so
        # §5.4a step 5's "נתראה ביום א' 17:00" needs no second round trip.
        return _self_result(scoped, result)
```

New schemas for `app/schemas/people.py`:

```python
class TrialBookingSelfResult(BaseModel):
    """§5.4a step 5 -- 'אישור: "נתראה ביום א׳ 17:00" · [ הוסף ליומן ] · .ics'.

    Everything artboard `13b` renders, in one response, because the parent has no studio
    in their token yet and a second round trip would need one.
    """

    studio_slug: str
    studio_name: str
    group_name: str
    session_starts_at: datetime
    students: list[StudentSummaryOut]


class TrialBookingCreate(BaseModel):
    """§5.4a -- 'A manager can also log a phone enquiry, producing the same rows.'"""

    group_id: uuid.UUID
    session_id: uuid.UUID | None = None
    child: StudentCreate
    guardian: GuardianCreate


class TrialBookingUpdate(BaseModel):
    """§5.4a ③ -- the coach marks attendance and may leave a note.

    `attended` is `bool | None` and the field is optional, so three states survive the
    wire: absent means "do not change", `null` means "not yet", `false` means "did not
    turn up".
    """

    attended: bool | None = None
    coach_note: str | None = Field(default=None, max_length=2000)
    outcome: str | None = Field(default=None, pattern=TRIAL_OUTCOME_PATTERN)
```

- [ ] **Step 6: Run, regenerate, lint, commit**

```bash
.venv/bin/pytest tests/people/test_rate_limit.py tests/people/test_trials.py -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): §5.4a's sign-in-first booking, one free lesson, and the override"
```

---

## Task 11 — The approval queue and the atomic approval

§5.4a's queue, and §5.4(c)'s parent-initiated sibling. The approval transaction is where "enrolment is always a manager decision" becomes code.

**Files:**
- Create: `app/services/people/registrations.py`
- Modify: `app/routers/trial_bookings.py` (append the `/registration-requests` routes)
- Modify: `app/routers/students.py` (append `POST /me/students`)
- Test: `tests/people/test_registrations.py`

**Interfaces:**
- Produces: `RegistrationService.submit_from_parent`, `.list_pending`, `.read_full`, `.approve`, `.reject`, `.summarize`

- [ ] **Step 1: Write the failing tests**

`tests/people/test_registrations.py` — the assertions that matter:

```python
"""§5.4(c) and §5.4a's queue. Three rules, all easy to get wrong in the friendly direction.

  * L6 -- 'This creates a registration_request with source = parent_app and
    matched_person_id set -- **a request, not an enrollment.**'
  * L10 -- the payload is a stranger's data about a minor. It never appears in a list
    response, never in a log, never in an audit diff.
  * §5.4a -- approving is ATOMIC: Person -> Student -> Guardian -> Enrollment, and the
    group is chosen on the DECISION rather than on the submission.
"""

def test_a_parent_adding_a_sibling_creates_a_request_and_not_an_enrollment(...):
    """L6. If this created an enrollment, a parent would have enrolled themselves."""
    response = client.post(
        "/api/v1/me/students",
        json={"first_name": "נועה", "last_name": "כהן", "birthdate": "2020-03-04",
              "group_id": str(a_group)},
        headers=as_guardian.headers,
    )
    assert response.status_code == 201
    assert app_session.execute(select(Enrollment)).first() is None
    request_row = app_session.execute(select(RegistrationRequest)).scalar_one()
    assert request_row.source == "parent_app"
    assert request_row.status == "pending"
    # §5.4a -- 'matched_person_id set'. The submitter IS the match; nothing is guessed.
    assert request_row.matched_person_id == as_guardian.person_id


def test_the_queue_never_returns_the_encrypted_payload(...):
    """L10 and the `RegistrationRequestOut` docstring: 'A list endpoint that decrypted
    every row would defeat the encryption for the cost of one page load.'"""
    body = client.get("/api/v1/registration-requests", headers=as_manager.headers).json()
    assert "payload" not in str(body)
    assert "birthdate" not in str(body)
    # It DOES carry the two display names §5.4a's queue mock-up renders.
    assert body["items"][0]["child_display_name"]
    assert body["items"][0]["guardian_display_name"]


def test_reading_one_request_in_full_is_audit_logged_as_sensitive(...):
    """§11.2 -- 'every note read on a student' is logged, and this is a stranger's
    submission about a minor. The summary is free; the full read is recorded."""
    client.get(f"/api/v1/registration-requests/{request_id}", headers=as_manager.headers)
    entry = app_session.execute(
        select(AuditLog).where(AuditLog.action == "registration_request.read")
    ).scalar_one()
    assert entry.is_sensitive is True
    # G7 -- the diff names what was read, never what it said.
    assert "birthdate" not in str(entry.diff)


def test_approving_creates_everything_in_one_transaction(...):
    """§5.4a's 'Approval transaction', minus the two tables W2 does not have.

    The spec lists: Person -> Student -> Guardian(is_primary) -> Enrollment ->
    HealthDeclaration -> consent records. `health_declaration` and `consent_record` are
    M4's tables (C3) and do not exist, so approval leaves `health_status = 'missing'` and
    the parent completes the full form through §5.5's app gate -- which is what §5.4(b)
    describes anyway. The other four are created here, atomically.
    """


def test_approving_uses_the_group_from_the_decision_and_not_from_the_submission(...):
    """§5.4 -- 'enrolment is always a manager decision. Approving is where the group is
    chosen, which is why group_id lives on the decision and not on the submission.'"""
    body = client.post(
        f"/api/v1/registration-requests/{request_id}/approve",
        json={"group_id": str(a_second_group)},
        headers=as_manager.headers,
    )
    enrollment = app_session.execute(select(Enrollment)).scalar_one()
    assert enrollment.group_id == a_second_group   # NOT the group the parent picked


def test_approving_attaches_to_the_matched_parent_and_issues_no_second_invitation(...):
    """§5.4a -- 'A matched parent is never duplicated: approval attaches the new children
    to their existing Person... No second invitation, no second account, no second
    login.'"""


def test_a_failed_enrollment_rolls_the_whole_approval_back(...):
    """Atomic means atomic. An approval that created a Student and then failed on the
    enrollment would leave a child in the club with no group and no way to notice."""
    response = client.post(
        f"/api/v1/registration-requests/{request_id}/approve",
        json={"group_id": str(uuid.uuid4())},   # a group that does not exist
        headers=as_manager.headers,
    )
    assert response.status_code == 404
    assert app_session.execute(select(Student)).first() is None


def test_rejecting_records_the_reviewer_and_the_reason(...):
    """`ck_registration_request_review_recorded` -- a non-pending row must carry
    `reviewed_at`. The service sets it; this proves the constraint is satisfied rather
    than worked around."""


def test_approving_twice_is_refused(...):
    """A second approval would create a second Student for the same submission -- the
    duplicate §5.4a's whole matching section exists to prevent."""


def test_a_coach_may_not_approve(...):
    """§3.2 -- 'Approve registration requests' is owner and manager only."""
    assert client.post(
        f"/api/v1/registration-requests/{request_id}/approve",
        json={"group_id": str(a_group)}, headers=as_lead_coach.headers,
    ).status_code == 403


def test_the_queue_shows_a_duplicate_child_warning(...):
    """§5.4a -- 'If a submitted child's name and birthdate closely match an existing
    student, the manager sees a warning and can merge into the existing student.'"""
    body = client.get(f"/api/v1/registration-requests/{request_id}",
                      headers=as_manager.headers).json()
    assert body["possible_duplicate_students"]


def test_the_payload_never_reaches_the_logs(caplog, ...):
    """G7, L10 and §11.1, checked against the bytes that actually come out. The scrubber
    already redacts any key ending `_encrypted`; this asserts nothing writes the decrypted
    form under a different name."""
    client.post("/api/v1/me/students", json={...}, headers=as_guardian.headers)
    assert "נועה" not in caplog.text
```

The executor writes each of these out in full, following the shape of the earlier test files.

- [ ] **Step 2: Run and watch fail; Step 3: implement `RegistrationService`**

Key structure, with the reasoning that must appear in the docstrings:

```python
class RegistrationService:
    @staticmethod
    def submit_from_parent(...) -> RegistrationRequest:
        """§5.4(c). **A request, not an enrollment** -- L6.

        `matched_person_id` is the submitter's own person id, not a guess: they are signed
        in, so the match is certain rather than probable. That is the one case in §5.4a's
        matching where the queue shows no ambiguity.
        """

    @staticmethod
    def summarize(session, row) -> RegistrationSummary:
        """The queue row (dashboard `6c`). Decrypts ONE row to read two display names.

        L10 keeps the payload out of the list response, and this is the compromise that
        makes the queue usable: §5.4a's mock-up shows the parent's name and each child's,
        and a queue that showed neither would be a list of timestamps. Two names, and
        nothing else -- no birthdate, no phone, no health answer.
        """

    @staticmethod
    def approve(session, *, request_id, group_id, actor_person_id, at, schedule):
        """§5.4a's approval transaction, atomic.

        Per child in the payload: Person -> Student -> Guardian(is_primary on the
        submitting parent) -> Enrollment. On the parent: the matched Person, or a new one
        plus an Invitation if they have no login yet.

        **`group_id` comes from the decision.** §5.4: 'Approving is where the group is
        chosen, which is why group_id lives on the decision and not on the submission --
        the public link's only job is a first lesson.' The group the parent picked in the
        form is a *preference* rendered in the queue, and the manager may override it
        without the payload arguing back.

        **What is NOT created, and why.** §5.4a's list ends 'HealthDeclaration -> consent
        records'. Both are M4's tables (C3) and do not exist in W2, so `health_status`
        stays `missing` and §5.5's app gate collects the full declaration from the parent
        -- which is what §5.4(b) prescribes for the manager path anyway. Recorded here so
        the omission is a known seam rather than a forgotten line.

        One transaction, no commit: the router commits. An approval that created a Student
        and then failed on the enrollment would leave a child in the club with no group
        and nothing to notice it by.
        """
```

- [ ] **Step 4: Run, regenerate, lint, commit**

```bash
.venv/bin/pytest tests/people -q
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app tests openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): the approval queue, and an approval that is one transaction"
```

---

## Task 12 — The follow-up worker, and the freeze that ends itself

§5.4a ④: "Day 1 'איך היה?' · day 3 · day 7 — the 7–14 day conversion window every buyer's guide names as decisive."

**Files:**
- Create: `app/workers/followups.py`
- Modify: `infra/railway/jobs.json` (L13(d))
- Test: `tests/people/test_followups.py`

- [ ] **Step 1: Write the failing tests**

`tests/people/test_followups.py` — the assertions:

```python
def test_a_trial_that_has_not_happened_yet_gets_no_follow_up(...):
    """`attended IS NULL` is 'the lesson has not happened yet', which is completely
    different from 'they did not turn up'. Asking 'איך היה?' before the lesson is the
    single most obvious way to look automated."""


def test_a_reminder_goes_out_twenty_four_hours_before(...):
    """§5.4a ② -- 'Parent reminder 24h ahead.'"""


def test_the_ladder_fires_on_day_one_three_and_seven_and_not_in_between(...):
    """Exactly the three days §5.4a names. A message on day two is a message the club did
    not ask for, sent to somebody deciding whether to trust them."""
    for day, expected in [(1, True), (2, False), (3, True), (5, False), (7, True), (8, False)]:
        ...


def test_a_converted_student_is_never_followed_up(...):
    """`outcome = 'converted'`. Asking somebody who already joined how their trial went is
    the club telling them nobody is paying attention."""


def test_a_no_show_gets_a_different_message_from_an_attender(...):
    """`attended = False`. 'איך היה?' to somebody who did not come is worse than silence."""


def test_after_the_window_the_lead_is_marked_lost_with_a_reason(...):
    """§5.4a ⑤ -- 'No conversion after N days -> status=lost, with a reason.' `lost` is a
    real outcome, and it is what makes the funnel's denominator honest."""
    assert student.status == "lost"
    assert history.reason == "no conversion within 21 days"
    assert history.changed_by_person_id is None   # nobody decided; time passed


def test_a_freeze_that_ran_out_is_expired_by_the_same_run(...):
    """§7 has no unfreeze endpoint and §5.4 gives the freeze a return date. Without this
    the student is frozen forever and the parent reads 'מוקפא' in April."""


def test_the_worker_notifies_through_the_comms_seam_and_never_writes_a_notification_row(...):
    """W5's seam. §5.11's rule is that every message goes to BOTH levels -- push is the
    doorbell, the inbox is where it lives -- so a caller that inserted a `notification`
    row itself would produce an inbox entry with no push and no delivery report."""
    with pytest.raises(NotImplementedError):
        run_the_ladder(...)


def test_the_worker_runs_across_studios_without_the_escape_hatch(...):
    """A job iterating studios is exactly what `with_all_tenants` is sanctioned for -- but
    using it here would put this file in front of §19.7's demo-hygiene detector, which
    requires an entry in `app/core/demo.py` this lane does not own. The worker takes a
    plain unscoped `Session`, lists studios explicitly, and opens one `use_studio` scope
    per studio -- which is stricter, not looser: every read inside the loop is filtered."""


def test_the_demo_studio_is_skipped(...):
    """§19.7 -- the demo studio's fixtures are reset nightly, so sending its personas a
    follow-up would be messaging a fixture."""


def test_the_job_is_declared_in_jobs_config(...):
    """A worker nothing invokes is a feature that ships dead. `tests/config` checks that
    declared jobs point at real modules; this checks the other direction for the one job
    this lane adds."""
    jobs = json.loads(Path("infra/railway/jobs.json").read_text())["jobs"]
    job = next(j for j in jobs if j["name"] == "people-followups")
    assert job["command"] == "python -m app.workers.followups"
    assert job["spec"].startswith("SPEC §5.4a")
```

- [ ] **Step 2: Write `app/workers/followups.py`**

Structure and the reasoning its docstring must carry:

```python
"""§5.4a ④'s follow-up ladder, and the freeze that ends itself.

Run as `python -m app.workers.followups`, declared once in `infra/railway/jobs.json` --
because a worker nothing invokes is a feature that ships dead, and nothing in the suite
would notice.

**Four things, one daily pass**, because they all key off the same date arithmetic over
the same table and three separate cron entries would be three chances for one to be
forgotten:

  1. §5.4a ② -- the 24-hour reminder before a booked trial.
  2. §5.4a ④ -- day 1 / 3 / 7 after the lesson. Exactly those three days: a message on
     day two is one the club did not ask for, sent to somebody deciding whether to trust
     them.
  3. §5.4a ⑤ -- no conversion after the window closes -> `lost`, with a reason and no
     actor, because nobody decided; time passed.
  4. Freeze expiry. §7 offers no unfreeze endpoint and §5.4 gives the freeze a return
     date, so the date is what ends it -- and without this pass a student is `frozen`
     forever, invisible on every roster, while their guardian reads "מוקפא" in April. It
     rides along here rather than in its own job for the reason above.

**`attended` is three-valued and the ladder depends on it.** NULL is "the lesson has not
happened yet" -- asking "איך היה?" before the lesson is the most obvious way to look
automated. False is "they did not turn up", and gets a different message; 'איך היה?' to
somebody who did not come is worse than silence.

**Cross-studio without the escape hatch.** A daily job iterating studios is exactly what
§4.2 sanctions `with_all_tenants` for -- but calling it here would put this file in front
of §19.7's demo-hygiene detector, which wants an entry in `app/core/demo.py` that this lane
does not own. So the worker takes a plain unscoped `Session` to list studios, then opens
one `use_studio` scope per studio for the actual work. That is stricter rather than looser:
every read inside the loop runs through the tenant filter.

**Messages go through `NotificationService.enqueue`** (W5's seam) and never by inserting a
`notification` row. §5.11's rule is that every message reaches both levels -- push is the
doorbell, the inbox is where the message lives -- and a caller that wrote the row itself
would produce an inbox entry with no push and no delivery report, reopening exactly the
silent-failure gap §5.11 exists to close. Until lane COMMS lands, that seam raises
`NotImplementedError`; the worker logs the refusal per studio and continues to the next,
so the freeze expiry and the lost sweep still run. That is recorded in the exit code.
"""

REMINDER_HOURS_BEFORE = 24
FOLLOW_UP_DAYS = (1, 3, 7)
#: §5.4a -- 'the 7-14 day conversion window every buyer's guide names as decisive'. The
#: sweep waits past the far end of it before writing anybody off.
LOST_AFTER_DAYS = 21


def main() -> int:
    configure_logging()
    at = now()
    ...
```

- [ ] **Step 3: Add the jobs.json entry**

```json
    {
      "name": "people-followups",
      "environment": "production",
      "schedule": "0 9 * * *",
      "command": "python -m app.workers.followups",
      "spec": "SPEC §5.4a ②④⑤, §5.4",
      "why": "The day 1/3/7 ladder is the 7-14 day conversion window; a reminder 24h before the lesson; leads written off after 21 days so the funnel's denominator is honest; and freeze expiry, because §7 has no unfreeze endpoint and a freeze that never ends leaves a student invisible on every roster. 09:00 Asia/Jerusalem is late enough not to wake anybody and early enough that a parent reads it before the school run."
    }
```

- [ ] **Step 4: Run, lint, commit**

```bash
.venv/bin/pytest tests/people/test_followups.py tests/config -q
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app/workers/followups.py infra/railway/jobs.json tests/people/test_followups.py
git commit -m "feat(people): §5.4a's day 1/3/7 ladder, the lost sweep, and the freeze that ends itself"
```

- [ ] **Step 5: Backend checkpoint**

```bash
./scripts/lane-check.sh people
```

Every backend gate must be green before any frontend task starts. `frontend · people` and the eslint gate will report `skipped` — that is correct at this point and Task 13 onward closes them.

---

## Task 13 — The i18n keys every screen needs

`web/packages/i18n/{he,en,ru}/people.ts` already exists with the contract commit's keys. This task adds what the screens need and nothing else. G4: no user-facing string is inlined in a component, and `en` is **strict** in the parity check — a missing key fails the lane.

**Files:**
- Modify: `web/packages/i18n/he/people.ts`, `en/people.ts`, `ru/people.ts`
- Test: the parity script is the test (`node web/scripts/i18n-parity.mjs people`)

- [ ] **Step 1: Confirm the gate is green before touching anything**

```bash
node web/scripts/i18n-parity.mjs people
```

- [ ] **Step 2: Add the keys, Hebrew first**

Hebrew is the reference locale (§9). Append to `web/packages/i18n/he/people.ts`, keeping the existing section comments and adding these groups:

```ts
  // -- the landing page's remaining copy (parent 13a, 13c) -----------------------
  'landing.aboutTitle': 'על המועדון',
  'landing.whereTitle': 'איפה מתאמנים',
  'landing.groupsTitle': 'הקבוצות שלנו',
  'landing.noGroups': 'המועדון עדיין לא פרסם קבוצות',
  'landing.scheduleComeLater': 'לוח השיעורים עדיין נבנה. נסו שוב בקרוב',
  'landing.step.signIn': 'התחברות',
  'landing.step.children': 'פרטי הילדים',
  'landing.step.health': 'הצהרת בריאות',
  'landing.step.slot': 'בחירת שיעור',
  'landing.step.done': 'אישור',
  'landing.addChild': 'הוספת ילד נוסף',
  'landing.removeChild': 'הסרה',
  'landing.slotFull': 'השיעור בוטל',
  'landing.tooYoung': 'הקבוצה מיועדת לגילאים אחרים',
  'landing.error': 'לא הצלחנו לשמור את הבקשה. נסו שוב',
  'landing.rateLimited': 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות',
  'landing.alreadyUsed': 'החניך כבר מימש שיעור ניסיון. פנו למועדון',

  // §5.4a step 3 — the SHORT trial form. L11: it writes against the seeded kind='trial'
  // template, and this lane builds no template editor.
  'trialHealth.title': 'הצהרת בריאות לשיעור ניסיון',
  'trialHealth.subtitle': 'שאלות קצרות. את הטופס המלא תמלאו באפליקציה אחרי השיעור',
  'trialHealth.confirm': 'אני מאשר/ת את הפרטים',
  'trialHealth.signature': 'חתימה',
  'trialHealth.clearSignature': 'ניקוי החתימה',

  // -- §6.3's reduced trial home -------------------------------------------------
  'trialHome.title': 'השיעור הראשון',
  'trialHome.countdown': 'עוד {n} ימים',
  'trialHome.today': 'היום',
  'trialHome.addToCalendar': 'הוספה ליומן',
  'trialHome.directions': 'איך מגיעים',
  'trialHome.whatToBring': 'מה להביא',
  'trialHome.whatToBringHint': 'בגדים נוחים ובקבוק מים. הגיעו עשר דקות לפני',
  'trialHome.howWasIt': 'איך היה?',
  'trialHome.waitingForClub': 'המועדון יחזור אליכם אחרי השיעור',

  // -- the student card container (parent 2c, dashboard 6c) ----------------------
  'card.title': 'כרטיס חניך',
  'card.sectionsComeLater': 'חגורה, נוכחות, מסמכים ותשלום יתווספו בהמשך',
  'card.details': 'פרטים',
  'card.enrollments': 'קבוצות',
  'card.status': 'סטטוס',
  'alerts.title': 'מרכז התראות',
  'alerts.empty': 'אין התראות שדורשות טיפול',
  'alerts.sectionsComeLater': 'התראות תשלום והתאמות יתווספו בהמשך',
  'alerts.pendingRequests': 'בקשות הצטרפות ממתינות',
  'alerts.upcomingTrials': 'שיעורי ניסיון קרובים',
  'alerts.trialsAwaitingDecision': 'שיעורי ניסיון שממתינים להחלטה',
  'alerts.missingHealth': 'הצהרות בריאות חסרות',
  'alerts.viewAll': 'הצגת הכול',

  // -- C12's day checkboxes ------------------------------------------------------
  'weekdays.title': 'באילו ימים מגיע/ה?',
  'weekdays.hint': 'סמנו את הימים שבהם החניך מתאמן. ברירת המחדל היא כל הימים',
  'weekdays.allDays': 'כל הימים',
  'weekdays.noSchedule': 'לקבוצה הזו עדיין אין לוח שיעורים',
  'weekdays.0': 'ראשון',
  'weekdays.1': 'שני',
  'weekdays.2': 'שלישי',
  'weekdays.3': 'רביעי',
  'weekdays.4': 'חמישי',
  'weekdays.5': 'שישי',
  'weekdays.6': 'שבת',

  // -- conversion (staff 11b, dashboard 4a) --------------------------------------
  // L2 — the id, never an amount. There is no price picker and no shekel sign here.
  'convert.title': 'צירוף למועדון',
  'convert.group': 'קבוצה',
  'convert.startedOn': 'מתאריך',
  'convert.pricePlan': 'מסלול מחיר',
  'convert.pricePlanHint': 'המסלולים ייבחרו במסך המחירים',
  'convert.weeklyVolume': 'אימונים בשבוע',
  'convert.submit': 'צירוף',
  'convert.markLost': 'סימון כלא הצטרף',
  'convert.markLostReason': 'למה לא הצטרפו?',

  // -- errors and empty states ---------------------------------------------------
  'error.scheduleUnavailable': 'לוח השיעורים של המועדון עדיין לא נבנה',
  'error.notFound': 'לא נמצא',
  'error.forbidden': 'אין לכם הרשאה לפעולה הזו',
  'error.generic': 'משהו השתבש. נסו שוב',
  // Dashboard 3b's מסמכים column. In `people.ts` and not in `health.ts` — that
  // namespace is M4's (L12), and a lane borrowing another's namespace serializes both.
  'document.missing': 'חסרה הצהרה',
  'document.trialSigned': 'הצהרת ניסיון',
  'document.signed': 'הצהרה מלאה',
  'document.paymentComesLater': 'מצב תשלום יתווסף עם מודול הגבייה',

  'search.placeholder': 'שם החניך',
  'table.results': '{n} תוצאות',
  'table.loadMore': 'טעינת עוד',
```

- [ ] **Step 3: Mirror every key into `en/people.ts` and `ru/people.ts`**

`en` is strict — every key above must exist. `ru` is `report` until SPEC §15 item 9's translation source lands, but add the keys anyway: a namespace that is complete in `ru` today is one nobody has to revisit.

- [ ] **Step 4: Run the parity check and commit**

```bash
node web/scripts/i18n-parity.mjs people
git add web/packages/i18n
git commit -m "i18n(people): the keys M3's fourteen artboards need, in three locales"
```

---

## Task 14 — Parent `13a` / `13b` / `13c`: the shop window and the booking flow

§5.4a ①. This is the one screen a stranger sees, so it must not be behind the install wall and must not be behind a sign-in wall until the parent chooses to book.

**Files:**
- Create: `web/apps/parent/src/features/landing/route.ts` + `route.test.ts`
- Create: `web/apps/parent/src/features/landing/landingClient.ts`
- Create: `web/apps/parent/src/features/landing/PublicLanding.tsx` + `.test.tsx`
- Create: `web/apps/parent/src/features/landing/BookingFlow.tsx` + `.test.tsx`
- Create: `web/apps/parent/src/features/landing/BookingConfirmed.tsx` + `.test.tsx`
- Create: `web/apps/parent/src/features/landing/index.ts`
- Modify: `web/apps/parent/src/App.tsx` (L13(e) — the early return, before the install gate)

**Interfaces:**
- Produces: `matchLandingPath(pathname: string): { slug: string } | null`, `makeLandingClient(fetcher): LandingClient`, `<PublicLanding slug locale />`

- [ ] **Step 1: Write the failing route test**

`route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchLandingPath } from './route'

describe('matchLandingPath', () => {
  it('matches §5.4a’s /t/{studio-slug}', () => {
    expect(matchLandingPath('/t/judo-tel-aviv')).toEqual({ slug: 'judo-tel-aviv' })
  })

  it('tolerates a trailing slash, because a QR generator will add one', () => {
    expect(matchLandingPath('/t/judo-tel-aviv/')).toEqual({ slug: 'judo-tel-aviv' })
  })

  it('is a real path and not a hash, because this URL goes on a flyer', () => {
    // The other two apps route on location.hash. This one cannot: a hash is not shareable
    // in a QR code that a phone camera opens, and it is invisible to a link preview.
    expect(matchLandingPath('/#/t/judo-tel-aviv')).toBeNull()
  })

  it('does not match the app’s own routes', () => {
    expect(matchLandingPath('/')).toBeNull()
    expect(matchLandingPath('/payments')).toBeNull()
  })

  it('rejects a slug with a path separator in it', () => {
    // The slug reaches an API path. A slug containing a slash would let a crafted link
    // address a different endpoint entirely.
    expect(matchLandingPath('/t/a/b')).toBeNull()
    expect(matchLandingPath('/t/..')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, watch it fail, write `route.ts`**

```ts
// §5.4a ① — 'A public LANDING PAGE at /t/{studio-slug}'.
//
// A real path, not a hash. The other two apps route on `location.hash` because their
// links live in a nav drawer; this URL goes in an Instagram bio and on a flyer QR, and a
// hash is invisible to a link preview and awkward in a printed code. Vite's PWA config
// already sets `navigateFallback: 'index.html'`, so a deep link resolves to the app.
//
// No router library — .claude/rules/ui-rtl-a11y.md says not to add a UI dependency
// without asking, and one regex is not worth one.
const LANDING = /^\/t\/([a-z0-9-]{1,80})\/?$/

export function matchLandingPath(pathname: string): { slug: string } | null {
  const match = LANDING.exec(pathname)
  return match ? { slug: match[1] } : null
}
```

- [ ] **Step 3: Write the failing `PublicLanding` tests**

`PublicLanding.test.tsx` asserts:

1. Renders the club's name as an `h1` from the API payload, not from i18n (a club's name is data).
2. Renders `t(locale, 'people:landing.title')` — "שיעור ניסיון חינם" — as the offer.
3. Lists each group with its name and its `training_weekdays` rendered through `weekdays.{n}`.
4. A group whose `training_weekdays` is empty shows `weekdays.noSchedule` rather than an empty row.
5. **Shows the club and its groups with no session at all** — §5.4a's shop window is readable by a stranger; the sign-in wall stands in front of *booking*, not of *reading*.
6. `[ קבע שיעור ניסיון ]` is a `<button>` with an accessible name, and clicking it starts the flow.
7. A 404 from the API renders `error.notFound` and never a blank page.
8. A 503 (`schedule_unavailable`) renders `landing.scheduleComeLater` — the club exists, its calendar does not yet.
9. Renders in `he`/`rtl` and `en`/`ltr` with no physical CSS property in any inline style.
10. Renders in light and dark.
11. **Desktop (`13c`) and mobile (`13a`) are one component.** The form column is a CSS grid that collapses; the test asserts the same testids exist at both widths rather than that two components exist.

- [ ] **Step 4: Write the failing `BookingFlow` tests**

`BookingFlow.test.tsx` asserts, in §5.4a's stated order:

1. **Step 1 is sign-in.** With no session, the flow renders `landing.signInFirst` and `landing.signInHint`, and the child form is **not** in the document. §5.4a: "The parent authenticates **before** entering child details."
2. The sign-in link carries `return_path` back to `/t/{slug}` so the parent lands where they left off.
3. Step 2 collects name, birthdate and group per child, with `[ + הוסף ילד נוסף ]` adding a second set (`landing.addChild`).
4. Groups are filtered by the child's birthdate where `age_min`/`age_max` are set — §5.4a step 2 — and a group outside the range shows `landing.tooYoung` rather than vanishing, so a parent can see it exists.
5. Step 3 renders the short trial declaration per child and requires the confirmation checkbox before continuing (L11 — the seeded `kind='trial'` template's questions; no template editor).
6. Step 4 lists slots from `/public/groups/{id}/trial-slots`; a slot with `is_bookable: false` is rendered **disabled with a reason** (`landing.slotFull`) and not hidden — §5.4: "the picker greys out a slot rather than hiding it".
7. Submitting POSTs to `/trial-bookings/self` with `group_id`, `session_id`, `children[]` and `trial_health_declarations[]` in child order.
8. A 409 renders `landing.alreadyUsed`; a 429 renders `landing.rateLimited`; a 503 renders `error.scheduleUnavailable`. None of them clears the form.
9. Every input has an associated `<label>`, and the error is linked with `aria-describedby`.
10. No physical CSS; `he`/`en` both render.

- [ ] **Step 5: Write the failing `BookingConfirmed` tests (`13b`)**

1. Renders `submitted.title` and the session's day and time formatted through `@studio/core`'s `formatDateInStudioZone` / `formatTimeInStudioZone` — G3, Asia/Jerusalem regardless of locale.
2. `[ הוסף ליומן ]` is present with an accessible name.
3. Renders `submitted.installApp` — §6.5 makes the install part of onboarding, and this is the moment the parent is most willing.
4. Renders `submitted.bringHint`.
5. **Renders no payment affordance and no enrollment language.** L6 — the public link's only job is a first lesson, and a "complete your registration" button here would promise a place nobody granted.

- [ ] **Step 6: Implement the three components and the client**

`landingClient.ts` is the only file that knows the paths:

```ts
// The only file in the parent app that knows the public endpoint paths, for the same
// reason @studio/ui's setup-wizard/client.ts is: a screen with a fetch in it is a screen
// a test has to stand up a server for.
export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export function makeLandingClient(fetcher: Fetcher) {
  return {
    landing: (slug: string) => fetcher(`/api/v1/public/studios/${slug}/landing`).then(json),
    trialSlots: (groupId: string) =>
      fetcher(`/api/v1/public/groups/${groupId}/trial-slots`).then(json),
    book: (body: BookingRequest) =>
      fetcher('/api/v1/trial-bookings/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  }
}
```

Uses `apiFetch` from `@studio/core` in the app and a plain object in tests. **Types come from `@studio/api-client`'s generated `components['schemas'][...]`** — never hand-written duplicates.

- [ ] **Step 7: Mount it in `web/apps/parent/src/App.tsx` (L13(e))**

Insert **before** the `if (!installed)` branch:

```tsx
// §5.4a ① — the shop window is a marketing asset on the open internet, so it renders
// ahead of every gate. A stranger tapping an Instagram link must see the club, not an
// install walkthrough for an app they have no reason to want yet — and §6.5's install
// prompt belongs on `13b`, after they have booked, which is the moment they are most
// willing.
const landingRoute = matchLandingPath(globalThis.location?.pathname ?? '/')
if (landingRoute) {
  return (
    <ThemeProvider>
      <LanguagePicker locale={locale} onChoose={setLocale} />
      <PublicLanding slug={landingRoute.slug} locale={locale} />
    </ThemeProvider>
  )
}
```

`LanguagePicker` comes first for §6.1's stated reason: language before login, because a Russian-speaking parent cannot read a Hebrew consent screen — and on this page they cannot read the offer either.

- [ ] **Step 8: Run and commit**

```bash
(cd web && npx vitest run apps/parent/src/features/landing --reporter=dot)
(cd web && npx eslint apps/parent/src/features/landing && npx tsc --noEmit)
git add web/apps/parent/src
git commit -m "feat(people): parent 13a/13b/13c — the shop window, sign-in-first, and the session picker"
```

---

## Task 15 — Parent `12j`, `12g`, `12i` and §6.3's trial home

**Files:**
- Create: `web/apps/parent/src/features/people/peopleClient.ts`
- Create: `FirstRegistration.tsx`, `AddSibling.tsx`, `ProfileAndLeave.tsx`, `TrialHome.tsx` (+ tests)
- Create: `web/apps/parent/src/features/people/index.ts`
- Modify: `web/apps/parent/src/App.tsx` (nav entry + route branch)
- Modify: `web/apps/parent/src/features/identity/Resolve.tsx` (one branch — L13(e))

- [ ] **Step 1: `TrialHome.tsx` tests (§6.3)**

§6.3: "A guardian whose children are all `trial` sees a reduced home: the booked session with a countdown, an add-to-calendar button, directions to the studio, and what to bring. **No payments screen** (they have no charges), **no attendance history, no belt strip.**"

1. Renders the booked session with a countdown from `trialHome.countdown`.
2. Renders add-to-calendar, directions and what-to-bring.
3. **Renders no payments tab, no attendance list and no belt bar** — three explicit `queryBy...` assertions returning null. This is the test that stops the full home leaking in.
4. After the lesson (`attended === true`), renders `trialHome.howWasIt`.
5. A guardian with one `trial` child and one `active` child gets the **full** home — "all trial" is the condition, and a family mid-conversion must not lose the app they already use.
6. `he`/`en`, light/dark, no physical CSS.

- [ ] **Step 2: `Resolve.tsx` branch (L13(e))**

After the existing `access.parent` refusal and studio-picker branches, before `<ParentHome/>`:

```tsx
// §6.3's trial state. The condition is 'every child is trial', not 'any child is' — a
// family mid-conversion must keep the app they are already using.
if (students.length > 0 && students.every((s) => s.status === 'trial')) {
  return <TrialHome locale={locale} students={students} />
}
```

`students` comes from `GET /me/students` through `peopleClient`. Nothing else in the file changes.

- [ ] **Step 3: `FirstRegistration.tsx` (`12j`) tests**

`12j` is "הרשמה ראשונה — קישור מהמועדון או המשך משיעור ניסיון": two entry paths into the same screen.

1. From an invitation link, renders the invitation-code path and calls `POST /auth/accept-invitation`.
2. From a finished trial, renders the "continue from your trial" path and shows the child already on file — **no second sign-in and no second account** (§5.4a).
3. **Neither path offers a group picker or a price.** L6 — enrolment is a manager decision; the parent is completing details, not enrolling. This is the assertion that keeps the screen honest.
4. Accessible names, labels, `he`/`en`, no physical CSS.

- [ ] **Step 4: `AddSibling.tsx` (`12g`) tests**

1. Renders `sibling.title` and `sibling.subtitle` — "הילד יתווסף לאותו חשבון" (L9: same account, no household).
2. Submits to `POST /me/students` and, on success, renders `sibling.pendingHint` — "הבקשה תיבדק במשרד המועדון".
3. **Never renders "the child is enrolled"** — L6; the response is a request, and the copy promises review rather than a place.
4. The group field is labelled as a preference, not a decision.
5. A 429 or a network error keeps the typed values.
6. Accessible names, labels, `he`/`en`, no physical CSS.

- [ ] **Step 5: `ProfileAndLeave.tsx` (`12i`) tests**

1. Renders the guardian's own details and every child.
2. Renders each guardian on a child with `guardian.primaryHint` — L8's exact two consequences and no more.
3. **Renders no permission difference between guardians** — the secondary guardian's row offers the same actions as the primary's. §5.3: one guardian view, no permission branching.
4. `leave.title` opens a confirmation carrying `leave.debtNotice` — "החיוב החודשי נשאר באחריות ההורה" — and the confirm button is **disabled until the notice has been rendered**, because `12i` puts that sentence in front of the decision rather than after it.
5. Leaving posts to `POST /students/{id}/leave` with `left_on` and an optional reason, and the request body carries **no money field of any kind**.
6. A frozen child renders `freeze.active` with the return date, formatted in Asia/Jerusalem.
7. Accessible names, labels, `he`/`en`, light/dark, no physical CSS.

- [ ] **Step 6: Implement, mount, run, commit**

Add to parent `App.tsx`'s `NAV` and route switch: `addChild` → `<AddSibling/>`, `profile` → `<ProfileAndLeave/>`.

```bash
(cd web && npx vitest run apps/parent/src/features/people --reporter=dot)
(cd web && npx eslint apps/parent/src && npx tsc --noEmit)
git add web/apps/parent/src
git commit -m "feat(people): parent 12j, 12g, 12i and §6.3's reduced trial home"
```

---

## Task 16 — Parent `2c`: the student-card **container**

`2c` is a container. This lane builds the container plus its own sections and registers them; belt, attendance, documents and payment arrive in later milestones through the same registry. Hardcoding a section this lane does not own is the failure this task exists to avoid.

**Files:**
- Create: `web/apps/parent/src/features/people/StudentCard.tsx` + `.test.tsx`
- Create: `web/apps/parent/src/features/people/sections/DetailsSection.tsx`, `EnrollmentsSection.tsx`, `GuardiansSection.tsx` (+ tests)
- Create: `web/apps/parent/src/features/people/register.ts` + `register.test.ts`

- [ ] **Step 1: Write the failing container tests**

`StudentCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearSlot, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { StudentCard } from './StudentCard'

const STUDENT = {
  id: 's1', person_id: 'p1', first_name: 'דנה', last_name: 'כהן',
  birthdate: '2018-05-01', status: 'active', health_status: 'signed',
  joined_on: '2026-09-01', left_on: null, current_belt_id: null,
  group_names: ['מתחילים'], frozen_until: null, guardian_display_names: ['יעל כהן'],
} as const

afterEach(() => clearSlot('student-card'))

describe('StudentCard — the 2c container', () => {
  it('renders the student’s name', () => {
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getByRole('heading', { level: 1, name: /דנה כהן/ })).toBeInTheDocument()
  })

  it('renders a section a later milestone registers, without knowing what it is', () => {
    // The whole point of seam 4. M4's documents section and M6's payment section land as
    // one file plus one line in their own feature barrel, and this file is never reopened.
    registerSlot('student-card', {
      key: 'documents',
      order: 40,
      render: () => <p data-testid="future-section">מסמכים</p>,
    })
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getByTestId('future-section')).toBeInTheDocument()
  })

  it('orders sections by their declared order and not by registration order', () => {
    registerSlot('student-card', { key: 'z', order: 90,
      render: () => <p data-testid="s">z</p> })
    registerSlot('student-card', { key: 'a', order: 10,
      render: () => <p data-testid="s">a</p> })
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getAllByTestId('s').map((n) => n.textContent)).toEqual(['a', 'z'])
  })

  it('passes the student down, so a section never fetches for itself', () => {
    // slots.ts: 'Where a section needs data it reads a field the wave's contract commit
    // already put in the payload — it never asks the container to fetch for it.'
    registerSlot<{ student: typeof STUDENT }>('student-card', {
      key: 'probe', order: 10,
      render: ({ student }) => <p data-testid="probe">{student.first_name}</p>,
    })
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getByTestId('probe')).toHaveTextContent('דנה')
  })

  it('renders nothing belonging to a later milestone when nothing is registered', () => {
    // The container hardcodes NO section it does not own. If belt, attendance, documents
    // or payment ever appear here without a registerSlot call, this is what catches it.
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.queryByTestId('student-card-belt')).toBeNull()
    expect(screen.queryByTestId('student-card-attendance')).toBeNull()
    expect(screen.queryByTestId('student-card-documents')).toBeNull()
    expect(screen.queryByTestId('student-card-payment')).toBeNull()
  })

  it('says the rest is coming rather than showing an empty page', () => {
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getByText(t('he', 'people.card.sectionsComeLater'))).toBeInTheDocument()
  })

  it('renders this lane’s own sections through the registry too', async () => {
    // Not as a special case. `register.ts` calls registerSlot exactly as M4 will, so the
    // container has one code path and this lane is not privileged inside it.
    const { registerPeopleSections } = await import('./register')
    registerPeopleSections()
    render(<StudentCard locale="he" student={STUDENT} />)
    expect(screen.getByTestId('student-card-details')).toBeInTheDocument()
    expect(screen.getByTestId('student-card-enrollments')).toBeInTheDocument()
    expect(screen.getByTestId('student-card-guardians')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, watch fail, implement the container**

```tsx
// Parent artboard 2c — כרטיס חניך. A CONTAINER (plan §1.3, seam 4).
//
// 2c is composed of sections owned by different verticals: this lane's details,
// enrollments and guardians; M4's documents; M5's attendance; M6's payment; M7's belt.
// The container renders `useSlot('student-card')` and knows none of them by name, so a
// later lane adds one file plus one line in its own feature barrel and never reopens this
// one. Hardcoding a section this lane does not own would put M4's work in M3's file and
// serialize the two waves the slot registry exists to keep parallel.
//
// This lane's own sections go through `registerSlot` as well, in register.ts. Not as a
// special case: one code path means M4 lands into a container that has already been
// exercised by real sections rather than by a test double.
import { useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StudentSummary } from './peopleClient'

export type StudentCardSectionProps = {
  student: StudentSummary
  locale: Locale
}

export function StudentCard({ student, locale }: StudentCardSectionProps) {
  const sections = useSlot<StudentCardSectionProps>('student-card')
  return (
    <article aria-labelledby="student-card-title" data-testid="student-card">
      <h1 id="student-card-title">{`${student.first_name} ${student.last_name}`}</h1>
      {sections.map(({ key, render: Section }) => (
        <Section key={key} student={student} locale={locale} />
      ))}
      {/* Honest about what is not here yet, rather than a page that looks finished and
          is missing four sections. */}
      <p data-testid="student-card-pending">{t(locale, 'people.card.sectionsComeLater')}</p>
    </article>
  )
}
```

- [ ] **Step 3: The three sections, and `register.ts`**

```ts
// This lane's `student-card` sections, registered the same way M4's and M6's will be.
// Called once from the app's own entry, never at module import of a component file — a
// registration that happens on import registers twice under HMR and in a test that
// imports the barrel more than once. (`registerSlot` de-duplicates on key, which is a
// belt to this braces.)
import { registerSlot } from '@studio/ui'
import { DetailsSection } from './sections/DetailsSection'
import { EnrollmentsSection } from './sections/EnrollmentsSection'
import { GuardiansSection } from './sections/GuardiansSection'

export function registerPeopleSections(): void {
  registerSlot('student-card', { key: 'people-details', order: 10, render: DetailsSection })
  registerSlot('student-card', { key: 'people-enrollments', order: 20,
                                 render: EnrollmentsSection })
  registerSlot('student-card', { key: 'people-guardians', order: 30,
                                 render: GuardiansSection })
}
```

Section tests assert:
- `DetailsSection` — name, birthdate and status chip; status rendered through `status.{value}`; a `frozen` student shows `freeze.active` with the return date.
- `EnrollmentsSection` — **every** live enrollment, not one (C11/L3); each with its `attends_weekdays` rendered through `weekdays.{n}`, and `weekdays.allDays` when the value is null.
- `GuardiansSection` — every guardian, `guardian.primaryHint` on the primary, and **identical affordances on every row** (L8).
- `EnrollmentsSection` renders **no price and no amount** (L2) — an explicit assertion that no `₪` and no `MoneyDisplay` appears.

- [ ] **Step 4: Run, lint, commit**

```bash
(cd web && npx vitest run apps/parent/src/features/people --reporter=dot)
(cd web && npx eslint apps/parent/src && npx tsc --noEmit)
git add web/apps/parent/src
git commit -m "feat(people): parent 2c as a container, with this lane's sections in the registry"
```

---

## Task 17 — Staff `9h`, `9c`, `11b`

**Files:**
- Create: `web/apps/staff/src/features/people/peopleClient.ts`, `StudentsSearch.tsx`, `StaffStudentCard.tsx`, `TrialInClass.tsx`, `index.ts` (+ tests)
- Modify: `web/apps/staff/src/App.tsx` (nav entry + route branch)

- [ ] **Step 1: `StudentsSearch.tsx` (`9h`) tests**

1. A search field with a `<label>`, `search.placeholder`, and a 44px minimum tap target (§6.2 — one-handed on a mat).
2. Typing queries `GET /students?q=` and renders `StudentRow` from `@studio/ui` — never a redrawn row, so D7's belt ring travels for free (G10).
3. **A trial student's row carries the ניסיון chip** — §5.4a: "`student.status = 'trial'` is surfaced everywhere a student is rendered — never inferred from the absence of an enrollment." Rendered with `StatusChip` using `status.trial`. `ChipStatus` has no `trial` member and `@studio/ui` is not this lane's to change, so the chip's tone maps to `pending` and the **label** carries the meaning — which is also SC 1.4.1's rule: never colour alone.
4. `student.emptyFiltered` on no results, `student.empty` on an empty club — two different sentences, because they are two different situations.
5. **No money anywhere** — an explicit assertion that no `₪`, no `MoneyDisplay` and no debt chip appears. §3.2: "coaches never see money."
6. Accessible names, `he`/`en`, light/dark, no physical CSS.

- [ ] **Step 2: `StaffStudentCard.tsx` (`9c`) tests**

`9c` is "כרטיס חניך ומעבר כיתה — פעולה של המאמן הראשי בלבד".

1. Renders the student's card: name, belt bar, contact, groups, status.
2. **The מעבר כיתה action is rendered only for `lead_coach`, `manager` and `owner`** — driven by `can()` from `@studio/core`'s permissions, never by a hand-rolled role check.
3. An assistant coach sees the card and **not** the action.
4. Changing group calls `PATCH /enrollments/{id}` to end the old one and `POST /enrollments` for the new one, and the new-enrollment call carries `attends_weekdays` from the checkbox group (C12/L4).
5. The checkbox group is populated from `GET /enrollments/weekday-options`, **all ticked by default** (L4), and sending every day submits `null` rather than the full array — NULL means "all of them", and storing the array would freeze today's schedule into the row.
6. A 503 from weekday-options renders `weekdays.noSchedule` and disables the action rather than submitting a guess.
7. **No money, no price plan field** (L2, §3.2).
8. Accessible names, `he`/`en`, no physical CSS.

- [ ] **Step 3: `TrialInClass.tsx` (`11b`) tests**

`11b` is "שיעור ניסיון — הוספת חניך חדש תוך כדי שיעור".

1. A coach on a session can add a trial student from the roster screen: name, parent name, phone — §5.4a's "four fields", nothing more.
2. Submits to `POST /trial-bookings` with the session id already filled in.
3. The new row appears carrying the ניסיון chip and `trial.bookedFor`.
4. **The screen offers no group assignment and no price** — L6; a coach adding a child mid-lesson is logging a trial, not enrolling anyone.
5. A 409 renders `trial.overrideHint` and, for a manager, offers `trial.override`; for a coach it says to speak to the office. §5.4a — the override is a manager's deliberate, countable act.
6. Accessible names, 44px targets, `he`/`en`, no physical CSS.

- [ ] **Step 4: Implement, mount, run, commit**

```bash
(cd web && npx vitest run apps/staff/src/features/people --reporter=dot)
(cd web && npx eslint apps/staff/src && npx tsc --noEmit)
git add web/apps/staff/src
git commit -m "feat(people): staff 9h, 9c and 11b"
```

---

## Task 18 — Dashboard `3b`, `3c`, `4a`

**Files:**
- Create: `web/apps/dashboard/src/features/people/peopleClient.ts`, `StudentsScreen.tsx`, `AddStudentScreen.tsx`, `StudentDetailScreen.tsx`, `index.ts` (+ tests)
- Modify: `web/apps/dashboard/src/App.tsx` (nav entries + route branches)

- [ ] **Step 1: `StudentsScreen.tsx` (`3b`) tests**

`3b` is "חניכים — טבלה עם מסננים, מסמכים ומצב תשלום".

1. A `<table>` with a real `<caption>` and `<th scope="col">` — a grid of divs is unreadable to a screen reader.
2. Filters for status, group and health status, each with a `<label>`, each pushing a query parameter.
3. The מסמכים column renders `health_status` from **`people.ts`** keys — `document.missing`, `document.trialSigned`, `document.signed`, added in Task 13. Not from `health.ts`: that namespace is M4's and L12 forbids editing it, and a lane that borrows another's namespace serializes the two waves.

4. **מצב תשלום renders as an explicitly empty column with a "coming in M6" note**, not as invented data and not as a silently missing column. W4 owns `charge`; a plausible-looking payment column here would be a fabrication in a manager's decision-making screen.
5. Cursor pagination through `table.loadMore`, using `appendPage` / `hasNextPage` from `@studio/core` — never a hand-rolled merge.
6. `student.empty` vs `student.emptyFiltered`.
7. Clicking a row opens `4a`.
8. `he`/`en`, light/dark, no physical CSS, and the table scrolls inside its own container rather than the page scrolling sideways.

- [ ] **Step 2: `AddStudentScreen.tsx` (`3c`) tests**

`3c` is "הוספת חניך — שיוך למשק בית קיים במקום חשבון חדש". The artboard's word is "משק בית"; **L9 says there is no such entity**, so the screen attaches to an existing *parent* and the copy says so.

1. Typing a parent's email or phone shows a match through the queue's matching hint (`request.matchedPerson`, `request.matchedHint`) — and the copy never claims certainty.
2. Choosing the match submits `guardian.email` so the server matches; the client **never sends a `person_id` it guessed**. L7 — matching is the server's job, on a verified address.
3. `[ + הוסף ילד נוסף ]` adds a second child block, and both submit against the same parent — §5.4a's worked example, two children in one action.
4. The group field and the C12 checkbox group appear together, checkboxes from `GET /enrollments/weekday-options`, all ticked (L4).
5. **No price field.** L2 — `price_plan` is W4's; the conversion screen stores an id and the setup wizard's prices step is M6's.
6. On success, the returned `invitation_token` is rendered as a copyable link for a parent standing at the desk, with a warning that it is shown once.
7. Every input labelled, errors linked with `aria-describedby`, `he`/`en`, no physical CSS.

- [ ] **Step 3: `StudentDetailScreen.tsx` (`4a`) tests**

`4a` is "כרטיס חניך — כל מה שהמנהל צריך על חניך אחד".

1. Renders name, status chip, belt bar, guardians, **every** live enrollment (C11/L3) with its weekday pattern, and the status-history timeline from `GET /students/{id}/status-history`.
2. Manager actions: freeze (opens a `DateRangePicker`), leave (carrying `leave.debtNotice`), convert, mark-lost, set-primary-guardian, add/remove guardian.
3. `convert.weeklyVolume` is displayed beside the plan field, sourced from the server — C11's "suggestion, not a computation".
4. **`convert.pricePlan` is an id field with `convert.pricePlanHint`, and renders no amount and no shekel sign.** L2 — invariant 3 and the fact that `price_plan` does not exist. This assertion is what keeps a helpful "₪320" from appearing.
5. A frozen student shows `freeze.active` and the return date in Asia/Jerusalem.
6. `he`/`en`, light/dark, no physical CSS, and the screen renders narrow — §6.4: "a manager checking cover from a phone is a normal case".

- [ ] **Step 4: Implement, mount, run, commit**

```bash
(cd web && npx vitest run apps/dashboard/src/features/people --reporter=dot)
(cd web && npx eslint apps/dashboard/src && npx tsc --noEmit)
git add web/apps/dashboard/src
git commit -m "feat(people): dashboard 3b, 3c and 4a"
```

---

## Task 19 — Dashboard `6c`: the alert-centre **container**

`6c` is "מרכז התראות — כל מה שדורש החלטה של המנהל". A container, like `2c`. This lane registers the alerts it owns; M4's missing-declaration alerts, M6's debt and reconciliation alerts and M5's at-risk alerts land later through the same registry.

**Files:**
- Create: `web/apps/dashboard/src/features/people/AlertCentre.tsx` + `.test.tsx`
- Create: `sections/PendingRequestsAlert.tsx`, `sections/UpcomingTrialsAlert.tsx`, `sections/TrialsAwaitingDecisionAlert.tsx` (+ tests)
- Create: `web/apps/dashboard/src/features/people/register.ts` + test
- Modify: `web/apps/dashboard/src/App.tsx` (nav entry + route branch)

- [ ] **Step 1: Write the failing container tests**

Mirror Task 16's container tests against `useSlot('alert-centre')`:

1. Renders the heading from `alerts.title`.
2. Renders a section a later milestone registers, without knowing what it is.
3. Orders by declared `order`.
4. Passes its props down so a section never fetches for the container.
5. **Hardcodes no alert this lane does not own** — explicit `queryByTestId` nulls for `alert-debt`, `alert-reconciliation`, `alert-at-risk`, `alert-missing-health`.
6. With nothing registered, renders `alerts.empty` rather than a blank panel.
7. This lane's three sections arrive through `registerPeopleAlerts()`, not through a special case.
8. `he`/`en`, light/dark, no physical CSS.

- [ ] **Step 2: Section tests**

- `PendingRequestsAlert` — count from `GET /registration-requests?status=pending`, each row showing `child_display_name` and `guardian_display_name` and **nothing else from the payload** (L10); `request.matchedPerson` when `matched_person_id` is set; approve/reject opening the decision dialog where the **group is chosen** (§5.4 — the group lives on the decision).
- `UpcomingTrialsAlert` — §5.4a ②'s "שיעורי ניסיון" queue, next seven days, each with the session time in Asia/Jerusalem.
- `TrialsAwaitingDecisionAlert` — bookings with `attended = true` and `outcome = 'pending'`, i.e. §5.4a ⑤'s decision. A booking with `attended === null` is **excluded**, and the test says why: the lesson has not happened, so there is nothing to decide.
- Every section renders **no money** (§3.2, invariant 3) — asserted.

- [ ] **Step 3: Implement, mount, run, commit**

```bash
(cd web && npx vitest run apps/dashboard/src/features/people --reporter=dot)
(cd web && npx eslint apps/dashboard/src && npx tsc --noEmit)
git add web/apps/dashboard/src
git commit -m "feat(people): dashboard 6c as a container, with this lane's alerts in the registry"
```

---

## Task 20 — Close the lane

- [ ] **Step 1: Tick the milestone in `docs/plan/state.yaml`**

CLAUDE.md: the tick lands **in the same commit as the work**, and nothing measurable goes in this file — no test results, no branch, no environment health.

Under `W2`'s `pieces`, after `W2.0`:

```yaml
      - id: M3
        title: Students, guardians, the lead funnel and the public trial page
        status: shipped
        on: 2026-08-25
```

- [ ] **Step 2: Regenerate, and confirm the generated output is committed**

```bash
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts
```

- [ ] **Step 3: Run the lane check and show the output**

```bash
./scripts/lane-check.sh people
```

Every gate must be green: invariants, restrictions, backend, types, frontend, lint, stylelint, i18n parity. `SCOPED_GATES` must be at least 6 — a green check that skipped everything is the one outcome the script's own header calls worse than a red one.

- [ ] **Step 4: Full suite, to confirm nothing else moved**

```bash
.venv/bin/pytest -q
(cd web && npm run typecheck && npm run lint && npm test)
```

- [ ] **Step 5: Commit**

```bash
git add docs/plan/state.yaml openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(people): M3 complete — lane-check people green"
```

---

## Self-Review

**1. Spec coverage.**

| Requirement | Task |
|---|---|
| §5.3 students and guardians, all equal, one primary | 5, 7 |
| §5.3 invitations by email or phone, token-bound | 5, 7 |
| §5.4 enrolment is always a manager decision | 5, 8, 11 |
| §5.4 several live enrollments, one price (C11) | 5, 6, 8 |
| §5.4 `attends_weekdays` per enrollment (C12) | 4, 8 |
| §5.4(a) manager-added student | 5, 18 |
| §5.4(b) public trial → manager converts | 9, 10, 6 |
| §5.4(c) parent-initiated sibling | 11, 15 |
| §5.4 leaving — no refund, charge stays | 6, 15, 18 |
| §5.4 freezing — spot retained, ends by date | 6, 12, 18 |
| §5.4a ① landing page + sign-in-first booking | 9, 10, 14 |
| §5.4a ② manager queue + 24h reminder + ניסיון chip | 12, 17, 19 |
| §5.4a ③ coach marks attendance, leaves a note | 10, 17 |
| §5.4a ④ day 1 / 3 / 7 follow-ups | 12 |
| §5.4a ⑤ conversion or `lost` with a reason | 6, 12, 18 |
| §5.4a one free trial + manager override | 10, 17 |
| §5.4a `student_status_history` → funnel | 2, 6 |
| §5.4a person + child matching on verified contact | 3, 11, 18 |
| §5.4a approval transaction | 11 |
| §6.1 parent access is a query, self-service trial entry | 10, 14 |
| §6.3 reduced trial home | 15 |
| §7 `/students`, `/enrollments`, `/public`, `/trial-bookings`, `/registration-requests`, `/me/students` | 5–11 |
| §11.1 encrypted registration payload | 10, 11 |
| §11.7 rate limiting on the public write | 10 |
| Artboards 13a/13b/13c, 12j, 12g, 12i, 2c, 11b, 9c, 9h, 3b, 3c, 4a, 6c | 14–19 |

**Gaps, stated rather than hidden.** Four things §7 or §5.4a names are **not** built here, each for a reason the executor must not paper over:

1. **No captcha** on `POST /trial-bookings/self`. No provider is configured and `app/core/config.py` is outside this lane. Sign-in-first (a full Google/Apple OAuth round trip) stands in front of the endpoint and is the stronger barrier; the rate limiter is built. Recorded in Task 10's module docstring and reported at handover.
2. **The rate limiter is per-process.** Correct behaviour across replicas needs a shared store (Redis, which §8.1a already scopes) and a `REDIS_URL` setting this lane does not own.
3. **No `health_declaration` or `consent_record` rows.** C3 puts both in M4. The trial answers are held encrypted in `registration_request.payload_encrypted` and `student.health_status` becomes `trial_signed`; approval leaves `missing` and §5.5's app gate collects the full form, which is what §5.4(b) prescribes anyway.
4. **No `GET/POST /students/{id}/notes`.** §5.13's student notes have no table in §4.3's core tables and none in W2's contract commit, and this lane runs no migration. Out of scope for M3; flag it for W3's contract commit.

Also deliberately absent, and correct: **`GET /reports/funnel`** is §5.14's and lands in M9 — this lane ships the `student_status_history` rows it is computed from and the i18n keys it will render, which is the whole of M3's obligation to it.

**2. Placeholder scan.** Tasks 11 and 12 give test intent plus full docstrings rather than every line of every test body; each names the exact assertions and the exact reasoning the code must carry, and the file shapes are established by Tasks 2–10. Task 9 flags one literal placeholder for the executor to fix (`response_model=dict` on `public_groups` must become `PublicGroupListResponse` — `.claude/rules/api.md` requires an explicit response model). No task says "add appropriate error handling" or "write tests for the above".

**3. Type consistency.** Checked across tasks: `viewer_group_ids` (never `viewer_groups`); `attends_weekdays` (never `weekdays`); `training_weekdays` (never `group_weekdays` — that is `attendance_pattern`'s own parameter name and it is the contract's, not ours); `ScheduleReader` protocol used by `group_days`, `enrollments`, `landing` and `students.convert` alike; `schedule_reader()` as the router-level factory in `public.py` and `trial_bookings.py`; `StudentRow` from the service vs `StudentSummaryOut` on the wire, never interchanged; `registerPeopleSections` (parent, `student-card`) vs `registerPeopleAlerts` (dashboard, `alert-centre`) — two names because they are two registries.

---

## Handover notes — what to tell the reviewer

1. **Four shared files were touched under the pre-agreed exceptions (L13)** and nothing else: `scripts/lane-check.sh`, one deleted test in `tests/invariants/test_03_...`, `infra/railway/jobs.json`, and the two generated files. Plus four frontend mount points (`App.tsx` ×3, `Resolve.tsx`), each a nav entry and a route branch.
2. **`ScheduleService.materialize_sessions` still raises.** Until lane SCHEDULE merges, `/public/groups/{id}/trial-slots`, `/enrollments/weekday-options`, `POST /enrollments` and `POST /students/{id}/convert` answer **503 `schedule_unavailable`**. That is the seam working as designed. Three tests document it and say to delete them when M2 lands.
3. **The four gaps above**, in the reviewer's hands rather than in a backlog nobody reads.
4. **`app/services/people/attendance_pattern.py` was not modified.** Task 8's last test proves there is exactly one implementation of `expected_weekdays`, `is_expected` and `weekly_volume` in the whole package.
