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
    app_session,
    as_manager: Caller,
    twelve_students_mixed_billing,
):
    """§2.7 of the 2026-09-02 findings register: this used to hedge between `queued` and
    `failed` because `NotificationService.enqueue` supposedly raised `NotImplementedError`
    before COMMS shipped in W5 -- it never has, so that branch was dead and the real
    contract is that a report send always reaches the seam and always queues."""
    from app.models.comms import Notification

    response = client.post(
        f"/api/v1/reports/{as_manager.studio_id}/send-monthly",
        json={
            "year": 2026,
            "month": 10,
            "to_person_id": str(as_manager.person_id),
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "queued"
    assert data["notification_id"] is not None

    note = app_session.get(Notification, data["notification_id"])
    assert note is not None
    assert note.kind == "report.monthly"


# ── artboard `4g`'s two endpoints ────────────────────────────────────────────────────


def test_overview_is_one_round_trip_for_the_whole_screen(client, as_manager: Caller):
    """Five panels, one request. Five endpoints would let the period switcher drive them
    out of step for a frame — the argument `GET /attendance/report` makes for `4c`."""
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview?period=month",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period"]["kind"] == "month"
    assert set(body) >= {"period", "kpi", "billing_month", "revenue", "retention", "belts"}
    assert len(body["revenue"]) == 12


def test_overview_defaults_to_the_month(client, as_manager: Caller):
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview", headers=as_manager.headers
    )
    assert response.status_code == 200
    assert response.json()["period"]["kind"] == "month"


def test_overview_rejects_a_period_that_is_not_one_of_the_three(client, as_manager: Caller):
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview?period=fortnight",
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_overview_requires_a_manager(client):
    response = client.get(
        "/api/v1/reports/00000000-0000-0000-0000-000000000000/overview?period=month"
    )
    assert response.status_code == 401


def test_a_season_the_studio_never_operated_in_is_a_null_period_not_a_404(
    client, as_manager: Caller
):
    """`reports.empty` is written for exactly this, and an error would tell a manager
    something broke when nothing did."""
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview?period=season",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["period"] is None


def test_the_csv_export_is_synchronous_and_attaches(client, as_manager: Caller):
    """§11.3's five-state request object is a different thing for a different job; `4g`
    says to treat this button as 'a simple synchronous action'."""
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview.csv?period=month",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert response.text.startswith("﻿")


def test_the_csv_export_of_a_season_that_does_not_exist_is_no_content(client, as_manager: Caller):
    """An empty file with headers opens in Excel looking like a report of zeroes."""
    response = client.get(
        f"/api/v1/reports/{as_manager.studio_id}/overview.csv?period=season",
        headers=as_manager.headers,
    )
    assert response.status_code == 204
