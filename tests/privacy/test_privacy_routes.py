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
