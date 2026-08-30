"""§5.4b -- the member onboarding link (docs/onboarding-link-spec.md), the service half.

The invariant exception, restated where the code lives: §5.4 makes enrollment a manager
decision, and THIS lane is the one deliberate, scoped exception -- for a family that
already trains at the club, the decision was made in the real world months ago and the
database is catching up. Nothing here may be reused for new families; the trial funnel
(§5.4a) keeps the invariant.

Pricing derives each child's weekly volume from the chosen groups' schedules and hands it
to `plan_for_volume` -- the ONE matching rule every self-service door shares -- then creates
the first prorated tuition charge immediately through `BillingRunService.charge_first_month`.
The run's idempotency key makes the next monthly run a no-op for this period.

**The rule used to demand an exact `sessions_per_week` match and that cost the club money
in silence.** Zero matching plans (or two) left the student unpriced, so a club selling
1× / 2× / open membership priced a child ticking three groups' worth of training at nothing
-- recorded only in `billing_run.log`, which no router, worker or screen reads. See
`app/services/billing/catalogue.py`. Unpriced is still reachable, for a club with no live
plans at all, and `GET /billing/unpriced-students` is where a manager now sees it.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.onboarding import OnboardingLink
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.services.audit import AuditService
from app.services.billing.catalogue import plan_for_volume
from app.services.billing.run import BillingRunService, _Tally
from app.services.people.attendance_pattern import weekly_volume
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import DuplicateStudentError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader
from app.services.people.matching import duplicate_student

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
    def add_child(
        session: Session,
        *,
        studio_id: uuid.UUID,
        parent: Person,
        child: dict[str, Any],
        at: datetime,
        schedule: ScheduleReader,
        billing_run: BillingRunService | None = None,
        tally: _Tally | None = None,
    ) -> uuid.UUID:
        """One child: the person, the student, the guardian link, the enrollments, the
        price and the first charge. Returns the student id.

        **Both doors run this, and that is the point** (owner decision, 2026-08-30). A
        family used to meet two different policies a week apart: the join link created
        active, priced children with no manager, while `+ הוסף ילד` inside the app filed a
        `registration_request` a manager had to approve. The gate on the second door was
        guarding against something the first door — a link sent to the whole club by
        WhatsApp — already allowed freely, so it protected nothing and only meant a parent
        who forgot a child at signup had to wait on the office.

        **`is_invite_only` and `is_active` are enforced HERE, and were enforced nowhere.**
        The join form hides those groups (`LandingService.public_groups` filters them) but
        this path validated only that a group had training days — so the Girls Team, the
        group that exists precisely so the product never has to store gender about a minor,
        was protected by its id not being published rather than by a check. Obscurity is
        not enforcement, and now that a second caller reaches this code the gap would have
        been reachable from a screen rather than only from a crafted request.

        Not-found, never forbidden: a 403 would confirm the group exists, which is the one
        fact the invite-only flag is keeping.
        """
        group_ids: list[uuid.UUID] = list(dict.fromkeys(child.get("group_ids") or []))
        if not group_ids:
            raise RefusedError("every child needs at least one group")
        today = at.date()

        # **Before anything is created**, so a refusal leaves no half-family behind.
        # §5.4a's duplicate check used to run only on the registration-request detail view,
        # whose sole producer was removed the day this door started enrolling directly --
        # since when a parent adding a child the club already had got a SECOND student for
        # them, one `trial` and one `active`, both on the roster and neither visibly wrong.
        existing = duplicate_student(
            session,
            first_name=child["first_name"] if not child.get("self") else parent.first_name,
            last_name=child["last_name"] if not child.get("self") else parent.last_name,
            birthdate=child.get("birthdate") if not child.get("self") else parent.birthdate,
        )
        if existing is not None:
            raise DuplicateStudentError(
                "this child is already on the roster",
                student_id=existing.student_id,
                display_name=existing.display_name,
            )

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
            # One rule on every self-service door, and it lives in `EnrollmentService` so
            # the trial-to-member join reaches the same check rather than restating it.
            weekdays = EnrollmentService.self_service_weekdays(
                session, group_id=group_id, since=today, schedule=schedule
            )
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

        # §5.10's suggestion becomes the assignment -- there is no manager in this lane --
        # through the one rule every self-service door shares. See `plan_for_volume`.
        plan = plan_for_volume(session, studio_id=studio_id, volume=weekly_volume(volume_pairs))
        if plan is not None:
            student.price_plan_id = plan.id
            session.flush()
            run = billing_run if billing_run is not None else BillingRunService(session)
            run.charge_first_month(studio_id, student.id, plan.id, on=today, tally=tally)
        return student.id

    @staticmethod
    def notify_managers_of_new_child(
        session: Session, *, parent: Person, student_id: uuid.UUID
    ) -> None:
        """Tell the office a child arrived, since nobody has to approve one any more.

        **The signal the approval queue used to carry.** Letting a parent enrol their own
        child removes the manager from the path, and with it the only moment they learned a
        new name had appeared. A notification keeps the knowing without keeping the waiting.

        Names only. §11 keeps health and money out of a notification body, and neither
        belongs in "a child joined" anyway.
        """
        from typing import cast

        from app.core.tenancy import TenantSession
        from app.models.person import RoleAssignment
        from app.services.comms import NotificationService

        student = session.get(Student, student_id)
        child = session.get(Person, student.person_id) if student else None
        child_name = f"{child.first_name} {child.last_name}" if child else ""
        parent_name = f"{parent.first_name} {parent.last_name}"
        manager_ids = set(
            session.execute(
                select(RoleAssignment.person_id).where(
                    RoleAssignment.role.in_(("owner", "manager")),
                    RoleAssignment.scope_type == "studio",
                    RoleAssignment.revoked_at.is_(None),
                )
            ).scalars()
        ) - {parent.id}
        notifier = NotificationService(cast(TenantSession, session))
        for person_id in sorted(manager_ids, key=str):
            notifier.enqueue(
                person_id=person_id,
                kind="people.child_added",
                title="נרשם חניך חדש",
                body=f"{child_name} — נרשם על ידי {parent_name}",
                payload={"student_id": str(student_id), "parent_person_id": str(parent.id)},
            )

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

        The student ids are what THIS submission created. A child already on the account is
        skipped rather than duplicated, so a resubmission can legitimately return fewer ids
        than it was given children -- or none at all.
        """
        if not children:
            raise RefusedError("a registration needs at least one child")
        if len(children) > 8:
            raise RefusedError("too many children in one registration")

        # **Do not duplicate the parent; do add the missing children.**
        #
        # `existing_registration` answers "does this identity already have a Person here",
        # and this used to treat that as "this family is already registered" -- returning
        # `already_registered: true` and creating nothing. Those are different questions,
        # and the difference is exactly a trial family: booking a trial creates a Person for
        # the parent, so the club's most natural funnel (try it, like it, get sent the link)
        # silently did nothing. An existing Person is adopted; each child still runs through
        # `add_child`, whose duplicate check is what makes a resubmission a no-op.
        parent = (
            OnboardingService.existing_registration(
                session, studio_id=studio_id, identity_id=identity_id
            )
            if identity_id is not None
            else None
        )
        if parent is None:
            parent = Person(
                studio_id=studio_id,
                auth_identity_id=identity_id,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                email=email,
            )
            session.add(parent)
        else:
            # Fill the blanks and overwrite nothing. The club's existing record of this
            # parent is not a form field, and a trial booking that recorded a phone number
            # must not lose it to a form somebody left empty.
            parent.phone = parent.phone or phone
            parent.email = parent.email or email
        session.flush()

        billing_run = BillingRunService(session)
        tally = _Tally()
        student_ids: list[uuid.UUID] = []

        for child in children:
            try:
                student_ids.append(
                    OnboardingService.add_child(
                        session,
                        studio_id=studio_id,
                        parent=parent,
                        child=child,
                        at=at,
                        schedule=schedule,
                        billing_run=billing_run,
                        tally=tally,
                    )
                )
            except DuplicateStudentError:
                # A no-op, not a refusal, and only on THIS door. A parent resubmitting the
                # link with three children of whom two are already on the account must still
                # get the third; refusing the whole submission would make the rest of the
                # family unreachable through the club's own link. `+ הוסף ילד` submits one
                # child at a time and there the refusal is the useful answer -- it can offer
                # them the child they already have.
                continue

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
