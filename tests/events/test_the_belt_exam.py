"""§5.9's belt exam, which is an `event` with `type='belt_exam'`. Artboards `9d`, `4d`, `6b`.

**The transaction is the point.** §5.9 step 3: "A pass writes an `event_exam_result`,
creates a `student_belt` row, and updates `student.current_belt_id` — in one transaction."
So a failure anywhere in a batch must leave NONE of the three moved: a promotion where the
result landed and the belt did not is a child whose card and whose timeline disagree, and
the parent is the only person who sees it.

**A fail is recorded, not omitted.** §5.9's eligibility view needs to know a student was
examined and did not pass, because an absent row reads as "never examined" -- a different
conversation with a parent.

**Eligibility is rank and tenure, and nothing else.** `events.exam.eligibleHint` says
הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה, and `belt_rank` carries no threshold column.
Five artboards add an attendance percentage and two add a debt-or-declaration block; `6b`'s
own audit says that decision "belongs in the W4 contract commit, not in whichever lane
builds first", and W4's contract commit did not make it. So this lane REPORTS the evidence
and lets the manager decide, rather than inventing a threshold with nowhere to live -- and
the negatives below are what keep it that way.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.belts import BeltRank, StudentBelt
from app.models.events import EventExamResult
from app.models.people import Student
from sqlalchemy import select
from tests.events.conftest import T0, YEAR_STARTS


@pytest.fixture
def a_ladder(app_session, studio, a_class):
    """Two rungs. `a_belt_ladder` lives in tests/belts/conftest.py and this is the events
    lane's side of the same domain -- the two conftests are deliberately separate."""
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
    ]
    app_session.add_all(ranks)
    app_session.commit()
    return [rank.id for rank in ranks]


@pytest.fixture
def an_exam(client, app_session, as_manager, studio, a_student, a_group, a_ladder):
    """A published belt_exam naming one student directly.

    §5.9 step 1 -- "nominates candidates (targeting students directly rather than whole
    groups)". That is why the target is a `student` row and not the group's.

    The student is also enrolled, because a child with no belt yet is eligible for the
    first rung of the ladder of the class they train in -- and the enrolment is the only
    edge between a student and a class (§4.3 puts `class_id` on `group`).
    """
    from app.models.people import Enrollment

    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_student,
            group_id=a_group,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()

    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "belt_exam",
            "title": "מבחן סתיו",
            "starts_at": T0.replace(day=26, hour=15).isoformat(),
            "targets": [{"target_type": "student", "target_id": str(a_student)}],
        },
    ).json()
    client.post(f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers)
    return created["id"]


def _award(client, headers, student_id, rank_id, on):
    response = client.post(
        f"/api/v1/students/{student_id}/belts",
        headers=headers,
        json={"belt_rank_id": str(rank_id), "awarded_on": on.isoformat()},
    )
    assert response.status_code == 201, response.text


def test_a_candidate_with_no_belt_is_eligible_for_the_first_rank(
    client, as_manager, an_exam, a_student
):
    """Where every child starts -- `events.belt.none` is the string. The first rung is the
    next one, and a white-belt child at their first exam is the common case."""
    response = client.get(f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    candidate = response.json()["items"][0]
    assert candidate["student_id"] == str(a_student)
    assert candidate["current_rank"] is None
    assert candidate["next_rank"]["name"] == "לבנה"
    # Not zero: zero months would read as "awarded today", which is a different fact from
    # having no rank at all.
    assert candidate["months_at_rank"] is None
    assert candidate["eligible"] is True


def test_a_candidate_at_the_top_of_the_ladder_is_not_eligible(
    client, as_manager, an_exam, a_student, a_ladder
):
    """`events.exam.notEligible` -- טרם זכאי. There is no rank above the one held, so there
    is nothing to be examined for. That is the whole definition of ineligible here."""
    _award(client, as_manager.headers, a_student, a_ladder[-1], YEAR_STARTS)
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    assert candidate["current_rank"]["name"] == "צהובה"
    assert candidate["next_rank"] is None
    assert candidate["eligible"] is False


def test_tenure_is_reported_in_months_rather_than_judged(
    client, as_manager, an_exam, a_student, a_ladder
):
    """`events.exam.eligibleHint` names the current rank and the time held in it.
    `belt_rank` has no `min_tenure_months` column, so there is no threshold to compare
    against and the honest answer is the evidence. `4d`'s ותק בחגורה column is this
    number."""
    _award(client, as_manager.headers, a_student, a_ladder[0], date(2026, 8, 12))
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    assert candidate["current_rank"]["name"] == "לבנה"
    assert candidate["next_rank"]["name"] == "צהובה"
    # T0 is 12 November 2026, so three whole calendar months. Counted the way a calendar
    # does, not as days/30 -- a parent counting "four months at this rank" counts months.
    assert candidate["months_at_rank"] == 3


def test_no_candidate_shape_carries_an_attendance_percentage_or_a_debt(client, as_manager, an_exam):
    """The cut, asserted as a NEGATIVE so it cannot come back quietly.

    Five artboards gate a promotion on attendance and two on debt or a missing declaration.
    None has a column -- and a debt figure would break §3.2's hard rule outright, on a
    screen a lead coach may open.
    """
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    banned = ("attendance", "debt", "balance", "declaration", "blocked", "agorot")
    assert not any(word in key for key in candidate for word in banned), sorted(candidate)


def test_a_pass_writes_the_result_the_belt_and_the_cache(
    client, app_session, as_lead_coach, an_exam, a_student, a_ladder
):
    """§5.9 step 3, all three writes. A lead coach records results (§3.2)."""
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(a_ladder[0]),
                    "result": "pass",
                    "note": "מצוין",
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    row = response.json()["items"][0]
    assert row["result"] == "pass"
    assert row["belt_rank_name"] == "לבנה"
    assert row["examiner_person_id"] == str(as_lead_coach.person_id)

    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id == a_ladder[0]
    belts = list(
        app_session.execute(
            select(StudentBelt).where(StudentBelt.student_id == a_student)
        ).scalars()
    )
    assert len(belts) == 1
    # The award is tied to the exam that produced it -- `12d`'s "previous exams" list is
    # what reads that link.
    assert belts[0].event_id == uuid.UUID(an_exam)


def test_a_fail_is_recorded_and_promotes_nothing(
    client, app_session, as_lead_coach, an_exam, a_student, a_ladder
):
    """§5.9's eligibility view needs to know a student was examined and did not pass. An
    absent row reads as "never examined" -- a different conversation with a parent."""
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(a_ladder[0]),
                    "result": "fail",
                    "note": None,
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id is None
    assert (
        app_session.execute(select(StudentBelt).where(StudentBelt.student_id == a_student)).first()
        is None
    )
    assert (
        app_session.execute(
            select(EventExamResult).where(EventExamResult.student_id == a_student)
        ).first()
        is not None
    )


def test_a_batch_that_fails_halfway_moves_nothing(
    client, app_session, as_lead_coach, an_exam, a_student, a_ladder
):
    """The transaction §5.9 asks for, asserted the only way it can be: one good result and
    one impossible one in the same call, and NOTHING written. A per-row commit would leave
    the first child promoted and the coach staring at a 409 on the second."""
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(a_ladder[0]),
                    "result": "pass",
                    "note": None,
                },
                {
                    "student_id": str(uuid.uuid4()),
                    "belt_rank_id": str(a_ladder[0]),
                    "result": "pass",
                    "note": None,
                },
            ]
        },
    )
    assert response.status_code in (404, 409)
    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id is None
    assert (
        app_session.execute(
            select(EventExamResult).where(EventExamResult.event_id == an_exam)
        ).first()
        is None
    )


def test_results_are_refused_on_an_event_that_is_not_a_belt_exam(
    client, as_lead_coach, an_event, a_student, a_registered_student
):
    """§5.9 -- a belt exam IS an event with `type='belt_exam'`. Recording a promotion
    against a competition would put a grading somewhere no eligibility screen looks."""
    from app.models.belts import BeltRank  # noqa: F401 -- documents the shape below

    response = client.post(
        f"/api/v1/events/{an_event}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(uuid.uuid4()),
                    "result": "pass",
                    "note": None,
                }
            ]
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_a_belt_exam"


def test_an_assistant_coach_cannot_record_a_result(client, as_assistant_coach, an_exam):
    """§3.2 -- "Record belt exam results | owner ✓ | manager ✓ | lead_coach ✓"."""
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_assistant_coach.headers,
        json={"results": []},
    )
    assert response.status_code == 403


def test_recording_the_same_candidate_twice_is_refused(
    client, as_lead_coach, an_exam, a_student, a_ladder
):
    """`uq_event_exam_result` is UNIQUE on (event_id, student_id). A correction is an edit
    of the existing row, not a second one -- and a second row would award a second belt."""
    payload = {
        "results": [
            {
                "student_id": str(a_student),
                "belt_rank_id": str(a_ladder[0]),
                "result": "pass",
                "note": None,
            }
        ]
    }
    first = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json=payload,
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json=payload,
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_examined"


def test_a_result_for_someone_who_is_not_a_candidate_is_refused(
    client, app_session, as_lead_coach, an_exam, studio, a_ladder
):
    """§5.9 step 1 nominates candidates. Grading someone the exam never named would put a
    belt on a child nobody examined."""
    from app.models.person import Person

    person = Person(studio_id=studio.id, first_name="לא", last_name="מועמד")
    app_session.add(person)
    app_session.flush()
    stranger = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(stranger)
    app_session.commit()

    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(stranger.id),
                    "belt_rank_id": str(a_ladder[0]),
                    "result": "pass",
                    "note": None,
                }
            ]
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_a_candidate"
