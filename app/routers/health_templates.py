"""SPEC §7's write side for `/health-templates` — D11's editable question set.

**This file is not `app/routers/health.py`.** That one is core's liveness probe, `GET
/api/v1/health`, asserted by `tests/test_health.py`. §7 puts M4's routes at `/health-templates`
and `/students/{id}/health-declaration`, which is why there are two filenames rather than one.

**The read side already exists**, in `app/routers/structure.py` (M1, conflict C3), so M3's trial
funnel could find its template before this lane ran. It stays there: moving it is an
OpenAPI-visible change and `web/packages/api-client/` is generated and committed.

**§3.2's matrix, per route.** Manager and owner only — the same row that gives them "Read full
health declaration" and puts the template editor on the manager dashboard (§6.4). A coach who
could reword a question could erase a flag, and a coach sees `derived_flags` and nothing else
(§5.5).

Routers stay thin (G6): parse, call a service, return.
"""

from __future__ import annotations

import ipaddress
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.storage import MAX_UPLOAD_BYTES, ObjectStore, build_object_store
from app.core.tenancy import TenantSessionDep
from app.schemas.health import HealthFormTemplateOut
from app.services.health.templates import (
    HealthTemplateService,
    InvalidSchemaError,
    NothingToPublishError,
    NotThisLanesTemplateError,
    TemplateNotFoundError,
    UnsupportedSourceDocumentError,
)

router = APIRouter(tags=["health"])

_CHUNK = 64 * 1024


def object_store() -> ObjectStore:
    """A dependency rather than a module global, so a test swaps the backend through the same
    seam production resolves through. Same shape as `app/routers/studio.py`."""
    return build_object_store()


ObjectStoreDep = Annotated[ObjectStore, Depends(object_store)]
#: `Annotated`, not a default value: a call in an argument default is evaluated once at import
#: and shared by every request (ruff B008).
SourcePdfUpload = Annotated[UploadFile, File(description="The studio's own declaration, as a PDF.")]


class HealthTemplateSchemaIn(BaseModel):
    """The questions, and only the questions.

    `version` and `kind` are deliberately absent: a client that could set its own version could
    collide with a published one, and the partial unique index would turn a manager's edit into
    an integrity error they cannot act on. The service takes both from the row.
    """

    schema_: dict[str, Any] = Field(alias="schema")


class HealthTemplatePublishedOut(BaseModel):
    """A publish reports the roster it just re-derived.

    Flags are a function of (answers, template version), so publishing invalidates every
    declaration's flags and `recompute_derived_flags` fixes them. Reporting the count is the same
    reasoning `app/workers/followups.py` applies to its undeliverable tally: a publish that said
    nothing about the roster it touched would look identical to one that fixed nothing.
    """

    template: HealthFormTemplateOut
    declarations_recomputed: int


def client_ip(request: Request) -> str | None:
    """`audit_log.actor_ip` is `INET`, so anything that is not an address is `None`.

    Starlette's `request.client.host` is whatever the transport reports, and under
    `TestClient` that is the literal string `"testclient"` -- which Postgres rejects outright,
    taking the whole audited write down with it. A proxy can put arbitrary text there too. §11.2
    wants the address when there is one; a missing address is a worse audit row than a present
    one, and a failed INSERT is worse than both.
    """
    client = request.client
    if client is None:
        return None
    try:
        ipaddress.ip_address(client.host)
    except ValueError:
        return None
    return client.host


def _actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None, str | None]:
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
        client_ip(request),
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such health template"},
    )


def _not_this_lanes() -> HTTPException:
    """409 and not 403. Conflict C3: the row exists and the caller may manage templates — this
    operation does not apply to a `trial` template, which M1 seeded and M3 writes against."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "trial_template_is_not_editable",
            "message": "the trial declaration is seeded and is not edited here",
        },
    )


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


async def _read_capped(upload: UploadFile) -> bytes:
    """The ceiling enforced while reading. A declared Content-Length is a claim, not a
    measurement (app/core/storage.py §2.3)."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(_CHUNK):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise _unprocessable(
                "too_large", f"a declaration form may be at most {MAX_UPLOAD_BYTES} bytes"
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/health-templates/{template_id}", response_model=HealthFormTemplateOut)
def read_health_template(
    _: ManagerOrOwner, template_id: uuid.UUID, session: TenantSessionDep
) -> HealthFormTemplateOut:
    """One template **including its questions**, which the editor cannot work without.

    Additive rather than a change to the list route. `GET /health-templates` lives in
    app/routers/structure.py (M1, conflict C3) and its `HealthTemplateOut` carries `id`, `kind`
    and `version` and nothing else -- deliberately, because M1 owned a file that must never be
    able to hold an answer. Widening it would be an OpenAPI-visible change to a generated,
    committed client for the benefit of one screen; a new route beside it is neither.

    Manager and owner only, matching the list route. A coach sees `derived_flags` (§5.5).
    """
    try:
        row = HealthTemplateService.read(session, template_id)
    except TemplateNotFoundError as exc:
        raise _not_found() from exc
    return HealthFormTemplateOut.model_validate(row, from_attributes=True)


@router.put("/health-templates/{template_id}", response_model=HealthFormTemplateOut)
def edit_health_template(
    _: ManagerOrOwner,
    template_id: uuid.UUID,
    body: HealthTemplateSchemaIn,
    session: TenantSessionDep,
) -> HealthFormTemplateOut:
    """D11 — 'a manager can add, remove and reword questions.'

    **The row that changes is the studio's draft, which may not be the row named in the path.**
    `template_id` names the version being revised; a published version is never edited in place,
    because a declaration signed against it records that version number and would silently come
    to mean something else. The response carries the id that actually moved.

    Nothing a parent signs and nothing a coach sees moves until `POST …/publish`.
    """
    try:
        row = HealthTemplateService.edit_draft(session, template_id, schema=body.schema_, at=now())
    except TemplateNotFoundError as exc:
        raise _not_found() from exc
    except NotThisLanesTemplateError as exc:
        raise _not_this_lanes() from exc
    except InvalidSchemaError as exc:
        raise _unprocessable("invalid_schema", str(exc)) from exc
    session.commit()
    return HealthFormTemplateOut.model_validate(row, from_attributes=True)


@router.post(
    "/health-templates/{template_id}/publish",
    response_model=HealthTemplatePublishedOut,
    status_code=status.HTTP_201_CREATED,
)
def publish_health_template(
    _: ManagerOrOwner,
    template_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> HealthTemplatePublishedOut:
    """201 Created: a publish turns the draft into a new live version — `version + 1`.

    Publishing with no draft is a 409, not a silent success. Re-stamping the live version would
    tell a manager their unsaved edits went out.
    """
    person_id, identity_id, ip = _actor(request)
    try:
        row, recomputed = HealthTemplateService.publish(
            session,
            template_id,
            at=now(),
            actor_person_id=person_id,
            actor_identity_id=identity_id,
            actor_ip=ip,
        )
    except TemplateNotFoundError as exc:
        raise _not_found() from exc
    except NotThisLanesTemplateError as exc:
        raise _not_this_lanes() from exc
    except NothingToPublishError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "nothing_to_publish", "message": "there are no draft questions"},
        ) from exc
    except InvalidSchemaError as exc:
        raise _unprocessable("invalid_schema", str(exc)) from exc
    session.commit()
    return HealthTemplatePublishedOut(
        template=HealthFormTemplateOut.model_validate(row, from_attributes=True),
        declarations_recomputed=recomputed,
    )


@router.post("/health-templates/{template_id}/source-pdf", response_model=HealthFormTemplateOut)
async def upload_source_pdf(
    _: ManagerOrOwner,
    template_id: uuid.UUID,
    session: TenantSessionDep,
    file: SourcePdfUpload,
    store: ObjectStoreDep,
) -> HealthFormTemplateOut:
    """D11 — the studio's own PDF, kept 'for reference'.

    **Nothing parses it back into a question set.** D11 rejected "sign the PDF" outright: a
    signature over an image yields no `derived_flags`, so a coach gets no ⚠ and reading anything
    at all would mean opening the full medical record — the exact opposite of §11.1 and §11.2.
    """
    data = await _read_capped(file)
    try:
        HealthTemplateService.attach_source_pdf(
            session, template_id, data=data, store=store, at=now()
        )
    except TemplateNotFoundError as exc:
        raise _not_found() from exc
    except NotThisLanesTemplateError as exc:
        raise _not_this_lanes() from exc
    except UnsupportedSourceDocumentError as exc:
        raise _unprocessable("not_a_pdf", str(exc)) from exc
    session.commit()
    row = HealthTemplateService.current_full(session)
    return HealthFormTemplateOut.model_validate(row, from_attributes=True)
