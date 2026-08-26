"""Signed-in callers, a family with a phone number, a session, and a registered device.

Same caller machinery as tests/billing/conftest.py, tests/health/conftest.py and
tests/events/conftest.py, and for the same reason: §3.2's matrix is enforced by a dependency
reading a VERIFIED claim, so every fixture signs in for real. See tests/billing/conftest.py
for the full argument.

**The clock is the same instant billing and events pin**, and here that is not a courtesy.
Holdback HB-w5-lane-fixtures wrote down exactly why: "M8's notification and M9's at-risk job
are a caller/callee pair across exactly that seam", and two conftests disagreeing about what
month it is makes two lanes' tests disagree about one flow.

**Every guardian fixture carries a phone number.** §5.11's delivery report is a list of
families the message did not reach *and the number to call them on* -- "המנהל מדביק את
המספרים לקבוצת הוואטסאפ שכבר קיימת". §5.11 permits no email and no SMS fallback, so a
guardian with a null phone is a family the product cannot reach at all. A fixture without one
would let every delivery-report test pass while asserting nothing about the only column that
makes the screen useful.

**This lane never computes at risk.** Plan W5 makes lane REPORTS the caller: its at-risk and
retention jobs go through `NotificationService.enqueue`. So there is no attendance fixture
here, and the at-risk tests in this directory arrange a *notification*, never three absences.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.comms import PushToken
from app.models.identity import AuthIdentity
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.models.schedule import SessionStaff, TrainingYear
from app.models.structure import Class, Group, GroupStaff, Location
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: The same instant tests/billing/conftest.py and tests/events/conftest.py pin. See this
#: module's docstring, and HB-w5-lane-fixtures.
T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
TODAY = date(2026, 11, 12)
YEAR_STARTS = date(2026, 9, 1)
YEAR_ENDS = date(2027, 7, 31)


class Caller:
    """A signed-in identity, and the headers that prove it."""

    def __init__(self, token: str, studio_id: uuid.UUID, person_id: uuid.UUID) -> None:
        self.token = token
        self.studio_id = studio_id
        self.person_id = person_id

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


def _phone(seed: str) -> str:
    """A distinct Israeli mobile per fixture. Distinct because §5.11's report is a list the
    office reads top to bottom, and two families sharing a number would make a duplicate
    invisible."""
    return f"054-{abs(hash(seed)) % 10_000_000:07d}"


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון הודעות", slug=f"comms-{uuid.uuid4().hex[:8]}")
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
        phone=_phone(subject),
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
    """A signed-in parent bound to an actual child.

    §6.1's parent-app question is `EXISTS(guardian WHERE person_id = :me)`, and this lane's
    inbox, preferences and calendar feed all resolve through it -- so a guardian row pointing
    at a random UUID cannot exercise any of them.

    Lands as the PRIMARY guardian, which is what `a_guardian_for` below deliberately does
    not: `uq_guardian_one_primary_per_student` allows exactly one, and §5.3 says all
    guardians are equal anyway ("every guardian is told, not only the primary").
    """

    def _make(student_id: uuid.UUID) -> Caller:
        return _make_caller(
            client, fake_provider, app_session, studio, role=None, guardian_of=student_id
        )

    return _make


@pytest.fixture
def a_guardian_for(app_session: Session, studio: Studio):
    """A guardian who has never signed in, with a phone number.

    The fan-out fixture. §5.11's audience is guardians, not logins: a parent who was added by
    the office and never opened the app still receives the announcement in their inbox and
    still appears on the delivery report -- as `no_token`, which is precisely the row §6.5
    says the office needs to phone.

    `is_primary` defaults to False so this composes with `as_guardian_of` on one child; a
    single-guardian family in a test that never asks about billing needs no primary at all.
    """

    def _make(student_id: uuid.UUID, *, name: str = "הורה", is_primary: bool = False) -> uuid.UUID:
        seed = uuid.uuid4().hex
        person = Person(
            studio_id=studio.id,
            first_name=name,
            last_name="בודק",
            phone=_phone(seed),
        )
        app_session.add(person)
        app_session.flush()
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=student_id,
                person_id=person.id,
                is_primary=is_primary,
                relation="parent",
            )
        )
        app_session.commit()
        return person.id

    return _make


@pytest.fixture
def a_location(app_session: Session, studio: Studio) -> uuid.UUID:
    """§5.12's `LOCATION` property. A VEVENT without one sends a parent to the club's main
    hall for a lesson held at the school down the road."""
    row = Location(studio_id=studio.id, name="אולם ראשי", address="הרצל 1, תל אביב")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_class(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    """§5.11's narrowest announcement scope, and the join every audience query walks."""
    row = Group(studio_id=studio.id, class_id=a_class, name="מתחילים", age_min=5, age_max=8)
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_student(app_session: Session, studio: Studio) -> uuid.UUID:
    row_person = Person(studio_id=studio.id, first_name="דנה", last_name="בודקת")
    app_session.add(row_person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=row_person.id,
        status="active",
        joined_on=YEAR_STARTS,
    )
    app_session.add(student)
    app_session.commit()
    return student.id


@pytest.fixture
def an_enrolled_student(
    app_session: Session, studio: Studio, a_group: uuid.UUID, a_student: uuid.UUID
) -> uuid.UUID:
    """An ACTIVE enrolment.

    Announcement audience resolution and the guardian's ICS feed both walk
    `enrollment.status = 'active'`. `pending` is the default and means the manager has not
    decided yet (§5.4), so a fixture that left it there would make every audience empty and
    every fan-out test pass for the wrong reason.
    """
    row = Enrollment(
        studio_id=studio.id,
        student_id=a_student,
        group_id=a_group,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return a_student


@pytest.fixture
def a_training_year(app_session: Session, studio: Studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="2026/27",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_session(
    app_session: Session,
    studio: Studio,
    a_group: uuid.UUID,
    a_training_year: uuid.UUID,
    a_location: uuid.UUID,
) -> uuid.UUID:
    """One scheduled session two days out -- inside the feed window, and after `T0`.

    §5.12's VEVENT is built from this row, and its `UID` is derived from this id, so a
    fixture that regenerated the session per test would make "the UID is stable" untestable.
    """
    row = SessionRow(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(days=2),
        ends_at=T0 + timedelta(days=2, hours=1),
        location_id=a_location,
        status="scheduled",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_coached_group(app_session: Session, studio: Studio, a_group: uuid.UUID):
    """Binds a person to `a_group` as its coach.

    Two of this lane's rules resolve through `group_staff` and neither is testable without
    it: §3.2 lets a lead coach publish to their OWN groups and nowhere else, and §5.12's
    coach feed is "all sessions they staff".
    """

    def _bind(person_id: uuid.UUID, role: str = "lead_coach") -> uuid.UUID:
        app_session.add(
            GroupStaff(
                studio_id=studio.id,
                group_id=a_group,
                person_id=person_id,
                role=role,
                from_date=YEAR_STARTS,
            )
        )
        app_session.commit()
        return a_group

    return _bind


@pytest.fixture
def a_staffed_session(app_session: Session, studio: Studio, a_session: uuid.UUID):
    """Puts a person on one session's staff.

    Distinct from `a_coached_group` on purpose: §5.12's coach feed is per SESSION, so a
    substitute who covers one lesson appears in it without being on the group at all. That is
    the case a group-level feed would silently drop.
    """

    def _staff(
        person_id: uuid.UUID, *, role: str = "lead_coach", is_substitute: bool = False
    ) -> uuid.UUID:
        app_session.add(
            SessionStaff(
                studio_id=studio.id,
                session_id=a_session,
                person_id=person_id,
                role=role,
                is_substitute=is_substitute,
            )
        )
        app_session.commit()
        return a_session

    return _staff


@pytest.fixture
def a_push_token(app_session: Session, studio: Studio):
    """A registered device.

    Without one, every push in this lane records `no_token` -- which is a real and important
    state (§6.5: on iOS it usually means the app was never added to the home screen) but it
    is not the happy path, and a lane whose fixtures only produced it could not tell a
    working fan-out from a broken one.
    """

    def _register(
        person_id: uuid.UUID, *, app: str = "parent", platform: str = "android"
    ) -> PushToken:
        row = PushToken(
            studio_id=studio.id,
            person_id=person_id,
            app=app,
            platform=platform,
            token=f"tok-{uuid.uuid4().hex}",
            last_seen_at=T0,
        )
        app_session.add(row)
        app_session.commit()
        return row

    return _register


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs. Arrange with
    `app_session`, act and assert through this -- see tests/billing/conftest.py."""
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s
