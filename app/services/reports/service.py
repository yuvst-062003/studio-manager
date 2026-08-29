"""Report generation service for monthly billing summaries.

**The four money cards on `4g`, and the one that read ₪0 for its whole life.** This
module compared `charge.status` against `'paid'`. `charge_status` is a CHECK constraint
over `('open', 'settled', 'void', 'written_off')` and has never contained `'paid'`, so
`settled_agorot` was structurally zero and the `נגבה` card on the reports screen showed
nothing collected however much money had arrived. Every test in `tests/reports/` asserted
`overdue + pending == total`, which stays true while the settled bucket is dead, so the
suite agreed with the bug. Fixed here, and pinned by
`test_settled_charges_land_in_the_settled_bucket`.

**`void` and `written_off` are excluded from every figure**, matching
`BillingService.payer_balance`: "a debt a manager decided not to pursue is not money the
family owes, and leaving it in makes every collection figure in the club permanently
overstated". The reports screen is where those figures are read out loud, so it is the
last place that exclusion may be forgotten. The remaining three buckets are then a
partition of the total — settled + overdue + pending == total — which the four cards on
`4g` claim visually and which a test now asserts.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select

from app.core.clock import now
from app.core.tenancy import TenantSession
from app.models.billing import Charge

#: A manager's decision that the money will not arrive. Never revenue, never debt.
CLOSED_STATUSES = ("void", "written_off")


class ReportService:
    """Generate and retrieve billing reports by period."""

    def __init__(self, session: TenantSession) -> None:
        self.session = session

    def monthly_summary(self, year: int, month: int) -> dict[str, Any]:
        """Get summary of charges for a given billing period.

        Groups charges by status and counts distinct students. Compares due_date to
        today to categorize overdue vs pending.

        Returns dict with:
        - period_year, period_month: billing period
        - total_students: count of distinct students with charges
        - total_agorot: sum of every charge still expected to settle
        - settled_agorot: sum of settled charges
        - overdue_agorot: sum of open charges past due date
        - pending_agorot: sum of open charges not yet due

        `void` and `written_off` appear in none of them — see the module docstring.
        """
        # Query all charges for this period
        stmt = select(Charge).where(
            Charge.period_year == year,
            Charge.period_month == month,
            Charge.status.notin_(CLOSED_STATUSES),
        )
        charges = self.session.execute(stmt).scalars().all()

        if not charges:
            return {
                "period_year": year,
                "period_month": month,
                "total_students": 0,
                "total_agorot": 0,
                "settled_agorot": 0,
                "overdue_agorot": 0,
                "pending_agorot": 0,
            }

        # Categorize charges by status and due date
        students = set()
        total_agorot = 0
        settled_agorot = 0
        overdue_agorot = 0
        pending_agorot = 0

        today = now().date()

        for charge in charges:
            students.add(charge.student_id)
            total_agorot += charge.amount_agorot

            if charge.status == "settled":
                settled_agorot += charge.amount_agorot
            elif charge.status == "open":
                if charge.due_date < today:
                    overdue_agorot += charge.amount_agorot
                else:
                    pending_agorot += charge.amount_agorot

        return {
            "period_year": year,
            "period_month": month,
            "total_students": len(students),
            "total_agorot": total_agorot,
            "settled_agorot": settled_agorot,
            "overdue_agorot": overdue_agorot,
            "pending_agorot": pending_agorot,
        }

    def student_charges(self, student_id: uuid.UUID) -> list[dict[str, Any]]:
        """Get all charges for a student across all periods.

        Used for invoice generation and charge history display.
        Returns list of charge details sorted by period (newest first).
        Validates that student belongs to current studio (tenant-scoped).
        """
        from app.models.people import Student

        # Verify student exists and belongs to current studio (TenantSession scope)
        stmt_student = select(Student).where(Student.id == student_id)
        student = self.session.execute(stmt_student).scalar_one_or_none()
        if not student:
            return []

        stmt = (
            select(Charge)
            .where(Charge.student_id == student_id)
            .order_by(Charge.period_year.desc(), Charge.period_month.desc())
        )
        charges = self.session.execute(stmt).scalars().all()

        return [
            {
                "charge_id": charge.id,
                "student_id": charge.student_id,
                "payer_person_id": charge.payer_person_id,
                "kind": charge.kind,
                "period_year": charge.period_year,
                "period_month": charge.period_month,
                "amount_agorot": charge.amount_agorot,
                "due_date": charge.due_date.isoformat(),
                "status": charge.status,
                "created_at": charge.created_at.isoformat(),
            }
            for charge in charges
        ]
