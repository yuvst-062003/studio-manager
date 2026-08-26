"""See tests/billing/test_the_lane_fixtures_build.py for why this exists.

W5's contract commit did not carry the `comms` conftest (holdback HB-w5-lane-fixtures), so
this file arrives with it rather than after it. The mechanical reason is worth repeating: a
`tests/<vertical>/` directory holding only a conftest collects no tests, pytest exits 5 on
that, and `scripts/lane-check.sh` turns exit 5 into a RED gate for a lane that has done
nothing wrong.
"""

from __future__ import annotations

import uuid

from app.models.comms import PushToken
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.models.schedule import Session as SessionRow
from app.models.structure import GroupStaff
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.comms.conftest import T0, YEAR_STARTS


def test_every_comms_fixture_builds_against_the_real_schema(
    app_session: Session,
    as_owner,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_location: uuid.UUID,
    a_class: uuid.UUID,
    a_group: uuid.UUID,
    a_student: uuid.UUID,
    an_enrolled_student: uuid.UUID,
    a_training_year: uuid.UUID,
    a_session: uuid.UUID,
    tenant_session,
) -> None:
    session_row = app_session.get(SessionRow, a_session)
    assert session_row is not None
    # session_time_range: the CHECK that would reject this row if the fixture inverted the
    # two timestamps. Asserted rather than trusted, because that failure reads as a code
    # error in every ICS test in the lane rather than as the fixture error it is.
    assert session_row.ends_at > session_row.starts_at
    assert session_row.status == "scheduled"
    assert session_row.location_id == a_location
    assert session_row.group_id == a_group
    assert session_row.training_year_id == a_training_year
    # Inside the feed window and after the pinned instant, or §5.12's "next Tuesday" feed
    # would be asserted over a session that already happened.
    assert session_row.starts_at > T0


def test_the_enrolment_is_active_and_not_merely_created(
    app_session: Session, an_enrolled_student: uuid.UUID, a_group: uuid.UUID
) -> None:
    """`enrollment.status` defaults to `pending`, which §5.4 makes a decision the manager has
    not taken yet. Every audience query in this lane filters on `active`, so a fixture left
    at the default would return an empty audience and make every fan-out test green while
    sending to nobody."""
    enrolment = app_session.execute(
        select(Enrollment).where(Enrollment.student_id == an_enrolled_student)
    ).scalar_one()
    assert enrolment.status == "active"
    assert enrolment.group_id == a_group
    assert enrolment.started_on == YEAR_STARTS


def test_a_guardian_who_never_signed_in_still_has_a_number_to_call(
    app_session: Session, a_guardian_for, a_student: uuid.UUID
) -> None:
    """§5.11's delivery report is names and phone numbers, and §5.11 permits no email and no
    SMS fallback -- so a guardian with a null phone is a family the product cannot reach at
    all. This fixture is the `no_token` row §6.5 says the office needs to phone, and it is
    only useful if it carries the number."""
    person_id = a_guardian_for(a_student, name="יעל")
    person = app_session.get(Person, person_id)
    assert person is not None
    assert person.phone
    assert person.auth_identity_id is None

    link = app_session.execute(select(Guardian).where(Guardian.person_id == person_id)).scalar_one()
    assert link.student_id == a_student
    # Not primary, so this composes with `as_guardian_of` on one child --
    # `uq_guardian_one_primary_per_student` allows exactly one.
    assert link.is_primary is False


def test_the_signed_in_guardian_is_the_primary_one(
    app_session: Session, as_guardian_of, a_student: uuid.UUID
) -> None:
    parent = as_guardian_of(a_student)
    link = app_session.execute(
        select(Guardian).where(Guardian.person_id == parent.person_id)
    ).scalar_one()
    assert link.is_primary is True
    assert "X-Dev-Now" in parent.headers


def test_a_student_and_their_guardian_are_two_different_people(
    app_session: Session, a_student: uuid.UUID, as_guardian_of
) -> None:
    """§3.3 -- a student is a `student` row pointing at a `person`, and a guardian is a
    different `person`. Collapsing them would let an announcement addressed to the family
    land in a child's inbox."""
    student = app_session.get(Student, a_student)
    assert student is not None
    parent = as_guardian_of(a_student)
    assert student.person_id != parent.person_id


def test_a_coach_can_be_bound_to_a_group_and_to_a_single_session(
    app_session: Session,
    as_lead_coach,
    a_coached_group,
    a_staffed_session,
    a_group: uuid.UUID,
    a_session: uuid.UUID,
) -> None:
    """Two different bindings, and §5.12 needs both. The group binding is what §3.2 scopes a
    lead coach's announcements by; the session binding is what the coach feed is built from,
    and a substitute covering one lesson has the second without the first."""
    assert a_coached_group(as_lead_coach.person_id) == a_group
    staff = app_session.execute(
        select(GroupStaff).where(GroupStaff.person_id == as_lead_coach.person_id)
    ).scalar_one()
    assert staff.role == "lead_coach"
    assert staff.to_date is None

    assert a_staffed_session(as_lead_coach.person_id, is_substitute=True) == a_session


def test_a_registered_device_is_one_row_the_fan_out_can_find(
    app_session: Session, a_push_token, as_manager
) -> None:
    """`ix_push_token_studio_id_person_id_app` is the fan-out's own lookup. The fixture has
    to produce a row that index can serve, which means the person and the app both."""
    token = a_push_token(as_manager.person_id, app="staff", platform="ios")
    stored = app_session.get(PushToken, token.id)
    assert stored is not None
    assert stored.person_id == as_manager.person_id
    assert stored.app == "staff"
    assert stored.platform == "ios"
    assert stored.last_seen_at == T0
