"""Artboard `4g` — retention, revenue and attendance, in one payload.

**What this screen shipped as, and why that changes.** `ReportsSection.tsx` rendered four
*money* cards — total, settled, overdue, pending — for one month at a time. `4g`'s KPI
strip is four *different* metrics: active students, monthly churn, average revenue,
average attendance. The money four are not deleted and not merely moved: they are the
answer to "what happened to this month's bill", which is the subject of the
`send-monthly` email that sits beside them, so they stay on the screen as the revenue
panel's footer and keep that button. The strip above them becomes the four figures the
artboard names. Nobody loses a number they were using, and the strip stops being a
billing summary wearing the reports name.

**The predicate behind every figure, and whether it is honest for a past month.** This is
the whole of the module's risk, so it is stated once, here:

* **Membership** — a member on day D is a student with `joined_on <= D` and (`left_on IS
  NULL` or `left_on > D`). Dates, never `student.status`: status is a *current* column,
  so counting `status = 'active'` returns today's answer for every window the switcher
  offers. Honest for past months. Its one blind spot is a student marked `left` with no
  `left_on`; those are counted separately as `undated_departures` and excluded from
  churn and retention rather than silently placed.
* **Churn** — departures with `left_on` inside the window, over the members standing at
  the window's start, normalised to 30 days. Honest for past months, with the same blind
  spot.
* **Revenue** — `charge` rows by `(period_year, period_month)`, `void` and `written_off`
  excluded, against the `payment_allocation` rows applied to them. Both sides are
  immutable history. Honest for past months.
* **Attendance** — `app/services/attendance/report.py`, unchanged and not reimplemented.
  Its denominator is **decided marks only** (§5.14: a report must never treat `unmarked`
  as `absent`) and it decides "this lesson happened" from `ends_at` against the clock,
  **never from `session.status = 'completed'`** — the worker that writes that status was
  unscheduled for a wave and a half, so every session that ended before this month is
  still `scheduled`. A twelve-month average built on `completed` would read near zero for
  every past month and nobody would be able to tell it apart from a quiet year. Honest
  for past months **because** it ignores that column.
* **Retention** — `joined_on` and `left_on` again, per-bucket survival, with anyone who
  has not had time to fail excluded from the cohort. Honest for past months.
* **Belt promotions** — `student_belt.awarded_on` inside the window. An award is a dated
  fact. Honest for past months.

`reports.operational.sessionsHeld` (`שיעורים שהתקיימו מול מתוכננים`) stays unused, and
that is a decision rather than an omission: sessions-held-versus-planned is exactly the
number `session.status` cannot answer retroactively, and lane ATTENDANCE refused to build
it for the same reason. A screen that published it would be silently wrong for every
month before this one.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from app.models.belts import BeltRank, StudentBelt
from app.models.billing import Charge, PaymentAllocation
from app.models.people import Student
from app.services.attendance.report import BadRangeError, build_report
from app.services.reports.periods import (
    PeriodKind,
    Window,
    add_months,
    billing_months,
    previous_window,
    resolve_window,
    trend_months,
)
from app.services.reports.schemas import (
    BeltPromotionOut,
    KpiOut,
    MonthlyReportSummary,
    PeriodWindowOut,
    ReportsOverviewOut,
    RetentionBucketOut,
    RevenueMonthOut,
)
from app.services.reports.service import CLOSED_STATUSES, ReportService

#: `(lower, upper)` in whole months. `None` upper is open-ended — see
#: `RetentionBucketOut`. Four buckets because `4g` draws four rows; the boundaries are
#: the ones the artboard's own footnote reaches for ("most churn happens in the first
#: three months").
RETENTION_BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("m0_3", 0, 3),
    ("m3_6", 3, 6),
    ("m6_12", 6, 12),
    ("m12_plus", 12, None),
)

#: A status that says the student is gone. Used only to *find* departures whose date is
#: missing; the metrics themselves never branch on status.
DEPARTED_STATUSES = ("left", "lost")

#: Churn is quoted per month, and a month is 30 days here. The alternative — dividing by
#: whole calendar months — makes a 28-day February churn higher than an identical March,
#: which is an artefact of the calendar rather than of the club.
CHURN_DAYS = 30


def _round_ratio(numerator: int, denominator: int, scale: int) -> int:
    """`numerator / denominator * scale`, rounded half-up, in integers.

    `round()` alone banker's-rounds, which prints 66% for exactly 66.5 — the same trap
    `app/services/attendance/report.py::_rate` documents, and the reason both do this the
    long way rather than reaching for a float.
    """
    return (numerator * scale * 2 + denominator) // (denominator * 2)


def build_overview(session: OrmSession, *, kind: PeriodKind, now: datetime) -> ReportsOverviewOut:
    """Everything on `4g`, for one of the three windows.

    `now` is passed rather than read for the reason `build_report` gives: `app.core.clock`
    is the only clock (§19.5), and a service that reached for wall-clock time would be a
    service `X-Dev-Now` cannot move — which is how §19's demo studio shows a report at
    all.
    """
    window = resolve_window(session, kind=kind, now=now)
    if window is None:
        return ReportsOverviewOut()

    previous = previous_window(window)
    revenue = _revenue(session, trend_months(window))
    window_months = billing_months(window)
    collected_in_window = sum(
        row.collected_agorot for row in revenue if (row.year, row.month) in set(window_months)
    )

    members_now = _members_on(session, window.to_date)
    members_before = _members_on(session, window.from_date - timedelta(days=1))
    attendance = _attendance(session, window, now=now)
    previous_attendance = _attendance(session, previous, now=now)

    kpi = KpiOut(
        active_students=members_now,
        active_students_delta=members_now - members_before,
        churn_permille=_churn(session, window, members_at_start=members_before),
        churn_permille_delta=_churn_delta(session, window, previous),
        avg_monthly_revenue_agorot=(
            collected_in_window // len(window_months) if window_months else 0
        ),
        revenue_per_student_agorot=(
            collected_in_window // members_now if members_now > 0 else None
        ),
        attendance_percent=attendance.percent,
        attendance_percent_delta=(
            attendance.percent - previous_attendance.percent
            if attendance.percent is not None and previous_attendance.percent is not None
            else None
        ),
        attendance_unmarked_marks=attendance.unmarked,
        attendance_decided_marks=attendance.decided,
        undated_departures=_undated_departures(session),
    )

    retention = _retention(session, as_of=window.to_date)
    belts = _belt_promotions(session, window)
    # The four money cards this screen shipped with, kept and reported for the window's
    # last month. A window's *final* month rather than its first: the switcher's whole
    # point is recency, and `send-monthly` beside these cards emails the month a manager
    # is currently arguing about.
    billing_month = ReportService(session).monthly_summary(  # type: ignore[arg-type]
        window.to_date.year, window.to_date.month
    )

    return ReportsOverviewOut(
        period=PeriodWindowOut(
            kind=window.kind,
            from_date=window.from_date,
            to_date=window.to_date,
            season_name=window.season_name,
        ),
        kpi=kpi,
        billing_month=MonthlyReportSummary(**billing_month),
        revenue=revenue,
        retention=retention,
        belts=belts,
        has_data=(
            members_now > 0
            or any(row.billed_agorot or row.collected_agorot for row in revenue)
            or any(bucket.cohort for bucket in retention)
            or any(bar.promotions for bar in belts)
            or attendance.decided > 0
        ),
    )


# ── membership, from dates and never from `student.status` ──────────────────────────
def _members_on(session: OrmSession, day: date) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Student)
            .where(
                Student.joined_on.is_not(None),
                Student.joined_on <= day,
                (Student.left_on.is_(None)) | (Student.left_on > day),
            )
        ).scalar_one()
    )


def _departures_in(session: OrmSession, window: Window) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Student)
            .where(
                Student.left_on.is_not(None),
                Student.left_on >= window.from_date,
                Student.left_on <= window.to_date,
            )
        ).scalar_one()
    )


def _undated_departures(session: OrmSession) -> int:
    """Gone, but not on any particular day. Published rather than swallowed."""
    return int(
        session.execute(
            select(func.count())
            .select_from(Student)
            .where(Student.left_on.is_(None), Student.status.in_(DEPARTED_STATUSES))
        ).scalar_one()
    )


def _churn(session: OrmSession, window: Window, *, members_at_start: int) -> int | None:
    if members_at_start <= 0:
        return None
    departures = _departures_in(session, window)
    return _round_ratio(departures * CHURN_DAYS, members_at_start * window.days, 1000)


def _churn_delta(session: OrmSession, window: Window, previous: Window) -> int | None:
    current = _churn(
        session, window, members_at_start=_members_on(session, window.from_date - timedelta(days=1))
    )
    prior = _churn(
        session,
        previous,
        members_at_start=_members_on(session, previous.from_date - timedelta(days=1)),
    )
    if current is None or prior is None:
        return None
    return current - prior


# ── money: charges raised, allocations applied ──────────────────────────────────────
def _revenue(session: OrmSession, months: list[tuple[int, int]]) -> list[RevenueMonthOut]:
    """Twelve columns, oldest first, whether or not the club billed in a given month.

    A month with no charges is a column of height zero and **not** a missing column: the
    axis is time, and dropping a quiet month would slide every later month one place to
    the right and turn a gap into a trend.
    """
    if not months:
        return []
    keys = [year * 12 + month for year, month in months]
    period_key = Charge.period_year * 12 + Charge.period_month
    live = (
        Charge.period_year.is_not(None),
        Charge.period_month.is_not(None),
        Charge.status.notin_(CLOSED_STATUSES),
        period_key.in_(keys),
    )

    billed = {
        (year, month): int(total)
        for year, month, total in session.execute(
            select(
                Charge.period_year,
                Charge.period_month,
                func.coalesce(func.sum(Charge.amount_agorot), 0),
            )
            .where(*live)
            .group_by(Charge.period_year, Charge.period_month)
        ).all()
    }
    collected = {
        (year, month): int(total)
        for year, month, total in session.execute(
            select(
                Charge.period_year,
                Charge.period_month,
                func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0),
            )
            .join(Charge, Charge.id == PaymentAllocation.charge_id)
            .where(*live)
            .group_by(Charge.period_year, Charge.period_month)
        ).all()
    }

    rows: list[RevenueMonthOut] = []
    for year, month in months:
        month_billed = billed.get((year, month), 0)
        month_collected = collected.get((year, month), 0)
        rows.append(
            RevenueMonthOut(
                year=year,
                month=month,
                billed_agorot=month_billed,
                collected_agorot=month_collected,
                # Floored: an over-allocated month is a reconciliation problem (§5.10's
                # queue owns it) and must not draw as negative debt.
                outstanding_agorot=max(0, month_billed - month_collected),
            )
        )
    return rows


# ── attendance: lane ATTENDANCE's rule, reused rather than restated ─────────────────
class _Attendance:
    __slots__ = ("decided", "percent", "unmarked")

    def __init__(self, percent: int | None, decided: int, unmarked: int) -> None:
        self.percent = percent
        self.decided = decided
        self.unmarked = unmarked


def _attendance(session: OrmSession, window: Window, *, now: datetime) -> _Attendance:
    """The studio-wide rate, aggregated out of `4c`'s per-group report.

    **`build_report` is called rather than copied.** Its rule is the one §5.14 argues
    for — present over present-plus-absent, `unmarked` counted and never divided by — and
    a second implementation here would be a second place for that denominator to drift.
    The aggregation is a sum of the per-group counts, not a mean of the per-group rates:
    averaging rates would weight a group of four the same as a group of forty.

    A window longer than `MAX_REPORT_DAYS` yields **no figure** rather than a clamped
    one. A number silently computed over 400 days of a 700-day season is worse than a
    dash, because a dash is visibly missing.
    """
    try:
        report = build_report(session, from_date=window.from_date, to_date=window.to_date, now=now)
    except BadRangeError:
        return _Attendance(None, 0, 0)

    present = sum(group.present for group in report.groups)
    absent = sum(group.absent for group in report.groups)
    unmarked = sum(group.unmarked for group in report.groups)
    decided = present + absent
    return _Attendance(_round_ratio(present, decided, 100) if decided else None, decided, unmarked)


# ── retention: per-bucket survival, with the cohort printed ─────────────────────────
def _retention(session: OrmSession, *, as_of: date) -> list[RetentionBucketOut]:
    """`שימור לפי ותק`, four rows.

    The whole membership base is loaded and bucketed in Python rather than expressed as
    four correlated SQL aggregates. Two reasons, in order: `add_months` has to clamp into
    short months (a child who joined on 31 January reaches "one month" on 28 February,
    not 3 March) and Postgres interval arithmetic clamps differently at exactly the
    boundaries that decide a bucket; and the row count is bounded by club size, which is
    the same argument `app/routers/exports.py` makes for streaming a whole month of
    payments.

    **As of the window's end, not of the window.** Retention is a property of a
    membership base, not of a date range: asking "how many survived three months" only of
    people who joined inside a one-month window would answer over a cohort of almost
    nobody. The switcher moves the `as_of`; it does not restrict the cohort.
    """
    rows = session.execute(
        select(Student.joined_on, Student.left_on, Student.status).where(
            Student.joined_on.is_not(None)
        )
    ).all()

    buckets: list[RetentionBucketOut] = []
    for key, lower, upper in RETENTION_BUCKETS:
        cohort = 0
        retained = 0
        for joined_on, left_on, status in rows:
            if joined_on is None:
                continue
            if left_on is None and status in DEPARTED_STATUSES:
                # Departed on an unknown day. Counted in `undated_departures`, placed in
                # no cohort — see the module docstring.
                continue
            reached_lower = add_months(joined_on, lower)
            if left_on is not None and left_on <= reached_lower:
                continue  # left before this stretch began
            if upper is None:
                # Open-ended: reached twelve months, and still enrolled today.
                if reached_lower > as_of:
                    continue
                cohort += 1
                retained += 1 if left_on is None else 0
                continue
            reached_upper = add_months(joined_on, upper)
            if reached_upper > as_of:
                continue  # has not had time to fail, so cannot count as a loss
            cohort += 1
            retained += 1 if left_on is None or left_on > reached_upper else 0
        buckets.append(
            RetentionBucketOut(
                key=key,
                lower_months=lower,
                upper_months=upper,
                cohort=cohort,
                retained=retained,
                percent=_round_ratio(retained, cohort, 100) if cohort else None,
            )
        )
    return buckets


# ── belt promotions: the one deliberate colour exception ────────────────────────────
def _belt_promotions(session: OrmSession, window: Window) -> list[BeltPromotionOut]:
    """Every rank on the ladder, with what it awarded in the window.

    **Two queries, not a `LEFT JOIN`.** `TenantSession` appends its studio filter through
    `with_loader_criteria`, and a criterion landing on the outer side of a left join turns
    it into an inner one — which would silently drop every rank that awarded nothing and
    leave a quiet month rendering three bars instead of seven. Merged in Python instead,
    where nothing can rewrite the statement underneath.

    Ranks with **no** promotions are kept, at zero. The artboard draws seven bars and a
    quiet season is exactly when a manager wants to see which ranks stood still.
    """
    ranks = (
        session.execute(select(BeltRank).order_by(BeltRank.order_index, BeltRank.name))
        .scalars()
        .all()
    )
    if not ranks:
        return []

    counts: dict[uuid.UUID, int] = {
        rank_id: int(total)
        for rank_id, total in session.execute(
            select(StudentBelt.belt_rank_id, func.count())
            .where(
                StudentBelt.awarded_on >= window.from_date,
                StudentBelt.awarded_on <= window.to_date,
            )
            .group_by(StudentBelt.belt_rank_id)
        ).all()
    }
    return [
        BeltPromotionOut(
            belt_rank_id=rank.id,
            name=rank.name,
            color_hex=rank.color_hex,
            secondary_color_hex=rank.secondary_color_hex,
            order_index=rank.order_index,
            promotions=counts.get(rank.id, 0),
        )
        for rank in ranks
    ]
