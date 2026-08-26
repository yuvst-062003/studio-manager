"""Verify lane REPORTS fixtures build without error."""

from tests.reports.conftest import Caller, PricedStudent


def test_the_lane_fixtures_build(
    studio,
    as_owner: Caller,
    as_manager: Caller,
    a_price_plan,
    twelve_students_mixed_billing: tuple[PricedStudent, ...],
    tenant_session,
):
    """Fixtures build. Studio has 12 students, mixed billing states."""
    assert studio is not None
    assert as_owner.token is not None
    assert as_manager.token is not None
    assert a_price_plan is not None
    assert len(twelve_students_mixed_billing) == 12
