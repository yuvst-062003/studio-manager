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
