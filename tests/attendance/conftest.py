"""Signed-in callers, a session, and a student enrolled in the group it belongs to.

Every fixture signs in for real rather than forging a token, for the reason
tests/structure/conftest.py states and tests/schedule/conftest.py repeats: §3.2's matrix is
enforced by a dependency reading `request.state.roles`, which app/core/auth_context.py fills
from a VERIFIED claim. A hand-made token would test the dependency against an input the
product cannot produce.

The two sign-ins per caller are not a workaround. The first creates the `auth_identity`
(nothing else can), the rows are attached to it, and the second picks up a token whose `sid`
and `roles` claims reflect them.

**Every caller carries X-Dev-Now.** §10.5 resolves a two-coach conflict on
`device_marked_at`, so this lane compares a device clock against a server clock in almost
every test it will write. §19's dev clock is the only way to make those the same value on
both sides of an assertion; a test that lets the server use wall-clock time is a test that
passes at 17:04 and fails at 17:05.

`a_session` inserts the row directly rather than calling `ScheduleService.materialize_sessions`.
Materialization is lane SCHEDULE's behaviour and it has its own tests; what this lane needs
is a session id it can predict.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.identity import AuthIdentity
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group, GroupStaff
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: A Tuesday lunchtime, well inside the 2026/27 training year -- the same clock
#: tests/schedule/conftest.py pins, so a session created here and a rule written there mean
#: the same day.
T0 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
TODAY = date(2026, 11, 3)
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
    row = Studio(name="מועדון נוכחות", slug=f"att-{uuid.uuid4().hex[:8]}")
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
        # nothing more. Tests that need a real child use `as_guardian_of`-style wiring of
        # their own; §10.2's pre-report is the only parent write in this lane.
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
def a_training_year(app_session: Session, studio: Studio) -> uuid.UUID:
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


def make_session(
    *,
    studio_id: uuid.UUID,
    group_id: uuid.UUID,
    training_year_id: uuid.UUID,
    starts_at: datetime,
    status: str = "scheduled",
) -> SessionRow:
    """A detached session row. Exposed as a helper as well as a fixture because §10.5's
    conflict cases need two and three of them at chosen times."""
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
def a_session(
    app_session: Session, studio: Studio, a_group: uuid.UUID, a_training_year: uuid.UUID
) -> uuid.UUID:
    """One scheduled session at T0, in the group `an_enrolled_student` is enrolled in."""
    row = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def an_enrolled_student(app_session: Session, studio: Studio, a_group: uuid.UUID) -> uuid.UUID:
    """A student on the roster of `a_group`, and therefore of `a_session`.

    `health_status='missing'` is the model default and it is left there deliberately: it is
    what a roster badge renders in the common case (§5.5), and M4 populates the other two.
    `attends_weekdays=None` is C12's "every session of this group", the default and the
    common case.
    """
    person = Person(
        studio_id=studio.id,
        first_name="ילד",
        last_name="בודק",
    )
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=person.id,
        status="active",
        joined_on=YEAR_STARTS,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=a_group,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return student.id


@pytest.fixture
def assign_coach(app_session: Session, studio: Studio):
    """§3.2 -- 'View students in own groups'. A coach reaches a roster through this row."""

    def _assign(person_id: uuid.UUID, group_id: uuid.UUID, role: str = "lead_coach") -> None:
        app_session.add(
            GroupStaff(
                studio_id=studio.id,
                group_id=group_id,
                person_id=person_id,
                role=role,
                from_date=YEAR_STARTS,
            )
        )
        app_session.commit()

    return _assign


@pytest.fixture
def other_studio_session_id(app_session: Session) -> uuid.UUID:
    """A session in a studio the caller has nothing to do with. The tenant filter should
    make it invisible rather than merely forbidden -- 404, never 403."""
    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    klass = Class(studio_id=other.id, name="קראטה")
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=other.id, class_id=klass.id, name="ילדים")
    app_session.add(group)
    year = TrainingYear(
        studio_id=other.id,
        name="תשפ״ז",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(year)
    app_session.flush()
    row = make_session(
        studio_id=other.id,
        group_id=group.id,
        training_year_id=year.id,
        starts_at=T0,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Services in this lane are written against `TenantSession`: it filters every query by the
    active studio and fails closed when there is none. `app_session` is a plain, unscoped
    `Session` -- fine for arranging fixture rows, wrong for exercising a service, because a
    list assertion made through it sees every studio's rows including those committed by
    earlier tests and by the other lane sharing this database.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s
