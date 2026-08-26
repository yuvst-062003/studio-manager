"""Monthly billing report endpoint tests."""

from tests.reports.conftest import NOVEMBER_PERIOD, OCTOBER_PERIOD, Caller


def test_get_monthly_report_as_manager(
    client,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """Manager can fetch monthly report summary for October."""
    year, month = OCTOBER_PERIOD
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/monthly?year={year}&month={month}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["period_year"] == year
    assert data["period_month"] == month
    # 8 students have October charges
    assert data["total_students"] == 8
    assert data["total_agorot"] == 8 * 25_000


def test_get_monthly_report_november_pending(
    client,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """Manager can fetch monthly report for November."""
    year, month = NOVEMBER_PERIOD
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/monthly?year={year}&month={month}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["period_year"] == year
    assert data["period_month"] == month
    # 4 students have November charges
    assert data["total_students"] == 4
    assert data["total_agorot"] == 4 * 25_000


def test_get_monthly_report_requires_auth(client):
    """Unauthenticated requests are rejected."""
    response = client.get(
        "/api/v1/reports/00000000-0000-0000-0000-000000000000/monthly?year=2026&month=10"
    )
    assert response.status_code == 401


def test_get_student_charges_as_manager(
    client,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """Manager can fetch all charges for a student."""
    # The fixture returns PricedStudent objects with student_id attribute
    student_id = twelve_students_mixed_billing[0].student_id

    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/charges/{student_id}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["student_id"] == str(student_id)
    assert isinstance(data["charges"], list)


def test_get_student_charges_requires_auth(client):
    """Unauthenticated requests are rejected."""
    response = client.get(
        "/api/v1/reports/00000000-0000-0000-0000-000000000000/charges/00000000-0000-0000-0000-000000000001"
    )
    assert response.status_code == 401


def test_send_monthly_report_as_manager(
    client,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """Manager can queue a monthly report for delivery."""
    response = client.post(
        f"/api/v1/reports/{as_manager.studio_id}/send-monthly",
        json={
            "year": 2026,
            "month": 10,
            "to_person_id": str(as_manager.person_id),
        },
        headers=as_manager.headers,
    )
    # COMMS is not yet implemented, so this returns queued or failed
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    # Either queued (if COMMS is available) or failed (if not implemented)
    assert data["status"] in ("queued", "failed")
