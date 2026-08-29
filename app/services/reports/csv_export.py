"""`ייצוא CSV` — the button on `4g`'s header bar, as a plain synchronous file.

**Deliberately not §11.3's request object.** W5 gives a *data-export* request five states —
pending, running, completed, expired, failed — because it assembles a child's entire
record, health declarations included, in a worker and hands back a time-limited link.
`4g`'s button is a manager downloading the numbers already rendered on the screen in
front of them. The spec is explicit: "Treat `ייצוא CSV` here as a simple synchronous
action, not the W5 request object." Wiring this button to `data_export_request` would
give a manager a five-state machine and an expiring link for a file the server can build
in one query round and hand over in the same response.

**UTF-8 with a BOM**, the same as `app/routers/exports.py`: without it Excel decodes the
Hebrew as mojibake and a bookkeeper blames the club. Amounts are formatted into shekels
**here and nowhere else** — the ledger stays integer agorot (G2), and the division below
is integer arithmetic rather than a float.

**Four blocks, blank-line separated, each with its own header row.** A single wide table
would need a column for every metric and a mostly-empty grid; four small tables are what
somebody opening this in Excel can actually sort and chart. The labels are Hebrew and
authored on the server, which is the same call `exports.py` made for `METHOD_LABELS`: a
CSV is a file, not a screen, and it has no locale to read.
"""

from __future__ import annotations

import csv
import io

from app.services.reports.periods import Window
from app.services.reports.schemas import ReportsOverviewOut

#: `4g`'s four tenure rows, in the order the artboard draws them.
BUCKET_LABELS = {
    "m0_3": "עד 3 חודשים",
    "m3_6": "3–6 חודשים",
    "m6_12": "6–12 חודשים",
    "m12_plus": "מעל שנה",
}


def shekels(agorot: int) -> str:
    """Integer agorot -> a shekel string, in integer arithmetic. Negative-safe.

    Duplicated from `app/routers/exports.py` rather than imported: that module is a
    router, and a service importing from one inverts the dependency this codebase keeps
    ("business logic lives in services; routers stay thin"). Four lines is a cheaper
    price than that inversion, and both copies are pinned by their own test.
    """
    sign = "-" if agorot < 0 else ""
    magnitude = abs(agorot)
    return f"{sign}{magnitude // 100}.{magnitude % 100:02d}"


def _permille(value: int | None) -> str:
    """Tenths of a percent -> `3.2`. Integer arithmetic, so the printed digit is the
    stored one rather than the nearest float to it."""
    if value is None:
        return ""
    sign = "-" if value < 0 else ""
    magnitude = abs(value)
    return f"{sign}{magnitude // 10}.{magnitude % 10}"


def overview_filename(window: Window) -> str:
    return f"reports-{window.from_date.isoformat()}-{window.to_date.isoformat()}.csv"


def overview_csv(overview: ReportsOverviewOut) -> str:
    """The whole screen as one file, BOM included."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if overview.period is not None:
        writer.writerow(
            ["תקופה", overview.period.from_date.isoformat(), overview.period.to_date.isoformat()]
        )
        writer.writerow([])

    if overview.kpi is not None:
        kpi = overview.kpi
        writer.writerow(["מדד", "ערך"])
        writer.writerow(["חניכים פעילים", kpi.active_students])
        writer.writerow(["שינוי נטו", kpi.active_students_delta])
        writer.writerow(["נשירה חודשית באחוזים", _permille(kpi.churn_permille)])
        writer.writerow(["הכנסה חודשית ממוצעת", shekels(kpi.avg_monthly_revenue_agorot)])
        writer.writerow(
            [
                "הכנסה לחניך",
                ""
                if kpi.revenue_per_student_agorot is None
                else shekels(kpi.revenue_per_student_agorot),
            ]
        )
        writer.writerow(
            [
                "נוכחות ממוצעת באחוזים",
                "" if kpi.attendance_percent is None else kpi.attendance_percent,
            ]
        )
        # §5.14, in the file as well as on the screen. A CSV that published the rate
        # without the denominator beside it would be the one artefact of this screen that
        # can be forwarded with the rule stripped off.
        writer.writerow(["סימוני נוכחות שנספרו", kpi.attendance_decided_marks])
        writer.writerow(["שיעורים שלא סומנו — אינם נספרים כהיעדרות", kpi.attendance_unmarked_marks])
        writer.writerow(["עזיבות ללא תאריך — אינן נכללות בחישוב", kpi.undated_departures])
        writer.writerow([])

    if overview.revenue:
        writer.writerow(["חודש", 'חויב בש"ח', 'נגבה בש"ח', 'נותר בחוב בש"ח'])
        for row in overview.revenue:
            writer.writerow(
                [
                    f"{row.year}-{row.month:02d}",
                    shekels(row.billed_agorot),
                    shekels(row.collected_agorot),
                    shekels(row.outstanding_agorot),
                ]
            )
        writer.writerow([])

    if overview.retention:
        writer.writerow(["ותק", "מדגם", "נשארו", "אחוז שימור"])
        for bucket in overview.retention:
            writer.writerow(
                [
                    BUCKET_LABELS[bucket.key],
                    bucket.cohort,
                    bucket.retained,
                    "" if bucket.percent is None else bucket.percent,
                ]
            )
        writer.writerow([])

    if overview.belts:
        writer.writerow(["חגורה", "קידומים"])
        for bar in overview.belts:
            writer.writerow([bar.name, bar.promotions])

    return "\ufeff" + buffer.getvalue()
