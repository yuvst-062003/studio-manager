"""Signed-in callers on both sides of §3.2's health boundary, a child, and both templates.

Every fixture signs in for real rather than forging a token, for the reason
tests/structure/conftest.py states: §3.2's matrix is enforced by a dependency reading
`request.state.roles`, which app/core/auth_context.py fills from a VERIFIED claim. A
hand-made token would test the dependency against an input the product cannot produce.

**Both sides of the boundary are here on purpose.** §3.2 gives "Read full health
declaration" to manager and owner and to nobody else, and §5.5 gives a coach `derived_flags`
and nothing else. A lane that only has an allowed caller can prove the happy path and
nothing about the rule; `as_owner` and `as_manager` are the allowed side, `as_lead_coach`
and `as_assistant_coach` the refused one, and `as_guardian_of` is the parent the §5.5 gate
actually blocks.

`encryption_keys` is autouse because `answers_encrypted` and `signature_image_encrypted` are
`EncryptedJSON`/`EncryptedBytes` (§11.1) and `Keyring.from_settings()` refuses outright when
`ENCRYPTION_KEYS` is empty -- which it is locally and on CI, since neither has a settings
file and .github/workflows/ci.yml sets only the two database URLs. Without it the lane's
first write fails for a reason with nothing to do with the code under test.

**G7 applies to this file too.** Nothing here decrypts anything, and no fixture puts a
declaration's contents anywhere a log or an audit `diff` could pick them up.
"""

from __future__ import annotations

import base64
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.audit import AuditLog
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio
from app.services.structure.health_templates import (
    ensure_full_template,
    ensure_trial_template,
)
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

T0 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
TODAY = date(2026, 11, 3)


@dataclass
class Caller:
    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון בריאות", slug=f"hlt-{uuid.uuid4().hex[:8]}")
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
    guardian_of: uuid.UUID | None = None,
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
    if guardian_of is not None:
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=guardian_of,
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
def as_guardian_of(client, fake_provider, app_session, studio):
    """A parent bound to an actual child, not to a placeholder id.

    §5.5's gate is a hard block in the PARENT app, and it resolves through `guardian` --
    "which children does this identity answer for". A guardian row pointing at a random
    UUID satisfies §6.1's EXISTS query and nothing else, so it cannot exercise the gate at
    all. Takes the student id rather than creating one, because a test that needs two
    children needs one parent over both.
    """

    def _make(student_id: uuid.UUID) -> Caller:
        return _make_caller(
            client, fake_provider, app_session, studio, role=None, guardian_of=student_id
        )

    return _make


@pytest.fixture
def a_student(app_session: Session, studio: Studio) -> uuid.UUID:
    """`health_status='missing'` is the model default and is left there deliberately: it is
    the state §5.5's ⚠ badge renders, and moving a student off it is this lane's job."""
    person = Person(studio_id=studio.id, first_name="ילדה", last_name="בודקת")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=person.id,
        status="active",
        joined_on=date(2026, 9, 1),
    )
    app_session.add(student)
    app_session.commit()
    return student.id


@pytest.fixture
def a_full_template(app_session: Session, studio: Studio) -> uuid.UUID:
    """D11's bundled question set for this studio.

    Idempotent, so it returns revision 0007's row where one exists and creates it where the
    studio postdates the migration -- which is exactly the guarantee
    `ensure_full_template` exists to make, exercised rather than assumed.

    **The commit is load-bearing**, and it is why this reads differently from the handed-over
    draft. `ensure_full_template` flushes and does not commit, so without it the row exists only
    inside `app_session`'s open transaction -- invisible to the request-scoped session a route
    opens on its own connection, and every route test in this lane 404s on a template that is
    plainly there. `a_student` above already commits for the same reason.
    """
    template_id = ensure_full_template(app_session, studio.id, at=T0).id
    app_session.commit()
    return template_id


@pytest.fixture
def a_trial_template(app_session: Session, studio: Studio) -> uuid.UUID:
    """Conflict C3's row. **This lane does not own it** -- M1 seeded it so M3's trial
    bookings had something to write against, and M3 writes declarations against it. It is
    here so this lane can assert it left the trial form alone.

    Committed for the same reason `a_full_template` is: a flushed-only row is invisible to the
    session a route opens."""
    template_id = ensure_trial_template(app_session, studio.id, at=T0).id
    app_session.commit()
    return template_id


@pytest.fixture
def audit_entries(app_session: Session):
    """§11.2 -- 'every read is audit-logged'. Reads the log back by entity, newest first.

    A fixture rather than a helper each test copies: this lane asserts the property on every
    manager read path, and eight copies is eight chances for one of them to query the wrong
    `entity_type` and pass by looking empty.

    Returns the rows. G7: an audit `diff` on a health entity never carries declaration
    contents, and nothing here decrypts anything.
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


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Services in this lane are written against `TenantSession`: it filters every query by the
    active studio and fails closed when there is none. `app_session` is a plain, unscoped
    `Session` -- fine for arranging fixture rows, wrong for exercising a service, because a
    list assertion made through it sees every studio's rows including those committed by the
    other lane sharing this database.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


@pytest.fixture(autouse=True)
def encryption_keys(monkeypatch) -> None:
    """A keyring, for the two columns in this lane that are encrypted at rest.

    `Keyring.from_settings()` refuses outright when `ENCRYPTION_KEYS` is empty, and it IS
    empty here and on CI -- neither has a local settings file, and .github/workflows/ci.yml
    sets only the two database URLs. tests/core/test_encryption.py builds its own Keyring in
    process and never goes through settings, which is why the gap stays invisible until a
    lane writes an encrypted column against the database.

    Set through monkeypatch rather than by writing a settings file, for the reason the repo
    already applies elsewhere: a test that depends on one developer's local environment
    passes on their machine and fails on the runner.

    Thirty-two zero bytes, base64'd -- exactly what the checked-in example ships. It is a
    test key and models nothing about production, where §11.1 puts these in Railway secrets.
    """
    from app.core import encryption

    monkeypatch.setattr(
        encryption.settings,
        "ENCRYPTION_KEYS",
        {1: SecretStr(base64.b64encode(b"\x00" * 32).decode())},
    )
    monkeypatch.setattr(encryption.settings, "ENCRYPTION_ACTIVE_KEY_VERSION", 1)
