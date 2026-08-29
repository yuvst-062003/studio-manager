"""The shapes `GET /reports/{studio_id}/overview` returns — artboard `4g`, in one trip.

Here rather than in `app/schemas/reports.py` for the reason
`app/services/attendance/schemas.py` gives for itself: that module belongs to W5's
contract commit and carries §11.3's data-export request, the *privacy* half of M9. These
are read models over tables this wave does not touch, and this lane owns
`app/services/reports/**`. Where a Pydantic model lives has no effect on the generated
OpenAPI component, so nothing downstream can tell.

**One request for the whole screen.** Five panels driven by one period switcher is one
question asked of one window; five endpoints would let the switcher drive them out of
step for a frame, which is the argument `AttendanceReportOut` already makes for `4c`.

**Every percentage is an integer, and every nullable one means "not enough data".** The
rule comes from `app/services/attendance/report.py`: a group with no decided marks
returns `rate_percent: null` and draws **no bar**, because a bar at 0% is a claim about
children who did not fail to turn up. The same distinction is load-bearing here for
churn (nobody to leave), retention (no cohort old enough) and attendance.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.services.reports.periods import PeriodKind

#: The four tenure buckets `שימור לפי ותק` draws. A **bucket enum**, which the spec
#: (finding 4) notes nothing models: `billing.debt.aging.*` is exactly this shape for
#: debt and there was no equivalent for tenure. These are the keys, and
#: `reports.retention.bucket.*` is the copy.
RetentionBucketKey = Literal["m0_3", "m3_6", "m6_12", "m12_plus"]


class MonthlyReportSummary(BaseModel):
    """Summary of charges in a billing period.

    Moved here verbatim from `app/routers/reports.py` so the overview can reuse it
    without a second shape saying the same thing. Same class name, so the OpenAPI
    component name — and therefore the generated client — is unchanged.
    """

    period_year: int
    period_month: int
    total_students: int
    total_agorot: int
    settled_agorot: int
    overdue_agorot: int
    pending_agorot: int


class PeriodWindowOut(BaseModel):
    """The window the server actually reported on, echoed back.

    Echoed for the reason `AttendanceReportOut` echoes its range: a client should render
    what it received rather than what it asked for. Here it matters more, because
    `season` resolves against a row the client has never seen.
    """

    kind: PeriodKind
    from_date: date
    to_date: date
    #: The studio's own name for the season (`5b` lets a manager write anything). Null
    #: for `month` and `year`, whose label is the date range itself.
    season_name: str | None = None


class KpiOut(BaseModel):
    """`4g`'s KPI strip — four metrics, each a bare number plus a delta line.

    **Each predicate is spelled out here because each one has to be honest about the
    past**, and two of the obvious implementations are not:

    * `student.status` is a *current* column. Counting `status = 'active'` answers "how
      many are active now", which is the same answer for every window a manager selects.
      Membership is therefore read off the **dates**: a member on day D is a student with
      `joined_on <= D` and (`left_on IS NULL` or `left_on > D`).
    * `session.status = 'completed'` is written by a worker that was never scheduled
      until this wave, so every session that ended before this month is still
      `scheduled`. Nothing here reads it — attendance comes from
      `app/services/attendance/report.py`, which asks the clock instead.
    """

    #: Members on the window's last day, by the date predicate above.
    active_students: int
    #: Net change across the window — the artboard's `+18 מתחילת העונה`.
    active_students_delta: int
    #: Tenths of a percent, per 30 days. `3.2%` is `32`. Integer arithmetic all the way
    #: down (G2's habit, applied past money): a rate printed to one decimal must not be
    #: the residue of a float. Null when nobody was enrolled to leave.
    churn_permille: int | None = None
    #: Against `previous_window`, not against a target. A churn target is displayed on
    #: the artboard and has no key, no column and no setting — finding 7 — and inventing
    #: one here would ship a threshold nobody chose.
    churn_permille_delta: int | None = None
    #: Collected in the window, divided by the number of billing months it spans.
    avg_monthly_revenue_agorot: int
    #: The artboard's `303₪ לחניך`. Null when there are no members to divide by.
    revenue_per_student_agorot: int | None = None
    #: §5.14, and the same denominator `4c` prints: decided marks only.
    attendance_percent: int | None = None
    #: Percentage points against the previous window.
    attendance_percent_delta: int | None = None
    #: Counted and shown, **never divided by** — this is the number that lets the screen
    #: state `attendance.unmarkedExcluded` with evidence rather than as a slogan.
    attendance_unmarked_marks: int = 0
    attendance_decided_marks: int = 0
    #: Students whose status says they left and whose `left_on` is null. They cannot be
    #: placed on a timeline, so they are in no churn numerator and no retention cohort —
    #: and the count is published rather than swallowed, because a metric that quietly
    #: drops rows is a metric nobody can audit.
    undated_departures: int = 0


class RevenueMonthOut(BaseModel):
    """One column of `הכנסות מול חוב`.

    **The spec's finding 3, decided.** The chart compares collected against *debt
    remaining* while `financial.collectedVsExpected` compares against *expected*; those
    are two different numbers under one heading. Both are here, and the stack is
    collected-plus-outstanding so the column height is the billed total and the split is
    the answer to "how much of it arrived".

    `collected` is the sum of `payment_allocation`, not of charges whose status is
    `settled`: that is what `BillingService.payer_balance` counts, and it is the only one
    of the two that shows a half-paid month as half paid.
    """

    year: int
    month: int
    #: Charges raised for the period, `void` and `written_off` excluded.
    billed_agorot: int
    #: Allocated against those charges.
    collected_agorot: int
    #: `billed - collected`, floored at zero.
    outstanding_agorot: int


class RetentionBucketOut(BaseModel):
    """One row of `שימור לפי ותק` — a survival rate, with its cohort printed.

    **Per-bucket survival, not cumulative retention.** "Of the students who reached this
    much tenure, how many made it through to the end of the bucket." The cumulative form
    — share of everyone still here — is monotonically non-decreasing *by construction*,
    so it says "early churn is worst" whatever the data does, which is a chart that
    cannot be wrong and cannot teach anything either.

    **`cohort` excludes anyone who has not had time to fail.** A child who joined last
    month has not survived three months and has not failed to; counting them as a loss
    would make the first bar sink every time the club recruited. The exclusion is why
    `cohort` is published beside `percent`: a 100% bar over a cohort of two is a
    different fact from a 100% bar over a cohort of eighty.
    """

    key: RetentionBucketKey
    lower_months: int
    #: Null for `m12_plus`, which is open-ended: reached twelve months, still enrolled.
    upper_months: int | None = None
    cohort: int
    retained: int
    #: Null when the cohort is empty. Draws **no bar** — same rule as a group with no
    #: decided marks on `4c`.
    percent: int | None = None


class BeltPromotionOut(BaseModel):
    """One bar of `קידומי חגורה בעונה`.

    ▲ **This is the one place `4g` knowingly breaks the monochrome-plus-one-accent rule,
    and it is defensible**: belt colours are data (D3, §5.9), configured per studio in
    `belt_rank.color_hex`, not decoration chosen by a designer. A promotions chart whose
    bars were not belt-coloured would be harder to read, not more restrained. Whoever
    ports this screen to another surface must carry the exception across deliberately —
    it is not a licence to colour anything else.

    `secondary_color_hex` rides along because `5b` allows bi-colour grades and a chart
    that could not draw one would push the next lane into inventing its own bar.
    """

    belt_rank_id: uuid.UUID
    #: `5b` lets a manager rename these, so it is data and never copy.
    name: str
    color_hex: str
    secondary_color_hex: str | None = None
    order_index: int
    promotions: int


class ReportsOverviewOut(BaseModel):
    """Artboard `4g`, whole.

    `period` is null exactly when the switcher asked for a season the studio does not
    have. Everything else is then empty and the screen renders `reports.empty`.
    """

    period: PeriodWindowOut | None = None
    #: Null with `period`, for the same reason: there is no window to measure.
    kpi: KpiOut | None = None
    #: The four money cards this screen shipped with, kept and demoted — see
    #: `overview.build_overview`. Reported for the window's **last** month.
    billing_month: MonthlyReportSummary | None = None
    revenue: list[RevenueMonthOut] = Field(default_factory=list)
    retention: list[RetentionBucketOut] = Field(default_factory=list)
    belts: list[BeltPromotionOut] = Field(default_factory=list)
    #: Whether anything at all happened in the window. Computed here rather than by each
    #: client, so `reports.empty` cannot be shown by one surface and not another.
    has_data: bool = False
