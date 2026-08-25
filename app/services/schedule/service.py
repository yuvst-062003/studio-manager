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
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as OrmSession

from app.models.schedule import (
    GroupScheduleRule,
    Session,
    StudioClosure,
    TrainingYear,
)
from app.models.structure import Group
from app.services.schedule.impact import SYSTEM_CANCEL_CLOSURE
from app.services.schedule.rules import ClosureSpec, RuleSpec, expand_rules, jerusalem_date


class NotFoundError(LookupError):
    """A row this studio cannot see.

    Deliberately not distinguished from "does not exist anywhere": the tenant filter makes
    another studio's row invisible, and a 403 would confirm it is real.
    """


class ConflictError(Exception):
    """A state transition the studio's own data forbids."""


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

    def _require_group(self, group_id: uuid.UUID) -> Group:
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
        self._require_group(group_id)
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
