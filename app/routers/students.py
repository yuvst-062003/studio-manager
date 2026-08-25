"""SPEC §7's `/students` and `/me/students`.

**The `coach` tag is per-route, not per-router.** `.claude/rules/api.md`: "A router serving
coaches is tagged `coach`. SPEC §13's third invariant -- no coach-scoped endpoint returns
any financial field -- is enforced against that tag, so an untagged coach router is an
unguarded one." Staff `9c` and `9h` make the reads here coach-reachable, so those routes
carry the tag.

The writes deliberately do **not**. `tests/invariants/test_03`'s detector matches a
response property against `^price`, which makes `price_plan_id` a financial field as far
as the gate is concerned -- whatever `StudentOut`'s own docstring intended by it. So the
coach-reachable reads return `StudentSummaryOut` / `StudentDetailOut`, neither of which has
the field, and `StudentOut` appears only behind `ManagerOrOwner`. Tagging the whole router
would have made invariant 3 red for `GET /students/{id}` on the day this landed, and the
fix would have been to weaken either the tag or the shape.

**§3.2's viewer split is resolved once, in a dependency**, and handed to the service as
`viewer_group_ids`. Authorization stays in the router; what the service receives is a
scope, not a caller -- which is what lets the follow-up worker call the same methods with
no request anywhere in sight.

Every route takes `TenantSessionDep`, which fails closed. That is why nothing here passes a
`studio_id`, and why a cross-studio reference is 404 rather than 403: the row is invisible,
not merely forbidden, and a 403 would confirm it exists.
"""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSession, TenantSessionDep
from app.models.people import Student
from app.models.person import Person
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.people import (
    GuardianCreate,
    GuardianListResponse,
    GuardianOut,
    RegistrationRequestOut,
    SiblingRequestIn,
    StudentConvertIn,
    StudentCreate,
    StudentCreateResult,
    StudentDetailOut,
    StudentFreezeIn,
    StudentLeaveIn,
    StudentMarkLostIn,
    StudentOut,
    StudentPricePlanOut,
    StudentStatusHistoryListResponse,
    StudentSummaryOut,
    StudentSummaryPage,
    StudentUpdate,
)
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader
from app.services.people.registrations import RegistrationService
from app.services.people.students import StudentRow, StudentService
from app.services.schedule import ScheduleService

router = APIRouter(tags=["people"])


def schedule_reader() -> ScheduleReader:
    """L5's seam, behind one indirection -- the same shape `app/routers/public.py` uses.

    A module-level factory rather than a `ScheduleService()` call inside each route, so a
    test substitutes a reader by patching one name instead of reaching into the shared
    service class. A function-local import cannot be patched at all, which is how the first
    version of this silently kept calling the real seam.
    """
    return ScheduleService()


#: SPEC §7 lists `/me/students` beside `/students`, and both live here. The tag that
#: matters is per-route; see the module docstring.
COACH: list[str | Enum] = ["people", "coach"]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such student"},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail={"code": "conflict", "message": message}
    )


def _refused(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


def _schedule_unavailable() -> HTTPException:
    """L5's seam, surfaced honestly rather than as a stack trace
    (`.claude/rules/api.md`). This arm disappears when lane SCHEDULE merges."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "schedule_unavailable",
            "message": "the club's schedule has not been built yet",
        },
    )


def _person_id(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def viewer_scope(request: Request, session: TenantSessionDep) -> list[uuid.UUID] | None:
    """§3.2 -- `None` for owner and manager, a group list for a coach.

    Read from the verified JWT's `roles` claim and `group_staff`. Resolved here rather
    than inside the service because it is an authorization decision, and
    `.claude/rules/api.md` puts those in the router.
    """
    roles = set(getattr(request.state, "roles", ()) or ())
    return StudentService.viewer_group_ids(session, person_id=_person_id(request), roles=roles)


ViewerScope = Annotated[list[uuid.UUID] | None, Depends(viewer_scope)]


def _summary(row: StudentRow) -> StudentSummaryOut:
    return StudentSummaryOut(**row.__dict__)


def _detail(session: TenantSession, student: Student, person: Person) -> StudentDetailOut:
    """§5.3's guardians, ordered primary-first because that is the order `2c` and `4a`
    render them in -- not because the primary is privileged. L8: nothing branches."""
    from sqlalchemy import select

    from app.models.person import Guardian

    guardians = session.execute(
        select(Guardian, Person)
        .join(Person, Guardian.person_id == Person.id)
        .where(Guardian.student_id == student.id)
        .order_by(Guardian.is_primary.desc(), Person.first_name)
    ).all()
    row = StudentService._project(session, student, person)
    return StudentDetailOut(
        id=student.id,
        person_id=person.id,
        first_name=person.first_name,
        last_name=person.last_name,
        birthdate=person.birthdate,
        phone=person.phone,
        email=person.email,
        status=student.status,
        health_status=student.health_status,
        joined_on=student.joined_on,
        left_on=student.left_on,
        current_belt_id=student.current_belt_id,
        frozen_until=row.frozen_until,
        guardians=[
            GuardianOut(
                person_id=g.person_id,
                student_id=g.student_id,
                display_name=f"{p.first_name} {p.last_name}",
                relation=g.relation,
                is_primary=g.is_primary,
                phone=p.phone,
                email=p.email,
            )
            for g, p in guardians
        ],
    )


def _out(session: TenantSession, student: Student, person: Person) -> StudentOut:
    """Manager-scoped only -- this is the shape that carries `price_plan_id`."""
    detail = _detail(session, student, person)
    return StudentOut(
        id=detail.id,
        person_id=detail.person_id,
        first_name=detail.first_name,
        last_name=detail.last_name,
        birthdate=detail.birthdate,
        status=detail.status,
        health_status=detail.health_status,
        joined_on=detail.joined_on,
        left_on=detail.left_on,
        current_belt_id=detail.current_belt_id,
        price_plan_id=student.price_plan_id,
        guardians=detail.guardians,
    )


# -- reads (coach-reachable) ---------------------------------------------------
@router.get("/students", response_model=StudentSummaryPage, tags=COACH)
def list_students(
    _: AnyStaff,
    scope: ViewerScope,
    session: TenantSessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    group_id: uuid.UUID | None = None,
    health_status: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> StudentSummaryPage:
    """Dashboard `3b` and staff `9h`."""
    rows, next_cursor = StudentService.list_students(
        session,
        viewer_group_ids=scope,
        status=status_filter,
        group_id=group_id,
        health_status=health_status,
        q=q,
        after=after,
        limit=limit,
    )
    return StudentSummaryPage(
        items=[_summary(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/students/{student_id}", response_model=StudentDetailOut, tags=COACH)
def get_student(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> StudentDetailOut:
    """Staff `9c` and dashboard `4a`. No price here -- see the module docstring."""
    try:
        student, person = StudentService.get(session, student_id=student_id, viewer_group_ids=scope)
    except NotFoundError as exc:
        raise _not_found() from exc
    return _detail(session, student, person)


@router.get(
    "/students/{student_id}/status-history",
    response_model=StudentStatusHistoryListResponse,
    tags=COACH,
)
def student_status_history(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> StudentStatusHistoryListResponse:
    """§5.4a's funnel is computed from these rows; dashboard `4a` renders them as a
    timeline. Task 6 fills in the service method."""
    from app.schemas.people import StudentStatusHistoryOut

    try:
        StudentService.get(session, student_id=student_id, viewer_group_ids=scope)
    except NotFoundError as exc:
        raise _not_found() from exc
    return StudentStatusHistoryListResponse(
        items=[
            StudentStatusHistoryOut.model_validate(row, from_attributes=True)
            for row in StudentService.status_history(session, student_id=student_id)
        ]
    )


# -- writes (manager-only) -----------------------------------------------------
@router.post("/students", response_model=StudentCreateResult, status_code=status.HTTP_201_CREATED)
def create_student(
    _: ManagerOrOwner,
    body: StudentCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentCreateResult:
    """§5.4(a) -- `+ תלמיד חדש`. Dashboard `3c`.

    L6: manager-or-owner, and there is no self-service equivalent. The public link's only
    job is a first lesson.
    """
    if body.guardian is None:
        # §5.3 makes at least one guardian structural; the schema cannot say so, because
        # §5.4a's trial booking reuses this shape with the parent supplied once for the
        # whole submission.
        raise _refused("guardian_required", "a student needs at least one guardian")
    try:
        created = StudentService.create(
            session,
            first_name=body.first_name,
            last_name=body.last_name,
            birthdate=body.birthdate,
            guardian_first_name=body.guardian.first_name,
            guardian_last_name=body.guardian.last_name,
            guardian_email=body.guardian.email,
            guardian_phone=body.guardian.phone,
            relation=body.guardian.relation,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    token = created.invitation_token
    session.commit()
    student, person = StudentService.get(session, student_id=created.student.id)
    return StudentCreateResult(student=_out(session, student, person), invitation_token=token)


@router.patch("/students/{student_id}", response_model=StudentOut)
def update_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentUpdate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    try:
        student, person = StudentService.update(
            session,
            student_id=student_id,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            first_name=body.first_name,
            last_name=body.last_name,
            birthdate=body.birthdate,
            phone=body.phone,
            email=body.email,
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return _out(session, student, person)


@router.post("/students/{student_id}/freeze", response_model=StudentOut)
def freeze_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentFreezeIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4's freeze. Parent `12i` and dashboard `4a`. The enrollment and the spot are
    retained -- see `StudentService.freeze`."""
    try:
        StudentService.freeze(
            session,
            student_id=student_id,
            from_date=body.from_date,
            to_date=body.to_date,
            reason=body.reason,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused("refused", str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _out(session, student, person)


@router.post("/students/{student_id}/leave", response_model=StudentOut)
def leave_studio(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentLeaveIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4's leaving. `StudentLeaveIn` carries no money field and no write-off flag --
    parent `12i`: the monthly charge stays the parent's responsibility."""
    try:
        StudentService.leave(
            session,
            student_id=student_id,
            left_on=body.left_on,
            reason=body.reason,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused("refused", str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _out(session, student, person)


@router.post("/students/{student_id}/convert", response_model=StudentOut)
def convert_student(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentConvertIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4a step 5. L6 -- manager-or-owner, because enrolment is always a manager decision
    and this is the moment it is made."""
    try:
        StudentService.convert(
            session,
            student_id=student_id,
            group_id=body.group_id,
            started_on=body.started_on,
            price_plan_id=body.price_plan_id,
            attends_weekdays=body.attends_weekdays,
            reason=body.reason,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=schedule_reader(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    except RefusedError as exc:
        raise _refused("refused", str(exc)) from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _out(session, student, person)


@router.post("/students/{student_id}/mark-lost", response_model=StudentOut)
def mark_student_lost(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: StudentMarkLostIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> StudentOut:
    """§5.4a ⑤. The reason is required here and optional in the job: a manager pressing the
    button knows why, and the job only knows that time passed."""
    try:
        StudentService.mark_lost(
            session,
            student_id=student_id,
            reason=body.reason,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused("refused", str(exc)) from exc
    session.commit()
    student, person = StudentService.get(session, student_id=student_id)
    return _out(session, student, person)


@router.get("/students/{student_id}/price-plan", response_model=StudentPricePlanOut)
def student_price_plan(
    _: ManagerOrOwner, student_id: uuid.UUID, session: TenantSessionDep
) -> StudentPricePlanOut:
    """C11's two numbers, for dashboard `4a`'s plan field.

    Manager-only and deliberately **untagged**: `price_plan_id` is what invariant 3's
    detector reads as a financial field, so this shape must never be reachable from a
    coach route. `weekly_volume` is §5.10's suggestion beside the plan picker -- a count of
    sessions, never an amount. `price_plan` is W4's table and this lane never resolves it.
    """
    from app.services.people.enrollments import EnrollmentService

    try:
        student, _person = StudentService.get(session, student_id=student_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    try:
        volume = EnrollmentService.weekly_volume_for_student(
            session, student_id=student_id, since=now().date(), schedule=schedule_reader()
        )
    except NotImplementedError:
        # L5's seam. Until lane SCHEDULE merges there is no calendar to observe, so the
        # honest answer is "no suggestion" rather than a fabricated number. The plan field
        # still works; only the hint beside it is absent.
        volume = 0
    return StudentPricePlanOut(
        student_id=student.id, price_plan_id=student.price_plan_id, weekly_volume=volume
    )


def _guardian_list(session: TenantSession, student_id: uuid.UUID) -> GuardianListResponse:
    """Shared by every guardian route. A plain helper, never another route function: a
    route called positionally past its own dependencies breaks the moment one is added."""
    return GuardianListResponse(
        items=[
            GuardianOut(
                person_id=guardian.person_id,
                student_id=guardian.student_id,
                display_name=f"{person.first_name} {person.last_name}",
                relation=guardian.relation,
                is_primary=guardian.is_primary,
                phone=person.phone,
                email=person.email,
            )
            for guardian, person in StudentService.list_guardians(session, student_id=student_id)
        ]
    )


@router.get("/students/{student_id}/guardians", response_model=GuardianListResponse, tags=COACH)
def list_guardians(
    _: AnyStaff, student_id: uuid.UUID, scope: ViewerScope, session: TenantSessionDep
) -> GuardianListResponse:
    """Staff `9c`'s card shows how to reach the parent. Coach-reachable, and safe to tag:
    §5.3 gives `GuardianOut` no permission field and no financial one."""
    try:
        StudentService.get(session, student_id=student_id, viewer_group_ids=scope)
    except NotFoundError as exc:
        raise _not_found() from exc
    return _guardian_list(session, student_id)


@router.post(
    "/students/{student_id}/guardians",
    response_model=GuardianListResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    body: GuardianCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GuardianListResponse:
    try:
        StudentService.add_guardian(
            session,
            student_id=student_id,
            first_name=body.first_name,
            last_name=body.last_name,
            email=body.email,
            phone=body.phone,
            relation=body.relation,
            is_primary=body.is_primary,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    return _guardian_list(session, student_id)


@router.delete(
    "/students/{student_id}/guardians/{person_id}",
    response_model=GuardianListResponse,
)
def remove_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> GuardianListResponse:
    """Returns the remaining guardians rather than 204, because removing the primary
    promotes another and the client needs to know which."""
    try:
        StudentService.remove_guardian(
            session,
            student_id=student_id,
            person_id=person_id,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except RefusedError as exc:
        raise _refused("refused", str(exc)) from exc
    session.commit()
    return _guardian_list(session, student_id)


@router.post(
    "/students/{student_id}/guardians/{person_id}/set-primary",
    response_model=GuardianListResponse,
)
def set_primary_guardian(
    _: ManagerOrOwner,
    student_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GuardianListResponse:
    """L8 -- this changes whose name the bill carries and which person a הוראת קבע matches.
    It changes no permission, because there is none attached to it."""
    try:
        StudentService.set_primary_guardian(
            session,
            student_id=student_id,
            person_id=person_id,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return _guardian_list(session, student_id)


# -- the parent's own children -------------------------------------------------
@router.get("/me/students", response_model=StudentSummaryPage)
def my_students(request: Request, session: TenantSessionDep) -> StudentSummaryPage:
    """§6.3's home, and L9 verbatim.

    **No role dependency**, deliberately. §3.1: "guardian is not a role"; §6.1 makes parent
    access `EXISTS(guardian WHERE person_id = :me)`. `require_roles` here would refuse
    every guardian in the product and admit every coach with no children.

    L8 -- no `is_primary` branch. Every guardian on a student sees the same list.

    Not paginated: this is one person's children. G16 is about lists that grow, and a
    family that outgrows one page is not a case the product has.
    """
    rows = StudentService.for_guardian(session, person_id=_person_id(request))
    return StudentSummaryPage(items=[_summary(row) for row in rows], has_more=False)


@router.post(
    "/me/students",
    response_model=RegistrationRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def request_a_sibling(
    body: SiblingRequestIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RegistrationRequestOut:
    """§5.4(c) -- parent `12g`, `+ הוסף ילד`.

    **A request, not an enrollment** (L6). §5.4: "This creates a registration_request with
    source = 'parent_app' and matched_person_id set -- a request, not an enrollment. The
    manager approves it, consistent with (b): conversion is always a human decision."

    No role dependency, for the same reason `/me/students` has none: §3.1 -- 'guardian is
    not a role'. Being a guardian is what `person_id` on a `guardian` row means, and this
    route needs nothing more than an identity with a Person in this studio.
    """
    row = RegistrationService.submit_from_parent(
        session,
        submitter_person_id=_person_id(request),
        first_name=body.first_name,
        last_name=body.last_name,
        birthdate=body.birthdate,
        preferred_group_id=body.preferred_group_id,
        at=now(),
    )
    summary = RegistrationService.summarize(session, row)
    session.commit()
    return RegistrationRequestOut(
        id=summary.id,
        source=summary.source,
        status=summary.status,
        submitted_at=summary.submitted_at,
        reviewed_at=summary.reviewed_at,
        matched_person_id=summary.matched_person_id,
        child_display_name=summary.child_display_name,
        guardian_display_name=summary.guardian_display_name,
    )
