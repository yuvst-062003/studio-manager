"""SPEC §7's `/students/{id}/health-declaration`, plus dashboard `4e`'s missing list.

**Not `app/routers/health.py`.** That is core's liveness probe, `GET /api/v1/health`, asserted by
`tests/test_health.py`.

**§3.2's matrix is enforced here and never inside a service** (`.claude/rules/api.md`): a service
that checked its own caller would be a service whose guarantees depend on who imported it. Three
different audiences reach these routes and each gets a different rule:

| Route | Who |
|---|---|
| `GET …/health-declaration` | any staff role, or a guardian of that student — **flags only** |
| `POST …/health-declaration` | a guardian of that student, or manager/owner on their behalf |
| `GET …/health-declaration/full` | **manager and owner only**, and every read is audit-logged |
| `GET …/health-declaration/pdf` | a guardian of that student, or manager/owner — the full record |
| `POST …/health-declaration/reminder` | any staff role — §5.5's one-tap, on a coach's roster |
| `GET /health-declarations/summary` | manager and owner — `4e`'s "who is missing one" |

**Nothing here blocks anything on the mat.** §5.5's gate is a hard block in the parent app only,
and it is a client-side route decision made from `health_status`. There is deliberately no
`block_attendance_without_health` setting and no endpoint that could enforce one.

G7: no route in this file logs a request body, and the two that return answers do so only after
`HealthDeclarationService.read_full` has written the audit row.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.health import HealthDeclaration
from app.routers.health_templates import client_ip
from app.schemas.health import (
    HealthDeclarationFullOut,
    HealthDeclarationIn,
    HealthDeclarationOut,
    HealthStatusSummaryOut,
)
from app.services.health.declarations import (
    AnswersIncompleteError,
    DeclarationNotFoundError,
    HealthDeclarationService,
    SignatureNotAPngError,
    SignatureRequiredError,
)

router = APIRouter(tags=["health"])

_STAFF_ROLES = ("owner", "manager", "lead_coach", "assistant_coach")


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such student or declaration"},
    )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "forbidden", "message": "this action is not yours"},
    )


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


def _actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None, str | None]:
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
        client_ip(request),
    )


def _require_signed_in(request: Request) -> None:
    """401 for an anonymous caller, before any 403 can be decided.

    Split out for the reason `require_roles` states: an anonymous caller gets "authenticate" and an
    authenticated one without the right gets "you may not", from every route, whatever order its
    parameters are in.
    """
    if getattr(request.state, "identity_id", None) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )


def _staff_or_guardian(
    request: Request, session: TenantSessionDep, student_id: uuid.UUID
) -> tuple[uuid.UUID | None, uuid.UUID | None, str | None]:
    """§3.2's staff rows **or** §3.3's guardian link. Returns the actor triple.

    A guardian is not a role — §3.3 makes it a `guardian` row and nothing else — so
    `require_roles` cannot express "or the parent of this child" and this does it explicitly.
    """
    _require_signed_in(request)
    person_id, identity_id, ip = _actor(request)
    roles = set(getattr(request.state, "roles", ()) or ())
    if roles & set(_STAFF_ROLES):
        return person_id, identity_id, ip
    if HealthDeclarationService.is_guardian_of(session, person_id=person_id, student_id=student_id):
        return person_id, identity_id, ip
    raise _forbidden()


def _out(row: HealthDeclaration) -> HealthDeclarationOut:
    """The coach-safe projection, built field by field.

    `model_validate(row, from_attributes=True)` would work today and would silently start carrying
    answers the day someone renames the column to `answers`. Naming the fields is the boundary.
    """
    return HealthDeclarationOut(
        id=row.id,
        student_id=row.student_id,
        template_version=row.template_version,
        derived_flags=row.derived_flags or {},
        signed_at=row.signed_at,
        valid_until=row.valid_until,
        has_signature=row.signature_image_encrypted is not None,
        pdf_object_key=row.pdf_object_key,
    )


@router.get("/students/{student_id}/health-declaration", response_model=HealthDeclarationOut)
def read_declaration(
    request: Request, student_id: uuid.UUID, session: TenantSessionDep
) -> HealthDeclarationOut:
    """**Flags, never answers** (§5.5). Any staff role, or a guardian of this student.

    Every staff role reaches it because §5.5's whole point is that a coach is *warned*: a roster
    that could not render the ⚠ would be enforcing a rule about the full record by breaking the
    warning. No audit row: a chip on a roster is not a read of the declaration, and logging it
    would put one row per render per coach into an append-only table, drowning the reads §11.2
    exists to surface.
    """
    _staff_or_guardian(request, session, student_id)
    try:
        row = HealthDeclarationService.require(session, student_id)
    except DeclarationNotFoundError as exc:
        raise _not_found() from exc
    return _out(row)


@router.post(
    "/students/{student_id}/health-declaration",
    response_model=HealthDeclarationOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_declaration(
    request: Request,
    student_id: uuid.UUID,
    body: HealthDeclarationIn,
    session: TenantSessionDep,
) -> HealthDeclarationOut:
    """A guardian of this student, or a manager/owner filing it on their behalf (§5.1).

    A coach is refused: §3.2 gives them no write on a health declaration at all, and a coach who
    could file one could file one that raises no flags.

    The response is the **coach-safe** shape even for the parent who just typed the answers. There
    is no caller who needs them echoed back, and a shape that returned them would be a shape one
    reuse away from a roster.
    """
    _require_signed_in(request)
    person_id, identity_id, ip = _actor(request)
    roles = set(getattr(request.state, "roles", ()) or ())
    is_manager = bool(roles & {"owner", "manager"})
    if not is_manager and not HealthDeclarationService.is_guardian_of(
        session, person_id=person_id, student_id=student_id
    ):
        # A coach lands here too, and correctly: they are signed in and this is not theirs.
        raise _forbidden()
    if person_id is None:
        raise _forbidden()

    try:
        row = HealthDeclarationService.submit(
            session,
            student_id,
            template_id=body.template_id,
            answers=body.answers,
            signature_image_base64=body.signature_image_base64,
            signed_by_person_id=person_id,
            signed_ip=ip,
            signed_user_agent=request.headers.get("user-agent"),
            at=now(),
            actor_identity_id=identity_id,
        )
    except DeclarationNotFoundError as exc:
        raise _not_found() from exc
    except SignatureRequiredError as exc:
        raise _unprocessable("signature_required", str(exc)) from exc
    except SignatureNotAPngError as exc:
        raise _unprocessable("signature_not_a_png", str(exc)) from exc
    except AnswersIncompleteError as exc:
        raise _unprocessable("answers_incomplete", f"unanswered: {exc}") from exc
    except ValueError as exc:
        # `derive_flags` refusing a non-boolean answer to a flag question (§4.3). The message
        # names the question id and no answer.
        raise _unprocessable("flag_answer_not_a_boolean", str(exc)) from exc
    session.commit()
    session.refresh(row)
    return _out(row)


@router.get(
    "/students/{student_id}/health-declaration/full", response_model=HealthDeclarationFullOut
)
def read_declaration_full(
    _: ManagerOrOwner, request: Request, student_id: uuid.UUID, session: TenantSessionDep
) -> HealthDeclarationFullOut:
    """**Manager and owner only, and every read is audit-logged** (§4.3, §11.2).

    The audit row is written by the service, not here — see its docstring. The commit is here
    because the router owns the transaction, and it is the reason a read endpoint commits at all.
    """
    person_id, identity_id, ip = _actor(request)
    try:
        row = HealthDeclarationService.read_full(
            session,
            student_id,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
            actor_ip=ip,
        )
    except DeclarationNotFoundError as exc:
        raise _not_found() from exc
    out = HealthDeclarationFullOut(
        **_out(row).model_dump(),
        answers=dict(row.answers_encrypted or {}),
        signed_by_person_id=row.signed_by_person_id,
        signed_ip=row.signed_ip,
        signed_user_agent=row.signed_user_agent,
    )
    session.commit()
    return out


@router.post(
    "/students/{student_id}/health-declaration/reminder",
    status_code=status.HTTP_202_ACCEPTED,
)
def send_reminder(
    _: AnyStaff, request: Request, student_id: uuid.UUID, session: TenantSessionDep
) -> dict[str, str]:
    """§5.5's one-tap `שלח תזכורת להורה`, which lives on a coach's roster.

    Every staff role, because the roster is where it is pressed. 202 rather than 200: the message
    goes through W5's notification seam, which does not exist yet — the ledger entry is written
    either way, and a 200 would claim a delivery nobody can make.
    """
    person_id, identity_id, ip = _actor(request)
    try:
        sent_at = HealthDeclarationService.record_reminder(
            session,
            student_id,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
            actor_ip=ip,
            at=now(),
        )
    except DeclarationNotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return {"last_reminder_sent_at": sent_at.isoformat()}


@router.get("/health-declarations/summary", response_model=list[HealthStatusSummaryOut])
def status_summary(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[HealthStatusSummaryOut]:
    """Dashboard `4e` — §5.5's 'the manager dashboard lists every student missing one'.

    **No medical content on this response.** Names, statuses and when the parent was last chased;
    not one flag and not one answer. That is why it needs no audit row: nothing medical is
    disclosed by it.
    """
    return HealthDeclarationService.status_summary(session, status=status_filter, limit=limit)


#: Named so a reader of `require_roles`'s call sites finds this file. The dependency objects above
#: are `AnyStaff` and `ManagerOrOwner`; this is the same rule spelled out for the guardian case,
#: which is not a role and cannot be one (§3.3).
_ = require_roles
