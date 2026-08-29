"""ReportService tests for monthly billing summaries."""

from datetime import date

from app.models.billing import Charge
from app.services.reports import ReportService
from tests.reports.conftest import MONTHLY_AGOROT, NOVEMBER_PERIOD, OCTOBER_PERIOD


def test_monthly_summary_empty_period(tenant_session):
    """Requesting a period with no charges returns zero totals."""
    service = ReportService(tenant_session)
    result = service.monthly_summary(2026, 12)  # December has no charges in fixture

    assert result["period_year"] == 2026
    assert result["period_month"] == 12
    assert result["total_students"] == 0
    assert result["total_agorot"] == 0
    assert result["settled_agorot"] == 0
    assert result["overdue_agorot"] == 0
    assert result["pending_agorot"] == 0


def test_monthly_summary_october_has_charges(tenant_session, twelve_students_mixed_billing):
    """October period has 8 students with charges (4 from each batch)."""
    service = ReportService(tenant_session)
    result = service.monthly_summary(*OCTOBER_PERIOD)

    # Fixture creates 4 Oct charges from first batch and 4 from second batch
    assert result["total_students"] == 8
    # All October charges are 25,000 agorot each
    assert result["total_agorot"] == 8 * 25_000
    # Charges exist; whether overdue/pending depends on current date
    assert result["overdue_agorot"] + result["pending_agorot"] == 8 * 25_000


def test_monthly_summary_november_has_pending(tenant_session, twelve_students_mixed_billing):
    """November period has 4 students with pending charges."""
    service = ReportService(tenant_session)
    result = service.monthly_summary(*NOVEMBER_PERIOD)

    assert result["total_students"] == 4
    assert result["total_agorot"] == 4 * 25_000
    # Charges exist; whether overdue/pending depends on current date
    assert result["overdue_agorot"] + result["pending_agorot"] == 4 * 25_000


# ── the status column, spelled the way the database spells it ────────────────────
#
# `charge_status` is a CHECK constraint over ('open', 'settled', 'void', 'written_off').
# `monthly_summary` compared against `'paid'`, which is not one of them — so `נגבה` on the
# reports screen has read ₪0 for every studio since the day the screen shipped, and no test
# noticed because every fixture charge was `open`. The three tests above assert
# `overdue + pending == total`, which is *true* while the settled bucket is dead.


def _settled_october_charge(app_session, studio, payer_person_id, student_id):
    charge = Charge(
        studio_id=studio.id,
        payer_person_id=payer_person_id,
        student_id=student_id,
        kind="registration",
        period_year=OCTOBER_PERIOD[0],
        period_month=OCTOBER_PERIOD[1],
        amount_agorot=MONTHLY_AGOROT,
        due_date=date(2026, 10, 31),
        status="settled",
        created_by="manual",
    )
    app_session.add(charge)
    app_session.commit()
    return charge


def test_settled_charges_land_in_the_settled_bucket(
    app_session, studio, tenant_session, twelve_students_mixed_billing
):
    """A charge whose status is `settled` is money the club collected."""
    first = twelve_students_mixed_billing[0]
    _settled_october_charge(app_session, studio, first.payer_person_id, first.student_id)

    result = ReportService(tenant_session).monthly_summary(*OCTOBER_PERIOD)

    assert result["settled_agorot"] == MONTHLY_AGOROT
    assert result["total_agorot"] == 9 * MONTHLY_AGOROT
    # The four cards are a partition of the total, so they must add up to it.
    assert (
        result["settled_agorot"] + result["overdue_agorot"] + result["pending_agorot"]
        == result["total_agorot"]
    )


def test_voided_charges_are_not_expected_revenue(
    app_session, studio, tenant_session, twelve_students_mixed_billing
):
    """`void` and `written_off` are a manager deciding the money will not arrive.

    `BillingService.payer_balance` already excludes both from `charged` — "a debt a manager
    decided not to pursue is not money the family owes, and leaving it in makes every
    collection figure in the club permanently overstated". The same sentence is true of the
    reports screen, which is where those figures are read.
    """
    first = twelve_students_mixed_billing[0]
    charge = _settled_october_charge(app_session, studio, first.payer_person_id, first.student_id)
    charge.status = "void"
    app_session.commit()

    result = ReportService(tenant_session).monthly_summary(*OCTOBER_PERIOD)

    assert result["total_agorot"] == 8 * MONTHLY_AGOROT
    assert result["settled_agorot"] == 0
    assert (
        result["settled_agorot"] + result["overdue_agorot"] + result["pending_agorot"]
        == result["total_agorot"]
    )
