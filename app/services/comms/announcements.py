"""§5.11's announcements: who they reach, who may send them, and when they go out.

"A manager (studio-wide, any class, any group) or a lead coach (their own groups) publishes a
title and body, optionally scheduled. There are no replies and no chat."

**The audience is the risky part and it fails silently in both directions.** Too wide and the
club messages families who left; too narrow and a cancellation misses the children who will
turn up to it anyway. The publisher sees "sent" either way. §5.11's two answers are a count
before the button (`יגיע ל-{{count}} משפחות`) and a delivery report after it, and both are
built on `audience()` below.

**Who counts as involved is M7's answer, not a second one.** `app/services/events/publish.py`
resolved exactly this question for event targeting and wrote down why: "§5.4's `frozen` and
`left` are real statuses, and inviting a child who left three months ago is how a studio
loses a family twice." An announcement is the same sweep over the same tables, so it reuses
that rule rather than inventing one that would drift from it.

**Nothing here writes a `notification` row.** Everything goes through
`NotificationService.enqueue`, because §5.11's rule is that a message reaches both levels --
a row written here would be an inbox entry with no push and no delivery record, which is the
silent-failure gap this module exists to close.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, tuple_

from app.core.tenancy import TenantSession
from app.models.comms import Announcement
from app.models.people import Enrollment, Student
from app.models.person import Guardian
from app.models.structure import Class, Group, GroupStaff
from app.schemas.comms import AnnouncementIn
from app.services.comms import NotificationService
from app.services.comms.errors import (
    AnnouncementAlreadyPublishedError,
    AnnouncementNotFoundError,
    AudienceOutOfScopeError,
    NotYourAnnouncementError,
)
from app.services.comms.kinds import ANNOUNCEMENT

#: Who a STUDIO, CLASS or GROUP scope sweeps in. Copied deliberately from
#: `app/services/events/publish.py::SWEEPABLE_STATUSES` rather than re-derived: it is the
#: same question about the same column, and two answers that agree today would drift.
ANNOUNCEABLE_STUDENT_STATUSES = ("active", "trial")

#: §5.4 -- a `pending` enrolment is a registration the manager has not approved. The club's
#: internal notices are not for a family it has not accepted yet, which is the line
#: `app/services/attendance/roster.py::LIVE_ENROLLMENT_STATUSES` already draws for the
#: roster.
ANNOUNCEABLE_ENROLMENT_STATUSES = ("active",)


class AnnouncementService:
    """§5.11's publish flow. Authorization ROLE checks are the router's (`.claude/rules/api.md`);
    what lives here is the different question of which groups a given coach's grant covers."""

    def __init__(self, session: TenantSession) -> None:
        self._session = session

    # -- who it reaches -------------------------------------------------------
    def audience(self, scope_type: str, scope_id: uuid.UUID | None) -> list[uuid.UUID]:
        """Guardian person ids, deduplicated, in a stable order.

        **Deduplicated on the PERSON, not on the child.** §5.11's report counts families --
        "נשלח ל-24 משפחות" -- and a parent with two children in one group buzzed twice reads
        as a bug to them and makes the manager's count disagree with the number of households
        they actually reached.

        Ordered by id so a resend targets the same list in the same order, and so a test can
        assert on it without sorting.
        """
        stmt = (
            select(Guardian.person_id)
            .join(Student, Student.id == Guardian.student_id)
            .where(Student.status.in_(ANNOUNCEABLE_STUDENT_STATUSES))
        )
        if scope_type == "group":
            stmt = stmt.join(Enrollment, Enrollment.student_id == Student.id).where(
                Enrollment.group_id == scope_id,
                Enrollment.status.in_(ANNOUNCEABLE_ENROLMENT_STATUSES),
            )
        elif scope_type == "class":
            stmt = (
                stmt.join(Enrollment, Enrollment.student_id == Student.id)
                .join(Group, Group.id == Enrollment.group_id)
                .where(
                    Group.class_id == scope_id,
                    Enrollment.status.in_(ANNOUNCEABLE_ENROLMENT_STATUSES),
                )
            )
        # `studio` adds no join: every involved family, whether or not they are enrolled in
        # anything right now. A trial student with no enrolment yet is exactly the family a
        # "the club is closed on Sunday" notice must still reach.
        return sorted(set(self._session.execute(stmt.distinct()).scalars()))

    def audience_size(self, scope_type: str, scope_id: uuid.UUID | None) -> int:
        return len(self.audience(scope_type, scope_id))

    # -- who may send it ------------------------------------------------------
    def coached_group_ids(self, person_id: uuid.UUID) -> set[uuid.UUID]:
        """The groups this person leads. §3.2's "own groups", resolved through `group_staff`.

        `lead_coach` only: §5.11 names the lead coach as a publisher and §3.2 puts an
        assistant on the other side of that line. A `to_date` in the past is a grant that
        ended, and somebody who stopped coaching a group last term should not be able to
        message its families this term.
        """
        return set(
            self._session.execute(
                select(GroupStaff.group_id).where(
                    GroupStaff.person_id == person_id,
                    GroupStaff.role == "lead_coach",
                    GroupStaff.to_date.is_(None),
                )
            ).scalars()
        )

    def assert_may_publish_to(
        self,
        person_id: uuid.UUID,
        roles: frozenset[str],
        scope_type: str,
        scope_id: uuid.UUID | None,
    ) -> None:
        """§5.11's two publishers, and the difference between them.

        A manager or owner reaches anything in the studio. A lead coach reaches their own
        groups and nothing wider -- a studio-wide send from a coach is the club speaking in
        the club's voice to families they do not teach, which is a different act from telling
        their own group that tonight is off.
        """
        if roles & {"owner", "manager"}:
            return
        if scope_type != "group" or scope_id not in self.coached_group_ids(person_id):
            raise NotYourAnnouncementError(scope_type)

    def assert_scope_exists(self, scope_type: str, scope_id: uuid.UUID | None) -> None:
        """`scope_id` names a row of the right KIND.

        The database cannot check this. `announcement_scope_id_present` enforces the
        presence pairing, but `scope_id` carries no foreign key -- the referent depends on
        `scope_type`, and a polymorphic reference cannot have one. So a group scope naming a
        class id passes every constraint and resolves to an audience of nobody: a send that
        reports success and reaches no one.
        """
        if scope_type == "studio":
            if scope_id is not None:
                raise AudienceOutOfScopeError("a studio-wide announcement names no row")
            return
        if scope_id is None:
            raise AudienceOutOfScopeError(f"a {scope_type} announcement must name one")
        model = Group if scope_type == "group" else Class
        if self._session.get(model, scope_id) is None:
            raise AudienceOutOfScopeError(f"no such {scope_type}")

    # -- the row --------------------------------------------------------------
    def create(
        self, author_person_id: uuid.UUID, data: AnnouncementIn, *, at: datetime
    ) -> Announcement:
        row = Announcement(
            author_person_id=author_person_id,
            title=data.title,
            body=data.body,
            scope_type=data.scope_type,
            scope_id=data.scope_id,
            scheduled_for=data.scheduled_for,
        )
        self._session.add(row)
        self._session.commit()
        return row

    def get(self, announcement_id: uuid.UUID) -> Announcement:
        row = self._session.get(Announcement, announcement_id)
        if row is None or row.deleted_at is not None:
            raise AnnouncementNotFoundError(str(announcement_id))
        return row

    def list(
        self, *, after: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[Announcement], bool]:
        """The publisher's own list, newest first. G16."""
        stmt = select(Announcement).where(Announcement.deleted_at.is_(None))
        if after is not None:
            anchor = self._session.get(Announcement, after)
            if anchor is not None:
                stmt = stmt.where(
                    tuple_(Announcement.created_at, Announcement.id)
                    < (anchor.created_at, anchor.id)
                )
        stmt = stmt.order_by(Announcement.created_at.desc(), Announcement.id.desc())
        rows = list(self._session.execute(stmt.limit(limit + 1)).scalars())
        return rows[:limit], len(rows) > limit

    def update(self, announcement_id: uuid.UUID, data: AnnouncementIn) -> Announcement:
        """Editable only while it is a draft.

        Once it has gone out, parents hold it in their inboxes. Editing the source would make
        their copy and the manager's list disagree about what the club said, and the copy the
        parent read is the one that matters.
        """
        row = self.get(announcement_id)
        if row.published_at is not None:
            raise AnnouncementAlreadyPublishedError(str(announcement_id))
        row.title = data.title
        row.body = data.body
        row.scope_type = data.scope_type
        row.scope_id = data.scope_id
        row.scheduled_for = data.scheduled_for
        self._session.commit()
        return row

    def soft_delete(self, announcement_id: uuid.UUID, *, at: datetime) -> None:
        """G15. Inbox rows reference this announcement by id in their payload; a hard delete
        would leave every parent's copy pointing at nothing."""
        row = self.get(announcement_id)
        row.deleted_at = at
        self._session.commit()

    # -- the send -------------------------------------------------------------
    def publish(self, announcement_id: uuid.UUID, *, at: datetime) -> tuple[Announcement, int]:
        """Fan out to the audience, once. Returns the row and how many families were reached.

        `published_at` is the guard rather than a lock or a dedupe after the fact. `[ שליחה ]`
        is a button on a phone and a double tap is the ordinary accident -- twenty-four
        households buzzed twice is the most visible bug this screen can have.

        The whole fan-out is one transaction: `published_at` and every notification commit
        together, so a failure halfway through does not leave an announcement marked sent
        that reached eleven of twenty-four families with no way to tell which.
        """
        row = self.get(announcement_id)
        if row.published_at is not None:
            raise AnnouncementAlreadyPublishedError(str(announcement_id))

        recipients = self.audience(row.scope_type, row.scope_id)
        service = NotificationService(self._session)
        for person_id in recipients:
            service.enqueue(
                person_id,
                ANNOUNCEMENT,
                row.title,
                row.body,
                # The id, so §5.11's delivery report can find its own notifications again
                # and so the inbox row's tap opens the announcement. Never the body: that is
                # already in `notification.body`, and duplicating it would put the same text
                # in two columns that could then disagree.
                {"announcement_id": str(row.id)},
            )
        row.published_at = at
        self._session.commit()
        return row, len(recipients)
