"""§5.5's escalating reminders — 'the parent gets escalating reminders on days 1, 3 and 7'.

Run as `python -m app.workers.health_reminders`, declared once in `infra/railway/jobs.json` —
because a worker nothing invokes is a feature that ships dead, and nothing in the suite would
notice.

**Two passes, one daily run.** They key off the same two tables and the same date arithmetic, and
two cron entries would be two chances for one to be forgotten:

  1. **§5.5's ladder.** Day 1, 3 and 7 after a student joined, while `health_status = 'missing'`.
     Exactly those three days: a message on day two is one the club did not ask for, sent to a
     family who has just handed over a child.
  2. **Renewal**, and **only when the studio asked for it.**
     `studio.settings['health_declaration_validity_months']` defaults to `null`, and §5.5 is
     explicit that a declaration does not expire. When it is set, this is what "turns on renewal
     reminders" means — computed from `signed_at`, never from `valid_until`, which stays `NULL`
     whatever the setting says.

**Nothing here blocks anything.** §5.5's whole argument is that blocking a row in an app does not
stop a child stepping onto a mat, so the app's job is to make the gap impossible to miss and to
chase the parent. This worker is the chasing. There is no code path in it that changes a student's
ability to be marked present, and there is no `block_attendance_without_health` setting to read.

**Cross-studio without the escape hatch**, exactly as `app/workers/followups.py` does it: a plain
unscoped `Session` lists the studios, then one `use_studio` scope per studio does the work. Calling
`with_all_tenants` would put this file in front of §19.7's demo-hygiene detector, whose registry
this lane does not own — and the loop is stricter rather than looser, since every read inside it
runs through the tenant filter.

**Messages go through `NotificationService.enqueue`** (W5's seam) and never by inserting a
`notification` row: §5.11's rule is that every message reaches both levels, and a caller that wrote
the row itself would produce an inbox entry with no push and no delivery report. Until lane COMMS
lands, that seam raises `NotImplementedError`; the refusals are counted and reported, never
swallowed, so a run that sent nothing cannot look like a run that sent everything.

**G7.** Every log line here carries counts. Not a child's name, not a studio member's name, and
certainly not an answer — this worker never reads one.
"""

from __future__ import annotations

import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.health import HealthDeclaration
from app.models.people import Student
from app.models.person import Guardian
from app.models.studio import Studio
from app.services.comms import NotificationService
from app.services.health.declarations import HealthDeclarationService

logger = logging.getLogger(__name__)

#: §5.5 -- 'escalating reminders on days 1, 3 and 7'. Exactly these three.
LADDER_DAYS = (1, 3, 7)

#: §5.5's renewal window, when a studio has opted into one. Read from `studio.settings`, which is
#: where §4.3 puts it -- a config flag, not a migration.
VALIDITY_SETTING = "health_declaration_validity_months"

#: How long before a renewal date the parent is told. One month: long enough to act, short enough
#: that the message is about something imminent.
RENEWAL_NOTICE_DAYS = 30

#: §5.5's ladder chases a family that has joined. A `lead` has not, and a `left` or `lost` student
#: has gone -- chasing either is the club asking a stranger for a medical form.
CHASEABLE_STATUSES = ("trial", "pending_approval", "active", "frozen")


@dataclass
class Tally:
    reminders: int = 0
    renewals: int = 0
    #: Notifications the comms seam refused. Counted rather than swallowed: until lane COMMS lands
    #: this is every message, and a run reporting "3 reminders sent" when none were would be worse
    #: than one that says so.
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
    """§5.3 -- every guardian is told, not only the primary. `is_primary` decides bill addressing
    and הוראת קבע matching, and a health reminder is neither."""
    return list(
        session.execute(
            select(Guardian.person_id).where(Guardian.student_id == student_id)
        ).scalars()
    )


def _days_since_joining(student: Student, today: date) -> int | None:
    """`joined_on` where there is one, `created_at` otherwise.

    A `lead` or a `trial` has no `joined_on` yet (§4.3 makes it nullable) and is exactly the family
    §5.4a's funnel is mid-way through — so the ladder counts from when the record appeared, which
    is when the club first had somebody to chase.
    """
    reference = student.joined_on or (
        student.created_at.date() if student.created_at is not None else None
    )
    if reference is None:
        return None
    return (today - reference).days


def chase_missing(session: TenantSession, *, at: datetime, tally: Tally) -> None:
    """§5.5's day 1 / 3 / 7 ladder, for one studio.

    `trial_signed` is chased too, and deliberately. §5.5's gate is about the **full** declaration:
    a family that signed the short trial form still owes one, they are the likeliest to convert,
    and a ladder that skipped them would go quiet on exactly the students the club is trying to
    keep.
    """
    today = at.date()
    rows = list(
        session.execute(
            select(Student).where(
                Student.health_status.in_(("missing", "trial_signed")),
                Student.status.in_(CHASEABLE_STATUSES),
            )
        ).scalars()
    )
    for student in rows:
        elapsed = _days_since_joining(student, today)
        if elapsed not in LADDER_DAYS:
            continue
        for person_id in _guardians_of(session, student.id):
            queued = _notify(
                person_id,
                "health.declaration_missing",
                "נדרשת הצהרת בריאות",
                "כדי להמשיך, מלאו את הצהרת הבריאות של הילד",
                # Ids only. A payload is what the tap opens, and §18.3 puts payloads in the
                # "never logged" column -- but a name in one is a name in an aggregator either way.
                {"student_id": str(student.id), "day": elapsed},
            )
            if queued:
                tally.reminders += 1
            else:
                tally.undeliverable += 1
        # The ledger entry is written whether or not the push could go: a reminder the system
        # decided to send is a thing that happened, and `last_reminder_sent_at` on dashboard 4e
        # reads exactly this. See HealthDeclarationService for why there is no column.
        HealthDeclarationService.record_reminder(
            session,
            student.id,
            actor_person_id=None,
            actor_identity_id=None,
            actor_ip=None,
            at=at,
        )


def chase_renewals(session: TenantSession, studio: Studio, *, at: datetime, tally: Tally) -> None:
    """Renewal reminders, **only when the studio set a validity**.

    §5.5: `health_declaration_validity_months` "defaults to null (never expires), and when set
    turns on renewal reminders and expiry". This is that switch, and it is the whole of it —
    `valid_until` stays `NULL` on every row regardless, so nothing here writes to a declaration.
    A studio that later clears the setting simply stops getting these.
    """
    months = (studio.settings or {}).get(VALIDITY_SETTING)
    if not isinstance(months, int) or months <= 0:
        return

    # Whole months, approximated in days. A renewal reminder is not an appointment; being a day
    # out on a chase-up is invisible, and date arithmetic that needs a calendar library for a
    # nudge is a dependency bought for nothing.
    horizon = at.date() - timedelta(days=months * 30 - RENEWAL_NOTICE_DAYS)
    rows = list(
        session.execute(
            select(HealthDeclaration, Student)
            .join(Student, Student.id == HealthDeclaration.student_id)
            .where(Student.status.in_(CHASEABLE_STATUSES))
        ).all()
    )
    for declaration, student in rows:
        if declaration.signed_at.date() != horizon:
            continue
        for person_id in _guardians_of(session, student.id):
            if _notify(
                person_id,
                "health.declaration_renewal",
                "חידוש הצהרת בריאות",
                "הצהרת הבריאות של הילד מתקרבת למועד החידוש שהמועדון קבע",
                {"student_id": str(student.id), "validity_months": months},
            ):
                tally.renewals += 1
            else:
                tally.undeliverable += 1


def run_for_studio(session: TenantSession, studio: Studio, *, at: datetime, tally: Tally) -> None:
    chase_missing(session, at=at, tally=tally)
    chase_renewals(session, studio, at=at, tally=tally)


def main() -> int:
    configure_logging()
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
            run_for_studio(scoped, studio, at=at, tally=tally)
            scoped.commit()

    logger.info(
        "health reminders complete",
        # Counts only, `extra=` and never an f-string. §5.5's ladder is about children, and a log
        # line naming one would be a name in an aggregator the scrubber cannot un-see (G7).
        extra={
            "studios": len(tally.studios),
            "reminders": tally.reminders,
            "renewals": tally.renewals,
            "undeliverable": tally.undeliverable,
        },
    )
    if tally.undeliverable:
        # Not a failure: lane COMMS has not landed, and the ledger entries above still happened.
        # WARNING so it is visible rather than inferred from a gap.
        logger.warning(
            "some health reminders could not be queued",
            extra={"undeliverable": tally.undeliverable},
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
