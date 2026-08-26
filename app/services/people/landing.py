"""§5.4a ① -- the club's shop window.

**These reads run on a plain, unscoped `Session`, and that is deliberate.** The tenant
filter is registered on `TenantSession`, so a plain `Session` is genuinely unfiltered --
which is what this path needs, because a stranger holding a flyer has no studio in context
and no token to put one in. `app/routers/identity.py` runs the entire sign-in flow the same
way, for the same reason.

The safety is not the filter, it is the predicate: **every query here names its studio
explicitly**, resolved from the slug or the group the caller supplied. Nothing in this
module reaches across studios, so `with_all_tenants` is never called and §19.7's
demo-hygiene detector has nothing to catch -- which is also why this lane needs no entry in
`app/core/demo.py`.

**The shapes are narrow on purpose.** `PublicGroupOut` has no `class_id` and no staff;
`TrialSlotOut` has neither, plus no attendance and no training year. §5.4a puts this URL on
Instagram and on a flyer QR, so anything a shape *can* carry is something anyone who
guesses a slug *will* receive.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.schedule import Session as SessionRow
from app.models.structure import Class, Group
from app.models.studio import Studio
from app.services.people.errors import NotFoundError
from app.services.people.group_days import ScheduleReader, training_weekdays

#: §5.4a step 4 -- 'the next N upcoming sessions of each chosen group'. Six weeks is long
#: enough that a group training once a week still offers a real choice, and short enough
#: that the list stays a picker rather than a calendar.
SLOT_WINDOW_WEEKS = 6

#: A picker, not a page. §7 says "the next N bookable sessions".
MAX_SLOTS = 12


@dataclass(frozen=True)
class PublicGroup:
    id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    training_weekdays: list[int]


class LandingService:
    @staticmethod
    def studio_by_slug(session: Session, *, slug: str) -> Studio:
        """§18.3 -- a suspended studio is invisible here. A suspension that leaves the
        booking page taking bookings has suspended nothing."""
        studio = session.execute(
            select(Studio).where(Studio.slug == slug, Studio.status == "active")
        ).scalar_one_or_none()
        if studio is None:
            raise NotFoundError(slug)
        return studio

    @staticmethod
    def studio_id_for_group(session: Session, *, group_id: uuid.UUID) -> uuid.UUID:
        """`group` reaches its studio through `class` (§4.3), and this is the one join that
        lets the sign-in-first booking find its tenant.

        The parent has just signed in and has no studio in their token -- they are a
        stranger until the request creates their guardian row (§6.1: "booking a trial
        creates the guardian row itself... the only self-service entry point in the
        system"). The group id came from this studio's own public group list, so it is the
        tenant the parent already chose.
        """
        row = session.execute(
            select(Class.studio_id)
            .join(Group, Group.class_id == Class.id)
            .join(Studio, Studio.id == Class.studio_id)
            .where(
                Group.id == group_id,
                Group.is_active.is_(True),
                Class.is_active.is_(True),
                Studio.status == "active",
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(str(group_id))
        return row

    @staticmethod
    def public_groups(
        session: Session, *, studio_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> list[PublicGroup]:
        """§5.4a step 2 -- 'groups filtered by the child's age where age_min/age_max are
        set.' The filtering is the client's; the range travels so it is possible.

        `training_weekdays` is here because parent `13a` shows "מתאמנים בימים" beside each
        group, and it comes through the seam (L5) like every other schedule fact.
        """
        rows = list(
            session.execute(
                select(Group)
                .join(Class, Group.class_id == Class.id)
                .where(
                    Class.studio_id == studio_id,
                    Class.is_active.is_(True),
                    Group.is_active.is_(True),
                )
                .order_by(Group.name)
            ).scalars()
        )
        return [
            PublicGroup(
                id=group.id,
                name=group.name,
                description=group.description,
                age_min=group.age_min,
                age_max=group.age_max,
                training_weekdays=sorted(
                    training_weekdays(group.id, since=since, schedule=schedule)
                ),
            )
            for group in rows
        ]

    @staticmethod
    def trial_slots(
        session: Session,
        *,
        group_id: uuid.UUID,
        studio_id: uuid.UUID,
        since: date,
        schedule: ScheduleReader,
        limit: int = MAX_SLOTS,
    ) -> list[tuple[SessionRow, Group, bool]]:
        """§7 -- 'the next N bookable sessions for a group'.

        `studio_id` is a parameter and is applied as a predicate rather than trusted from
        the group row: this runs on an unfiltered `Session`, so the scope has to be written
        out or it is not there at all.

        A cancelled session is returned with `is_bookable=False` rather than dropped. §5.4:
        "the picker greys out a slot rather than hiding it, so a parent can see the class
        exists and pick a different week instead of concluding there is nothing."
        """
        group = session.execute(
            select(Group)
            .join(Class, Group.class_id == Class.id)
            .where(Group.id == group_id, Class.studio_id == studio_id)
        ).scalar_one_or_none()
        if group is None:
            raise NotFoundError(str(group_id))
        sessions = schedule.materialize_sessions(
            group_id, since, since + timedelta(weeks=SLOT_WINDOW_WEEKS)
        )
        return [(row, group, row.status == "scheduled") for row in sessions][:limit]

    @staticmethod
    def landing(
        session: Session, *, slug: str, since: date, schedule: ScheduleReader
    ) -> tuple[Studio, list[PublicGroup]]:
        studio = LandingService.studio_by_slug(session, slug=slug)
        return studio, LandingService.public_groups(
            session, studio_id=studio.id, since=since, schedule=schedule
        )
