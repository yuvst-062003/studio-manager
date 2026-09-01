"""The push boundary: a device registry, and a port with no wire behind it yet.

**There is no FCM transport in this repo, and that is a holdback rather than an omission.**
§6.5 names Web Push over FCM as the channel, but `app/core/config.py` carries no FCM or VAPID
setting and that file belongs to `core` rather than to this lane -- so there is nowhere to
put a server key without a cross-lane edit, and §15's "required from you" list never asked
for one. Recorded as `HB-push-transport`.

What that does and does not cost is worth being exact about, because "push is not wired" is
easy to read as "none of this works". Everything either side of the wire is real and tested:
the registration (§7's `POST /push-tokens`), the per-channel record, §5.11's delivery report,
§6.5's install-state list, and the push-disabled banner. What is missing is the HTTP call to
FCM and the service worker's `push` event handler -- and the second of those lives in each
app's service-worker entry, which this lane also does not own.

`RecordingPushSender` is what `app/workers/notify.py` drains through until a credential
exists. It is deliberately not a silent no-op: it returns a message id shaped like a real
one, so the delivery report exercises its `sent` path rather than only its failure paths.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

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
