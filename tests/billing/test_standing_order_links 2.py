"""Part A of the 2026-08-27 payment-routes spec: the הוראת קבע link a manager sets per plan.

The property under test is §3.2, and it protects the club's revenue rather than any
screen: **a successor plan never inherits the link.** A uPay shared link carries a fixed
amount, so copying the 300 ₪ link onto a 320 ₪ successor sends every parent to sign a
mandate for the old price and the club under-collects all year without a single error
appearing anywhere. Everything else here is the guard rail around that one column.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.core.config import settings
from app.services.billing.catalogue import CatalogueService
from app.services.billing.errors import NotFoundError, RefusedError
from tests.billing.conftest import MONTHLY_AGOROT

LINK = "https://app.upay.co.il/recurring/abc"


def test_a_successor_plan_is_created_with_no_standing_order_link(
    tenant_session, studio, a_price_plan
):
    """**The test that protects the club's revenue.**

    A uPay shared link charges ONE amount. Carrying the 300 ₪ link onto a 320 ₪ successor
    would send every family to sign a mandate at the old price, and nothing anywhere would
    report an error -- the club would simply collect 20 ₪ less per child per month for a
    year. Leaving it NULL degrades the way the parent screen already degrades: the card
    renders with its instructions and no anchor, which is a visible prompt to paste the
    new link.
    """
    service = CatalogueService(tenant_session)
    service.set_standing_order_link(a_price_plan, LINK)
    successor = service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    assert service.get_price_plan(a_price_plan).standing_order_link_url == LINK
    assert successor.standing_order_link_url is None


def test_a_plaintext_link_is_refused(tenant_session, studio, a_price_plan):
    """This URL is shown to parents as the club's official payment page. `http://` on a
    payment form is a credential leak with the club's name on it."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).set_standing_order_link(
            a_price_plan, "http://app.upay.co.il/recurring/abc"
        )


def test_a_host_off_the_allowlist_is_refused(tenant_session, studio, a_price_plan):
    """A free-text URL field pointed at parents is a phishing page waiting to be pasted."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).set_standing_order_link(
            a_price_plan, "https://upay.co.il.evil.example/recurring/abc"
        )


def test_the_allowlist_is_configurable(tenant_session, studio, a_price_plan, monkeypatch):
    """A club whose provider is not uPay asks for a configuration change -- deliberately a
    higher bar than a text field, and deliberately not a code change."""
    url = "https://pay.example.org/recurring/abc"
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).set_standing_order_link(a_price_plan, url)
    monkeypatch.setattr(settings, "STANDING_ORDER_LINK_HOSTS", ("pay.example.org",))
    plan = CatalogueService(tenant_session).set_standing_order_link(a_price_plan, url)
    assert plan.standing_order_link_url == url


def test_the_link_is_cleared_by_setting_it_to_null(tenant_session, studio, a_price_plan):
    """The one mutable column on an immutable table: a typo must be fixable without
    inventing a price change that never happened, and so must a link that is simply gone."""
    service = CatalogueService(tenant_session)
    service.set_standing_order_link(a_price_plan, LINK)
    assert service.set_standing_order_link(a_price_plan, None).standing_order_link_url is None


def test_a_closed_plans_link_cannot_be_edited(tenant_session, studio, a_price_plan):
    """Closed plans' links are dead by definition -- their amount is not what anyone is
    billed any more. Editing one is a no-op a manager would read as having worked."""
    service = CatalogueService(tenant_session)
    service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    with pytest.raises(RefusedError):
        service.set_standing_order_link(a_price_plan, LINK)


def test_an_unknown_plan_reads_as_not_found(tenant_session, studio):
    with pytest.raises(NotFoundError):
        CatalogueService(tenant_session).set_standing_order_link(uuid.uuid4(), LINK)


# -- the routes ---------------------------------------------------------------
def test_setting_a_link_records_an_audit_entry(client, as_manager, a_price_plan, app_session):
    """§3.1 -- the history of this column lives in `audit_log` rather than in extra plan
    rows, which is what makes an in-place edit safe on a versioned table."""
    from app.models.audit import AuditLog

    response = client.put(
        f"/api/v1/price-plans/{a_price_plan}/standing-order-link",
        json={"url": LINK},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["standing_order_link_url"] == LINK
    # Filtered by entity too: `audit_log` is append-only by GRANT, so entries from every
    # other test that ever set a link are still there -- which is the point of the table.
    entries = (
        app_session.query(AuditLog)
        .filter(
            AuditLog.action == "price_plan.set_standing_order_link",
            AuditLog.entity_id == a_price_plan,
        )
        .all()
    )
    assert len(entries) == 1
    assert entries[0].diff == {"standing_order_link_url": LINK}


def test_the_url_is_never_interpolated_into_a_log_message(client, as_manager, a_price_plan, caplog):
    """The project rule: payloads go in `extra=`, never into the message. This value is not
    a secret, but an f-string has no key for the scrubber to match, and the next field
    written the same way will be one."""
    with caplog.at_level("DEBUG"):
        client.put(
            f"/api/v1/price-plans/{a_price_plan}/standing-order-link",
            json={"url": LINK},
            headers=as_manager.headers,
        )
    assert all(LINK not in record.getMessage() for record in caplog.records)


def test_a_payer_sees_one_labelled_link_per_child_that_has_one(
    client, a_priced_student, as_guardian_of, a_price_plan, tenant_session
):
    """§6 -- a payer with two children on two plans needs both, labelled. One link would
    have them sign one mandate and underpay for the other child every month."""
    CatalogueService(tenant_session).set_standing_order_link(a_price_plan, LINK)
    tenant_session.commit()
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.get("/api/v1/me/standing-order-links", headers=parent.headers)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["url"] == LINK
    assert items[0]["amount_agorot"] == MONTHLY_AGOROT
    assert items[0]["plan_name"]
    assert items[0]["student_name"]


def test_a_payer_gets_no_link_for_a_plan_none_of_their_children_hold(
    client, a_priced_student, as_guardian_of, a_price_plan, tenant_session, studio
):
    """The full catalogue is never exposed. A 300 ₪ payer who could see the 550 ₪ link
    could sign the 550 ₪ mandate by accident, and the club would over-collect from a
    family that never agreed to it."""
    from app.models.billing import PricePlan

    other = PricePlan(
        studio_id=studio.id,
        name="כל יום",
        sessions_per_week=5,
        monthly_amount_agorot=55_000,
        registration_fee_agorot=None,
        active_from=date(2026, 9, 1),
        standing_order_link_url="https://app.upay.co.il/recurring/other",
    )
    tenant_session.add(other)
    tenant_session.commit()
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.get("/api/v1/me/standing-order-links", headers=parent.headers)
    assert response.json()["items"] == []


def test_a_closed_plans_link_never_reaches_a_parent(
    client, a_priced_student, as_guardian_of, a_price_plan, tenant_session
):
    """The other side of §3.2. If a student is still pointing at last year's plan, its link
    charges last year's amount -- exactly the under-collection the successor rule exists to
    prevent, seen from the parent's end."""
    service = CatalogueService(tenant_session)
    service.set_standing_order_link(a_price_plan, LINK)
    service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    tenant_session.commit()
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.get("/api/v1/me/standing-order-links", headers=parent.headers)
    assert response.json()["items"] == []


def test_another_studios_plan_link_is_invisible_rather_than_forbidden(tenant_session, app_session):
    """Invariant 2. 404, never 403 -- a foreign plan id must not be confirmed to exist,
    and a link is a payment page: knowing another club's is knowing where their money
    goes."""
    from app.models.billing import PricePlan
    from app.models.studio import Studio

    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    theirs = PricePlan(
        studio_id=other.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=30_000,
        registration_fee_agorot=None,
        active_from=date(2026, 9, 1),
        standing_order_link_url=LINK,
    )
    app_session.add(theirs)
    app_session.commit()

    with pytest.raises(NotFoundError):
        CatalogueService(tenant_session).get_price_plan(theirs.id)
    assert CatalogueService(tenant_session).list_price_plans()[0] == []
