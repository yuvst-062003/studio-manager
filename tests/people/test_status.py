"""§5.4a's funnel, as a state machine with exactly one writer.

    lead --> trial --> pending_approval --> active --> frozen --> left
       |                                                       \\-> lost

The graph is asserted rather than assumed because `student_status_history` is what
`GET /reports/funnel` is computed from (§5.4a), and a transition nobody legislated is a
row in that report nobody can explain.
"""

from __future__ import annotations

import pytest
from app.models.people import Student, StudentStatusHistory
from app.models.person import Person
from app.services.people.errors import RefusedError
from app.services.people.status import LEGAL_TRANSITIONS, StudentStatusService
from sqlalchemy import delete, select
from tests.people.conftest import T0


@pytest.fixture(autouse=True)
def _clear_student_status_history(app_session):
    """Clear StudentStatusHistory before each test to avoid cross-test contamination."""
    app_session.execute(delete(StudentStatusHistory))
    app_session.commit()
    yield
    app_session.execute(delete(StudentStatusHistory))
    app_session.commit()


@pytest.fixture
def a_student(app_session, studio):
    person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן")
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="lead")
    app_session.add(student)
    app_session.commit()
    return student


def test_a_transition_moves_the_student_and_records_the_move(app_session, a_student):
    StudentStatusService.transition(
        app_session, student=a_student, to_status="trial", at=T0, reason="booked online"
    )
    app_session.commit()

    assert a_student.status == "trial"
    row = app_session.execute(
        select(StudentStatusHistory).where(StudentStatusHistory.student_id == a_student.id)
    ).scalar_one()
    assert (row.from_status, row.to_status) == ("lead", "trial")
    assert row.changed_at == T0
    assert row.reason == "booked online"


def test_an_illegal_transition_is_refused_and_writes_nothing(app_session, a_student):
    # A lead has not attended anything. Jumping straight to `left` would put a departure
    # in the funnel for somebody who never arrived.
    with pytest.raises(RefusedError):
        StudentStatusService.transition(app_session, student=a_student, to_status="left", at=T0)
    app_session.rollback()

    assert a_student.status == "lead"
    assert app_session.execute(select(StudentStatusHistory)).first() is None


def test_a_transition_to_the_same_status_is_refused(app_session, a_student):
    """A no-op that still wrote history would inflate every funnel denominator by however
    many times somebody pressed the button twice."""
    with pytest.raises(RefusedError):
        StudentStatusService.transition(app_session, student=a_student, to_status="lead", at=T0)


def test_the_actor_is_recorded_when_there_is_one(app_session, a_student, as_manager):
    row = StudentStatusService.transition(
        app_session,
        student=a_student,
        to_status="trial",
        at=T0,
        actor_person_id=as_manager.person_id,
    )
    app_session.commit()
    assert row.changed_by_person_id == as_manager.person_id


def test_an_automated_transition_records_no_actor(app_session, a_student):
    """§5.4a -- 'No conversion after N days -> status=lost'. The job has no person behind
    it, and inventing one would make the audit trail lie about who decided."""
    StudentStatusService.transition(app_session, student=a_student, to_status="lost", at=T0)
    app_session.commit()
    assert a_student.status == "lost"


def test_every_status_in_the_graph_is_one_the_table_allows():
    """The CHECK constraint and this graph must agree, or a legal transition 500s on an
    IntegrityError instead of being refused with a message."""
    from app.models.people import STUDENT_STATUSES

    reachable = set(LEGAL_TRANSITIONS) | {s for v in LEGAL_TRANSITIONS.values() for s in v}
    assert reachable <= set(STUDENT_STATUSES)


def test_a_frozen_student_returns_to_active_and_not_anywhere_else(app_session, a_student):
    """§5.4's freeze 'retains the enrollment and the spot'. The only way out of `frozen`
    is back to `active` or out to `left` -- a frozen student who became a `lead` again
    would reappear at the top of the funnel."""
    assert LEGAL_TRANSITIONS["frozen"] == frozenset({"active", "left"})


def test_lost_and_left_are_terminal(app_session):
    """§5.4a: 'lost is a real outcome and not an absence of one.' A terminal state is what
    makes the funnel's denominator honest -- a student who can leave `lost` is a student
    who can be counted twice."""
    assert LEGAL_TRANSITIONS["lost"] == frozenset()
    assert LEGAL_TRANSITIONS["left"] == frozenset()


def test_history_survives_a_second_transition_in_order(app_session, a_student):
    StudentStatusService.transition(app_session, student=a_student, to_status="trial", at=T0)
    StudentStatusService.transition(
        app_session, student=a_student, to_status="pending_approval", at=T0
    )
    app_session.commit()
    rows = list(
        app_session.execute(
            select(StudentStatusHistory)
            .where(StudentStatusHistory.student_id == a_student.id)
            .order_by(StudentStatusHistory.created_at)
        ).scalars()
    )
    assert [(r.from_status, r.to_status) for r in rows] == [
        ("lead", "trial"),
        ("trial", "pending_approval"),
    ]
