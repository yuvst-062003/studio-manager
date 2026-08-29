"""§11.3 and §11.4 reached by the SUBJECT, not only by an operator.

The four routes in `app/routers/privacy.py` were `ManagerOrOwner` and nothing else, so
§11.3's first sentence -- "A guardian requests everything held about their students from
the app" -- had no caller who could make the request. §3.3 makes a guardian a `guardian`
row rather than a role, so `require_roles` cannot express it and the check is explicit.

**And the status these tests care most about is `failed`.** `app/workers/privacy.py`'s two
work functions are named seams that raise on purpose (HB-privacy-worker-unbuilt): the
bundle is not assembled and the purge deletes nothing. So every request a guardian makes
today ends `failed` with a reason, and the API has to say so. A screen that could only
render the happy path would tell a guardian their erasure completed when nothing was
erased -- the one outcome the seam was built to prevent.
"""

from __future__ import annotations

import uuid

from app.core.clock import now
from app.models.audit import AuditLog
from app.models.person import Person
from app.workers.privacy import process_data_exports, process_deletions
from sqlalchemy import select
from tests.privacy.conftest import Caller, PricedStudent


def test_a_guardian_may_export_their_own_data(client, as_guardian: Caller):
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(as_guardian.person_id), "include_audit_trail": True},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"


def test_a_guardian_may_export_their_own_childs_data(
    client, as_guardian: Caller, a_family_with_data: tuple[PricedStudent, PricedStudent]
):
    """§11.3 -- "everything held about their students". The subject is the CHILD's person."""
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(a_family_with_data[0].person_id)},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text


def test_a_guardian_may_not_export_a_child_who_is_not_theirs(
    client, as_guardian: Caller, a_family_with_data: tuple[PricedStudent, PricedStudent]
):
    """`as_guardian` is guardian of the FIRST child only. The sibling is another family's
    child as far as this authorisation check is concerned, and the check is what makes the
    route safe to open to non-staff at all."""
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(a_family_with_data[1].person_id)},
        headers=as_guardian.headers,
    )
    assert response.status_code == 403, response.text


def test_a_stranger_may_not_export_anybody(
    client, as_stranger: Caller, a_family_with_data: tuple[PricedStudent, PricedStudent]
):
    response = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(a_family_with_data[0].person_id)},
        headers=as_stranger.headers,
    )
    assert response.status_code == 403, response.text


def test_a_guardian_may_request_their_own_erasure(client, as_guardian: Caller):
    response = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(as_guardian.person_id), "reason": "gdpr_request"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"


def test_a_guardian_may_not_request_a_strangers_erasure(
    client, as_guardian: Caller, a_family_with_data: tuple[PricedStudent, PricedStudent]
):
    response = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(a_family_with_data[1].person_id), "reason": "gdpr_request"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 403, response.text


def test_the_subjects_own_list_is_theirs_and_only_theirs(
    client,
    as_guardian: Caller,
    as_manager: Caller,
    a_family_with_data: tuple[PricedStudent, PricedStudent],
):
    """§11.3's "where is my export" list, which needs no id kept in browser state.

    A manager's list is the whole studio (§16's operator view); a guardian's is their own
    subjects. Both come off the same route because both are answering the same question
    about a different scope, and two routes would be two authorisation rules to keep in
    step.
    """
    mine = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(as_guardian.person_id)},
        headers=as_guardian.headers,
    )
    assert mine.status_code == 200, mine.text
    theirs = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(a_family_with_data[1].person_id)},
        headers=as_manager.headers,
    )
    assert theirs.status_code == 200, theirs.text

    guardian_list = client.get("/api/v1/privacy/requests", headers=as_guardian.headers)
    assert guardian_list.status_code == 200, guardian_list.text
    guardian_ids = {row["id"] for row in guardian_list.json()["exports"]}
    assert guardian_ids == {mine.json()["job_id"]}

    manager_list = client.get("/api/v1/privacy/requests", headers=as_manager.headers)
    assert manager_list.status_code == 200, manager_list.text
    manager_ids = {row["id"] for row in manager_list.json()["exports"]}
    assert manager_ids == {mine.json()["job_id"], theirs.json()["job_id"]}


def test_a_failed_export_reports_failed_and_carries_its_reason(
    client, as_guardian: Caller, tenant_session
):
    """The worker refuses on purpose, and the API must not launder that into "processing".

    `percent_complete` used to fall through to 50 for every status that was not `pending`
    or `completed`, so a request that had failed reported itself half done -- to the
    guardian waiting for it and to the person who has to answer them.
    """
    created = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(as_guardian.person_id)},
        headers=as_guardian.headers,
    )
    job_id = created.json()["job_id"]

    tally = process_data_exports(tenant_session, at=now())
    tenant_session.commit()
    assert tally.errors == 1
    assert tally.exports_processed == 0

    polled = client.get(f"/api/v1/privacy/export/{job_id}", headers=as_guardian.headers)
    assert polled.status_code == 200, polled.text
    body = polled.json()
    assert body["status"] == "failed"
    assert body["percent_complete"] == 0
    assert body["error"] and "not implemented" in body["error"]

    listed = client.get("/api/v1/privacy/requests", headers=as_guardian.headers).json()
    row = next(item for item in listed["exports"] if item["id"] == job_id)
    assert row["status"] == "failed"
    assert row["error"]
    assert row["has_bundle"] is False


def test_a_failed_deletion_reports_failed_and_the_subject_survives(
    client, as_guardian: Caller, tenant_session, app_session
):
    """§11.4's erasure, refused visibly.

    `deletion_request` carries no constraint that could catch a false success -- "the data
    is gone" is not a column -- so this asserts on the request's reported status AND on the
    subject still being there. A screen that read `completed` off this row would be telling
    a guardian their data was erased while every row of it remained.
    """

    created = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(as_guardian.person_id), "reason": "gdpr_request"},
        headers=as_guardian.headers,
    )
    deletion_id = created.json()["deletion_id"]

    tally = process_deletions(tenant_session, at=now())
    tenant_session.commit()
    assert tally.errors == 1
    assert tally.deletions_processed == 0

    polled = client.get(f"/api/v1/privacy/delete/{deletion_id}", headers=as_guardian.headers)
    assert polled.status_code == 200, polled.text
    assert polled.json()["status"] == "failed"
    assert polled.json()["error"]

    assert app_session.get(Person, as_guardian.person_id) is not None


def test_polling_somebody_elses_request_is_refused(
    client,
    as_manager: Caller,
    as_guardian: Caller,
    a_family_with_data: tuple[PricedStudent, PricedStudent],
):
    """Opening POST to guardians opens GET too, and an id is a guess away.

    A `data_export_request` id names a subject; answering with its status to anyone holding
    the UUID would make the id itself the authorisation.
    """
    theirs = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(a_family_with_data[1].person_id)},
        headers=as_manager.headers,
    )
    job_id = theirs.json()["job_id"]
    response = client.get(f"/api/v1/privacy/export/{job_id}", headers=as_guardian.headers)
    assert response.status_code == 403, response.text


def test_an_unknown_request_is_not_found_rather_than_forbidden(client, as_manager: Caller):
    response = client.get(f"/api/v1/privacy/export/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404, response.text


def test_requests_need_a_signed_in_caller(client):
    assert client.get("/api/v1/privacy/requests").status_code == 401


def test_the_export_request_is_audited(client, as_guardian: Caller, app_session):
    """§11.2 lists a data export among the always-audited actions, and §4.3 keeps two
    people on the row so a manager-initiated export is distinguishable from the
    guardian's own. The audit entry is what makes that distinction readable."""

    created = client.post(
        "/api/v1/privacy/export",
        json={"person_id": str(as_guardian.person_id)},
        headers=as_guardian.headers,
    )
    entry = app_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "data_export_request",
            AuditLog.entity_id == uuid.UUID(created.json()["job_id"]),
        )
    ).scalar_one()
    assert entry.action == "privacy.export_requested"
    assert entry.actor_person_id == as_guardian.person_id


def test_the_deletion_request_is_audited(client, as_guardian: Caller, app_session):

    created = client.post(
        "/api/v1/privacy/delete",
        json={"person_id": str(as_guardian.person_id), "reason": "gdpr_request"},
        headers=as_guardian.headers,
    )
    entry = app_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "deletion_request",
            AuditLog.entity_id == uuid.UUID(created.json()["deletion_id"]),
        )
    ).scalar_one()
    assert entry.action == "privacy.deletion_requested"
    assert entry.diff is not None and entry.diff.get("reason") == "gdpr_request"
