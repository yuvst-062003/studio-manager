"""Monthly billing report endpoint tests."""

from tests.reports.conftest import Caller


def test_get_monthly_report_as_manager(
    client,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """Manager can fetch monthly report summary for a studio."""
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/monthly?year=2026&month=10",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["period_year"] == 2026
    assert data["period_month"] == 10
    # TODO: Verify counts once implementation fills them in
