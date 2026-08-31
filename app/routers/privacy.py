"""§11's privacy surface: the consent gate, the subject-access export, the erasure request.

Privacy lane owns:
- Consent (§6.1 step 5, §11.6): read what a person has agreed to and append what they now
  agree to. **`consent_record` was written by exactly one place in the product before this
  file existed** -- `app/services/events/rsvp.py`'s per-event competition consent -- so of
  the five `CONSENT_TYPES` only `event` was ever written and no guardian had ever accepted
  terms or a privacy policy.
- Data export (§11.3): async job that materializes all personal data into a downloadable
  archive.
- Deletion requests (§11.4): enqueue a task to purge a person's data within legal
  retention windows.

**Authorisation is decided here and never inside a service** (`.claude/rules/api.md`).
Three audiences reach these routes:

| Route | Who |
|---|---|
| `GET/POST /privacy/consents` | any signed-in person, about THEMSELVES only |
| `POST /privacy/export`, `/delete` | the subject, their guardian, or manager/owner |
| `GET /privacy/export/{id}`, `/delete/{id}` | whoever may act for that request's subject |
| `GET /privacy/requests` | the caller's own subjects; the whole studio for manager/owner |

The four request routes used to be `ManagerOrOwner` and nothing else, which left §11.3's
first sentence -- "A guardian requests everything held about their students from the app"
-- with no caller who could make the request. §3.3 makes a guardian a `guardian` row rather
than a role, so `require_roles` cannot express it; `PrivacyService.may_act_for` runs the
join and this file calls it.

**Nothing here reports a success the worker did not achieve.** `app/workers/privacy.py`'s
two work functions raise on purpose, so a request made today ends `failed` with a reason,
and `error` is on every response shape for that reason. `percent_complete` used to fall
through to 50 for any status that was not `pending` or `completed`, which told a guardian
whose export had failed that it was half done.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.services.privacy import (
    POLICY_IS_DRAFT,
    POLICY_VERSION,
    POLICY_VERSION_LABEL,
    REQUIRED_CONSENT_TYPES,
    ConsentService,
    PolicyVersionMismatchError,
    PrivacyService,
    UngrantableConsentError,
)

router = APIRouter(prefix="/privacy", tags=["privacy"])

_MANAGER_ROLES = frozenset({"owner", "manager"})


# -- request/response shapes -------------------------------------------------------


class ConsentRecordOut(BaseModel):
    """One decision in §11.6's ledger. Never an aggregate: two acceptances are two rows."""

    consent_type: str
    version: int
    granted: bool
    granted_at: str
    revoked_at: str | None


class PolicyOut(BaseModel):
    """The published policy's identity, and nothing about any person.

    The three fields `ConsentStateOut` already carries, split out so a reader who is not
    signed in can have them: the staff sign-in footer's legal screens render before there
    is an identity or a studio to scope to.
    """

    policy_version: int
    policy_version_label: str
    policy_is_draft: bool


class ConsentStateOut(BaseModel):
    """What §6.1 step 5's gate reads, and what the privacy screen renders.

    `policy_is_draft` and `policy_version_label` are on the wire rather than hardcoded in
    the client so the draft banner cannot be left behind on a screen after the reviewed
    text lands. The banner is data.
    """

    policy_version: int
    policy_version_label: str
    policy_is_draft: bool
    required: list[str]
    outstanding: list[str]
    records: list[ConsentRecordOut]


class ConsentGrantIn(BaseModel):
    """`version` is the one the CLIENT rendered, not a suggestion.

    A mismatch is a 409: recording the server's current version for a screen that showed
    the previous one is how a consent ledger comes to hold agreements nobody made.
    """

    version: int
    grants: dict[str, bool] = Field(min_length=1)


class DataExportRequestIn(BaseModel):
    """Request to export a person's personal data."""

    person_id: uuid.UUID
    include_audit_trail: bool = True


class DataExportResponse(BaseModel):
    """Response with export job status."""

    job_id: uuid.UUID
    status: str  # pending, running, completed, failed, expired
    percent_complete: int
    expires_at: str | None
    #: Why it failed, for the person who has to answer the guardian. Never the contents.
    error: str | None = None


class DeletionRequestIn(BaseModel):
    """Request to delete a person's personal data."""

    person_id: uuid.UUID
    reason: str


class DeletionResponse(BaseModel):
    """Response confirming deletion request."""

    deletion_id: uuid.UUID
    status: str  # pending, running, completed, failed
    person_id: uuid.UUID
    error: str | None = None


class PrivacyRequestOut(BaseModel):
    """One row of §11.3's "where is my export" list, and of §16's operator queue.

    `has_bundle` and not `object_key`: §8.1 keeps the bundle in object storage and the key
    is the pointer to a child's complete record. A screen needs to know whether a download
    exists, and the download is authorised per request rather than by holding the key.
    """

    id: uuid.UUID
    kind: str  # export | deletion
    subject_person_id: uuid.UUID
    requested_by_person_id: uuid.UUID
    status: str
    error: str | None
    reason: str | None
    has_bundle: bool
    created_at: str
    completed_at: str | None


class PrivacyRequestsOut(BaseModel):
    exports: list[PrivacyRequestOut]
    deletions: list[PrivacyRequestOut]


# -- shared helpers ----------------------------------------------------------------


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "unauthenticated", "message": "sign in first"},
    )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "forbidden", "message": "this action is not yours"},
    )


def _client_ip(request: Request) -> str | None:
    """§11.6 -- `consent_record.ip`. Whatever the request had, unvalidated.

    `AuditService` sanitises its own copy (`audit_log.actor_ip` is `INET` and rejects
    `testclient`); `consent_record.ip` is a `VARCHAR(45)`, so it keeps whatever arrived.
    """
    return request.client.host if request.client else None


def _require_person(request: Request) -> uuid.UUID:
    """The signed-in person, or 401.

    Split from the authorisation checks for the reason `require_roles` states: an
    anonymous caller gets "authenticate" and an authenticated one without the right gets
    "you may not", from every route, whatever order its parameters are in.
    """
    person_id = getattr(request.state, "person_id", None)
    if getattr(request.state, "identity_id", None) is None or not isinstance(person_id, uuid.UUID):
        raise _unauthenticated()
    return person_id


def _identity_id(request: Request) -> uuid.UUID | None:
    identity_id = getattr(request.state, "identity_id", None)
    return identity_id if isinstance(identity_id, uuid.UUID) else None


def _is_manager(request: Request) -> bool:
    return bool(set(getattr(request.state, "roles", ()) or ()) & _MANAGER_ROLES)


def _authorise_subject(
    request: Request, session: TenantSessionDep, subject_person_id: uuid.UUID
) -> uuid.UUID:
    """401 for anonymous, 403 for a caller this subject is not theirs to act for."""
    actor = _require_person(request)
    if not PrivacyService.may_act_for(
        session,
        actor_person_id=actor,
        subject_person_id=subject_person_id,
        is_manager=_is_manager(request),
    ):
        raise _forbidden()
    return actor


def _consent_state(session: TenantSessionDep, person_id: uuid.UUID) -> ConsentStateOut:
    return ConsentStateOut(
        policy_version=POLICY_VERSION,
        policy_version_label=POLICY_VERSION_LABEL,
        policy_is_draft=POLICY_IS_DRAFT,
        required=list(REQUIRED_CONSENT_TYPES),
        outstanding=ConsentService.outstanding(session, person_id=person_id),
        records=[
            ConsentRecordOut(
                consent_type=row.consent_type,
                version=row.version,
                granted=row.granted,
                granted_at=row.granted_at.isoformat(),
                revoked_at=row.revoked_at.isoformat() if row.revoked_at else None,
            )
            for row in ConsentService.history(session, person_id=person_id)
        ],
    )


# -- §6.1 step 5 / §11.6 -----------------------------------------------------------


@router.get("/policy", response_model=PolicyOut)
def read_policy() -> PolicyOut:
    """Which policy text is published, for a reader who is not signed in.

    The staff sign-in's footer links to the terms and the privacy policy, and the person
    reading them there is anonymous by definition -- so `GET /consents` cannot serve that
    screen: it needs an identity and a studio, and it would 401.

    Deliberately NOT `TenantSessionDep`, and deliberately touches no table. The three
    values are module constants describing the text every studio is shown; scoping them to
    a tenant would be scoping a global to something that does not vary by it, and would
    make a public route fail closed on a studio it never needed.

    The draft flag is on the wire for the reason `ConsentStateOut` states: the banner is
    data, so it cannot be left behind on a screen after the reviewed text lands.
    """
    return PolicyOut(
        policy_version=POLICY_VERSION,
        policy_version_label=POLICY_VERSION_LABEL,
        policy_is_draft=POLICY_IS_DRAFT,
    )


@router.get("/consents", response_model=ConsentStateOut)
def read_consents(request: Request, session: TenantSessionDep) -> ConsentStateOut:
    """What §6.1 step 5's blocking gate reads, about the CALLER and nobody else.

    No `person_id` parameter, deliberately. A consent is a thing a person did, and a route
    that could report anyone's would be a route whose authorisation rule had to be argued
    for. The operator's view of another person's consents belongs on §16's screen, reading
    §11.2's audit trail.
    """
    return _consent_state(session, _require_person(request))


@router.post("/consents", response_model=ConsentStateOut)
def grant_consents(
    body: ConsentGrantIn, request: Request, session: TenantSessionDep
) -> ConsentStateOut:
    """Append §6.1 step 5's acceptance -- one row per consent, never an update.

    A withdrawal is the same call with `false`, and it puts the gate back in front of the
    app. That is the honest consequence and not a bug: without the privacy consent the
    product may not process the family's data, and "a consent that cannot be withdrawn is
    not consent" (`ConsentRecord`'s docstring).
    """
    person_id = _require_person(request)
    try:
        ConsentService.record(
            session,
            person_id=person_id,
            grants=body.grants,
            version=body.version,
            at=now(),
            ip=_client_ip(request),
            actor_identity_id=_identity_id(request),
            studio_id=require_current_studio_id(),
        )
    except PolicyVersionMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "policy_version_stale",
                "message": "the policy on screen is no longer the published one",
                "current_version": exc.current,
            },
        ) from exc
    except UngrantableConsentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "consent_type_not_grantable", "message": str(exc)},
        ) from exc
    state = _consent_state(session, person_id)
    session.commit()
    return state


# -- §11.3 -------------------------------------------------------------------------


def _export_percent(status_value: str) -> int:
    """`failed` and `expired` are 0, and that is the whole point of this function.

    The previous expression was `0 if pending else 100 if completed else 50`, so a request
    that had FAILED reported itself half done -- to the guardian waiting for it and to the
    person who has to answer them. `expired` is 0 too: §11.3's link is gone and a
    re-request is the remedy, so there is no progress left to report.
    """
    return {"pending": 0, "running": 50, "completed": 100, "failed": 0, "expired": 0}.get(
        status_value, 0
    )


@router.post("/export", response_model=DataExportResponse)
def request_data_export(
    body: DataExportRequestIn,
    request: Request,
    session: TenantSessionDep,
) -> DataExportResponse:
    """§11.3 -- the subject, their guardian, or a manager acting for either.

    Returns a job ID. Client polls `/export/{job_id}`, or reads `/privacy/requests`, which
    needs no id kept in browser state.
    """
    actor = _authorise_subject(request, session, body.person_id)
    service = PrivacyService(session)
    try:
        export = service.request_data_export(
            subject_person_id=body.person_id,
            requested_by_person_id=actor,
            include_audit_trail=body.include_audit_trail,
            actor_identity_id=_identity_id(request),
            actor_ip=_client_ip(request),
        )
    except ValueError as exc:
        # A person id that is not in this studio. 404 rather than 403: the tenant session
        # has already established that this caller cannot see the row, and distinguishing
        # "no such person" from "not yours" would confirm the id exists somewhere.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such person"},
        ) from exc
    response = DataExportResponse(
        job_id=export.id,
        status=export.status,
        percent_complete=_export_percent(export.status),
        expires_at=None,
        error=export.error,
    )
    session.commit()
    return response


@router.get("/export/{job_id}", response_model=DataExportResponse)
def get_export_status(
    job_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> DataExportResponse:
    """Poll status of a data export job.

    Authorised against the request's SUBJECT. Opening POST to guardians opens GET too, and
    a UUID is a guess away -- answering with a status to anyone holding the id would make
    the id itself the authorisation.
    """
    _require_person(request)
    service = PrivacyService(session)
    export = service.get_export_status(job_id)
    if not export:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Export job not found"},
        )
    _authorise_subject(request, session, export.subject_person_id)
    return DataExportResponse(
        job_id=export.id,
        status=export.status,
        percent_complete=_export_percent(export.status),
        expires_at=None,
        error=export.error,
    )


# -- §11.4 -------------------------------------------------------------------------


@router.post("/delete", response_model=DeletionResponse)
def request_deletion(
    body: DeletionRequestIn,
    request: Request,
    session: TenantSessionDep,
) -> DeletionResponse:
    """§11.4 -- the subject, their guardian, or a manager acting for either.

    Enqueues a task to delete data within retention window constraints (financial records
    are retained per Israeli law and the person is anonymized rather than deleted). The
    worker's `purge_subject_data` raises until it is built, so this request will end
    `failed` -- which is what `GET /privacy/requests` reports and what the screen shows.
    """
    actor = _authorise_subject(request, session, body.person_id)
    service = PrivacyService(session)
    try:
        deletion = service.request_deletion(
            subject_person_id=body.person_id,
            requested_by_person_id=actor,
            reason=body.reason,
            actor_identity_id=_identity_id(request),
            actor_ip=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such person"},
        ) from exc
    response = DeletionResponse(
        deletion_id=deletion.id,
        status=deletion.status,
        person_id=deletion.subject_person_id,
        error=deletion.error,
    )
    session.commit()
    return response


@router.get("/delete/{deletion_id}", response_model=DeletionResponse)
def get_deletion_status(
    deletion_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> DeletionResponse:
    """Poll status of a deletion request. Authorised against its subject -- see `/export/{id}`."""
    _require_person(request)
    service = PrivacyService(session)
    deletion = service.get_deletion_status(deletion_id)
    if not deletion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Deletion request not found"},
        )
    _authorise_subject(request, session, deletion.subject_person_id)
    return DeletionResponse(
        deletion_id=deletion.id,
        status=deletion.status,
        person_id=deletion.subject_person_id,
        error=deletion.error,
    )


# -- the list both screens read ----------------------------------------------------


@router.get("/requests", response_model=PrivacyRequestsOut)
def list_requests(request: Request, session: TenantSessionDep) -> PrivacyRequestsOut:
    """§11.3's "where is my export", and §16's operator queue, from one route.

    A manager sees every request in the studio; anyone else sees their own subjects'. Both
    are answering the same question about a different scope, and two routes would be two
    authorisation rules to keep in step.
    """
    actor = _require_person(request)
    scope = None if _is_manager(request) else PrivacyService.subject_person_ids_for(session, actor)
    service = PrivacyService(session)
    return PrivacyRequestsOut(
        exports=[
            PrivacyRequestOut(
                id=row.id,
                kind="export",
                subject_person_id=row.subject_person_id,
                requested_by_person_id=row.requested_by_person_id,
                status=row.status,
                error=row.error,
                reason=None,
                has_bundle=row.object_key is not None,
                created_at=row.created_at.isoformat(),
                completed_at=row.completed_at.isoformat() if row.completed_at else None,
            )
            for row in service.list_exports(scope)
        ],
        deletions=[
            PrivacyRequestOut(
                id=row.id,
                kind="deletion",
                subject_person_id=row.subject_person_id,
                requested_by_person_id=row.requested_by_person_id,
                status=row.status,
                error=row.error,
                reason=row.reason,
                has_bundle=False,
                # §11.4 has no `completed_at` column and none may be added -- the worker's
                # own docstring explains that `updated_at` carries the instant, written by
                # the database on the status change rather than by a caller's clock.
                created_at=row.created_at.isoformat(),
                completed_at=(
                    row.updated_at.isoformat() if row.status in ("completed", "failed") else None
                ),
            )
            for row in service.list_deletions(scope)
        ],
    )
