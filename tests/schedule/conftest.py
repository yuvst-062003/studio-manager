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
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.billing import PricePlan
from app.models.identity import AuthIdentity
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group, Location
from app.models.studio import Studio
from app.models.training_plan import GroupEligibility
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


def _make_caller(
    client,
    fake_provider,
    app_session,
    studio,
    *,
    role: str | None,
    guardian_of: uuid.UUID | None = None,
    is_primary: bool = False,
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
    if guardian_of is not None:
        # §3.1 -- "guardian is not a role". A parent holds no RoleAssignment at all; what
        # makes them a parent is a `guardian` row pointing at a child.
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=guardian_of,
                person_id=person.id,
                is_primary=is_primary,
                relation="parent",
            )
        )
    app_session.commit()

    signed = sign_in(client, code=code, app_name="staff")
    return Caller(token=signed.json()["access_token"], studio_id=studio.id, person_id=person.id)


@pytest.fixture
def as_guardian_of(client, fake_provider, app_session, studio):
    """A parent bound to an actual child, not to a placeholder id.

    Takes the student id rather than creating one, the same way tests/billing/conftest.py's
    does and for the same reason: a family with two children is one guardian over two
    students, which a fixture that made its own child could not express.
    """

    def _make(student_id: uuid.UUID, *, is_primary: bool = False) -> Caller:
        return _make_caller(
            client,
            fake_provider,
            app_session,
            studio,
            role=None,
            guardian_of=student_id,
            is_primary=is_primary,
        )

    return _make


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
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Same reasoning as tests/billing/conftest.py's: `app_session` is unscoped and fine for
    arranging fixture rows, and wrong for exercising a service — a list assertion made
    through it sees every studio's rows, including those committed by earlier tests.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


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


# -- training plans (2026-08-27 spec wave) -------------------------------------
# Shared by tests/schedule/test_booking.py and test_plan_changes.py. In the conftest
# rather than imported between test modules: a fixture imported across files is a fixture
# pytest registers twice, and the redefinition warnings are the least of it.
@pytest.fixture
def plans(app_session, studio):
    """The club's three, by their allowance: 0, 1 and unlimited."""
    rows = {}
    for name, amount, allowance in (
        ("300", 30_000, 0),
        ("400", 40_000, 1),
        ("550", 55_000, None),
    ):
        plan = PricePlan(
            studio_id=studio.id,
            name=name,
            sessions_per_week=None,
            monthly_amount_agorot=amount,
            registration_fee_agorot=None,
            active_from=YEAR_STARTS,
            weekly_extra_allowance=allowance,
        )
        app_session.add(plan)
        rows[name] = plan
    app_session.commit()
    return {name: plan.id for name, plan in rows.items()}


@pytest.fixture
def timetable(app_session, studio):
    """Two base groups and the three kinds of thing beyond them."""
    klass = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(klass)
    app_session.flush()
    made = {}
    for name, kind, invite, age_min in (
        ("קבוצה 2", "base", False, None),
        ("קבוצה 3", "base", False, None),
        ("ג'ודו ראשון", "extra", False, None),
        ("קרוספיט שני", "extra", False, None),
        ("קבוצת בנות", "extra", True, None),
        ("טכניקה פרטנית", "private", False, 12),
    ):
        group = Group(
            studio_id=studio.id,
            class_id=klass.id,
            name=name,
            kind=kind,
            is_invite_only=invite,
            age_min=age_min,
        )
        app_session.add(group)
        made[name] = group
    app_session.flush()
    # Sunday Judo is for Group 2 and Group 3; CrossFit is for Group 3 only.
    app_session.add_all(
        [
            GroupEligibility(
                studio_id=studio.id,
                extra_group_id=made["ג'ודו ראשון"].id,
                base_group_id=made["קבוצה 2"].id,
            ),
            GroupEligibility(
                studio_id=studio.id,
                extra_group_id=made["ג'ודו ראשון"].id,
                base_group_id=made["קבוצה 3"].id,
            ),
            GroupEligibility(
                studio_id=studio.id,
                extra_group_id=made["קרוספיט שני"].id,
                base_group_id=made["קבוצה 3"].id,
            ),
        ]
    )
    app_session.commit()
    return {name: group.id for name, group in made.items()}


#: Age 8 in the 2026/27 season — inside Group 2's 7-9 bracket and well under the Saturday
#: lesson's floor of 12, which is what makes §5's "a Group 2 boy is offered 300 and 400"
#: case testable at all.
DEFAULT_BIRTHDATE = date(2018, 5, 1)


def make_student(app_session, studio, *, plan_id, base_group_id, birthdate=DEFAULT_BIRTHDATE):
    from app.models.person import Person

    person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן", birthdate=birthdate)
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=person.id,
        status="active",
        health_status="signed",
        joined_on=YEAR_STARTS,
        price_plan_id=plan_id,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=base_group_id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return student.id


def make_session(app_session, studio, year_id, group_id, starts_at: datetime) -> uuid.UUID:
    row = SessionRow(
        studio_id=studio.id,
        group_id=group_id,
        training_year_id=year_id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        status="scheduled",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


#: A Sunday and a Monday inside the training year, well after any fixture's start.
SUNDAY = datetime(2026, 11, 15, 14, 0, tzinfo=UTC)
MONDAY = datetime(2026, 11, 16, 14, 0, tzinfo=UTC)
NEXT_SUNDAY = datetime(2026, 11, 22, 14, 0, tzinfo=UTC)
NOW = datetime(2026, 11, 10, 9, 0, tzinfo=UTC)
