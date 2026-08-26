"""Signed-in callers, a published event, and a student registered for it.

Same caller machinery as tests/billing/conftest.py and tests/health/conftest.py, and for
the same reason: §3.2's matrix is enforced by a dependency reading a VERIFIED claim, so
every fixture signs in for real. See tests/billing/conftest.py for the full argument.

**The clock is the same instant billing pins.** An event fee raised by this lane becomes a
`charge` in a period that lane reasons about, and two conftests disagreeing about what
month it is would make the two lanes' tests disagree about one flow.

**This lane never writes a billing table.** Plan W4: "Event fees call
`BillingService.create_charge(kind='event')`. The events lane never writes to a billing
table directly." So there is no fixture here that creates a charge, and
`a_registered_student` deliberately leaves `charge_id` null -- see its docstring.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.events import Event, EventRegistration
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.structure import Class, Group
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: The same instant tests/billing/conftest.py pins. See this module's docstring.
T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
TODAY = date(2026, 11, 12)
YEAR_STARTS = date(2026, 9, 1)

#: ₪80.00 in agorot (G2). The event's PRICE, which is a setting -- what a family actually
#: owes is a `charge`, reached through `event_registration.charge_id`.
EVENT_FEE_AGOROT = 8_000


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
    row = Studio(name="מועדון אירועים", slug=f"evt-{uuid.uuid4().hex[:8]}")
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
    """A parent bound to an actual child. §5.8's consent and RSVP are answered by the
    guardian, and both resolve through `guardian` -- "which children does this identity
    answer for" -- so a guardian row pointing at a random UUID cannot exercise either."""

    def _make(student_id: uuid.UUID) -> Caller:
        return _make_caller(
            client, fake_provider, app_session, studio, role=None, guardian_of=student_id
        )

    return _make


@pytest.fixture
def a_class(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    """§5.8's targeting has a `group` mode, so a lane testing it needs a real group id."""
    row = Group(studio_id=studio.id, class_id=a_class, name="מתחילים", age_min=5, age_max=8)
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_student(app_session: Session, studio: Studio) -> uuid.UUID:
    row_person = Person(studio_id=studio.id, first_name="ילדה", last_name="בודקת")
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
def an_event(app_session: Session, studio: Studio) -> uuid.UUID:
    """A published competition two weeks out, with a fee and a consent requirement.

    **`consent_text` is non-null because `requires_consent` is true**, and the pairing is
    not decoration: `event_consent_has_text` is a CHECK, so a fixture that set the flag
    without the text would be rejected by the database and every test in the lane would
    fail on the fixture rather than on the code. §5.8's reason for the constraint is that
    a parent must never be asked to agree to nothing.

    `status='published'` rather than the `draft` default: nothing is visible to a guardian
    while an event is a draft, so a draft fixture would make every parent-facing test
    (artboards `7d`, `12h`) assert an empty list and pass for the wrong reason.
    """
    row = Event(
        studio_id=studio.id,
        type="competition",
        title="אליפות החורף",
        description="תחרות פתוחה לכל הקבוצות",
        starts_at=T0 + timedelta(days=14),
        ends_at=T0 + timedelta(days=14, hours=6),
        location_text="היכל הספורט, תל אביב",
        rsvp_deadline=T0 + timedelta(days=7),
        fee_agorot=EVENT_FEE_AGOROT,
        requires_consent=True,
        consent_text="אני מאשר/ת את השתתפות בני/בתי בתחרות",
        status="published",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_registered_student(
    app_session: Session, studio: Studio, an_event: uuid.UUID, a_student: uuid.UUID
) -> uuid.UUID:
    """One registration, awaiting an answer.

    `rsvp='pending'` is a real state and not a missing value: nobody has answered yet,
    which §4.3 keeps distinct from having declined. A fixture defaulting to `yes` would
    make the "has anyone actually replied" question untestable.

    **`charge_id` is null on purpose.** §5.12's fee becomes a charge through
    `BillingService.create_charge(kind='event')`, and this lane never calls a billing
    write itself -- so a fixture that pre-filled it would model a flow lane EVENTS is
    forbidden to perform, and would hide the seam it is supposed to go through.

    `attended` is left at its `False` default, which is also distinct from `rsvp`: saying
    yes and turning up are different facts, and §5.8's post-event report is about the
    second one.
    """
    row = EventRegistration(
        studio_id=studio.id,
        event_id=an_event,
        student_id=a_student,
        rsvp="pending",
        charge_id=None,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs. Arrange with
    `app_session`, act and assert through this -- see tests/billing/conftest.py."""
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s
