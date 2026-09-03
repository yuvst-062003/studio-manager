"""§5.14's headline manager alert — register §2.3: "nothing produces it."

Run as `python -m app.workers.at_risk`, declared once in `infra/railway/jobs.json` — a
worker nothing invokes is a feature that ships dead, and nothing in the suite would notice
(same rule `app/workers/health_reminders.py` states).

**The rule is SPEC §5.14, verbatim: "three or more consecutive expected sessions missed."**
Both words carry weight and both were a live decision, not a guess:

  * **Consecutive**, not merely three-in-a-lifetime. A student absent in September and
    again at random in December has not shown a pattern; three IN A ROW is what §5.14 asks
    for, and this worker never sums non-adjacent misses.
  * **Expected** (C12) — a student enrolled for one weekday of a twice-weekly group is not
    on the hook for the day nobody asked them to come. A session their `attends_weekdays`
    does not cover is invisible to the streak, exactly the way it is invisible to every
    other §5.14 denominator (`app/services/people/attendance_pattern.is_expected`).

**`unmarked` breaks the streak; it is never counted as a miss.** The roster's own docstring
(`app/services/attendance/roster.py`) states the rule this worker exists to keep: "no stored
row means `unmarked`, which is a real answer... and never an inferred absence." A coach who
has not reached the register yet is not evidence a child is drifting away — treating it as
one is exactly how register §2.3 predicted this alert would stop being trusted.

**The threshold is a studio setting, not a constant** — `app/services/attendance/settings.py`,
default 3 (SPEC §5.14's own number), editable by a manager on the dashboard
(`PUT /attendance/settings`) rather than baked in here, because a club's sense of "at risk"
is a product decision the manager gets to make, not one this worker should guess at.

**Idempotent per STREAK, not per run.** A job that fires every time it runs while a
three-absence streak sits unchanged would train the manager to ignore the card — the same
failure mode §5.11's whole fan-out exists to avoid. Each alert's payload carries
`streak_start_session_id`, the oldest session in the run that triggered it; the next run
skips a student whose current streak starts at the same session, and fires again only once
something has actually changed — the student returned and later drifted away again, which
is a new streak with a new start.

**Messages go through `NotificationService.enqueue`** (W5's seam), never by inserting a
`notification` row directly, for the same reason every other worker in this package does it
that way: §5.11's rule is that every message reaches both the push and the inbox levels.
"""

from __future__ import annotations

import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.jobs import record_run
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.attendance import Attendance
from app.models.comms import Notification
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.models.schedule import Session as SessionRow
from app.models.studio import Studio
from app.services.attendance.settings import get_at_risk_threshold
from app.services.comms import NotificationService
from app.services.comms.kinds import AT_RISK
from app.services.people.attendance_pattern import is_expected
from app.services.people.group_days import studio_weekday

logger = logging.getLogger(__name__)

#: §5.14 — only an explicit absence counts as a miss. `unmarked` is a real status
#: (roster.py) and `present` obviously is not one.
MISSED_STATUSES = ("absent_excused", "absent_unexcused")

#: §5.4's live enrollment, same convention `roster.py::LIVE_ENROLLMENT_STATUSES` uses — a
#: `pending` or `frozen` enrollment is not a child anyone expects on a mat.
LIVE_ENROLLMENT_STATUSES = ("active",)

#: Far more than any real streak could ever need — bounded so one student with years of
#: history cannot turn this into an unbounded scan, the same reasoning
#: `bootstrap.py::MAX_SESSIONS_IN_WINDOW` states.
LOOKBACK_SESSIONS = 30


@dataclass
class Tally:
    raised: int = 0
    #: A qualifying streak with no guardian to tell — a data gap worth a log line, not
    #: silence and not a crash.
    no_contact: int = 0
    studios: list[str] = field(default_factory=list)


def _consecutive_missed(
    session: TenantSession,
    *,
    group_id: uuid.UUID,
    student_id: uuid.UUID,
    attends_weekdays: list[int] | None,
    before: datetime,
) -> tuple[int, SessionRow | None]:
    """Walk the group's sessions newest-first, counting an unbroken run of misses.

    Returns `(streak, oldest_session_in_the_streak)` — the second is the streak's
    identity for idempotency (see module docstring), and `None` when the streak is 0.

    A session this enrollment is not expected at is **skipped, not a break** — C12's
    "invisible to the streak entirely." Only `present` or `unmarked` ends the run.
    """
    rows = session.execute(
        select(SessionRow, Attendance)
        .outerjoin(
            Attendance,
            and_(Attendance.session_id == SessionRow.id, Attendance.student_id == student_id),
        )
        .where(
            SessionRow.group_id == group_id,
            SessionRow.ends_at <= before,
            SessionRow.status != "cancelled",
        )
        .order_by(SessionRow.starts_at.desc())
        .limit(LOOKBACK_SESSIONS)
    ).all()

    streak = 0
    oldest: SessionRow | None = None
    for session_row, mark in rows:
        weekday = studio_weekday(session_row.starts_at)
        if not is_expected(attends_weekdays, (weekday,), weekday):
            continue
        status = mark.status if mark is not None else "unmarked"
        if status not in MISSED_STATUSES:
            break
        streak += 1
        oldest = session_row
    return streak, oldest


@dataclass
class Contact:
    person_id: uuid.UUID
    phone: str | None


def _contact_guardian(session: TenantSession, student_id: uuid.UUID) -> Contact | None:
    """§5.3 — 'all guardians are equal', but §5.14's card names exactly one to call.
    `is_primary` first when one is set; the earliest-added guardian otherwise, so a
    student whose family never marked a primary still has somebody to ring rather than
    nobody. `Guardian` carries no phone of its own (it lives on `Person`, and this
    codebase has no ORM relationships to traverse — D-M1-1 is explicit that
    `guardian.student_id` is a plain column, not a mapped join), hence the explicit join.
    """
    row = session.execute(
        select(Guardian.person_id, Person.phone)
        .join(Person, Person.id == Guardian.person_id)
        .where(Guardian.student_id == student_id)
        .order_by(Guardian.is_primary.desc(), Guardian.created_at)
        .limit(1)
    ).first()
    return Contact(person_id=row.person_id, phone=row.phone) if row is not None else None


def _already_alerted_for(
    session: TenantSession, *, student_id: uuid.UUID, streak_start_session_id: uuid.UUID
) -> bool:
    last = session.execute(
        select(Notification.payload["streak_start_session_id"].astext)
        .where(
            Notification.kind == AT_RISK,
            Notification.payload["student_id"].astext == str(student_id),
        )
        .order_by(Notification.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    return last == str(streak_start_session_id)


def raise_at_risk(session: TenantSession, studio: Studio, *, at: datetime, tally: Tally) -> None:
    threshold = get_at_risk_threshold(session, studio)
    enrollments = session.execute(
        select(Enrollment, Student, Person)
        .join(Student, Student.id == Enrollment.student_id)
        .join(Person, Person.id == Student.person_id)
        .where(Enrollment.status.in_(LIVE_ENROLLMENT_STATUSES), Student.status == "active")
    ).all()

    for enrollment, student, person in enrollments:
        streak, oldest = _consecutive_missed(
            session,
            group_id=enrollment.group_id,
            student_id=student.id,
            attends_weekdays=enrollment.attends_weekdays,
            before=at,
        )
        if streak < threshold or oldest is None:
            continue
        if _already_alerted_for(session, student_id=student.id, streak_start_session_id=oldest.id):
            continue

        contact = _contact_guardian(session, student.id)
        if contact is None:
            tally.no_contact += 1
            continue

        # Gender-neutral on purpose: `person.gender` is not a field this lane can assume
        # exists, and "N היעדרויות רצופות" (register/reports' own phrasing,
        # `i18n/he/reports.ts::atRisk.consecutiveAbsences`) needs no conjugated verb.
        display_name = f"{person.first_name} {person.last_name}"
        # §5.14 — "a one-tap צור קשר עם ההורה", which is why `contact_phone` travels in the
        # payload rather than the client having to look the guardian up a second time.
        NotificationService().enqueue(
            person_id=contact.person_id,
            kind=AT_RISK,
            title="תלמיד בסיכון",
            body=f"{display_name} — {streak} היעדרויות רצופות",
            payload={
                "student_id": str(student.id),
                "group_id": str(enrollment.group_id),
                "contact_person_id": str(contact.person_id),
                "contact_phone": contact.phone,
                "missed_count": streak,
                "streak_start_session_id": str(oldest.id),
            },
        )
        tally.raised += 1


def main() -> int:
    """The entry point, wrapped in its heartbeat. See app/core/jobs.py."""
    configure_logging()
    with (
        Session(bind=get_engine()) as heartbeat,
        record_run(heartbeat, "attendance-at-risk") as run,
    ):
        run.detail = _run_job()
    return 0


def _run_job() -> dict[str, int]:
    at = now()
    tally = Tally()

    with Session(bind=get_engine()) as unscoped:
        studios = list(
            unscoped.execute(
                select(Studio.id, Studio.slug).where(
                    Studio.status == "active", Studio.is_demo.is_(False)
                )
            ).all()
        )

    for studio_id, slug in studios:
        tally.studios.append(slug)
        with (
            use_studio(studio_id),
            TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
        ):
            studio = scoped.get(Studio, studio_id)
            if studio is None:
                continue
            raise_at_risk(scoped, studio, at=at, tally=tally)
            scoped.commit()

    # Counts only (G7) — never a student's name, and the payload built above is never
    # logged either (§18.3 puts a notification payload in the "never" column).
    counts = {"studios": len(tally.studios), "raised": tally.raised, "no_contact": tally.no_contact}
    logger.info("at-risk sweep complete", extra=counts)
    if tally.no_contact:
        logger.warning("some at-risk students have no guardian to contact", extra=counts)
    return counts


if __name__ == "__main__":
    sys.exit(main())
