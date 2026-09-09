"""Filing an existing plan under a class.

Every plan created before 2026-09-09 has no class, and after the owner's "it's per class --
a class can have no all-classes plan" decision, a plan with no class can be assigned to
NOBODY. That turned every plan a club already had into a dead row: the price editor would
not offer it, and nothing in the product could give it a class.

**Filing is not repricing, and that is the whole reason this is an edit at all.** §5.10 says
a plan is versioned rather than edited in place, so a price change CLOSES the old plan and
opens a new one -- because a charge raised last year must still be explicable by the plan
that raised it. Setting `class_id` changes no amount and no date. It records which class the
plan always priced, so last month's charges stay exactly as explicable as they were.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import PricePlan
from app.models.structure import Class as StudioClass
from sqlalchemy import select


@pytest.fixture
def two_classes(app_session, studio):
    judo = StudioClass(studio_id=studio.id, name="ג'ודו", is_active=True)
    karate = StudioClass(studio_id=studio.id, name="קראטה", is_active=True)
    app_session.add_all([judo, karate])
    app_session.commit()
    return judo.id, karate.id


def _plan(client, as_manager, name: str, class_id: uuid.UUID | None = None) -> dict:
    body = {
        "name": name,
        "sessions_per_week": 2,
        "monthly_amount_agorot": 32_000,
        "active_from": "2026-01-01",
    }
    if class_id is not None:
        body["class_id"] = str(class_id)
    response = client.post("/api/v1/price-plans", json=body, headers=as_manager.headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_a_manager_files_an_existing_plan_under_a_class(
    client, app_session, studio, two_classes, as_manager
):
    """The plan a club already had, made usable again."""
    judo_id, _ = two_classes
    plan = _plan(client, as_manager, "מנוי חופשי")
    assert plan["class_id"] is None

    filed = client.put(
        f"/api/v1/price-plans/{plan['id']}/class",
        json={"class_id": str(judo_id)},
        headers=as_manager.headers,
    )
    assert filed.status_code == 200, filed.text
    assert filed.json()["class_id"] == str(judo_id)

    listed = {
        row["id"]: row["class_id"]
        for row in client.get("/api/v1/price-plans", headers=as_manager.headers).json()["items"]
    }
    assert listed[plan["id"]] == str(judo_id)


def test_filing_a_plan_changes_no_money_and_no_dates(
    client, app_session, studio, two_classes, as_manager
):
    """The reason this is an edit rather than a new version.

    §5.10 versions a plan so a price change never rewrites history. Filing touches neither
    the amount nor `active_from`/`active_to`, so the charges this plan already raised stay
    explicable by it -- which is the property versioning exists to protect.
    """
    judo_id, _ = two_classes
    plan = _plan(client, as_manager, "פעמיים בשבוע")

    client.put(
        f"/api/v1/price-plans/{plan['id']}/class",
        json={"class_id": str(judo_id)},
        headers=as_manager.headers,
    )
    app_session.expire_all()
    row = app_session.execute(
        select(PricePlan).where(PricePlan.id == uuid.UUID(plan["id"]))
    ).scalar_one()
    assert row.monthly_amount_agorot == 32_000
    assert row.active_from.isoformat() == "2026-01-01"
    assert row.active_to is None
    # And it is still ONE plan -- filing must not fork a second version. Scoped to THIS
    # studio: `app_session` is unscoped, so a bare name match counts every other test's
    # plans too, and the assertion would then pass or fail for reasons that have nothing
    # to do with filing.
    assert (
        len(
            app_session.execute(
                select(PricePlan).where(
                    PricePlan.studio_id == studio.id, PricePlan.name == "פעמיים בשבוע"
                )
            )
            .scalars()
            .all()
        )
        == 1
    )


def test_a_plan_can_be_unfiled_again(client, app_session, studio, two_classes, as_manager):
    """`class_id: null` puts it back. A manager who files judo's plan under karate by
    mistake needs a way out that is not "create a third plan"."""
    judo_id, _ = two_classes
    plan = _plan(client, as_manager, "אימון בשבוע", judo_id)
    assert plan["class_id"] == str(judo_id)

    unfiled = client.put(
        f"/api/v1/price-plans/{plan['id']}/class",
        json={"class_id": None},
        headers=as_manager.headers,
    )
    assert unfiled.status_code == 200, unfiled.text
    assert unfiled.json()["class_id"] is None


def test_a_plan_cannot_be_filed_under_another_studios_class(
    client, app_session, studio, as_manager
):
    """The tenant filter makes another studio's class invisible, so this is 404 rather than
    403 -- a 403 would confirm the other club's class is real."""
    other = StudioClass(studio_id=uuid.uuid4(), name="חוג של מישהו אחר", is_active=True)
    plan = _plan(client, as_manager, "מסלול")

    response = client.put(
        f"/api/v1/price-plans/{plan['id']}/class",
        json={"class_id": str(other.id or uuid.uuid4())},
        headers=as_manager.headers,
    )
    assert response.status_code == 404, response.text


def test_filing_an_unknown_plan_is_not_found(client, studio, two_classes, as_manager):
    judo_id, _ = two_classes
    response = client.put(
        f"/api/v1/price-plans/{uuid.uuid4()}/class",
        json={"class_id": str(judo_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 404


def test_a_coach_may_not_file_a_plan(client, studio, two_classes, as_lead_coach, as_manager):
    """Invariant 3 -- a coach has no financial write, and a plan's class decides which
    children it bills."""
    judo_id, _ = two_classes
    plan = _plan(client, as_manager, "מסלול")
    response = client.put(
        f"/api/v1/price-plans/{plan['id']}/class",
        json={"class_id": str(judo_id)},
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403
