"""§6.1's offline priming payload and §10.6's cache bound, over HTTP.

§6.1: "**Offline priming is not optional.** A coach whose very first session is in a
basement with no signal must already have the roster. The first launch blocks on this fetch
with a short progress indicator, and it re-runs on every foreground resume."

So this file asserts the property the blocking fetch depends on: **one round trip is
enough**. A field the roster needs that is not in this response is a field that is blank in
a basement.
"""

from __future__ import annotations

from datetime import timedelta

from app.services.attendance.bootstrap import CACHE_WINDOW_DAYS, clamp_window
from tests.attendance.conftest import T0, TODAY, make_session

BOOTSTRAP = "/api/v1/sync/bootstrap"


def test_the_window_defaults_to_today_and_tomorrow(client, as_lead_coach, a_session):
    """§6.1's window verbatim: "today's and tomorrow's sessions with full rosters". A first
    launch has no watermark to compute a range from, so the default lives on the server
    rather than in every client."""
    response = client.get(BOOTSTRAP, headers=as_lead_coach.headers)
    assert response.status_code == 200
    body = response.json()
    assert [s["id"] for s in body["sessions"]] == [str(a_session)]


def test_the_payload_carries_the_roster_for_every_session_it_returns(
    client, as_lead_coach, a_session, an_enrolled_student
):
    """One round trip. A roster fetched per session is a roster that is blank in a
    basement, which is the one place this payload matters."""
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    roster = body["rosters"][str(a_session)]
    assert [row["student_id"] for row in roster] == [str(an_enrolled_student)]
    assert roster[0]["status"] == "unmarked"


def test_the_roster_carries_the_seam_fields_so_the_badge_renders_offline(
    client, as_lead_coach, a_session, an_enrolled_student
):
    """Plan §1.3 seam 4. §5.5's `⚠ הצהרת בריאות חסרה` has to render with no network, so
    `health_status` and `derived_flags` are ON this payload rather than fetched — a badge
    that needs a second request is a badge that is blank exactly where the warning matters."""
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    row = body["rosters"][str(a_session)][0]
    assert row["health_status"] == "missing"
    assert row["derived_flags"] == {}


def test_server_time_comes_from_the_dev_clock_so_skew_is_detectable(client, as_lead_coach):
    """§10.5 resolves conflicts on `device_marked_at`, and a device whose clock is an hour
    out would win or lose every conflict for the wrong reason. `server_time` is what the
    client compares against, and `X-Dev-Now` is what makes that testable at all."""
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    assert body["server_time"].startswith("2026-11-03T12:00:00")


def test_a_window_wider_than_two_days_is_clamped_and_says_so(
    client, app_session, studio, a_group, a_training_year, as_lead_coach, a_session
):
    """§10.6 — "two days of sessions, evicted oldest-first". Clamped rather than rejected: a
    client whose watermark is a week old asks for a week, and a 400 would leave it with no
    cache at all. `to_time` tells it which two days it actually got."""
    far = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(days=5),
    )
    app_session.add(far)
    app_session.commit()

    response = client.get(
        BOOTSTRAP,
        params={"from": TODAY.isoformat(), "to": (TODAY + timedelta(days=7)).isoformat()},
        headers=as_lead_coach.headers,
    )
    body = response.json()
    assert [s["id"] for s in body["sessions"]] == [str(a_session)]
    assert body["to_time"] < (T0 + timedelta(days=5)).isoformat()


def test_clamp_window_is_two_days_inclusive():
    """The bound as a unit, so the constant and the arithmetic cannot drift apart: `from`
    and `from + 1` are two days, not three."""
    start, end = clamp_window(TODAY, TODAY + timedelta(days=30))
    assert (end - start).days == CACHE_WINDOW_DAYS - 1


def test_an_inverted_window_is_not_an_error(client, as_lead_coach):
    """A client whose clock jumped backwards asks for `to < from`. It gets one day rather
    than a 500 — §10.3's principle applied to a read: nothing about a confused device may
    cost a coach their roster."""
    start, end = clamp_window(TODAY, TODAY - timedelta(days=3))
    assert start == end


def test_a_guardian_sees_only_their_own_childrens_sessions(
    client, app_session, studio, a_session, as_guardian
):
    """§10.2 — the parent app caches "upcoming sessions" read-only. Same payload, narrowed:
    the guardian fixture holds a `guardian` row pointing at a student who is enrolled
    nowhere, so the correct answer is nothing at all rather than the club's calendar."""
    body = client.get(BOOTSTRAP, headers=as_guardian.headers).json()
    assert body["sessions"] == []
    assert body["rosters"] == {}


def test_a_coach_is_primed_with_the_whole_studios_two_days(
    client, app_session, studio, a_group, a_training_year, as_lead_coach, assign_coach, a_session
):
    """§5.6's substitution rule is the reason this is not narrowed to the coach's own
    sessions. A coach covering for a colleague is told by push — the one notice that does
    not arrive in a basement — and priming only their assigned sessions leaves the
    substitute in front of a class with no roster. A club's two days is tens of KB (§10.6),
    so the wider scope costs nothing."""
    other_group_session = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(hours=3),
    )
    app_session.add(other_group_session)
    app_session.commit()
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    assert len(body["sessions"]) == 2


def test_another_studios_sessions_never_appear(client, as_lead_coach, other_studio_session_id):
    """The tenant filter fails closed, so this is invisible rather than forbidden."""
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    assert str(other_studio_session_id) not in {s["id"] for s in body["sessions"]}


def test_an_anonymous_caller_gets_401(client):
    assert client.get(BOOTSTRAP).status_code == 401


def test_the_payload_carries_no_financial_field(
    client, as_lead_coach, a_session, an_enrolled_student
):
    """SPEC §13 invariant 3, asserted against the real response body and not only against
    the schema. `BootstrapPayload` is the largest coach-reachable payload in the product."""
    body = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    serialized = repr(body)
    for token in ("agorot", "balance", "charge", "debt", "price_plan"):
        assert token not in serialized


def test_attendance_taken_reflects_the_roster_the_payload_already_holds(
    client, app_session, studio, a_session, an_enrolled_student, as_lead_coach
):
    """D5's session block "surfaces coverage and completion — is a coach assigned, is it
    cancelled, has attendance been taken". Computed from the roster in the same payload
    rather than from a second query, and from the EXPECTED rows only."""
    import uuid

    from app.models.attendance import Attendance

    before = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    assert before["sessions"][0]["attendance_taken"] is False

    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=an_enrolled_student,
            status="present",
            source="coach",
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()
    after = client.get(BOOTSTRAP, headers=as_lead_coach.headers).json()
    assert after["sessions"][0]["attendance_taken"] is True
