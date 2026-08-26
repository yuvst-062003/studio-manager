"""§7's `GET/PATCH /notification-preferences`.

§5.11's complaint about notification settings is that people believe they turned something
off. So the endpoint returns all eight switches on every call — including the two that do not
do what a switch implies — and refuses, loudly, to pretend the transactional ones are
mutable.
"""

from __future__ import annotations

from app.models.comms import PREFERENCE_GROUPS


def _get(client, caller):
    return client.get("/api/v1/notification-preferences", headers=caller.headers)


def _patch(client, caller, kind_group: str, enabled: bool):
    return client.patch(
        "/api/v1/notification-preferences",
        json={"kind_group": kind_group, "enabled": enabled},
        headers=caller.headers,
    )


def test_all_eight_groups_come_back_in_the_order_the_screen_renders_them(
    client, as_guardian_of, a_student
) -> None:
    """A guardian who has never opened this screen has no stored rows at all. Returning only
    what is stored would render an empty settings page, and returning them in insertion order
    would reshuffle the page as they toggled."""
    parent = as_guardian_of(a_student)
    response = _get(client, parent)
    assert response.status_code == 200, response.text
    groups = [row["kind_group"] for row in response.json()["groups"]]
    assert groups == list(PREFERENCE_GROUPS)


def test_everything_is_on_before_anybody_has_touched_it(client, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    assert all(row["enabled"] for row in _get(client, parent).json()["groups"])


def test_the_transactional_group_is_flagged_rather_than_hidden(
    client, as_guardian_of, a_student
) -> None:
    """§5.11 -- health-declaration notices are transactional. The screen renders
    `preferences.alwaysOn` where this flag is true, which is a sentence explaining the rule
    rather than a switch that silently refuses to move."""
    parent = as_guardian_of(a_student)
    rows = {row["kind_group"]: row for row in _get(client, parent).json()["groups"]}
    assert rows["health"]["always_on"] is True
    assert rows["health"]["enabled"] is True
    assert rows["payment"]["always_on"] is False


def test_turning_a_group_off_returns_the_whole_set(client, as_guardian_of, a_student) -> None:
    """All eight, not the one that changed. The screen cannot drift out of step with the
    server, which matters here precisely because two of the eight do not behave the way a
    switch looks like it behaves."""
    parent = as_guardian_of(a_student)
    response = _patch(client, parent, "belt", False)
    assert response.status_code == 200, response.text
    rows = {row["kind_group"]: row["enabled"] for row in response.json()["groups"]}
    assert rows["belt"] is False
    assert len(rows) == len(PREFERENCE_GROUPS)


def test_the_switch_survives_a_reload(client, as_guardian_of, a_student) -> None:
    """Persisted, not held in the client. A preference that vanished on refresh would be the
    §5.11 failure exactly: a parent who believes they turned something off."""
    parent = as_guardian_of(a_student)
    _patch(client, parent, "event", False)
    rows = {row["kind_group"]: row["enabled"] for row in _get(client, parent).json()["groups"]}
    assert rows["event"] is False


def test_toggling_twice_is_not_an_error(client, as_guardian_of, a_student) -> None:
    """`uq_notification_preference_person_id_kind_group` would reject a second insert. A
    settings screen sends exactly this when somebody changes their mind."""
    parent = as_guardian_of(a_student)
    assert _patch(client, parent, "belt", False).status_code == 200
    assert _patch(client, parent, "belt", True).status_code == 200
    rows = {row["kind_group"]: row["enabled"] for row in _get(client, parent).json()["groups"]}
    assert rows["belt"] is True


def test_turning_off_a_transactional_group_is_refused_with_a_reason(
    client, as_guardian_of, a_student
) -> None:
    """409 rather than 403: the caller is permitted to ask, and the answer is about the state
    of the world -- §5.11 does not allow this one to be off -- rather than about who they
    are."""
    parent = as_guardian_of(a_student)
    response = _patch(client, parent, "health", False)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "notification_always_on"


def test_turning_a_transactional_group_on_is_accepted(client, as_guardian_of, a_student) -> None:
    """Refusing both directions would fail on a no-op, which is what a screen sends when
    somebody toggles a switch twice."""
    parent = as_guardian_of(a_student)
    assert _patch(client, parent, "health", True).status_code == 200


def test_an_unknown_group_is_a_422_that_names_the_allowed_ones(
    client, as_guardian_of, a_student
) -> None:
    """The group name arrives over the wire, so a typo is a client bug. Letting the database
    CHECK catch it would surface as a 500 with nothing actionable in it."""
    parent = as_guardian_of(a_student)
    response = _patch(client, parent, "belts", False)
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "unknown_preference_group"
    assert "belt" in detail["allowed"]


def test_one_persons_switches_are_not_anothers(
    client, as_guardian_of, as_manager, a_student
) -> None:
    """The person comes from the verified JWT and never from the body, so there is no field
    a caller could set to read or write somebody else's settings."""
    parent = as_guardian_of(a_student)
    _patch(client, parent, "belt", False)
    rows = {row["kind_group"]: row["enabled"] for row in _get(client, as_manager).json()["groups"]}
    assert rows["belt"] is True


def test_preferences_require_a_signed_in_person(client) -> None:
    assert client.get("/api/v1/notification-preferences").status_code == 401
