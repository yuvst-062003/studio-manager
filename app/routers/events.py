"""SPEC §7's `/events`. §5.8's events, and §5.9's belt exams, which *are* events.

**§3.2, per route.** "Create events" is owner, manager and lead_coach -- an assistant coach
is on the wrong side of that line, which is why `EventsWriter` exists beside `AnyStaff`.
Reads reach every staff role, because a coach who cannot see the event cannot run it, and a
guardian reaches only their own children's events.

**No price reaches a coach.** §3.2's hard rule is unqualified -- "no charge, payment, debt
or price is reachable from any coach-scoped endpoint or screen" -- and `event.fee_agorot`
is a price. `redacts_fee` is the single definition of that rule; it is applied on the way
out rather than in the query, because a manager reads the same row through the same route.

**This file declares `/me/events`, which is not named for this module.** §7 puts the
parent's own list there, and `app/routers/students.py` is lane PEOPLE's file. A path is not
a module: `app/routers/health_declarations.py` already declares
`/students/{id}/health-declaration` for the same reason, and `lane-check.sh events` reaches
this file rather than that one.

Routers stay thin (G6): parse, call a service, return.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.core.auth_context import AnyStaff, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.events import (
    EventCreateIn,
    EventOut,
    EventPage,
    EventType,
    EventUpdateIn,
)
from app.services.events.errors import EventNotEditableError, EventNotFoundError
from app.services.events.events import EventService, redacts_fee
from app.services.events.publish import EventPublishService

router = APIRouter(tags=["events"])

#: §3.2 -- "Create events | owner ✓ | manager ✓ | lead_coach ✓". Written here rather than
#: in `app/core/auth_context.py`: that file is core's, and this is the only lane that needs
#: this particular triple. §5.9 gives the same three "Record belt exam results".
EventsWriter = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]


def _roles(request: Request) -> frozenset[str]:
    """The verified JWT's claim, not a database read. See `require_roles`' docstring for
    why a fifteen-minute snapshot is the right latency here."""
    return frozenset(getattr(request.state, "roles", ()) or ())


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such event"},
    )


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message}
    )


@router.get("/events", response_model=EventPage)
def list_events(
    _: AnyStaff,
    request: Request,
    session: TenantSessionDep,
    type: Annotated[list[EventType] | None, Query()] = None,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> EventPage:
    """`7a`'s roundup and `9i`'s staff list.

    Drafts are included. §4.3 hides them from *guardians*, not from staff -- a draft is the
    manager's own work in progress, and `7a` draws one.
    """
    rows, has_more = EventService.list_events(session, types=type, after=after, limit=limit)
    items = EventService.to_out(session, rows, redact_fee=redacts_fee(_roles(request)))
    return EventPage(
        items=items,
        next_cursor=items[-1].id if items and has_more else None,
        has_more=has_more,
    )


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    _: EventsWriter,
    body: EventCreateIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventOut:
    """201, and the event is a **draft**.

    §4.3 keeps it invisible to guardians until published, which is what lets a manager
    build one over several sittings. `EventCreateIn`'s two validators have already refused
    consent-without-text and an end before a start, as ordinary 422s the form can mark --
    the CHECK constraints behind them are the backstop, not the gate.
    """
    row = EventService.create(session, body, at=now())
    out = EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out


@router.get("/events/{event_id}", response_model=EventOut)
def read_event(
    _: AnyStaff, event_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> EventOut:
    try:
        row = EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    return EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    _: EventsWriter,
    event_id: uuid.UUID,
    body: EventUpdateIn,
    request: Request,
    session: TenantSessionDep,
) -> EventOut:
    """409 and not 403 on a published event: the caller may edit events, and this event is
    past the point where an edit is an edit. §5.8 notifies on publish and on cancel, so a
    PATCH that moved a published date silently would send the club a surprise."""
    try:
        row = EventService.update(session, event_id, body)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict(
            "event_is_not_a_draft", "a published event is changed by cancelling it"
        ) from exc
    out = EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out


class EventPublishedOut(BaseModel):
    """A publish reports the roster it just created.

    Same reasoning as `HealthTemplatePublishedOut`: a publish that said nothing about what
    it materialised would look identical to one that materialised nothing -- which is
    exactly what an event with no targets does, and exactly the state a manager needs to
    see before wondering why no parent replied.
    """

    event: EventOut
    registrations_created: int


@router.post(
    "/events/{event_id}/publish",
    response_model=EventPublishedOut,
    status_code=status.HTTP_201_CREATED,
)
def publish_event(
    _: EventsWriter,
    event_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventPublishedOut:
    """§5.8 -- every targeted student gets a registration at `rsvp='pending'`.

    **Nothing is sent.** Publishing makes the event visible to guardians; an invitation is
    a notification, and `NotificationService` is M8's (W5). Four artboards draw
    "published, invitations not sent" as its own state and no column holds it.
    """
    try:
        event, created = EventPublishService.publish(session, event_id, at=now())
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict("event_is_not_a_draft", "only a draft can be published") from exc
    out = EventService.to_out(session, [event], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return EventPublishedOut(event=out, registrations_created=created)


@router.post("/events/{event_id}/cancel", response_model=EventOut)
def cancel_event(
    _: EventsWriter, event_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> EventOut:
    """The roster survives. §5.8 notifies on a cancellation and the office phones whoever
    answered -- deleting the registrations would delete the list the call is made from."""
    try:
        event = EventPublishService.cancel(session, event_id, at=now())
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict(
            "event_is_not_published", "only a published event can be cancelled"
        ) from exc
    out = EventService.to_out(session, [event], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out
