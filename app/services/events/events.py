"""The event itself: created, read, listed and edited. Artboards `7a`, `7b`, `9i`, `12h`.

**`ends_at` is supplied here and nowhere else.** `EventCreateIn.ends_at` is nullable while
`event.ends_at` is `NOT NULL`, and `app/schemas/events.py` says the gap is deliberate --
§5.8 lets a manager pencil in a date before the schedule is settled, so the service closes
it. The value must be *strictly* later than `starts_at` or `event_time_range` rejects the
row, which is why "default to the start" is not an option.

**A new event is a draft.** §4.3: nothing is visible to a guardian until it is published,
which is what makes an event safe to build up over several sittings (`7b`'s autosave).

**`fee_agorot` is redacted for a coach-only caller.** §3.2's hard rule is unqualified --
"no charge, payment, debt or price is reachable from any coach-scoped endpoint or screen"
-- and an event's fee is a price. The redaction happens on the way out rather than in the
query, because a manager reads the same row through the same route.

**D9.2 -- nothing here carries a weight or a category.**
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import func, select, tuple_

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration, EventTarget
from app.models.people import Student
from app.models.person import Person
from app.models.structure import Class, Group
from app.schemas.events import EventCreateIn, EventOut, EventTargetOut, EventUpdateIn
from app.services.events.errors import EventNotEditableError, EventNotFoundError

#: What the service supplies when a manager gives no end. Two hours is the shortest thing
#: on the canvas that is not a session; any value works as long as it is strictly later,
#: because `event_time_range` is a CHECK and not a preference.
DEFAULT_DURATION = timedelta(hours=2)

#: §3.2's money row. Everything else sees `fee_agorot = None`.
MONEY_ROLES = frozenset({"owner", "manager"})


def redacts_fee(roles: frozenset[str] | set[str]) -> bool:
    """True when the caller is staff but not on §3.2's money row.

    A guardian is **not** redacted, and that is not an oversight: §5.8 puts the fee inside
    the parent's own confirm button (`7d`), and a parent asked to agree to an unnamed
    amount is being asked to agree to nothing in particular. The rule §3.2 states is about
    coaches.
    """
    return bool(roles) and not (set(roles) & MONEY_ROLES)


class EventService:
    """§5.8's event. Every method takes the session; none of them checks its caller (G6)."""

    @staticmethod
    def create(session: TenantSession, data: EventCreateIn, *, at: datetime) -> Event:
        row = Event(
            type=data.type,
            title=data.title,
            description=data.description,
            starts_at=data.starts_at,
            ends_at=data.ends_at or (data.starts_at + DEFAULT_DURATION),
            location_id=data.location_id,
            location_text=data.location_text,
            rsvp_deadline=data.rsvp_deadline,
            fee_agorot=data.fee_agorot,
            requires_consent=data.requires_consent,
            consent_text=data.consent_text,
            status="draft",
        )
        session.add(row)
        session.flush()
        EventService._replace_targets(session, row.id, data.targets)
        session.flush()
        return row

    @staticmethod
    def read(session: TenantSession, event_id: uuid.UUID) -> Event:
        row = session.get(Event, event_id)
        if row is None:
            raise EventNotFoundError(str(event_id))
        return row

    @staticmethod
    def list_events(
        session: TenantSession,
        *,
        types: Sequence[str] | None = None,
        statuses: Sequence[str] | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Event], bool]:
        """Keyset over `(starts_at, id)`.

        Ordered by the start rather than by creation: §5.8's list is chronological, `7a`
        splits it into קרובים and הסתיימו, and `ix_event_studio_id_starts_at` is the index
        the contract commit created for exactly this.
        """
        stmt = select(Event).order_by(Event.starts_at, Event.id)
        if types:
            stmt = stmt.where(Event.type.in_(types))
        if statuses:
            stmt = stmt.where(Event.status.in_(statuses))
        if after is not None:
            anchor = session.get(Event, after)
            if anchor is not None:
                # A row-value comparison rather than `starts_at > x OR (= x AND id > y)`:
                # one expression, and Postgres can serve it straight from
                # `ix_event_studio_id_starts_at`. The right-hand side is a plain tuple of
                # values -- `tuple_()` wraps columns, not literals.
                stmt = stmt.where(tuple_(Event.starts_at, Event.id) > (anchor.starts_at, anchor.id))
        rows = list(session.execute(stmt.limit(limit + 1)).scalars())
        return rows[:limit], len(rows) > limit

    @staticmethod
    def update(session: TenantSession, event_id: uuid.UUID, data: EventUpdateIn) -> Event:
        """`status` is absent from `EventUpdateIn` deliberately, and this refuses anything
        that is not a draft: publishing and cancelling are their own transitions, and §5.8
        notifies on both."""
        row = EventService.read(session, event_id)
        if row.status != "draft":
            raise EventNotEditableError(row.status)
        for name, value in data.model_dump(exclude_unset=True, exclude={"targets"}).items():
            setattr(row, name, value)
        # A PATCH that moved `starts_at` past an `ends_at` set earlier would violate
        # `event_time_range`. The same rule that fills the gap on create closes it here.
        if row.ends_at <= row.starts_at:
            row.ends_at = row.starts_at + DEFAULT_DURATION
        if data.targets is not None:
            EventService._replace_targets(session, row.id, data.targets)
        session.flush()
        return row

    # -- targets ---------------------------------------------------------------
    @staticmethod
    def _replace_targets(
        session: TenantSession, event_id: uuid.UUID, targets: list[EventTargetOut]
    ) -> None:
        """Targeting composes (§5.8): "both beginner groups plus three seniors" is five
        rows, not a query language.

        Replaced wholesale rather than diffed. `uq_event_target` is UNIQUE on
        (event_id, target_type, target_id), and a diff would have to reason about which of
        five rows moved in order to avoid tripping it -- for a set that is never large.
        """
        for existing in session.execute(
            select(EventTarget).where(EventTarget.event_id == event_id)
        ).scalars():
            session.delete(existing)
        session.flush()
        seen: set[tuple[str, uuid.UUID | None]] = set()
        for target in targets:
            # `studio` names no particular row, so its `target_id` is normalised to NULL --
            # `event_target_has_an_id` allows the null only for that type, and two studio
            # rows carrying different stray ids would both survive the unique index.
            key = (
                target.target_type,
                None if target.target_type == "studio" else target.target_id,
            )
            if key in seen:
                continue
            seen.add(key)
            session.add(EventTarget(event_id=event_id, target_type=key[0], target_id=key[1]))

    @staticmethod
    def targets_of(
        session: TenantSession, event_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[EventTargetOut]]:
        """Resolved for display, so `7a`'s list does not need N lookups per row."""
        if not event_ids:
            return {}
        rows = list(
            session.execute(
                select(EventTarget).where(EventTarget.event_id.in_(event_ids))
            ).scalars()
        )
        names = EventService._display_names(session, rows)
        out: dict[uuid.UUID, list[EventTargetOut]] = {event_id: [] for event_id in event_ids}
        for row in rows:
            out.setdefault(row.event_id, []).append(
                EventTargetOut(
                    target_type=row.target_type,
                    target_id=row.target_id,
                    display_name=names.get((row.target_type, row.target_id)),
                )
            )
        return out

    @staticmethod
    def _display_names(
        session: TenantSession, rows: list[EventTarget]
    ) -> dict[tuple[str, uuid.UUID | None], str]:
        """One query per referent kind, not one per row.

        `event_target.target_id` carries no foreign key -- the referent depends on
        `target_type`, and a polymorphic reference cannot have one -- so the join has to be
        made here, by type.
        """
        by_type: dict[str, set[uuid.UUID]] = {"class": set(), "group": set(), "student": set()}
        for row in rows:
            if row.target_type in by_type and row.target_id is not None:
                by_type[row.target_type].add(row.target_id)

        names: dict[tuple[str, uuid.UUID | None], str] = {}
        if by_type["class"]:
            for row_id, name in session.execute(
                select(Class.id, Class.name).where(Class.id.in_(by_type["class"]))
            ):
                names[("class", row_id)] = name
        if by_type["group"]:
            for row_id, name in session.execute(
                select(Group.id, Group.name).where(Group.id.in_(by_type["group"]))
            ):
                names[("group", row_id)] = name
        if by_type["student"]:
            for row_id, first, last in session.execute(
                select(Student.id, Person.first_name, Person.last_name)
                .join(Person, Person.id == Student.person_id)
                .where(Student.id.in_(by_type["student"]))
            ):
                names[("student", row_id)] = f"{first} {last}".strip()
        return names

    # -- counts ----------------------------------------------------------------
    @staticmethod
    def rsvp_counts(
        session: TenantSession, event_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[int, int, int]]:
        """`(yes, no, pending)` per event.

        `pending` is counted rather than inferred from a total, because §5.8's whole point
        is seeing who has *not* answered -- and a derived "total minus answers" would go
        wrong the first time a registration is deleted with a student.
        """
        if not event_ids:
            return {}
        tally: dict[uuid.UUID, list[int]] = {event_id: [0, 0, 0] for event_id in event_ids}
        index = {"yes": 0, "no": 1, "pending": 2}
        for event_id, rsvp, count in session.execute(
            select(EventRegistration.event_id, EventRegistration.rsvp, func.count())
            .where(EventRegistration.event_id.in_(event_ids))
            .group_by(EventRegistration.event_id, EventRegistration.rsvp)
        ):
            tally[event_id][index[rsvp]] = count
        return {event_id: (row[0], row[1], row[2]) for event_id, row in tally.items()}

    @staticmethod
    def consent_counts(
        session: TenantSession, event_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """Signed consents per event — 9i's `כל האישורים נחתמו` line."""
        if not event_ids:
            return {}
        return {
            event_id: count
            for event_id, count in session.execute(
                select(EventRegistration.event_id, func.count())
                .where(
                    EventRegistration.event_id.in_(event_ids),
                    EventRegistration.consent_signed_at.is_not(None),
                )
                .group_by(EventRegistration.event_id)
            )
        }

    # -- serialisation ---------------------------------------------------------
    @staticmethod
    def to_out(session: TenantSession, events: list[Event], *, redact_fee: bool) -> list[EventOut]:
        """A list in and a list out, so the two extra queries are made once per page.

        The single-row callers pass `[row]`; that is cheaper than a second code path that
        would have to be kept in step with this one about which fields are redacted.
        """
        event_ids = [row.id for row in events]
        targets = EventService.targets_of(session, event_ids)
        counts = EventService.rsvp_counts(session, event_ids)
        consents = EventService.consent_counts(session, event_ids)
        out: list[EventOut] = []
        for row in events:
            yes, no, pending = counts.get(row.id, (0, 0, 0))
            out.append(
                EventOut(
                    id=row.id,
                    type=row.type,
                    title=row.title,
                    description=row.description,
                    starts_at=row.starts_at,
                    ends_at=row.ends_at,
                    location_id=row.location_id,
                    location_text=row.location_text,
                    rsvp_deadline=row.rsvp_deadline,
                    fee_agorot=None if redact_fee else row.fee_agorot,
                    requires_consent=row.requires_consent,
                    consent_text=row.consent_text,
                    status=row.status,
                    targets=targets.get(row.id, []),
                    rsvp_yes_count=yes,
                    rsvp_no_count=no,
                    rsvp_pending_count=pending,
                    consent_signed_count=consents.get(row.id, 0),
                )
            )
        return out
