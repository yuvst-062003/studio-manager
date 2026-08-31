"""Privacy/GDPR endpoint tests."""

import uuid

from tests.privacy.conftest import Caller


def test_request_data_export_as_manager(
    client,
    as_manager: Caller,
    a_family_with_data,
):
    """Manager can request GDPR data export for a person."""
    person_id = a_family_with_data[0].person_id

    response = client.post(
        "/api/v1/privacy/export",
        json={
            "person_id": str(person_id),
            "include_audit_trail": True,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"
    assert data["percent_complete"] == 0
    assert "job_id" in data


def test_export_status_check(
    client,
    as_manager: Caller,
    a_family_with_data,
):
    """Manager can check export job status."""
    person_id = a_family_with_data[0].person_id

    # First create an export request
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(person_id), "include_audit_trail": True},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    job_id = response.json()["job_id"]

    # Then check its status
    response = client.get(
        f"/api/v1/privacy/export/{job_id}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "pending"


def test_request_deletion_as_manager(
    client,
    as_manager: Caller,
    a_family_with_data,
):
    """Manager can request data deletion for a person."""
    person_id = a_family_with_data[0].person_id

    response = client.post(
        "/api/v1/privacy/delete",
        json={
            "person_id": str(person_id),
            "reason": "account_closure",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"
    assert data["person_id"] == str(person_id)
    assert "deletion_id" in data


def test_deletion_status_check(
    client,
    as_manager: Caller,
    a_family_with_data,
):
    """Manager can check deletion request status."""
    person_id = a_family_with_data[0].person_id

    # First create a deletion request
    response = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(person_id), "reason": "account_closure"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    deletion_id = response.json()["deletion_id"]

    # Then check its status
    response = client.get(
        f"/api/v1/privacy/delete/{deletion_id}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["deletion_id"] == deletion_id
    assert data["status"] == "pending"


def test_privacy_routes_require_auth(client):
    """Unauthenticated requests are rejected."""
    # Export request
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(uuid.uuid4())},
    )
    assert response.status_code == 401

    # Deletion request
    response = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(uuid.uuid4()), "reason": "test"},
    )
    assert response.status_code == 401


def test_policy_is_readable_without_signing_in(client):
    """The staff sign-in footer's legal screens render before there is an account.

    `GET /privacy/consents` cannot serve them -- it needs an identity and a studio, and
    answers an anonymous caller with a 401. This route exists so the two documents can be
    read by the person deciding whether to sign in at all.
    """
    response = client.get("/api/v1/privacy/policy")

    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["policy_version"], int)
    assert isinstance(body["policy_version_label"], str)
    assert body["policy_version_label"]
    assert isinstance(body["policy_is_draft"], bool)


def test_policy_reports_the_same_version_the_consent_gate_records(client, as_manager: Caller):
    """One published version, two readers.

    The anonymous screen and the signed-in consent gate must never disagree about which
    text is current: a footer offering v0 while the gate records v1 is a consent ledger
    holding agreements to a document nobody was shown.
    """
    public = client.get("/api/v1/privacy/policy").json()
    gated = client.get("/api/v1/privacy/consents", headers=as_manager.headers).json()

    assert public["policy_version"] == gated["policy_version"]
    assert public["policy_version_label"] == gated["policy_version_label"]
    assert public["policy_is_draft"] == gated["policy_is_draft"]


def test_policy_says_nothing_about_any_person(client, as_manager: Caller):
    """A public route that leaked a consent record would be a privacy bug in the privacy
    router. The shape is asserted, not just the fields read above."""
    body = client.get("/api/v1/privacy/policy").json()

    assert set(body) == {"policy_version", "policy_version_label", "policy_is_draft"}
