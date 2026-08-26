"""SPEC §7's `/announcements`, `/notifications`, `/notification-preferences` and
`/push-tokens`. §5.11's two levels, and the three screens that keep a silent failure visible.

**Routers stay thin (G6)** -- parse, call a service, return. Authorization is a dependency
here and never inside a service (`.claude/rules/api.md`), which is why `require_roles` appears
in this file and nowhere under `app/services/comms/`.

**Some response shapes are declared in this module rather than in `app/schemas/comms.py`.**
W5's contract commit authored that file and lane COMMS does not own it, so the shapes it did
not anticipate -- the preference list, §6.5's install-state report -- live beside the routes
that return them. `app/routers/belts.py` and `app/routers/billing.py` already do this for the
same reason. Everything the contract commit DID author is imported from there unchanged, so
the generated client keeps one definition of each.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.core.auth_context import require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.comms import PREFERENCE_GROUPS
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.comms import (
    AnnouncementIn,
    AnnouncementOut,
    AnnouncementPage,
    AnnouncementScope,
    DeliveryReportOut,
    NotificationOut,
    NotificationPage,
    PushApp,
    PushPlatform,
    PushTokenIn,
    PushTokenOut,
)
from app.services.comms.announcements import AnnouncementService
from app.services.comms.errors import (
    AnnouncementAlreadyPublishedError,
    AnnouncementNotFoundError,
    AudienceOutOfScopeError,
    NotYourAnnouncementError,
    TransactionalKindError,
    UnknownPreferenceGroupError,
)
from app.services.comms.install import InstallStateService
from app.services.comms.notifications import DeliveryReporter, NotificationReader
from app.services.comms.preferences import NotificationPreferenceService
from app.services.comms.push import PushTokenService

#: Tagged `coach` as well as `comms`, and that is not decoration.
#:
#: `.claude/rules/api.md`: "A router serving coaches is tagged `coach` ... so an untagged
#: coach router is an unguarded one." This one serves them -- §6.5's `push_token` registration
#: for the staff app, the notification preferences in the `9e` drawer, and §5.14's at-risk
#: alert, which goes to the group's coaches. The three routers already carrying the tag
#: (attendance, sessions, sync) are there for the same reason.
#:
#: What it buys: SPEC §13 invariant 3 walks every response model reachable from a `coach`
#: route and refuses any financial property name. §5.11's trigger table sends five payment
#: kinds through this fan-out, so "a notification schema that grew an `amount_agorot`" is a
#: real way for a price to reach a coach's screen -- and §3.2's rule about that is
#: unqualified.
router = APIRouter(tags=["coach", "comms"])

#: §5.11 -- "A manager (studio-wide, any class, any group) or a lead coach (their own
#: groups) publishes". An assistant coach is on the wrong side of that line, which is why
#: this is not `AnyStaff`. §3.2's "Create events" row gives the same three, and
#: `app/routers/events.py::EventsWriter` states it for that case.
AnnouncementPublisher = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]

#: §5.11's delivery report and §6.5's install list are both lists of families' phone numbers.
#: §3.2 keeps a coach away from that: they need the roster, not the household directory.
ManagerOnly = Annotated[None, Depends(require_roles("owner", "manager"))]


def _person_id(request: Request) -> uuid.UUID:
    """The signed-in person, from the verified JWT.

    Same shape as `app/routers/students.py::_person_id` and
    `app/routers/events.py::_guardian_person_id`. Every route in this file is about a
    specific human's inbox, devices or switches, so there is no route here that does not
    need it.
    """
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


# -- push registration --------------------------------------------------------
@router.post("/push-tokens", response_model=PushTokenOut, status_code=status.HTTP_201_CREATED)
def register_push_token(
    request: Request,
    body: PushTokenIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> PushTokenOut:
    """§7's `POST /push-tokens`. §6.5's install funnel ends here.

    201 on a re-registration as well as a first one, deliberately. FCM hands the same token
    back to the same browser on every launch, so "already registered" is the ordinary path
    rather than a conflict -- and a 409 would make the client's launch sequence branch on a
    state it cannot do anything about.

    The token is not echoed back. The client already holds it, and a second representation
    of a credential is one more place for it to end up in a log.
    """
    row = PushTokenService(session).register(
        _person_id(request),
        token=body.token,
        app=body.app,
        platform=body.platform,
        at=now(),
    )
    return PushTokenOut(
        id=row.id,
        # `cast`-free: the CHECK constraints and `PushTokenIn`'s Literals already narrowed
        # these, and the row was written from that validated input.
        app=body.app,
        platform=body.platform,
        last_seen_at=row.last_seen_at,
    )


# -- §5.11's announcements (dashboard 4f) -------------------------------------
class AudienceQuery(BaseModel):
    """A scope, before an announcement exists to carry it.

    `4f` shows `יגיע ל-{{count}} משפחות` while the manager is still choosing who to write to,
    so the count cannot hang off an announcement id -- there is no row yet, and creating a
    draft per keystroke to ask "how many" would litter the list.
    """

    scope_type: AnnouncementScope
    scope_id: uuid.UUID | None = None


class AudienceSizeOut(BaseModel):
    recipient_count: int


class AnnouncementPatch(BaseModel):
    """A partial edit to a draft. Every field optional, in the shape `app/routers/billing.py`
    already uses for `ProductPatch`.

    `AnnouncementIn` is the CREATE shape and requires a title, a body and a scope. Reusing it
    here would make `PATCH` mean `PUT` -- a manager fixing a typo would have to resend the
    audience, and forgetting to would silently re-scope the announcement.

    `scope_id` and `scheduled_for` are both nullable AND meaningful when null (a studio-wide
    scope names no row; an unscheduled announcement has no time), so "was it sent" is read
    from `model_fields_set` rather than from the value. That is what lets
    `{"scheduled_for": null}` mean `announcement.cancelSchedule` instead of "leave it alone".
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1)
    scope_type: AnnouncementScope | None = None
    scope_id: uuid.UUID | None = None
    scheduled_for: datetime | None = None


def _roles(request: Request) -> frozenset[str]:
    """The verified JWT's claim, not a database read. Same helper as
    `app/routers/events.py::_roles`, and `require_roles`' docstring carries the argument for
    why a fifteen-minute snapshot is the right latency."""
    return frozenset(getattr(request.state, "roles", ()) or ())


def _scoped(service: AnnouncementService, request: Request, body: AnnouncementIn) -> None:
    """The two refusals every write to an announcement's audience has to make.

    Order matters: §3.2 first, then whether the scope names anything. A coach probing for
    which groups exist would otherwise learn it from the difference between a 403 and a 422.
    """
    try:
        service.assert_may_publish_to(
            _person_id(request), _roles(request), body.scope_type, body.scope_id
        )
    except NotYourAnnouncementError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "a lead coach publishes to their own groups",
            },
        ) from exc
    try:
        service.assert_scope_exists(body.scope_type, body.scope_id)
    except AudienceOutOfScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "bad_audience",
                "message": str(exc.args[0]) if exc.args else "no such audience",
            },
        ) from exc


def _not_found(exc: AnnouncementNotFoundError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such announcement"},
    )


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(
    request: Request,
    body: AnnouncementIn,
    session: TenantSessionDep,
    _: AnnouncementPublisher,
    idempotency_key: IdempotencyKey = None,
) -> AnnouncementOut:
    """§5.11's publish form. Creating is not sending -- `published_at` stays null until
    `/publish`, so a draft can be written now and checked before it reaches anybody."""
    service = AnnouncementService(session)
    _scoped(service, request, body)
    row = service.create(_person_id(request), body, at=now())
    return AnnouncementOut.model_validate(row, from_attributes=True)


@router.post("/announcements/audience-preview", response_model=AudienceSizeOut)
def preview_audience(
    request: Request,
    body: AudienceQuery,
    session: TenantSessionDep,
    _: AnnouncementPublisher,
) -> AudienceSizeOut:
    """`audience.recipients` -- `יגיע ל-{{count}} משפחות`.

    A POST rather than a GET with query parameters, because it is scoped by the same
    (scope_type, scope_id) pair the body of an announcement carries and splitting that across
    two shapes is how the two drift. It reads nothing and changes nothing.
    """
    service = AnnouncementService(session)
    try:
        service.assert_may_publish_to(
            _person_id(request), _roles(request), body.scope_type, body.scope_id
        )
    except NotYourAnnouncementError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "a lead coach publishes to their own groups"},
        ) from exc
    return AudienceSizeOut(recipient_count=service.audience_size(body.scope_type, body.scope_id))


@router.get("/announcements", response_model=AnnouncementPage)
def list_announcements(
    session: TenantSessionDep,
    _: AnnouncementPublisher,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> AnnouncementPage:
    rows, has_more = AnnouncementService(session).list(after=after, limit=limit)
    return AnnouncementPage(
        items=[AnnouncementOut.model_validate(row, from_attributes=True) for row in rows],
        next_cursor=rows[-1].id if has_more and rows else None,
        has_more=has_more,
    )


@router.get("/announcements/{announcement_id}", response_model=AnnouncementOut)
def get_announcement(
    announcement_id: uuid.UUID, session: TenantSessionDep, _: AnnouncementPublisher
) -> AnnouncementOut:
    try:
        row = AnnouncementService(session).get(announcement_id)
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc
    return AnnouncementOut.model_validate(row, from_attributes=True)


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(
    request: Request,
    announcement_id: uuid.UUID,
    body: AnnouncementPatch,
    session: TenantSessionDep,
    _: AnnouncementPublisher,
    idempotency_key: IdempotencyKey = None,
) -> AnnouncementOut:
    """409 once it has been published: parents already hold it.

    The patch is merged over the stored row here rather than in the service, so the service
    keeps one `update(id, AnnouncementIn)` that always receives a complete, validated
    announcement -- and so the §3.2 and audience checks below run against the scope this edit
    would RESULT in, not the one it happened to mention.
    """
    service = AnnouncementService(session)
    try:
        row = service.get(announcement_id)
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc

    sent = body.model_fields_set
    merged = AnnouncementIn(
        title=body.title if body.title is not None else row.title,
        body=body.body if body.body is not None else row.body,
        scope_type=body.scope_type if body.scope_type is not None else row.scope_type,
        scope_id=body.scope_id if "scope_id" in sent else row.scope_id,
        scheduled_for=body.scheduled_for if "scheduled_for" in sent else row.scheduled_for,
    )
    _scoped(service, request, merged)
    try:
        row = service.update(announcement_id, merged)
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc
    except AnnouncementAlreadyPublishedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_published",
                "message": "this announcement has already been sent",
            },
        ) from exc
    return AnnouncementOut.model_validate(row, from_attributes=True)


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: uuid.UUID,
    session: TenantSessionDep,
    _: AnnouncementPublisher,
    idempotency_key: IdempotencyKey = None,
) -> None:
    """Soft, per G15. Every recipient's inbox row names this announcement in its payload."""
    try:
        AnnouncementService(session).soft_delete(announcement_id, at=now())
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post("/announcements/{announcement_id}/publish", response_model=AnnouncementOut)
def publish_announcement(
    announcement_id: uuid.UUID,
    session: TenantSessionDep,
    _: AnnouncementPublisher,
    idempotency_key: IdempotencyKey = None,
) -> AnnouncementOut:
    """The send. 409 on a second attempt -- see `AnnouncementService.publish`."""
    try:
        row, _reached = AnnouncementService(session).publish(announcement_id, at=now())
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc
    except AnnouncementAlreadyPublishedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_published",
                "message": "this announcement has already been sent",
            },
        ) from exc
    return AnnouncementOut.model_validate(row, from_attributes=True)


# -- §5.11's delivery report --------------------------------------------------
class ResendOut(BaseModel):
    """How many sends `[ שלח שוב ]` could actually retry.

    A count and not a boolean, because it is frequently zero and the screen has to say so.
    Only `failed` rows are retryable — see `DeliveryReporter.retry_failed` — so a report
    showing five misses that are all `denied` retries nothing, and a button that claimed
    otherwise would be lying to a manager in a hurry.
    """

    retried_count: int


@router.get("/announcements/{announcement_id}/delivery", response_model=DeliveryReportOut)
def announcement_delivery_report(
    announcement_id: uuid.UUID, session: TenantSessionDep, _: ManagerOnly
) -> DeliveryReportOut:
    """§5.11's post-send screen.

    `ManagerOnly` rather than `AnnouncementPublisher`: this is a list of families' names and
    telephone numbers, and §3.2 gives a coach the roster rather than the household directory.
    A lead coach can publish to their own group and cannot read the club's phone book, which
    is the same line §3.2 draws everywhere else.

    A draft returns zeroes rather than a 404. It has reached nobody, and that is the honest
    answer to "how did it go" for something that has not gone.
    """
    try:
        AnnouncementService(session).get(announcement_id)
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc
    return DeliveryReporter(session).for_announcement(announcement_id)


@router.post("/announcements/{announcement_id}/resend", response_model=ResendOut)
def resend_announcement(
    announcement_id: uuid.UUID,
    session: TenantSessionDep,
    _: ManagerOnly,
    idempotency_key: IdempotencyKey = None,
) -> ResendOut:
    """`delivery.resend`. Re-queues the errored sends and nothing else."""
    try:
        AnnouncementService(session).get(announcement_id)
    except AnnouncementNotFoundError as exc:
        raise _not_found(exc) from exc
    return ResendOut(retried_count=DeliveryReporter(session).retry_failed(announcement_id))


# -- §6.5's install-state report ----------------------------------------------
class InstallStateRowOut(BaseModel):
    person_id: uuid.UUID
    name: str
    phone: str | None = None


class InstallStateOut(BaseModel):
    """Who can receive a push at all, and the list to phone.

    Sits beside §5.11's delivery report on the dashboard because they answer two halves of
    one question, and this is the fixable half: a family here will be on every delivery
    report until somebody calls them.
    """

    installed_count: int
    not_installed_count: int
    by_platform: dict[str, int]
    not_installed: list[InstallStateRowOut]


@router.get("/comms/install-state", response_model=InstallStateOut)
def install_state(session: TenantSessionDep, _: ManagerOnly) -> InstallStateOut:
    """§6.5 -- "The dashboard lists guardians who have not installed, alongside the
    push-delivery report, so the office can see exactly who it needs to call."

    `ManagerOnly` for the same reason the delivery report is: it is a list of families' names
    and telephone numbers.
    """
    state = InstallStateService(session).report()
    return InstallStateOut(
        installed_count=state.installed_count,
        not_installed_count=state.not_installed_count,
        by_platform=state.by_platform,
        not_installed=[
            InstallStateRowOut(person_id=row.person_id, name=row.name, phone=row.phone)
            for row in state.not_installed
        ],
    )


# -- §5.11's inbox ------------------------------------------------------------
class MarkedReadOut(BaseModel):
    """How many rows `read-all` actually changed.

    The count the screen shows, and it counts what CHANGED rather than what exists —
    reporting "12 marked read" to a parent who had two unread would be a number they can see
    is wrong.
    """

    marked: int


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(
    request: Request,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    unread: bool = False,
    kind: str | None = None,
) -> NotificationPage:
    """§7's `GET /notifications`. §5.11's "permanent הודעות list", newest first.

    There is no `person_id` parameter and there will not be one: a notification is addressed
    to a person, and a route that let a caller name someone else would make another family's
    messages one query string away.

    `kind` exists for §5.14's at-risk card, which asks this person's inbox for one kind rather
    than reading a report. It is still scoped to the caller, so it widens nothing: the worst a
    caller can do with it is see fewer of their own messages.
    """
    rows, has_more = NotificationReader(session).inbox(
        _person_id(request), after=after, limit=limit, unread_only=unread, kind=kind
    )
    return NotificationPage(
        items=[NotificationOut.model_validate(row, from_attributes=True) for row in rows],
        next_cursor=rows[-1].id if has_more and rows else None,
        has_more=has_more,
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    request: Request,
    notification_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> NotificationOut:
    """404 rather than 403 for somebody else's message.

    403 would confirm that a notification with that id exists. For a message addressed to
    another family, that confirmation is itself the leak — and a client cannot act on the
    difference anyway.
    """
    row = NotificationReader(session).mark_read(_person_id(request), notification_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such notification"},
        )
    return NotificationOut.model_validate(row, from_attributes=True)


@router.post("/notifications/read-all", response_model=MarkedReadOut)
def mark_all_notifications_read(
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> MarkedReadOut:
    """`inbox.markAllRead`.

    `read-all` cannot be shadowed by `/notifications/{notification_id}/read`, whatever order
    the two are declared in: that route's path parameter is typed `uuid.UUID`, so a literal
    `read-all` fails to parse as one and never matches. Said out loud because the usual fix
    for this class of collision is careful ordering, and here the types already settle it.
    """
    return MarkedReadOut(marked=NotificationReader(session).mark_all_read(_person_id(request)))


# -- §5.11's eight switches ---------------------------------------------------
class NotificationPreferenceOut(BaseModel):
    """One switch, as `preferences.kind.*` renders it.

    `always_on` travels as data rather than as a list hardcoded in a component. §5.11's
    exemption is a product rule, and a component that carried its own copy would be a second
    place to change it -- and the likelier of the two to be missed.
    """

    kind_group: str
    enabled: bool
    always_on: bool


class NotificationPreferencesOut(BaseModel):
    """All eight, always, in `PREFERENCE_GROUPS` order.

    Wrapped in an object rather than returned as a bare list: this is not a paginated
    collection (G16 is about lists that grow), and a top-level array leaves nowhere to add a
    field later without breaking every generated client.
    """

    groups: list[NotificationPreferenceOut]


class NotificationPreferencePatch(BaseModel):
    kind_group: str = Field(min_length=1, max_length=20)
    enabled: bool


def _preferences(session: TenantSessionDep, person_id: uuid.UUID) -> NotificationPreferencesOut:
    return NotificationPreferencesOut(
        groups=[
            NotificationPreferenceOut(
                kind_group=row.kind_group, enabled=row.enabled, always_on=row.always_on
            )
            for row in NotificationPreferenceService(session).list_for(person_id)
        ]
    )


@router.get("/notification-preferences", response_model=NotificationPreferencesOut)
def get_notification_preferences(
    request: Request, session: TenantSessionDep
) -> NotificationPreferencesOut:
    """§7's `GET /notification-preferences`.

    Returns every group whatever is stored, because absence means on: a screen rendering
    only stored rows would show a guardian who has never touched it nothing at all.
    """
    return _preferences(session, _person_id(request))


@router.patch("/notification-preferences", response_model=NotificationPreferencesOut)
def patch_notification_preferences(
    request: Request,
    body: NotificationPreferencePatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> NotificationPreferencesOut:
    """One switch at a time, and the whole set comes back.

    Returning all eight rather than the one that changed means the screen cannot drift out
    of step with the server -- which matters here because two of the eight do not do what
    the switch implies, and §5.11's whole complaint about notification settings is people
    believing they turned something off.

    409 rather than 403 for a transactional group: the caller is permitted to ask, and the
    answer is about the state of the world (§5.11 does not allow this to be off) rather than
    about who they are.
    """
    person_id = _person_id(request)
    try:
        NotificationPreferenceService(session).set(person_id, body.kind_group, enabled=body.enabled)
    except TransactionalKindError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "notification_always_on",
                "message": "this notification is transactional and is always sent",
                "kind_group": str(exc.args[0]) if exc.args else body.kind_group,
            },
        ) from exc
    except UnknownPreferenceGroupError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unknown_preference_group",
                "message": "no such notification group",
                "allowed": list(PREFERENCE_GROUPS),
            },
        ) from exc
    return _preferences(session, person_id)


__all__ = ["AnnouncementPublisher", "ManagerOnly", "PushApp", "PushPlatform", "router"]
