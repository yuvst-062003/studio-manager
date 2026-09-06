"""§6.1 of the staff app redesign — coach unavailability, and decision 12's availability
reader. Approve/refuse are here; C12's dashboard alert and resolution popup are not.

The permission rules ARE the deliverable (checkpoint C10's own brief): a coach sees only
their own, the pending queue and the two decisions are manager/owner, and a refused
substitute never half-applies.
"""

from __future__ import annotations

import uuid

from app.models.comms import Notification
from app.models.person import Person
from app.models.schedule import CoachConstraint, SessionStaff
from sqlalchemy import select
from tests.schedule.conftest import T0, make_session

API = "/api/v1"


def _body(**overrides):  # noqa: ANN001, ANN202
    body = {
        "starts_at": "2026-11-10T14:00:00Z",
        "ends_at": "2026-11-10T16:00:00Z",
        "all_day": False,
        "reason": "illness",
        "note": None,
        "substitute_person_id": None,
    }
    body.update(overrides)
    return body


# -- filing ---------------------------------------------------------------------------
def test_any_staff_role_may_file_a_constraint_and_it_lands_pending(client, as_lead_coach):
    response = client.post(f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body())
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["person_id"] == str(as_lead_coach.person_id)
    assert body["decided_by_person_id"] is None
    assert body["decided_at"] is None


def test_an_all_day_request_round_trips_the_flag_and_the_given_instants_verbatim(
    client, as_lead_coach
):
    """§6.1: `all_day` travels alongside real timestamps rather than replacing them — the
    server stores exactly what it is given and never re-derives the boundary itself. The
    frontend is where midnight-to-midnight-in-Jerusalem is computed (`studioWallTimeToUtc`),
    precisely so the server never has to guess a time zone it is not evaluating in."""
    response = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(
            starts_at="2026-11-09T22:00:00Z",  # 2026-11-10T00:00 Asia/Jerusalem (winter, UTC+2)
            ends_at="2026-11-10T22:00:00Z",  # 2026-11-11T00:00 Asia/Jerusalem
            all_day=True,
            reason="vacation",
        ),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["all_day"] is True
    assert body["starts_at"].startswith("2026-11-09T22:00")
    assert body["ends_at"].startswith("2026-11-10T22:00")


def test_ends_before_starts_is_refused_before_the_database_sees_it(client, as_lead_coach):
    response = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(starts_at="2026-11-10T16:00:00Z", ends_at="2026-11-10T14:00:00Z"),
    )
    assert response.status_code == 422


def test_reason_other_requires_a_note(client, as_lead_coach):
    blank = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body(reason="other")
    )
    assert blank.status_code == 422

    blank_note = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(reason="other", note="   "),
    )
    assert blank_note.status_code == 422

    with_note = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(reason="other", note="טיפול שיניים דחוף"),
    )
    assert with_note.status_code == 201, with_note.text


# -- reading: mine=true is scoped, invisibly -------------------------------------------
def test_mine_true_returns_only_the_callers_own_rows(client, as_lead_coach, as_assistant_coach):
    client.post(f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body())
    client.post(f"{API}/coach-constraints", headers=as_assistant_coach.headers, json=_body())

    mine = client.get(f"{API}/coach-constraints?mine=true", headers=as_lead_coach.headers)
    assert mine.status_code == 200, mine.text
    items = mine.json()["items"]
    assert len(items) == 1
    assert items[0]["person_id"] == str(as_lead_coach.person_id)


def test_a_coach_with_no_constraints_gets_an_empty_list_not_an_error(client, as_lead_coach):
    response = client.get(f"{API}/coach-constraints?mine=true", headers=as_lead_coach.headers)
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []


def test_neither_mine_nor_a_pending_status_is_refused_with_a_named_422(client, as_lead_coach):
    response = client.get(f"{API}/coach-constraints", headers=as_lead_coach.headers)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_query"


# -- reading: the pending queue is manager/owner only ----------------------------------
def test_a_coach_cannot_read_the_pending_queue(client, as_lead_coach):
    response = client.get(f"{API}/coach-constraints?status=pending", headers=as_lead_coach.headers)
    assert response.status_code == 403


def test_a_manager_reads_the_pending_queue_across_every_filer(
    client, as_manager, as_lead_coach, as_assistant_coach
):
    client.post(f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body())
    client.post(f"{API}/coach-constraints", headers=as_assistant_coach.headers, json=_body())

    response = client.get(f"{API}/coach-constraints?status=pending", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    person_ids = {item["person_id"] for item in response.json()["items"]}
    assert person_ids == {str(as_lead_coach.person_id), str(as_assistant_coach.person_id)}


# -- withdrawing ------------------------------------------------------------------------
def test_the_filer_withdraws_their_own_constraint(client, as_lead_coach):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.delete(
        f"{API}/coach-constraints/{created['id']}", headers=as_lead_coach.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "withdrawn"


def test_a_colleague_cannot_withdraw_someone_elses_constraint_and_it_stays_invisible(
    client, as_lead_coach, as_assistant_coach
):
    """Invisible, not forbidden — the same rule a stranger's session already follows: a
    403 here would confirm a colleague filed something at all."""
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.delete(
        f"{API}/coach-constraints/{created['id']}", headers=as_assistant_coach.headers
    )
    assert response.status_code == 404


def test_withdrawing_an_already_refused_constraint_is_refused(client, as_manager, as_lead_coach):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    client.post(
        f"{API}/coach-constraints/{created['id']}/refuse",
        headers=as_manager.headers,
        json={"reason": "אין מספיק מאמנים באותו שבוע"},
    )
    response = client.delete(
        f"{API}/coach-constraints/{created['id']}", headers=as_lead_coach.headers
    )
    assert response.status_code == 409


# -- approving and refusing are manager/owner only ---------------------------------------
def test_a_coach_cannot_approve_or_refuse(client, as_lead_coach, as_assistant_coach):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    approve = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_assistant_coach.headers,
        json={},
    )
    assert approve.status_code == 403
    refuse = client.post(
        f"{API}/coach-constraints/{created['id']}/refuse",
        headers=as_assistant_coach.headers,
        json={"reason": "x"},
    )
    assert refuse.status_code == 403


def test_approving_notifies_the_coach_under_its_own_prefix(
    client, app_session, as_manager, as_lead_coach
):
    """§6.1: the outcome kind is its own prefix, not `coach.` — §6.4 removed the group
    that prefix mapped to, and an unmapped prefix is ungoverned (always sends) rather than
    muted, which is exactly what a leave-request answer needs."""
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "approved"
    assert body["decided_by_person_id"] == str(as_manager.person_id)
    assert body["decided_at"] is not None
    assert body["substitute_person_id"] is None

    app_session.expire_all()
    notes = list(
        app_session.execute(
            select(Notification).where(
                Notification.person_id == as_lead_coach.person_id,
                Notification.kind == "constraint.approved",
            )
        ).scalars()
    )
    assert len(notes) == 1
    assert notes[0].payload["constraint_id"] == created["id"]


def test_refusing_carries_a_reason_that_is_never_stored_on_the_row(
    client, app_session, as_manager, as_lead_coach
):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()

    blank = client.post(
        f"{API}/coach-constraints/{created['id']}/refuse",
        headers=as_manager.headers,
        json={"reason": ""},
    )
    assert blank.status_code == 422

    response = client.post(
        f"{API}/coach-constraints/{created['id']}/refuse",
        headers=as_manager.headers,
        json={"reason": "כבר יש שני היעדרויות באותו שבוע"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "refused"

    row = app_session.get(CoachConstraint, uuid.UUID(created["id"]))
    app_session.refresh(row)
    assert row.note is None or "כבר יש" not in (row.note or "")

    app_session.expire_all()
    notes = list(
        app_session.execute(
            select(Notification).where(
                Notification.person_id == as_lead_coach.person_id,
                Notification.kind == "constraint.refused",
            )
        ).scalars()
    )
    assert len(notes) == 1
    assert "כבר יש שני היעדרויות" in notes[0].body


def test_deciding_a_constraint_twice_is_a_conflict(client, as_manager, as_lead_coach):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    client.post(
        f"{API}/coach-constraints/{created['id']}/approve", headers=as_manager.headers, json={}
    )
    again = client.post(
        f"{API}/coach-constraints/{created['id']}/approve", headers=as_manager.headers, json={}
    )
    assert again.status_code == 409


# -- the substitute: refuse rather than half-do ------------------------------------------
def test_approving_with_a_substitute_who_is_not_staff_is_refused_with_a_named_422(
    client, app_session, studio, as_manager, as_lead_coach
):
    outsider = Person(studio_id=studio.id, first_name="חוץ", last_name="למועדון")
    app_session.add(outsider)
    app_session.commit()

    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={"substitute_person_id": str(outsider.id)},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "not_staff"

    # The refusal left the constraint exactly as pending as before the call.
    app_session.expire_all()
    row = app_session.get(CoachConstraint, uuid.UUID(created["id"]))
    assert row.status == "pending"
    assert row.substitute_person_id is None


def test_approving_with_a_substitute_who_already_has_an_approved_constraint_there_is_refused(
    client, app_session, as_manager, as_lead_coach, as_assistant_coach
):
    """Decision 12's own definition of "free", reused here: no `approved` constraint of
    their own overlapping the window."""
    client.post(
        f"{API}/coach-constraints",
        headers=as_assistant_coach.headers,
        json=_body(starts_at="2026-11-10T13:00:00Z", ends_at="2026-11-10T17:00:00Z"),
    )
    already_approved = client.get(
        f"{API}/coach-constraints?mine=true", headers=as_assistant_coach.headers
    ).json()["items"][0]
    client.post(
        f"{API}/coach-constraints/{already_approved['id']}/approve",
        headers=as_manager.headers,
        json={},
    )

    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={"substitute_person_id": str(as_assistant_coach.person_id)},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unavailable"


def test_approving_with_a_substitute_already_teaching_that_window_is_refused(
    client,
    app_session,
    studio,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_group,
    an_active_year,
):
    session_id = make_session(app_session, studio, an_active_year, a_group, T0)
    app_session.add(
        SessionStaff(
            studio_id=studio.id,
            session_id=session_id,
            person_id=as_assistant_coach.person_id,
            role="assistant_coach",
        )
    )
    app_session.commit()

    created = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(starts_at=T0.isoformat(), ends_at=(T0.replace(hour=T0.hour + 1)).isoformat()),
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={"substitute_person_id": str(as_assistant_coach.person_id)},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unavailable"


def test_approving_with_a_free_substitute_records_it(
    client, app_session, as_manager, as_lead_coach, as_assistant_coach
):
    created = client.post(
        f"{API}/coach-constraints", headers=as_lead_coach.headers, json=_body()
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={"substitute_person_id": str(as_assistant_coach.person_id)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["substitute_person_id"] == str(as_assistant_coach.person_id)


def test_omitting_substitute_on_approve_leaves_the_filers_own_suggestion(
    client, as_manager, as_lead_coach, as_assistant_coach
):
    created = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(substitute_person_id=str(as_assistant_coach.person_id)),
    ).json()
    assert created["substitute_person_id"] == str(as_assistant_coach.person_id)

    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve", headers=as_manager.headers, json={}
    )
    assert response.status_code == 200, response.text
    # Omitted, not cleared: the filer's own suggestion survives an approval that mentions
    # no opinion of its own about the substitute.
    assert response.json()["substitute_person_id"] == str(as_assistant_coach.person_id)


def test_explicit_null_substitute_on_approve_clears_it(
    client, as_manager, as_lead_coach, as_assistant_coach
):
    created = client.post(
        f"{API}/coach-constraints",
        headers=as_lead_coach.headers,
        json=_body(substitute_person_id=str(as_assistant_coach.person_id)),
    ).json()
    response = client.post(
        f"{API}/coach-constraints/{created['id']}/approve",
        headers=as_manager.headers,
        json={"substitute_person_id": None},
    )
    assert response.status_code == 200, response.text
    assert response.json()["substitute_person_id"] is None


# -- decision 12: /staff/available --------------------------------------------------------
def test_staff_available_lists_everyone_with_a_flag_rather_than_filtering_the_busy_out(
    client,
    app_session,
    studio,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_group,
    an_active_year,
):
    session_id = make_session(app_session, studio, an_active_year, a_group, T0)
    app_session.add(
        SessionStaff(
            studio_id=studio.id,
            session_id=session_id,
            person_id=as_assistant_coach.person_id,
            role="assistant_coach",
        )
    )
    app_session.commit()

    # `+00:00` would parse as a space in a query string unless percent-encoded — `Z` says
    # the same thing and needs no encoding.
    window_from = T0.isoformat().replace("+00:00", "Z")
    window_to = T0.replace(hour=T0.hour + 1).isoformat().replace("+00:00", "Z")
    response = client.get(
        f"{API}/staff/available?from={window_from}&to={window_to}", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    by_person = {item["person_id"]: item for item in response.json()["items"]}
    assert by_person[str(as_manager.person_id)]["available"] is True
    assert by_person[str(as_lead_coach.person_id)]["available"] is True
    # Busy, and still LISTED — decision 12: no filtering, only a flag.
    assert by_person[str(as_assistant_coach.person_id)]["available"] is False


def test_staff_available_is_manager_or_owner_only(client, as_lead_coach):
    response = client.get(
        f"{API}/staff/available?from=2026-11-10T14:00:00Z&to=2026-11-10T15:00:00Z",
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403


def test_staff_available_refuses_a_backwards_window(client, as_manager):
    response = client.get(
        f"{API}/staff/available?from=2026-11-10T15:00:00Z&to=2026-11-10T14:00:00Z",
        headers=as_manager.headers,
    )
    assert response.status_code == 422
