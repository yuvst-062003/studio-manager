"""§5.9's award: the history row AND the cache, together. Artboard `12d`.

`student.current_belt_id` is a CACHE and `student_belt` is the record. §5.9 step 3 writes
both plus the exam result in one transaction, and the reason is that a promotion where one
of the two lands is a child whose card and whose timeline disagree -- which the parent sees
and nobody else does.

**A belt can be awarded without an exam** (`event_id` nullable): a coach awarding a stripe
at the end of a session is a real thing in a children's club, and requiring an event would
make managers invent fake ones. `events.belt.awardOutsideExam` is the string for it.

**The cache follows the HIGHEST rank held, not the last one awarded.** Back-filling a grade
a studio forgot to record is ordinary data entry, and a cache that followed write order
would demote the child.

**`color_hex` on a read is the rank's colour today.** `student_belt` has no colour column,
so a studio recolouring its ladder does rewrite what a child was given three years ago.
The contract's `StudentBeltOut` carries the field and its test asserts the field; the
snapshot that test's docstring argues for needs a migration, which is `main`'s. Pinned
below so the gap is a decision on the record rather than a surprise.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.models.people import Student
from app.models.person import Person
from sqlalchemy import select
from tests.belts.conftest import TODAY, YEAR_STARTS


def test_awarding_writes_the_history_row_and_the_cache_together(
    client, app_session, as_manager, a_student, a_belt_ladder
):
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(a_belt_ladder[1]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["belt_rank_name"] == "צהובה"
    assert body["color_hex"] == "#F7E017"
    assert body["awarded_by_person_id"] == str(as_manager.person_id)

    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id == a_belt_ladder[1]


def test_awarding_a_belt_notifies_the_guardians(
    client, app_session, as_manager, as_guardian_of, a_student, a_belt_ladder
):
    """§5.9 step 4 -- 'the guardians receive a notification' -- and the 2026-09-02 findings
    register's §2.2: this producer never existed, so `belt` was one of three preference
    switches (`app/models/comms.py:87-96`) that governed nothing because nothing was ever
    sent."""
    from app.models.comms import Notification

    guardian = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(a_belt_ladder[1]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 201, response.text

    notes = list(
        app_session.execute(
            select(Notification).where(
                Notification.person_id == guardian.person_id,
                Notification.kind == "belt.awarded",
            )
        ).scalars()
    )
    assert len(notes) == 1
    assert notes[0].payload["belt_rank_id"] == str(a_belt_ladder[1])


def test_a_belt_is_awarded_without_an_exam(client, as_lead_coach, a_student, a_belt_ladder):
    """§5.9, and `events.belt.awardOutsideExam`. A lead coach may do this -- §3.2's
    "Record belt exam results" row, and the `as_lead_coach` fixture's own docstring."""
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_lead_coach.headers,
        json={"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 201, response.text
    assert response.json()["event_id"] is None


def test_an_assistant_coach_awards_nothing(client, as_assistant_coach, a_student, a_belt_ladder):
    """§3.2 -- the assistant coach column is empty on "Record belt exam results"."""
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_assistant_coach.headers,
        json={"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 403


def test_the_same_rank_is_not_awarded_twice(client, as_manager, a_student, a_belt_ladder):
    """`uq_student_belt_student_rank`. A re-award is a data-entry mistake, and it would
    show the same belt twice on `12d`'s timeline."""
    payload = {"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()}
    first = client.post(
        f"/api/v1/students/{a_student}/belts", headers=as_manager.headers, json=payload
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f"/api/v1/students/{a_student}/belts", headers=as_manager.headers, json=payload
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "belt_already_awarded"


def test_the_cache_follows_the_highest_rank_not_the_latest_award(
    client, app_session, as_manager, a_student, a_belt_ladder
):
    """Back-filling a grade a studio forgot to record is ordinary. A cache that followed
    the write order would demote the child on the day someone tidied the records."""
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(a_belt_ladder[2]), "awarded_on": TODAY.isoformat()},
    )
    # ...then the older, lower grade, recorded afterwards.
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={
            "belt_rank_id": str(a_belt_ladder[0]),
            "awarded_on": YEAR_STARTS.isoformat(),
        },
    )
    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id == a_belt_ladder[2]


def test_the_history_is_a_timeline_oldest_first(client, as_manager, a_student, a_belt_ladder):
    """`12d` renders a timeline, and `ix_student_belt_student_id_awarded_on` is the index
    for it. Oldest first, because a progression is read in the direction it happened."""
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={
            "belt_rank_id": str(a_belt_ladder[0]),
            "awarded_on": date(2026, 9, 1).isoformat(),
        },
    )
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={
            "belt_rank_id": str(a_belt_ladder[1]),
            "awarded_on": date(2026, 11, 1).isoformat(),
        },
    )
    items = client.get(f"/api/v1/students/{a_student}/belts", headers=as_manager.headers).json()[
        "items"
    ]
    assert [row["belt_rank_name"] for row in items] == ["לבנה", "צהובה"]
    assert items[0]["awarded_on"] < items[1]["awarded_on"]


def test_a_recolour_rewrites_what_a_child_was_given(
    client, as_manager, a_class, a_student, a_belt_ladder
):
    """**A gap, pinned rather than papered over.**

    `tests/contracts/test_w4_schemas.py::test_a_belt_award_keeps_its_own_colour_so_history
    _survives_a_recolour` argues that carrying the colour on the award means a studio
    recolouring its ladder does not rewrite a child's past. `student_belt` has NO colour
    column, so the read joins `belt_rank` and returns today's value -- and it does. The
    contract test still passes because it asserts the field exists, not that it is a
    snapshot.

    Closing this needs `student_belt.color_hex`, which is a migration and therefore
    `main`'s. Asserted as the CURRENT behaviour so the day it changes, this test is what
    says so.
    """
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(a_belt_ladder[1]), "awarded_on": TODAY.isoformat()},
    )
    client.patch(
        f"/api/v1/belt-ranks/{a_belt_ladder[1]}",
        headers=as_manager.headers,
        json={
            "class_id": str(a_class),
            "name": "צהובה",
            "kyu": 5,
            "order_index": 1,
            "color_hex": "#ABCDEF",
            "secondary_color_hex": None,
        },
    )
    items = client.get(f"/api/v1/students/{a_student}/belts", headers=as_manager.headers).json()[
        "items"
    ]
    assert items[0]["color_hex"] == "#ABCDEF"


def test_a_guardian_reads_only_their_own_childs_history(
    client, app_session, as_guardian_of, a_student, studio, a_belt_ladder
):
    """`12d` is the parent's view of their own child's grading history and nobody else's."""
    other_person = Person(studio_id=studio.id, first_name="זר", last_name="בודק")
    app_session.add(other_person)
    app_session.flush()
    other = Student(
        studio_id=studio.id,
        person_id=other_person.id,
        status="active",
        joined_on=YEAR_STARTS,
    )
    app_session.add(other)
    app_session.commit()

    parent = as_guardian_of(a_student)
    assert (
        client.get(f"/api/v1/students/{a_student}/belts", headers=parent.headers).status_code == 200
    )
    assert (
        client.get(f"/api/v1/students/{other.id}/belts", headers=parent.headers).status_code == 403
    )


def test_a_guardian_cannot_award_a_belt(client, as_guardian_of, a_student, a_belt_ladder):
    """Reading is theirs; grading is not."""
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=parent.headers,
        json={"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 403


def test_an_award_naming_a_rank_that_does_not_exist_is_a_404(client, as_manager, a_student):
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(uuid.uuid4()), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 404
