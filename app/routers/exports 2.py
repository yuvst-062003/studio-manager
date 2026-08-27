"""F7b -- the two exports whose buttons shipped dead.

CSV, UTF-8 **with a BOM** so Excel opens Hebrew correctly, amounts in shekels formatted
from agorot at this boundary and nowhere else -- the ledger stays integer agorot (G2),
and the division below is integer arithmetic, never a float.

`app/routers/privacy.py` has the async-job pattern for exports that might time out; a
month of payments and a range of attendance rows are both bounded by club size and
stream directly. Revisit if a club outgrows that.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.auth_context import ManagerOrOwner
from app.core.tenancy import TenantSessionDep
from app.models.attendance import Attendance
from app.models.billing import Payment
from app.models.people import Student
from app.models.person import Person
from app.models.schedule import Session as SessionRow
from app.models.structure import Group

router = APIRouter(prefix="/exports", tags=["billing", "reports", "exports"])

STUDIO_TZ = ZoneInfo("Asia/Jerusalem")

#: §4.3's payment methods, in the words a bookkeeper files them under.
METHOD_LABELS = {
    "upay_card": "כרטיס אשראי",
    "cash": "מזומן",
    "cheque": "צ'ק",
    "bank_transfer": "העברה בנקאית",
    "standing_order": "הוראת קבע",
}


def shekels(agorot: int) -> str:
    """Integer agorot -> a shekel string, in integer arithmetic. Negative-safe."""
    sign = "-" if agorot < 0 else ""
    magnitude = abs(agorot)
    return f"{sign}{magnitude // 100}.{magnitude % 100:02d}"


def _csv_response(filename: str, header: list[str], rows: list[list[str]]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        # The BOM is what makes Excel decode Hebrew; without it a bookkeeper opens
        # mojibake and blames the club.
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/accountant")
def accountant_export(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    year: Annotated[int, Query(ge=2000, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
) -> Response:
    """`ייצוא לרו"ח` -- every payment received in the Jerusalem month, one row each.

    Received, not charged: a bookkeeper files income by when money arrived. Reversed
    payments are included with their reversal marked -- an export that silently dropped
    a reversed row would disagree with the bank statement it sits beside.
    """
    month_start = datetime.combine(date(year, month, 1), time.min, tzinfo=STUDIO_TZ)
    next_month = date(year + (month == 12), month % 12 + 1, 1)
    month_end = datetime.combine(next_month, time.min, tzinfo=STUDIO_TZ)

    rows = session.execute(
        select(Payment, Person)
        .join(Person, Person.id == Payment.payer_person_id)
        .where(Payment.received_at >= month_start, Payment.received_at < month_end)
        .order_by(Payment.received_at)
    ).all()

    return _csv_response(
        f"payments-{year}-{month:02d}.csv",
        ["תאריך", "משלם", "אמצעי", 'סכום בש"ח', "קבלה", "בוטל"],
        [
            [
                payment.received_at.astimezone(STUDIO_TZ).date().isoformat(),
                f"{person.first_name} {person.last_name}",
                METHOD_LABELS.get(payment.method, payment.method),
                shekels(payment.amount_agorot),
                payment.external_receipt_number or "",
                payment.reversal_reason or "",
            ]
            for payment, person in rows
        ],
    )


@router.get("/attendance")
def attendance_export(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> Response:
    """`ייצוא דוח נוכחות` -- one row per mark in the range. Statuses stay the product's
    own vocabulary; no health data of any kind rides along."""
    if to_date < from_date or (to_date - from_date) > timedelta(days=400):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "bad_range", "message": "from must precede to, within 400 days"},
        )
    range_start = datetime.combine(from_date, time.min, tzinfo=STUDIO_TZ)
    range_end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=STUDIO_TZ)

    rows = session.execute(
        select(
            SessionRow.starts_at,
            Group.name,
            Person.first_name,
            Person.last_name,
            Attendance.status,
        )
        .select_from(Attendance)
        .join(SessionRow, SessionRow.id == Attendance.session_id)
        .join(Group, Group.id == SessionRow.group_id)
        .join(Student, Student.id == Attendance.student_id)
        .join(Person, Person.id == Student.person_id)
        .where(SessionRow.starts_at >= range_start, SessionRow.starts_at < range_end)
        .order_by(SessionRow.starts_at)
    ).all()

    return _csv_response(
        f"attendance-{from_date.isoformat()}-{to_date.isoformat()}.csv",
        ["תאריך", "קבוצה", "חניך", "סטטוס"],
        [
            [
                starts_at.astimezone(STUDIO_TZ).date().isoformat(),
                group_name,
                f"{first} {last}",
                item_status,
            ]
            for starts_at, group_name, first, last, item_status in rows
        ],
    )
