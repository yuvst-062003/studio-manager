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
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
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


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class OnboardingService:
    # -- the link ---------------------------------------------------------------
    @staticmethod
    def current(session: Session, *, at: datetime) -> OnboardingLink | None:
        """The live link, or None. Expired and revoked rows are history, not state.

        A NULL `expires_at` is the permanent link (2026-08-31) and is live by definition;
        the dated rows written before that decision still age out on their own date.
        """
        return session.execute(
            select(OnboardingLink)
            .where(
                OnboardingLink.revoked_at.is_(None),
                or_(OnboardingLink.expires_at.is_(None), OnboardingLink.expires_at > at),
            )
            .order_by(OnboardingLink.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

    @staticmethod
    def token_of(row: OnboardingLink) -> str | None:
        """The link's own token, for the card's העתקה button.

        None for a row written before `token_encrypted` existed: that token was only ever
        hashed and is genuinely unrecoverable, so the card offers a regenerate instead.
        """
        return row.token_encrypted.decode() if row.token_encrypted else None

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
        """A new link, revoking the previous one.

        The token is stored twice over: its SHA-256 is the lookup key an arriving token is
        matched against, and the token itself is stored encrypted so the card can offer
        העתקה on every load rather than only in the seconds after creation. The keyring
        lives in Railway secrets, so a database read still yields no usable link.

        `expires_at` is NULL — one permanent link (2026-08-31). Revocation is what
        answers a leak, and it is one tap away.
        """
        live = OnboardingService.current(session, at=at)
        if live is not None:
            live.revoked_at = at
        token = secrets.token_urlsafe(32)
        row = OnboardingLink(
            studio_id=studio_id,
            token_hash=_hash(token),
            token_encrypted=token.encode(),
            expires_at=None,
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
        if (
            row is None
            or row.revoked_at is not None
            # NULL is the permanent link and never expires; a dated row from before that
            # decision still ages out on its own date.
            or (row.expires_at is not None and row.expires_at <= at)
        ):
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

        volume = weekly_volume(volume_pairs)
        plan: PricePlan | None
        requested_plan_id = child.get("price_plan_id")
        if requested_plan_id is not None:
            # Decision 14 -- the parent picked a plan; the picker only ever OFFERS a
            # covering one, but this is the actual authority (CLAUDE.md: "refuse rather
            # than accept, when accepting creates a dead end"). A stale or crafted
            # `price_plan_id` -- closed, another studio's, or too small for the groups
            # just chosen -- is refused rather than silently repriced or ignored.
            requested_plan = session.get(PricePlan, requested_plan_id)
            if (
                requested_plan is None
                or requested_plan.studio_id != studio_id
                or requested_plan.active_to is not None
                or (
                    requested_plan.sessions_per_week is not None
                    and requested_plan.sessions_per_week < volume
                )
            ):
                raise RefusedError(
                    f"plan {requested_plan_id} does not cover {volume} weekly "
                    "session(s) for this child"
                )
            plan = requested_plan
        else:
            # §5.10's suggestion becomes the assignment -- there is no manager in this
            # lane -- through the one rule every self-service door shares. See
            # `plan_for_volume`.
            plan = plan_for_volume(session, studio_id=studio_id, volume=volume)
        if plan is not None:
            student.price_plan_id = plan.id
            session.flush()
            run = billing_run if billing_run is not None else BillingRunService(session)
            run.charge_first_month(studio_id, student.id, plan.id, on=today, tally=tally)
        return student.id

    @staticmethod
    def _sync_enrollments(
        session: Session,
        *,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        group_ids: list[uuid.UUID],
        at: datetime,
        schedule: ScheduleReader,
    ) -> None:
        """§8's open item 3: a resubmission's edited group list must be applied, not
        dropped. `add_child` never runs a second time for a child `duplicate_student`
        already matched -- it raises before creating anything -- so a parent who went
        back from the done screen and added a second group to a child already on the
        roster had that edit silently discarded; only the household details
        (`_apply_family_details`) were written for them.

        Adds any group in THIS submission the student is not already actively enrolled
        in, and recomputes the plan from the resulting volume -- the same rule
        `add_child` uses for a fresh child. Never REMOVES an enrollment: dropping a
        group the family already has is a manager's decision, not a side effect of
        resubmitting the join link with an ADDED one. Raises no new charge -- the first
        month for this student was already billed (or correctly left unpriced) by
        whichever submission created it; correcting that amount for a plan that changed
        mid-onboarding is a billing-lane concern, not this one.
        """
        today = at.date()
        existing_group_ids = set(
            session.execute(
                select(Enrollment.group_id).where(
                    Enrollment.student_id == student_id, Enrollment.status == "active"
                )
            ).scalars()
        )
        new_group_ids = [g for g in dict.fromkeys(group_ids) if g not in existing_group_ids]
        if not new_group_ids:
            return
        for group_id in new_group_ids:
            # `self_service_weekdays` is both the validation (a group this door may not
            # enrol into raises `NotFoundError`, same as `add_child`) and the volume
            # input the plan recompute below needs -- one call serves both.
            EnrollmentService.self_service_weekdays(
                session, group_id=group_id, since=today, schedule=schedule
            )
            session.add(
                Enrollment(
                    studio_id=studio_id,
                    student_id=student_id,
                    group_id=group_id,
                    status="active",
                    started_on=today,
                    attends_weekdays=None,
                )
            )
            existing_group_ids.add(group_id)
        session.flush()

        volume_pairs = [
            (
                None,
                EnrollmentService.self_service_weekdays(
                    session, group_id=group_id, since=today, schedule=schedule
                ),
            )
            for group_id in existing_group_ids
        ]
        plan = plan_for_volume(session, studio_id=studio_id, volume=weekly_volume(volume_pairs))
        if plan is not None:
            student = session.get(Student, student_id)
            if student is not None:
                student.price_plan_id = plan.id
                session.flush()

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
        signer: dict[str, Any] | None = None,
        other_parent: dict[str, Any] | None = None,
        pickup_contacts: list[dict[str, Any]] | None = None,
        at: datetime,
        schedule: ScheduleReader,
        actor_identity_id: uuid.UUID | None = None,
        club_terms_accepted: bool = False,
        signed_ip: str | None = None,
        signed_user_agent: str | None = None,
    ) -> tuple[Person, list[uuid.UUID], int]:
        """One transaction: the parent, the children, the enrollments, the price, the
        first charge, every health declaration and the club-terms acceptance. Returns
        (parent person, student ids, charges created).

        `children` rows: {first_name, last_name, birthdate?, group_ids: [uuid], self: bool,
        health?: {template_id, answers, signature_image_base64}, other_parent?, pickup_contacts?,
        price_plan_id?}. A `self` child is §5.3's adult member -- the parent Person doubles as
        the student's person, one human in both roles. `health`, when present, is submitted
        through the same `HealthDeclarationService.submit` the standalone
        `POST /students/{id}/health-declaration` uses -- decision 2: 'the single call
        carries ... every health declaration,' not a second request the wizard fires once
        this one has returned a student id to submit it against. `other_parent`/
        `pickup_contacts`, when present, override the top-level params of the same name for
        THIS child only (F7); `price_plan_id`, when present, must cover this child's chosen
        groups' weekly volume or `add_child` refuses (decision 14).

        The student ids are what THIS submission created. A child already on the account is
        skipped rather than duplicated, so a resubmission can legitimately return fewer ids
        than it was given children -- or none at all. Its GROUPS are still applied though
        (`_sync_enrollments`, §8 open item 3): a parent who went back and added a group must
        not have that edit silently dropped just because the child already existed.
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
        # Every child this submission touches, freshly created or already on the roster.
        # `_apply_family_details` writes the household facts (address, pickup, ...) from
        # THIS submission onto whichever row the student actually is -- a resubmission of
        # an all-duplicate family is still a family telling the club its address, and
        # skipping that write is what left `registration_complete` false forever (§6.8).
        applied_pairs: list[tuple[dict[str, Any], uuid.UUID]] = []

        # Local imports, same reason `_apply_family_details` below gives: avoiding a
        # module-level cycle between the health vertical and this one.
        from typing import cast

        from app.core.tenancy import TenantSession
        from app.services.health.agreement import AgreementService
        from app.services.health.club_terms import CLUB_TERMS_VERSION
        from app.services.health.declarations import HealthDeclarationService

        tenant_session = cast(TenantSession, session)

        for child in children:
            try:
                student_id = OnboardingService.add_child(
                    session,
                    studio_id=studio_id,
                    parent=parent,
                    child=child,
                    at=at,
                    schedule=schedule,
                    billing_run=billing_run,
                    tally=tally,
                )
            except DuplicateStudentError as exc:
                # A no-op, not a refusal, and only on THIS door. A parent resubmitting the
                # link with three children of whom two are already on the account must still
                # get the third; refusing the whole submission would make the rest of the
                # family unreachable through the club's own link. `+ הוסף ילד` submits one
                # child at a time and there the refusal is the useful answer -- it can offer
                # them the child they already have.
                #
                # The existing student still belongs in `applied_pairs`: this submission is
                # exactly where the parent typed the address, the other parent and the
                # pickup list, and that student is not on file for them until it is written.
                student_id = exc.student_id
                applied_pairs.append((child, student_id))
                # §8 open item 3 -- the groups (and so the plan) THIS submission asked for,
                # applied even though the child itself is not new.
                OnboardingService._sync_enrollments(
                    session,
                    studio_id=studio_id,
                    student_id=student_id,
                    group_ids=list(child.get("group_ids") or []),
                    at=at,
                    schedule=schedule,
                )
            else:
                student_ids.append(student_id)
                applied_pairs.append((child, student_id))

            health = child.get("health")
            if health is not None:
                HealthDeclarationService.submit(
                    tenant_session,
                    student_id,
                    template_id=health["template_id"],
                    answers=health["answers"],
                    signature_image_base64=health["signature_image_base64"],
                    signed_by_person_id=parent.id,
                    signed_ip=signed_ip,
                    signed_user_agent=signed_user_agent,
                    at=at,
                    actor_identity_id=actor_identity_id,
                )

        if signer is not None and applied_pairs:
            OnboardingService._apply_family_details(
                session,
                parent=parent,
                created_pairs=applied_pairs,
                signer=signer,
                other_parent=other_parent,
                pickup_contacts=pickup_contacts or [],
                at=at,
                actor_person_id=parent.id,
                actor_identity_id=actor_identity_id,
            )

        if club_terms_accepted and applied_pairs:
            AgreementService.accept_club_terms(
                tenant_session,
                studio_id=studio_id,
                person_id=parent.id,
                version=CLUB_TERMS_VERSION,
                at=at,
                ip=signed_ip,
                actor_identity_id=actor_identity_id,
            )

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

    @staticmethod
    def _apply_family_details(
        session: Session,
        *,
        parent: Person,
        created_pairs: list[tuple[dict[str, Any], uuid.UUID]],
        signer: dict[str, Any],
        other_parent: dict[str, Any] | None,
        pickup_contacts: list[dict[str, Any]],
        at: datetime,
        actor_person_id: uuid.UUID,
        actor_identity_id: uuid.UUID | None,
    ) -> None:
        """Write the household facts collected on step 3 onto the rows they belong to.

        **F7 -- second parent and pickup are read PER CHILD, not once for the whole
        batch.** `child.get("other_parent")`/`child.get("pickup_contacts")` are what a
        per-student panel collected (a "same as previous" tick on the client is just a
        copy at typing time; the server never links two children's records together
        because of it). A child with no per-child value of its own falls back to these
        params -- kept for any caller still submitting the old family-wide shape. This is
        what lets two siblings in one submission carry genuinely different answers,
        where the old `has_minor_children` gate applied the SAME pair to every non-self
        child in the batch, self-training adults included whenever any other child in
        the same submission happened to be a minor.
        """
        from typing import cast

        from app.core.tenancy import TenantSession
        from app.services.health.agreement import AgreementService, is_self_guarding

        tenant_session = cast(TenantSession, session)

        for child, student_id in created_pairs:
            student = session.get(Student, student_id)
            if student is None:
                continue
            guardian = session.execute(
                select(Guardian).where(
                    Guardian.student_id == student.id,
                    Guardian.person_id == parent.id,
                )
            ).scalar_one_or_none()
            if guardian is None:
                # A freshly created child always has this row (add_child creates it in
                # the same transaction). A duplicate match with no guardian link here
                # is a same-name collision with a stranger's kid, not this family
                # resubmitting -- leave it untouched, same as today's existing safe
                # behavior for a child that never made it into created_pairs at all.
                continue
            is_self = child.get("self") or is_self_guarding(tenant_session, student)
            child_payload = {
                "national_id": signer["national_id"] if is_self else child.get("national_id"),
                "address": signer["address"],
                "city": signer["city"],
                "grade": "" if is_self else str(child.get("grade") or ""),
                "phone_home": signer.get("phone_home"),
                "phone": parent.phone,
                "email": parent.email,
            }
            signer_payload = {
                "national_id": signer["national_id"],
                "aliyah_year": signer.get("aliyah_year"),
            }
            # Per-child, falling back to the family-wide params -- see this method's
            # docstring. A self-guarding child never gets either: nobody else's name
            # belongs on an adult's own registration just because a sibling in the same
            # submission is a minor.
            child_other_parent = None if is_self else (child.get("other_parent") or other_parent)
            child_pickup_contacts = (
                [] if is_self else (child.get("pickup_contacts") or pickup_contacts)
            )
            AgreementService.save_registration(
                tenant_session,
                student,
                child=child_payload,
                signer=signer_payload,
                other_parent=child_other_parent,
                pickup_contacts=child_pickup_contacts,
                subject_person_id=parent.id,
                actor_person_id=actor_person_id,
                at=at,
                actor_identity_id=actor_identity_id,
            )
            guardian.relation = "self" if is_self else str(signer.get("relation") or "parent")
        session.flush()
