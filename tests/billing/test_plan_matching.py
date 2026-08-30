"""§5.10's self-service plan matching — the rule the doors with no manager behind them use.

The old rule required an EXACT `sessions_per_week` match with exactly one live plan, and
zero or two matches left the student unpriced. A club selling 1× / 2× / unlimited has no
plan labelled 3, so a child ticking three groups' worth of training was priced at nothing
and trained all year for free — recorded only in `billing_run.log`, which nothing reads.

The rule here is: the cheapest live plan that COVERS the volume; if none covers it, the
largest plan there is. Over-charging is a phone call within the month; under-charging to
zero is silence in both directions.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import PricePlan
from app.services.billing.catalogue import plan_for_volume
from tests.billing.conftest import TODAY


@pytest.fixture
def plans(app_session, studio):
    """The club the spec describes: 1× at 300, 2× at 400, unlimited at 550."""

    def _make(name: str, per_week: int | None, agorot: int, *, closed: bool = False) -> PricePlan:
        row = PricePlan(
            studio_id=studio.id,
            name=name,
            sessions_per_week=per_week,
            monthly_amount_agorot=agorot,
            active_from=TODAY.replace(day=1),
            active_to=TODAY if closed else None,
        )
        app_session.add(row)
        return row

    made = {
        "one": _make("פעם בשבוע", 1, 30_000),
        "two": _make("פעמיים בשבוע", 2, 40_000),
        "open": _make("מנוי חופשי", None, 55_000),
    }
    app_session.commit()
    return made


def test_an_exact_match_still_wins(tenant_session, studio, plans):
    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=2)
    assert chosen is not None
    assert chosen.id == plans["two"].id


def test_a_volume_no_plan_is_labelled_for_is_priced_at_the_cheapest_that_covers_it(
    tenant_session, studio, plans
):
    """Three sessions a week in a club selling 1 / 2 / unlimited. The old rule left this
    child unpriced and untouched by every billing run for the rest of the year."""
    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=3)
    assert chosen is not None
    assert chosen.id == plans["open"].id


def test_a_volume_beyond_every_plan_takes_the_largest_plan(tenant_session, app_session, studio):
    """No open-membership plan anywhere, and a child training four times a week. The
    largest package the club sells is the honest answer; nothing is not."""
    small = PricePlan(
        studio_id=studio.id,
        name="פעם בשבוע",
        sessions_per_week=1,
        monthly_amount_agorot=30_000,
        active_from=TODAY.replace(day=1),
    )
    large = PricePlan(
        studio_id=studio.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=40_000,
        active_from=TODAY.replace(day=1),
    )
    app_session.add_all([small, large])
    app_session.commit()

    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=4)
    assert chosen is not None
    assert chosen.id == large.id


def test_a_closed_plan_is_never_chosen(tenant_session, app_session, studio):
    """§5.10 versions plans by `active_from`/`active_to`. Last year's price is history."""
    closed = PricePlan(
        studio_id=studio.id,
        name="מחיר אשתקד",
        sessions_per_week=2,
        monthly_amount_agorot=20_000,
        active_from=TODAY.replace(day=1),
        active_to=TODAY,
    )
    live = PricePlan(
        studio_id=studio.id,
        name="מחיר השנה",
        sessions_per_week=2,
        monthly_amount_agorot=40_000,
        active_from=TODAY.replace(day=1),
    )
    app_session.add_all([closed, live])
    app_session.commit()

    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=2)
    assert chosen is not None
    assert chosen.id == live.id


def test_a_club_with_no_live_plans_leaves_the_student_unpriced(tenant_session, studio):
    """Unpriced is still possible, and defect 3's visibility is why that still matters. It
    just stops being the normal outcome of an ordinary timetable."""
    assert plan_for_volume(tenant_session, studio_id=studio.id, volume=2) is None


def test_two_plans_at_the_same_price_resolve_deterministically(tenant_session, app_session, studio):
    """A re-run must pick the same plan, or a family's price depends on row order."""
    first = PricePlan(
        studio_id=studio.id,
        name="א",
        sessions_per_week=2,
        monthly_amount_agorot=40_000,
        active_from=TODAY.replace(day=1),
    )
    second = PricePlan(
        studio_id=studio.id,
        name="ב",
        sessions_per_week=3,
        monthly_amount_agorot=40_000,
        active_from=TODAY.replace(day=1),
    )
    app_session.add_all([first, second])
    app_session.commit()

    expected = sorted([first, second], key=lambda plan: str(plan.id))[0]
    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=2)
    assert chosen is not None
    assert chosen.id == expected.id
    again = plan_for_volume(tenant_session, studio_id=studio.id, volume=2)
    assert again is not None
    assert again.id == chosen.id


def test_no_volume_means_no_plan(tenant_session, studio, plans):
    """A child with no training days has no weekly volume, and a price derived from
    nothing would be the cheapest plan in the club charged for no lessons."""
    assert plan_for_volume(tenant_session, studio_id=studio.id, volume=0) is None


def test_another_studios_plan_is_invisible(tenant_session, app_session, studio, plans):
    """The tenant filter, said out loud: pricing a child from another club's catalogue is
    the failure `TenantSession` fails closed to prevent."""
    from app.models.studio import Studio

    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    app_session.add(
        PricePlan(
            studio_id=other.id,
            name="זול",
            sessions_per_week=2,
            monthly_amount_agorot=1_000,
            active_from=TODAY.replace(day=1),
        )
    )
    app_session.commit()

    chosen = plan_for_volume(tenant_session, studio_id=studio.id, volume=2)
    assert chosen is not None
    assert chosen.id == plans["two"].id


# -- defect 3: unpriced children become visible --------------------------------
def test_the_unpriced_list_names_active_students_with_no_plan(
    client, as_manager, app_session, studio
):
    """§5.10's run appends to `tally.unpriced`, the tally lands in `billing_run.log`, and no
    router, worker or screen reads it. A child nobody can bill belongs in the same view as a
    child who has not paid — which is the collections screen, where a manager already goes to
    ask "who owes what"."""
    from app.models.people import Student
    from app.models.person import Guardian, Person

    child = Person(studio_id=studio.id, first_name="עומר", last_name="שגיא")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="שגיא")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        health_status="missing",
        joined_on=TODAY,
        price_plan_id=None,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            person_id=payer.id,
            student_id=student.id,
            relation="parent",
            is_primary=True,
        )
    )
    app_session.commit()

    response = client.get("/api/v1/billing/unpriced-students", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert [row["student_id"] for row in rows] == [str(student.id)]
    assert rows[0]["display_name"] == "עומר שגיא"
    assert rows[0]["payer_display_name"] == "הורה שגיא"


def test_a_priced_student_and_a_departed_one_are_not_on_the_unpriced_list(
    client, as_manager, app_session, studio, plans
):
    """Only `active`. A student who left owes the club nothing new, and listing them would
    make the manager's own checklist the thing nobody reads."""
    from app.models.people import Student
    from app.models.person import Person

    for name, status_value, plan_id in (
        ("מתומחר", "active", plans["two"].id),
        ("עזב", "left", None),
        ("ניסיון", "trial", None),
    ):
        person = Person(studio_id=studio.id, first_name=name, last_name="בדיקה")
        app_session.add(person)
        app_session.flush()
        app_session.add(
            Student(
                studio_id=studio.id,
                person_id=person.id,
                status=status_value,
                health_status="missing",
                joined_on=TODAY,
                left_on=TODAY if status_value == "left" else None,
                price_plan_id=plan_id,
            )
        )
    app_session.commit()

    rows = client.get(
        "/api/v1/billing/unpriced-students", headers=as_manager.headers
    ).json()["items"]
    assert rows == []


def test_a_coach_cannot_read_the_unpriced_list(client, as_lead_coach):
    """§3.2 gives a coach no financial read, and 'who is not being billed' is one."""
    response = client.get("/api/v1/billing/unpriced-students", headers=as_lead_coach.headers)
    assert response.status_code == 403
