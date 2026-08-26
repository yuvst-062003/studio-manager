"""§5.7's `סמן הכל נוכח`, and the rule two artboards get wrong.

`9f` finding 1, verbatim: "The `סמן הכל נוכח` button sets **every** roster entry to
present, unconditionally... As drawn, one tap silently discards every parent's advance
notice — the very signal the hint row above it just announced." `1e` draws the same button
in the dashboard's quick view.

The copy that ships already says the opposite —
`attendance.source.preReportedHint` is `ההורה דיווח מראש. סימון קבוצתי לא ידרוס את הדיווח`
— and §10.5 protects it. This file is where the behaviour and the copy are made to agree.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from app.models.attendance import AbsenceReport, Attendance
from app.schemas.attendance import BulkPresentIn
from app.services.attendance.service import AttendanceService
from sqlalchemy import select
from tests.attendance.conftest import T0
from tests.attendance.test_roster import _add_student

MONDAY = 1


def _bulk(*, respect: bool = True, at=None) -> BulkPresentIn:
    return BulkPresentIn(
        client_mark_id_prefix=uuid.uuid4(),
        device_marked_at=at or T0,
        respect_absence_reports=respect,
    )


def _pre_report(app_session, studio, session_id, student_id, guardian_person_id, *, at):
    app_session.add(
        AbsenceReport(
            studio_id=studio.id,
            student_id=student_id,
            session_id=session_id,
            reported_by_person_id=guardian_person_id,
            reason="מחלה",
        )
    )
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=session_id,
            student_id=student_id,
            status="absent_excused",
            source="parent",
            marked_at=at,
            device_marked_at=at,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()


def test_bulk_marks_every_unmarked_expected_student_present(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student, as_lead_coach
):
    _add_student(app_session, studio, a_group, name="שני")
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 2
    rows = tenant_session.execute(select(Attendance)).scalars().all()
    assert {row.status for row in rows} == {"present"}
    assert {row.source for row in rows} == {"bulk"}


def test_bulk_does_not_overwrite_a_parents_advance_notice(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach, as_guardian
):
    """§10.5's exception, with the timestamp deliberately in the bulk action's favour:
    the parent reported eight hours ago, the coach taps now, and the parent still wins."""
    _pre_report(
        app_session,
        studio,
        a_session,
        an_enrolled_student,
        as_guardian.person_id,
        at=T0 - timedelta(hours=8),
    )
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(at=T0), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 0
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.status == "absent_excused"
    assert row.source == "parent"


def test_a_caller_cannot_ask_the_server_to_overwrite_a_pre_report(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach, as_guardian
):
    """§10.5 is unconditional — 'a parent pre-report never loses to a bulk action regardless
    of timestamp' — so there is deliberately no flag that turns it off. A client sending
    `respect_absence_reports=false` gets the safe branch anyway, which is the difference
    between a default and a guarantee."""
    _pre_report(
        app_session,
        studio,
        a_session,
        an_enrolled_student,
        as_guardian.person_id,
        at=T0 - timedelta(hours=8),
    )
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(respect=False), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 0
    assert tenant_session.execute(select(Attendance)).scalars().one().source == "parent"


def test_a_pre_report_whose_attendance_row_has_not_landed_yet_is_still_protected(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach, as_guardian
):
    """The hole that reading `respect_absence_reports` as a switch actually opened.

    A report filed while the roster was being materialized leaves an `absence_report` row
    with no `attendance` row behind it yet. That row reads `status='unmarked'` and
    `has_absence_report=True` — so a status-only filter lets it through, and `resolve_mark`
    then sees NO existing row to protect and applies the bulk mark. One tap, and the
    parent's advance notice is gone with nothing in the database that remembers it was
    there.

    Written as a failing test first, which is why the refusal in `_bulk_touches` is
    unconditional rather than flag-driven.
    """
    app_session.add(
        AbsenceReport(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            session_id=a_session,
            reported_by_person_id=as_guardian.person_id,
            reason="מחלה",
        )
    )
    app_session.commit()

    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(respect=False), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 0
    assert tenant_session.execute(select(Attendance)).scalars().all() == []


def test_bulk_does_not_touch_a_mark_a_coach_already_set(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach
):
    """§5.7 — 'it does not touch rows a coach has already set.' A coach who marked one
    child absent and then tapped `סמן הכל נוכח` for the rest did not change their mind."""
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=an_enrolled_student,
            status="absent_unexcused",
            source="coach",
            marked_at=T0 - timedelta(minutes=1),
            device_marked_at=T0 - timedelta(minutes=1),
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 0
    assert tenant_session.execute(select(Attendance)).scalars().one().status == "absent_unexcused"


def test_bulk_never_touches_the_not_expected_section(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student, as_lead_coach
):
    """§5.7 — '`סמן הכל נוכח` never touches that section, and its rows never count toward
    `לא סומן`.' A child who is not expected today and did not come has not missed anything,
    and marking them present because a coach tapped a button is a fabricated record."""
    monday_only = _add_student(app_session, studio, a_group, name="שני", attends=[MONDAY])
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 1
    marked = tenant_session.execute(select(Attendance)).scalars().all()
    assert [row.student_id for row in marked] == [an_enrolled_student]
    assert monday_only not in {row.student_id for row in marked}


def test_replaying_the_same_bulk_tap_is_a_no_op(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student, as_lead_coach
):
    """A bulk action is queued like any other operation (§10.6), so it flushes twice for
    exactly the reasons a single mark does. The per-student `client_mark_id` is derived
    from the tap's prefix, so the replay is idempotent without the client having to
    remember thirty ids."""
    _add_student(app_session, studio, a_group, name="שני")
    service = AttendanceService(tenant_session)
    body = _bulk()

    first = service.bulk_present(a_session, body, actor_person_id=as_lead_coach.person_id, at=T0)
    tenant_session.commit()
    second = service.bulk_present(a_session, body, actor_person_id=as_lead_coach.person_id, at=T0)
    tenant_session.commit()

    assert first.applied == 2
    assert (second.applied, second.replayed, second.superseded) == (0, 0, 0)
    assert len(tenant_session.execute(select(Attendance)).scalars().all()) == 2


def test_a_bulk_tap_on_an_empty_roster_writes_nothing_and_raises_nothing(
    tenant_session, a_session, as_lead_coach
):
    result = AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert result.applied == 0
    assert result.conflicts == []
    assert tenant_session.execute(select(Attendance)).scalars().all() == []


def test_the_bulk_marks_are_attributed_to_the_coach_who_tapped(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§10.3 — 'Attendance is attributed to whoever marked it.' A bulk action is still
    somebody's action; `source='bulk'` records HOW and `marked_by_person_id` records WHO."""
    AttendanceService(tenant_session).bulk_present(
        a_session, _bulk(), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.marked_by_person_id == as_lead_coach.person_id
    assert row.source == "bulk"
