"""Signed-in callers and a studio with one group, for the schedule lane.

Every fixture signs in for real rather than forging a token, for the reason
`tests/structure/conftest.py` gives: §3.2's matrix is enforced by a dependency reading
`request.state.roles`, which `app/core/auth_context.py` fills from a VERIFIED claim. A
hand-made token would test the dependency against an input the product cannot produce.

The two sign-ins per caller are not a workaround. The first creates the `auth_identity`
(nothing else can), the rows are attached to it, and the second picks up a token whose
`sid` and `roles` claims reflect them.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from app.models.identity import AuthIdentity
from app.models.person import Person, RoleAssignment
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group, Location
from app.models.studio import Studio
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: A Tuesday lunchtime, well inside the 2026/27 training year. Every test that needs "now"
#: sends it as X-Dev-Now so the clock is the same on the server and in the assertion.
T0 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
YEAR_STARTS = date(2026, 9, 1)
YEAR_ENDS = date(2027, 6, 30)


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
    row = Studio(name="מועדון לוח זמנים", slug=f"sch-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _make_caller(client, fake_provider, app_session, studio, *, role: str | None) -> Caller:
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
    app_session.commit()

    signed = sign_in(client, code=code, app_name="staff")
    return Caller(token=signed.json()["access_token"], studio_id=studio.id, person_id=person.id)


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
def a_location(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Location(studio_id=studio.id, name="אולם א׳")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio) -> uuid.UUID:
    klass = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים")
    app_session.add(group)
    app_session.commit()
    return group.id


@pytest.fixture
def an_active_year(app_session: Session, studio: Studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ז",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row.id
