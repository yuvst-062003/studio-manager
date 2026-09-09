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

    def by_class(self, year: int, month: int) -> dict[str, Any]:
        """The same month, split by the class each charge was raised for.

        Owner, 2026-09-09: "Reports — per class." Per-class pricing made judo and karate
        bill separately, so "what did each earn" became a question the club can ask.

        **The total is its own DISTINCT, never the sum of the rows.** A child billed for
        judo AND karate is two charges and appears in two rows -- that is the feature
        working -- but they are one human. Adding the rows up would report a membership the
        club does not have, and the error would grow with every family that takes a second
        discipline, which is precisely the population this feature created. Money is
        different and DOES add up: two charges are two real amounts.

        **A charge with no class gets its own row rather than disappearing.**
        `charge.class_id` is nullable: registration fees, manual charges and every tuition
        charge raised before per-class pricing carry none. Dropping them would leave the
        rows silently failing to add up to the club's income -- the worst kind of wrong on
        a money screen. It sorts last, after the named classes.

        The three money buckets mean exactly what they mean on `monthly_summary`, and are
        computed the same way from the same rows: two report screens disagreeing about one
        month is how a manager stops trusting both.
        """
        rows = (
            self.session.execute(
                select(Charge).where(
                    Charge.period_year == year,
                    Charge.period_month == month,
                    Charge.status.notin_(CLOSED_STATUSES),
                )
            )
            .scalars()
            .all()
        )

        today = now().date()

        def _empty() -> dict[str, Any]:
            return {
                "students": set(),
                "total_agorot": 0,
                "settled_agorot": 0,
                "overdue_agorot": 0,
                "pending_agorot": 0,
            }

        buckets: dict[uuid.UUID | None, dict[str, Any]] = {}
        club = _empty()
        for charge in rows:
            bucket = buckets.setdefault(charge.class_id, _empty())
            for target in (bucket, club):
                target["students"].add(charge.student_id)
                target["total_agorot"] += charge.amount_agorot
                if charge.status == "settled":
                    target["settled_agorot"] += charge.amount_agorot
                elif charge.status == "open":
                    if charge.due_date < today:
                        target["overdue_agorot"] += charge.amount_agorot
                    else:
                        target["pending_agorot"] += charge.amount_agorot

        names = self._class_names(set(buckets) - {None})

        def _out(class_id: uuid.UUID | None, bucket: dict[str, Any]) -> dict[str, Any]:
            return {
                "class_id": class_id,
                "class_name": names.get(class_id) if class_id is not None else None,
                "students": len(bucket["students"]),
                "total_agorot": bucket["total_agorot"],
                "settled_agorot": bucket["settled_agorot"],
                "overdue_agorot": bucket["overdue_agorot"],
                "pending_agorot": bucket["pending_agorot"],
            }

        # Named classes by name, then the unassigned row. `None` cannot be compared to a
        # string, so it is separated rather than sorted with a key that would raise.
        named = sorted(
            (cid for cid in buckets if cid is not None), key=lambda cid: names.get(cid) or ""
        )
        out_rows = [_out(cid, buckets[cid]) for cid in named]
        if None in buckets:
            out_rows.append(_out(None, buckets[None]))

        return {
            "period_year": year,
            "period_month": month,
            "rows": out_rows,
            "total": _out(None, club) | {"class_id": None, "class_name": None},
        }

    def _class_names(self, class_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not class_ids:
            return {}
        from app.models.structure import Class as StudioClass

        return {
            class_id: name
            for class_id, name in self.session.execute(
                select(StudioClass.id, StudioClass.name).where(StudioClass.id.in_(class_ids))
            ).all()
        }

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
