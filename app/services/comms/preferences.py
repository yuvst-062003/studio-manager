"""§5.11's eight switches: what the settings screen reads, and what the fan-out asks.

One service with two callers that want different shapes of the same fact. `allows()` is the
fan-out's question -- may this one message go out -- and answers for a KIND. `list_for()` is
the screen's, and answers for all eight GROUPS at once, including the ones nobody has ever
touched, because a screen that rendered only stored rows would show a new guardian nothing at
all and would reorder itself as they toggled.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.comms import PREFERENCE_GROUPS, NotificationPreference
from app.services.comms.errors import TransactionalKindError, UnknownPreferenceGroupError
from app.services.comms.kinds import ALWAYS_ON_GROUPS, group_for, is_transactional


@dataclass(frozen=True)
class PreferenceRow:
    """One switch, as the settings screen needs it.

    `always_on` travels to the client as data rather than as a hardcoded list inside a
    component. §5.11's exemption is a product rule, and a component that knew it would be a
    second place to change when the rule does -- and the likelier of the two to be missed.
    """

    kind_group: str
    enabled: bool
    always_on: bool


class NotificationPreferenceService:
    """Reads and writes `notification_preference`.

    Takes an already-scoped session: `TenantSession` filters every read by the active studio
    and stamps every write, so nothing here mentions `studio_id` at all.
    """

    def __init__(self, session: TenantSession) -> None:
        self._session = session

    def allows(self, person_id: uuid.UUID, kind: str) -> bool:
        """May a notification of `kind` be pushed to `person_id`?

        Three answers, in this order, and the order is the rule:

        1. **Transactional kinds always may.** §5.11's exemption outranks any stored row,
           which is why this is checked before the row is even read -- a `health` row that
           somehow said `false` (a direct database edit, a bad migration) must not win.
        2. **Ungoverned kinds always may.** No switch exists, so nothing turned it off.
        3. **Otherwise, whatever is stored, defaulting to on.** Absence means on -- see
           `app/models/comms.py::NotificationPreference`.

        This governs the PUSH channel only. The inbox row is written regardless: §5.11 makes
        the inbox the place the message lives, needing no permission and never expiring, so
        a muted type is a doorbell somebody switched off rather than a message that never
        arrived. `app/services/comms/notifications.py` is where that distinction is applied.
        """
        if is_transactional(kind):
            return True
        group = group_for(kind)
        if group is None:
            return True
        stored = self._session.execute(
            select(NotificationPreference.enabled).where(
                NotificationPreference.person_id == person_id,
                NotificationPreference.kind_group == group,
            )
        ).scalar_one_or_none()
        return True if stored is None else stored

    def list_for(self, person_id: uuid.UUID) -> list[PreferenceRow]:
        """Every group, in PREFERENCE_GROUPS order, whatever is stored.

        The order is the one `preferences.kind.*` reads in Hebrew, and it is fixed here
        rather than in the client so all three surfaces agree.
        """
        stored = {
            row.kind_group: row.enabled
            for row in self._session.execute(
                select(NotificationPreference).where(NotificationPreference.person_id == person_id)
            ).scalars()
        }
        return [
            PreferenceRow(
                kind_group=group,
                # An always-on group reads as enabled whatever is stored, so the screen can
                # never show `preferences.off` beside `preferences.alwaysOn`.
                enabled=True if group in ALWAYS_ON_GROUPS else stored.get(group, True),
                always_on=group in ALWAYS_ON_GROUPS,
            )
            for group in PREFERENCE_GROUPS
        ]

    def set(self, person_id: uuid.UUID, kind_group: str, *, enabled: bool) -> PreferenceRow:
        """Turn one group on or off.

        Refuses to turn an always-on group OFF, and accepts turning it on. Refusing both
        would make the endpoint fail on a no-op, which is what a settings screen sends when
        somebody toggles a switch twice.

        Upserts rather than inserts: `uq_notification_preference_person_id_kind_group` would
        reject the second write, so an insert-only service turns the second toggle into a
        500.
        """
        if kind_group not in PREFERENCE_GROUPS:
            raise UnknownPreferenceGroupError(kind_group)
        if kind_group in ALWAYS_ON_GROUPS and not enabled:
            raise TransactionalKindError(kind_group)

        row = self._session.execute(
            select(NotificationPreference).where(
                NotificationPreference.person_id == person_id,
                NotificationPreference.kind_group == kind_group,
            )
        ).scalar_one_or_none()
        if row is None:
            row = NotificationPreference(
                person_id=person_id, kind_group=kind_group, enabled=enabled
            )
            self._session.add(row)
        else:
            row.enabled = enabled
        self._session.commit()
        return PreferenceRow(
            kind_group=kind_group,
            enabled=enabled,
            always_on=kind_group in ALWAYS_ON_GROUPS,
        )
