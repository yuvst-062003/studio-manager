"""§5.4(a)'s manager-added student, and §3.2's split over who may see whom.

The scoping tests are the important ones. §3.2 gives owners and managers "View all
students in studio" and every staff role "View students in own groups" -- so a coach
listing students must see the ones on their mat and nobody else's. A leak here is a
privacy failure in the most-hit endpoint in the product.

**Arrange on `app_session`, act and assert through `tenant_session`.** `app_session` is a
plain unscoped `Session` with no per-test rollback, sharing a database with another lane's
suite; a list assertion made through it would see every studio's rows and every earlier
test's. Every fact this file asserts about a *set* of students is therefore read back
through the tenant filter, which is also how the service runs in production.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

import pytest
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Invitation, Person
from app.services.people.errors import NotFoundError
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0, TODAY


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _create(session, *, first: str | None = None, status: str = "lead", **kwargs):
    """One student with a guardian, with names that cannot collide with another run."""
    tag = uuid.uuid4().hex[:8]
    defaults = dict(
        first_name=first or f"ילד{tag}",
        last_name=f"כהן{tag}",
        birthdate=date(2018, 5, 1),
        guardian_first_name=f"הורה{tag}",
        guardian_last_name=f"כהן{tag}",
        guardian_email=f"{_unique('g')}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
        status=status,
    )
    defaults.update(kwargs)
    return StudentService.create(session, **defaults)


def _enrol(session, student_id, group_id):
    session.add(
        Enrollment(student_id=student_id, group_id=group_id, status="active", started_on=TODAY)
    )
    session.flush()


# -- creation ------------------------------------------------------------------


def test_creating_a_student_creates_a_person_a_student_and_a_guardian(tenant_session):
    result = _create(tenant_session)
    tenant_session.commit()

    student = result.student
    assert student.status == "lead"
    # §5.4(a) -- 'Creates everything immediately with health_status = missing.'
    assert student.health_status == "missing"

    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == student.id)
    ).scalar_one()
    # §5.3 -- 'Exactly one guardian per student carries is_primary.' The first one does.
    assert guardian.is_primary is True

    # §4.3 -- a student IS a person. Everything nameable lives on the Person it points at.
    person = tenant_session.get(Person, student.person_id)
    assert person is not None
    assert person.birthdate == date(2018, 5, 1)
    assert student.person_id == person.id


def test_the_student_carries_no_name_column_of_its_own():
    """§4.3 -- 'A student IS a person (person_id UNIQUE), not a copy of one.' A name on
    `student` would let an adult student -- who is their own guardian (§5.3) -- carry two
    names that disagree."""
    columns = set(Student.__table__.columns.keys())
    assert columns.isdisjoint({"first_name", "last_name", "birthdate", "phone", "email"})


def test_creating_a_student_issues_an_invitation_the_manager_can_hand_over(tenant_session):
    """§5.4(a) -- 'and sends the parent an invitation.' The token is returned once and
    stored only as a hash: an invitation table holding live credentials in plaintext
    would be a credential store with an append-only grant on it."""
    result = _create(tenant_session)
    tenant_session.commit()

    assert result.invitation_token
    invitation = tenant_session.execute(
        select(Invitation).where(Invitation.student_id == result.student.id)
    ).scalar_one()
    assert invitation.intended_role == "guardian"
    assert (
        invitation.token_hash == hashlib.sha256(result.invitation_token.encode("utf-8")).hexdigest()
    )
    # The plaintext is never what is stored.
    assert result.invitation_token != invitation.token_hash


def test_a_matched_guardian_is_never_duplicated(tenant_session, app_session, as_guardian):
    """L7 and §5.4a -- 'A matched parent is never duplicated: approval attaches the new
    children to their existing Person.' The signed-in guardian fixture has a verified
    address, which is the only key L7 allows."""
    parent = app_session.get(Person, as_guardian.person_id)

    result = _create(tenant_session, guardian_email=parent.email)
    tenant_session.commit()

    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == result.student.id)
    ).scalar_one()
    assert guardian.person_id == as_guardian.person_id
    # §5.4a -- 'No second invitation, no second account, no second login.'
    assert result.invitation_token is None
    assert (
        tenant_session.execute(
            select(Invitation).where(Invitation.student_id == result.student.id)
        ).first()
        is None
    )


def test_a_student_created_for_a_trial_carries_the_source_it_came_from(tenant_session):
    """§4.3's `student.source`. §5.4a's funnel report slices by source, so a student whose
    origin was not recorded is a row that report cannot place."""
    result = _create(tenant_session, status="trial", source="public_link")
    tenant_session.commit()
    assert result.student.source == "public_link"


# -- §3.2's viewer split -------------------------------------------------------


def test_a_manager_sees_every_student_in_the_studio(tenant_session, a_group):
    a = _create(tenant_session).student
    b = _create(tenant_session).student
    _enrol(tenant_session, a.id, a_group)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None)
    assert {r.id for r in rows} >= {a.id, b.id}


def test_a_coach_sees_only_students_in_their_own_groups(tenant_session, a_group, a_second_group):
    """§3.2 -- 'View students in own groups' is what a coach gets. A coach who can list
    the whole club can read the contact details of children they never teach."""
    mine = _create(tenant_session).student
    theirs = _create(tenant_session).student
    _enrol(tenant_session, mine.id, a_group)
    _enrol(tenant_session, theirs.id, a_second_group)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=[a_group])
    ids = {r.id for r in rows}
    assert mine.id in ids
    assert theirs.id not in ids


def test_a_coach_with_no_groups_sees_nobody(tenant_session):
    """An empty group list is 'no groups', never 'no filter'. The difference is the whole
    club's roster, and `if viewer_group_ids:` is the one-character version of that bug."""
    _create(tenant_session)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=[])
    assert rows == []


def test_a_trial_student_appears_with_no_group_and_is_not_hidden(tenant_session):
    """§5.4a -- 'a trial person is a real student who simply has no enrollment.' The
    dashboard's trial queue is a status filter over the same list, not a second table."""
    student = _create(tenant_session, status="trial").student
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, status="trial")
    row = next(r for r in rows if r.id == student.id)
    assert row.group_names == []


# -- filters and paging --------------------------------------------------------


def test_the_list_filters_by_status(tenant_session):
    a = _create(tenant_session).student
    b = _create(tenant_session).student
    StudentStatusService.transition(tenant_session, student=a, to_status="trial", at=T0)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, status="trial")
    ids = {r.id for r in rows}
    assert a.id in ids and b.id not in ids


def test_the_list_searches_by_name(tenant_session):
    """Staff `9h` is a search box on a phone, one-handed, on a mat. Substring and
    case-insensitive, over both names."""
    tag = uuid.uuid4().hex[:8]
    student = _create(tenant_session, first=f"נועה{tag}").student
    _create(tenant_session)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, q=tag)
    assert [r.id for r in rows] == [student.id]


def test_the_search_matches_a_surname_too(tenant_session):
    tag = uuid.uuid4().hex[:8]
    student = _create(tenant_session, last_name=f"לוי{tag}").student
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, q=tag)
    assert [r.id for r in rows] == [student.id]


def test_the_list_filters_by_group(tenant_session, a_group, a_second_group):
    here = _create(tenant_session).student
    elsewhere = _create(tenant_session).student
    _enrol(tenant_session, here.id, a_group)
    _enrol(tenant_session, elsewhere.id, a_second_group)
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, group_id=a_group)
    ids = {r.id for r in rows}
    assert here.id in ids and elsewhere.id not in ids


def test_the_list_is_cursor_paginated(tenant_session):
    """G16. Rosters are written to while they are being read -- a coach marks attendance
    during the same minute a manager pages the register -- and LIMIT/OFFSET skips rows
    when the set shifts under it."""
    for _ in range(5):
        _create(tenant_session)
    tenant_session.commit()

    first, cursor = StudentService.list_students(tenant_session, viewer_group_ids=None, limit=2)
    assert len(first) == 2 and cursor is not None
    second, _ = StudentService.list_students(
        tenant_session, viewer_group_ids=None, limit=2, after=cursor
    )
    assert {r.id for r in first}.isdisjoint({r.id for r in second})


def test_the_last_page_reports_no_cursor(tenant_session):
    """`has_more` is derived from this. A cursor on the final page makes an infinite
    scroll spin forever on an empty fetch."""
    _create(tenant_session)
    tenant_session.commit()
    rows, cursor = StudentService.list_students(tenant_session, viewer_group_ids=None, limit=200)
    assert rows and cursor is None


def test_a_frozen_student_reports_the_date_they_come_back(tenant_session):
    """§5.4 -- 'the guardians see מוקפא with the return date.' The date is on the freeze
    row, not on the student, because a freeze is a period."""
    from app.models.people import StudentFreeze

    student = _create(tenant_session, status="active").student
    StudentStatusService.transition(tenant_session, student=student, to_status="frozen", at=T0)
    tenant_session.add(
        StudentFreeze(student_id=student.id, from_date=date(2026, 10, 1), to_date=date(2026, 11, 1))
    )
    tenant_session.commit()

    rows, _ = StudentService.list_students(tenant_session, viewer_group_ids=None, status="frozen")
    row = next(r for r in rows if r.id == student.id)
    assert row.frozen_until == date(2026, 11, 1)


# -- reads ---------------------------------------------------------------------


def test_my_children_is_the_guardian_table_and_nothing_else(
    tenant_session, app_session, as_guardian
):
    """L9 -- 'There is no household or family entity. My children is
    SELECT student_id FROM guardian WHERE person_id = me.'"""
    parent = app_session.get(Person, as_guardian.person_id)
    result = _create(tenant_session, guardian_email=parent.email)
    _create(tenant_session)  # another family's child
    tenant_session.commit()

    mine = StudentService.for_guardian(tenant_session, person_id=as_guardian.person_id)
    assert [s.id for s in mine] == [result.student.id]


def test_getting_a_student_from_another_studio_is_not_found(tenant_session):
    with pytest.raises(NotFoundError):
        StudentService.get(tenant_session, student_id=uuid.uuid4())


def test_a_coach_cannot_reach_a_student_outside_their_groups(
    tenant_session, a_group, a_second_group
):
    """404 and never 403. A 403 confirms the row exists, which is a cross-scope read with
    a polite error message."""
    theirs = _create(tenant_session).student
    _enrol(tenant_session, theirs.id, a_second_group)
    tenant_session.commit()

    with pytest.raises(NotFoundError):
        StudentService.get(tenant_session, student_id=theirs.id, viewer_group_ids=[a_group])


def test_updating_a_student_writes_to_the_person(tenant_session):
    student = _create(tenant_session).student
    tenant_session.commit()

    StudentService.update(
        tenant_session,
        student_id=student.id,
        first_name="דניאלה",
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    assert tenant_session.get(Person, student.person_id).first_name == "דניאלה"


def test_the_audit_diff_never_carries_a_childs_name(tenant_session):
    """§11.2 and §11.4 -- `audit_log` is append-only, so a name written into a diff is a
    name anonymization can never reach. The trail records WHICH fields changed."""
    from app.models.audit import AuditLog

    student = _create(tenant_session).student
    tenant_session.commit()
    StudentService.update(
        tenant_session, student_id=student.id, first_name="דניאלה", at=T0, actor_person_id=None
    )
    tenant_session.commit()

    entry = tenant_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == student.id, AuditLog.action == "student.updated"
        )
    ).scalar_one()
    assert "דניאלה" not in str(entry.diff)
    assert "first_name" in str(entry.diff)


def test_viewer_scope_is_none_for_a_manager_and_a_list_for_a_coach(
    tenant_session, app_session, as_manager, as_lead_coach, a_group, assign_coach
):
    """§3.2's split, resolved once per request. `None` means 'every student in the
    studio'; a list means 'these groups'."""
    assign_coach(as_lead_coach.person_id, a_group)

    assert (
        StudentService.viewer_group_ids(
            tenant_session, person_id=as_manager.person_id, roles={"manager"}
        )
        is None
    )
    assert StudentService.viewer_group_ids(
        tenant_session, person_id=as_lead_coach.person_id, roles={"lead_coach"}
    ) == [a_group]
