"""`4g`'s three-way switcher, resolved on the server.

**Finding 2 of the spec, decided.** `4g` draws `חודש / עונה / שנה` and
`reports.period.*` carries `thisMonth`, `lastMonth`, `last12Months` and `custom` — four
values, none of which is *season* or *year*. Two taxonomies, and one of them had to win.

The artboard's wins, because **`עונה` turns out to have a model**: `training_year`
(§4.3, §5.15) is the spine of the rollover — one active row per studio, with `starts_on`
and `ends_on`. A season is therefore a real object with real dates rather than a word on
a mock, and choosing the key list instead would have thrown that away to keep four
strings that describe a different control (`custom` implies a range picker `4g` does not
draw). The three new keys are `period.month`, `period.season` and `period.year`;
`period.thisMonth` and the rest stay in the namespace, unused by this screen.

**A season can be unresolvable, and that is a real state, not an error.** A studio with
no active training year — or one whose year opens next month — has no season to report
on. `resolve_window` returns `None`, the payload carries a null period, and the screen
renders `reports.empty` (`אין נתונים לתקופה שנבחרה`), which is exactly the case the spec
describes: "Selecting a season a studio did not operate in lands here."

**Every boundary is a Jerusalem calendar day** (G3). `now()` is a UTC instant and the
first thing this module does with it is ask what day it is in the studio's zone, because
a window built in UTC starts and ends two or three hours off and silently drops the
21:00 lessons at each edge — the same reasoning
`app/services/attendance/report.py::_day_bounds` gives.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.models.schedule import TrainingYear
from app.services.people.group_days import STUDIO_ZONE

PeriodKind = Literal["month", "season", "year"]

#: How many whole calendar months `year` covers, counting the current one.
YEAR_MONTHS = 12

#: The revenue trend is twelve columns whatever the switcher says — the panel is titled
#: `מגמה — 12 חודשים` and the artboard draws twelve. What the switcher moves is where the
#: twelve *end*.
TREND_MONTHS = 12


@dataclass(frozen=True)
class Window:
    """A resolved reporting window, inclusive at both ends.

    `label_source` is what the screen should print beside the switcher: a season carries
    the studio's own name for it (`תשפ"ז`, `2026/27` — `5b` lets a manager write
    anything), while a month or a year is a date range the client formats itself.
    """

    kind: PeriodKind
    from_date: date
    to_date: date
    season_name: str | None = None

    @property
    def days(self) -> int:
        """Inclusive length. A one-day window is 1, never 0 — it is a divisor."""
        return (self.to_date - self.from_date).days + 1


def today_in_studio(now: datetime) -> date:
    """The Jerusalem calendar day `now` falls on. G3, at the one edge that decides."""
    return now.astimezone(STUDIO_ZONE).date()


def add_months(anchor: date, months: int) -> date:
    """`anchor` shifted by whole months, clamped into the target month.

    31 January plus one month is 28 February, not 3 March. Retention buckets are stated
    in months and a child who joined on the 31st must not drift a day later into every
    bucket boundary for the rest of their membership.
    """
    index = anchor.year * 12 + (anchor.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(anchor.day, _days_in_month(year, month)))


def _days_in_month(year: int, month: int) -> int:
    first_next = date(year + (month == 12), month % 12 + 1, 1)
    return (first_next - date(year, month, 1)).days


def month_start(day: date) -> date:
    return day.replace(day=1)


def month_end(year: int, month: int) -> date:
    return date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)


def resolve_window(session: OrmSession, *, kind: PeriodKind, now: datetime) -> Window | None:
    """The window `4g`'s switcher asked for, or `None` when there is not one.

    * `month` — the current Jerusalem month so far. The first of the month to today, not
      a whole month: a report on 12 November that claimed the whole of November would be
      dividing by days that have not happened.
    * `season` — the active `training_year`, clipped at today for the same reason.
    * `year` — twelve whole calendar months ending with the current one, so its months
      line up exactly with the twelve columns of the revenue trend beside it.
    """
    today = today_in_studio(now)
    if kind == "month":
        return Window(kind=kind, from_date=month_start(today), to_date=today)
    if kind == "year":
        return Window(
            kind=kind,
            from_date=month_start(add_months(month_start(today), -(YEAR_MONTHS - 1))),
            to_date=today,
        )

    year_row = session.execute(
        select(TrainingYear).where(TrainingYear.status == "active")
    ).scalar_one_or_none()
    if year_row is None or year_row.starts_on > today:
        # No active year, or one that opens later. Both are "no data for the selected
        # period" rather than a failure — see the module docstring.
        return None
    return Window(
        kind=kind,
        from_date=year_row.starts_on,
        to_date=min(year_row.ends_on, today),
        season_name=year_row.name,
    )


def previous_window(window: Window) -> Window:
    """The same length of time, immediately before — what every delta is measured against.

    `4g` prints a delta under each KPI and models none of them. The artboard's own four
    are heterogeneous (`+18 מתחילת העונה`, `מעל היעד (2.5%)`, `303₪ לחניך`, `ללא שינוי`)
    and one of them compares against **a churn target that has no key, no column and no
    setting** — finding 7. Rather than invent that setting, churn and attendance are
    compared against the window before them, which needs no model and cannot be wrong.
    """
    end = window.from_date - timedelta(days=1)
    return Window(
        kind=window.kind,
        from_date=end - timedelta(days=window.days - 1),
        to_date=end,
        season_name=window.season_name,
    )


def billing_months(window: Window) -> list[tuple[int, int]]:
    """The `(period_year, period_month)` pairs a window's money is billed under.

    **Overlap, not containment.** A season that opens on 5 September still owes a
    September tuition charge, and a rule keyed on the first of the month would drop it
    from every revenue figure on the screen while the debt sat in the ledger. For the
    `month` and `year` windows — which both start on a first — the two rules agree.
    """
    months: list[tuple[int, int]] = []
    cursor = month_start(window.from_date)
    while cursor <= window.to_date:
        months.append((cursor.year, cursor.month))
        cursor = add_months(cursor, 1)
    return months


def trend_months(window: Window) -> list[tuple[int, int]]:
    """The twelve columns of `הכנסות מול חוב`, oldest first.

    Oldest first is the DOM order and it is deliberate: `4g`'s RTL section says the
    earliest month sits at the reading start and "the trend reads oldest-to-newest in
    reading order. Do not reverse it." An RTL document lays a row out from the right on
    its own, so the only way to get this wrong is to reverse the list in code.
    """
    last = month_start(window.to_date)
    return [
        (m.year, m.month)
        for m in (add_months(last, offset) for offset in range(-(TREND_MONTHS - 1), 1))
    ]
