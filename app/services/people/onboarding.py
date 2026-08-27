"""§5.4b -- the member onboarding link (docs/onboarding-link-spec.md), the service half.

The invariant exception, restated where the code lives: §5.4 makes enrollment a manager
decision, and THIS lane is the one deliberate, scoped exception -- for a family that
already trains at the club, the decision was made in the real world months ago and the
database is catching up. Nothing here may be reused for new families; the trial funnel
(§5.4a) keeps the invariant.

Pricing follows the spec to the letter: derive each child's weekly volume from the chosen
groups' schedules, assign the ONE live plan whose sessions_per_week matches, and create
the first prorated tuition charge immediately through `BillingRunService`'s own
first-month machinery -- the run's idempotency key makes the next monthly run a no-op for
this period. No matching plan (or two of them) means no charge and no guess: the student
stays unpriced and lands on the manager's checklist.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
from app.models.onboarding import OnboardingLink
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.services.audit import AuditService
from app.services.billing.run import BillingRunService, _Tally, period_end
from app.services.people.attendance_pattern import weekly_volume
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader, training_weekdays

LINK_TTL_DAYS = 7


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class OnboardingService:
    # -- the link ---------------------------------------------------------------
    @staticmethod
    def current(session: Session, *, at: datetime) -> OnboardingLink | None:
        """The live link, or None. Expired and revoked rows are history, not state."""
        return session.execute(
            select(OnboardingLink)
            .where(OnboardingLink.revoked_at.is_(None), OnboardingLink.expires_at > at)
            .order_by(OnboardingLink.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    @staticmethod
    def registered_count(session: Session) -> int:
        """The card's counter -- families the blast actually moved."""
        return int(
            session.execute(
                select(func.count(Student.id)).where(Student.source == "onboarding_link")
            ).scalar_one()
        )

    @staticmethod
    def regenerate(
        session: Session, studio_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> tuple[OnboardingLink, str]:
        """A new link, revoking the previous one. The token is returned ONCE and never
        stored -- only its SHA-256 lands in the row."""
        live = OnboardingService.current(session, at=at)
        if live is not None:
            live.revoked_at = at
        token = secrets.token_urlsafe(32)
        row = OnboardingLink(
            studio_id=studio_id,
            token_hash=_hash(token),
            expires_at=at + timedelta(days=LINK_TTL_DAYS),
            created_by_person_id=actor_person_id,
        )
        session.add(row)
        AuditService.record(
            session,
            action="onboarding_link.regenerate",
            entity_type="onboarding_link",
            entity_id=row.id if row.id else uuid.uuid4(),
            studio_id=studio_id,
            actor_person_id=actor_person_id,
        )
        session.flush()
        return row, token

    @staticmethod
    def revoke(
        session: Session, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> OnboardingLink | None:
        live = OnboardingService.current(session, at=at)
        if live is None:
            return None
        live.revoked_at = at
        AuditService.record(
            session,
            action="onboarding_link.revoke",
            entity_type="onboarding_link",
            entity_id=live.id,
            studio_id=live.studio_id,
            actor_person_id=actor_person_id,
        )
        session.flush()
        return live

    @staticmethod
    def resolve(session: Session, *, token: str, at: datetime) -> OnboardingLink:
        """Token → link, on an UNSCOPED session (the caller has no studio yet -- the token
        IS the studio context). Invalid, expired and revoked all raise the same error: no
        oracle distinguishing 'never existed' from 'revoked'."""
        row = session.execute(
            select(OnboardingLink).where(OnboardingLink.token_hash == _hash(token))
        ).scalar_one_or_none()
        if row is None or row.revoked_at is not None or row.expires_at <= at:
            raise NotFoundError("the link is not valid")
        return row

    # -- the registration -------------------------------------------------------
    @staticmethod
    def existing_registration(
        session: Session, *, studio_id: uuid.UUID, identity_id: uuid.UUID
    ) -> Person | None:
        """One registration per auth identity per studio: a resubmission returns the
        existing result instead of duplicating the family."""
        return session.execute(
            select(Person).where(
                Person.studio_id == studio_id, Person.auth_identity_id == identity_id
            )
        ).scalar_one_or_none()

    @staticmethod
    def register(
        session: Session,
        *,
        studio_id: uuid.UUID,
        identity_id: uuid.UUID,
        first_name: str,
        last_name: str,
        phone: str | None,
        email: str | None,
        children: list[dict[str, Any]],
        at: datetime,
        schedule: ScheduleReader,
    ) -> tuple[Person, list[uuid.UUID], int]:
        """One transaction: the parent, the children, the enrollments, the price, the
        first charge. Returns (parent person, student ids, charges created).

        `children` rows: {first_name, last_name, birthdate?, group_ids: [uuid], self: bool}.
        A `self` child is §5.3's adult member -- the parent Person doubles as the student's
        person, one human in both roles.
        """
        if not children:
            raise RefusedError("a registration needs at least one child")
        if len(children) > 8:
            raise RefusedError("too many children in one registration")

        parent = Person(
            studio_id=studio_id,
            auth_identity_id=identity_id,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            email=email,
        )
        session.add(parent)
        session.flush()

        billing_run = BillingRunService(session)
        today = at.date()
        month_start = today.replace(day=1)
        due = period_end(today.year, today.month)
        tally = _Tally()
        student_ids: list[uuid.UUID] = []

        for child in children:
            group_ids: list[uuid.UUID] = list(dict.fromkeys(child.get("group_ids") or []))
            if not group_ids:
                raise RefusedError("every child needs at least one group")
            if child.get("self"):
                child_person = parent
            else:
                child_person = Person(
                    studio_id=studio_id,
                    first_name=child["first_name"],
                    last_name=child["last_name"],
                    birthdate=child.get("birthdate"),
                )
                session.add(child_person)
                session.flush()
            student = Student(
                studio_id=studio_id,
                person_id=child_person.id,
                status="active",
                source="onboarding_link",
                health_status="missing",
                joined_on=today,
            )
            session.add(student)
            session.flush()
            session.add(
                Guardian(
                    studio_id=studio_id,
                    person_id=parent.id,
                    student_id=student.id,
                    relation="self" if child.get("self") else "parent",
                    is_primary=True,
                )
            )

            volume_pairs = []
            for group_id in group_ids:
                weekdays = training_weekdays(group_id, since=today, schedule=schedule)
                if not weekdays:
                    raise NotFoundError(f"no group {group_id}")
                session.add(
                    Enrollment(
                        studio_id=studio_id,
                        student_id=student.id,
                        group_id=group_id,
                        status="active",
                        started_on=today,
                        attends_weekdays=None,
                    )
                )
                volume_pairs.append((None, weekdays))
            session.flush()

            # §5.10's suggestion becomes the assignment -- there is no manager in this
            # lane. Exactly one live plan may match; zero or two mean the student stays
            # unpriced, visibly, on the manager's checklist.
            volume = weekly_volume(volume_pairs)
            plans = (
                session.execute(
                    select(PricePlan).where(
                        PricePlan.studio_id == studio_id,
                        PricePlan.active_to.is_(None),
                        PricePlan.sessions_per_week == volume,
                    )
                )
                .scalars()
                .all()
            )
            if len(plans) == 1:
                student.price_plan_id = plans[0].id
                session.flush()
                billing_run._charge_one(  # noqa: SLF001 -- the run's own first-month path
                    studio_id, student.id, plans[0].id, month_start, due, tally
                )
            student_ids.append(student.id)

        AuditService.record(
            session,
            action="onboarding.register",
            entity_type="person",
            entity_id=parent.id,
            studio_id=studio_id,
            actor_person_id=parent.id,
            diff={"children": len(student_ids), "charged": tally.charged},
        )
        session.flush()
        return parent, student_ids, tally.charged
