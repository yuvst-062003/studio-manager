"""SPEC §5.15's training-year rollover — the seven-step wizard, as an API.

**Owner and manager only, on every route including the reads.** §3.2 gives a coach no say in
next year's groups, prices or enrollments, and unlike the schedule reads (which a roster is
unreadable without) nothing a coach does needs this. `AnyStaff` here would widen the blast
radius of the one screen that can move every student in the studio.

**Not tagged `coach`**, for the same reason `app/routers/schedule.py` is not: tagging it
would claim a §13 invariant-3 guarantee about routes a coach never calls, and step 5 returns
money.

**Three of the seven steps have no route here, and that is deliberate.** Step 1 is
`POST /training-years`, step 2 is `GET /holiday-presets` + `POST /closures`, step 6 is
`POST /training-years/{id}/generate-sessions` — all in `app/routers/schedule.py`, all built
in W2, all reachable from other screens. Re-exposing them under `/rollover/*` would give the
product two ways to create a closure that could drift apart. What this module adds is the
three bulk steps that had no mechanism at all, the announcement step's one-press form, and
the wizard's own resumable state.

Routers stay thin (`.claude/rules/api.md`): parse, call `RolloverService`, return. Every
refusal the service raises becomes a status code here and nowhere else.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.schemas._pagination import IdempotencyKey
from app.schemas.comms import AnnouncementIn
from app.schemas.rollover import (
    BulkOutcomeOut,
    BulkRefusal,
    RolloverAnnounceIn,
    RolloverAnnounceOut,
    RolloverGroupsIn,
    RolloverPricesIn,
    RolloverStateOut,
    RolloverStepOut,
    RolloverStepPatch,
    RolloverStudentsIn,
)
from app.schemas.schedule import TrainingYearOut
from app.services.comms.announcements import AnnouncementService
from app.services.schedule.rollover import BulkOutcome, RolloverService, RolloverState
from app.services.schedule.service import ConflictError, NotFoundError

router = APIRouter(tags=["rollover"])


def _actor(request: Request) -> uuid.UUID | None:
    """Who is acting, from the verified claims and never from the body.

    A client that could name the actor could attribute next year's price rise to a
    colleague, and the audit trail would agree with them.
    """
    person_id = getattr(request.state, "person_id", None)
    return person_id if isinstance(person_id, uuid.UUID) else None


def _require_actor(request: Request) -> uuid.UUID:
    """The announcement step needs a real author, not an optional one.

    `announcement.author_person_id` is non-null and §5.11's delivery report names the sender.
    An anonymous rollover announcement would be a message to every family in the studio with
    nobody's name on it.
    """
    person_id = _actor(request)
    if person_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _not_found(message: str = "no such record") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": message},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": message},
    )


# -- projections --------------------------------------------------------------
def _state_out(state: RolloverState) -> RolloverStateOut:
    return RolloverStateOut(
        training_year=TrainingYearOut.model_validate(state.training_year, from_attributes=True),
        steps=[
            RolloverStepOut(id=step.id, status=step.status, detail=step.detail)
            for step in state.steps
        ],
        resume_at=state.resume_at,
        complete=state.complete,
        closures=state.closures,
        groups_active=state.groups_active,
        students_enrolled=state.students_enrolled,
        price_plans_open=state.price_plans_open,
        sessions_generated=state.sessions_generated,
    )


def _outcome_out(outcome: BulkOutcome) -> BulkOutcomeOut:
    return BulkOutcomeOut(
        applied=outcome.applied,
        refused=[BulkRefusal(**row) for row in outcome.refused],
    )


# -- the wizard's own state ---------------------------------------------------
@router.get("/rollover/{training_year_id}", response_model=RolloverStateOut)
def read_rollover_state(
    _: ManagerOrOwner, training_year_id: uuid.UUID, session: TenantSessionDep
) -> RolloverStateOut:
    """§5.15 — where the manager got to, in one read.

    Two steps are computed from the data and five are acknowledgements; the client is told
    the answer and not the mechanism, so a future step that becomes observable can stop
    being an ack without a client release.
    """
    try:
        return _state_out(RolloverService(session).state(training_year_id))
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc


@router.patch("/rollover/{training_year_id}/steps/{step_id}", response_model=RolloverStateOut)
def set_rollover_step(
    _: ManagerOrOwner,
    training_year_id: uuid.UUID,
    step_id: str,
    body: RolloverStepPatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RolloverStateOut:
    """Record that a human answered a step, or reopen one they answered by mistake.

    Answering a DERIVED step is a 409 rather than a silent no-op: a client that believed it
    had marked generation done would let the manager activate a year with an empty calendar.
    """
    try:
        state = RolloverService(session).set_step(
            training_year_id,
            step_id=step_id,
            status=body.status,
            studio_id=require_current_studio_id(),
        )
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    return _state_out(state)


# -- step 3: groups -----------------------------------------------------------
@router.post("/rollover/{training_year_id}/groups", response_model=BulkOutcomeOut)
def apply_rollover_groups(
    _: ManagerOrOwner,
    request: Request,
    training_year_id: uuid.UUID,
    body: RolloverGroupsIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BulkOutcomeOut:
    """§5.15 step 3 — groups carried forward, renamed, retired or created.

    Carrying forward is not an operation: `group` has no `training_year_id`, so a group left
    alone is already next year's group. Only the three verbs that write anything are here.
    """
    try:
        outcome = RolloverService(session).apply_groups(
            training_year_id,
            renames=[(row.group_id, row.name) for row in body.renames],
            retire=body.retire,
            revive=body.revive,
            creates=[row.model_dump() for row in body.creates],
            at=now(),
            actor_person_id=_actor(request),
            studio_id=require_current_studio_id(),
        )
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc
    session.commit()
    return _outcome_out(outcome)


# -- step 4: students ---------------------------------------------------------
@router.post("/rollover/{training_year_id}/students", response_model=BulkOutcomeOut)
def apply_rollover_students(
    _: ManagerOrOwner,
    request: Request,
    training_year_id: uuid.UUID,
    body: RolloverStudentsIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BulkOutcomeOut:
    """§5.15 step 4 — moves and leavers, in bulk, **with no automatic age-based promotion**.

    Every move is named by the caller. There is no rule anywhere behind this route that reads
    a date of birth, and there must not be: a child moved up a group without a human saying
    so is a conversation with a parent that nobody in the office knows happened.
    """
    try:
        outcome = RolloverService(session).apply_students(
            training_year_id,
            moves=[(row.enrollment_id, row.to_group_id) for row in body.moves],
            not_returning=body.not_returning,
            at=now(),
            actor_person_id=_actor(request),
            studio_id=require_current_studio_id(),
        )
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc
    session.commit()
    return _outcome_out(outcome)


# -- step 5: prices -----------------------------------------------------------
@router.post("/rollover/{training_year_id}/prices", response_model=BulkOutcomeOut)
def apply_rollover_prices(
    _: ManagerOrOwner,
    request: Request,
    training_year_id: uuid.UUID,
    body: RolloverPricesIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BulkOutcomeOut:
    """§5.15 step 5 — new amounts from the new year's start, **old plans closed not
    overwritten**.

    Each repricing closes the incumbent plan on the day before the year starts and opens a
    successor on the day it does, so last year's statements keep saying what last year cost.
    """
    try:
        outcome = RolloverService(session).apply_prices(
            training_year_id,
            repricings=[row.model_dump() for row in body.repricings],
            at=now(),
            actor_person_id=_actor(request),
            studio_id=require_current_studio_id(),
        )
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc
    session.commit()
    return _outcome_out(outcome)


# -- step 7: announce ---------------------------------------------------------
@router.post(
    "/rollover/{training_year_id}/announce",
    response_model=RolloverAnnounceOut,
    status_code=status.HTTP_201_CREATED,
)
def announce_rollover(
    _: ManagerOrOwner,
    request: Request,
    training_year_id: uuid.UUID,
    body: RolloverAnnounceIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RolloverAnnounceOut:
    """§5.15 step 7 — "optionally publish the new schedule to all guardians in one action".

    Create and publish in one call, which is the difference between this and `4f`. The
    composer exists so a manager can draft, preview an audience and send later; the rollover
    step exists because they have just finished a forty-minute wizard and the announcement is
    the last press. A draft left behind here would be a message about a schedule that is now
    live, sitting unsent in a screen nobody opens until next year.

    The scope is always `studio`, so `scope_id` is `None` — §5.11's audience rules and the
    per-guardian dedupe are `AnnouncementService`'s, unchanged.
    """
    service = AnnouncementService(session)
    author = _require_actor(request)
    try:
        # The year has to exist before an announcement about it does, and `state()` is the
        # cheapest read that says so with the tenant filter already applied.
        RolloverService(session).state(training_year_id)
    except NotFoundError as exc:
        raise _not_found(str(exc)) from exc

    announcement = service.create(
        author,
        AnnouncementIn(title=body.title, body=body.body, scope_type="studio", scope_id=None),
        at=now(),
    )
    session.flush()
    _published, families = service.publish(announcement.id, at=now())
    session.commit()
    return RolloverAnnounceOut(announcement_id=announcement.id, families=families)
