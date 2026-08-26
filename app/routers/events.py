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

import ipaddress
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.auth_context import AnyStaff, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.events import Event, EventRegistration
from app.models.people import Student
from app.models.person import Person
from app.models.studio import Studio
from app.schemas._pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    CursorPage,
    IdempotencyKey,
)
from app.schemas.belts import BeltRankOut
from app.schemas.events import (
    EventCreateIn,
    EventExamResultIn,
    EventExamResultOut,
    EventExamResultPage,
    EventOut,
    EventPage,
    EventRegistrationOut,
    EventRegistrationPage,
    EventType,
    EventUpdateIn,
)
from app.services.belts.eligibility import EligibilityService
from app.services.belts.errors import BeltAlreadyAwardedError
from app.services.events.errors import (
    AlreadyExaminedError,
    ConsentNotRequiredError,
    EventNotEditableError,
    EventNotFoundError,
    EventNotPublishedError,
    NotABeltExamError,
    NotRegisteredForEventError,
    NotThisGuardiansStudentError,
    RsvpDeadlinePassedError,
)
from app.services.events.events import EventService, redacts_fee
from app.services.events.exams import ExamService
from app.services.events.ics import render_event_ics
from app.services.events.publish import EventPublishService
from app.services.events.rsvp import RsvpService

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


# Declared BEFORE `GET /events/{event_id}`, and that order is load-bearing. FastAPI matches
# `.ics` as a literal suffix on the path parameter, so with the plain route first every
# `<uuid>.ics` request would be swallowed by it and fail to parse as a UUID -- surfacing as
# a 422 on a route that looks unrelated to the one that was called.
@router.get(
    "/events/{event_id}.ics",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/calendar": {}}}},
)
def event_calendar_file(
    _: AnyStaff, event_id: uuid.UUID, session: TenantSessionDep
) -> PlainTextResponse:
    """§5.8's הוסף ליומן.

    A draft 404s -- §4.3 keeps it invisible to guardians, and a resolvable link would be
    that invisibility leaking through a file extension.
    """
    try:
        event = EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    if event.status == "draft":
        raise _not_found()
    studio = session.get(Studio, require_current_studio_id())
    return PlainTextResponse(
        render_event_ics(event, studio_name=studio.name if studio else "", at=now()),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}.ics"'},
    )


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


# -- the parent's side, and the roster ------------------------------------------------
class RsvpAnswerIn(BaseModel):
    """`RsvpIn` from the contract carries only the answer; a route needs to know which
    child it is about. Composed here rather than by widening the contract shape -- a family
    with two children on one competition answers twice, and `RsvpIn` is what `7d`'s two
    buttons post for one of them.

    `pending` is not accepted, exactly as the contract's own shape refuses it: it is the
    ABSENCE of an answer, and letting a caller send it would make "un-answer" a supported
    action the office would then have to interpret.
    """

    student_id: uuid.UUID
    rsvp: Literal["yes", "no"]


class EventConsentIn(BaseModel):
    """Which child is being consented for.

    **Not the consent text.** That lives on the event, and a signature carrying its own
    wording would let a client sign something the manager never wrote.
    """

    student_id: uuid.UUID


class EventAttendanceMarkIn(BaseModel):
    student_id: uuid.UUID
    attended: bool


class EventAttendanceIn(BaseModel):
    marks: list[EventAttendanceMarkIn]


class EventAttendanceOut(BaseModel):
    marked: int


class RegistrationAnswerOut(BaseModel):
    """One registration, plus whether §5.8 counts it as confirmed.

    `confirmed` is computed on the server because `RsvpService.is_confirmed` is the only
    definition of the rule. A client re-deriving `rsvp == 'yes' and (not requires_consent
    or signed)` would be a second implementation of the thing that decides whether a family
    is billed.
    """

    registration: EventRegistrationOut
    confirmed: bool


class ParentEventOut(BaseModel):
    """`12h`'s row: the event, plus this family's own answer for one child.

    Two objects rather than one flattened shape, because the answer is per-child and the
    event is not -- a family with two children on one competition sees one event and two
    answers, and flattening would duplicate the event on the screen.
    """

    event: EventOut
    registration: EventRegistrationOut
    confirmed: bool


ParentEventPage = CursorPage[ParentEventOut]


def _student_display_name(session: TenantSessionDep, student_id: uuid.UUID) -> str:
    """`student` carries no name -- §4.3 puts it on `person`, because a student and their
    guardian are the same kind of row about a different human. Empty string rather than
    `None` for a student whose person has been anonymised (§11.5): the roster still lists
    the row, because a charge and an attendance record survive anonymisation."""
    student = session.get(Student, student_id)
    person = session.get(Person, student.person_id) if student is not None else None
    return f"{person.first_name} {person.last_name}".strip() if person else ""


def _registration_out(
    session: TenantSessionDep, row: EventRegistration, *, redact_charge: bool
) -> EventRegistrationOut:
    display_name = _student_display_name(session, row.student_id)
    return EventRegistrationOut(
        id=row.id,
        event_id=row.event_id,
        student_id=row.student_id,
        student_display_name=display_name,
        rsvp=row.rsvp,
        responded_by_person_id=row.responded_by_person_id,
        responded_at=row.responded_at,
        consent_signed_at=row.consent_signed_at,
        # §3.2's hard rule: a charge is money, and no coach-scoped response carries one.
        charge_id=None if redact_charge else row.charge_id,
        attended=row.attended,
    )


def _guardian_person_id(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _client_ip(request: Request) -> str | None:
    """`consent_record.ip` is `INET`, so anything that is not an address is `None`.

    Copied from `app/routers/health_templates.py` rather than imported across routers, for
    the reason its own docstring gives: under `TestClient` the transport reports the
    literal string "testclient", which Postgres rejects outright -- taking the whole
    audited write down with it. A proxy can put arbitrary text there too.
    """
    client = request.client
    if client is None:
        return None
    try:
        ipaddress.ip_address(client.host)
    except ValueError:
        return None
    return client.host


def _translate_parent_error(exc: Exception) -> HTTPException:
    if isinstance(exc, EventNotFoundError):
        return _not_found()
    if isinstance(exc, NotThisGuardiansStudentError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_your_student", "message": "this action is not yours"},
        )
    if isinstance(exc, NotRegisteredForEventError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_registered", "message": "no such registration"},
        )
    if isinstance(exc, RsvpDeadlinePassedError):
        return _conflict("rsvp_deadline_passed", "the deadline to answer has passed")
    if isinstance(exc, EventNotPublishedError):
        return _conflict("event_is_not_published", "this event is not open for answers")
    if isinstance(exc, ConsentNotRequiredError):
        return _conflict("consent_not_required", "this event asks for no consent")
    raise exc


@router.post("/events/{event_id}/rsvp", response_model=RegistrationAnswerOut)
def answer_rsvp(
    event_id: uuid.UUID,
    body: RsvpAnswerIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RegistrationAnswerOut:
    """§5.8's מגיע / לא מגיע. Artboards `7d` and `12h`.

    **No role dependency**: this is the guardian's route, and §3.2 resolves a guardian
    per-record rather than by grant. The check is "is this caller a guardian of this
    student", which `RsvpService.assert_guardian_of` answers.

    A `yes` is recorded whether or not the consent is signed. §5.8 gates *confirmation*,
    not the answer -- refusing the write would lose the fact that the parent said yes, and
    `confirmed` in the response is what the screen renders.
    """
    person_id = _guardian_person_id(request)
    try:
        RsvpService.assert_guardian_of(session, person_id, body.student_id)
        event, registration = RsvpService.answer(
            session,
            event_id,
            body.student_id,
            rsvp=body.rsvp,
            by_person_id=person_id,
            at=now(),
        )
    except Exception as exc:  # noqa: BLE001 -- narrowed by _translate_parent_error
        raise _translate_parent_error(exc) from exc
    out = RegistrationAnswerOut(
        registration=_registration_out(session, registration, redact_charge=False),
        confirmed=RsvpService.is_confirmed(event, registration),
    )
    session.commit()
    return out


@router.post("/events/{event_id}/consent", response_model=RegistrationAnswerOut)
def sign_event_consent(
    event_id: uuid.UUID,
    body: EventConsentIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RegistrationAnswerOut:
    """§5.8's signed parent consent, and the other half of the gate.

    Whichever of this and the RSVP completes the pair is the one that raises the fee, so
    both routes end in the same service call and the charge is idempotent on
    `registration.charge_id`.
    """
    person_id = _guardian_person_id(request)
    try:
        RsvpService.assert_guardian_of(session, person_id, body.student_id)
        event, registration = RsvpService.sign_consent(
            session,
            event_id,
            body.student_id,
            by_person_id=person_id,
            at=now(),
            ip=_client_ip(request),
        )
    except Exception as exc:  # noqa: BLE001 -- narrowed by _translate_parent_error
        raise _translate_parent_error(exc) from exc
    out = RegistrationAnswerOut(
        registration=_registration_out(session, registration, redact_charge=False),
        confirmed=RsvpService.is_confirmed(event, registration),
    )
    session.commit()
    return out


@router.get("/events/{event_id}/registrations", response_model=EventRegistrationPage)
def list_registrations(
    _: AnyStaff,
    event_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> EventRegistrationPage:
    """`7c`'s participants table, and `9d`'s candidate list.

    D9.2 -- six columns and none of them is a weight or a category. `charge_id` is
    redacted for a coach: §3.2's hard rule reaches the roster too.
    """
    try:
        EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    stmt = (
        select(EventRegistration)
        .where(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.id)
    )
    if after is not None:
        stmt = stmt.where(EventRegistration.id > after)
    rows = list(session.execute(stmt.limit(limit + 1)).scalars())
    has_more = len(rows) > limit
    redact = redacts_fee(_roles(request))
    items = [_registration_out(session, row, redact_charge=redact) for row in rows[:limit]]
    return EventRegistrationPage(
        items=items,
        next_cursor=items[-1].id if items and has_more else None,
        has_more=has_more,
    )


@router.post("/events/{event_id}/attendance", response_model=EventAttendanceOut)
def record_event_attendance(
    _: AnyStaff,
    event_id: uuid.UUID,
    body: EventAttendanceIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventAttendanceOut:
    """§5.8 -- "attendance is taken on an event with the same UI as a session". §3.2 gives
    every staff role "Take/edit attendance", including an assistant coach."""
    try:
        EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    marked = RsvpService.mark_attendance(
        session, event_id, {mark.student_id: mark.attended for mark in body.marks}
    )
    session.commit()
    return EventAttendanceOut(marked=marked)


@router.get("/me/events", response_model=ParentEventPage)
def my_events(
    request: Request,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ParentEventPage:
    """`12h` -- the parent's own list, one row per child per event.

    **Drafts never appear.** §4.3 makes a draft invisible to guardians, and that is the
    whole reason drafts exist: a manager builds an event over several sittings without a
    half-written one reaching the club. Filtered server-side rather than trusted to the
    screen.
    """
    person_id = _guardian_person_id(request)
    student_ids = RsvpService.students_of_guardian(session, person_id)
    if not student_ids:
        return ParentEventPage(items=[], next_cursor=None, has_more=False)

    stmt = (
        select(EventRegistration, Event)
        .join(Event, Event.id == EventRegistration.event_id)
        .where(
            EventRegistration.student_id.in_(student_ids),
            Event.status != "draft",
        )
        .order_by(Event.starts_at, EventRegistration.id)
    )
    if after is not None:
        anchor = session.get(EventRegistration, after)
        if anchor is not None:
            stmt = stmt.where(EventRegistration.id > anchor.id)
    rows = list(session.execute(stmt.limit(limit + 1)).all())
    has_more = len(rows) > limit

    items = [
        ParentEventOut(
            # A guardian is not fee-redacted: `7d` puts the amount inside their own confirm
            # button, and a parent who cannot see what confirming costs is being asked to
            # agree to an unnamed amount.
            event=EventService.to_out(session, [event], redact_fee=False)[0],
            registration=_registration_out(session, registration, redact_charge=False),
            confirmed=RsvpService.is_confirmed(event, registration),
        )
        for registration, event in rows[:limit]
    ]
    return ParentEventPage(
        items=items,
        next_cursor=items[-1].registration.id if items and has_more else None,
        has_more=has_more,
    )


# -- §5.9's belt exam. An exam IS an event, so its routes live here. -------------------
class CandidateOut(BaseModel):
    """One candidate, and the evidence §5.9 names -- and nothing else.

    **There is deliberately no attendance percentage, no debt and no blocker field.**
    `events.exam.eligibleHint` says the current rank and the time held in it; `belt_rank`
    carries no threshold column, so a criterion added here would have nowhere to be
    configured. `6b`'s audit says that decision belonged in W4's contract commit, which did
    not make it. A debt figure would also break §3.2's hard rule on a screen a lead coach
    may open.

    `months_at_rank` is reported for a manager to read, not compared against anything.
    """

    student_id: uuid.UUID
    student_display_name: str
    current_rank: BeltRankOut | None
    next_rank: BeltRankOut | None
    months_at_rank: int | None
    eligible: bool


class ExamResultsIn(BaseModel):
    results: list[EventExamResultIn]


@router.get("/events/{event_id}/eligibility", response_model=CursorPage[CandidateOut])
def event_eligibility(
    _: AnyStaff, event_id: uuid.UUID, session: TenantSessionDep
) -> CursorPage[CandidateOut]:
    """`4d`'s table and `6b`'s counters, over the event's own roster.

    The whole roster rather than a page: `4d` pre-selects the eligible rows and promotes
    everyone ticked, so a truncated list would silently exclude candidates from a bulk
    action whose button names a count.
    """
    try:
        EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    candidates = EligibilityService.for_event(session, event_id, at=now())
    return CursorPage[CandidateOut](
        items=[
            CandidateOut(
                student_id=candidate.student_id,
                student_display_name=candidate.student_display_name,
                current_rank=(
                    BeltRankOut.model_validate(candidate.current_rank, from_attributes=True)
                    if candidate.current_rank is not None
                    else None
                ),
                next_rank=(
                    BeltRankOut.model_validate(candidate.next_rank, from_attributes=True)
                    if candidate.next_rank is not None
                    else None
                ),
                months_at_rank=candidate.months_at_rank,
                eligible=candidate.eligible,
            )
            for candidate in candidates
        ],
        next_cursor=None,
        has_more=False,
    )


@router.post(
    "/events/{event_id}/exam-results",
    response_model=EventExamResultPage,
    status_code=status.HTTP_201_CREATED,
)
def record_exam_results(
    _: EventsWriter,
    event_id: uuid.UUID,
    body: ExamResultsIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventExamResultPage:
    """§5.9 step 3 -- the result, the belt row and the cache, in one transaction.

    **The commit is here and nowhere inside the service**, which is what makes the batch
    atomic: a failure on the fourth candidate leaves the first three unwritten rather than
    promoted, so a coach never has to work out which half of a save landed.
    """
    actor = getattr(request.state, "person_id", None)
    try:
        rows = ExamService.record(
            session,
            event_id,
            body.results,
            examiner_person_id=actor if isinstance(actor, uuid.UUID) else None,
            at=now(),
        )
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except NotABeltExamError as exc:
        raise _conflict("not_a_belt_exam", "this event is not a belt exam") from exc
    except AlreadyExaminedError as exc:
        raise _conflict(
            "already_examined", "this student already has a result for this exam"
        ) from exc
    except NotRegisteredForEventError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_a_candidate", "message": "no such candidate on this exam"},
        ) from exc
    except BeltAlreadyAwardedError as exc:
        raise _conflict("belt_already_awarded", "this student already holds that rank") from exc

    items = [
        EventExamResultOut(
            id=row.id,
            event_id=row.event_id,
            student_id=row.student_id,
            student_display_name=_student_display_name(session, row.student_id),
            belt_rank_id=row.belt_rank_id,
            belt_rank_name=rank.name,
            result=row.result,
            examiner_person_id=row.examiner_person_id,
            note=row.note,
        )
        for row, rank in rows
    ]
    session.commit()
    return EventExamResultPage(items=items, next_cursor=None, has_more=False)
