"""SPEC §5.15 — the training-year rollover wizard, end to end through its API.

**What is asserted here and what is asserted elsewhere.** Steps 1, 2 and 6 are W2 routes
with their own tests (`test_years_and_closures.py`, `test_materialization.py`); this file
does not re-prove that a closure cancels sessions. It proves the three things W6 added: the
bulk operations, the resumable state, and the two rules §5.15 states in words that a lane
could otherwise implement backwards -- **no automatic age-based promotion** and **old price
plans closed, not overwritten**.

The negatives carry the weight. A wizard that moves a child nobody asked it to move, or that
rewrites last year's price, fails in a way whose first symptom is a phone call from a parent.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.billing import PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.schedule.conftest import YEAR_STARTS

NEXT_STARTS = date(2027, 9, 1)
NEXT_ENDS = date(2028, 6, 30)


@pytest.fixture
def a_draft_year(app_session: Session, studio) -> uuid.UUID:
    """Next year, in `draft`. §5.15: "nothing is visible to guardians until it is
    activated", so a draft alongside the live year is the normal state of a rollover in
    progress -- and `uq_training_year_one_active` permits exactly that."""
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ח",
        starts_on=NEXT_STARTS,
        ends_on=NEXT_ENDS,
        status="draft",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def two_groups(app_session: Session, studio) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """A class and two groups: `(class_id, beginners, advanced)`."""
    klass = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(klass)
    app_session.flush()
    beginners = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים")
    advanced = Group(studio_id=studio.id, class_id=klass.id, name="מתקדמים")
    app_session.add_all([beginners, advanced])
    app_session.commit()
    return klass.id, beginners.id, advanced.id


@pytest.fixture
def an_enrolled_student(app_session: Session, studio, two_groups) -> uuid.UUID:
    """One live enrollment in the beginners group. Returns the enrollment id."""
    _class_id, beginners, _advanced = two_groups
    # A student is a ROLE over a person (§4.3), so the person comes first. Building the
    # student without one would fail on a non-null FK, and building it with a fabricated
    # `person_id` would test the rollover against a row the product cannot produce.
    person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן")
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="active")
    app_session.add(student)
    app_session.flush()
    enrollment = Enrollment(
        studio_id=studio.id,
        student_id=student.id,
        group_id=beginners,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(enrollment)
    app_session.commit()
    return enrollment.id


@pytest.fixture
def an_open_plan(app_session: Session, studio) -> uuid.UUID:
    row = PricePlan(
        studio_id=studio.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=25_000,
        registration_fee_agorot=5_000,
        active_from=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def _state(client, as_manager, year_id):
    response = client.get(f"/api/v1/rollover/{year_id}", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    return response.json()


# -- the wizard's state -------------------------------------------------------
def test_a_fresh_draft_year_resumes_at_closures_and_not_at_step_one(
    client, as_manager, a_draft_year
):
    """§5.15 calls the wizard resumable. Step 1 is answered by the year's own existence, so
    a manager returning to a draft lands on the first thing they have not done -- resuming at
    step 1 is starting over, which is what a resumable wizard exists to avoid."""
    body = _state(client, as_manager, a_draft_year)
    assert [step["id"] for step in body["steps"]] == [
        "year",
        "closures",
        "groups",
        "students",
        "prices",
        "generate",
        "announce",
    ]
    assert body["steps"][0]["status"] == "done"
    assert body["resume_at"] == "closures"
    assert body["complete"] is False


def test_acknowledging_a_step_moves_the_resume_point(client, as_manager, a_draft_year):
    """The five acknowledged steps exist because their correct outcome is frequently NO
    CHANGE -- a studio that ticks no holidays writes no closure rows. Without an ack, "did
    nothing" and "has not looked" are the same state and the wizard loops."""
    response = client.patch(
        f"/api/v1/rollover/{a_draft_year}/steps/closures",
        json={"status": "done"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["resume_at"] == "groups"

    # And it survives a fresh read — the whole point is that it is persisted, not held in
    # the tab the manager just closed.
    assert _state(client, as_manager, a_draft_year)["resume_at"] == "groups"


def test_a_step_can_be_reopened_after_being_ticked(client, as_manager, a_draft_year):
    """A one-way ratchet would send a manager back through the whole wizard to correct a
    single mis-press."""
    for status_value in ("done", "pending"):
        response = client.patch(
            f"/api/v1/rollover/{a_draft_year}/steps/groups",
            json={"status": status_value},
            headers=as_manager.headers,
        )
        assert response.status_code == 200, response.text
    statuses = {
        step["id"]: step["status"] for step in _state(client, as_manager, a_draft_year)["steps"]
    }
    assert statuses["groups"] == "pending"


def test_the_generate_step_cannot_be_ticked_by_hand(client, as_manager, a_draft_year):
    """The load-bearing refusal. A client that could mark generation done would let a manager
    activate a year with an empty calendar, and every parent would open the app to nothing.

    A 409 rather than a silent no-op, because a no-op leaves the screen and the server
    disagreeing about whether the year is ready.
    """
    response = client.patch(
        f"/api/v1/rollover/{a_draft_year}/steps/generate",
        json={"status": "done"},
        headers=as_manager.headers,
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "conflict"


def test_an_unknown_step_is_not_found(client, as_manager, a_draft_year):
    response = client.patch(
        f"/api/v1/rollover/{a_draft_year}/steps/weather",
        json={"status": "done"},
        headers=as_manager.headers,
    )
    assert response.status_code == 404


def test_another_studio_s_year_is_not_found_rather_than_forbidden(client, as_manager, app_session):
    """404 and never 403: a 403 confirms the row exists somewhere, which is a cross-tenant
    read with a polite error message."""
    response = client.get(f"/api/v1/rollover/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_reach_the_rollover_at_all(client, request, caller, a_draft_year):
    """§3.2 gives a coach no say in next year's groups, prices or enrollments. The READ is
    refused too, deliberately -- step 5 returns money, and invariant 3 is about what a coach
    can see, not only what they can change."""
    who = request.getfixturevalue(caller)
    assert client.get(f"/api/v1/rollover/{a_draft_year}", headers=who.headers).status_code == 403
    assert (
        client.post(
            f"/api/v1/rollover/{a_draft_year}/groups", json={}, headers=who.headers
        ).status_code
        == 403
    )


# -- step 3: groups -----------------------------------------------------------
def test_groups_are_renamed_retired_and_created_in_one_press(
    client, as_manager, app_session, studio, a_draft_year, two_groups
):
    class_id, beginners, advanced = two_groups
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/groups",
        json={
            "renames": [{"group_id": str(beginners), "name": "מתחילים א׳"}],
            "retire": [str(advanced)],
            "creates": [{"class_id": str(class_id), "name": "נבחרת", "age_min": 12}],
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"applied": 3, "refused": []}

    app_session.expire_all()
    assert app_session.get(Group, beginners).name == "מתחילים א׳"
    assert app_session.get(Group, advanced).is_active is False
    # `app_session` is NOT tenant-scoped — it is the raw fixture session, so every query
    # here must carry its own `studio_id`. Without it this read finds the demo studio's rows
    # and every other test's, and `scalar_one()` fails with MultipleResultsFound.
    created = app_session.execute(
        select(Group).where(Group.studio_id == studio.id, Group.name == "נבחרת")
    ).scalar_one()
    assert created.is_active is True and created.age_min == 12


def test_renaming_a_group_to_its_current_name_is_not_counted_as_a_change(
    client, as_manager, a_draft_year, two_groups
):
    """`applied` counts rows CHANGED. Inflating it would make the summary §5.15 step 6 asks
    for a fiction, and a manager reading "47 groups updated" after touching none would stop
    believing the number."""
    _class_id, beginners, _advanced = two_groups
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/groups",
        json={"renames": [{"group_id": str(beginners), "name": "מתחילים"}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 0


def test_a_missing_group_is_refused_by_row_and_the_rest_of_the_batch_still_applies(
    client, as_manager, app_session, a_draft_year, two_groups
):
    """Aborting on row 200 of 400 leaves the manager with 199 applied changes, no list of
    them, and a screen that has to be re-driven from an unknown state."""
    _class_id, beginners, _advanced = two_groups
    ghost = uuid.uuid4()
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/groups",
        json={
            "renames": [
                {"group_id": str(ghost), "name": "רפאים"},
                {"group_id": str(beginners), "name": "מתחילים ב׳"},
            ]
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["applied"] == 1
    assert payload["refused"] == [{"id": str(ghost), "reason": "not_found"}]
    app_session.expire_all()
    assert app_session.get(Group, beginners).name == "מתחילים ב׳"


def test_retiring_and_reviving_the_same_group_in_one_press_is_rejected(
    client, as_manager, a_draft_year, two_groups
):
    """Not a refusal row — a 422. The two lists contradict each other, so there is no
    coherent batch to partially apply and no row to name as the culprit."""
    _class_id, beginners, _advanced = two_groups
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/groups",
        json={"retire": [str(beginners)], "revive": [str(beginners)]},
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


# -- step 4: students ---------------------------------------------------------
def test_a_move_ends_the_old_enrollment_and_opens_a_new_one(
    client, as_manager, app_session, a_draft_year, two_groups, an_enrolled_student
):
    """A move is an end plus a start, never `UPDATE enrollment SET group_id`.

    Rewriting the group in place would erase the fact that the child trained in the old one
    -- which is the record attendance, belts and last year's charges all hang from.
    """
    _class_id, _beginners, advanced = two_groups
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/students",
        json={"moves": [{"enrollment_id": str(an_enrolled_student), "to_group_id": str(advanced)}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 1

    app_session.expire_all()
    old = app_session.get(Enrollment, an_enrolled_student)
    assert old.status == "ended"
    # The day before the new year starts: no gap and no overlap, so "which group was this
    # child in on date D" has exactly one answer for every D.
    assert old.ended_on == date(2027, 8, 31)

    new = app_session.execute(
        select(Enrollment).where(
            Enrollment.student_id == old.student_id, Enrollment.ended_on.is_(None)
        )
    ).scalar_one()
    assert new.group_id == advanced
    assert new.started_on == NEXT_STARTS
    # C12's per-day pattern does not survive a move: the destination group very likely trains
    # on different days, and carrying the old weekdays across would silently enroll the child
    # for days the new group does not meet.
    assert new.attends_weekdays is None


def test_a_student_not_returning_is_ended_and_not_deleted(
    client, as_manager, app_session, a_draft_year, an_enrolled_student
):
    """G15 in spirit: a child who left is a fact about last year, not an absence of one.
    Attendance, belts and charges all point at this row."""
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/students",
        json={"not_returning": [str(an_enrolled_student)]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    app_session.expire_all()
    row = app_session.get(Enrollment, an_enrolled_student)
    assert row is not None
    assert row.status == "ended" and row.ended_on == date(2027, 8, 31)


def test_moving_a_student_into_a_retired_group_is_refused(
    client, as_manager, app_session, a_draft_year, two_groups, an_enrolled_student
):
    """Retiring a group and moving children into it in the same rollover is a mis-click, not
    an intention: the resulting enrollment would generate no sessions at all next year,
    because step 6 skips inactive groups."""
    _class_id, _beginners, advanced = two_groups
    app_session.get(Group, advanced).is_active = False
    app_session.commit()

    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/students",
        json={"moves": [{"enrollment_id": str(an_enrolled_student), "to_group_id": str(advanced)}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["applied"] == 0
    assert payload["refused"] == [{"id": str(an_enrolled_student), "reason": "destination_retired"}]


def test_the_students_step_never_promotes_anyone_by_age(
    client, as_manager, app_session, a_draft_year, two_groups, an_enrolled_student
):
    """§5.15 step 4, in as many words: "**no automatic age-based promotion in v1**".

    The assertion is that an EMPTY press changes nothing. A child moved up a group without a
    human saying so is a conversation with a parent that nobody in the office knows happened,
    and this is the test that fails if someone later adds a helpful rule.
    """
    _class_id, beginners, _advanced = two_groups
    before = app_session.get(Enrollment, an_enrolled_student).group_id

    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/students", json={}, headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"applied": 0, "refused": []}

    app_session.expire_all()
    after = app_session.get(Enrollment, an_enrolled_student)
    assert after.group_id == before == beginners
    assert after.ended_on is None
    assert (
        app_session.execute(select(Enrollment).where(Enrollment.student_id == after.student_id))
        .scalars()
        .all()
        .__len__()
        == 1
    )


def test_moving_and_ending_the_same_enrollment_is_rejected(
    client, as_manager, a_draft_year, two_groups, an_enrolled_student
):
    _class_id, _beginners, advanced = two_groups
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/students",
        json={
            "moves": [{"enrollment_id": str(an_enrolled_student), "to_group_id": str(advanced)}],
            "not_returning": [str(an_enrolled_student)],
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


# -- step 5: prices -----------------------------------------------------------
def test_a_repricing_closes_the_old_plan_and_opens_a_successor(
    client, as_manager, app_session, studio, a_draft_year, an_open_plan
):
    """§5.15 step 5: "**Old plans are closed, not overwritten.**"

    The old plan keeping its old amount is the assertion that matters. Editing the amount in
    place would silently restate what every family was charged last year, including on
    statements they have already read.
    """
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/prices",
        json={"repricings": [{"plan_id": str(an_open_plan), "monthly_amount_agorot": 27_000}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 1

    app_session.expire_all()
    old = app_session.get(PricePlan, an_open_plan)
    assert old.monthly_amount_agorot == 25_000, "last year's price must not be rewritten"
    assert old.active_to == date(2027, 8, 31)

    # Scoped to this studio: `app_session` is the raw fixture session with no tenant filter,
    # and the demo studio ships open plans of its own.
    successor = app_session.execute(
        select(PricePlan).where(
            PricePlan.studio_id == studio.id, PricePlan.active_to.is_(None)
        )
    ).scalar_one()
    assert successor.id != old.id
    assert successor.monthly_amount_agorot == 27_000
    assert successor.active_from == NEXT_STARTS
    assert successor.sessions_per_week == old.sessions_per_week
    # Omitting the fee means INHERIT, which is different from sending 0.
    assert successor.registration_fee_agorot == 5_000


def test_a_plan_whose_amount_is_unchanged_opens_no_successor(
    client, as_manager, app_session, a_draft_year, an_open_plan
):
    """No rise is a real and common answer. A successor plan per year per plan, identical to
    its parent, is a price list nobody can read by year three."""
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/prices",
        json={"repricings": [{"plan_id": str(an_open_plan), "monthly_amount_agorot": 25_000}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 0
    app_session.expire_all()
    assert app_session.get(PricePlan, an_open_plan).active_to is None


def test_money_is_agorot_and_a_negative_amount_is_rejected(
    client, as_manager, a_draft_year, an_open_plan
):
    """G1. A negative monthly amount is a plan that pays the family to attend."""
    response = client.post(
        f"/api/v1/rollover/{a_draft_year}/prices",
        json={"repricings": [{"plan_id": str(an_open_plan), "monthly_amount_agorot": -1}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- the whole wizard ---------------------------------------------------------
def test_the_wizard_reads_complete_only_once_every_step_is_answered(
    client, as_manager, app_session, a_draft_year, two_groups, an_open_plan
):
    """`complete` gates activation on the screen, so it has to be true exactly when §5.15's
    seven steps are all answered -- with `skipped` counting, because step 7 is optional in as
    many words and a wizard that will not finish without an announcement trains people to
    send announcements they did not want to send."""
    for step in ("closures", "groups", "students", "prices"):
        assert (
            client.patch(
                f"/api/v1/rollover/{a_draft_year}/steps/{step}",
                json={"status": "done"},
                headers=as_manager.headers,
            ).status_code
            == 200
        )
    # Step 6 is still pending: nothing has been generated.
    assert _state(client, as_manager, a_draft_year)["complete"] is False

    _class_id, beginners, _advanced = two_groups
    generated = client.post(
        f"/api/v1/training-years/{a_draft_year}/generate-sessions",
        headers=as_manager.headers,
    )
    assert generated.status_code == 200, generated.text

    client.patch(
        f"/api/v1/rollover/{a_draft_year}/steps/announce",
        json={"status": "skipped"},
        headers=as_manager.headers,
    )
    body = _state(client, as_manager, a_draft_year)
    statuses = {step["id"]: step["status"] for step in body["steps"]}
    assert statuses["announce"] == "skipped"
    # `generate` is derived, and with no schedule rules on the group it produced no sessions
    # — so the wizard correctly still refuses to call itself complete.
    assert statuses["generate"] == ("done" if body["sessions_generated"] else "pending")
    assert body["complete"] is (body["sessions_generated"] > 0)
