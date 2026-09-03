"""SPEC §5.15 — the training-year rollover, "the single highest-leverage screen in the
product", run once a year over seven steps.

**What this module is, and what it deliberately is not.** Six of the seven steps already
had a mechanism before W6: `create_training_year`, `create_closure` + `presets_for_year`,
`close_price_plan`, `generate_sessions_for_year`, `AnnouncementService.publish` and
`activate_training_year` all shipped in W2/W4/W5. What did not exist was the thing that
makes a wizard a wizard: **bulk operations over the year's groups, students and prices, and
a resumable notion of where the manager got to.** That is all this file adds. It composes
existing services and writes nothing they do not already own.

── Where the resume state lives, and why it is not a table ─────────────────────────────
§5.15: "The wizard is resumable; a `training_year` in `draft` status holds partial progress
and nothing is visible to guardians until it is activated."

So the *year* is the durable handle and `draft` is the resume token. Two of the seven steps
can be answered from data alone -- step 1 is done once the draft year exists, step 6 once
the year has sessions. **The other five cannot**, and the reason is the same in each case:
their correct outcome is frequently *no change at all*. A studio that closes for nothing but
the summer break ticks no holidays; a studio whose groups all carry forward unchanged edits
no group; a year with no price rise closes no plan. "Zero rows written" and "not started"
are indistinguishable from the data, and a wizard that cannot tell them apart either loops
the manager back to step 3 for ever or marks it done before they have looked.

Those five therefore carry an explicit acknowledgement, stored in the studio's JSONB
`settings` column under a `rollover` key, per training year. **This is the same escape
`app/routers/billing.py` used for billing settings, and for the same reason**: `main` lands
one migration per wave in the wave's contract commit, and a lane -- or a sequential wave
whose migration budget is already spent -- does not get to add a table for UI progress. The
data is small, studio-scoped, read by exactly one screen and never joined against.

The acknowledgement records that a human LOOKED. It never records what they decided; that
lives in the rows the step wrote, where it can be audited.

── Two rules the bulk operations inherit rather than invent ────────────────────────────
* **No automatic age-based promotion in v1** (§5.15 step 4, in as many words). Every student
  move in `apply_students` is named explicitly by the caller. There is no rule in this file
  that reads a birth date, and there must not be one -- a child moved up a group without a
  human saying so is a conversation with a parent that nobody in the office knows happened.
* **Old plans are closed, not overwritten** (§5.15 step 5). `apply_prices` delegates to
  `CatalogueService.close_price_plan`, which sets `active_to` and opens a successor from the
  next day. Editing `monthly_amount_agorot` in place would silently restate what every
  family was charged last year, including on statements they have already read.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
from app.models.people import Enrollment, Student
from app.models.schedule import Session as TrainingSession
from app.models.schedule import StudioClosure, TrainingYear
from app.models.structure import Group
from app.models.studio import Studio
from app.services.audit import AuditService
from app.services.billing.catalogue import CatalogueService
from app.services.billing.errors import ConflictError as BillingConflictError
from app.services.billing.errors import NotFoundError as BillingNotFoundError
from app.services.billing.errors import RefusedError as BillingRefusedError
from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

#: §5.15's seven steps, in the order the manager walks them. The order is data because the
#: rail renders it and the resume rule ("first pending step") reads it; a hard-coded order in
#: the client and another here is how the two drift.
ROLLOVER_STEP_ORDER: tuple[str, ...] = (
    "year",
    "closures",
    "groups",
    "students",
    "prices",
    "generate",
    "announce",
)

#: The steps whose completion is OBSERVABLE from the data, and the query that observes it.
#: Everything else needs the manager to say they looked -- see the module docstring.
_DERIVED_STEPS = frozenset({"year", "generate"})

#: Where the acknowledgements live inside `studio.settings`.
SETTINGS_KEY = "rollover"

StepStatus = Literal["pending", "done", "skipped"]


@dataclass(frozen=True)
class RolloverStep:
    """One row of the wizard rail."""

    id: str
    status: StepStatus
    #: Set for the derived steps, so the screen can say *why* a step reads done -- "18
    #: closures", "412 sessions" -- rather than only that it does.
    detail: int | None = None


@dataclass(frozen=True)
class RolloverState:
    """Everything the wizard needs to render itself and decide where to resume."""

    training_year: TrainingYear
    steps: tuple[RolloverStep, ...]
    #: Counts the rail renders beside each step. Kept as one bag rather than fields on
    #: `RolloverStep` because two of them belong to steps whose status is an ack, and a
    #: `detail` on an acked step would read as evidence for a claim it is not evidence for.
    closures: int = 0
    groups_active: int = 0
    students_enrolled: int = 0
    price_plans_open: int = 0
    sessions_generated: int = 0

    @property
    def complete(self) -> bool:
        """Every step answered. `skipped` counts -- §5.15 makes step 7 optional in as many
        words, and a wizard that will not finish because the manager declined to announce is
        a wizard that trains people to announce things they did not want to send."""
        return all(step.status != "pending" for step in self.steps)

    @property
    def resume_at(self) -> str:
        """The first unanswered step, or the last one when there are none.

        Never step 1: a manager who closed the tab after pricing comes back to pricing, not
        to retyping the year's name.
        """
        for step in self.steps:
            if step.status == "pending":
                return step.id
        return self.steps[-1].id


@dataclass
class BulkOutcome:
    """What a bulk step actually did, for the summary line §5.15 step 6 asks for by name.

    Refusals are carried rather than raised. A rollover touches hundreds of rows in one
    press, and aborting the batch on row 200 leaves the manager with 199 applied changes,
    no list of them, and a screen that has to be re-driven from an unknown state. Every
    refusal names its row so the screen can show what was skipped and why.
    """

    applied: int = 0
    refused: list[dict[str, str]] = field(default_factory=list)

    def refuse(self, entity_id: uuid.UUID, reason: str) -> None:
        self.refused.append({"id": str(entity_id), "reason": reason})


class RolloverService:
    """§5.15's orchestrator. Session on the constructor, like every service in this package.

    It holds no studio filter of its own: it is exactly as scoped as the `TenantSession` it
    is handed, which is what makes every query below a single-tenant query without a
    `studio_id` predicate in sight.
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._schedule = ScheduleService(session)

    # -- state ----------------------------------------------------------------
    def state(self, training_year_id: uuid.UUID) -> RolloverState:
        """Where the manager got to, assembled from data plus acknowledgements."""
        year = self._schedule.get_training_year(training_year_id)
        # The studio comes from the YEAR, not from a bare `SELECT settings FROM studio`.
        # `studio` is the tenant rather than a tenant-scoped table -- it carries `id`, not
        # `studio_id` -- so `TenantSession` has no predicate to add to it and an unqualified
        # read would happily return whichever studio the planner reached first. That is a
        # cross-tenant read dressed as a convenience, and it was one: the first draft of this
        # method returned the demo studio's wizard progress to every caller.
        acks = self._acks(training_year_id, year.studio_id)

        closures = self._count(
            select(func.count())
            .select_from(StudioClosure)
            .where(StudioClosure.training_year_id == training_year_id)
        )
        sessions = self._count(
            select(func.count())
            .select_from(TrainingSession)
            .where(TrainingSession.training_year_id == training_year_id)
        )
        groups_active = self._count(
            select(func.count()).select_from(Group).where(Group.is_active.is_(True))
        )
        students = self._count(
            select(func.count(func.distinct(Enrollment.student_id))).where(
                Enrollment.ended_on.is_(None)
            )
        )
        plans_open = self._count(
            select(func.count()).select_from(PricePlan).where(PricePlan.active_to.is_(None))
        )

        steps: list[RolloverStep] = []
        for step_id in ROLLOVER_STEP_ORDER:
            if step_id == "year":
                # The year exists or `get_training_year` would have raised, so step 1 is
                # answered by the fact that we are here at all.
                steps.append(RolloverStep(step_id, "done"))
            elif step_id == "generate":
                # Observable, and it must be: a manager who acknowledged step 6 without
                # generating would activate a year with an empty calendar, and every parent
                # would open the app to nothing.
                steps.append(
                    RolloverStep(step_id, "done" if sessions else "pending", detail=sessions)
                )
            else:
                steps.append(RolloverStep(step_id, acks.get(step_id, "pending")))

        return RolloverState(
            training_year=year,
            steps=tuple(steps),
            closures=closures,
            groups_active=groups_active,
            students_enrolled=students,
            price_plans_open=plans_open,
            sessions_generated=sessions,
        )

    def set_step(
        self,
        training_year_id: uuid.UUID,
        *,
        step_id: str,
        status: StepStatus,
        studio_id: uuid.UUID,
    ) -> RolloverState:
        """Record that a human answered one step.

        Refuses the two derived steps rather than storing an ack nothing reads. A silent
        no-op here would let a client believe it had marked step 6 done while `state()`
        went on computing it from the session count -- the screen and the server would then
        disagree about whether the year is ready to activate.
        """
        if step_id not in ROLLOVER_STEP_ORDER:
            raise NotFoundError(f"no rollover step {step_id!r}")
        if step_id in _DERIVED_STEPS:
            raise ConflictError(
                f"step {step_id!r} is derived from the data and cannot be marked by hand"
            )
        self._schedule.get_training_year(training_year_id)

        studio = self._session.get(Studio, studio_id)
        if studio is None:
            raise NotFoundError(f"no studio {studio_id}")
        settings = dict(studio.settings or {})
        rollover = dict(settings.get(SETTINGS_KEY) or {})
        per_year = dict(rollover.get(str(training_year_id)) or {})
        per_year[step_id] = status
        rollover[str(training_year_id)] = per_year
        settings[SETTINGS_KEY] = rollover
        # Reassigned, never mutated in place: JSONB is not tracked for in-place mutation, so
        # `settings["rollover"][...] = ...` is a change SQLAlchemy would never flush. The
        # billing settings patch carries the same note for the same trap.
        studio.settings = settings
        self._session.flush()
        return self.state(training_year_id)

    # -- step 3: groups -------------------------------------------------------
    def apply_groups(
        self,
        training_year_id: uuid.UUID,
        *,
        renames: Sequence[tuple[uuid.UUID, str]] = (),
        retire: Sequence[uuid.UUID] = (),
        revive: Sequence[uuid.UUID] = (),
        creates: Sequence[dict[str, Any]] = (),
        at: datetime,
        actor_person_id: uuid.UUID | None,
        studio_id: uuid.UUID,
    ) -> BulkOutcome:
        """§5.15 step 3 — "carry each group forward as-is, rename, retire, or create".

        **Carrying forward is the absent verb, and that is correct.** `group` has no
        `training_year_id`; the year reaches a group only through the sessions generated for
        it. So a group carried forward unchanged needs no write, and the only operations
        that exist here are the three that do: rename, retire (`is_active = False`), and
        create. `revive` is the undo for a retire pressed in error, in the same batch.

        Retiring does NOT cancel the retired group's existing sessions. Step 6 skips
        inactive groups when it generates the new year, which is the whole effect a manager
        means by "we are not running this group next year"; reaching back into a year that
        already happened would rewrite history to record a decision made after it.
        """
        self._schedule.get_training_year(training_year_id)
        outcome = BulkOutcome()

        for group_id, name in renames:
            group = self._session.get(Group, group_id)
            if group is None:
                outcome.refuse(group_id, "not_found")
                continue
            cleaned = name.strip()
            if not cleaned:
                outcome.refuse(group_id, "empty_name")
                continue
            if cleaned == group.name:
                continue
            before = group.name
            group.name = cleaned
            AuditService.record(
                self._session,
                action="group.renamed",
                entity_type="group",
                entity_id=group.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={"name": [before, cleaned], "training_year_id": str(training_year_id)},
            )
            outcome.applied += 1

        for group_id, active in [(g, False) for g in retire] + [(g, True) for g in revive]:
            group = self._session.get(Group, group_id)
            if group is None:
                outcome.refuse(group_id, "not_found")
                continue
            if group.is_active is active:
                continue
            group.is_active = active
            AuditService.record(
                self._session,
                action="group.retired" if not active else "group.revived",
                entity_type="group",
                entity_id=group.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={"is_active": [not active, active]},
            )
            outcome.applied += 1

        for spec in creates:
            group = Group(
                studio_id=studio_id,
                class_id=spec["class_id"],
                name=str(spec["name"]).strip(),
                description=spec.get("description"),
                age_min=spec.get("age_min"),
                age_max=spec.get("age_max"),
                is_active=True,
            )
            self._session.add(group)
            self._session.flush()
            AuditService.record(
                self._session,
                action="group.created",
                entity_type="group",
                entity_id=group.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={"name": group.name, "training_year_id": str(training_year_id)},
            )
            outcome.applied += 1

        return outcome

    # -- step 4: students -----------------------------------------------------
    def apply_students(
        self,
        training_year_id: uuid.UUID,
        *,
        moves: Sequence[tuple[uuid.UUID, uuid.UUID]] = (),
        not_returning: Sequence[uuid.UUID] = (),
        at: datetime,
        actor_person_id: uuid.UUID | None,
        studio_id: uuid.UUID,
    ) -> BulkOutcome:
        """§5.15 step 4 — "confirm who continues, who moves to another group, and who is not
        returning. Bulk actions, **no automatic age-based promotion in v1**".

        `moves` is `(enrollment_id, destination_group_id)`. `not_returning` is a list of
        enrollment ids. **"Confirms" take no argument and write nothing** -- an enrollment
        left alone continues, which is what confirming it means; asking the database to
        restate that would produce a year of audit rows recording that nothing happened.

        A move is an end plus a start, never an `UPDATE enrollment SET group_id`. §4.3's
        `uq_enrollment_live` is per `(student_id, group_id)` where `ended_on IS NULL`, and
        rewriting the group in place would erase the fact that the child trained in the old
        one -- which is the record attendance, belts and last year's charges all hang from.
        """
        year = self._schedule.get_training_year(training_year_id)
        outcome = BulkOutcome()
        # The new year's start is the boundary for both verbs. Ending on the day before it
        # and starting on it leaves no gap and no overlap, so a report asking "which group
        # was this child in on date D" has exactly one answer for every D.
        starts_on = year.starts_on
        ends_on = date.fromordinal(starts_on.toordinal() - 1)

        for enrollment_id in not_returning:
            enrollment = self._session.get(Enrollment, enrollment_id)
            if enrollment is None:
                outcome.refuse(enrollment_id, "not_found")
                continue
            if enrollment.ended_on is not None:
                continue
            enrollment.ended_on = ends_on
            enrollment.status = "ended"
            AuditService.record(
                self._session,
                action="enrollment.ended",
                entity_type="enrollment",
                entity_id=enrollment.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={"ended_on": str(ends_on), "reason": "rollover_not_returning"},
            )
            outcome.applied += 1

        for enrollment_id, destination_group_id in moves:
            enrollment = self._session.get(Enrollment, enrollment_id)
            if enrollment is None:
                outcome.refuse(enrollment_id, "not_found")
                continue
            if enrollment.ended_on is not None:
                outcome.refuse(enrollment_id, "already_ended")
                continue
            if enrollment.group_id == destination_group_id:
                continue
            destination = self._session.get(Group, destination_group_id)
            if destination is None:
                outcome.refuse(enrollment_id, "destination_not_found")
                continue
            if not destination.is_active:
                # Retiring a group and moving children INTO it in the same batch is a
                # mis-click, not an intention, and the resulting enrollment would generate
                # no sessions at all next year.
                outcome.refuse(enrollment_id, "destination_retired")
                continue

            enrollment.ended_on = ends_on
            enrollment.status = "ended"
            moved = Enrollment(
                studio_id=studio_id,
                student_id=enrollment.student_id,
                group_id=destination_group_id,
                status="active",
                started_on=starts_on,
                # C12's per-day pattern does not survive a move: the destination group very
                # likely trains on different days, and carrying the old weekdays across would
                # silently enroll the child for days the new group does not meet. NULL means
                # "every session of the group", which is the safe and commonest answer.
                attends_weekdays=None,
            )
            self._session.add(moved)
            self._session.flush()
            AuditService.record(
                self._session,
                action="enrollment.moved",
                entity_type="enrollment",
                entity_id=moved.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={
                    "from_enrollment_id": str(enrollment.id),
                    "from_group_id": str(enrollment.group_id),
                    "to_group_id": str(destination_group_id),
                    "training_year_id": str(training_year_id),
                },
            )
            outcome.applied += 1

        return outcome

    # -- step 5: prices -------------------------------------------------------
    def apply_prices(
        self,
        training_year_id: uuid.UUID,
        *,
        repricings: Sequence[dict[str, Any]] = (),
        at: datetime,
        actor_person_id: uuid.UUID | None,
        studio_id: uuid.UUID,
    ) -> BulkOutcome:
        """§5.15 step 5 — "review each group's price plan and set new amounts, effective from
        the new year's start. **Old plans are closed, not overwritten.**"

        Each entry is `{plan_id, monthly_amount_agorot, registration_fee_agorot?}`. The work
        is `CatalogueService.close_price_plan`, which already implements exactly the
        close-and-succeed rule: it stamps `active_to` on the incumbent and opens a successor
        from the following day, inheriting name and `sessions_per_week`.

        **A correction to §5.15's wording, recorded rather than papered over.** The spec says
        "each *group's* price plan". There is no such thing: C11 settled that a plan prices
        training VOLUME (`sessions_per_week`) and attaches to the STUDENT, so a group has no
        plan to review. The step reviews the studio's plans, which is the same list a manager
        means and a smaller one. Nothing here reads `group`.

        The effective date is the new year's start, so `closes_on` is the day before it --
        `close_price_plan` opens the successor on `closes_on + 1`. A plan that already ended
        before then is skipped rather than refused: it is last year's plan, already closed,
        and the manager reviewing the list should not have to care.
        """
        year = self._schedule.get_training_year(training_year_id)
        closes_on = date.fromordinal(year.starts_on.toordinal() - 1)
        catalogue = CatalogueService(self._session)
        outcome = BulkOutcome()

        for spec in repricings:
            plan_id = spec["plan_id"]
            plan = self._session.get(PricePlan, plan_id)
            if plan is None:
                outcome.refuse(plan_id, "not_found")
                continue
            if plan.active_to is not None:
                continue
            amount = int(spec["monthly_amount_agorot"])
            fee = spec.get("registration_fee_agorot")
            if amount == plan.monthly_amount_agorot and fee is None:
                # No rise is a real and common answer, and it needs no successor plan. The
                # step is still acknowledged; the ledger just stays as it was.
                continue
            try:
                successor = catalogue.close_price_plan(
                    plan_id,
                    closes_on=closes_on,
                    replacement_amount_agorot=amount,
                    replacement_registration_fee_agorot=fee,
                    inherit_registration_fee=fee is None,
                )
            except (BillingConflictError, BillingNotFoundError, BillingRefusedError) as exc:
                outcome.refuse(plan_id, str(exc))
                continue
            # §3.5 of the completion findings register: closing the plan alone leaves every
            # student who was on it still pointing at the now-closed row, and the billing run
            # fetches by that stored id with no `active_to` check -- so without this, the next
            # run charges the old amount and nothing anywhere says so. Only `active` students,
            # matching who the run ever bills; a student who already left has nothing new to
            # be repriced for.
            affected = (
                self._session.execute(
                    select(Student).where(
                        Student.studio_id == studio_id,
                        Student.price_plan_id == plan_id,
                        Student.status == "active",
                    )
                )
                .scalars()
                .all()
            )
            for student in affected:
                student.price_plan_id = successor.id
            AuditService.record(
                self._session,
                action="price_plan.rolled_over",
                entity_type="price_plan",
                entity_id=successor.id,
                studio_id=studio_id,
                actor_person_id=actor_person_id,
                diff={
                    "closed_plan_id": str(plan_id),
                    "monthly_amount_agorot": [plan.monthly_amount_agorot, amount],
                    "training_year_id": str(training_year_id),
                    "students_repointed": len(affected),
                },
            )
            outcome.applied += 1

        return outcome

    # -- internals ------------------------------------------------------------
    def _acks(self, training_year_id: uuid.UUID, studio_id: uuid.UUID) -> dict[str, StepStatus]:
        """The acknowledgements for one year, or an empty map.

        **Addressed by primary key, never by "the studio in this session".** `studio` is the
        tenant, not a tenant-scoped table, so `TenantSession` adds no predicate to it and a
        bare `SELECT settings FROM studio` returns an arbitrary row. Callers get here having
        already resolved the training year, whose `studio_id` IS tenant-filtered, so the id
        passed in is the caller's own studio by construction.

        Unknown step ids and unknown statuses are dropped rather than trusted. This column is
        JSONB with no schema behind it, and a step renamed in a later milestone would
        otherwise leave a stale key that reads as a real answer for ever.
        """
        studio = self._session.get(Studio, studio_id)
        rollover = (studio.settings if studio else None) or {}
        stored = (rollover.get(SETTINGS_KEY) or {}).get(str(training_year_id)) or {}
        return {
            step: status
            for step, status in stored.items()
            if step in ROLLOVER_STEP_ORDER and status in ("done", "skipped")
        }

    def _count(self, stmt: Any) -> int:
        return int(self._session.execute(stmt).scalar_one())


__all__ = [
    "ROLLOVER_STEP_ORDER",
    "BulkOutcome",
    "RolloverService",
    "RolloverState",
    "RolloverStep",
]
