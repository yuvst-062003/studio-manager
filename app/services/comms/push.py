"""The push boundary: a device registry, and the wire behind it.

**HB-push-transport, closed.** Web Push with VAPID -- §6.5 named it over FCM, and the
2026-09-02 findings register's §2.1 found two independent breaks: no credential existed
anywhere in this repo, and separately, the registration hooks called `pushManager.subscribe`
with no `applicationServerKey` even if one had. This file is the first half; the second is
`usePushRegistration.ts` and `useStaffPushRegistration.ts`, which now read the public half
of the same pair from `GET /push/vapid-public-key`.

No Google/Firebase project, no vendor account, no per-message cost: a Web Push endpoint is
whatever push service the subscribing BROWSER chose (Chrome's, Mozilla's, or Apple's for an
installed iOS PWA), and the VAPID key pair is only how this server proves to that service
which sender it is. `app/core/config.py`'s `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
`VAPID_SUBJECT` carry it -- unset in development and test, where `default_push_sender`
falls back to `RecordingPushSender` rather than either crashing or reaching a real push
service nobody asked it to.

`RecordingPushSender` remains what `app/workers/notify.py` drains through absent a
credential. It is deliberately not a silent no-op: it returns a message id shaped like a
real one, so the delivery report still exercises its `sent` path. `app/services/ops/checks.py`
is what stops that from being mistaken for the real thing in production -- it reads
`push_transport` off the latest `comms-notify` job_run and turns red if pushes were
attempted through anything other than `webpush`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Protocol

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_engine
from app.core.tenancy import TenantSession
from app.models.comms import PushToken


class PushSendError(RuntimeError):
    """The provider refused or errored.

    Distinct from `no_token` and from `denied`, and §5.11 keeps all three because they are
    three different actions: help the family install the app, ask them to turn the permission
    on, or retry the send. Collapsing them turns the manager's ⚠ list into a count nobody can
    act on.
    """


class PushSender(Protocol):
    """One device, one message. Returns the provider's id for the send.

    Keyword-only, so a future FCM implementation can take `collapse_key` or `ttl` without
    every call site shifting by one positional argument.
    """

    def send(self, *, token: str, title: str, body: str, payload: dict[str, Any]) -> str: ...


class RecordingPushSender:
    """The default sender: accepts everything and invents an id.

    Stands in for FCM until `HB-push-transport` closes. It does NOT pretend to be a
    delivery: `notification_delivery.status` moves to `sent`, which §5.11 distinguishes from
    `delivered` precisely because handing a message to a push service is not the same as a
    phone lighting up.
    """

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send(self, *, token: str, title: str, body: str, payload: dict[str, Any]) -> str:
        # Neither `title` nor `body` is stored on the instance and neither is logged -- §18.3.
        # The token prefix is kept so a test can assert which device was addressed without
        # the whole credential appearing in an assertion message.
        message_id = f"rec-{uuid.uuid4().hex}"
        self.sent.append((token, message_id))
        return message_id


class WebPushSender:
    """The real transport. One HTTP POST per device, straight to whatever push service the
    browser subscribed through -- there is no vendor account and no per-message cost, only
    the key pair `default_push_sender` reads from settings.

    `token` is `JSON.stringify(subscription)`, exactly as `usePushRegistration.ts` sent it to
    `POST /push-tokens` -- `{endpoint, keys: {p256dh, auth}}` is precisely what `pywebpush`
    calls `subscription_info`.
    """

    def __init__(self, *, private_key: str, subject: str) -> None:
        self._private_key = private_key
        self._subject = subject

    def send(self, *, token: str, title: str, body: str, payload: dict[str, Any]) -> str:
        try:
            subscription_info = json.loads(token)
        except ValueError as exc:
            raise PushSendError("malformed subscription") from exc
        try:
            response = webpush(
                subscription_info=subscription_info,
                # Encrypted end to end (aes128gcm, RFC 8291) before it leaves this process --
                # §18.3's title and body reach the device, never the push service in between.
                data=json.dumps({"title": title, "body": body, "payload": payload}),
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                # A push service that never answers must not hang the drain that every other
                # queued family is waiting behind.
                timeout=10,
            )
        except WebPushException as exc:
            raise PushSendError(_provider_reason(exc)) from exc
        # Most push services answer 201 with no `Location` -- that header is a leftover from
        # the pre-VAPID GCM API. Either way §5.11 only needs an opaque id a support
        # conversation can be traced through, not one the provider issued.
        location = response.headers.get("Location")
        return location or f"wp-{uuid.uuid4().hex}"


def _provider_reason(exc: WebPushException) -> str:
    """The push service's status line, never the payload it was refusing.

    `WebPushException`'s own message embeds the response BODY, and although that body is the
    provider's error text rather than anything from `data=` (which left this process already
    encrypted), §18.3's rule is to never assume what ends up in a field named `error` --
    status and reason are enough to tell `failed` apart from a permanent refusal.
    """
    response = getattr(exc, "response", None)
    if response is None:
        return "unavailable"
    return f"{response.status_code} {response.reason}".strip()


def default_push_sender() -> PushSender:
    """Which transport `app/workers/notify.py`'s drain uses, absent a test double.

    Real once all three VAPID settings are configured; `RecordingPushSender` otherwise, so a
    laptop with an empty `.env` runs the worker without crashing OR silently reaching a real
    push service. A partial pair (one key set, not the other) is not a working pair either --
    see `app/core/config.py`.
    """
    if settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY and settings.VAPID_SUBJECT:
        return WebPushSender(
            private_key=settings.VAPID_PRIVATE_KEY.get_secret_value(),
            subject=settings.VAPID_SUBJECT,
        )
    return RecordingPushSender()


def push_transport_name(sender: PushSender) -> str:
    """A stable label for §2.8/§13.2's ops check -- not `type(sender).__name__`, which would
    silently stop matching the string `app/services/ops/checks.py` compares against the
    moment this module's classes are renamed."""
    if isinstance(sender, WebPushSender):
        return "webpush"
    if isinstance(sender, RecordingPushSender):
        return "recording"
    return "custom"


class PushTokenService:
    """§7's `POST /push-tokens`, and the fan-out's "does this person have a device" lookup."""

    def __init__(self, session: TenantSession) -> None:
        self._session = session

    def register(
        self,
        person_id: uuid.UUID,
        *,
        token: str,
        app: str,
        platform: str,
        at: datetime,
    ) -> PushToken:
        """One device is one row, re-pointed rather than duplicated.

        `uq_push_token_token` is unique across the PRODUCT, not per studio, and the model's
        docstring spells out the consequence: `person` is tenant-scoped, so a guardian at two
        studios is two `person` rows and one device can be registered to only one of them at
        a time. M8 re-points on sign-in.

        **The existence lookup runs on a plain unscoped `Session`, deliberately.** The token
        may currently belong to a person in another studio -- that is the whole case this
        method exists to handle -- and a `TenantSession` read would not see the row, so the
        insert would hit the unique index and surface as a 500. `with_all_tenants` would work
        too and is the wrong tool: its caller registry lives in `app/core/demo.py`, which is
        `core`'s file, and §19.7's hygiene detector reads it. The workers already settled this
        shape -- an unscoped `Session` for the one lookup that has to cross, then the scoped
        session for everything else.
        """
        with Session(bind=get_engine(), expire_on_commit=False) as unscoped:
            existing_id = unscoped.execute(
                select(PushToken.id).where(PushToken.token == token)
            ).scalar_one_or_none()

        if existing_id is not None:
            row = self._session.get(PushToken, existing_id)
            if row is None:
                # The row exists in another studio, so the scoped session cannot see it.
                # Re-point it through the unscoped session: this is a device changing hands,
                # not a cross-tenant read of somebody's data -- the only columns touched are
                # the ones that say which person now holds this handset.
                with Session(bind=get_engine(), expire_on_commit=False) as unscoped:
                    moved = unscoped.get(PushToken, existing_id)
                    if moved is not None:
                        moved.studio_id = self._active_studio_id(person_id)
                        moved.person_id = person_id
                        moved.app = app
                        moved.platform = platform
                        moved.last_seen_at = at
                        unscoped.commit()
                        return self._session.get(PushToken, existing_id) or moved
            else:
                row.person_id = person_id
                row.app = app
                row.platform = platform
                row.last_seen_at = at
                self._session.commit()
                return row

        row = PushToken(
            person_id=person_id, app=app, platform=platform, token=token, last_seen_at=at
        )
        self._session.add(row)
        self._session.commit()
        return row

    def _active_studio_id(self, person_id: uuid.UUID) -> uuid.UUID:
        """The studio the caller is acting in, read off the person they are registering for.

        Read from the row rather than from the context var so a re-point cannot land a device
        in a studio the person does not belong to.
        """
        from app.models.person import Person

        person = self._session.get(Person, person_id)
        if person is None:  # pragma: no cover -- the router resolves person_id from the JWT
            raise ValueError("no such person in the active studio")
        return person.studio_id

    def deregister(self, person_id: uuid.UUID, *, token: str) -> bool:
        """Screen 8's notifications switch, travelling the other way.

        Scoped to `person_id` as well as the token, and that is the point rather than
        belt-and-braces: the token is a bearer-shaped string, so a delete keyed on it alone
        would let anyone holding one silence somebody else's handset. A caller who does not
        own the row gets the same answer as one whose device was already gone.

        Returns whether a row went, but the route reports 204 either way. A browser that
        lost its subscription, or a second tap on the switch, must land on 'notifications
        are off' -- the state the parent asked for -- rather than on an error they can do
        nothing about.

        Unlike `register`, this needs no unscoped read: a device belonging to a person in
        another studio is not this caller's to delete, so the `TenantSession` not seeing it
        is the correct outcome and not a bug to work around.
        """
        row = self._session.execute(
            select(PushToken).where(PushToken.token == token, PushToken.person_id == person_id)
        ).scalar_one_or_none()
        if row is None:
            return False
        self._session.delete(row)
        self._session.commit()
        return True

    def devices_for(self, person_id: uuid.UUID) -> list[PushToken]:
        """Every device this person has registered, across both apps.

        Both apps on purpose. §5.11's question is "can this person be reached", and a coach
        who is also a parent has two installs -- reporting `no_token` for somebody holding a
        phone that would buzz is exactly the kind of wrong entry that makes the office
        distrust the list.
        """
        return list(
            self._session.execute(
                select(PushToken).where(PushToken.person_id == person_id)
            ).scalars()
        )
