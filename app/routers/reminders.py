"""F7a -- the reminder routes behind the four dead buttons.

All ManagerOrOwner: a reminder is the club speaking in the club's voice. The service
enforces the three rules (quiet hours, rate limit, one-per-household); this file only
translates its refusals -- quiet hours is a 409 with a code the i18n layer can name,
because "we did not send that" must never look like "we sent that".
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.services.comms.reminders import NotFoundError, QuietHoursError, ReminderService

router = APIRouter(prefix="/reminders", tags=["comms", "reminders"])


class DebtReminderIn(BaseModel):
    payer_person_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class ReminderOut(BaseModel):
    sent: int
    skipped_recent: int


def _person_id(request: Request) -> uuid.UUID | None:
    value = getattr(request.state, "person_id", None)
    return value if isinstance(value, uuid.UUID) else None


def _quiet() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "quiet_hours", "message": "אין שליחת הודעות בין 21:00 ל־08:00"},
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "לא נמצא"},
    )


@router.post("/debt", response_model=ReminderOut)
def remind_debt(
    _: ManagerOrOwner, body: DebtReminderIn, request: Request, session: TenantSessionDep
) -> ReminderOut:
    """One household or many -- the bulk button is this same route with more ids."""
    try:
        result = ReminderService(session).remind_debt(
            body.payer_person_ids, actor_person_id=_person_id(request), at=now()
        )
    except QuietHoursError as exc:
        raise _quiet() from exc
    session.commit()
    return ReminderOut(**result)


@router.post("/sessions/{session_id}/coach", response_model=ReminderOut)
def remind_coach(
    _: ManagerOrOwner, session_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> ReminderOut:
    try:
        result = ReminderService(session).remind_coach(
            session_id, actor_person_id=_person_id(request), at=now()
        )
    except QuietHoursError as exc:
        raise _quiet() from exc
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return ReminderOut(**result)


@router.post("/events/{event_id}/non-responders", response_model=ReminderOut)
def remind_event_non_responders(
    _: ManagerOrOwner, event_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> ReminderOut:
    try:
        result = ReminderService(session).remind_event_non_responders(
            event_id, actor_person_id=_person_id(request), at=now()
        )
    except QuietHoursError as exc:
        raise _quiet() from exc
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return ReminderOut(**result)
