"""`GET`/`PUT /me/payment-methods` -- which route a family pays each child by.

**This exists because a promise cannot carry a card.** `payment_promise.method` is
constrained to `('cash', 'cheque', 'standing_order')`, so the join wizard -- which writes a
promise for the other three methods and a `payment_order` for card -- recorded a card
family's choice nowhere at all. The profile screen derived the method from the promise
list, so those families read `לא הוגדר` for ever, no matter what they had picked.

**Per child, not per payer.** That is what the wizard already collects, and what הוראת קבע
actually is: a mandate is signed per child at that child's own price, which is why
`GET /me/standing-order-links` returns a list rather than a link.
"""

from __future__ import annotations

from app.models.people import Student
from app.models.person import Guardian
from sqlalchemy import select
from tests.billing.conftest import TwoChildFamily


def _both_children(app_session, studio, family: TwoChildFamily, caller) -> None:
    """Make the signed-in parent a guardian of BOTH children.

    `as_guardian_of` binds one student, because most tests need one. A family screen shows
    every child a payer is responsible for, so this endpoint has to be tested against a
    caller who has more than one -- a single-child caller cannot fail the "children
    disagree" case at all.
    """
    for student_id in family.student_ids:
        already = app_session.execute(
            select(Guardian.id).where(
                Guardian.student_id == student_id, Guardian.person_id == caller.person_id
            )
        ).scalar_one_or_none()
        if already is None:
            app_session.add(
                Guardian(
                    studio_id=studio.id,
                    student_id=student_id,
                    person_id=caller.person_id,
                    is_primary=False,
                    relation="parent",
                )
            )
    app_session.commit()


def test_a_parent_reads_a_method_per_child(
    client, app_session, studio, a_two_child_family, as_guardian_of
):
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)

    body = client.get("/api/v1/me/payment-methods", headers=caller.headers).json()

    assert len(body["items"]) == 2
    # Nobody has answered yet, and `None` is that state -- distinct from any method.
    assert [row["method"] for row in body["items"]] == [None, None]
    assert {row["student_name"] for row in body["items"]} == {"דנה שניים", "יוסי שניים"}


def test_a_parent_sets_one_childs_method(
    client, app_session, studio, a_two_child_family, as_guardian_of
):
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)
    first, second = (str(sid) for sid in a_two_child_family.student_ids)

    response = client.put(
        "/api/v1/me/payment-methods",
        headers=caller.headers,
        json={"items": [{"student_id": first, "method": "standing_order"}]},
    )
    assert response.status_code == 200, response.text

    body = client.get("/api/v1/me/payment-methods", headers=caller.headers).json()
    by_id = {row["student_id"]: row["method"] for row in body["items"]}
    assert by_id[first] == "standing_order"
    # The other child is untouched. A family may put one child on a mandate and pay the
    # other by card, which is exactly why this is stored per child.
    assert by_id[second] is None


def test_a_card_method_is_storable_though_no_promise_could_carry_it(
    client, app_session, studio, a_two_child_family, as_guardian_of
):
    """D4's root cause, asserted directly.

    `payment_promise_method` is `IN ('cash', 'cheque', 'standing_order')`. Before this
    endpoint there was nowhere in the schema for 'this family pays by card' to live.
    """
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)
    first = str(a_two_child_family.student_ids[0])

    response = client.put(
        "/api/v1/me/payment-methods",
        headers=caller.headers,
        json={"items": [{"student_id": first, "method": "upay_card"}]},
    )

    assert response.status_code == 200, response.text
    stored = app_session.execute(
        select(Student.payment_method).where(Student.id == a_two_child_family.student_ids[0])
    ).scalar_one()
    assert stored == "upay_card"


def test_someone_elses_child_is_not_found(
    client, app_session, studio, a_two_child_family, a_priced_student, as_guardian_of
):
    """404 and not 403: probing ids must tell nobody whether the student exists.

    Without this a parent could set the payment method on another family's child, which is
    a write to a row they may not even read.
    """
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)

    response = client.put(
        "/api/v1/me/payment-methods",
        headers=caller.headers,
        json={"items": [{"student_id": str(a_priced_student.student_id), "method": "cash"}]},
    )

    assert response.status_code == 404
    # And nothing was written -- a partial application of a rejected batch would be worse
    # than the refusal it came with.
    stored = app_session.execute(
        select(Student.payment_method).where(Student.id == a_priced_student.student_id)
    ).scalar_one()
    assert stored is None


def test_an_unknown_method_is_refused(
    client, app_session, studio, a_two_child_family, as_guardian_of
):
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)

    response = client.put(
        "/api/v1/me/payment-methods",
        headers=caller.headers,
        json={
            "items": [{"student_id": str(a_two_child_family.student_ids[0]), "method": "bitcoin"}]
        },
    )

    assert response.status_code == 422


def test_a_stranger_reads_no_children(client, app_session, studio, a_two_child_family, as_owner):
    """An owner is not a guardian. The route is scoped to the CALLER's own children, so a
    caller with none reads an empty list rather than the whole studio's roster."""
    body = client.get("/api/v1/me/payment-methods", headers=as_owner.headers).json()
    assert body["items"] == []


def test_the_batch_is_applied_whole_or_not_at_all(
    client, app_session, studio, a_two_child_family, a_priced_student, as_guardian_of
):
    """One bad id in a batch rejects the batch.

    A half-applied save leaves the picker showing one child changed and one not, with no
    error that names which -- the family then presses save again and changes the first
    child twice.
    """
    caller = as_guardian_of(a_two_child_family.student_ids[0])
    _both_children(app_session, studio, a_two_child_family, caller)

    response = client.put(
        "/api/v1/me/payment-methods",
        headers=caller.headers,
        json={
            "items": [
                {"student_id": str(a_two_child_family.student_ids[0]), "method": "cash"},
                {"student_id": str(a_priced_student.student_id), "method": "cash"},
            ]
        },
    )

    assert response.status_code == 404
    stored = app_session.execute(
        select(Student.payment_method).where(Student.id == a_two_child_family.student_ids[0])
    ).scalar_one()
    assert stored is None
