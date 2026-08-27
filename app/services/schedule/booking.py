"""Marking an extra or private session — the four checks that make a training plan real.

The manager's rule: base training is Tuesday and Friday; on 400 ₪ the student may choose
one more session per week and **must mark that they are coming**, after which the app stops
letting them mark more; on 550 ₪ there is no weekly limit and the Saturday private lessons
open up.

Four checks, all here, because a rule split across a router and a service is a rule with
two versions:

1. **Allowance** — live bookings for `extra` sessions in the same Sunday-to-Saturday week,
   against `price_plan.weekly_extra_allowance`. NULL always passes.
2. **Eligibility** — the student's base group must be linked to that extra group in
   `group_eligibility`, or, for an invite-only group, they must hold a live enrollment in it.
3. **Private** — refused unless the plan's allowance is NULL. The rule attaches to
   `kind='private'`, so no additional column is needed; `group.age_min` carries the age half
   and is the same check every group already has.
4. **Timing** — no mark and no release once the session has started.

Every refusal names its reason and, where a higher plan would remove it, says so.
`app.core.clock.now()` is the only clock in the application; this module takes `at` from
its caller for the same reason the billing run does — so §19.5's time travel reaches it and
so a worker and a request agree about when something happened.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.schedule import Session as SessionRow
from app.models.structure import Group
from app.models.training_plan import GroupEligibility, SessionBooking
from app.services.schedule.errors import BookingRefusedError
from app.services.schedule.rules import STUDIO_TZ, weekday_sunday_first


def week_start(moment: datetime) -> date:
    """The Sunday of the club week an instant falls in, **in Jerusalem**.

    `session.starts_at` is `timestamptz` in UTC and Jerusalem is UTC+2 or UTC+3, so a
    session stored at Saturday 22:00 UTC is Sunday morning locally and belongs to the
    *following* week's allowance. Getting this wrong hands one student a free credit twice
    a year and takes one away twice a year, silently — which is why both DST boundaries are
    pinned by tests rather than reasoned about here.

    `ZoneInfo` rather than a fixed offset: Israel moves on the last Friday of March and the
    last Sunday of October, and a hand-rolled offset is right for ten months of the year,
    which is exactly long enough for nobody to notice it is wrong.
    """
    local = moment.astimezone(STUDIO_TZ).date()
    return local - timedelta(days=weekday_sunday_first(local))


class BookingService:
    """Takes the session on the constructor, like every service in this codebase, and is
    exactly as tenant-scoped as the session it is handed."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- reads ----------------------------------------------------------------
    def base_group_ids(self, student_id: uuid.UUID) -> list[uuid.UUID]:
        """The base groups this student holds a live enrollment in.

        A list rather than one id: `enrollment` is a link table and always was (§3.3), and
        a child in the competition group *and* the teenagers group is two rows. In practice
        the timetable gives every student exactly one base group, but the query does not
        depend on that being true.
        """
        return list(
            self._session.execute(
                select(Enrollment.group_id)
                .join(Group, Group.id == Enrollment.group_id)
                .where(
                    Enrollment.student_id == student_id,
                    Enrollment.status == "active",
                    Group.kind == "base",
                )
            ).scalars()
        )

    def live_bookings_in_week(self, student_id: uuid.UUID, week_of: date) -> list[SessionBooking]:
        """This student's un-cancelled bookings for `extra` sessions in one club week.

        **`extra` only.** A private session on 550 ₪ costs no credit — the plan that unlocks
        it has no limit to spend from, so counting one would be counting against a number
        that does not exist.
        """
        rows = self._session.execute(
            select(SessionBooking, SessionRow.starts_at)
            .join(SessionRow, SessionRow.id == SessionBooking.session_id)
            .join(Group, Group.id == SessionRow.group_id)
            .where(
                SessionBooking.student_id == student_id,
                SessionBooking.cancelled_at.is_(None),
                Group.kind == "extra",
                SessionRow.status != "cancelled",
            )
        ).all()
        return [booking for booking, starts_at in rows if week_start(starts_at) == week_of]

    def is_eligible(self, student_id: uuid.UUID, group: Group) -> bool:
        """§7 check 2, on its own so the parent screen can grey a row without marking it.

        Three cases, and the third is why this is not one query:

        * **invite-only** — the enrollment the manager created, whatever the kind. This is
          the Girls Team, and §4.1's reason `person` gains no gender column.
        * **extra** — the `group_eligibility` link table.
        * **private** — open to anyone the OTHER two rules admit. §4's table gates the
          Saturday lesson on "age 12+, unlimited-allowance plan only", not on which base
          group the coach placed the child in, so a link-table check here would demand
          fifteen more rows to express a rule the plan already states.
        """
        if group.is_invite_only:
            return (
                self._session.execute(
                    select(Enrollment.id).where(
                        Enrollment.student_id == student_id,
                        Enrollment.group_id == group.id,
                        Enrollment.status == "active",
                    )
                ).first()
                is not None
            )
        if group.kind == "private":
            return True
        base_ids = self.base_group_ids(student_id)
        if not base_ids:
            return False
        return (
            self._session.execute(
                select(GroupEligibility.id).where(
                    GroupEligibility.extra_group_id == group.id,
                    GroupEligibility.base_group_id.in_(base_ids),
                )
            ).first()
            is not None
        )

    # -- writes ---------------------------------------------------------------
    def mark(
        self,
        studio_id: uuid.UUID,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> SessionBooking:
        """ "I am coming to this one." All four checks, in the order a parent meets them."""
        student = self._session.get(Student, student_id)
        if student is None:
            raise BookingRefusedError("no such student")
        session_row = self._session.get(SessionRow, session_id)
        if session_row is None:
            raise BookingRefusedError("no such session")
        group = self._session.get(Group, session_row.group_id)
        if group is None:  # pragma: no cover -- session.group_id is NOT NULL
            raise BookingRefusedError("no such group")

        if group.kind == "base":
            raise BookingRefusedError(
                "base sessions are included in every plan and are never marked"
            )
        if session_row.status == "cancelled":
            raise BookingRefusedError("that session was cancelled")
        # Check 4 first among the refusals a parent can actually hit: a session that has
        # started cannot be joined, whatever plan they are on.
        if at >= session_row.starts_at:
            raise BookingRefusedError("that session has already started")

        already = self._session.execute(
            select(SessionBooking).where(
                SessionBooking.student_id == student_id,
                SessionBooking.session_id == session_id,
                SessionBooking.cancelled_at.is_(None),
            )
        ).scalar_one_or_none()
        if already is not None:
            raise BookingRefusedError("that session is already marked")

        plan = (
            self._session.get(PricePlan, student.price_plan_id)
            if student.price_plan_id is not None
            else None
        )
        if plan is None:
            raise BookingRefusedError("this student has no price plan")

        if not self.is_eligible(student_id, group):
            # Never an upgrade hint: no plan in the club opens a group the coach has not
            # placed this child in, and offering one would be selling something that
            # changes nothing.
            raise BookingRefusedError("this student's group cannot attend that session")

        session_day = session_row.starts_at.astimezone(STUDIO_TZ).date()
        if group.kind == "private":
            if plan.weekly_extra_allowance is not None:
                raise BookingRefusedError(
                    "private sessions need a plan with no weekly limit", upgrade_hint=True
                )
            self._require_old_enough(student, group, session_day)
        else:
            self._require_old_enough(student, group, session_day)
            allowance = plan.weekly_extra_allowance
            if allowance is not None:
                spent = len(
                    self.live_bookings_in_week(student_id, week_start(session_row.starts_at))
                )
                if spent >= allowance:
                    raise BookingRefusedError("no extra sessions left this week", upgrade_hint=True)

        booking = SessionBooking(
            studio_id=studio_id,
            student_id=student_id,
            session_id=session_id,
            marked_by_person_id=by_person_id,
        )
        self._session.add(booking)
        self._session.flush()
        return booking

    def release(
        self, booking_id: uuid.UUID, *, by_person_id: uuid.UUID | None, at: datetime
    ) -> SessionBooking:
        """Give the credit back — **until the session starts, and not after.**

        §3.2: free until then, then spent whether or not the student attended. That gives a
        family real flexibility and gives the coach a roster that stops moving at the moment
        it matters.

        `cancelled_at`, never a DELETE: a booking that vanished would take with it the
        record that a credit was spent and returned, and the live unique index is partial
        precisely so the same session can be marked again.
        """
        booking = self._session.get(SessionBooking, booking_id)
        if booking is None:
            raise BookingRefusedError("no such booking")
        if booking.cancelled_at is not None:
            raise BookingRefusedError("that booking was already released")
        session_row = self._session.get(SessionRow, booking.session_id)
        if session_row is not None and at >= session_row.starts_at:
            raise BookingRefusedError("that session has already started")
        booking.cancelled_at = at
        self._session.flush()
        return booking

    # -- internals ------------------------------------------------------------
    def _require_old_enough(self, student: Student, group: Group, on: date) -> None:
        """`group.age_min` / `age_max`, the same check every group already has.

        Measured on the SESSION's local date rather than on the request's: the group's
        floor is about who is on the mat, and a child who turns 12 the day before the
        Saturday lesson is 12 at the lesson.

        A student with no birthdate passes. The club knows children it has no birthday for,
        and refusing one a session over a missing field would be the app enforcing its own
        data quality on a child standing in a dojo.
        """
        if group.age_min is None and group.age_max is None:
            return
        person = self._session.get(Person, student.person_id)
        if person is None or person.birthdate is None:
            return
        years = whole_years(person.birthdate, on=on)
        if group.age_min is not None and years < group.age_min:
            raise BookingRefusedError("this student is below that group's age")
        if group.age_max is not None and years > group.age_max:
            raise BookingRefusedError("this student is above that group's age")


def whole_years(birthdate: date, *, on: date) -> int:
    """Completed years between two dates. `on` is always supplied — `date.today()` is a
    wall-clock read, and `app.core.clock.now()` is the only clock in the application."""
    return on.year - birthdate.year - ((on.month, on.day) < (birthdate.month, birthdate.day))
