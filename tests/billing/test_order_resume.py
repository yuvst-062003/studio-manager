"""A parent who walks away from the uPay page can get back to the order they opened.

§5.10 leaves an order `pending` and holding its charges for `REPLACE_GRACE_MINUTES`, and
that hold is right: uPay's IPN lands about five minutes after a real payment, so releasing
the charges sooner would offer the same month for a second card payment while money is
already moving.

The consequence nobody covered is what the PARENT sees. `POST /payment-orders` is refused
for those ten minutes, and the only reads that exist take a `public_ref` the client no
longer has -- the parent app kept it in React state (`ParentPayments.pendingOrder`), which
dies when the screen unmounts or the PWA is closed. So a family who opened the payment page,
thought better of it and came back was shown "you owe X" above a button that answered a
generic failure, for ten minutes, with nothing on screen to say why.

`GET /me/payment-orders` is the way back: the order already exists, the parent already owns
it, and `PaymentOrderOut` already carries the `public_ref`, `charge_ids` and `prepay_months`
the screen needs to reopen exactly the same payment page rather than a second one.
"""

from __future__ import annotations

from datetime import date

from app.models.billing import Charge
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD


def _charge_owed_by(studio, student_id, payer_person_id) -> Charge:
    return Charge(
        studio_id=studio.id,
        payer_person_id=payer_person_id,
        student_id=student_id,
        kind="tuition",
        period_year=PERIOD[0],
        period_month=PERIOD[1],
        amount_agorot=MONTHLY_AGOROT,
        due_date=date(2026, 11, 30),
        status="open",
        created_by="billing_run",
    )


def test_a_parent_can_resume_the_order_they_abandoned(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    """The whole bug, end to end: open an order, abandon it, and find it again."""
    parent = as_guardian_of(a_priced_student.student_id)
    charge = _charge_owed_by(studio, a_priced_student.student_id, parent.person_id)
    app_session.add(charge)
    app_session.commit()

    opened = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(charge.id)]},
        headers=parent.headers,
    )
    assert opened.status_code == 201, opened.text
    public_ref = opened.json()["public_ref"]

    # Inside the grace window a fresh attempt is refused, and that refusal is CORRECT --
    # this is the window in which money may already be moving. It is also precisely why
    # the parent needs a route back to the order they already have.
    again = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(charge.id)]},
        headers=parent.headers,
    )
    assert again.status_code == 409, again.text

    mine = client.get("/api/v1/me/payment-orders", headers=parent.headers)
    assert mine.status_code == 200, mine.text
    rows = mine.json()["items"]
    assert [row["public_ref"] for row in rows] == [public_ref]
    assert rows[0]["status"] == "pending"
    # The screen reopens the SAME page only if it can tell this order apart from a
    # different ask, which is what these two fields are for.
    assert rows[0]["charge_ids"] == [str(charge.id)]
    assert rows[0]["prepay_months"] == 0


def test_a_parent_never_sees_another_familys_order(
    client, app_session, studio, a_priced_student, an_open_charge, an_order, as_guardian_of
):
    """`an_order` belongs to `a_priced_student`'s PRIMARY guardian, who is a different
    person from the one signing in here. A read keyed on anything but the caller would
    hand one family a reference to another family's payment page."""
    stranger = as_guardian_of(a_priced_student.student_id)
    mine = client.get("/api/v1/me/payment-orders", headers=stranger.headers)
    assert mine.status_code == 200, mine.text
    assert mine.json()["items"] == []
