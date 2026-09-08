"""`GET /me/training-plans` -- one row per child, for home's plan pill and the card's row.

**Why this route exists at all.** Home and the trainee card both need to name a child's
plan, and neither could get it from a read they already make. `/me/students` returns
`StudentSummaryOut`, which is the shape a coach receives from a list; invariant 3's detector
reads `price_plan_id` as financial, so a tuition amount on it would ride onto every screen
that happens to list students. And `GET /students/{id}/training-plan` computes a whole club
week per call, which home would pay once per child on every visit to draw a pill.

The properties under test are the two that a screen would otherwise get wrong quietly: a
child with no plan yields nulls rather than a zero, and `next_effective_on` comes from the
server's clock rather than the client's.
"""

from __future__ import annotations

from datetime import date

from app.models.people import Student
from app.models.person import Guardian, Person
from app.models.training_plan import PlanChange
from tests.billing.conftest import MONTHLY_AGOROT


def test_a_childs_plan_comes_back_named_and_priced(client, as_guardian_of, a_priced_student):
    """The pill's whole payload: which plan, what it costs, and how often they train."""
    caller = as_guardian_of(a_priced_student.student_id)

    body = client.get("/api/v1/me/training-plans", headers=caller.headers).json()

    assert len(body["items"]) == 1
    row = body["items"][0]
    assert row["student_id"] == str(a_priced_student.student_id)
    assert row["plan_name"] == "פעמיים בשבוע"
    assert row["monthly_amount_agorot"] == MONTHLY_AGOROT
    # C11's label, and the reason it is on the payload: the redesigned card draws its
    # cadence line from this rather than from the enforced allowance beside it.
    assert row["sessions_per_week"] == 2


def test_a_child_with_no_plan_yields_nulls_and_not_zero(
    client, as_guardian_of, app_session, studio
):
    """A `lead` has no price yet, and a pill drawn from an invented one is worse than none.

    Zero would render as ₪0 -- a price the club does not charge, on a screen a parent is
    expected to believe.
    """
    child = Person(studio_id=studio.id, first_name="ליד", last_name="בודק")
    app_session.add(child)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=child.id, status="lead", price_plan_id=None)
    app_session.add(student)
    app_session.flush()
    app_session.commit()
    caller = as_guardian_of(student.id, is_primary=True)

    row = client.get("/api/v1/me/training-plans", headers=caller.headers).json()["items"][0]

    assert row["price_plan_id"] is None
    assert row["plan_name"] is None
    assert row["monthly_amount_agorot"] is None
    assert row["sessions_per_week"] is None


def test_next_effective_on_is_the_first_of_next_month(client, as_guardian_of, a_priced_student):
    """The date a downgrade lands, computed by the SERVER.

    It is the day the worker will actually act on. A client deriving "the first of next
    month" from the device clock disagrees with the worker across a timezone boundary and at
    every month end -- which is a wrong date printed under a button a parent is pressing.
    """
    caller = as_guardian_of(a_priced_student.student_id)

    row = client.get("/api/v1/me/training-plans", headers=caller.headers).json()["items"][0]

    landed = date.fromisoformat(row["next_effective_on"])
    assert landed.day == 1
    assert landed > date.today()


def test_a_scheduled_change_comes_back_with_both_plan_names(
    client, as_guardian_of, app_session, studio, a_priced_student, a_price_plan
):
    """The banner says what is changing into what, and the client cannot fill that in.

    §5.15 CLOSES a plan rather than overwriting it, so a change scheduled before a
    re-pricing points at a plan the parent screen's option list no longer contains. Without
    the names on the payload the banner could only say "effective on <date>".
    """
    change = PlanChange(
        studio_id=studio.id,
        student_id=a_priced_student.student_id,
        from_price_plan_id=a_price_plan,
        to_price_plan_id=a_price_plan,
        effective_on=date(2026, 10, 1),
        requested_at=date.today(),
        status="scheduled",
    )
    app_session.add(change)
    app_session.commit()
    caller = as_guardian_of(a_priced_student.student_id)

    row = client.get("/api/v1/me/training-plans", headers=caller.headers).json()["items"][0]

    assert row["scheduled_change"]["to_plan_name"] == "פעמיים בשבוע"
    assert row["scheduled_change"]["from_plan_name"] == "פעמיים בשבוע"


def test_another_familys_child_is_not_in_my_list(
    client, as_guardian_of, app_session, studio, a_priced_student
):
    """Scoped by `for_guardian`, like every `/me/*` read. Nobody else's plan, and nobody
    else's price."""
    other_child = Person(studio_id=studio.id, first_name="אחר", last_name="בודק")
    app_session.add(other_child)
    app_session.flush()
    other = Student(studio_id=studio.id, person_id=other_child.id, status="active")
    app_session.add(other)
    app_session.flush()
    other_payer = Person(studio_id=studio.id, first_name="הורה", last_name="אחר")
    app_session.add(other_payer)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=other.id,
            person_id=other_payer.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    caller = as_guardian_of(a_priced_student.student_id)

    body = client.get("/api/v1/me/training-plans", headers=caller.headers).json()

    assert [row["student_id"] for row in body["items"]] == [str(a_priced_student.student_id)]


def test_a_signed_out_caller_gets_nothing(client):
    response = client.get("/api/v1/me/training-plans")
    assert response.status_code in (401, 403)
