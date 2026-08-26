"""Signed-in callers, a belt ladder including a bi-colour grade, and a student on none of it.

Same caller machinery as tests/events/conftest.py -- lane EVENTS owns both verticals and
runs both checks. See tests/billing/conftest.py for why every fixture signs in for real.

**The ladder is bi-colour by default, and that is the point.** Artboard `5b` is explicit --
'מערכת חגורות, כולל חגורות דו-צבעיות' -- so a default ladder of solid belts would let this
lane build a `BeltBar` that renders one colour, ship it green, and discover the second
colour on the day a studio configures one.

**Ranks are ordered WITHIN a class** (§5.9). A karate white belt and a judo white belt are
different rows on different ladders, which is why `a_belt_ladder` needs `a_class` and why
there is no such thing here as a studio-wide rank.

**G10 lives in the component, not in this file.** Every belt bar carries a 1px ring in the
current foreground colour, because fill alone makes white invisible on light (1.08:1),
black invisible on dark (1.02:1) and yellow fail even the 3:1 non-text threshold (2.02:1).
Yellow is one of the most common children's grades, so the ladder below deliberately
includes it: a lane whose fixtures are all mid-tone belts never sees the case G10 exists
for.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.belts import BeltRank
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.structure import Class
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: The same instant tests/events/conftest.py and tests/billing/conftest.py pin.
T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
TODAY = date(2026, 11, 12)
YEAR_STARTS = date(2026, 9, 1)


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
    row = Studio(name="מועדון חגורות", slug=f"blt-{uuid.uuid4().hex[:8]}")
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
    """§5.9 allows a promotion outside a formal exam -- a coach awarding a stripe at the
    end of a session is a real thing in a children's club -- so this caller is on the
    ALLOWED side of grading, unlike in tests/billing."""
    return _make_caller(client, fake_provider, app_session, studio, role="lead_coach")


@pytest.fixture
def as_assistant_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="assistant_coach")


@pytest.fixture
def as_guardian_of(client, fake_provider, app_session, studio):
    """A parent bound to an actual child. Artboard `12d` (התקדמות חגורה ומבחנים) is the
    parent's view of their own child's grading history and nobody else's."""

    def _make(student_id: uuid.UUID) -> Caller:
        return _make_caller(
            client, fake_provider, app_session, studio, role=None, guardian_of=student_id
        )

    return _make


@pytest.fixture
def a_class(app_session: Session, studio: Studio) -> uuid.UUID:
    """Ranks hang off a class, not a studio (§5.9)."""
    row = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_belt_ladder(app_session: Session, studio: Studio, a_class: uuid.UUID) -> list[uuid.UUID]:
    """Three ranks in order, returned lowest-first, the third bi-colour.

    `order_index` is a total order within the class -- `uq_belt_rank_class_order` enforces
    it -- because "what is this child's next belt" is the question every progression screen
    answers, and two ranks at one position make it unanswerable.

    The colours are DATA, not tokens (D3). This is the one place in the product where a
    raw hex is correct: the value is configured per studio at runtime, not chosen by a
    designer at build time, which is exactly why G13's "named tokens, never hardcoded hex"
    does not reach here.

    White and yellow are deliberate: they are the two grades that fail contrast worst, and
    a ladder without them lets G10's ring look optional.
    """
    ranks = [
        BeltRank(
            studio_id=studio.id,
            class_id=a_class,
            name="לבנה",
            kyu=6,
            order_index=0,
            color_hex="#FFFFFF",
        ),
        BeltRank(
            studio_id=studio.id,
            class_id=a_class,
            name="צהובה",
            kyu=5,
            order_index=1,
            color_hex="#F7E017",
        ),
        BeltRank(
            studio_id=studio.id,
            class_id=a_class,
            name="צהובה-כתומה",
            kyu=4,
            order_index=2,
            color_hex="#F7E017",
            secondary_color_hex="#F08A24",
        ),
    ]
    app_session.add_all(ranks)
    app_session.commit()
    return [r.id for r in ranks]


@pytest.fixture
def a_student(app_session: Session, studio: Studio) -> uuid.UUID:
    """`current_belt_id` is left null, which is where every child starts and is the state
    a progression screen has to render before it renders anything else. Awarding a rank is
    this lane's job, so a fixture that pre-awarded one would skip the transition under
    test."""
    person = Person(studio_id=studio.id, first_name="ילד", last_name="בודק")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=person.id,
        status="active",
        joined_on=YEAR_STARTS,
    )
    app_session.add(student)
    app_session.commit()
    return student.id


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs. Arrange with
    `app_session`, act and assert through this -- see tests/billing/conftest.py."""
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s
