"""§7's `/public/*`. Unauthenticated, on the open internet, and shaped for that.

The leak tests carry the weight. A landing page that returned a coach's name, an enrollment
count or an internal id would be publishing the club's roster to anyone who guessed a slug
-- and the slug is printed on a flyer.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.structure import Group
from tests.people.conftest import FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)


@pytest.fixture
def with_slots(monkeypatch, studio, a_group, a_training_year):
    """Patch the router's own reader factory -- the seam the route actually resolves
    through -- rather than the shared service class."""
    import app.routers.public as public_router

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in (SUNDAY, WEDNESDAY)
    ]
    monkeypatch.setattr(public_router, "schedule_reader", lambda: fake)
    return fake


# -- the shop window -----------------------------------------------------------


def test_the_landing_page_needs_no_token(client, studio, a_group, with_slots):
    """§5.4a -- the link goes on Instagram and on a flyer QR. A sign-in wall in front of it
    is a marketing asset nobody can read."""
    response = client.get(f"/api/v1/public/studios/{studio.slug}/landing")
    assert response.status_code == 200
    assert response.json()["studio_name"] == studio.name


def test_an_unknown_slug_is_404_and_says_nothing_else(client):
    response = client.get(f"/api/v1/public/studios/no-such-{uuid.uuid4().hex[:6]}/landing")
    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "no such club"


def test_a_suspended_studio_is_invisible(client, app_session, studio, with_slots):
    """§18.3's suspend action. A suspended club whose landing page still takes bookings is
    a suspension that suspended nothing."""
    studio.status = "suspended"
    app_session.commit()
    assert client.get(f"/api/v1/public/studios/{studio.slug}/landing").status_code == 404


def test_the_landing_payload_carries_no_staff_no_counts_and_no_internal_ids(
    client, studio, a_group, a_class, with_slots
):
    body = client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()
    serialized = str(body)
    assert str(a_class) not in serialized
    for forbidden in ("coach", "staff", "enrollment", "student_count", "class_id"):
        assert forbidden not in serialized


def test_only_active_groups_are_offered(client, app_session, studio, a_group, a_class, with_slots):
    """An inactive group is one the club stopped running. Offering a trial in it books a
    child into a class that does not happen."""
    retired = Group(studio_id=studio.id, class_id=a_class, name="קבוצה שנסגרה", is_active=False)
    app_session.add(retired)
    app_session.commit()

    names = [
        group["name"]
        for group in client.get(f"/api/v1/public/studios/{studio.slug}/groups").json()["items"]
    ]
    assert "קבוצה שנסגרה" not in names


def test_a_group_carries_its_age_range_so_the_page_can_filter_by_the_childs_age(
    client, studio, a_group, with_slots
):
    """§5.4a step 2 -- 'groups filtered by the child's age where age_min/age_max are set'.
    The filtering is the client's; the range has to travel for it to be possible."""
    groups = client.get(f"/api/v1/public/studios/{studio.slug}/groups").json()["items"]
    group = next(g for g in groups if uuid.UUID(g["id"]) == a_group)
    assert (group["age_min"], group["age_max"]) == (5, 8)


def test_a_group_carries_the_days_it_trains(client, studio, a_group, with_slots):
    """Parent `13a` shows 'מתאמנים בימים' beside each group, observed through the seam."""
    groups = client.get(f"/api/v1/public/studios/{studio.slug}/groups").json()["items"]
    group = next(g for g in groups if uuid.UUID(g["id"]) == a_group)
    assert group["training_weekdays"] == [0, 3]


def test_the_studio_route_and_the_landing_route_agree(client, studio, with_slots):
    """§7 lists both. Two shapes to keep in step would be two chances to drift."""
    a = client.get(f"/api/v1/public/studios/{studio.slug}").json()
    b = client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()
    assert a == b


def test_the_logo_url_points_at_the_public_route_not_the_tenant_scoped_one(
    client, app_session, studio, with_slots
):
    """`app/services/structure/logo.py::logo_url()` returns `/api/v1/studio/logo`, which
    needs a token. A stranger on a flyer link has none, so the shop window gets its own
    unauthenticated route."""
    studio.logo_object_key = "studios/logo.png"
    app_session.commit()
    body = client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()
    assert body["logo_url"] == f"/api/v1/public/studios/{studio.slug}/logo"
    assert "/api/v1/studio/logo" not in str(body)


def test_a_club_with_no_logo_reports_none_rather_than_a_broken_link(client, studio, with_slots):
    assert client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()["logo_url"] is None


# -- the slot picker -----------------------------------------------------------


def test_trial_slots_come_through_the_schedule_seam(client, a_group, with_slots):
    """L5 -- the picker is a pure reader."""
    body = client.get(f"/api/v1/public/groups/{a_group}/trial-slots").json()
    assert [slot["starts_at"][:10] for slot in body["items"]] == ["2026-09-06", "2026-09-09"]


def test_a_cancelled_session_is_offered_but_not_bookable(
    client, monkeypatch, studio, a_group, a_training_year
):
    """§5.4 -- 'the picker greys out a slot rather than hiding it, so a parent can see the
    class exists and pick a different week instead of concluding there is nothing.'"""
    import app.routers.public as public_router

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=SUNDAY,
            status="cancelled",
        )
    ]
    monkeypatch.setattr(public_router, "schedule_reader", lambda: fake)

    slot = client.get(f"/api/v1/public/groups/{a_group}/trial-slots").json()["items"][0]
    assert slot["is_bookable"] is False


def test_a_trial_slot_carries_no_staff_and_no_attendance():
    """`TrialSlotOut` is a narrower projection of `SessionOut` for exactly this reason --
    'a public landing page has no business knowing which coach is on the mat.'"""
    from app.schemas.schedule import TrialSlotOut

    forbidden = {
        "staff",
        "attendance_taken",
        "training_year_id",
        "location_id",
        "is_manually_edited",
    }
    assert forbidden.isdisjoint(TrialSlotOut.model_fields)


def test_an_inactive_group_offers_no_slots(client, app_session, studio, a_class, with_slots):
    """The studio is resolved through the group, and an inactive group resolves to nothing
    -- so a link to a retired class 404s rather than quietly booking into it."""
    retired = Group(studio_id=studio.id, class_id=a_class, name="ישן", is_active=False)
    app_session.add(retired)
    app_session.commit()
    assert client.get(f"/api/v1/public/groups/{retired.id}/trial-slots").status_code == 404


def test_an_unknown_group_is_404(client, with_slots):
    assert client.get(f"/api/v1/public/groups/{uuid.uuid4()}/trial-slots").status_code == 404


def test_trial_slots_503_until_the_schedule_lane_lands(client, a_group):
    """L5's seam surfaced honestly, with no reader patched in.
    `.claude/rules/api.md` -- 'Never leak stack traces.' Delete when M2 merges."""
    response = client.get(f"/api/v1/public/groups/{a_group}/trial-slots")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "schedule_unavailable"


# -- what the tag must not say -------------------------------------------------


def test_no_public_route_is_tagged_coach():
    """The `coach` tag is a promise about invariant 3's guard. An unauthenticated router is
    not a coach router, and tagging it would blur what the tag means."""
    from app.main import app

    for path, operations in app.openapi()["paths"].items():
        if not path.startswith("/api/v1/public/"):
            continue
        for operation in operations.values():
            assert "coach" not in (operation.get("tags") or []), path


def test_every_public_route_is_reachable_without_a_token(client, studio, a_group, with_slots):
    """The whole point. One forgotten dependency turns the shop window into a 401, and
    nobody notices until a parent taps a flyer."""
    for path in (
        f"/api/v1/public/studios/{studio.slug}",
        f"/api/v1/public/studios/{studio.slug}/landing",
        f"/api/v1/public/studios/{studio.slug}/groups",
        f"/api/v1/public/groups/{a_group}/trial-slots",
    ):
        assert client.get(path).status_code == 200, path
