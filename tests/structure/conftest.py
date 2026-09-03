"""Signed-in callers at each of 3.2's permission levels.

Every fixture here signs in for real rather than forging a token. 3.2's matrix is
enforced by a router dependency reading `request.state.roles`, which
app/core/auth_context.py fills from a VERIFIED claim -- so a hand-made token would test
the dependency against an input the product cannot produce, and a mistake in how the
claim is populated would stay invisible.

The two sign-ins per fixture are not a workaround. The first creates the auth_identity
(nothing else can), the rows are attached to it, and the second picks up a token whose
`sid` and `roles` claims reflect them -- which is exactly the sequence a real invitation
acceptance walks.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.models.structure import Class, Group
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


@dataclass
class Caller:
    """A signed-in person, plus the ids a test needs to build on."""

    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        # X-Dev-Now pins every request this caller makes to T0 (§19) -- without it, a
        # test asserting an invitation with `expires_at=T0 + timedelta(days=7)` is still
        # current drifts stale the moment real time passes T0 + 7 days, the same class of
        # bug tests/attendance/conftest.py's own Caller.headers already guards against.
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון מבנה", slug=f"st-{uuid.uuid4().hex[:8]}")
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

    # ONE sign-in, then the rotation the user's own app makes. This used to sign in a
    # SECOND time: the first session was minted before the Person existed, so it carried
    # no active studio and every tenant-scoped route answered 401. That is the very defect
    # §5.4b's join link hit in production (2026-08-31) -- encoded here as a workaround no
    # real user can perform, which is why it never reported the bug it was standing on.
    # `refresh` activates a sole membership now, so the fixture walks the same path a
    # parent walks.
    rotated = client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200, rotated.text
    return Caller(token=rotated.json()["access_token"], studio_id=studio.id, person_id=person.id)


@pytest.fixture
def as_manager(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="manager")


@pytest.fixture
def as_owner(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="owner")


@pytest.fixture
def as_lead_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="lead_coach")


@pytest.fixture
def as_guardian(client, fake_provider, app_session, studio) -> Caller:
    """3.1 -- a guardian holds no role_assignment at all. 3.2's matrix gives them nothing
    in this vertical, and 6.1 refuses them the staff app entirely."""
    return _make_caller(client, fake_provider, app_session, studio, role=None, is_guardian=True)


@pytest.fixture
def a_class(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    row = Group(studio_id=studio.id, class_id=a_class, name="מתחילים")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_coach_person(app_session: Session, studio: Studio) -> uuid.UUID:
    """A Person with no login -- 3.3: 'A person does not need a login.' A manager assigns
    a coach who has not accepted an invitation yet, and that must work."""
    row = Person(studio_id=studio.id, first_name="רון", last_name="מאמן")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def other_studio_class_id(app_session: Session) -> uuid.UUID:
    """A class in a studio the caller has nothing to do with. The tenant filter should
    make it invisible rather than merely forbidden."""
    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    row = Class(studio_id=other.id, name="קראטה")
    app_session.add(row)
    app_session.commit()
    return row.id
