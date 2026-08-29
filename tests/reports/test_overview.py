"""Artboard `4g` — the predicate behind every figure, asserted rather than described.

Each test here pins one sentence from `app/services/reports/overview.py`'s docstring. The
ones that matter most are the two about *honesty over past months*: that membership is
read off dates and never off `student.status`, and that attendance never consults
`session.status = 'completed'`. Both are silent failures — a number that is simply wrong,
with nothing on the screen to say so — which is why they are the tests with the longest
names in this file.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from app.models.belts import StudentBelt
from app.models.billing import Charge, Payment, PaymentAllocation
from app.services.reports.csv_export import overview_csv, shekels
from app.services.reports.overview import build_overview
from app.services.reports.periods import (
    Window,
    add_months,
    billing_months,
    previous_window,
    resolve_window,
    trend_months,
)
from tests.reports.conftest import T0, TODAY, YEAR_STARTS, make_member, make_session, mark

# ── the window itself ────────────────────────────────────────────────────────────────


def test_month_window_stops_at_today_rather_than_running_to_month_end(tenant_session):
    """A report published on the 12th must not divide by a month that has not happened."""
    window = resolve_window(tenant_session, kind="month", now=T0)
    assert window is not None
    assert window.from_date == date(2026, 11, 1)
    assert window.to_date == TODAY
    assert window.days == 12


def test_year_window_is_twelve_whole_months_ending_with_this_one(tenant_session):
    window = resolve_window(tenant_session, kind="year", now=T0)
    assert window is not None
    assert window.from_date == date(2025, 12, 1)
    assert window.to_date == TODAY
    assert len(billing_months(window)) == 12


def test_season_without_an_active_training_year_is_empty_not_an_error(tenant_session):
    """The spec's own case: 'Selecting a season a studio did not operate in lands here.'"""
    assert resolve_window(tenant_session, kind="season", now=T0) is None

    overview = build_overview(tenant_session, kind="season", now=T0)
    assert overview.period is None
    assert overview.kpi is None
    assert overview.has_data is False


def test_season_is_the_active_training_year_clipped_at_today(tenant_session, a_training_year):
    window = resolve_window(tenant_session, kind="season", now=T0)
    assert window is not None
    assert window.from_date == YEAR_STARTS
    assert window.to_date == TODAY  # not 2027-08-31, which has not happened
    assert window.season_name == "תשפ״ז"


def test_add_months_clamps_into_a_short_month(_unused=None):
    """31 January plus one month is 28 February, not 3 March.

    A child who joined on the 31st must not drift a day later into every retention
    boundary for the rest of their membership.
    """
    assert add_months(date(2027, 1, 31), 1) == date(2027, 2, 28)
    assert add_months(date(2026, 12, 31), 2) == date(2027, 2, 28)


def test_previous_window_is_the_same_length_immediately_before(_unused=None):
    window = Window(kind="month", from_date=date(2026, 11, 1), to_date=date(2026, 11, 12))
    previous = previous_window(window)
    assert previous.to_date == date(2026, 10, 31)
    assert previous.days == window.days


def test_the_trend_runs_oldest_first_because_rtl_lays_it_out(_unused=None):
    """`4g`: 'the trend reads oldest-to-newest in reading order. Do not reverse it.'"""
    window = Window(kind="month", from_date=date(2026, 11, 1), to_date=date(2026, 11, 12))
    months = trend_months(window)
    assert len(months) == 12
    assert months[0] == (2025, 12)
    assert months[-1] == (2026, 11)


def test_billing_months_include_a_month_the_window_only_overlaps(_unused=None):
    """A season opening on 5 September still owes a September tuition charge."""
    window = Window(kind="season", from_date=date(2026, 9, 5), to_date=date(2026, 11, 12))
    assert billing_months(window) == [(2026, 9), (2026, 10), (2026, 11)]


# ── membership: dates, never `student.status` ────────────────────────────────────────


def test_active_students_is_a_date_predicate_not_the_status_column(
    app_session, studio, tenant_session, a_training_year
):
    """The one that would be silently wrong for every past month.

    `student.status` is a *current* column. A student who left in October is `left`
    today, so a status-based count would report them missing from every window — including
    September, when they were plainly a member. Both students below are `left` right now.
    """
    make_member(app_session, studio, joined_on=date(2026, 9, 1), left_on=None, status="active")
    make_member(
        app_session, studio, joined_on=date(2026, 9, 1), left_on=date(2026, 10, 20), status="left"
    )

    october = build_overview(
        tenant_session, kind="month", now=datetime(2026, 10, 15, 9, tzinfo=T0.tzinfo)
    )
    assert october.kpi is not None
    # Two members standing on 15 October: the departure had not happened yet.
    assert october.kpi.active_students == 2

    november = build_overview(tenant_session, kind="month", now=T0)
    assert november.kpi is not None
    assert november.kpi.active_students == 1


def test_a_departure_with_no_date_is_published_rather_than_placed(
    app_session, studio, tenant_session
):
    """`left` with a null `left_on` cannot be put on a timeline, so it is put on the screen."""
    make_member(app_session, studio, joined_on=date(2026, 9, 1), left_on=None, status="left")

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.undated_departures == 1


def test_churn_is_tenths_of_a_percent_per_thirty_days(app_session, studio, tenant_session):
    """Ten members at the start of November, one leaving on the 5th, twelve days elapsed.

    1/10 over 12 days, quoted per 30 days: 0.1 * 30/12 = 0.25 -> 250 permille, and the
    integer arithmetic must round half-up rather than banker's-round.
    """
    for _ in range(10):
        make_member(app_session, studio, joined_on=date(2026, 9, 1))
    departing = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    departing.left_on = date(2026, 11, 5)
    departing.status = "left"
    app_session.commit()

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    # 11 members standing on 31 October, one departure, 12 days.
    assert overview.kpi.churn_permille == 227  # 1 * 30 * 1000 / (11 * 12) = 227.27


def test_churn_is_null_rather_than_zero_when_nobody_was_enrolled(tenant_session):
    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.churn_permille is None


# ── attendance: §5.14, reused from lane ATTENDANCE and never reimplemented ───────────


def test_unmarked_is_counted_and_never_divided_by(
    app_session, studio, tenant_session, a_training_year, a_group
):
    """§5.14. Three marks: one present, one absent, one unmarked.

    A rate that swept `unmarked` into the denominator would print 33%. The rule says 50%,
    and the unmarked mark is reported beside it so the screen can say why.
    """
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    other = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    third = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    lesson = make_session(
        app_session,
        studio,
        a_group,
        a_training_year,
        starts_at=datetime(2026, 11, 3, 16, tzinfo=T0.tzinfo),
    )
    mark(app_session, studio, lesson, student, "present")
    mark(app_session, studio, lesson, other, "absent_unexcused")
    mark(app_session, studio, lesson, third, "unmarked")

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.attendance_percent == 50
    assert overview.kpi.attendance_decided_marks == 2
    assert overview.kpi.attendance_unmarked_marks == 1


def test_attendance_never_reads_session_status_completed(
    app_session, studio, tenant_session, a_training_year, a_group
):
    """Every fixture session here is `scheduled`, which is what a real past month holds.

    `app/workers/schedule.py` is the only writer of `completed` and it sat unscheduled for
    a wave and a half. A metric keyed on that column would read zero for every month
    before this one and look exactly like a club nobody attended.
    """
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    lesson = make_session(
        app_session,
        studio,
        a_group,
        a_training_year,
        starts_at=datetime(2026, 11, 3, 16, tzinfo=T0.tzinfo),
    )
    assert lesson.status == "scheduled"
    mark(app_session, studio, lesson, student, "present")

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.attendance_percent == 100


def test_attendance_is_null_when_only_unmarked_marks_exist(
    app_session, studio, tenant_session, a_training_year, a_group
):
    """No decided marks means no figure, not a figure of zero — `4c`'s own rule."""
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    lesson = make_session(
        app_session,
        studio,
        a_group,
        a_training_year,
        starts_at=datetime(2026, 11, 3, 16, tzinfo=T0.tzinfo),
    )
    mark(app_session, studio, lesson, student, "unmarked")

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.attendance_percent is None
    assert overview.kpi.attendance_unmarked_marks == 1


# ── revenue: charges raised against allocations applied ──────────────────────────────


def _charge(app_session, studio, student, *, year, month, agorot, status="open"):
    row = Charge(
        studio_id=studio.id,
        payer_person_id=student.person_id,
        student_id=student.id,
        kind="tuition",
        period_year=year,
        period_month=month,
        amount_agorot=agorot,
        due_date=date(year, month, 28),
        status=status,
        created_by="billing_run",
    )
    app_session.add(row)
    app_session.commit()
    return row


def _allocate(app_session, studio, charge, agorot):
    payment = Payment(
        studio_id=studio.id,
        payer_person_id=charge.payer_person_id,
        method="cash",
        amount_agorot=agorot,
        received_at=T0,
    )
    app_session.add(payment)
    app_session.flush()
    app_session.add(
        PaymentAllocation(
            studio_id=studio.id,
            payment_id=payment.id,
            charge_id=charge.id,
            amount_agorot=agorot,
        )
    )
    app_session.commit()


def test_the_trend_has_twelve_columns_and_a_quiet_month_is_a_zero_not_a_gap(
    app_session, studio, tenant_session
):
    """Dropping a quiet month slides every later month one place and turns a gap into a
    trend."""
    student = make_member(app_session, studio, joined_on=date(2026, 1, 1))
    _charge(app_session, studio, student, year=2026, month=11, agorot=25_000)

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert len(overview.revenue) == 12
    assert (overview.revenue[0].year, overview.revenue[0].month) == (2025, 12)
    assert overview.revenue[0].billed_agorot == 0
    assert overview.revenue[-1].billed_agorot == 25_000


def test_collected_is_the_allocation_so_a_half_paid_month_draws_half(
    app_session, studio, tenant_session
):
    student = make_member(app_session, studio, joined_on=date(2026, 1, 1))
    charge = _charge(app_session, studio, student, year=2026, month=11, agorot=25_000)
    _allocate(app_session, studio, charge, 10_000)

    overview = build_overview(tenant_session, kind="month", now=T0)
    november = overview.revenue[-1]
    assert november.billed_agorot == 25_000
    assert november.collected_agorot == 10_000
    assert november.outstanding_agorot == 15_000


def test_a_voided_charge_is_neither_revenue_nor_debt(app_session, studio, tenant_session):
    student = make_member(app_session, studio, joined_on=date(2026, 1, 1))
    _charge(app_session, studio, student, year=2026, month=11, agorot=25_000, status="void")

    overview = build_overview(tenant_session, kind="month", now=T0)
    assert overview.revenue[-1].billed_agorot == 0
    assert overview.revenue[-1].outstanding_agorot == 0


def test_average_monthly_revenue_divides_by_the_windows_own_months(
    app_session, studio, tenant_session, a_training_year
):
    """A season running September to November is three billing months, not one."""
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    for month in (9, 10, 11):
        charge = _charge(app_session, studio, student, year=2026, month=month, agorot=30_000)
        _allocate(app_session, studio, charge, 30_000)

    overview = build_overview(tenant_session, kind="season", now=T0)
    assert overview.kpi is not None
    assert overview.kpi.avg_monthly_revenue_agorot == 30_000
    assert overview.kpi.revenue_per_student_agorot == 90_000


# ── retention: per-bucket survival, cohort published ─────────────────────────────────


def test_a_student_who_has_not_had_time_to_fail_is_in_no_cohort(
    app_session, studio, tenant_session
):
    """Joined three weeks ago: has not survived three months and has not failed to.

    Counting them as a loss would make the first bar sink every time the club recruited.
    """
    make_member(app_session, studio, joined_on=date(2026, 10, 22))

    overview = build_overview(tenant_session, kind="month", now=T0)
    first = next(bucket for bucket in overview.retention if bucket.key == "m0_3")
    assert first.cohort == 0
    assert first.percent is None


def test_the_first_bucket_counts_who_made_it_past_three_months(app_session, studio, tenant_session):
    make_member(app_session, studio, joined_on=date(2026, 1, 1))  # still here
    stayer = make_member(app_session, studio, joined_on=date(2026, 1, 1), left_on=date(2026, 9, 1))
    quitter = make_member(
        app_session, studio, joined_on=date(2026, 1, 1), left_on=date(2026, 2, 1), status="left"
    )
    assert stayer.id != quitter.id

    overview = build_overview(tenant_session, kind="month", now=T0)
    first = next(bucket for bucket in overview.retention if bucket.key == "m0_3")
    assert first.cohort == 3
    assert first.retained == 2
    assert first.percent == 67


def test_retention_is_null_rather_than_zero_for_an_empty_cohort(tenant_session):
    overview = build_overview(tenant_session, kind="month", now=T0)
    assert [bucket.percent for bucket in overview.retention] == [None, None, None, None]
    assert [bucket.key for bucket in overview.retention] == ["m0_3", "m3_6", "m6_12", "m12_plus"]


# ── belt promotions: the one deliberate colour exception ─────────────────────────────


def test_every_rank_appears_lowest_first_even_with_no_promotions(
    app_session, studio, tenant_session, a_belt_ladder, a_training_year
):
    """`4g` draws seven bars. A quiet season is exactly when a manager wants to see which
    ranks stood still, so a rank that awarded nothing is a zero bar and not a missing one.
    """
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    app_session.add(
        StudentBelt(
            studio_id=studio.id,
            student_id=student.id,
            belt_rank_id=a_belt_ladder[1].id,
            awarded_on=date(2026, 10, 5),
        )
    )
    app_session.commit()

    overview = build_overview(tenant_session, kind="season", now=T0)
    assert [bar.name for bar in overview.belts] == ["לבנה", "צהובה", "שחורה"]
    assert [bar.promotions for bar in overview.belts] == [0, 1, 0]
    # The colours are DATA (D3, §5.9) and travel with the bar — the chart cannot draw
    # itself from a token.
    assert overview.belts[0].color_hex == "#fffefb"


def test_a_promotion_outside_the_window_is_not_counted(
    app_session, studio, tenant_session, a_belt_ladder, a_training_year
):
    student = make_member(app_session, studio, joined_on=date(2025, 9, 1))
    app_session.add(
        StudentBelt(
            studio_id=studio.id,
            student_id=student.id,
            belt_rank_id=a_belt_ladder[0].id,
            awarded_on=YEAR_STARTS - timedelta(days=1),
        )
    )
    app_session.commit()

    overview = build_overview(tenant_session, kind="season", now=T0)
    assert [bar.promotions for bar in overview.belts] == [0, 0, 0]


# ── the CSV ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("agorot", "expected"), [(0, "0.00"), (25_000, "250.00"), (-1_50, "-1.50")]
)
def test_shekels_is_integer_arithmetic(agorot, expected):
    assert shekels(agorot) == expected


def test_the_csv_carries_the_unmarked_rule_with_the_rate(
    app_session, studio, tenant_session, a_training_year, a_group
):
    """A file can be forwarded with the rule stripped off, so the rule is in the file."""
    student = make_member(app_session, studio, joined_on=date(2026, 9, 1))
    lesson = make_session(
        app_session,
        studio,
        a_group,
        a_training_year,
        starts_at=datetime(2026, 11, 3, 16, tzinfo=T0.tzinfo),
    )
    mark(app_session, studio, lesson, student, "present")

    body = overview_csv(build_overview(tenant_session, kind="month", now=T0))
    assert body.startswith("﻿")  # Excel decodes Hebrew only with the BOM
    assert "שיעורים שלא סומנו — אינם נספרים כהיעדרות" in body
    assert "נוכחות ממוצעת באחוזים" in body
