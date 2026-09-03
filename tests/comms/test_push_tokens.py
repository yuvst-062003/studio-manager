"""§7's `POST /push-tokens` — one device, one row, whichever studio it signs into.

`push_token.token` is unique across the PRODUCT rather than per studio, and the model's
docstring spells out why and what it costs: FCM hands the same registration back to the same
browser, so two rows would double-send every push and count one family twice in §5.11's
delivery report. The cost is that `person` is tenant-scoped -- a guardian at two studios is
two `person` rows -- so one handset can belong to only one of them at a time, and M8 re-points
the row on sign-in rather than inserting a second.

**The dashboard cannot register.** `push_token.app` is (staff|parent) and §6.4 makes the
dashboard the manager's web surface. A desktop browser tab is not a device we push to.
"""

from __future__ import annotations

import uuid

from app.models.comms import PushToken
from sqlalchemy import select
from tests.comms.conftest import T0


def _register(client, caller, *, token: str, app: str = "parent", platform: str = "android"):
    return client.post(
        "/api/v1/push-tokens",
        json={"token": token, "app": app, "platform": platform},
        headers=caller.headers,
    )


def test_a_device_registers_and_is_reported_back(client, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    response = _register(client, parent, token=f"tok-{uuid.uuid4().hex}", platform="ios")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["app"] == "parent"
    assert body["platform"] == "ios"
    assert body["last_seen_at"] is not None
    # The token is NOT echoed. It is a credential the client already holds, and a second
    # representation of a secret is one more place for it to be logged.
    assert "token" not in body


def test_registering_the_same_device_twice_re_points_it_rather_than_duplicating(
    client, app_session, as_guardian_of, a_student
) -> None:
    """FCM hands the same token back to the same browser on every launch, so this is the
    ordinary path rather than an edge case. Two rows would double-send every push and count
    one family twice in §5.11's report."""
    parent = as_guardian_of(a_student)
    token = f"tok-{uuid.uuid4().hex}"
    first = _register(client, parent, token=token, platform="android")
    second = _register(client, parent, token=token, platform="android")
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    rows = app_session.execute(select(PushToken).where(PushToken.token == token)).scalars().all()
    assert len(rows) == 1


def test_a_device_that_changes_platform_updates_rather_than_forking(
    client, app_session, as_guardian_of, a_student
) -> None:
    """The same browser reporting a different platform is a client bug or a spoof, and either
    way the answer is one row. Two rows disagreeing about what a device IS would make §6.5's
    install report count the same family in two columns."""
    parent = as_guardian_of(a_student)
    token = f"tok-{uuid.uuid4().hex}"
    _register(client, parent, token=token, platform="android")
    _register(client, parent, token=token, platform="ios")

    rows = app_session.execute(select(PushToken).where(PushToken.token == token)).scalars().all()
    assert len(rows) == 1
    assert rows[0].platform == "ios"


def test_a_second_person_claiming_a_device_takes_it_over(
    client, app_session, as_guardian_of, as_manager, a_student
) -> None:
    """A shared family tablet, or a phone handed on. The model's docstring is explicit that
    one device is registered to one person at a time -- so the later sign-in wins, and the
    earlier person stops receiving push on a handset they no longer hold. Leaving both would
    send one family's messages to another."""
    parent = as_guardian_of(a_student)
    token = f"tok-{uuid.uuid4().hex}"
    _register(client, parent, token=token)
    _register(client, as_manager, token=token, app="staff", platform="ios")

    rows = app_session.execute(select(PushToken).where(PushToken.token == token)).scalars().all()
    assert len(rows) == 1
    assert rows[0].person_id == as_manager.person_id
    assert rows[0].app == "staff"


def test_the_dashboard_cannot_register_a_device(client, as_manager) -> None:
    """§6.4 makes the dashboard the manager's WEB surface and §4.3 writes
    `push_token app(staff|parent)`. A desktop tab is not a device we push to, and the 422
    says so rather than the database rejecting it as a 500."""
    response = client.post(
        "/api/v1/push-tokens",
        json={"token": f"tok-{uuid.uuid4().hex}", "app": "dashboard", "platform": "web"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


def test_a_platform_nobody_ships_is_refused(client, as_manager) -> None:
    response = client.post(
        "/api/v1/push-tokens",
        json={"token": f"tok-{uuid.uuid4().hex}", "app": "parent", "platform": "windows"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


def test_an_empty_token_is_refused(client, as_manager) -> None:
    """`PushTokenIn.token` is `min_length=1`. An empty registration would be a row saying
    this person HAS a device, which turns a `no_token` into a `failed` and sends the office
    to the wrong conversation."""
    response = client.post(
        "/api/v1/push-tokens",
        json={"token": "", "app": "parent", "platform": "android"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


def test_registering_requires_a_signed_in_person(client) -> None:
    response = client.post(
        "/api/v1/push-tokens",
        json={"token": f"tok-{uuid.uuid4().hex}", "app": "parent", "platform": "android"},
    )
    assert response.status_code == 401, response.text


def test_last_seen_at_moves_on_every_registration(
    client, app_session, as_guardian_of, a_student
) -> None:
    """§4.3 -- `last_seen_at`. The model's docstring makes it the way a dead token is
    retired: a registration nobody has refreshed in months is why a `delivered` status can
    still mean nobody read it. It only works if every launch writes it."""
    parent = as_guardian_of(a_student)
    token = f"tok-{uuid.uuid4().hex}"
    _register(client, parent, token=token)

    later = T0.replace(hour=18)
    client.post(
        "/api/v1/push-tokens",
        json={"token": token, "app": "parent", "platform": "android"},
        headers={**parent.headers, "X-Dev-Now": later.isoformat()},
    )
    row = app_session.execute(select(PushToken).where(PushToken.token == token)).scalar_one()
    app_session.refresh(row)
    assert row.last_seen_at == later


# -- turning them off again ----------------------------------------------------
#
# Screen 8 of the parent redesign puts a notifications switch on the profile tab. A switch
# that only travels one way is not a switch: `POST /push-tokens` could turn push on and
# nothing could turn it off, so the screen would have shipped a control that lies about
# its own state the moment a parent flipped it back.
#
# The token rides in the BODY, never the path. It is a credential, and a credential in a
# URL ends up in access logs — the same reason the register route refuses to echo it back.


def _deregister(client, caller, *, token: str):
    return client.request(
        "DELETE",
        "/api/v1/push-tokens",
        json={"token": token},
        headers=caller.headers,
    )


def test_a_device_deregisters_and_stops_being_pushed_to(
    client, app_session, as_guardian_of, a_student
) -> None:
    parent = as_guardian_of(a_student)
    token = f"tok-{uuid.uuid4().hex}"
    assert _register(client, parent, token=token).status_code == 201

    response = _deregister(client, parent, token=token)
    assert response.status_code == 204, response.text

    app_session.expire_all()
    rows = app_session.scalars(select(PushToken).where(PushToken.token == token)).all()
    assert rows == []


def test_deregistering_an_unknown_device_is_not_an_error(client, as_guardian_of, a_student) -> None:
    """The switch reports the state the parent asked for. A browser that lost its
    subscription, or a second tap, must land on 'notifications are off' rather than on an
    error a parent can do nothing about."""
    parent = as_guardian_of(a_student)
    response = _deregister(client, parent, token=f"tok-{uuid.uuid4().hex}")
    assert response.status_code == 204, response.text


def test_a_parent_cannot_deregister_someone_elses_device(
    client, app_session, as_guardian_of, a_student, studio
) -> None:
    """The token is a bearer-shaped string, so the route must scope the delete to the
    caller rather than trusting whoever presents one."""
    from app.models.people import Student
    from app.models.person import Person
    from tests.comms.conftest import YEAR_STARTS

    other_person = Person(studio_id=studio.id, first_name="יוסי", last_name="אחר")
    app_session.add(other_person)
    app_session.flush()
    other_student = Student(
        studio_id=studio.id,
        person_id=other_person.id,
        status="active",
        joined_on=YEAR_STARTS,
    )
    app_session.add(other_student)
    app_session.commit()

    owner = as_guardian_of(a_student)
    stranger = as_guardian_of(other_student.id)
    token = f"tok-{uuid.uuid4().hex}"
    assert _register(client, owner, token=token).status_code == 201

    response = _deregister(client, stranger, token=token)
    assert response.status_code == 204, response.text

    app_session.expire_all()
    rows = app_session.scalars(select(PushToken).where(PushToken.token == token)).all()
    assert len(rows) == 1, "another person's device must survive"


# -- HB-push-transport's public half -------------------------------------------
def test_the_vapid_public_key_is_served_once_configured(client, as_manager, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "BMBS...fake-public-key")
    response = client.get("/api/v1/push/vapid-public-key", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.json() == {"public_key": "BMBS...fake-public-key"}


def test_the_vapid_public_key_is_null_when_unconfigured(client, as_manager, monkeypatch) -> None:
    """No credential in this environment is an honest `null`, not a crash and not a fake
    key that would make `pushManager.subscribe` fail with no diagnosable reason."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", None)
    response = client.get("/api/v1/push/vapid-public-key", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.json() == {"public_key": None}


def test_reading_the_vapid_public_key_requires_a_signed_in_person(client) -> None:
    assert client.get("/api/v1/push/vapid-public-key").status_code == 401
