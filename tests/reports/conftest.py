"""Signed-in callers, 12 students with mixed billing states, and two billing cycles.

Same caller machinery as tests/billing/conftest.py, tests/comms/conftest.py.

**The clock is the same instant billing and comms pin** (T0 = 2026-11-12 09:00 UTC).
M9's at-risk job (REPORTS) and M8's notifications (COMMS) are a caller/callee pair across
exactly that seam, and two conftests disagreeing about what month it is makes two lanes'
tests disagree about one flow.

**Studio fixture has 12 students** with mixed billing states:
- 4 students with paid charges (Oct 2026 settled)
- 4 students with overdue charges (Oct open, now 12 days past due)
- 4 students with pending charges (Nov in progress, not yet due)

**One billing cycle complete (Oct 2026), one in progress (Nov 2026).**
Reports should render October's data when queried on Nov 12.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.attendance import Attendance
from app.models.belts import BeltRank
from app.models.billing import Charge, PricePlan
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: Same instant tests/billing/conftest.py and tests/comms/conftest.py pin. See those
#: modules' docstrings, and HB-w5-lane-fixtures.
T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
TODAY = date(2026, 11, 12)
YEAR_STARTS = date(2026, 9, 1)

#: October (complete) and November (in progress) billing periods.
OCTOBER_PERIOD = (2026, 10)
NOVEMBER_PERIOD = (2026, 11)

#: ₪250.00 monthly, ₪100.00 registration. Written as agorot.
MONTHLY_AGOROT = 25_000
REGISTRATION_AGOROT = 10_000


@dataclass
class Caller:
    """A signed-in identity, and the headers that prove it."""

    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


@dataclass
class PricedStudent:
    """A child, and the two person ids a charge needs to be about them.

    `person_id` is the CHILD's person row; `payer_person_id` is the primary guardian's.
    """

    student_id: uuid.UUID
    person_id: uuid.UUID
    payer_person_id: uuid.UUID


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון דוחות", slug=f"rep-{uuid.uuid4().hex[:8]}")
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
def as_owner(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="owner")


@pytest.fixture
def as_manager(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="manager")


@pytest.fixture
def a_price_plan(app_session: Session, studio: Studio) -> uuid.UUID:
    """The price plan: ₪250/month, ₪100 registration."""
    row = PricePlan(
        studio_id=studio.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=MONTHLY_AGOROT,
        registration_fee_agorot=REGISTRATION_AGOROT,
        active_from=YEAR_STARTS,
        active_to=None,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def _make_priced_student(
    app_session: Session, studio: Studio, price_plan_id: uuid.UUID
) -> PricedStudent:
    """Create a student with a price plan and a primary guardian."""
    child = Person(studio_id=studio.id, first_name="ילד", last_name="בודק")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="בודק")
    app_session.add_all([child, payer])
    app_session.flush()

    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=price_plan_id,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student.id,
            person_id=payer.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    return PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)


@pytest.fixture
def twelve_students_mixed_billing(
    app_session: Session, studio: Studio, a_price_plan: uuid.UUID
) -> tuple[PricedStudent, ...]:
    """12 students with charges in different periods for billing report testing.

    - 4 with October charges (last month — available for report when queried Nov 12)
    - 4 with October charges past due (12 days overdue as of Nov 12)
    - 4 with November charges (current month, in progress)

    All charges are marked 'open' to keep fixtures simple; the report cares about
    the period and date context, not payment status.

    Returns tuple of 12 PricedStudent objects, one per student.
    """
    students = []

    # Create 4 students with October charges (closed period)
    for _i in range(4):
        student = _make_priced_student(app_session, studio, a_price_plan)
        students.append(student)

        charge = Charge(
            studio_id=studio.id,
            payer_person_id=student.payer_person_id,
            student_id=student.student_id,
            kind="tuition",
            period_year=OCTOBER_PERIOD[0],
            period_month=OCTOBER_PERIOD[1],
            amount_agorot=MONTHLY_AGOROT,
            due_date=date(2026, 10, 31),
            status="open",
            created_by="billing_run",
        )
        app_session.add(charge)
    app_session.commit()

    # Create 4 students with October charges (overdue by 12 days as of Nov 12)
    for _i in range(4):
        student = _make_priced_student(app_session, studio, a_price_plan)
        students.append(student)

        charge = Charge(
            studio_id=studio.id,
            payer_person_id=student.payer_person_id,
            student_id=student.student_id,
            kind="tuition",
            period_year=OCTOBER_PERIOD[0],
            period_month=OCTOBER_PERIOD[1],
            amount_agorot=MONTHLY_AGOROT,
            due_date=date(2026, 10, 31),
            status="open",
            created_by="billing_run",
        )
        app_session.add(charge)
    app_session.commit()

    # Create 4 students with November charges (in-progress period)
    for _i in range(4):
        student = _make_priced_student(app_session, studio, a_price_plan)
        students.append(student)

        charge = Charge(
            studio_id=studio.id,
            payer_person_id=student.payer_person_id,
            student_id=student.student_id,
            kind="tuition",
            period_year=NOVEMBER_PERIOD[0],
            period_month=NOVEMBER_PERIOD[1],
            amount_agorot=MONTHLY_AGOROT,
            due_date=date(2026, 11, 30),
            status="open",
            created_by="billing_run",
        )
        app_session.add(charge)
    app_session.commit()

    return tuple(students)


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


# ── artboard `4g`'s fixtures ─────────────────────────────────────────────────────────
# The four money cards above answer a billing question. `4g` asks four different ones —
# members, churn, revenue and attendance — plus retention and belt promotions, and none
# of them can be arranged out of charges alone.


@pytest.fixture
def a_training_year(app_session: Session, studio: Studio) -> TrainingYear:
    """The season. §5.15 allows exactly one ACTIVE year per studio, which is what makes
    `period=season` resolvable without a setting anybody has to configure."""
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ז",
        starts_on=YEAR_STARTS,
        ends_on=date(2027, 8, 31),
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row


@pytest.fixture
def a_group(app_session: Session, studio: Studio) -> Group:
    klass = Class(studio_id=studio.id, name=f"ג'ודו {uuid.uuid4().hex[:6]}")
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים", kind="base")
    app_session.add(group)
    app_session.commit()
    return group


@pytest.fixture
def a_belt_ladder(app_session: Session, studio: Studio) -> list[BeltRank]:
    """Three ranks, deliberately created out of order.

    `4g`'s belt chart runs lowest rank at the reading start, so the service must order by
    `order_index` rather than by insertion — a fixture that inserted them in order could
    not tell the difference.
    """
    klass = Class(studio_id=studio.id, name=f"סולם {uuid.uuid4().hex[:6]}")
    app_session.add(klass)
    app_session.flush()
    ranks = [
        BeltRank(
            studio_id=studio.id, class_id=klass.id, name=name, order_index=order, color_hex=color
        )
        for name, order, color in (
            ("שחורה", 2, "#17150f"),
            ("לבנה", 0, "#fffefb"),
            ("צהובה", 1, "#d9a800"),
        )
    ]
    app_session.add_all(ranks)
    app_session.commit()
    return sorted(ranks, key=lambda rank: rank.order_index)


def make_member(
    app_session: Session,
    studio: Studio,
    *,
    joined_on: date,
    left_on: date | None = None,
    status: str = "active",
) -> Student:
    """A student placed on a timeline. `4g`'s membership predicate reads these two dates
    and never `status`, so every test here sets them explicitly."""
    person = Person(studio_id=studio.id, first_name="חניך", last_name=uuid.uuid4().hex[:6])
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=person.id,
        status=status,
        joined_on=joined_on,
        left_on=left_on,
    )
    app_session.add(student)
    app_session.commit()
    return student


def make_session(
    app_session: Session, studio: Studio, group: Group, year: TrainingYear, *, starts_at: datetime
) -> SessionRow:
    row = SessionRow(
        studio_id=studio.id,
        group_id=group.id,
        training_year_id=year.id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        # Left as `scheduled` ON PURPOSE. The worker that writes `completed` was never
        # scheduled until this wave, so every session that ended before this month is
        # still `scheduled` in any real database — a fixture that pre-completed its
        # sessions would test a shape production does not have.
        status="scheduled",
    )
    app_session.add(row)
    app_session.commit()
    return row


def mark(
    app_session: Session, studio: Studio, session_row: SessionRow, student: Student, status: str
) -> None:
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=session_row.id,
            student_id=student.id,
            status=status,
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()
