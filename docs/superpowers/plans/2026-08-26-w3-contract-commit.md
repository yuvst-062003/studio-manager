# W3 contract commit — revision 0007, the lane gates, and the two worktrees

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land everything W3's two lanes need on `main` — the attendance and health schema
as revision `0007`, a gate that actually reaches every file each lane owns, the fixtures
each lane starts from, and the D11 correction — then create the two worktrees.

**Architecture:** Six sequential tasks on `main`, each ending in a commit. The schema comes
first because everything else is downstream of it; the two lane-facing deliverables
(`lane-check.sh`, the conftests) follow; the doc corrections and the generated client close
it. No worktree exists until the exit gate holds.

**Tech Stack:** Python 3.14 in `.venv`, FastAPI, SQLAlchemy 2.0 declarative, Alembic,
PostgreSQL 18 via `./scripts/dev-db.sh`, pytest, ruff, mypy; bash 3.2-compatible shell.

**Spec:** [docs/plan/prompts/w3-contract.md](../../plan/prompts/w3-contract.md),
[docs/plan/milestone-plan.md](../../plan/milestone-plan.md) §1.3 · §2.2 · § W3,
[docs/design/decisions.md](../../design/decisions.md) D11,
[docs/plan/migrations/w3-draft.py](../../plan/migrations/w3-draft.py).

## Global Constraints

- **One Alembic head.** `main` owns `alembic/versions/**`. Revision `0007`, `down_revision
  = '0006'`, linear. Lanes never run `alembic revision`.
- **`alembic/versions/*` is denied to Edit/Write by `.claude/hooks/block-protected.sh`
  (exit 2).** The owner approved writes **scoped to `alembic/versions/0007_*.py` only**, via
  `python - <<'PY'` heredoc. Every other protected path stays untouched: no `.env`, no other
  revision, no `dist/`, no `node_modules/`.
- **G9** — every tenant-scoped table inherits `TenantMixin`: non-null `studio_id`, leading
  composite index.
- **§4.3** — `attendance` carries `UNIQUE(session_id, student_id)` **and** a second unique
  index on `client_mark_id`. Both, not either.
- **G7** — health declarations are minors' personal data. Never logged, never in an audit
  `diff`, `answers_encrypted` is `EncryptedJSON`, `signature_image_encrypted` is
  `EncryptedBytes`, `derived_flags` is plaintext JSONB holding **booleans only**.
- **`app/models/health.py` already exists** and holds `HealthFormTemplate` (revision `0005`,
  conflict C3). W3 **appends** to it. Moving `_pending/health.py` over it deletes the
  template and breaks M3's trial booking.
- **Grants are inherited, never written.** Revision `0001` set `ALTER DEFAULT PRIVILEGES`.
  No per-table `GRANT` in `0007`. `0002`'s `REVOKE` on `audit_log` is not touched.
- **`EncryptedJSON`/`EncryptedBytes` render with their `aad`** — `alembic/env.py::_render_item`
  already does this. Never substitute the wrapped `JSONB`/`LargeBinary`.
- Python tooling is `.venv/bin/…`. A bare `python3`/`pytest` is an old 3.8 on PATH.
- A database is required: `./scripts/dev-db.sh up`. DB tests fail rather than skip.
- Every `docs/plan/state.yaml` edit rides in the same commit as its work, and carries
  nothing measurable.

## Two findings this plan resolves beyond the stated deliverables

1. **`app/routers/health.py` is core's liveness probe** (`GET /api/v1/health`, asserted by
   `tests/test_health.py`), not the health vertical's router. `milestone-plan.md § Lane
   HEALTH` and `w3-lanes.md` both list it as an owned file, and the `lane-check.sh` default
   branch resolves `app/routers/$V.py` straight onto it. Left alone, the health lane opens
   core's liveness file on day one. The lane's routers are named explicitly instead:
   `app/routers/health_templates.py` (D11's editor — `POST /health-templates`; the existing
   `GET` stays in `app/routers/structure.py`) and `app/routers/health_declarations.py`
   (`/students/{id}/health-declaration` and `/pdf`, per SPEC §7 line 1535). Task 3 keeps
   `app/routers/health.py` **out** of the health lane's gate; Task 5 corrects both docs.
2. **A migration-only seed reaches only studios that exist on 2026-08-26.** D11 promises the
   product *ships with* a default question set. A studio provisioned after `0007`, and the
   demo studio after any `/dev` reset (the reset wipes `health_form_template` and re-seeds
   only the trial form), would have none — and the health lane cannot fix it, because seeding
   is a migration and migrations are `main`-only. Task 2 therefore lands the migration seed
   **and** `ensure_full_template()` beside the existing `ensure_trial_template()`, wired into
   the same two call sites.

---

### Task 1: Promote the W3 models and land revision 0007's tables

**Files:**
- Create: `app/models/attendance.py` (moved from `app/models/_pending/attendance.py`)
- Modify: `app/models/health.py` — append `HealthDeclaration`, `ConsentRecord`
- Delete: `app/models/_pending/attendance.py`, `app/models/_pending/health.py`
- Modify: `app/models/_pending/__init__.py:24-33` — the wave table and the partial-file note
- Create: `alembic/versions/0007_w3_attendance_and_health.py`
- Test: `tests/contracts/test_w3_models.py` (moved from `tests/contracts/_pending/`)
- Modify: `tests/contracts/_pending/__init__.py:9-12` — the "W3 moves its file up" sentence

**Interfaces:**
- Consumes: `app/core/tenancy.TenantMixin`, `app/models/base.{Base,TimestampColumns,UUIDPrimaryKey}`,
  `app/core/encryption.{EncryptedJSON,EncryptedBytes}` — all unchanged.
- Produces:
  - `app.models.attendance.Attendance`, `.AbsenceReport`,
    `.ATTENDANCE_STATUSES = ("unmarked","present","absent_excused","absent_unexcused")`,
    `.ATTENDANCE_SOURCES = ("coach","parent","bulk","system")`
  - `app.models.health.HealthDeclaration`, `.ConsentRecord`,
    `.CONSENT_SUBJECT_TYPES`, `.CONSENT_TYPES` — beside the untouched `HealthFormTemplate`
    and `HEALTH_TEMPLATE_KINDS`
  - Tables `attendance`, `absence_report`, `health_declaration`, `consent_record` in
    `Base.metadata` and in the database at head `0007`.

- [ ] **Step 1: Move the model contract test up, ahead of the models**

```bash
git mv tests/contracts/_pending/test_w3_models.py tests/contracts/test_w3_models.py
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/pytest tests/contracts/test_w3_models.py -q`
Expected: FAIL — `KeyError: 'attendance'` / `assert 'attendance' in Base.metadata.tables`,
20+ failures. The health half fails identically on `'health_declaration'`.

- [ ] **Step 3: Promote `attendance.py` whole, and `health.py` by append**

```bash
git mv app/models/_pending/attendance.py app/models/attendance.py
```

`app/models/health.py` is an **append**. Take the two classes and the two tuples from
`app/models/_pending/health.py` — `CONSENT_SUBJECT_TYPES`, `CONSENT_TYPES`,
`HealthDeclaration`, `ConsentRecord` — and add them below `HealthFormTemplate`, merging the
imports (`Boolean`, `Date`, `ForeignKey`, `date`, `uuid`, `JSONB` already there, `PGUUID`,
`EncryptedBytes`, `EncryptedJSON`). Then update that module's docstring: it currently says
"**the template only**" and that "M4 adds `health_declaration` and `consent_record` to this
file" — both are now false. Replace with what the file holds and who owns which half:

```python
"""SPEC §4.3's health block — the template, the declaration and the consent ledger.

Conflict C3 is why this file arrived in two pieces. §14 puts health declarations in M4,
but M3's trial booking (§5.4a) needed a `kind='trial'` template before that, so M1
created `health_form_template` in revision `0005` and W3's contract commit appended
`health_declaration` and `consent_record` beneath it in revision `0007`.

**G7 governs the two tables below the template.** They hold minors' medical answers.
Never logged, never in an audit `diff` (§11.2), never returned to a coach-scoped caller —
what a coach sees is `derived_flags`, booleans only (§5.5).

`HealthFormTemplate` still holds questions and never answers, and
`test_no_column_here_could_hold_an_answer` in tests/structure keeps it that way.
"""
```

Then delete the emptied pending module and correct the two package docstrings:

```bash
git rm app/models/_pending/health.py
```

In `app/models/_pending/__init__.py`, drop the `W3  _pending/attendance.py …` row from the
wave table, and replace the "`_pending/health.py` is a partial file" paragraph with a line
recording that W3 promoted both in revision `0007`. In
`tests/contracts/_pending/__init__.py`, do the same to its "**W3 moves `test_w3_models.py`
up**" sentence — leave W4's and W5's rows exactly as they are.

- [ ] **Step 4: Confirm the metadata half is green and the migration half is now red**

Run: `.venv/bin/pytest tests/contracts/test_w3_models.py -q`
Expected: PASS, 24 tests.

Run: `.venv/bin/pytest tests/core/test_alembic_baseline.py -q`
Expected: FAIL on `test_the_migrations_match_the_models` — `alembic check` reports four
tables in the metadata with nothing behind them. **This is the correct intermediate state**
and Step 5 closes it; do not commit here.

- [ ] **Step 5: Autogenerate 0007**

```bash
./scripts/dev-db.sh up
.venv/bin/alembic upgrade head          # bring the local db to 0006 first
.venv/bin/alembic revision --autogenerate -m "w3 attendance and health"
```

Rename the generated file to `alembic/versions/0007_w3_attendance_and_health.py` if alembic
did not (`git mv` is fine — `mv` to that path is blocked by the hook, so use the heredoc
route below if it resists).

- [ ] **Step 6: Reconcile the generated file against the draft's HAND_CHECK**

Read `docs/plan/migrations/w3-draft.py` beside the generated file and verify, in order:

1. `revision = '0007'`, `down_revision = '0006'`.
2. **No `create_table('health_form_template', …)`.** Revision `0005` created it. A `CREATE
   TABLE` here fails on every database that has ever run `0005`, which is all of them.
3. `health_declaration.answers_encrypted` renders as
   `app.core.encryption.EncryptedJSON('health_declaration.answers_encrypted')` and
   `signature_image_encrypted` as
   `app.core.encryption.EncryptedBytes('health_declaration.signature_image_encrypted')` —
   not `JSONB`, not `LargeBinary`. `import app.core.encryption` is present.
4. `derived_flags` is plain `postgresql.JSONB`, **not** encrypted.
5. `attendance` has **both** `op.create_index('uq_attendance_session_id_student_id', …,
   unique=True)` and `op.create_index('uq_attendance_client_mark_id', …, unique=True)`.
6. `attendance.status`'s check constraint lists `'unmarked'`; both `marked_at` and
   `device_marked_at` are `sa.DateTime(timezone=True)`.
7. Every one of the four tables has non-null `studio_id`, an FK to `studio.id`, and an
   `ix_<table>_studio_id_id` index.
8. **No `GRANT` statements**, and nothing touching `audit_log`.
9. `downgrade()` has a real body — `test_every_revision_has_a_downgrade_body` asserts it.

Replace the autogenerated one-line docstring with a real one, in the register `0006` uses.
Because the file is hook-protected, write it with the approved heredoc, scoped to this path:

```bash
.venv/bin/python - <<'PY'
from pathlib import Path
p = Path("alembic/versions/0007_w3_attendance_and_health.py")
src = p.read_text(encoding="utf-8")
src = src.replace('"""w3 attendance and health\n', '"""w3 attendance and health (M4 || M5)\n\n' + '\n'.join([
  "SPEC 4.3's attendance block and the two health tables C3 left for M4: `attendance` and",
  "`absence_report` from app/models/attendance.py, `health_declaration` and `consent_record`",
  "APPENDED to app/models/health.py. W3's contract commit, authored on main before either",
  "worktree exists -- a lane never runs `alembic revision`.",
  "",
  "**health_form_template is NOT created here.** Revision 0005 created it and M1 seeded the",
  "kind='trial' form, which is what unblocked M3's trial booking without pulling M4 forward",
  "(conflict C3). A CREATE TABLE for it here fails on every database that has ever run 0005,",
  "which is all of them. What this revision does add for it is the D11 default `full`",
  "question set, seeded per studio at the bottom of upgrade().",
  "",
  "`attendance` carries TWO unique indexes and they are not redundant. (session_id,",
  "student_id) is the domain rule -- two rows are two answers to 'were they here'.",
  "client_mark_id alone is the OFFLINE rule (10.5): the queue replays a mark the server may",
  "already hold, and the client-generated id is the only thing identifying it as the same",
  "mark rather than a corrected second opinion. Dropping either loses a different guarantee.",
  "",
  "`attendance.status` includes 'unmarked' as a real, storable state (5.14) -- not a NULL and",
  "not an absent row. 5.14's sessions-held-vs-planned report is wrong the moment the two",
  "collapse, and it is wrong in the direction that blames a coach.",
  "",
  "`attendance` carries device_marked_at AND marked_at. 10.5 resolves a two-coach conflict on",
  "device_marked_at, because resolving on the server clock lets whoever reconnected second",
  "overwrite the earlier mark. Both timestamptz (G3).",
  "",
  "health_declaration.answers_encrypted is EncryptedJSON and signature_image_encrypted is",
  "EncryptedBytes (11.1). derived_flags is deliberately NOT encrypted: a coach reads it on",
  "every roster render (5.5), and encrypting it would mean decrypting a minor's medical",
  "record to draw a badge -- the exact outcome 11.1 and 11.2 exist to prevent. The column",
  "cannot enforce 'booleans only'; app/schemas/health.py rejects a non-boolean in",
  "mode='before' and nothing here should imply the database is the guard.",
  "",
  "No GRANT statements. Revision 0001 set ALTER DEFAULT PRIVILEGES, so every table created",
  "here inherits the runtime grant. This revision does not touch audit_log, so 0002's REVOKE",
  "stands. No GRANT for health_declaration either -- the protection on health data is 11.1's",
  "encryption and the audit log, not a table-level grant.",
  "",
]) + "\n", 1)
p.write_text(src, encoding="utf-8")
PY
```

- [ ] **Step 7: Prove it on a fresh database and on W2's**

```bash
# W2's database — the one that is already at 0006
.venv/bin/alembic upgrade head
.venv/bin/alembic current          # expect 0007 (head)

# a genuinely fresh one — -v drops the volume so the whole chain replays
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade head
.venv/bin/alembic current          # expect 0007 (head)
```

Expected: both clean, no traceback. If the fresh run fails on ordering, `attendance`
references `session` and `student`, which `0006` creates — check the revision's table order.

- [ ] **Step 8: Run the gates this task owns**

Run: `.venv/bin/pytest tests/contracts/test_w3_models.py tests/core/test_alembic_baseline.py tests/structure -q`
Expected: PASS. `test_the_migrations_match_the_models` is the one that was red in Step 4.

Run: `.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format --check app`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add app/models alembic/versions/0007_w3_attendance_and_health.py tests/contracts
git commit -m "feat(w3): promote the attendance and health models, revision 0007

attendance + absence_report into a new app/models/attendance.py; health_declaration +
consent_record APPENDED to app/models/health.py beside HealthFormTemplate, which revision
0005 created for M3's trial bookings (conflict C3). attendance carries both
UNIQUE(session_id, student_id) and a unique index on client_mark_id (§4.3) — the second is
what makes a double flush from one device a no-op (§10.5).

tests/contracts/_pending/test_w3_models.py moves up in the same commit; a model with no
test is the half of the pair that fails silently."
```

---

### Task 2: The D11 default `full` question set

**Files:**
- Modify: `alembic/versions/0007_w3_attendance_and_health.py` — a seed at the end of
  `upgrade()`, matching delete in `downgrade()`
- Modify: `app/services/structure/health_templates.py` — `FULL_TEMPLATE_SCHEMA`,
  `FULL_FLAG_QUESTIONS`, `ensure_full_template()`
- Modify: `app/services/identity/platform.py:78` — call it beside `ensure_trial_template`
- Modify: `app/services/demo/fixtures.py:152-157` — the `health_templates` layer seeds both
- Test: `tests/structure/test_full_template.py`

**Interfaces:**
- Consumes: `app.models.health.HealthFormTemplate`, `ensure_trial_template`'s idempotency
  shape (`(studio_id, kind, version)`).
- Produces:
  - `app.services.structure.health_templates.FULL_TEMPLATE_SCHEMA: dict[str, Any]`
    — `version=1`, `kind="full"`, `is_bundled_default=True`, `sections=[…]`
  - `.FULL_FLAG_QUESTIONS: tuple[str, ...]` =
    `("asthma","allergy","medication","epilepsy","heart","diabetes","injury","other")`
  - `.ensure_full_template(session: Session, studio_id: uuid.UUID, *, at: datetime) -> HealthFormTemplate`

**Why the flag ids are exactly those eight:** `web/packages/i18n/{he,en,ru}/health.ts`
already ships `flag.asthma`, `flag.allergy`, `flag.medication`, `flag.epilepsy`,
`flag.heart`, `flag.diabetes`, `flag.injury`, `flag.other` and nothing else. A flag question
whose id has no `flag.<id>` label renders a blank chip on a coach's roster, which is a
warning that silently is not one.

- [ ] **Step 1: Write the failing test**

Create `tests/structure/test_full_template.py`:

```python
"""D11's default `full` question set — 'ship a standard Israeli sports health declaration
as the default health_form_template question set, seeded by migration. A manager can add,
remove and reword questions in the app.'

§15 item 1 used to make the studio's own PDF a hard blocker on the whole M4 lane. D11
closed that on 2026-08-24 and this file is what makes the closure real: there is a default
set, every studio has one, and it says out loud that it is a starting point.

**D11's caveat is not decoration.** A health declaration for minors in an Israeli sports
club touches insurance and regulatory ground. The bundled template is a starting point and
the app must say so where the manager edits it. `is_bundled_default` is the machine-readable
half of that; `template.disclaimer` in web/packages/i18n/*/health.ts is the visible half.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.models.health import HealthFormTemplate
from app.models.studio import Studio
from app.services.structure.health_templates import (
    FULL_FLAG_QUESTIONS,
    FULL_TEMPLATE_SCHEMA,
    ensure_full_template,
    ensure_trial_template,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]
T0 = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)


@pytest.fixture
def studio_id(app_session: Session) -> Iterator[uuid.UUID]:
    studio = Studio(name="מועדון", slug=f"ft-{uuid.uuid4().hex[:8]}")
    app_session.add(studio)
    app_session.commit()
    yield studio.id
    app_session.rollback()


def _questions() -> list[dict]:
    return [q for section in FULL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]]


def _count(session: Session, studio_id: uuid.UUID, kind: str) -> int:
    return session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == studio_id, HealthFormTemplate.kind == kind)
    ).scalar_one()


# -- the seed reaches every studio, not only the ones alive at migration time ----------
@pytest.mark.db
def test_the_migration_seeded_a_full_template_for_the_demo_studio(app_session):
    """D11 says 'seeded by migration'. The demo studio is created by migration 0003, so it
    is the one studio guaranteed to exist at 0007 and the cheapest proof the seed ran."""
    rows = app_session.execute(
        select(func.count()).select_from(HealthFormTemplate).where(
            HealthFormTemplate.kind == "full"
        )
    ).scalar_one()
    assert rows >= 1


def test_a_studio_provisioned_after_the_migration_still_gets_one(app_session, studio_id):
    """The hole a migration-only seed leaves. A studio created tomorrow never ran 0007's
    INSERT, and the health lane cannot fix that -- seeding is a migration and migrations
    are main-only."""
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "full") == 1


def test_seeding_twice_does_not_create_a_second(app_session, studio_id):
    """Same reason as the trial form: the wizard is resumable (§5.1), and the partial
    unique index would turn a second published v1 into an integrity error rather than a
    duplicate."""
    ensure_full_template(app_session, studio_id, at=T0)
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "full") == 1


def test_it_returns_the_existing_row_rather_than_none(app_session, studio_id):
    first = ensure_full_template(app_session, studio_id, at=T0)
    second = ensure_full_template(app_session, studio_id, at=T0)
    assert first.id == second.id


def test_seeding_the_full_one_does_not_disturb_the_trial_one(app_session, studio_id):
    """Conflict C3's resolution has to survive this wave. M3's trial booking writes against
    the kind='trial' template and nothing here may replace or renumber it."""
    trial = ensure_trial_template(app_session, studio_id, at=T0)
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "trial") == 1
    assert ensure_trial_template(app_session, studio_id, at=T0).id == trial.id


# -- D11's caveat ----------------------------------------------------------------------
def test_the_bundled_set_says_it_is_bundled():
    """D11 — 'the bundled template is a starting point and the app must say so where the
    manager edits it. It is not a compliance artefact.' The editor cannot show that notice
    on the right template unless the row says which one it is."""
    assert FULL_TEMPLATE_SCHEMA["is_bundled_default"] is True


def test_the_disclaimer_string_exists_in_every_locale():
    """The visible half of the same caveat. A marker with no string to render is a caveat
    nobody reads."""
    for locale in ("he", "en", "ru"):
        text = (ROOT / f"web/packages/i18n/{locale}/health.ts").read_text(encoding="utf-8")
        assert "'template.disclaimer'" in text, locale


# -- the shape a coach's badge is derived from -----------------------------------------
def test_every_flag_question_has_a_label_to_render():
    """§5.5's badge is drawn from `flag.<id>` in the i18n bundle. A flag question whose id
    has no label renders a blank chip -- a warning that silently is not one."""
    text = (ROOT / "web/packages/i18n/he/health.ts").read_text(encoding="utf-8")
    for question_id in FULL_FLAG_QUESTIONS:
        assert f"'flag.{question_id}'" in text, question_id


def test_every_flag_question_is_marked_as_one():
    marked = {q["id"] for q in _questions() if q.get("flag")}
    assert marked == set(FULL_FLAG_QUESTIONS)


def test_every_flag_question_is_a_boolean():
    """G7 and §5.5 — derived_flags holds booleans only, never free text. A free-text flag
    question would put a minor's medical prose on a coach's screen."""
    for question in _questions():
        if question.get("flag"):
            assert question["type"] == "boolean", question["id"]


def test_the_set_asks_what_an_israeli_sports_declaration_asks():
    """D11 — 'a standard Israeli sports health declaration'. Cardiac history and the
    family sudden-death question are the two a sports declaration exists for; dropping
    them would leave a form that is merely short rather than standard."""
    ids = {q["id"] for q in _questions()}
    for expected in ("heart", "family_sudden_death", "chest_pain", "fainting", "fit_to_train"):
        assert expected in ids, expected


def test_it_is_longer_than_the_trial_form_and_that_is_the_point():
    """§5.4a's trial form is short because it sits in a five-step funnel on a phone. The
    full one is signed once, at leisure, and trades brevity for completeness."""
    from app.services.structure.health_templates import TRIAL_TEMPLATE_SCHEMA

    trial = [q for s in TRIAL_TEMPLATE_SCHEMA["sections"] for q in s["questions"]]
    assert len(_questions()) > len(trial)


def test_the_schema_is_versioned_so_a_signature_records_what_was_signed():
    """§4.3 stores template_version on the declaration. D11 makes editing the questions a
    manager's right, so without a version a template edit silently rewrites the meaning of
    every signature already collected."""
    assert FULL_TEMPLATE_SCHEMA["version"] == 1
    assert FULL_TEMPLATE_SCHEMA["kind"] == "full"


def test_the_schema_carries_no_place_for_an_answer():
    """The template holds questions. Anything resembling storage for a response belongs on
    health_declaration, encrypted (§11.1)."""
    text = str(FULL_TEMPLATE_SCHEMA)
    for forbidden in ("answers", "signature_image", "signed_by", "derived_flags"):
        assert forbidden not in text, forbidden
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/pytest tests/structure/test_full_template.py -q`
Expected: FAIL at import — `ImportError: cannot import name 'FULL_TEMPLATE_SCHEMA'`.

- [ ] **Step 3: Author the question set and the seeder**

Append to `app/services/structure/health_templates.py`, below the trial block:

```python
#: D11 — 'ship a standard Israeli sports health declaration as the default
#: health_form_template question set, seeded by migration. A manager can add, remove and
#: reword questions in the app, and may upload their own PDF, stored at
#: source_pdf_object_key for reference.'
#:
#: **`is_bundled_default` is D11's caveat in machine-readable form.** A health declaration
#: for minors in an Israeli sports club touches insurance and regulatory ground; this set
#: is a STARTING POINT and the app must say so where the manager edits it. The visible half
#: is `template.disclaimer` in web/packages/i18n/{he,en,ru}/health.ts. It is not a
#: compliance artefact and must not be presented as one.
#:
#: Longer than the trial form on purpose. §5.4a's trial declaration is step 3 of a
#: five-step funnel walked on a phone, so it trades completeness for brevity. This one is
#: signed once, at leisure, and makes the opposite trade.
FULL_TEMPLATE_SCHEMA: dict[str, Any] = {
    "version": 1,
    "kind": "full",
    "is_bundled_default": True,
    "title": "הצהרת בריאות",
    "sections": [
        {
            "id": "medical_history",
            "title": "רקע רפואי",
            "questions": [
                {"id": "chronic_illness", "type": "boolean", "label": "האם קיימת מחלה כרונית?"},
                {
                    "id": "chronic_illness_details",
                    "type": "text",
                    "label": "פירוט המחלה הכרונית",
                    "required": False,
                    "visible_if": {"chronic_illness": True},
                },
                {"id": "asthma", "type": "boolean", "label": "האם יש אסתמה?", "flag": True},
                {"id": "allergy", "type": "boolean", "label": "האם יש אלרגיה?", "flag": True},
                {
                    "id": "allergy_details",
                    "type": "text",
                    "label": "פירוט האלרגיה",
                    "required": False,
                    "visible_if": {"allergy": True},
                },
                {
                    "id": "medication",
                    "type": "boolean",
                    "label": "האם התלמיד/ה נוטל/ת תרופות באופן קבוע?",
                    "flag": True,
                },
                {
                    "id": "medication_details",
                    "type": "text",
                    "label": "אילו תרופות",
                    "required": False,
                    "visible_if": {"medication": True},
                },
                {"id": "epilepsy", "type": "boolean", "label": "האם יש אפילפסיה או פרכוסים?", "flag": True},
                {"id": "diabetes", "type": "boolean", "label": "האם יש סוכרת?", "flag": True},
            ],
        },
        {
            "id": "cardiac",
            "title": "לב ומאמץ",
            "questions": [
                {
                    "id": "heart",
                    "type": "boolean",
                    "label": "האם ידוע על מחלת לב, מום לבבי או ניתוח לב?",
                    "flag": True,
                },
                {
                    "id": "chest_pain",
                    "type": "boolean",
                    "label": "האם הופיעו כאבים בחזה במהלך מאמץ גופני?",
                },
                {
                    "id": "fainting",
                    "type": "boolean",
                    "label": "האם הייתה התעלפות או סחרחורת במהלך מאמץ גופני?",
                },
                {
                    "id": "family_sudden_death",
                    "type": "boolean",
                    "label": "האם היה במשפחה מקרה של מוות פתאומי לפני גיל 50?",
                },
            ],
        },
        {
            "id": "orthopaedic",
            "title": "אורתופדיה ופציעות",
            "questions": [
                {
                    "id": "injury",
                    "type": "boolean",
                    "label": "האם קיימת פציעה פעילה או בעיה אורתופדית?",
                    "flag": True,
                },
                {
                    "id": "surgery_last_year",
                    "type": "boolean",
                    "label": "האם עבר/ה ניתוח בשנה האחרונה?",
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
            "id": "other",
            "title": "נוסף",
            "questions": [
                {
                    "id": "other",
                    "type": "boolean",
                    "label": "האם יש מצב רפואי נוסף שחשוב שנדע עליו?",
                    "flag": True,
                },
                {
                    "id": "other_details",
                    "type": "text",
                    "label": "פירוט",
                    "required": False,
                    "visible_if": {"other": True},
                },
                {"id": "health_fund", "type": "text", "label": "קופת חולים", "required": False},
                {
                    "id": "emergency_contact",
                    "type": "phone",
                    "label": "טלפון לשעת חירום",
                    "required": True,
                },
            ],
        },
        {
            "id": "declaration",
            "title": "הצהרה",
            "questions": [
                {
                    "id": "fit_to_train",
                    "type": "boolean",
                    "label": "אני מצהיר/ה שהתלמיד/ה כשיר/ה לפעילות גופנית ולאימוני ג'ודו",
                    "required": True,
                },
                {
                    "id": "notify_changes",
                    "type": "boolean",
                    "label": "אני מתחייב/ת לעדכן את המועדון בכל שינוי במצב הבריאותי",
                    "required": True,
                },
            ],
        },
    ],
}

#: The questions whose answers become §5.5's `derived_flags`, named rather than derived by
#: scanning for `"flag": True` — same reason as `TRIAL_FLAG_QUESTIONS`: M4's pipeline reads
#: one list, and a question that quietly loses its flag is a visible diff.
#:
#: These eight ids are exactly the `flag.*` labels already in
#: web/packages/i18n/{he,en,ru}/health.ts. A flag with no label renders a blank chip on a
#: coach's roster, which is a warning that silently is not one.
FULL_FLAG_QUESTIONS = (
    "asthma",
    "allergy",
    "medication",
    "epilepsy",
    "heart",
    "diabetes",
    "injury",
    "other",
)


def ensure_full_template(
    session: Session, studio_id: uuid.UUID, *, at: datetime
) -> HealthFormTemplate:
    """Idempotent by (studio_id, kind, version), exactly like `ensure_trial_template`.

    D11 says the default set is seeded by migration, and revision `0007` does that for
    every studio that existed when it ran. This is the other half: a studio provisioned
    afterwards never ran that INSERT, and a demo reset wipes `health_form_template` and
    re-seeds from the fixture layer. Without this, D11's "ships with a default question
    set" would be true only of studios alive on 2026-08-26.
    """
    existing = session.execute(
        select(HealthFormTemplate).where(
            HealthFormTemplate.studio_id == studio_id,
            HealthFormTemplate.kind == "full",
            HealthFormTemplate.version == FULL_TEMPLATE_SCHEMA["version"],
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    template = HealthFormTemplate(
        studio_id=studio_id,
        kind="full",
        version=FULL_TEMPLATE_SCHEMA["version"],
        schema=FULL_TEMPLATE_SCHEMA,
        published_at=at,
        created_at=at,
    )
    session.add(template)
    session.flush()
    return template
```

Wire the two call sites. In `app/services/identity/platform.py`, beside the existing
`ensure_trial_template(session, studio.id, at=at)`:

```python
        ensure_trial_template(session, studio.id, at=at)
        # D11 — every studio ships with the default `full` question set, editable in the
        # app. Revision 0007 seeded the studios that existed when it ran; this is the
        # same guarantee for every studio provisioned afterwards.
        ensure_full_template(session, studio.id, at=at)
```

In `app/services/demo/fixtures.py`, the `health_templates` layer's seed function seeds both
(the reset wipes `health_form_template`, so a trial-only re-seed would leave the demo studio
without the default the migration gave it). Keep the layer's `tables=("health_form_template",)`
as it is.

- [ ] **Step 4: Add the seed to revision 0007**

Append to `upgrade()`, after the four `create_table` calls, using the approved heredoc. The
INSERT is a **frozen copy** of `FULL_TEMPLATE_SCHEMA` at v1: a migration that imported the
live constant would rewrite history the first time a lane reworded a question.

```python
    # -- D11's default `full` question set ------------------------------------------
    # 'Ship a standard Israeli sports health declaration as the default
    # health_form_template question set, seeded by migration.' Every studio that exists
    # when this runs gets one; app/services/structure/health_templates.py's
    # ensure_full_template() covers every studio provisioned afterwards.
    #
    # Frozen copy, deliberately. Importing the live constant would let a later reword of
    # the questions rewrite what this revision did, and a migration that changes meaning
    # after the fact is not a migration.
    #
    # is_bundled_default carries D11's caveat: a starting point, not a compliance
    # artefact, and the app says so where the manager edits it.
    op.execute(
        sa.text(
            "INSERT INTO health_form_template "
            "(id, studio_id, kind, version, schema, published_at, created_at, updated_at) "
            "SELECT gen_random_uuid(), s.id, 'full', 1, CAST(:schema AS jsonb), now(), now(), now() "
            "FROM studio s "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM health_form_template t "
            "  WHERE t.studio_id = s.id AND t.kind = 'full' AND t.version = 1"
            ")"
        ).bindparams(schema=_FULL_TEMPLATE_SCHEMA_JSON)
    )
```

with `_FULL_TEMPLATE_SCHEMA_JSON` a module-level `json.dumps(...)` of the frozen dict
(`ensure_ascii=False`) above `upgrade()`, and `import json` at the top. In `downgrade()`,
before the `drop_table` calls:

```python
    op.execute("DELETE FROM health_form_template WHERE kind = 'full' AND version = 1")
```

Check `gen_random_uuid()` is available — `pgcrypto`/PG13+ builtin; `0003_demo_studio.py`'s
INSERT shows the convention this repo already uses for a seeded id. If it does not resolve,
match `0003`'s approach exactly.

- [ ] **Step 5: Re-apply on a fresh database and run the tests**

```bash
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/structure tests/dev tests/identity -q
```

Expected: PASS. Watch specifically for
`tests/structure/test_trial_template.py::test_no_full_template_is_seeded_here` — it asserts
`ensure_trial_template` alone seeds no `full` template, which is still true and must stay
true.

- [ ] **Step 6: Commit**

```bash
git add alembic/versions/0007_w3_attendance_and_health.py app/services tests/structure
git commit -m "feat(w3): seed D11's default 'full' health question set

A standard Israeli sports health declaration, seeded by revision 0007 for every studio
that exists and by ensure_full_template() for every studio provisioned afterwards — a
migration-only seed would have reached only the studios alive today, and a demo reset
wipes health_form_template.

The eight flag questions are exactly the flag.* labels already in the i18n bundle: a flag
with no label renders a blank chip on a coach's roster, which is a warning that silently
is not one.

D11's caveat travels with the row as is_bundled_default, and visibly as
template.disclaimer where the manager edits it. It is a starting point, not a compliance
artefact."
```

---

### Task 3: `lane-check.sh` case branches for `attendance` and `health`

**Files:**
- Modify: `scripts/lane-check.sh:60-137` — a `core_dirs` array, and two new case branches
- Test: `tests/config/test_lane_check.py` — four new assertions

**Interfaces:**
- Consumes: nothing new.
- Produces: `./scripts/lane-check.sh attendance --dry-run` and `… health --dry-run` each
  name every path their lane owns.

**The two gaps, stated exactly.** The default branch resolves
`app/services/$V`, `app/routers/$V.py`, `app/models/$V.py` and nothing else, and the
frontend half looks only at `web/apps/*/src/features/$V/` plus `web/packages/core/src/$V`.
So today:

| Lane | Owned path | Reached by the default branch? |
|---|---|:--:|
| health | `app/workers/health_reminders.py` | **no** |
| health | `app/routers/health_templates.py`, `app/routers/health_declarations.py` | **no** |
| health | `app/routers/health.py` | yes — and it is **core's liveness probe**, not this lane's |
| attendance | `app/routers/sync.py` | **no** |
| attendance | `web/packages/core/src/offline/**` | **no** — it looks for `…/core/src/attendance` |
| attendance | `web/apps/parent/src/features/absence/**` | **no** |

- [ ] **Step 1: Write the failing test**

Append to `tests/config/test_lane_check.py`:

```python
def test_health_resolves_the_worker_and_the_routers_it_actually_owns():
    """A green gate over an unchecked worker is worse than a red one. §5.5's reminder
    ladder is a job in app/workers/health_reminders.py, which no `app/routers/$V.py`
    convention reaches — the lane's own check would have gone green having never
    type-checked it.

    And SPEC §7 puts M4's routes at /health-templates and
    /students/{id}/health-declaration, so neither router is named `health.py`."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in (
        "app/workers/health_reminders.py",
        "app/routers/health_templates.py",
        "app/routers/health_declarations.py",
    ):
        assert path in text, f"{path} is invisible to lane-check.sh health"


def test_the_health_lane_does_not_gate_core_s_liveness_router():
    """app/routers/health.py is `GET /api/v1/health` — core's liveness probe, asserted by
    tests/test_health.py. The default branch would resolve `app/routers/$V.py` straight
    onto it and hand the health lane a gate over a file it does not own, which reads as
    ownership. The case branch names the lane's two routers instead."""
    stdout = _run("health", "--dry-run").stdout
    assert "app/routers/health.py" not in stdout


def test_attendance_resolves_the_sync_router_and_the_offline_queue():
    """M5 owns app/routers/sync.py and web/packages/core/src/offline/** — the only lane
    that owns anything under web/packages/core. Neither is named by the default branch,
    and the offline queue is the highest-risk code in the plan."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in ("app/routers/sync.py", "offline"):
        assert path in text, f"{path} is invisible to lane-check.sh attendance"


def test_attendance_reaches_the_parent_absence_screens():
    """§5.7's parent pre-report lives at web/apps/parent/src/features/absence/, not
    features/attendance/ — the same shape as `people`'s features/landing/. Without the
    override the frontend, lint and CSS gates skip every one of its files and the check
    still prints green."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "absence" in text


def test_the_new_verticals_fail_closed_before_their_source_exists():
    """Adding a case must not hand a vertical a free green — the same guard `identity`
    and `structure` got. Until the lanes land files, the scoped gates that can skip do,
    and anything that resolves nothing at all must exit non-zero."""
    for vertical in ("attendance", "health"):
        result = _run(vertical, "--dry-run")
        if result.returncode != 0:
            assert "nothing was checked" in (result.stdout + result.stderr)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/pytest tests/config/test_lane_check.py -q`
Expected: FAIL — four failures naming `app/workers/health_reminders.py`,
`app/routers/health_templates.py`, `app/routers/sync.py`, `absence`. The
`test_the_health_lane_does_not_gate_core_s_liveness_router` case fails too, because
`app/routers/health.py` exists and the default branch resolves it.

- [ ] **Step 3: Add the `core_dirs` mechanism and the two branches**

Beside the existing `feature_dirs` default in `scripts/lane-check.sh`, add:

```bash
# Subdirectories of web/packages/core/src this lane owns. Defaults to one named for the
# vertical, which is what the frontend and lint gates looked for before this existed and
# which no current vertical actually has. `attendance` is the only lane in the plan that
# owns anything under web/packages/core -- §10's offline queue -- and it does not follow
# the naming convention, so it overrides this in its own case branch. Same rule as
# feature_dirs above: a directory this lane owns but does not name here is a directory
# the gate silently skips.
core_dirs=("$V")
```

Then use `core_dirs` where the script currently hardcodes `web/packages/core/src/$V` — in
the `web_tests` `find`, in `eslint_targets`, and in the stylelint `css_globs`. Loop the same
way `feature_dirs` is looped, with the `${arr[@]+"${arr[@]}"}` idiom (bash 3.2, no
globstar, no mapfile).

Add the two branches before `*)`:

```bash
  attendance)
    # §7 puts the offline flush at /sync, so app/routers/sync.py does not follow the
    # per-vertical convention and the default branch would type-check the roster router
    # while silently skipping the endpoint the entire offline queue drains into.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/routers/sync.py" \
                   "app/models/$V.py")
    test_candidates=("tests/$V")
    # §5.7's parent pre-report is this lane's, and it lives under features/absence/ --
    # the parent app's own screen for it (parent artboard 12a), not a section of the
    # coach roster. Same shape as `people`'s features/landing/.
    feature_dirs=(attendance absence)
    # §10.1-§10.6 -- pending_ops, the four-state network machine and the sync queue.
    # This is the only lane in the plan that owns anything under web/packages/core, and
    # it is the highest-risk code in it. The default `core_dirs=($V)` looks for
    # web/packages/core/src/attendance, which will never exist.
    core_dirs=(offline)
    ;;
  health)
    # app/routers/health.py is NOT here, deliberately. That file is core's liveness probe
    # -- `GET /api/v1/health`, asserted by tests/test_health.py -- and the default branch
    # would resolve `app/routers/$V.py` straight onto it, handing this lane a gate over a
    # file it does not own. SPEC §7 puts M4's routes at /health-templates and
    # /students/{id}/health-declaration; those two files are the lane's.
    #
    # app/workers/health_reminders.py is the reason this branch exists at all. §5.5's
    # one-tap `שלח תזכורת להורה` and its ladder are a job, and the default branch reaches
    # no worker -- so this lane's own gate would have gone green having never
    # type-checked it. Same reasoning as `people`'s app/workers/followups.py.
    py_candidates=("app/services/$V" "app/routers/health_templates.py" \
                   "app/routers/health_declarations.py" \
                   "app/workers/health_reminders.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    ;;
```

- [ ] **Step 4: Run the tests and both dry runs**

Run: `.venv/bin/pytest tests/config/test_lane_check.py -q`
Expected: PASS.

Run: `./scripts/lane-check.sh attendance --dry-run` and `./scripts/lane-check.sh health --dry-run`
Expected: exit 0 (Task 4 gives each a `tests/<vertical>/` directory, so the backend gate
resolves). Read both plans and confirm by eye that every owned path from the milestone
plan's "Owns" block appears, and that `app/routers/health.py` does not.

Run: `./scripts/lane-check.sh core --dry-run | tail -1`
Expected: still `6 scoped gates` — `core_dirs` must not change `core`'s plan.

Run: `.venv/bin/pytest tests/config -q` and `bash -n scripts/lane-check.sh`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/lane-check.sh tests/config/test_lane_check.py
git commit -m "fix(lane-check): reach every path the attendance and health lanes own

The default branch gives app/services/\$V, app/routers/\$V.py and app/models/\$V.py and
nothing else. That left app/workers/health_reminders.py, app/routers/sync.py,
web/packages/core/src/offline/** and web/apps/parent/src/features/absence/** invisible to
the one command each lane runs — a green gate over an unchecked worker is worse than a red
one, because it reads as covered.

app/routers/health.py is deliberately excluded: it is core's liveness probe, not the
health vertical's router, and the default branch resolved \$V.py straight onto it."
```

---

### Task 4: `tests/attendance/conftest.py` and `tests/health/conftest.py`

**Files:**
- Create: `tests/attendance/__init__.py`, `tests/attendance/conftest.py`,
  `tests/attendance/test_lane_gate.py`
- Create: `tests/health/__init__.py`, `tests/health/conftest.py`,
  `tests/health/test_lane_gate.py`

**Interfaces:**
- Consumes: `tests/conftest.py`'s `app_session`, `client`, `fake_provider`, `sign_in`.
- Produces, for lane ATTENDANCE: `T0`, `TODAY`, `Caller`, `studio`, `as_manager`,
  `as_lead_coach`, `as_assistant_coach`, `as_guardian`, `a_class`, `a_group`,
  `a_training_year`, `a_session`, `an_enrolled_student`, `assign_coach`, `tenant_session`,
  `other_studio_session_id`, and the module-level helper `make_session(...)`.
- Produces, for lane HEALTH: `T0`, `Caller`, `studio`, `as_owner`, `as_manager`,
  `as_lead_coach`, `as_assistant_coach`, `as_guardian_of`, `a_student`, `a_full_template`,
  `a_trial_template`, `tenant_session`, `audit_entries`, `encryption_keys` (autouse).

The pattern is set by `tests/schedule/conftest.py` and `tests/people/conftest.py` and this
task follows it rather than inventing a third: every caller **signs in for real** twice —
the first sign-in creates the `auth_identity` (nothing else can), rows are attached to it,
the second picks up a token whose `sid` and `roles` claims reflect them. A hand-made token
would test the role dependency against an input the product cannot produce. `Caller` is
duplicated per lane on purpose; a shared one is a shared file two lanes would both edit.

`tests/health/conftest.py` gets the autouse `encryption_keys` fixture (copied from
`tests/people/conftest.py`) because `answers_encrypted` and `signature_image_encrypted` are
`EncryptedJSON`/`EncryptedBytes` and `Keyring.from_settings()` refuses outright when
`ENCRYPTION_KEYS` is empty — which it is locally and on CI. `tests/attendance/` gets no such
fixture: W3's attendance tables carry no encrypted column, and a fixture that is not needed
is a fixture the lane will copy into places it does not belong.

`audit_entries` exists because §11.2 makes "every read of a full declaration is
audit-logged" a testable claim, and the lane will assert it on every manager read path. A
fixture is the difference between asserting it once and asserting it everywhere.

- [ ] **Step 1: Write the failing gate test for each lane**

`tests/attendance/test_lane_gate.py`:

```python
"""The fixtures W3's contract commit owes lane ATTENDANCE (plan §2.2 item 8).

Not a test of the lane's code — none exists yet. This asserts the *fixtures resolve*, so
the lane's first red is its own logic rather than a conftest that never worked. The same
shape as tests/people/test_lane_gate.py.
"""

from __future__ import annotations

import uuid

import pytest


@pytest.mark.db
def test_a_session_exists_to_mark_attendance_against(a_session):
    assert isinstance(a_session, uuid.UUID)


@pytest.mark.db
def test_a_student_is_enrolled_in_the_group_that_session_belongs_to(an_enrolled_student):
    assert isinstance(an_enrolled_student, uuid.UUID)


@pytest.mark.db
def test_every_role_in_the_matrix_can_sign_in(
    as_manager, as_lead_coach, as_assistant_coach, as_guardian
):
    """§3.2's matrix is the thing every route in this lane is scoped by, so the lane needs
    a caller at each level before it writes its first route."""
    tokens = {c.token for c in (as_manager, as_lead_coach, as_assistant_coach, as_guardian)}
    assert len(tokens) == 4


@pytest.mark.db
def test_another_studio_s_session_is_reachable_as_a_negative(other_studio_session_id):
    """The tenant filter should make it invisible rather than merely forbidden — 404,
    never 403 — and a lane cannot assert that without a row in another studio."""
    assert isinstance(other_studio_session_id, uuid.UUID)


@pytest.mark.db
def test_the_tenant_scoped_session_is_the_one_services_are_written_against(tenant_session):
    """Arrange with app_session, act and assert through this. A list assertion made
    through the unscoped session sees every studio's rows, including the other lane's."""
    assert tenant_session.is_active
```

`tests/health/test_lane_gate.py`:

```python
"""The fixtures W3's contract commit owes lane HEALTH (plan §2.2 item 8).

Not a test of the lane's code — none exists yet. This asserts the *fixtures resolve*, so
the lane's first red is its own logic rather than a conftest that never worked.
"""

from __future__ import annotations

import uuid

import pytest


@pytest.mark.db
def test_a_student_exists_to_declare_about(a_student):
    assert isinstance(a_student, uuid.UUID)


@pytest.mark.db
def test_the_default_full_template_is_reachable(a_full_template):
    """D11's bundled set. The lane builds the editor on top of it and the declaration
    flow against it; both need the row the migration seeded."""
    assert isinstance(a_full_template, uuid.UUID)


@pytest.mark.db
def test_the_trial_template_is_still_there_and_is_not_this_lane_s(a_trial_template):
    """Conflict C3 — M1 seeded it so M3's trial bookings had something to write against.
    The lane owns the `full` one and must not touch this."""
    assert isinstance(a_trial_template, uuid.UUID)


@pytest.mark.db
def test_a_guardian_of_a_real_child_can_sign_in(as_guardian_of, a_student):
    """§5.5's gate is a hard block in the PARENT app, so the lane needs a parent bound to
    an actual child rather than to a placeholder id."""
    caller = as_guardian_of(a_student)
    assert caller.token


@pytest.mark.db
def test_the_keyring_is_configured_for_the_encrypted_columns(app_session):
    """answers_encrypted and signature_image_encrypted are EncryptedJSON/EncryptedBytes
    (§11.1), and Keyring.from_settings() refuses outright when ENCRYPTION_KEYS is empty —
    which it is locally and on CI. The autouse fixture is what makes the lane's first
    write succeed."""
    from app.core.encryption import Keyring

    assert Keyring.from_settings() is not None


@pytest.mark.db
def test_audit_entries_can_be_read_back(audit_entries):
    """§11.2 — every read of a full declaration is audit-logged. The lane asserts that on
    every manager read path, so the reader is a fixture rather than eight copies."""
    assert audit_entries("health_declaration", uuid.uuid4()) == []
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `.venv/bin/pytest tests/attendance tests/health -q`
Expected: FAIL — `fixture 'a_session' not found`, `fixture 'a_student' not found`, and so
on for each.

- [ ] **Step 3: Write the two conftests**

`tests/attendance/conftest.py` — follow `tests/schedule/conftest.py` for `Caller`,
`studio`, `_make_caller`, `a_class`/`a_group`/`a_training_year`, and
`tests/people/conftest.py` for `make_session`, `assign_coach`, `tenant_session` and
`other_studio_*`. `T0 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)` (a Tuesday inside the
2026/27 training year, matching the schedule lane's clock) and `TODAY = date(2026, 11, 3)`.
`Caller.headers` carries both `Authorization` and `X-Dev-Now: T0` — every attendance test
compares a device clock against a server clock, and §19's `X-Dev-Now` is the only way to
make them the same value on both sides.

`a_session` inserts a `Session` row directly rather than calling
`ScheduleService.materialize_sessions`: the lane needs a session id it can predict, and
materialization is the schedule lane's behaviour to test, not this one's.
`an_enrolled_student` creates `Person` → `Student` (`status='active'`,
`health_status='missing'` — the default a roster badge renders) → `Enrollment`
(`status='active'`, `started_on=date(2026, 9, 1)`, `attends_weekdays=None`, which is C12's
"every session of this group" and the common case).

`tests/health/conftest.py` — same caller machinery plus `as_owner` (§3.2 gives "Read full
health declaration" to manager and owner, so the lane needs both), `as_guardian_of(student_id)`
returning a `Caller` whose `Person` has a real `Guardian` row for that student,
`a_student` (a `Person` + `Student` with `health_status='missing'`), `a_full_template` and
`a_trial_template` (each `ensure_*_template(app_session, studio.id, at=T0)` → `.id`, which
is idempotent against whatever the migration already seeded), `tenant_session`, the autouse
`encryption_keys`, and:

```python
@pytest.fixture
def audit_entries(app_session: Session):
    """§11.2 — 'every read is audit-logged'. Read the log back by entity, newest first.

    A fixture rather than a helper each test copies: the lane asserts this on every
    manager read path, and eight copies is eight chances for one of them to assert
    against the wrong entity_type and pass by looking empty.

    G7: this returns the audit ROWS, and `diff` on a health entity never carries
    declaration contents. Nothing here decrypts anything.
    """

    def _read(entity_type: str, entity_id: uuid.UUID) -> list[AuditLog]:
        return list(
            app_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
                .order_by(AuditLog.created_at.desc())
            ).scalars()
        )

    return _read
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `.venv/bin/pytest tests/attendance tests/health -q`
Expected: PASS, 11 tests.

Run: `.venv/bin/ruff check tests && .venv/bin/ruff format --check tests`
Expected: clean. (`ruff format` is a gate on `tests/` — W2 needed a follow-up commit
`c33b225` for exactly this.)

Run: `./scripts/lane-check.sh attendance --dry-run` and `./scripts/lane-check.sh health --dry-run`
Expected: each now names `tests/attendance` / `tests/health` in its backend gate.

- [ ] **Step 5: Commit**

```bash
git add tests/attendance tests/health
git commit -m "test(w3): the fixtures each lane starts from (plan §2.2 item 8)

Callers signed in for real at every level of §3.2's matrix, a session and an enrolled
student for ATTENDANCE, a student and both templates for HEALTH, and an audit reader
because §11.2 makes 'every read is audit-logged' something the lane asserts on every
manager read path.

tests/health carries the autouse keyring fixture — answers_encrypted and
signature_image_encrypted are EncryptedJSON/EncryptedBytes and Keyring.from_settings()
refuses outright when ENCRYPTION_KEYS is empty, which it is locally and on CI.
tests/attendance deliberately does not: W3's attendance tables carry no encrypted column."
```

---

### Task 5: The D11 correction and the health lane's router ownership

**Files:**
- Modify: `docs/plan/milestone-plan.md:608-664` — Lane HEALTH's "Owns" block and the
  "Blocked on you" note
- Modify: `docs/plan/prompts/w3-lanes.md` — the same two corrections in the lane prompt
- Modify: `docs/plan/prompts/w3-contract.md` — record what shipped
- Modify: `docs/plan/state.yaml` — W3 `status: active`, `opened: 2026-08-26`, the contract
  piece ticked

**Interfaces:** documentation only. Nothing imports these.

- [ ] **Step 1: Replace the "Blocked on you" note**

`milestone-plan.md § W3 · Lane HEALTH` currently ends:

> **Blocked on you** — §15 item 1: the studio's הצהרת בריאות PDF at
> `docs/forms/health-declaration.pdf`. **This is a hard blocker on the whole lane** — the
> template is derived from it. Get it before W3 opens, not during.

Replace with:

```markdown
**Not blocked.** §15 item 1 made the studio's own הצהרת בריאות PDF a hard blocker on this
whole lane, because the template was to be derived from it.
[D11](../design/decisions.md#d11--the-health-declaration-ships-with-a-default-question-set-the-manager-can-edit)
closed that on 2026-08-24 and revision `0007` acted on it: a standard Israeli sports health
declaration is seeded as the default `full` `health_form_template` question set, and this
lane makes it editable — a manager adds, removes and rewords questions, and may upload
their own PDF, stored at `source_pdf_object_key` for reference only. There is no
`docs/forms/` directory and there does not need to be.

**Carry D11's caveat into the UI.** A health declaration for minors in an Israeli sports
club touches insurance and regulatory ground. The bundled template is a **starting point
and the app must say so** where the manager edits it — `template.disclaimer` is already in
all three locales, and the seeded row carries `is_bundled_default`. It is not a compliance
artefact and must not be presented as one.
```

- [ ] **Step 2: Correct the same lane's "Owns" block**

In that block, `app/routers/health.py` is wrong: that file is core's liveness probe. Replace
the router line and add the note:

```
app/models/health.py              app/services/health/**
app/routers/health_templates.py   app/routers/health_declarations.py
app/workers/health_reminders.py   tests/health/**
```

```markdown
> **`app/routers/health.py` is not this lane's file.** It is core's liveness probe —
> `GET /api/v1/health`, asserted by `tests/test_health.py`. SPEC §7 puts M4's routes at
> `/health-templates` and `/students/{id}/health-declaration`, hence the two filenames
> above. `GET /health-templates` already exists in `app/routers/structure.py` (M1,
> conflict C3); this lane adds the write side.
```

- [ ] **Step 3: Make the same two corrections in `docs/plan/prompts/w3-lanes.md`**

The `lane/health` prompt block lists `app/routers/health.py` in its "You own" list and its
per-worktree section describes a `.worktreeinclude` file that does not exist in this repo.
Fix the router line to the two real filenames, add the liveness sentence, and replace the
`.worktreeinclude` paragraph with what Task 6's handover actually says.

- [ ] **Step 4: Record what shipped in `docs/plan/prompts/w3-contract.md`**

Add a short "What this session actually delivered" section noting the two findings resolved
beyond the stated five (the liveness-router collision, and `ensure_full_template` closing
the migration-only seed's hole), so W4's session does not rediscover either.

- [ ] **Step 5: Tick `docs/plan/state.yaml`**

Set W3's `status: active`, add `opened: 2026-08-26`, and add one piece:

```yaml
    pieces:
      - id: W3.0
        title: Contract commit — revision 0007, the lane gates and the lane fixtures
        status: shipped
        on: 2026-08-26
```

Nothing measurable: no test results, no branch, no environment health.

- [ ] **Step 6: Verify and commit**

Run: `.venv/bin/python -c "import yaml,pathlib; yaml.safe_load(pathlib.Path('docs/plan/state.yaml').read_text())"`
Expected: no output.

Run: `.venv/bin/pytest tests/cockpit -q`
Expected: PASS — the cockpit reads that file.

```bash
git add docs/plan
git commit -m "docs(w3): D11 supersedes the health lane's blocker, and health.py is core's

The lane's 'Blocked on you' note still sent it to wait for a PDF at docs/forms/. D11
closed that on 2026-08-24 and revision 0007 acted on it; left as written the note stalls
the lane on a closed question.

Second correction: the Owns block listed app/routers/health.py, which is core's liveness
probe. SPEC §7 puts M4's routes at /health-templates and /students/{id}/health-declaration."
```

---

### Task 6: Regenerate the API client, run the exit gate, push, and create the worktrees

**Files:**
- Modify (if the generator produces a diff): `openapi.json`,
  `web/packages/api-client/src/schema.d.ts`
- Modify: `web/package.json` — add the `generate:api-client` script

**Interfaces:** none.

**Note:** there is no `npm run generate:api-client` script in this repo; the command
`scripts/ci-local.sh` and `.github/workflows/ci.yml` actually run is the two-liner below.
Three docs name the script that does not exist, so this task adds it rather than leaving
the documented command a fiction. `0007` adds no route, so the expected outcome is **no
diff** — which is the assertion, not a disappointment.

- [ ] **Step 1: Add the script the docs already name**

In `web/package.json`'s `scripts`:

```json
    "generate:api-client": "cd .. && .venv/bin/python scripts/export_openapi.py && cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts",
```

- [ ] **Step 2: Run it and confirm the generated output is committed**

```bash
npm --prefix web run generate:api-client
git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts
```

Expected: exit 0, no diff. If there *is* a diff, commit it — a diff in generated output
that is not committed fails CI (§8.2).

- [ ] **Step 3: Run the full exit gate**

```bash
./scripts/dev-db.sh reset                 # a genuinely fresh database
.venv/bin/alembic upgrade head            # gate 1a
.venv/bin/pytest -q                       # gate 2 — invariants and restrictions included
./scripts/lane-check.sh attendance --dry-run   # gate 4
./scripts/lane-check.sh health --dry-run
```

and gate 1b, on W2's database — a database already at `0006`, not a fresh one:

```bash
git stash && git checkout 344022f -- . 2>/dev/null || true   # only if a 0006 db is not to hand
# simplest reliable form: reset, upgrade to 0006, then upgrade to head
./scripts/dev-db.sh reset
.venv/bin/alembic upgrade 0006
.venv/bin/alembic upgrade head
.venv/bin/alembic current                 # expect 0007 (head)
```

All four must hold. Do not create a worktree until they do.

- [ ] **Step 4: Commit and push**

```bash
git add web/package.json openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "chore(w3): make \`npm run generate:api-client\` a real script

CLAUDE.md, the milestone plan and the W3 contract all name it; it did not exist. The
command CI runs is the two-liner it now wraps. 0007 adds no route, so the generated output
is unchanged — which is the assertion, not a disappointment."
git push origin main
```

- [ ] **Step 5: Create the two worktrees**

```bash
git worktree add ../studio-manager-attendance -b lane/attendance main
git worktree add ../studio-manager-health     -b lane/health     main
```

- [ ] **Step 6: Hand over the per-worktree setup**

Report to the owner, in full: the two databases each lane needs and how to create them, the
env file each worktree needs (this repo reads `.env`, not `.env.local` —
`app/core/config.py:12` is `SettingsConfigDict(env_file=".env")`, and there is no
`.worktreeinclude` in this repo, so `git worktree add` copies **no** untracked file at all),
the `.venv` and `node_modules` each worktree builds for itself, and the merge order
(ATTENDANCE first — it owns `web/packages/core/**`, the wider blast radius).

---

## Self-review

**Spec coverage.** The prompt's five deliverables map to Tasks 1+2 (revision `0007` with
both promotions and the D11 seed), Task 3 (`lane-check.sh`), Task 4 (the two conftests),
Task 5 (the milestone-plan D11 note), Task 6 (the API client). The exit gate's four
conditions are Task 6 Step 3. The two worktrees are Task 6 Step 5, after the push. The
per-worktree handover is Task 6 Step 6.

**Two additions, both flagged where they land:** `ensure_full_template` (Task 2) and the
`app/routers/health.py` collision (Tasks 3 and 5). Neither widens the schema; both close a
hole a lane would otherwise hit on day one and be unable to fix from inside a worktree.

**Type consistency.** `FULL_TEMPLATE_SCHEMA` / `FULL_FLAG_QUESTIONS` / `ensure_full_template`
are spelled identically in Task 2's test, its implementation, its call sites and Task 4's
`a_full_template` fixture. `core_dirs` is spelled identically in Task 3's default, its
`attendance` override and all three consumers. `ATTENDANCE_STATUSES` and
`ATTENDANCE_SOURCES` are the names `tests/contracts/test_w3_models.py` already imports.

**Known intermediate red:** Task 1 Step 4 leaves `test_the_migrations_match_the_models`
failing between the model promotion and the revision. It is closed inside the same task and
before the same commit; no commit in this plan lands a knowingly-red gate.
