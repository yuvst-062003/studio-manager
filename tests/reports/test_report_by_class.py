"""The monthly report, broken down per class.

Owner, 2026-09-09, choosing it from the per-class list: "Reports — per class." It is the
one place where per-class pricing changes a DECISION rather than a screen: judo and karate
now bill separately, so "what did each earn" is a question the club can finally ask.

Two things carry the weight here, and both are about not lying with a number:

  * A CHILD IN TWO CLASSES COUNTS ONCE IN EACH ROW AND ONCE IN THE TOTAL. Summing the rows
    to get the total would count that child twice -- and multi-class children are exactly
    the families this whole feature created. The total is its own DISTINCT, never a sum.
  * CHARGES WITH NO CLASS ARE SHOWN, NOT DROPPED. `charge.class_id` is nullable: a
    registration fee, a manual charge, and every tuition charge raised before per-class
    pricing all have none. Dropping them would make the rows silently fail to add up to the
    club's real income, which is the worst kind of wrong on a money screen.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import Charge
from app.models.people import Student
from app.models.person import Person
from app.models.structure import Class as StudioClass
from tests.reports.conftest import OCTOBER_PERIOD


@pytest.fixture
def two_classes(app_session, studio):
    judo = StudioClass(studio_id=studio.id, name="ג'ודו")
    karate = StudioClass(studio_id=studio.id, name="קראטה")
    app_session.add_all([judo, karate])
    app_session.commit()
    return judo.id, karate.id


@pytest.fixture
def a_student(app_session, studio):
    """A factory, not one student: most of these tests need two or three, and the point of
    several of them is who is counted twice and who is not."""

    def _make() -> uuid.UUID:
        tag = uuid.uuid4().hex[:8]
        person = Person(studio_id=studio.id, first_name="חניך", last_name=tag)
        app_session.add(person)
        app_session.flush()
        student = Student(studio_id=studio.id, person_id=person.id, status="active")
        app_session.add(student)
        app_session.commit()
        return student.id

    return _make


def _charge(
    app_session,
    studio,
    *,
    student_id: uuid.UUID,
    class_id: uuid.UUID | None,
    amount: int,
    status: str = "settled",
) -> None:
    year, month = OCTOBER_PERIOD
    # `payer_person_id` is NOT NULL -- every charge is owed BY somebody. A payer per charge
    # keeps the student/payer distinction honest: this report counts STUDENTS, and a shared
    # payer must never collapse two children into one.
    payer = Person(studio_id=studio.id, first_name="הורה", last_name=uuid.uuid4().hex[:6])
    app_session.add(payer)
    app_session.flush()
    app_session.add(
        Charge(
            studio_id=studio.id,
            student_id=student_id,
            payer_person_id=payer.id,
            kind="tuition",
            period_year=year,
            period_month=month,
            class_id=class_id,
            amount_agorot=amount,
            due_date=f"{year}-{month:02d}-10",
            status=status,
            # What the monthly billing run stamps, which is what these charges are.
            created_by="billing_run",
        )
    )
    app_session.commit()


def _by_class(client, as_manager):
    year, month = OCTOBER_PERIOD
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/by-class?year={year}&month={month}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_each_class_reports_its_own_students_and_money(
    client, app_session, studio, two_classes, a_student, as_manager
):
    judo_id, karate_id = two_classes
    _charge(app_session, studio, student_id=a_student(), class_id=judo_id, amount=32_000)
    _charge(app_session, studio, student_id=a_student(), class_id=judo_id, amount=32_000)
    _charge(app_session, studio, student_id=a_student(), class_id=karate_id, amount=22_000)

    rows = {row["class_name"]: row for row in _by_class(client, as_manager)["rows"]}
    assert rows["ג'ודו"]["students"] == 2
    assert rows["ג'ודו"]["total_agorot"] == 64_000
    assert rows["קראטה"]["students"] == 1
    assert rows["קראטה"]["total_agorot"] == 22_000


def test_a_child_in_two_classes_counts_once_in_the_total(
    client, app_session, studio, two_classes, a_student, as_manager
):
    """The number this report exists to get right.

    One child billed for judo AND karate is two charges and two class rows -- that is the
    feature working. They are still ONE student in the club, so a total built by adding the
    rows would report a membership the club does not have, growing with every family that
    takes a second discipline.
    """
    judo_id, karate_id = two_classes
    both = a_student()
    _charge(app_session, studio, student_id=both, class_id=judo_id, amount=32_000)
    _charge(app_session, studio, student_id=both, class_id=karate_id, amount=22_000)

    body = _by_class(client, as_manager)
    rows = {row["class_name"]: row for row in body["rows"]}
    assert rows["ג'ודו"]["students"] == 1
    assert rows["קראטה"]["students"] == 1
    # One human, two classes.
    assert body["total"]["students"] == 1
    assert sum(row["students"] for row in body["rows"]) == 2
    # Money DOES add up -- two charges are two real amounts.
    assert body["total"]["total_agorot"] == 54_000


def test_charges_with_no_class_are_reported_rather_than_dropped(
    client, app_session, studio, two_classes, a_student, as_manager
):
    """A registration fee, a manual charge, and every tuition charge raised before
    per-class pricing carry no class. If they vanished here the rows would not add up to
    the club's income and nobody could tell why."""
    judo_id, _ = two_classes
    _charge(app_session, studio, student_id=a_student(), class_id=judo_id, amount=32_000)
    _charge(app_session, studio, student_id=a_student(), class_id=None, amount=5_000)

    body = _by_class(client, as_manager)
    unassigned = [row for row in body["rows"] if row["class_id"] is None]
    assert len(unassigned) == 1
    assert unassigned[0]["total_agorot"] == 5_000
    assert body["total"]["total_agorot"] == 37_000


def test_the_money_splits_the_same_way_the_monthly_report_does(
    client, app_session, studio, two_classes, a_student, as_manager
):
    """Settled, overdue and pending mean here exactly what they mean on the monthly
    report. Two screens disagreeing about one month is how a manager stops trusting both.
    """
    judo_id, _ = two_classes
    _charge(
        app_session,
        studio,
        student_id=a_student(),
        class_id=judo_id,
        amount=32_000,
        status="settled",
    )
    _charge(
        app_session,
        studio,
        student_id=a_student(),
        class_id=judo_id,
        amount=18_000,
        status="open",
    )

    rows = {row["class_name"]: row for row in _by_class(client, as_manager)["rows"]}
    judo = rows["ג'ודו"]
    assert judo["settled_agorot"] == 32_000
    assert judo["total_agorot"] == 50_000
    # The open one is either overdue or pending, never both and never neither.
    assert judo["overdue_agorot"] + judo["pending_agorot"] == 18_000


def test_a_month_with_no_charges_is_empty_rather_than_absent(
    client, app_session, studio, two_classes, as_manager
):
    body = _by_class(client, as_manager)
    assert body["rows"] == []
    assert body["total"]["students"] == 0
    assert body["total"]["total_agorot"] == 0


def test_a_coach_may_not_read_it(client, fake_provider, app_session, studio, two_classes):
    """Invariant 3 — a coach has no financial read, and this is the club's income.

    The coach caller is built here rather than taken from a fixture: this suite only ever
    needed an owner and a manager, and adding a lane-wide fixture for one assertion would
    put a coach in every future report test's reach by accident.
    """
    from tests.reports.conftest import _make_caller

    coach = _make_caller(client, fake_provider, app_session, studio, role="lead_coach")
    year, month = OCTOBER_PERIOD
    response = client.get(
        f"/api/v1/reports/{coach.studio_id}/by-class?year={year}&month={month}",
        headers=coach.headers,
    )
    assert response.status_code == 403
