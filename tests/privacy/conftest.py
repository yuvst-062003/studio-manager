"""Signed-in callers, a family with health and billing data, audit trail.

Privacy flows (GDPR data export, deletion requests) need representative data across
multiple tables: health declarations, attendance records, billing history, audit logs.

**The clock is the same instant tests/billing/conftest.py and tests/comms/conftest.py pin**
(T0 = 2026-11-12 09:00 UTC). M9's privacy flows and M8's notifications share the same
fixtures, so two conftests disagreeing about time makes two lanes' tests disagree.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.billing import Charge, PricePlan
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
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
    """A child, and the two person ids a charge needs to be about them."""

    student_id: uuid.UUID
    person_id: uuid.UUID
    payer_person_id: uuid.UUID


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון פרטיות", slug=f"priv-{uuid.uuid4().hex[:8]}")
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
def a_price_plan(app_session: Session, studio: Studio) -> uuid.UUID:
    """The price plan for any enrolled students."""
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
def a_family_with_data(
    app_session: Session, studio: Studio, a_price_plan: uuid.UUID
) -> tuple[PricedStudent, PricedStudent]:
    """A family with two children: billing history, enrollment records.

    Privacy export and deletion tests need realistic data across multiple related tables,
    so this fixture creates a payer with two children to exercise data discovery and
    cascade deletion/export.
    """
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="משפחה")
    app_session.add(payer)
    app_session.flush()

    students = []
    for name in ("דנה", "יוסי"):
        child = Person(studio_id=studio.id, first_name=name, last_name="משפחה")
        app_session.add(child)
        app_session.flush()

        student = Student(
            studio_id=studio.id,
            person_id=child.id,
            status="active",
            joined_on=YEAR_STARTS,
            price_plan_id=a_price_plan,
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

        # Create a charge so deletion/export must find billing data
        charge = Charge(
            studio_id=studio.id,
            payer_person_id=payer.id,
            student_id=student.id,
            kind="tuition",
            period_year=2026,
            period_month=10,
            amount_agorot=MONTHLY_AGOROT,
            due_date=date(2026, 10, 31),
            status="open",
            created_by="billing_run",
        )
        app_session.add(charge)
        app_session.flush()
        students.append(
            PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)
        )

    app_session.commit()
    return tuple(students)


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s
