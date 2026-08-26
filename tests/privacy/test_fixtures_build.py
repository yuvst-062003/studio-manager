"""Verify lane PRIVACY fixtures build without error."""

from tests.privacy.conftest import Caller, PricedStudent


def test_the_lane_fixtures_build(
    studio,
    as_owner: Caller,
    as_manager: Caller,
    a_price_plan,
    a_family_with_data: tuple[PricedStudent, ...],
    tenant_session,
):
    """Fixtures build. Studio has a family with two children and billing data."""
    assert studio is not None
    assert as_owner.token is not None
    assert as_manager.token is not None
    assert a_price_plan is not None
    assert len(a_family_with_data) == 2
