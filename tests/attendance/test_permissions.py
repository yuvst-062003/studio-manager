"""§3.2's matrix, per route, and the tenant filter's 404-not-403 rule.

§3.2 gives "Mark attendance" to every staff role including an assistant coach — they are
the person actually holding the phone on the mat, and a register only a lead coach can
touch is a register nobody takes. Nothing in this vertical is manager-only.

The parent's pre-report is the one route a guardian may write, and a guardian holds no
`role_assignment` at all (§3.1), so it cannot be gated by the staff dependency.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from tests.attendance.conftest import T0

ROSTER = "/api/v1/sessions/{sid}/attendance"
BATCH = "/api/v1/attendance/batch"
BULK = "/api/v1/sessions/{sid}/attendance/bulk-present"
REPORTS = "/api/v1/absence-reports"


def _mark_body(session_id, student_id, *, status="present"):
    return {
        "session_id": str(session_id),
        "marks": [
            {
                "student_id": str(student_id),
                "status": status,
                "client_mark_id": str(uuid.uuid4()),
                "device_marked_at": T0.isoformat(),
            }
        ],
        "session_status_seen": "scheduled",
    }


@pytest.mark.parametrize("caller", ["as_manager", "as_lead_coach", "as_assistant_coach"])
def test_every_staff_role_can_read_a_roster(request, client, caller, a_session):
    signed_in = request.getfixturevalue(caller)
    response = client.get(ROSTER.format(sid=a_session), headers=signed_in.headers)
    assert response.status_code == 200


@pytest.mark.parametrize("caller", ["as_manager", "as_lead_coach", "as_assistant_coach"])
def test_every_staff_role_can_mark_attendance(
    request, client, caller, a_session, an_enrolled_student
):
    """§3.2 — 'Mark attendance' is on the assistant coach's row too. A register only a lead
    coach can touch is a register nobody takes."""
    signed_in = request.getfixturevalue(caller)
    response = client.post(
        BATCH, json=_mark_body(a_session, an_enrolled_student), headers=signed_in.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 1


def test_a_guardian_cannot_mark_a_register(client, as_guardian, a_session, an_enrolled_student):
    """§3.2 — a guardian's row has no attendance column at all. The register is the club's
    record of what happened, not a self-service form."""
    response = client.post(
        BATCH, json=_mark_body(a_session, an_enrolled_student), headers=as_guardian.headers
    )
    assert response.status_code == 403


def test_an_anonymous_caller_cannot_read_a_roster(client, a_session):
    assert client.get(ROSTER.format(sid=a_session)).status_code == 401


def test_a_roster_in_another_studio_is_404_and_never_403(
    client, as_manager, other_studio_session_id
):
    """Invisible rather than forbidden. A 403 would confirm another club's lesson is real,
    which is exactly what the tenant filter spends its effort hiding."""
    response = client.get(ROSTER.format(sid=other_studio_session_id), headers=as_manager.headers)
    assert response.status_code == 404


def test_a_batch_against_another_studios_session_is_404(
    client, as_manager, other_studio_session_id, an_enrolled_student
):
    response = client.post(
        BATCH,
        json=_mark_body(other_studio_session_id, an_enrolled_student),
        headers=as_manager.headers,
    )
    assert response.status_code == 404


def test_the_flush_endpoint_answers_200_and_not_201(
    client, as_lead_coach, a_session, an_enrolled_student
):
    """The queue replays this request. A client treating 201 as "new work happened" would
    raise a fresh toast on every reconnect for marks it made three hours ago."""
    response = client.post(
        BATCH, json=_mark_body(a_session, an_enrolled_student), headers=as_lead_coach.headers
    )
    assert response.status_code == 200


def test_replaying_a_flush_over_http_is_a_no_op(
    client, as_lead_coach, a_session, an_enrolled_student
):
    """§10.5 end to end: same body, twice, one row."""
    body = _mark_body(a_session, an_enrolled_student)
    first = client.post(BATCH, json=body, headers=as_lead_coach.headers).json()
    second = client.post(BATCH, json=body, headers=as_lead_coach.headers).json()
    assert (first["applied"], first["replayed"]) == (1, 0)
    assert (second["applied"], second["replayed"]) == (0, 1)


def test_bulk_present_is_open_to_every_staff_role(
    client, as_assistant_coach, a_session, an_enrolled_student
):
    response = client.post(
        BULK.format(sid=a_session),
        json={
            "client_mark_id_prefix": str(uuid.uuid4()),
            "device_marked_at": T0.isoformat(),
            "respect_absence_reports": True,
        },
        headers=as_assistant_coach.headers,
    )
    assert response.status_code == 200
    assert response.json()["applied"] == 1


def test_a_guardian_may_file_a_pre_report_for_their_own_child(
    client, app_session, studio, as_guardian, a_session, an_enrolled_student
):
    """§3.1 — a guardian holds no `role_assignment`, so this route cannot be gated by the
    staff dependency. The narrowing IS the authorization."""
    from app.models.person import Guardian

    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            person_id=as_guardian.person_id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()

    headers = {
        **as_guardian.headers,
        "X-Dev-Now": (T0 - timedelta(hours=1)).isoformat(),
    }
    response = client.post(
        REPORTS,
        json={"student_id": str(an_enrolled_student), "session_id": str(a_session)},
        headers=headers,
    )
    assert response.status_code == 201, response.text


def test_a_guardian_may_not_file_for_a_child_who_is_not_theirs(
    client, as_guardian, a_session, an_enrolled_student
):
    """The guardian fixture's `guardian` row points at a student that does not exist, so
    this child is not theirs. 404, never 403 — a 403 confirms another family's child."""
    headers = {**as_guardian.headers, "X-Dev-Now": (T0 - timedelta(hours=1)).isoformat()}
    response = client.post(
        REPORTS,
        json={"student_id": str(an_enrolled_student), "session_id": str(a_session)},
        headers=headers,
    )
    assert response.status_code == 404


def test_a_late_pre_report_is_409_with_the_key_the_screen_renders(
    client, as_manager, a_session, an_enrolled_student
):
    """§10.2's deadline. Artboard `12a` renders `attendance.absence.tooLate` from this
    code; a server-authored Hebrew sentence would be a string §9 cannot reach."""
    headers = {**as_manager.headers, "X-Dev-Now": (T0 + timedelta(minutes=1)).isoformat()}
    response = client.post(
        REPORTS,
        json={"student_id": str(an_enrolled_student), "session_id": str(a_session)},
        headers=headers,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "too_late"


def test_a_duplicate_pre_report_is_409_with_its_own_code(
    client, as_manager, a_session, an_enrolled_student
):
    headers = {**as_manager.headers, "X-Dev-Now": (T0 - timedelta(hours=1)).isoformat()}
    body = {"student_id": str(an_enrolled_student), "session_id": str(a_session)}
    assert client.post(REPORTS, json=body, headers=headers).status_code == 201
    second = client.post(REPORTS, json=body, headers=headers)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_reported"


def test_the_student_history_route_pages(client, as_manager, an_enrolled_student):
    response = client.get(
        f"/api/v1/students/{an_enrolled_student}/attendance", headers=as_manager.headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["has_more"] is False


def test_both_routers_are_tagged_coach_so_invariant_3_reaches_them():
    """SPEC §13's third invariant is enforced against the `coach` tag
    (`tests/invariants/test_03`), so an untagged coach router is an unguarded one. Asserted
    here rather than trusted, because the tag is one word in a constructor and nothing else
    in the file would notice it going missing."""
    from app.routers import attendance, sync

    assert "coach" in attendance.router.tags
    assert "coach" in sync.router.tags
