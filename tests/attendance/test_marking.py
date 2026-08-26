"""`POST /attendance/batch`'s service half — §10.5's cross-actor conflicts against a real
database.

The rules themselves are settled in `test_resolve.py` with no I/O. What is asserted here is
what the *service* does with a decision: that a mark is **stored** even when the session was
cancelled underneath it, that a replay writes nothing and raises nothing, and that
`unmarked` survives a round trip as a stored status rather than being normalised away.

§10.5's opening line is the reason this file exists at all: "The interesting case is not
two coaches — it is a coach offline and a manager online."
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.attendance import AbsenceReport, Attendance
from app.models.people import Enrollment
from app.schemas.attendance import AttendanceIn, BatchAttendanceIn
from app.services.attendance.errors import NotFoundError
from app.services.attendance.service import AttendanceService
from sqlalchemy import select
from tests.attendance.conftest import T0


def _mark(student_id, *, status="present", at=None, mark_id=None) -> AttendanceIn:
    return AttendanceIn(
        student_id=student_id,
        status=status,
        client_mark_id=mark_id or uuid.uuid4(),
        device_marked_at=at or T0,
    )


def _batch(session_id, *marks, seen: str | None = "scheduled") -> BatchAttendanceIn:
    return BatchAttendanceIn(session_id=session_id, marks=list(marks), session_status_seen=seen)


def test_a_mark_is_stored_with_both_clocks(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§4.3 — `marked_at` is when the server accepted it, `device_marked_at` is when the
    coach tapped. A single timestamp cannot express 'marked at 17:05, synced at 19:00',
    and that gap is the normal case in a basement dojo."""
    service = AttendanceService(tenant_session)
    tapped = T0 - timedelta(hours=2)
    result = service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student, at=tapped)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    assert result.applied == 1
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.device_marked_at == tapped
    assert row.marked_at == T0
    assert row.marked_by_person_id == as_lead_coach.person_id


def test_the_same_device_flushing_twice_writes_one_row_and_raises_nothing(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§10.5 — 'The same device flushes twice. Idempotent on `client_mark_id`; the replay
    is a no-op.' A queue that partially reached the server must be safe to resend whole."""
    service = AttendanceService(tenant_session)
    mark_id = uuid.uuid4()
    batch = _batch(a_session, _mark(an_enrolled_student, mark_id=mark_id))

    first = service.apply_batch(batch, actor_person_id=as_lead_coach.person_id, at=T0)
    tenant_session.commit()
    second = service.apply_batch(batch, actor_person_id=as_lead_coach.person_id, at=T0)
    tenant_session.commit()

    assert (first.applied, first.replayed) == (1, 0)
    assert (second.applied, second.replayed) == (0, 1)
    assert len(tenant_session.execute(select(Attendance)).scalars().all()) == 1


def test_a_replayed_client_mark_id_never_moves_to_another_student(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student, as_lead_coach
):
    """`client_mark_id` is UNIQUE across the table (§4.3's second index), so the id
    identifies THE MARK. A client reusing one for a different child is a client bug, and
    the server treats it as the replay it looks like rather than raising a 500 from a
    constraint violation a coach can do nothing about."""
    from tests.attendance.test_roster import _add_student

    other = _add_student(app_session, studio, a_group, name="אחר")
    service = AttendanceService(tenant_session)
    mark_id = uuid.uuid4()

    service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student, mark_id=mark_id)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    result = service.apply_batch(
        _batch(a_session, _mark(other, mark_id=mark_id)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    assert result.replayed == 1
    rows = tenant_session.execute(select(Attendance)).scalars().all()
    assert [row.student_id for row in rows] == [an_enrolled_student]


def test_unmarked_is_storable_and_survives_the_round_trip(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§5.14 — 'this is why `unmarked` must be a real state'. A coach who taps a row back
    past `absent_unexcused` has said something, and the sessions-held-vs-planned report is
    wrong if the server normalises that into a deleted row."""
    service = AttendanceService(tenant_session)
    service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student, status="present")),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    service.apply_batch(
        _batch(
            a_session, _mark(an_enrolled_student, status="unmarked", at=T0 + timedelta(minutes=1))
        ),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.status == "unmarked"
    assert row.source == "coach"


def test_a_later_tap_from_a_second_coach_wins_on_the_device_clock(
    tenant_session, a_session, an_enrolled_student, as_lead_coach, as_assistant_coach
):
    """§10.5 — 'Two coaches mark the same session. Last write by `device_marked_at`.'"""
    service = AttendanceService(tenant_session)
    service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student, status="present", at=T0)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    service.apply_batch(
        _batch(
            a_session,
            _mark(an_enrolled_student, status="absent_unexcused", at=T0 + timedelta(minutes=5)),
        ),
        actor_person_id=as_assistant_coach.person_id,
        at=T0 + timedelta(hours=2),
    )
    tenant_session.commit()
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.status == "absent_unexcused"
    assert row.marked_by_person_id == as_assistant_coach.person_id


def test_an_earlier_tap_arriving_late_does_not_overwrite_the_later_one(
    tenant_session, a_session, an_enrolled_student, as_lead_coach, as_assistant_coach
):
    """The whole reason §10.5 resolves on the DEVICE clock: whoever reconnected second
    would otherwise overwrite the earlier mark, and reconnection order is noise."""
    service = AttendanceService(tenant_session)
    service.apply_batch(
        _batch(
            a_session,
            _mark(an_enrolled_student, status="absent_unexcused", at=T0 + timedelta(minutes=5)),
        ),
        actor_person_id=as_assistant_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    result = service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student, status="present", at=T0)),
        actor_person_id=as_lead_coach.person_id,
        at=T0 + timedelta(hours=2),
    )
    tenant_session.commit()
    assert result.superseded == 1
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.status == "absent_unexcused"


def test_a_cancelled_session_stores_the_marks_and_raises_a_card(
    tenant_session, app_session, a_session, an_enrolled_student, as_lead_coach
):
    """§10.5's headline case — 'Coach marks attendance offline; a manager cancels that
    session meanwhile. On flush the marks are accepted and stored, but the session is
    cancelled, so a card appears for the manager. Never silently dropped, never silently
    applied to a cancelled session's reports.'"""
    from app.models.schedule import Session as SessionRow

    row = app_session.get(SessionRow, a_session)
    row.status = "cancelled"
    row.cancel_reason = "system:schedule_change"
    app_session.commit()

    service = AttendanceService(tenant_session)
    result = service.apply_batch(
        _batch(a_session, _mark(an_enrolled_student), seen="scheduled"),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()

    assert result.applied == 1, "stored — never silently dropped"
    assert [c.kind for c in result.conflicts] == ["session_cancelled"]
    assert result.conflicts[0].count == 1
    assert tenant_session.execute(select(Attendance)).scalars().one().status == "present"


def test_a_device_that_already_knew_the_session_was_cancelled_raises_no_card(
    tenant_session, app_session, a_session, an_enrolled_student, as_lead_coach
):
    """`session_status_seen` is what makes this a CROSS-ACTOR conflict rather than a
    permanent complaint about every cancelled session. A coach marking a session they can
    see is cancelled — a lesson that ran anyway — is a decision, not a collision."""
    from app.models.schedule import Session as SessionRow

    row = app_session.get(SessionRow, a_session)
    row.status = "cancelled"
    row.cancel_reason = "system:schedule_change"
    app_session.commit()

    result = AttendanceService(tenant_session).apply_batch(
        _batch(a_session, _mark(an_enrolled_student), seen="cancelled"),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    assert result.applied == 1
    assert result.conflicts == []


def test_a_student_unenrolled_meanwhile_is_stored_and_flagged(
    tenant_session, app_session, a_session, an_enrolled_student, as_lead_coach
):
    """§10.5 — 'Coach marks a student who was unenrolled meanwhile. Same treatment:
    stored, flagged, surfaced.'"""
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.status = "ended"
    app_session.commit()

    result = AttendanceService(tenant_session).apply_batch(
        _batch(a_session, _mark(an_enrolled_student)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    assert result.applied == 1
    assert [c.kind for c in result.conflicts] == ["student_unenrolled"]
    assert result.conflicts[0].student_ids == [an_enrolled_student]


def test_a_batch_for_a_session_in_another_studio_is_not_found(
    tenant_session, other_studio_session_id, an_enrolled_student, as_lead_coach
):
    with pytest.raises(NotFoundError):
        AttendanceService(tenant_session).apply_batch(
            _batch(other_studio_session_id, _mark(an_enrolled_student)),
            actor_person_id=as_lead_coach.person_id,
            at=T0,
        )


def test_a_coach_tap_may_override_a_parents_pre_report(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach, as_guardian
):
    """§5.7 — 'A pre-reported absence can only be changed by an explicit coach tap.' The
    child who was reported sick and turned up anyway is a real child."""
    app_session.add(
        AbsenceReport(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            session_id=a_session,
            reported_by_person_id=as_guardian.person_id,
        )
    )
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=an_enrolled_student,
            status="absent_excused",
            source="parent",
            marked_at=T0 - timedelta(hours=8),
            device_marked_at=T0 - timedelta(hours=8),
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()

    AttendanceService(tenant_session).apply_batch(
        _batch(a_session, _mark(an_enrolled_student, status="present")),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    row = tenant_session.execute(select(Attendance)).scalars().one()
    assert row.status == "present"
    assert row.source == "coach"


def test_a_note_rides_along_with_the_mark(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§5.13 — notes are 'both optional, never required to complete any flow'. A per-mark
    note is what artboard `9f`'s row note renders, and it queues with the mark rather than
    as a second operation that could sync separately."""
    mark = _mark(an_enrolled_student)
    mark = mark.model_copy(update={"note": "הגיע באיחור"})
    AttendanceService(tenant_session).apply_batch(
        _batch(a_session, mark), actor_person_id=as_lead_coach.person_id, at=T0
    )
    tenant_session.commit()
    assert tenant_session.execute(select(Attendance)).scalars().one().note == "הגיע באיחור"


def test_a_batch_records_one_audit_entry_carrying_counts_and_no_names(
    tenant_session, a_session, an_enrolled_student, as_lead_coach
):
    """§11.2 — the audit log is append-only by grant. A batch is one manager-visible event;
    thirty rows would be thirty entries nobody reads. The diff carries counts, never a
    child's name, because an audit entry is read by a wider audience than the roster is."""
    from app.models.audit import AuditLog

    AttendanceService(tenant_session).apply_batch(
        _batch(a_session, _mark(an_enrolled_student)),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()
    entries = (
        tenant_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "attendance_batch", AuditLog.entity_id == a_session
            )
        )
        .scalars()
        .all()
    )
    assert len(entries) == 1
    assert entries[0].diff == {"applied": 1, "replayed": 0, "superseded": 0, "conflicts": 0}
