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


def test_a_manager_may_file_it_on_their_behalf(client, as_manager, as_guardian_of, a_student):
    """§5.1's paper club -- a manager entering what arrived on a form.

    The guardian fixture is not decoration: the agreement records a PARENT's ת.ז. and a
    PARENT's acceptance, so a student with nobody on record has no signature for a manager to
    transcribe. See the refusal asserted below."""
    as_guardian_of(a_student)
    assert _put(client, as_manager, a_student).status_code == 200


def test_filing_for_a_student_with_no_guardian_is_refused(client, as_manager, a_student):
    """Refused rather than filed against the member of staff.

    The alternative -- falling back to the caller -- is precisely the bug the subject/actor
    split exists to prevent, and it would be silent: a manager's own `person` row quietly
    collecting one family's national identifier after another."""
    response = _put(client, as_manager, a_student)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_guardian"


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


# -- §5.1's paper club: a manager filing on the family's behalf --------------------------
def test_a_manager_filing_writes_the_parents_id_not_their_own(
    client, as_manager, as_guardian_of, a_student, app_session
):
    """**The bug this exists to prevent.** `signer.national_id` is the PARENT's. Attributing it
    to whoever posted would write a different family's national identifier onto the manager's
    own `person` row every time the office typed a form in."""
    from app.models.person import Person

    parent = as_guardian_of(a_student)
    assert _put(client, as_manager, a_student).status_code == 200

    app_session.expire_all()
    manager_row = app_session.get(Person, as_manager.person_id)
    parent_row = app_session.get(Person, parent.person_id)
    assert manager_row.national_id_encrypted is None, "the office is not the signatory"
    assert parent_row.national_id_encrypted is not None


def test_a_manager_accepting_the_terms_unblocks_the_family(
    client, as_manager, as_guardian_of, a_student
):
    """**The other half of the same bug.** The gate checks whether the PARENT holds the club's
    terms. A consent recorded against the manager would leave the family blocked for ever,
    however many forms the office typed in -- the exact outcome §5.1's path exists to avoid."""
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": True, "version": CLUB_TERMS_VERSION},
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    # Asked as the PARENT, which is the reading that matters.
    assert _status(client, parent, a_student).json()["terms_accepted"] is True


def test_a_guardian_filing_is_still_their_own_signature(
    client, as_guardian_of, a_student, app_session
):
    """The ordinary path is unchanged: when the person typing IS the guardian, they are the
    subject, and no lookup happens."""
    from app.models.person import Person

    parent = as_guardian_of(a_student)
    assert _put(client, parent, a_student).status_code == 200
    app_session.expire_all()
    assert app_session.get(Person, parent.person_id).national_id_encrypted is not None


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


# -- who may collect the child, and who may read the funding figures ---------------------
def _with_pickups(client, caller, student_id):
    return client.put(
        f"/api/v1/students/{student_id}/agreement/registration",
        json=_registration(
            pickup_contacts=[
                {"name": "סבתא רותי", "phone": "050-1111111", "relation": "סבתא"},
                {"name": "דוד יוסי", "phone": "050-2222222"},
            ],
            signer={"national_id": VALID_PARENT_ID, "aliyah_year": "2019"},
        ),
        headers=caller.headers,
    )


def test_a_coach_can_read_who_may_collect_the_child(
    client, as_guardian_of, as_lead_coach, a_student
):
    """**The reason this field exists at all.** A pickup contact only does its job if the
    person at the door can read it. Storing it behind the manager-only health rule would have
    made it write-only data -- which is exactly why it lives on its own table rather than in
    `health_declaration.answers_encrypted`."""
    parent = as_guardian_of(a_student)
    assert _with_pickups(client, parent, a_student).status_code == 200

    response = client.get(
        f"/api/v1/students/{a_student}/registration", headers=as_lead_coach.headers
    )
    assert response.status_code == 200
    names = [c["name"] for c in response.json()["pickup_contacts"]]
    assert names == ["סבתא רותי", "דוד יוסי"]


def test_a_coach_is_not_shown_the_aliyah_year(
    client, as_guardian_of, as_lead_coach, a_student
):
    """National-origin data, collected for the עמותה's funding return. A coach at the door
    has no use for it. `None` rather than `[]`, so "not shown to you" stays distinguishable
    from "this family gave none"."""
    parent = as_guardian_of(a_student)
    _with_pickups(client, parent, a_student)
    body = client.get(
        f"/api/v1/students/{a_student}/registration", headers=as_lead_coach.headers
    ).json()
    assert body["aliyah_years"] is None


def test_a_manager_sees_the_aliyah_year(client, as_guardian_of, as_manager, a_student):
    parent = as_guardian_of(a_student)
    _with_pickups(client, parent, a_student)
    body = client.get(
        f"/api/v1/students/{a_student}/registration", headers=as_manager.headers
    ).json()
    assert body["aliyah_years"] == ["2019"]


def test_a_guardian_may_not_read_it_through_the_staff_route(
    client, as_guardian_of, a_student
):
    """`AnyStaff`. A parent reads their own family through the agreement flow, not through
    the door surface -- and a route a guardian could call is a route that would need its own
    'is this your child' check to stop it becoming a directory."""
    parent = as_guardian_of(a_student)
    assert (
        client.get(f"/api/v1/students/{a_student}/registration", headers=parent.headers).status_code
        == 403
    )


def test_a_nameless_contact_never_reaches_the_door(
    client, as_guardian_of, as_lead_coach, a_student
):
    parent = as_guardian_of(a_student)
    client.put(
        f"/api/v1/students/{a_student}/agreement/registration",
        json=_registration(pickup_contacts=[{"name": "  ", "phone": "050-9999999"}]),
        headers=parent.headers,
    )
    body = client.get(
        f"/api/v1/students/{a_student}/registration", headers=as_lead_coach.headers
    ).json()
    assert body["pickup_contacts"] == []


# -- the stall this feature shipped with -------------------------------------------------
def test_signing_a_superseded_template_is_refused_rather_than_accepted(
    client, as_guardian_of, a_student, a_full_template, app_session, as_manager
):
    """**Reported from staging: "stuck on שלב 2/3".**

    A studio holds every version it has published — v1 from the bundled questionnaire, v2 from
    the club's own form. The parent client took `items[0]` off a list ordered only by `kind`,
    so it could hand a family the SUPERSEDED form. They signed it, `health_status` became
    `signed`, and `agreement_status` — which counts a declaration only at the current version —
    still said no. Step 2 asked again, forever, with nothing on screen to explain why.

    Accepting the signature is what makes it a dead end, so the server refuses it and says
    which version is current. A loop with no error is the one outcome a hard gate cannot have.
    """
    from app.models.health import HealthFormTemplate
    from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA
    from tests.health.test_declarations import ANSWERS, SIGNATURE_B64

    superseded = app_session.get(HealthFormTemplate, a_full_template)
    newer = HealthFormTemplate(
        studio_id=as_manager.studio_id,
        kind="full",
        version=superseded.version + 1,
        schema={**FULL_TEMPLATE_SCHEMA, "version": superseded.version + 1},
        published_at=superseded.published_at,
    )
    app_session.add(newer)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/students/{a_student}/health-declaration",
        json={
            "template_id": str(a_full_template),
            "answers": ANSWERS,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers=parent.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "template_superseded"


def test_the_template_list_puts_the_current_version_first(
    client, as_guardian_of, a_student, a_full_template, app_session, as_manager
):
    """The other half. The client picks the highest version itself now, but a list whose order
    depends on the query planner is a trap for the next caller that trusts `items[0]`."""
    from app.models.health import HealthFormTemplate
    from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA

    superseded = app_session.get(HealthFormTemplate, a_full_template)
    app_session.add(
        HealthFormTemplate(
            studio_id=as_manager.studio_id,
            kind="full",
            version=superseded.version + 1,
            schema={**FULL_TEMPLATE_SCHEMA, "version": superseded.version + 1},
            published_at=superseded.published_at,
        )
    )
    app_session.commit()

    parent = as_guardian_of(a_student)
    items = client.get(
        "/api/v1/health-templates?kind=full", headers=parent.headers
    ).json()["items"]
    assert items[0]["version"] == superseded.version + 1


def test_signing_the_current_template_opens_the_gate(
    client, as_guardian_of, a_student, a_full_template
):
    """The happy path, asserted end to end: the thing that was supposed to happen on staging."""
    from tests.health.test_declarations import ANSWERS, SIGNATURE_B64

    parent = as_guardian_of(a_student)
    _put(client, parent, a_student)
    client.post(
        f"/api/v1/students/{a_student}/agreement/club-terms",
        json={"accepted": True, "version": CLUB_TERMS_VERSION},
        headers=parent.headers,
    )
    assert (
        client.post(
            f"/api/v1/students/{a_student}/health-declaration",
            json={
                "template_id": str(a_full_template),
                "answers": ANSWERS,
                "signature_image_base64": SIGNATURE_B64,
            },
            headers=parent.headers,
        ).status_code
        == 201
    )
    assert _status(client, parent, a_student).json()["complete"] is True
