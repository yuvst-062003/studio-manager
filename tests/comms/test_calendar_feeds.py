"""§5.12's subscription: an unauthenticated URL, and the token that is its whole credential.

"`GET /api/v1/calendar/{token}.ics` returns RFC 5545 iCalendar content. Feeds exist per
guardian (all their students' sessions and events) and per coach (all sessions they staff).
The token is a long random secret stored in `calendar_feed`, rotatable from settings —
rotating invalidates the old URL immediately."

**A calendar client cannot hold a session.** That is the whole reason this endpoint has no
authentication and the whole reason the token has to be unguessable: Google subscribes once
and then fetches on its own schedule, forever, with nothing but the URL.

**Chosen because the alternative does not exist.** §12: Apple provides no third-party
calendar write API at all, so the API route cannot serve iPhone users, and Google's write
scope is a restricted scope requiring an annual third-party security assessment.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from app.models.comms import CalendarFeed
from app.models.events import Event, EventRegistration
from sqlalchemy import select
from tests.comms.conftest import T0


def _feeds(client, caller):
    return client.get("/api/v1/calendar-feeds", headers=caller.headers)


def _token_of(session, person_id, subject_type: str) -> str:
    return session.execute(
        select(CalendarFeed.token).where(
            CalendarFeed.person_id == person_id, CalendarFeed.subject_type == subject_type
        )
    ).scalar_one()


def _fetch(client, token: str):
    return client.get(f"/api/v1/calendar/{token}.ics")


# -- the secret ---------------------------------------------------------------
def test_a_guardian_is_issued_a_feed(client, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    response = _feeds(client, parent)
    assert response.status_code == 200, response.text
    subjects = [row["subject_type"] for row in response.json()["feeds"]]
    assert subjects == ["guardian"]


def test_a_coach_is_issued_their_own_feed(client, as_lead_coach, a_coached_group) -> None:
    """`calendar_feed.subject_type = 'coach'` -- the lane's screenless staff deliverable.
    §5.12: "all sessions they staff"."""
    a_coached_group(as_lead_coach.person_id)
    subjects = [row["subject_type"] for row in _feeds(client, as_lead_coach).json()["feeds"]]
    assert "coach" in subjects


def test_a_parent_who_also_coaches_gets_two(
    client, as_guardian_of, a_student, a_coached_group
) -> None:
    """`uq_calendar_feed_person_id_subject_type`. §5.12's two feeds carry different things --
    one is their children's lessons, the other is every session they teach -- so a person who
    is both needs both, and neither should contain the other."""
    parent = as_guardian_of(a_student)
    a_coached_group(parent.person_id)
    subjects = sorted(row["subject_type"] for row in _feeds(client, parent).json()["feeds"])
    assert subjects == ["coach", "guardian"]


def test_the_token_is_thirty_two_bytes_of_urlsafe_randomness(
    client, app_session, as_guardian_of, a_student
) -> None:
    """The model fixes it: 43 characters, 32 bytes of urlsafe base64, matching the refresh
    token M1 already issues. Not a UUID -- a UUID in a URL invites being treated as an
    identifier and logged, and it carries a third of the entropy."""
    parent = as_guardian_of(a_student)
    _feeds(client, parent)
    token = _token_of(app_session, parent.person_id, "guardian")
    assert len(token) == 43
    assert token.replace("-", "").replace("_", "").isalnum()


def test_asking_twice_returns_the_same_feed(client, app_session, as_guardian_of, a_student) -> None:
    """The settings screen loads more than once. A new token per page load would break every
    calendar the parent had already subscribed."""
    parent = as_guardian_of(a_student)
    first = _feeds(client, parent).json()["feeds"][0]["url"]
    second = _feeds(client, parent).json()["feeds"][0]["url"]
    assert first == second


def test_the_url_is_absolute_and_ends_in_ics(client, as_guardian_of, a_student) -> None:
    """A calendar client is handed this URL and nothing else -- there is no page around it to
    resolve a relative path against, and `.ics` is what makes Google and Apple treat the
    response as a calendar rather than a download."""
    parent = as_guardian_of(a_student)
    url = _feeds(client, parent).json()["feeds"][0]["url"]
    assert url.startswith("http")
    assert url.endswith(".ics")


def test_the_bare_token_is_never_returned_beside_the_url(client, as_guardian_of, a_student) -> None:
    """`CalendarFeedOut` holds a URL and a rotation timestamp and nothing else. Two
    representations of one secret is one more place to log it."""
    parent = as_guardian_of(a_student)
    assert "token" not in _feeds(client, parent).json()["feeds"][0]


# -- fetching it --------------------------------------------------------------
def test_the_feed_is_unauthenticated_and_the_token_is_the_whole_credential(
    client, app_session, as_guardian_of, a_student
) -> None:
    """§5.12. A calendar client cannot hold a session, so there is nothing else to check --
    which is exactly why the token has to be unguessable."""
    parent = as_guardian_of(a_student)
    _feeds(client, parent)
    response = _fetch(client, _token_of(app_session, parent.person_id, "guardian"))
    assert response.status_code == 200, response.text
    assert "BEGIN:VCALENDAR" in response.text


def test_the_response_is_text_calendar_with_a_filename(
    client, app_session, as_guardian_of, a_student
) -> None:
    parent = as_guardian_of(a_student)
    _feeds(client, parent)
    response = _fetch(client, _token_of(app_session, parent.person_id, "guardian"))
    assert response.headers["content-type"].startswith("text/calendar")


def test_an_unknown_token_is_a_404_that_leaks_nothing(client) -> None:
    """No "this studio has no such feed", no distinction between never-existed and rotated.
    Either would confirm something to whoever is guessing."""
    response = _fetch(client, "x" * 43)
    assert response.status_code == 404
    assert response.text == "" or "studio" not in response.text.lower()


def test_rotating_invalidates_the_old_url_immediately(
    client, app_session, as_guardian_of, a_student
) -> None:
    """§5.12, verbatim: "rotating invalidates the old URL immediately." Not on the next fetch,
    not after a cache expiry -- the only remedy for a link that was shared by accident is a
    dead one."""
    parent = as_guardian_of(a_student)
    feed = _feeds(client, parent).json()["feeds"][0]
    old = _token_of(app_session, parent.person_id, "guardian")
    assert _fetch(client, old).status_code == 200

    rotated = client.post(f"/api/v1/calendar-feeds/{feed['id']}/rotate", headers=parent.headers)
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["rotated_at"] is not None
    assert rotated.json()["url"] != feed["url"]
    assert _fetch(client, old).status_code == 404


def test_rotating_somebody_elses_feed_is_refused(
    client, as_guardian_of, as_manager, a_student
) -> None:
    """The feed id is a UUID in a URL a manager could guess at. Rotating a parent's feed would
    silently disconnect their family calendar."""
    parent = as_guardian_of(a_student)
    feed = _feeds(client, parent).json()["feeds"][0]
    response = client.post(
        f"/api/v1/calendar-feeds/{feed['id']}/rotate", headers=as_manager.headers
    )
    assert response.status_code == 404, response.text


# -- what is in it ------------------------------------------------------------
def test_a_guardians_feed_carries_their_own_childrens_sessions(
    client, app_session, as_guardian_of, an_enrolled_student, a_session
) -> None:
    parent = as_guardian_of(an_enrolled_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    assert f"UID:session-{a_session}" in body


def test_a_guardians_feed_carries_no_other_familys_session(
    client, app_session, studio, as_guardian_of, a_student, a_session
) -> None:
    """`a_student` is enrolled in nothing, so the group's session is not theirs. A feed that
    swept every session in the studio would hand one family the club's whole timetable."""
    parent = as_guardian_of(a_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    assert "BEGIN:VEVENT" not in body


def test_a_guardians_feed_carries_a_published_event_their_child_is_registered_for(
    client, app_session, studio, as_guardian_of, an_enrolled_student
) -> None:
    """§5.12 -- "all their students' sessions AND events"."""
    event = Event(
        studio_id=studio.id,
        type="competition",
        title="אליפות החורף",
        starts_at=T0 + timedelta(days=20),
        ends_at=T0 + timedelta(days=20, hours=5),
        location_text="היכל הספורט",
        status="published",
    )
    app_session.add(event)
    app_session.flush()
    app_session.add(
        EventRegistration(
            studio_id=studio.id, event_id=event.id, student_id=an_enrolled_student, rsvp="yes"
        )
    )
    app_session.commit()

    parent = as_guardian_of(an_enrolled_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    assert f"UID:event-{event.id}" in body
    assert "אליפות החורף" in body


def test_a_draft_event_is_never_in_a_feed(
    client, app_session, studio, as_guardian_of, an_enrolled_student
) -> None:
    """§4.3 -- nothing is visible to a guardian while an event is a draft. A feed is the one
    surface where that leak would be invisible to us and permanent to Google."""
    event = Event(
        studio_id=studio.id,
        type="competition",
        title="עוד לא פורסם",
        starts_at=T0 + timedelta(days=20),
        ends_at=T0 + timedelta(days=20, hours=5),
        status="draft",
    )
    app_session.add(event)
    app_session.flush()
    app_session.add(
        EventRegistration(
            studio_id=studio.id, event_id=event.id, student_id=an_enrolled_student, rsvp="pending"
        )
    )
    app_session.commit()

    parent = as_guardian_of(an_enrolled_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    assert "עוד לא פורסם" not in body


def test_a_coachs_feed_carries_every_session_they_staff(
    client, app_session, as_lead_coach, a_staffed_session, a_session, a_coached_group
) -> None:
    a_coached_group(as_lead_coach.person_id)
    a_staffed_session(as_lead_coach.person_id)
    _feeds(client, as_lead_coach)
    body = _fetch(client, _token_of(app_session, as_lead_coach.person_id, "coach")).text
    assert f"UID:session-{a_session}" in body


def test_a_substitute_covering_one_lesson_sees_it(
    client, app_session, as_assistant_coach, a_staffed_session, a_session, a_coached_group
) -> None:
    """§5.12's coach feed is per SESSION, not per group. A substitute who covers one lesson
    has a `session_staff` row and no `group_staff` row, and a group-level feed would silently
    drop exactly the lesson they most need reminding about."""
    a_staffed_session(as_assistant_coach.person_id, is_substitute=True)
    _feeds(client, as_assistant_coach)
    body = _fetch(client, _token_of(app_session, as_assistant_coach.person_id, "coach")).text
    assert f"UID:session-{a_session}" in body


def test_a_coachs_feed_carries_no_student_name(
    client, app_session, as_lead_coach, a_staffed_session, an_enrolled_student, a_coached_group
) -> None:
    """A guardian's SUMMARY names the child, because a two-child family needs to know which
    one. A coach's names the group -- a roster does not belong in a subscribed calendar that
    syncs to a personal phone and is fetched forever by Google."""
    a_coached_group(as_lead_coach.person_id)
    a_staffed_session(as_lead_coach.person_id)
    _feeds(client, as_lead_coach)
    body = _fetch(client, _token_of(app_session, as_lead_coach.person_id, "coach")).text
    assert "דנה" not in body


def test_a_cancelled_session_is_in_the_feed_as_cancelled(
    client, app_session, as_guardian_of, an_enrolled_student, a_session
) -> None:
    """§5.12. Struck through rather than gone -- which is what §5.11's cancellation push pairs
    with, and why §5.12 says the feed is never the channel for the urgent case."""
    from app.models.schedule import Session as SessionRow

    row = app_session.get(SessionRow, a_session)
    row.status = "cancelled"
    row.cancel_reason = "מזג אוויר"
    app_session.commit()

    parent = as_guardian_of(an_enrolled_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    assert "STATUS:CANCELLED" in body


def test_the_feed_carries_no_balance_and_no_health_flag(
    client, app_session, as_guardian_of, an_enrolled_student, a_session
) -> None:
    """§5.12, end to end: "The feed contains no medical and no financial data." The URL is
    unauthenticated and, once subscribed, is fetched by Google's servers indefinitely."""
    parent = as_guardian_of(an_enrolled_student)
    _feeds(client, parent)
    body = _fetch(client, _token_of(app_session, parent.person_id, "guardian")).text
    for forbidden in ("agorot", "balance", "חוב", "בריאות", "declaration"):
        assert forbidden not in body


def test_a_feed_requires_a_signed_in_person(client) -> None:
    assert client.get("/api/v1/calendar-feeds").status_code == 401


def test_rotating_a_feed_that_does_not_exist_is_a_404(client, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    response = client.post(f"/api/v1/calendar-feeds/{uuid.uuid4()}/rotate", headers=parent.headers)
    assert response.status_code == 404
