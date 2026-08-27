"""§5.6 and §5.15 against the database. G6 — the routers parse, call, and return.

Everything here runs inside a `TenantSession`, so the tenant filter is already on every
query and the stamp already on every insert. Nothing below passes `studio_id` by hand:
doing so would be a second, weaker copy of a guarantee `app/core/tenancy.py` already makes,
and the two could disagree.

**An instance, not a namespace of `@staticmethod`s.** W2's contract commit fixed the seam as
`ScheduleService().materialize_sessions(group_id, from_date, to_date)` — three arguments and
no session — so the session has to arrive through the constructor. The rest of the class
follows suit rather than being half one shape and half the other.

`at` is a parameter on every writing method. `app.core.clock.now()` is the only clock
(§19.5) and a service that read it could not be time-travelled, which is what every billing
and reminder test in this product depends on.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as OrmSession

from app.models.people import Enrollment
from app.models.person import Guardian, Person
from app.models.schedule import (
    GroupScheduleRule,
    Session,
    SessionNote,
    SessionStaff,
    StudioClosure,
    TrainingYear,
)
from app.models.structure import Group, Location
from app.schemas.schedule import (
    ProtectedSessionOut,
    ScheduleImpactPreview,
    ScheduleRuleIn,
    SessionCreate,
    SessionOut,
    SessionPatch,
    SessionStaffIn,
    SessionStaffOut,
)
from app.services.audit import AuditService
from app.services.schedule.impact import (
    SYSTEM_CANCEL_CLOSURE,
    SYSTEM_CANCEL_SCHEDULE_CHANGE,
    ChangePlan,
    ExistingSession,
    plan_change,
    students_left_unscheduled,
)
from app.services.schedule.rules import (
    ClosureSpec,
    RuleSpec,
    expand_rules,
    jerusalem_date,
    rule_weekdays,
)


class NotFoundError(LookupError):
    """A row this studio cannot see.

    Deliberately not distinguished from "does not exist anywhere": the tenant filter makes
    another studio's row invisible, and a 403 would confirm it is real.
    """


class ConflictError(Exception):
    """A state transition the studio's own data forbids."""


class SessionDeleteRefusedError(Exception):
    """Deleting this session is wrong, and the refusal belongs on the server (F3).

    `reason` is machine-readable: `generated` (the next expansion would recreate it;
    cancel is the answer) or `has_attendance` (a register happened in it).
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _paged[Row](
    stmt: Select[tuple[Row]], *, cursor: uuid.UUID | None, limit: int
) -> Select[tuple[Row]]:
    """G16 — keyset pagination on the primary key, the same helper shape
    `app/services/structure/service.py` uses. `limit + 1` is fetched so the caller can tell
    "last page" from "one more row" without a second COUNT."""
    if cursor is not None:
        stmt = stmt.where(stmt.column_descriptions[0]["entity"].id > cursor)
    return stmt.limit(limit + 1)


def _page_out[Row](rows: list[Row], limit: int) -> tuple[list[Row], uuid.UUID | None]:
    if len(rows) > limit:
        return rows[:limit], rows[limit - 1].id  # type: ignore[attr-defined]
    return rows, None


class ScheduleService:
    """§5.6's session materialization and everything that feeds it.

    **The invariant every method here inherits**, from §5.6 and E2E-5: changing a rule
    rewrites only future sessions. A session in the past, a session carrying
    `is_manually_edited`, and an ad-hoc session are never overwritten. That rule lives with
    the writer — in `app/services/schedule/impact.py::plan_change` — rather than with the
    callers, which is why M3 reads through this class rather than querying `session` itself.
    """

    def __init__(self, session: OrmSession) -> None:
        self.session = session

    # -- rules and lookups ----------------------------------------------------
    def rule_specs(self, group_id: uuid.UUID) -> list[RuleSpec]:
        """Every rule row for a group, live and superseded alike.

        `expand_rules` honours `effective_from`/`effective_to` per date, so handing it the
        full history is what makes "the schedule as it was in October" answerable from the
        same code path as "the schedule now". Filtering here would throw that away.
        """
        rows = (
            self.session.execute(
                select(GroupScheduleRule).where(GroupScheduleRule.group_id == group_id)
            )
            .scalars()
            .all()
        )
        return [
            RuleSpec(
                weekday=r.weekday,
                start_time=r.start_time,
                end_time=r.end_time,
                location_id=r.location_id,
                effective_from=r.effective_from,
                effective_to=r.effective_to,
                rule_id=r.id,
            )
            for r in rows
        ]

    def require_group(self, group_id: uuid.UUID) -> Group:
        row = self.session.get(Group, group_id)
        if row is None:
            raise NotFoundError(str(group_id))
        return row

    @staticmethod
    def _year_covering(day: date, years: list[TrainingYear]) -> TrainingYear | None:
        for year in years:
            if year.starts_on <= day <= year.ends_on:
                return year
        return None

    def sessions_between(
        self, group_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[Session]:
        """The group's sessions whose **Jerusalem** day falls in the range, in start order.

        The window is widened by a day at each end before the database sees it and narrowed
        in Python afterwards: a 00:30 Jerusalem class is the previous day in UTC, and a
        naive `starts_at >= from_date` would drop it. Widening and re-filtering keeps the
        index scan while making the boundary the one the client is actually asking about.
        """
        lower = datetime.combine(from_date - timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        upper = datetime.combine(to_date + timedelta(days=2), datetime.min.time(), tzinfo=UTC)
        rows = (
            self.session.execute(
                select(Session)
                .where(
                    Session.group_id == group_id,
                    Session.starts_at >= lower,
                    Session.starts_at < upper,
                )
                .order_by(Session.starts_at)
            )
            .scalars()
            .all()
        )
        return [r for r in rows if from_date <= jerusalem_date(r.starts_at) <= to_date]

    # -- the seam -------------------------------------------------------------
    def materialize_sessions(
        self,
        group_id: uuid.UUID,
        from_date: date,
        to_date: date,
    ) -> list[Session]:
        """Every session for `group_id` in `[from_date, to_date]`, in start order.

        Materialized, not projected: the rows exist in `session` before this returns, so a
        caller may hold their ids. M3's `trial_booking.session_id` points at one of them,
        and a computed slot would be a booking pointing at nothing.

        Closures (§5.6) are skipped — a date the studio is closed produces no session, which
        is why a parent's month view shows a gap there rather than a cancelled row.

        **Idempotent.** A session already sitting at the wanted instant is kept, not
        duplicated: `POST /training-years/{id}/generate-sessions` is a button a manager can
        press twice, and pressing it twice must not double a year.

        **This does not rewrite anything.** It creates what is missing. Moving an existing
        session is `apply_schedule_change`'s job, and keeping the two apart is what makes
        "only the future is rewritten" a property of one function rather than a habit.
        """
        self.require_group(group_id)
        years = list(self.session.execute(select(TrainingYear)).scalars().all())
        closures = [spec for year in years for spec in self.closure_specs(year.id)]
        occurrences = expand_rules(self.rule_specs(group_id), from_date, to_date, closures)

        taken = {row.starts_at for row in self.sessions_between(group_id, from_date, to_date)}

        for occurrence in occurrences:
            if occurrence.starts_at in taken:
                continue
            year = self._year_covering(occurrence.on_date, years)
            if year is None:
                # `session.training_year_id` is non-null, so a date outside every declared
                # year cannot become a row. Silently skipped rather than raised: a rule
                # that runs past the end of the year is ordinary, not an error.
                continue
            self.session.add(
                Session(
                    group_id=group_id,
                    training_year_id=year.id,
                    starts_at=occurrence.starts_at,
                    ends_at=occurrence.ends_at,
                    location_id=occurrence.location_id,
                    status="scheduled",
                    is_manually_edited=False,
                    generated_from_rule_id=occurrence.rule_id,
                    is_ad_hoc=False,
                )
            )
            taken.add(occurrence.starts_at)

        self.session.flush()
        return self.sessions_between(group_id, from_date, to_date)

    # -- training years -------------------------------------------------------
    def list_training_years(
        self, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[TrainingYear], uuid.UUID | None]:
        stmt = _paged(select(TrainingYear).order_by(TrainingYear.id), cursor=cursor, limit=limit)
        return _page_out(list(self.session.execute(stmt).scalars().all()), limit)

    def create_training_year(
        self, *, name: str, starts_on: date, ends_on: date, at: datetime
    ) -> TrainingYear:
        """§5.15 step 1. Always `draft`: the wizard is resumable and nothing is visible to
        guardians until it is activated."""
        clash = self.session.execute(
            select(TrainingYear.id).where(TrainingYear.name == name)
        ).first()
        if clash is not None:
            # Checked rather than caught: the unique index would raise an IntegrityError
            # that reads as a 500, and this is a name the manager typed.
            raise ConflictError(name)
        row = TrainingYear(
            name=name, starts_on=starts_on, ends_on=ends_on, status="draft", created_at=at
        )
        self.session.add(row)
        self.session.flush()
        return row

    def get_training_year(self, training_year_id: uuid.UUID) -> TrainingYear:
        row = self.session.get(TrainingYear, training_year_id)
        if row is None:
            raise NotFoundError(str(training_year_id))
        return row

    def active_training_year(self) -> TrainingYear:
        """The one year sessions are generated into.

        `uq_training_year_one_active` makes "the active year" a single row rather than a
        convention, which is what lets every other method take it without a parameter.
        """
        row = (
            self.session.execute(select(TrainingYear).where(TrainingYear.status == "active"))
            .scalars()
            .first()
        )
        if row is None:
            raise NotFoundError("no active training year")
        return row

    # -- closures -------------------------------------------------------------
    def list_closures(
        self,
        *,
        training_year_id: uuid.UUID | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[StudioClosure], uuid.UUID | None]:
        stmt = select(StudioClosure).order_by(StudioClosure.id)
        if training_year_id is not None:
            stmt = stmt.where(StudioClosure.training_year_id == training_year_id)
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    def closure_specs(self, training_year_id: uuid.UUID) -> list[ClosureSpec]:
        rows = (
            self.session.execute(
                select(StudioClosure).where(StudioClosure.training_year_id == training_year_id)
            )
            .scalars()
            .all()
        )
        return [ClosureSpec(date_from=r.date_from, date_to=r.date_to) for r in rows]

    def create_closure(
        self,
        *,
        training_year_id: uuid.UUID,
        date_from: date,
        date_to: date,
        reason: str,
        source: str,
        at: datetime,
    ) -> tuple[StudioClosure, int]:
        """§5.6 — 'Manual closure ranges can be added at any time; adding one cancels the
        affected sessions and notifies the affected guardians.'

        Cancels, rather than deletes: families already have these lessons in their
        calendars, and a row that disappears without a trace is how a child turns up to a
        locked door. The notification is §5.11's and arrives in W5.

        **Only future sessions are cancelled**, for the same reason a rule change only
        rewrites future ones: a lesson that already happened, happened, whatever the
        calendar now says about that date.
        """
        year = self.get_training_year(training_year_id)
        row = StudioClosure(
            training_year_id=year.id,
            date_from=date_from,
            date_to=date_to,
            reason=reason,
            source=source,
            created_at=at,
        )
        self.session.add(row)

        affected = (
            self.session.execute(
                select(Session).where(
                    Session.training_year_id == year.id,
                    Session.starts_at > at,
                    Session.status == "scheduled",
                )
            )
            .scalars()
            .all()
        )
        cancelled = 0
        for session_row in affected:
            if date_from <= jerusalem_date(session_row.starts_at) <= date_to:
                session_row.status = "cancelled"
                session_row.cancel_reason = SYSTEM_CANCEL_CLOSURE
                cancelled += 1

        self.session.flush()
        return row, cancelled

    # -- §5.15's wizard steps 1 and 6 ---------------------------------------------
    def activate_training_year(self, training_year_id: uuid.UUID, *, at: datetime) -> TrainingYear:
        """§5.15 — 'nothing is visible to guardians until it is activated'.

        The incumbent is closed in the same transaction. `uq_training_year_one_active` is a
        partial unique index, so doing it in two steps would fail at the database with a
        constraint name rather than a sentence.
        """
        year = self.get_training_year(training_year_id)
        if year.status == "closed":
            raise ConflictError("a closed year cannot be reactivated")
        for other in (
            self.session.execute(select(TrainingYear).where(TrainingYear.status == "active"))
            .scalars()
            .all()
        ):
            if other.id != year.id:
                other.status = "closed"
        self.session.flush()
        year.status = "active"
        year.updated_at = at
        self.session.flush()
        return year

    def generate_sessions_for_year(
        self, training_year_id: uuid.UUID, *, at: datetime
    ) -> tuple[int, int]:
        """§5.15 step 6 — 'materialize every session for the year, skipping closures, and
        show a summary of what was created'. Returns (groups, sessions created).

        Every **active** group: a retired one (§5.15 step 3) keeps its history and gains no
        future.
        """
        year = self.get_training_year(training_year_id)
        groups = list(
            self.session.execute(select(Group).where(Group.is_active.is_(True))).scalars().all()
        )
        created = 0
        for group in groups:
            before = len(self.sessions_between(group.id, year.starts_on, year.ends_on))
            after = len(self.materialize_sessions(group.id, year.starts_on, year.ends_on))
            created += after - before
        return len(groups), created

    # -- §5.6's impact preview, and the change itself ------------------------------
    def live_rules(self, group_id: uuid.UUID, *, on: date) -> list[GroupScheduleRule]:
        rows = (
            self.session.execute(
                select(GroupScheduleRule)
                .where(GroupScheduleRule.group_id == group_id)
                .order_by(GroupScheduleRule.weekday, GroupScheduleRule.start_time)
            )
            .scalars()
            .all()
        )
        return [
            r
            for r in rows
            if r.effective_from <= on and (r.effective_to is None or r.effective_to >= on)
        ]

    def _enrollment_patterns(self, group_id: uuid.UUID) -> list[tuple[uuid.UUID, list[int] | None]]:
        """C12's input: one `(student_id, attends_weekdays)` pair per **active** enrollment.

        `app/models/people.py` is lane PEOPLE's file and is read, never written, from here.
        The intersection itself is not reimplemented — `students_left_unscheduled` reads
        through `app/services/people/attendance_pattern.py`, the seam W2's contract commit
        landed so both lanes share one definition of "expected".
        """
        rows = self.session.execute(
            select(Enrollment.student_id, Enrollment.attends_weekdays).where(
                Enrollment.group_id == group_id,
                Enrollment.status == "active",
                Enrollment.ended_on.is_(None),
            )
        ).all()
        return [(student_id, attends) for student_id, attends in rows]

    @staticmethod
    def change_window_start(effective_from: date, at: datetime) -> date:
        """The first date a schedule change actually bites.

        **Not simply the date the manager typed.** §5.6 rewrites only sessions with
        `starts_at > now()`, so a change dated back to the start of the training year still
        begins having effect today — and the rule rows have to say the same thing the
        sessions do. Deriving it in one place is what keeps the preview and the apply from
        disagreeing about which day that is.
        """
        return max(effective_from, jerusalem_date(at))

    @staticmethod
    def _specs_from_input(rules: Sequence[ScheduleRuleIn], effective_from: date) -> list[RuleSpec]:
        """The manager's date, not `window_start`.

        **Setting a schedule and changing one are different operations sharing an
        endpoint.** §5.6 says both: "when a group's schedule is set, sessions are generated
        for the entire training year", and "changing a rule rewrites only sessions with
        `starts_at > now()`". The rule row therefore covers the whole period the manager
        named — so a later full materialize can fill in September for a club that set its
        schedule in November — while the *rewrite* of sessions that already exist stays
        future-only, because that restriction lives in `plan_change` and nowhere else.
        """
        return [
            RuleSpec(
                weekday=r.weekday,
                start_time=r.start_time,
                end_time=r.end_time,
                location_id=r.location_id,
                effective_from=max(r.effective_from, effective_from),
                effective_to=None,
                rule_id=None,
            )
            for r in rules
        ]

    def rules_not_closed_before(self, group_id: uuid.UUID, on: date) -> list[GroupScheduleRule]:
        """Every rule still in force on `on` **or starting after it**.

        Wider than `live_rules` on purpose: a change dated from September supersedes a rule
        somebody dated to start in January too, and leaving that one behind would give the
        group two live rules on the same weekday from January onward — which the next full
        materialize would turn into two sessions a week.
        """
        rows = (
            self.session.execute(
                select(GroupScheduleRule).where(GroupScheduleRule.group_id == group_id)
            )
            .scalars()
            .all()
        )
        return [r for r in rows if r.effective_to is None or r.effective_to >= on]

    def _preview(
        self,
        group_id: uuid.UUID,
        *,
        specs: Sequence[RuleSpec],
        effective_from: date,
        at: datetime,
    ) -> tuple[ScheduleImpactPreview, ChangePlan]:
        year = self.active_training_year()
        window_start = self.change_window_start(effective_from, at)
        desired = expand_rules(specs, window_start, year.ends_on, self.closure_specs(year.id))
        existing = [
            ExistingSession(
                id=row.id,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_id=row.location_id,
                status=row.status,
                is_manually_edited=row.is_manually_edited,
                is_ad_hoc=row.is_ad_hoc,
            )
            for row in self.sessions_between(group_id, year.starts_on, year.ends_on)
        ]
        plan = plan_change(existing, desired, now=at, effective_from=window_start)
        stranded = students_left_unscheduled(
            self._enrollment_patterns(group_id), rule_weekdays(specs, window_start)
        )
        preview = ScheduleImpactPreview(
            sessions_to_create=len(plan.to_create),
            sessions_to_update=len(plan.to_update),
            sessions_to_cancel=len(plan.to_cancel),
            sessions_protected_past=len(plan.protected_past),
            sessions_protected_manually_edited=len(plan.protected_manually_edited),
            sessions_protected_ad_hoc=len(plan.protected_ad_hoc),
            first_affected_date=plan.first_affected_date,
            protected_manually_edited_sessions=[
                ProtectedSessionOut(id=p.id, starts_at=p.starts_at, ends_at=p.ends_at)
                for p in plan.protected_manually_edited
            ],
            students_left_unscheduled=stranded,
        )
        return preview, plan

    def preview_schedule_change(
        self,
        group_id: uuid.UUID,
        *,
        rules: Sequence[ScheduleRuleIn],
        effective_from: date,
        at: datetime,
    ) -> ScheduleImpactPreview:
        """§5.6's dialog. **Writes nothing** — that is the entire contract."""
        self.require_group(group_id)
        preview, _ = self._preview(
            group_id,
            specs=self._specs_from_input(rules, effective_from),
            effective_from=effective_from,
            at=at,
        )
        return preview

    def apply_schedule_change(
        self,
        group_id: uuid.UUID,
        *,
        rules: Sequence[ScheduleRuleIn],
        effective_from: date,
        at: datetime,
        actor_person_id: uuid.UUID | None = None,
        actor_identity_id: uuid.UUID | None = None,
    ) -> ScheduleImpactPreview:
        """Close the old rules, open the new ones, rewrite **only** the future.

        The rules are inserted first and the plan recomputed against the saved rows, rather
        than the created sessions being stamped from a map built by hand. Nothing about the
        plan changes — the same dates, the same times — except that each occurrence now
        carries the `rule_id` it came from, which is what makes a session traceable back to
        the rule that produced it. Building that mapping by matching on (weekday, time,
        location) would be the same answer reached by a route that can go wrong.
        """
        group = self.require_group(group_id)
        year = self.active_training_year()
        closes_on = effective_from - timedelta(days=1)

        # §4.3 — versioned by date, never edited in place. A rule rewritten in place has
        # already destroyed the "before" the preview exists to show.
        #
        # Two cases, and collapsing them is what breaks the check constraint. A rule whose
        # own start is on or after the change's date is **entirely** superseded: closing it
        # at `effective_from - 1` would end it before it began, which
        # `ck_group_schedule_rule_effective_range` refuses outright. That is a manager
        # correcting a schedule dated from the same day — the commonest edit there is — so
        # the old row is deleted rather than mangled. Its past sessions keep their times
        # (they are protected) and lose `generated_from_rule_id` through the FK's SET NULL,
        # which is honest: the rule that produced them no longer exists.
        #
        # Otherwise the old rule closes the day before the new one opens: contiguous, no
        # overlap, so a later full materialize cannot generate two sessions a week.
        for existing_rule in self.rules_not_closed_before(group_id, effective_from):
            if existing_rule.effective_from > closes_on:
                self.session.delete(existing_rule)
            else:
                existing_rule.effective_to = closes_on
        self.session.flush()
        # The FK's SET NULL fired in the database, not in the identity map.
        self.session.expire_all()

        for spec in self._specs_from_input(rules, effective_from):
            self.session.add(
                GroupScheduleRule(
                    group_id=group_id,
                    weekday=spec.weekday,
                    start_time=spec.start_time,
                    end_time=spec.end_time,
                    location_id=spec.location_id,
                    effective_from=spec.effective_from,
                    effective_to=None,
                    created_at=at,
                )
            )
        self.session.flush()

        saved = [spec for spec in self.rule_specs(group_id) if spec.effective_to is None]
        preview, plan = self._preview(group_id, specs=saved, effective_from=effective_from, at=at)

        by_id = {
            row.id: row for row in self.sessions_between(group_id, year.starts_on, year.ends_on)
        }
        for occurrence in plan.to_create:
            self.session.add(
                Session(
                    group_id=group_id,
                    training_year_id=year.id,
                    starts_at=occurrence.starts_at,
                    ends_at=occurrence.ends_at,
                    location_id=occurrence.location_id,
                    status="scheduled",
                    is_manually_edited=False,
                    generated_from_rule_id=occurrence.rule_id,
                    is_ad_hoc=False,
                    created_at=at,
                )
            )
        for session_id, occurrence in plan.to_update:
            row = by_id[session_id]
            row.starts_at = occurrence.starts_at
            row.ends_at = occurrence.ends_at
            row.location_id = occurrence.location_id
            row.generated_from_rule_id = occurrence.rule_id
        for session_id in plan.to_cancel:
            row = by_id[session_id]
            row.status = "cancelled"
            row.cancel_reason = SYSTEM_CANCEL_SCHEDULE_CHANGE

        AuditService.record(
            self.session,
            action="group.schedule.changed",
            entity_type="group",
            entity_id=group.id,
            studio_id=group.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            # Counts and dates only. A year's worth of session ids in an append-only table
            # is a row nobody can ever prune, and the counts are what an auditor asks for.
            diff={
                "effective_from": effective_from.isoformat(),
                "created": len(plan.to_create),
                "updated": len(plan.to_update),
                "cancelled": len(plan.to_cancel),
                "protected_past": len(plan.protected_past),
                "protected_manually_edited": len(plan.protected_manually_edited),
                "students_left_unscheduled": preview.students_left_unscheduled,
            },
        )
        self.session.flush()
        return preview

    # -- projection ----------------------------------------------------------------
    def project_sessions(self, rows: Sequence[Session]) -> list[SessionOut]:
        """ORM rows -> `SessionOut`, with the names a client needs to draw them.

        Three batch queries, never one per row: the staff app's Today screen and the
        dashboard's week view both render dozens at once, and an N+1 here is felt on a
        phone on a bus.

        `attendance_taken` is one of those three queries. It was hardcoded `False` while
        the `attendance` table lived in `app/models/_pending/`, with a note saying M5 would
        fill it; M5 landed without doing so, and the constant survived — so every ordinary
        read of a session claimed its register was unsigned, and only
        `bootstrap.py`, which overwrites the field after projecting, was ever right. §5.14's
        sessions-held-versus-planned report counts exactly this, so a permanent `False` is
        a number a club could act on.

        A row exists here only once somebody has marked something, so "any row not
        `unmarked`" is the whole test. `bootstrap.py` narrows further, to EXPECTED rows,
        because it is answering "is this register finished" for a coach's own list; this is
        answering "was it signed at all", and a child marked present who was not expected
        still signed it.
        """
        if not rows:
            return []
        # A comprehension rather than `dict(result)`: a `Row` is not a 2-tuple to mypy, so
        # `dict(...)` over the result infers `dict[Never, Never]` and every lookup below
        # becomes an error about a type nothing can be. `.tuples()` fixes the typing and
        # breaks at runtime — `dict()` cannot consume a `TupleResult` — so the unpacking is
        # written out, which satisfies both.
        group_names: dict[uuid.UUID, str] = {
            group_id: name
            for group_id, name in self.session.execute(
                select(Group.id, Group.name).where(Group.id.in_({r.group_id for r in rows}))
            ).all()
        }
        location_ids = {r.location_id for r in rows if r.location_id is not None}
        location_names: dict[uuid.UUID, str] = (
            {
                location_id: name
                for location_id, name in self.session.execute(
                    select(Location.id, Location.name).where(Location.id.in_(location_ids))
                ).all()
            }
            if location_ids
            else {}
        )
        # Read, never written, from here — the same standing as `guardian` and `enrollment`
        # below. Imported in the body rather than at module scope so this lane's import
        # graph does not gain a dependency on M5's models for a single boolean.
        from app.models.attendance import Attendance

        marked: set[uuid.UUID] = set(
            self.session.execute(
                select(Attendance.session_id)
                .where(
                    Attendance.session_id.in_({r.id for r in rows}),
                    Attendance.status != "unmarked",
                )
                .distinct()
            )
            .scalars()
            .all()
        )

        staff_rows = self.session.execute(
            select(SessionStaff, Person.first_name, Person.last_name)
            .join(Person, Person.id == SessionStaff.person_id)
            .where(SessionStaff.session_id.in_({r.id for r in rows}))
        ).all()
        staff_by_session: dict[uuid.UUID, list[SessionStaffOut]] = {}
        for assignment, first_name, last_name in staff_rows:
            staff_by_session.setdefault(assignment.session_id, []).append(
                SessionStaffOut(
                    person_id=assignment.person_id,
                    display_name=f"{first_name} {last_name}",
                    role=assignment.role,
                    is_substitute=assignment.is_substitute,
                )
            )

        return [
            SessionOut(
                id=row.id,
                group_id=row.group_id,
                group_name=group_names.get(row.group_id, ""),
                training_year_id=row.training_year_id,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_id=row.location_id,
                location_name=location_names.get(row.location_id) if row.location_id else None,
                status=row.status,
                is_manually_edited=row.is_manually_edited,
                is_ad_hoc=row.is_ad_hoc,
                cancel_reason=row.cancel_reason,
                staff=staff_by_session.get(row.id, []),
                attendance_taken=row.id in marked,
            )
            for row in rows
        ]

    # -- reading -------------------------------------------------------------------
    def groups_visible_to_guardian(self, person_id: uuid.UUID) -> set[uuid.UUID]:
        """Artboard 12b's authorization, in one query.

        §3.3 makes 'my children' exactly `SELECT student_id FROM guardian WHERE
        person_id = :me`, and a child's groups are their active enrollments. Both tables
        belong to other lanes and are **read, never written**, from here — a parent's
        calendar that cannot load is a screen that was not delivered.
        """
        rows = (
            self.session.execute(
                select(Enrollment.group_id)
                .join(Guardian, Guardian.student_id == Enrollment.student_id)
                .where(Guardian.person_id == person_id, Enrollment.ended_on.is_(None))
            )
            .scalars()
            .all()
        )
        return set(rows)

    def list_sessions(
        self,
        *,
        from_date: date,
        to_date: date,
        group_id: uuid.UUID | None = None,
        coach_person_id: uuid.UUID | None = None,
        visible_group_ids: set[uuid.UUID] | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Session], uuid.UUID | None]:
        """`GET /sessions?from&to&group_id`.

        `visible_group_ids` is `None` for staff — they see the whole studio — and a set for
        a guardian. An **empty** set is not the same as `None`: it means "this caller has no
        children enrolled anywhere", and it must return nothing rather than everything.
        Making that distinction a type rather than a falsy check is the difference between a
        quiet bug and a screen that shows one family another family's calendar.
        """
        lower = datetime.combine(from_date - timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        upper = datetime.combine(to_date + timedelta(days=2), datetime.min.time(), tzinfo=UTC)
        stmt = (
            select(Session)
            .where(Session.starts_at >= lower, Session.starts_at < upper)
            .order_by(Session.starts_at, Session.id)
        )
        if group_id is not None:
            stmt = stmt.where(Session.group_id == group_id)
        if visible_group_ids is not None:
            # An empty set has to produce an impossible predicate rather than no predicate.
            stmt = stmt.where(Session.group_id.in_(visible_group_ids or {uuid.UUID(int=0)}))
        if coach_person_id is not None:
            stmt = stmt.where(
                Session.id.in_(
                    select(SessionStaff.session_id).where(SessionStaff.person_id == coach_person_id)
                )
            )
        rows = [
            row
            for row in self.session.execute(stmt).scalars().all()
            if from_date <= jerusalem_date(row.starts_at) <= to_date
        ]
        if cursor is not None:
            # Keyed on the row's position rather than on its id, because the ordering is by
            # `starts_at` and a keyset on the primary key would page in the wrong sequence.
            seen = [i for i, row in enumerate(rows) if row.id == cursor]
            rows = rows[seen[0] + 1 :] if seen else rows
        if len(rows) > limit:
            return rows[:limit], rows[limit - 1].id
        return rows, None

    def get_session(self, session_id: uuid.UUID) -> Session:
        row = self.session.get(Session, session_id)
        if row is None:
            raise NotFoundError(str(session_id))
        return row

    # -- writing one session --------------------------------------------------------
    def _set_staff(self, session_id: uuid.UUID, staff: Sequence[SessionStaffIn]) -> None:
        for existing_row in (
            self.session.execute(select(SessionStaff).where(SessionStaff.session_id == session_id))
            .scalars()
            .all()
        ):
            self.session.delete(existing_row)
        self.session.flush()
        for member in staff:
            self.session.add(
                SessionStaff(
                    session_id=session_id,
                    person_id=member.person_id,
                    role=member.role,
                    is_substitute=member.is_substitute,
                )
            )

    def create_ad_hoc_session(self, body: SessionCreate, *, at: datetime) -> Session:
        """§5.6 — 'add an ad-hoc session that belongs to no rule'.

        `is_manually_edited` is set as well as `is_ad_hoc`. Both are true and both matter:
        the first says a human decided this, the second says no rule owns it. A regenerate
        checks either and stops — and `plan_change` tests `is_ad_hoc` first, because the two
        protections behave differently.
        """
        self.require_group(body.group_id)
        self.get_training_year(body.training_year_id)
        row = Session(
            group_id=body.group_id,
            training_year_id=body.training_year_id,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            location_id=body.location_id,
            status="scheduled",
            is_manually_edited=True,
            generated_from_rule_id=None,
            is_ad_hoc=True,
            created_at=at,
        )
        self.session.add(row)
        self.session.flush()
        self._set_staff(row.id, body.staff)
        self.session.flush()
        return row

    def patch_session(self, session_id: uuid.UUID, body: SessionPatch, *, at: datetime) -> Session:
        """§5.6's per-session override. **Any change here sets `is_manually_edited`.**

        That flag is the whole of the second protection: a later rule change reads it to
        decide what it may not touch. A PATCH that forgot to set it would leave a coach's
        deliberate change looking machine-made, and the next schedule edit would quietly
        undo it — which is the exact failure §5.6 spends a paragraph on.
        """
        row = self.get_session(session_id)
        given = body.model_fields_set
        if "starts_at" in given and body.starts_at and body.ends_at:
            row.starts_at = body.starts_at
            row.ends_at = body.ends_at
        if "location_id" in given:
            row.location_id = body.location_id
        if "staff" in given and body.staff is not None:
            self._set_staff(row.id, body.staff)
        row.is_manually_edited = True
        row.updated_at = at
        self.session.flush()
        return row

    def cancel_session(self, session_id: uuid.UUID, *, reason: str, at: datetime) -> Session:
        row = self.get_session(session_id)
        row.status = "cancelled"
        row.cancel_reason = reason
        row.is_manually_edited = True
        row.updated_at = at
        self.session.flush()
        return row

    def delete_session(self, session_id: uuid.UUID) -> None:
        """F3's decision, enforced on the server rather than only in the UI that hides
        the button.

        A GENERATED session (`generated_from_rule_id` non-null) is never deleted: the
        next rule expansion would recreate it, and cancel is the product's answer there.
        An ad-hoc session with attendance marks is refused too -- deleting it would take
        a child's recorded presence with it, and no session is worth more than the
        register that happened in it.
        """
        from app.models.attendance import Attendance

        row = self.get_session(session_id)
        if row.generated_from_rule_id is not None:
            raise SessionDeleteRefusedError("generated")
        marked = self.session.execute(
            select(Attendance.id).where(Attendance.session_id == session_id).limit(1)
        ).first()
        if marked is not None:
            raise SessionDeleteRefusedError("has_attendance")
        self.session.delete(row)
        self.session.flush()

    # -- notes ----------------------------------------------------------------------
    def list_notes(
        self, session_id: uuid.UUID, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[SessionNote], uuid.UUID | None]:
        self.get_session(session_id)
        stmt = (
            select(SessionNote)
            .where(SessionNote.session_id == session_id, SessionNote.deleted_at.is_(None))
            .order_by(SessionNote.id)
        )
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    def add_note(
        self, session_id: uuid.UUID, *, body: str, author_person_id: uuid.UUID, at: datetime
    ) -> SessionNote:
        self.get_session(session_id)
        row = SessionNote(
            session_id=session_id, author_person_id=author_person_id, body=body, created_at=at
        )
        self.session.add(row)
        self.session.flush()
        return row
