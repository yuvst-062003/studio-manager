"""ReportService tests for monthly billing summaries."""

from app.services.reports import ReportService
from tests.reports.conftest import NOVEMBER_PERIOD, OCTOBER_PERIOD


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
