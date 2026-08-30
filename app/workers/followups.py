"""§5.4a ④'s follow-up ladder, and the freeze that ends itself.

Run as `python -m app.workers.followups`, declared once in `infra/railway/jobs.json` --
because a worker nothing invokes is a feature that ships dead, and nothing in the suite
would notice.

**Four things, one daily pass**, because they all key off the same date arithmetic over the
same two tables and three separate cron entries would be three chances for one to be
forgotten:

  1. §5.4a ② -- the 24-hour reminder before a booked trial.
  2. §5.4a ④ -- day 1 / 3 / 7 after the lesson. Exactly those three days: a message on day
     two is one the club did not ask for, sent to somebody deciding whether to trust them.
  3. §5.4a ⑤ -- no conversion after the window closes -> `lost`, with a reason and no
     actor, because nobody decided; time passed.
  4. Freeze expiry. §7 offers no unfreeze endpoint and §5.4 gives the freeze a return date,
     so the date is what ends it -- and without this pass a student is `frozen` forever,
     invisible on every roster, while their guardian reads "מוקפא" in April. It rides along
     here rather than in its own job for the reason above.

**`attended` is three-valued and the ladder depends on it.** `NULL` is "the lesson has not
happened yet" -- asking "איך היה?" before the lesson is the most obvious way to look
automated. `False` is "they did not turn up", and gets a different message; "איך היה?" to
somebody who did not come is worse than silence.

**Cross-studio without the escape hatch.** A daily job iterating studios is exactly what
§4.2 sanctions `with_all_tenants` for -- but calling it here would put this file in front of
§19.7's demo-hygiene detector, which wants an entry in `app/core/demo.py` that this lane
does not own. So the worker takes a plain unscoped `Session` to list studios, then opens one
`use_studio` scope per studio for the actual work. That is stricter rather than looser:
every read inside the loop runs through the tenant filter.

**Messages go through `NotificationService.enqueue`** (W5's seam) and never by inserting a
`notification` row. §5.11's rule is that every message reaches both levels -- push is the
doorbell, the inbox is where the message lives -- and a caller that wrote the row itself
would produce an inbox entry with no push and no delivery report, reopening exactly the
silent-failure gap §5.11 exists to close. Until lane COMMS lands that seam raises
`NotImplementedError`; the worker counts the refusals and carries on, so the freeze expiry
and the lost sweep still run. The count is reported, never swallowed.
"""

from __future__ import annotations

import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.jobs import record_run
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.people import Student, TrialBooking
from app.models.person import Guardian
from app.models.schedule import Session as SessionRow
from app.models.studio import Studio
from app.services.comms import NotificationService
from app.services.people.students import StudentService

logger = logging.getLogger(__name__)

#: §5.4a ② -- 'Parent reminder 24h ahead.'
REMINDER_HOURS_BEFORE = 24

#: §5.4a ④ -- 'Day 1 "איך היה?" · day 3 · day 7'. Exactly these three.
FOLLOW_UP_DAYS = (1, 3, 7)

#: Where "איך היה?" leads. The parent app routes on `location.hash`, so the payload carries
#: the hash and the inbox turns it into a button -- see `InboxScreen`. A path would be wrong:
#: the parent app is one document and every in-app screen is a hash below it.
JOIN_ROUTE = "#/join"

#: §5.4a -- 'the 7-14 day conversion window every buyer's guide names as decisive'. The
#: sweep waits past the far end of it before writing anybody off, because `lost` is a real
#: outcome and a premature one is a family the club gave up on early.
LOST_AFTER_DAYS = 21


@dataclass
class Tally:
    reminders: int = 0
    follow_ups: int = 0
    marked_lost: int = 0
    freezes_expired: int = 0
    #: Notifications the comms seam refused. Counted rather than swallowed: until lane
    #: COMMS lands this is every message, and a run that reported "3 reminders sent" when
    #: none were would be worse than one that says so.
    undeliverable: int = 0
    studios: list[str] = field(default_factory=list)


def _notify(
    person_id: uuid.UUID, kind: str, title: str, body: str, payload: dict[str, object]
) -> bool:
    """One message, through W5's seam. Returns whether it was actually queued."""
    try:
        NotificationService().enqueue(
            person_id=person_id, kind=kind, title=title, body=body, payload=payload
        )
    except NotImplementedError:
        return False
    return True


def _guardians_of(session: Session, student_id: uuid.UUID) -> list[uuid.UUID]:
    """§5.3 -- every guardian is told, not only the primary. L8: `is_primary` decides bill
    addressing and הוראת קבע matching, and a reminder is neither."""
    return list(
        session.execute(
            select(Guardian.person_id).where(Guardian.student_id == student_id)
        ).scalars()
    )


def _remind_before_lessons(session: Session, *, at: datetime, tally: Tally) -> None:
    """§5.4a ② -- the 24-hour reminder.

    Bounded to a one-day slice so a daily run sends each reminder exactly once: a bare
    "starts within 24 hours" would re-send every day the job ran before the lesson.
    """
    window_start = at + timedelta(hours=REMINDER_HOURS_BEFORE) - timedelta(hours=12)
    window_end = at + timedelta(hours=REMINDER_HOURS_BEFORE) + timedelta(hours=12)
    rows = session.execute(
        select(TrialBooking, SessionRow)
        .join(SessionRow, TrialBooking.session_id == SessionRow.id)
        .where(
            TrialBooking.attended.is_(None),
            SessionRow.starts_at >= window_start,
            SessionRow.starts_at < window_end,
            SessionRow.status == "scheduled",
        )
    ).all()
    for booking, session_row in rows:
        for person_id in _guardians_of(session, booking.student_id):
            if _notify(
                person_id,
                "trial.reminder",
                "תזכורת לשיעור הניסיון",
                "נתראה מחר",
                {"trial_booking_id": str(booking.id), "session_id": str(session_row.id)},
            ):
                tally.reminders += 1
            else:
                tally.undeliverable += 1


def _walk_the_ladder(session: Session, *, at: datetime, tally: Tally) -> None:
    """§5.4a ④ -- day 1, 3 and 7 after the lesson, and nothing in between.

    Only bookings whose lesson has actually happened (`attended IS NOT NULL`) and which
    nobody has decided about yet (`outcome = 'pending'`). A converted family being asked
    how their trial went is the club telling them nobody is paying attention.
    """
    rows = list(
        session.execute(
            select(TrialBooking).where(
                TrialBooking.attended.is_not(None), TrialBooking.outcome == "pending"
            )
        ).scalars()
    )
    for booking in rows:
        elapsed = (at.date() - booking.booked_at.date()).days
        if elapsed not in FOLLOW_UP_DAYS:
            continue
        # §5.4a ③/④ -- a no-show and an attender get different messages. "איך היה?" to
        # somebody who did not come is worse than silence.
        #
        # **The attender's message now has a destination, and the no-show's still has
        # none.** This prompt has gone out on days 1, 3 and 7 since M3 with no link and no
        # action: the product asked a family whether they enjoyed themselves, three times,
        # and offered them no way to answer -- then wrote them off as `lost` on day 21. The
        # route is what the inbox turns into a button. `trial.no_show` is untouched for the
        # reason it exists at all: offering a family who did not come a join button is the
        # same mistake as asking them how it was, with money attached.
        attended = bool(booking.attended)
        kind = "trial.followup" if attended else "trial.no_show"
        title = "איך היה?" if attended else "התגעגענו אליכם"
        body = (
            "נשמח לשמוע מכם — ואם בא לכם להמשיך, אפשר להצטרף מכאן" if attended else "נשמח לשמוע מכם"
        )
        payload: dict[str, object] = {"trial_booking_id": str(booking.id), "day": elapsed}
        if attended:
            payload["route"] = JOIN_ROUTE
        for person_id in _guardians_of(session, booking.student_id):
            if _notify(
                person_id,
                kind,
                title,
                body,
                payload,
            ):
                tally.follow_ups += 1
            else:
                tally.undeliverable += 1


def _sweep_the_lost(session: Session, *, at: datetime, tally: Tally) -> None:
    """§5.4a ⑤ -- 'No conversion after N days -> status=lost, with a reason.'

    No actor: nobody decided, time passed. Attributing this to whoever configured the cron
    would make the audit trail lie about who decided.
    """
    cutoff = at - timedelta(days=LOST_AFTER_DAYS)
    rows = list(
        session.execute(
            select(TrialBooking, Student)
            .join(Student, TrialBooking.student_id == Student.id)
            .where(
                TrialBooking.outcome == "pending",
                TrialBooking.booked_at < cutoff,
                Student.status == "trial",
            )
        ).all()
    )
    for _booking, student in rows:
        StudentService.mark_lost(
            session,
            student_id=student.id,
            reason=f"no conversion within {LOST_AFTER_DAYS} days",
            at=at,
            actor_person_id=None,
        )
        tally.marked_lost += 1


def run_for_studio(session: Session, *, at: datetime, tally: Tally) -> Tally:
    """One studio's daily pass, inside an already-scoped session."""
    _remind_before_lessons(session, at=at, tally=tally)
    _walk_the_ladder(session, at=at, tally=tally)
    _sweep_the_lost(session, at=at, tally=tally)
    tally.freezes_expired += len(StudentService.expire_freezes(session, on=at.date(), at=at))
    return tally


def main() -> int:
    """The entry point, wrapped in its heartbeat. See app/core/jobs.py."""
    configure_logging()
    with Session(get_engine()) as heartbeat, record_run(heartbeat, "people-followups") as run:
        run.detail = _run_job()
    return 0


def _run_job() -> dict[str, int]:
    at = now()
    tally = Tally()

    # An unscoped session, for the one question that has no tenant: which studios exist.
    # §19.7 -- the demo studio's fixtures are reset nightly, so messaging its personas
    # would be messaging a fixture.
    with Session(get_engine(), expire_on_commit=False) as unscoped:
        studio_ids = list(
            unscoped.execute(
                select(Studio.id, Studio.slug).where(
                    Studio.status == "active", Studio.is_demo.is_(False)
                )
            ).all()
        )

    for studio_id, slug in studio_ids:
        tally.studios.append(slug)
        with (
            use_studio(studio_id),
            TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
        ):
            run_for_studio(scoped, at=at, tally=tally)
            scoped.commit()

    # Counts only. §5.4a's ladder is about children, and a log line naming one would
    # be a name in an aggregator the scrubber cannot un-see (§11.7, G7). The same dict
    # becomes the heartbeat's detail, which is read on screen and mailed when red --
    # `len(tally.studios)` and not the slugs, for that reason.
    counts = {
        "studios": len(tally.studios),
        "reminders": tally.reminders,
        "follow_ups": tally.follow_ups,
        "marked_lost": tally.marked_lost,
        "freezes_expired": tally.freezes_expired,
        "undeliverable": tally.undeliverable,
    }
    logger.info("people follow-ups complete", extra=counts)
    if tally.undeliverable:
        # Not a failure: lane COMMS has not landed, and the state changes above still
        # happened. Reported at WARNING so it is visible rather than inferred from a gap.
        logger.warning(
            "some notifications could not be queued",
            extra={"undeliverable": tally.undeliverable},
        )
    return counts


if __name__ == "__main__":
    sys.exit(main())
