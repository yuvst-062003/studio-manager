"""`הסכם הרשמה` over HTTP: who may write it, what it refuses, and what the gate reports.

`test_agreement.py` covers the service. This covers the boundary -- the part a client can
reach -- because the registration block carries a family's identifiers and the rule for who
may write them is not the rule that governs the health answers next to them.
"""

from __future__ import annotations

import pytest
from app.services.health.club_terms import CLUB_TERMS_VERSION

VALID_CHILD_ID = "100000009"
VALID_PARENT_ID = "100000017"


def _registration(**overrides):
    body = {
        "child": {
            "national_id": VALID_CHILD_ID,
            "address": "הרצל 12",
            "city": "נתניה",
            "grade": "ג'",
        },
        "signer": {"national_id": VALID_PARENT_ID},
        "other_parent": None,
        "pickup_contacts": [],
    }
    body.update(overrides)
    return body


def _put(client, caller, student_id, **overrides):
    return client.put(
        f"/api/v1/students/{student_id}/agreement/registration",
        json=_registration(**overrides),
        headers=caller.headers,
    )


def _status(client, caller, student_id):
    return client.get(f"/api/v1/students/{student_id}/agreement", headers=caller.headers)


# -- who may write it -------------------------------------------------------------------
def test_a_guardian_saves_their_own_childs_registration(client, as_guardian_of, a_student):
    parent = as_guardian_of(a_student)
    response = _put(client, parent, a_student)
    assert response.status_code == 200
    assert response.json()["registration_complete"] is True


def test_a_manager_may_file_it_on_their_behalf(client, as_manager, a_student):
    """§5.1's paper club -- a manager entering what arrived on a form."""
    assert _put(client, as_manager, a_student).status_code == 200


def test_a_coach_may_not(client, as_lead_coach, a_student):
    """§3.2 gives a coach no write here. They may READ a pickup contact off the student card;
    writing a family's ת.ז. is a different act with a different rule."""
    assert _put(client, as_lead_coach, a_student).status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client, a_student):
    """`require_roles`'s rule: authenticate before you may be told you are not allowed."""
    response = client.put(
        f"/api/v1/students/{a_student}/agreement/registration", json=_registration()
    )
    assert response.status_code == 401


# -- what it refuses --------------------------------------------------------------------
def test_a_bad_check_digit_is_refused_by_field_not_by_value(client, as_guardian_of, a_student):
    parent = as_guardian_of(a_student)
    response = _put(
        client, parent, a_student, child={**_registration()["child"], "national_id": "123456789"}
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "national_id_invalid"
    assert "123456789" not in str(detail), "a 422 body is as loggable as anything else"


@pytest.mark.parametrize("field", ["address", "city", "grade"])
def test_a_blank_required_field_is_refused(client, as_guardian_of, a_student, field):
    parent = as_guardian_of(a_student)
    response = _put(client, parent, a_student, child={**_registration()["child"], field: ""})
    # Pydantic's min_length catches it first; either way nothing is written.
    assert response.status_code == 422


# -- the club's terms -------------------------------------------------------------------
def test_accepting_the_terms_flips_only_that_condition(client, as_guardian_of, a_student):
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": True, "version": CLUB_TERMS_VERSION},
        headers=parent.headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["terms_accepted"] is True
    assert body["registration_complete"] is False, "each condition stands on its own"
    assert body["complete"] is False


def test_a_stale_version_is_refused(client, as_guardian_of, a_student):
    """The client echoes back the version it RENDERED. Recording today's version for a screen
    that showed last month's is how a ledger comes to hold agreements nobody made."""
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": True, "version": CLUB_TERMS_VERSION + 99},
        headers=parent.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "club_terms_version_mismatch"


def test_declining_is_refused_rather_than_recorded_as_a_withdrawal(
    client, as_guardian_of, a_student
):
    """An unticked box on a wizard step is not a considered withdrawal. §11.6's revocation path
    is `POST /privacy/consents`, and routing a blank checkbox there would write a decision the
    family did not make."""
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": False, "version": CLUB_TERMS_VERSION},
        headers=parent.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "club_terms_required"


# -- the gate ---------------------------------------------------------------------------
def test_the_status_route_reports_all_three_conditions(client, as_guardian_of, a_student):
    parent = as_guardian_of(a_student)
    body = _status(client, parent, a_student).json()
    assert set(body) == {
        "health_signed",
        "registration_complete",
        "terms_accepted",
        "complete",
        "club_terms_version",
    }
    assert body["complete"] is False
    assert body["club_terms_version"] == CLUB_TERMS_VERSION


def test_the_gate_opens_only_when_all_three_have_landed(
    client, as_guardian_of, a_student, a_full_template
):
    """The whole point of computing it server-side. Two of three is still blocked."""
    from tests.health.test_declarations import ANSWERS, SIGNATURE_B64

    parent = as_guardian_of(a_student)
    _put(client, parent, a_student)
    client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": True, "version": CLUB_TERMS_VERSION},
        headers=parent.headers,
    )
    assert _status(client, parent, a_student).json()["complete"] is False

    client.post(
        f"/api/v1/students/{a_student}/health-declaration",
        json={
            "template_id": str(a_full_template),
            "answers": ANSWERS,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers=parent.headers,
    )
    body = _status(client, parent, a_student).json()
    assert body["health_signed"] is True
    assert body["complete"] is True
