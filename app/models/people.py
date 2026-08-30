"""SPEC §4.3's 'Students and guardians' block, plus the enrollment funnel.

`guardian` is **not** here — M1 already landed it in `app/models/person.py`, because §3.3
makes the (person, student, is_primary) link the only thing connecting a parent to
anything and the identity milestone needed it. This module supplies the `student` table
that link points at.

**There is no household or family entity**, and this module must never grow one. §4.3:
"'My children' is simply `SELECT student_id FROM guardian WHERE person_id = me`." A
household table would immediately raise the question of which household a child belongs to
after a separation, and the product has no good answer to that question by design.

**`is_primary` means exactly two things** (§4.3, §5.3): whose name the bill is addressed
to, and which person a הוראת קבע payment is matched to. Every guardian sees and does
exactly the same things, payments included. Nothing in this module branches on it.

**There is no `payment_mode` on a person** (§4.3). A payer is never locked into one way of
paying; §5.10's payments screen always offers all three. What a manager sets is the
*price* — and after **C11** that price is set on the **student** (`student.price_plan_id`),
never on a group and never on an enrollment.

**C11 and C12, settled together in W2's contract commit.** The club prices by how often a
child trains, not by which groups they attend, and it decides per child which of a group's
weekly sessions they come to. Those are the same input read twice: `enrollment.
attends_weekdays` is what the child attends, and the volume it implies is what the price is
set against. Designing either alone produces a model that contradicts the other — see
`app/services/people/attendance_pattern.py`, which both the billing run and the roster read
rather than re-deriving.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encryption import EncryptedJSON
from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 — `student  status(lead|trial|pending_approval|active|frozen|left|lost)`.
#: This is §5.4's funnel, and `student_status_history` records every move between them so
#: `GET /reports/funnel` is a query rather than a guess.
STUDENT_STATUSES = (
    "lead",
    "trial",
    "pending_approval",
    "active",
    "frozen",
    "left",
    "lost",
)

#: §4.3 — `student  health_status(missing|trial_signed|signed)`. **The W3 seam.** M4
#: populates it, M5 renders it through `BootstrapPayload.roster[]`, and neither lane opens
#: the other's file (plan §1.3 seam 4). It lives on `student` rather than being derived
#: per request because a coach's roster must render it offline, from the bootstrap cache.
HEALTH_STATUSES = ("missing", "trial_signed", "signed")

#: §4.3 — `enrollment  status(pending|active|frozen|ended)`. Distinct from the student's
#: own status: a student is `active` in the club while one of their enrollments has
#: `ended` because they moved group mid-year.
ENROLLMENT_STATUSES = ("pending", "active", "frozen", "ended")

#: §4.3 — `trial_booking  outcome(pending|converted|lost)`. §5.4's trial follow-up
#: automation reads this; `lost` is a real outcome and not an absence of one, which is
#: what makes the funnel report's denominator honest.
TRIAL_OUTCOMES = ("pending", "converted", "lost")

#: §4.3 — `registration_request  source(public_link|parent_app|manager)`.
REGISTRATION_SOURCES = ("public_link", "parent_app", "manager")

#: §4.3 — `registration_request  status(pending|approved|rejected)`.
REGISTRATION_STATUSES = ("pending", "approved", "rejected")


class Student(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student  studio_id, person_id UNIQUE, status, source?, joined_on?,
    left_on?, current_belt_id?, health_status, price_plan_id?`.

    A student **is** a person (`person_id UNIQUE`), not a copy of one. §3.3's identity
    model allows an adult student who is also their own guardian, and a second name/
    birthdate column here would immediately let the two drift apart.

    `current_belt_id` and `price_plan_id` point at `belt_rank` and `price_plan`, which are
    W4's tables. **Both constraints were added in W4's contract commit, not in W2**, and
    the delay was not tidiness: a `ForeignKey` string is resolved at mapper-configuration
    time, so writing one before W4 promoted those models would have failed every test in
    the suite rather than one. `guardian.student_id` was deferred the same way in W1.

    **`price_plan_id` is here and not on `enrollment` — that is C11.** The club prices by
    how often a child trains, not by which groups they attend, so one student has one
    tuition price however many groups they are enrolled in. §5.10's billing run walks
    students and creates **one** tuition charge each; walking enrollments, as the spec
    said before C11, bills a child in two groups twice a month at two different prices,
    silently and forever.
    """

    __tablename__ = "student"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('lead', 'trial', 'pending_approval', 'active', 'frozen', 'left', 'lost')",
            name="student_status",
        ),
        CheckConstraint(
            "health_status IN ('missing', 'trial_signed', 'signed')",
            name="student_health_status",
        ),
        CheckConstraint(
            "left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on",
            name="student_membership_range",
        ),
        # §5.14's dashboard counts and §11.5's retention job both scan by status.
        Index("ix_student_studio_id_status", "studio_id", "status"),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("person.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="lead")
    source: Mapped[str | None] = mapped_column(String(40))
    joined_on: Mapped[date | None] = mapped_column(Date)
    left_on: Mapped[date | None] = mapped_column(Date)
    #: W4's `belt_rank`, constrained since that wave's contract commit — see the class
    #: docstring for why it could not be written in W2.
    #:
    #: `SET NULL`: a studio reorganising its ladder is an ordinary thing, and a rank that
    #: cannot be deleted because one child holds it is a schema fighting the club. The
    #: child demotes to "no belt recorded", and `student_belt` still holds the history of
    #: how they got there.
    current_belt_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("belt_rank.id", ondelete="SET NULL")
    )
    health_status: Mapped[str] = mapped_column(String(15), nullable=False, default="missing")
    #: The club's `טופס הרשמה` block 1 -- `כיתה/גן`.
    #:
    #: **Free text, not an integer.** `ג'` and `גן חובה` are both answers the paper form
    #: accepts, and a smallint would refuse half the intake every September.
    grade: Mapped[str | None] = mapped_column(String(20))
    #: §5.10, C11 — the tuition price, **per student**. W4's `price_plan`, constrained
    #: since that wave's contract commit. Nullable: a `lead` or `trial` has no price yet,
    #: and §5.4 makes setting one part of the manager's conversion decision.
    #:
    #: `RESTRICT`, unlike the belt above, and the asymmetry is the point: a student
    #: silently losing their price is a student §5.10's run skips, which surfaces as a
    #: month where a family was simply not billed — and nobody notices a charge that was
    #: never raised.
    price_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("price_plan.id", ondelete="RESTRICT")
    )


class StudentPickupContact(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """The club's `טופס הרשמה`: 'אנשים אחרים (חוץ מההורים) שרשאים לאסוף את הילדים מהחוג'.

    **Not a `Guardian`.** A guardian row needs a `Person`, and minting person rows for
    people who will never log in pollutes §5.2's identity resolution -- every one of them
    becomes a candidate the resolver has to walk past. The paper form asks for a name and
    a phone; this table holds a name and a phone.

    **Encrypted, and readable by a coach.** The two are not in tension. Encryption is at
    rest: this is contact data for a third party who never agreed to anything, so it does
    not sit in plaintext next to the roster. But the entire purpose of the field is that
    whoever is at the door knows who may collect the child, so the read is authorised at
    coach level rather than the manager-only rule `health_declaration` carries. A pickup
    contact nobody at the door can read is write-only data.
    """

    __tablename__ = "student_pickup_contact"
    __tenant_table_args__ = (Index("ix_student_pickup_contact_student", "studio_id", "student_id"),)

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    #: `{"name": str, "phone": str, "relation": str | None}`.
    contact_encrypted: Mapped[Any] = mapped_column(
        EncryptedJSON("student_pickup_contact.contact_encrypted"), nullable=False
    )


class StudentFreeze(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student_freeze  student_id, from_date, to_date?, reason,
    created_by_person_id`.

    §5.10 step 4: "A frozen student generates nothing." The billing run reads this table
    rather than `student.status`, because a freeze is a date range and the run is asking
    about a *period*, not about right now. A student frozen for March and back in April
    is `frozen` today and still owes April.
    """

    __tablename__ = "student_freeze"
    __tenant_table_args__ = (
        CheckConstraint(
            "to_date IS NULL OR to_date >= from_date", name="student_freeze_date_range"
        ),
        Index("ix_student_freeze_student_id_from_date", "student_id", "from_date"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(200))
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )


class StudentStatusHistory(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student_status_history  student_id, from_status?, to_status, reason?,
    changed_by_person_id?, changed_at`.

    §5.4's funnel is computed from this table. There is deliberately **no `deleted_at`**:
    a row here is a fact that happened, and un-happening a status change would let the
    funnel report disagree with itself between two runs. `from_status` is nullable because
    the first row for a student has no previous state.
    """

    __tablename__ = "student_status_history"
    __tenant_table_args__ = (
        Index("ix_student_status_history_student_id_changed_at", "student_id", "changed_at"),
        # `GET /reports/funnel` groups by destination status over a window.
        Index("ix_student_status_history_studio_id_changed_at", "studio_id", "changed_at"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200))
    changed_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TrialBooking(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `trial_booking  student_id, session_id?, group_id, booked_at, attended?,
    outcome?, coach_note?, is_override BOOL`.

    §5.4: the public link's **only** job is a first lesson — enrollment is always a
    manager decision. This table is that first lesson and nothing more.

    `is_override` is a manager granting a **second** free trial. It is a column rather
    than a convention because §5.4 makes one free trial the rule, and a second one needs
    to be a deliberate, visible, countable act rather than someone quietly adding a row.

    `attended` is a nullable boolean on purpose — three states. `NULL` is "the lesson has
    not happened yet", which is different from `false`, "they did not turn up". The
    follow-up automation treats those two completely differently.
    """

    __tablename__ = "trial_booking"
    __tenant_table_args__ = (
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('pending', 'converted', 'lost')",
            name="trial_booking_outcome",
        ),
        Index("ix_trial_booking_studio_id_booked_at", "studio_id", "booked_at"),
        Index("ix_trial_booking_student_id", "student_id"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    booked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attended: Mapped[bool | None] = mapped_column(Boolean)
    outcome: Mapped[str | None] = mapped_column(String(12))
    coach_note: Mapped[str | None] = mapped_column(Text)
    is_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Enrollment(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `enrollment  student_id, group_id, status, started_on, ended_on?,
    attends_weekdays?`.

    **A link table, and it always was** (§3.3). A child in the competition group *and* the
    teenagers group is two rows, which the club confirmed is normal. §5.4's opening line
    used to assert "each child is enrolled in one group"; the schema never enforced it, the
    club contradicts it outright, and C11 is where that sentence was corrected.

    **This is not the billing run's unit of work — the student is** (C11). §5.10 step 1
    creates one tuition charge per *student*, at `student.price_plan_id`'s amount. Two
    enrollments are still one charge. This row carries no price at all, which is the point:
    a `price_plan_id` here is what made a child in two groups pay twice.

    **`attends_weekdays` is C12.** A group that trains twice a week may have students
    signed up for only one of those days, and §5.7's four attendance states cannot say "not
    expected today" — so such a student was `absent_unexcused` every week forever and read
    as 50% attendance while attending everything they agreed to. The manager sets the days
    per student; the roster and every §5.14 denominator read them through
    `app/services/people/attendance_pattern.py`.

    The two are one decision. "Twice a week" is simultaneously what a child attends (C12)
    and what they pay for (C11): the volume implied by these weekdays across a student's
    active enrollments is the number the manager sets `student.price_plan_id` against.
    """

    __tablename__ = "enrollment"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'active', 'frozen', 'ended')", name="enrollment_status"
        ),
        CheckConstraint("ended_on IS NULL OR ended_on >= started_on", name="enrollment_date_range"),
        # C12 — 0-6, matching `group_schedule_rule.weekday`. NULL is "every session of
        # this group"; an EMPTY array is not, and is rejected: it would silently mean a
        # student expected at nothing, which is a left student rather than an enrolled one.
        CheckConstraint(
            "attends_weekdays IS NULL OR ("
            "array_length(attends_weekdays, 1) > 0 "
            "AND attends_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[])",
            name="enrollment_attends_weekdays",
        ),
        # One live enrollment per (student, group). A student re-added to a group they are
        # already in is a duplicate, and a duplicate here bills them twice.
        Index(
            "uq_enrollment_live",
            "student_id",
            "group_id",
            unique=True,
            postgresql_where=text("ended_on IS NULL"),
        ),
        # The billing run's scan: every active enrollment in the studio.
        Index("ix_enrollment_studio_id_status", "studio_id", "status"),
        Index("ix_enrollment_group_id_status", "group_id", "status"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date)
    #: §5.7, C12 — which of this group's weekly sessions the student is expected at, as
    #: weekdays 0-6 matching `group_schedule_rule.weekday`. **NULL means all of them**,
    #: which is the default and the common case: a group that trains once a week never
    #: needs this set, and neither does a student who comes to everything.
    #:
    #: Weekdays rather than `group_schedule_rule_id`s on purpose. §5.6 rewrites future
    #: sessions when a rule changes, so a rule id here would dangle the day a manager
    #: edits the schedule and would silently drop the student off the roster. A weekday
    #: survives a schedule change; "Tuesday" means the same thing before and after.
    attends_weekdays: Mapped[list[int] | None] = mapped_column(ARRAY(SmallInteger))


class RegistrationRequest(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `registration_request  studio_id, source, payload_encrypted,
    matched_person_id?, status, submitted_at, reviewed_by_person_id?, reviewed_at?`.

    **The payload is encrypted at rest** (§11.1, `EncryptedJSON`). An unapproved
    registration is a stranger's personal data about a minor sitting in a queue — name,
    birthdate, phone, and under §5.4a a trial health declaration. It is the one table in
    W2 holding data nobody in the studio has yet agreed to receive, so it is the one that
    cannot sit in plaintext.

    `matched_person_id` is §5.4's person-and-child matching on **verified email or phone**.
    Nullable: a genuinely new family matches nobody, and that is the common case.
    """

    __tablename__ = "registration_request"
    __tenant_table_args__ = (
        CheckConstraint(
            "source IN ('public_link', 'parent_app', 'manager')",
            name="registration_request_source",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="registration_request_status"
        ),
        CheckConstraint(
            "status = 'pending' OR reviewed_at IS NOT NULL",
            name="registration_request_review_recorded",
        ),
        # The approval queue on dashboard `6c`: pending first, oldest first.
        Index("ix_registration_request_studio_id_status", "studio_id", "status"),
    )

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    #: G7-adjacent: never log this, never put it in an audit `diff`. §11.2 is explicit
    #: that health contents never reach `audit_log.diff`, and under §5.4a this payload
    #: can carry a trial declaration's answers.
    payload_encrypted: Mapped[Any] = mapped_column(
        EncryptedJSON("registration_request.payload_encrypted"), nullable=False
    )
    matched_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
