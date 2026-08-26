"""§5.10's price plans and product catalogue.

Plans are versioned, never edited in place: §5.15's rollover reviews prices with old plans
CLOSED, not overwritten, because a charge raised last year must still be explicable by the
plan that was in force when it was raised.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.billing.catalogue import CatalogueService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from tests.billing.conftest import MONTHLY_AGOROT


def test_closing_a_plan_opens_the_replacement_without_touching_the_old_amount(
    tenant_session, studio, a_price_plan
):
    """The whole point of versioning. After a price rise, last month's charge must still be
    explicable: the old row keeps its amount and gains an `active_to`."""
    service = CatalogueService(tenant_session)
    new_plan = service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    old = service.get_price_plan(a_price_plan)
    assert old.active_to == date(2026, 12, 31)
    assert old.monthly_amount_agorot == MONTHLY_AGOROT
    assert new_plan.active_from == date(2027, 1, 1)
    assert new_plan.monthly_amount_agorot == 32_000
    assert new_plan.active_to is None


def test_the_replacement_inherits_what_was_not_changed(tenant_session, studio, a_price_plan):
    """A price rise is a price rise. Losing `sessions_per_week` would silently reclassify
    the plan's training volume -- which is what C11 prices by."""
    service = CatalogueService(tenant_session)
    new_plan = service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    old = service.get_price_plan(a_price_plan)
    assert new_plan.sessions_per_week == old.sessions_per_week
    assert new_plan.name == old.name
    assert new_plan.registration_fee_agorot == old.registration_fee_agorot


def test_a_closed_plan_cannot_be_closed_twice(tenant_session, studio, a_price_plan):
    """A second close would leave two open successors and no way to say which priced a
    charge."""
    service = CatalogueService(tenant_session)
    service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    with pytest.raises(ConflictError):
        service.close_price_plan(
            a_price_plan, closes_on=date(2027, 1, 31), replacement_amount_agorot=35_000
        )


def test_a_plan_cannot_close_before_it_opened(tenant_session, studio, a_price_plan):
    """`price_plan_active_range` is a CHECK constraint; this is the same rule refused with a
    message a manager can read rather than an IntegrityError."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).close_price_plan(
            a_price_plan, closes_on=date(2026, 1, 1), replacement_amount_agorot=32_000
        )


def test_a_negative_price_is_refused(tenant_session, studio, a_price_plan):
    """`price_plan_monthly_non_negative`. A negative monthly amount would make the billing
    run pay families to attend."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).close_price_plan(
            a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=-100
        )


def test_an_unknown_plan_is_not_found(tenant_session, studio):
    import uuid

    with pytest.raises(NotFoundError):
        CatalogueService(tenant_session).get_price_plan(uuid.uuid4())


def test_a_product_has_a_price_and_no_stock_count(tenant_session, studio):
    """§4.3 and §5.10 both say it outright: 'inventory is a different product'. Asserted
    against the table too, so a `quantity` column added later fails here rather than
    shipping."""
    from app.models.billing import Product

    product = CatalogueService(tenant_session).create_product(
        studio.id, name="גי מידה 140", price_agorot=18_000, description=None
    )
    assert product.price_agorot == 18_000
    assert "quantity" not in Product.__table__.c
    assert "stock" not in Product.__table__.c


def test_deactivating_a_product_keeps_it_for_history(tenant_session, studio):
    """`is_active`, never a DELETE. A charge raised for an item the club stopped selling
    still has to render its name."""
    service = CatalogueService(tenant_session)
    product = service.create_product(studio.id, name="חגורה", price_agorot=6_000, description=None)
    service.update_product(product.id, is_active=False)
    assert service.get_product(product.id).is_active is False
    rows, _ = service.list_products(include_inactive=True)
    assert [row.id for row in rows] == [product.id]
    rows, _ = service.list_products(include_inactive=False)
    assert rows == []


def test_a_product_with_a_negative_price_is_refused(tenant_session, studio):
    """`product_price_non_negative`. Selling an item for a negative amount is a credit, and
    §5.10 has a shape for that -- a manual charge with a mandatory reason."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).create_product(
            studio.id, name="שלילי", price_agorot=-1, description=None
        )


def test_plans_list_current_first_then_closed(tenant_session, studio, a_price_plan):
    """`5a` renders the live plan above the history. Ordered by `active_from` descending so
    the answer does not depend on insertion order."""
    service = CatalogueService(tenant_session)
    service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    rows, _ = service.list_price_plans()
    assert [row.active_to for row in rows] == [None, date(2026, 12, 31)]
