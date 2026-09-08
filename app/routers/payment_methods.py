"""`GET`/`PUT /me/payment-methods` -- which route a family pays each child by.

**A statement of intent, not money.** Saving here raises no promise and opens no order.
The cheque request and the standing-order mandate stay deliberate actions taken elsewhere,
because both of those commit a family to something and a preference does not.

**This exists because a promise cannot carry a card.** `payment_promise.method` is
`IN ('cash', 'cheque', 'standing_order')` -- correctly, since a promise says money will
arrive by hand and a card order is money already in motion. The consequence was that the
join wizard recorded three of its four methods and silently dropped the fourth, and the
parent's profile screen -- which read the method off the promise list -- answered
`לא הוגדר` to every card family for ever.

No role dependency, like every other `/me/*` read: §3.1's 'guardian is not a role'. The
caller comes from the session and never from the body, for the same reason payment orders
do it -- a body-supplied payer would let anyone rewrite anyone else's arrangements.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.people import Student
from app.models.person import Guardian, Person
from app.services.audit import AuditService

router = APIRouter(tags=["billing"])

#: `payment.method`'s vocabulary, so `methodKey` on the client translates it untouched.
PaymentMethod = Literal["upay_card", "cash", "cheque", "standing_order"]


def _caller(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


class PaymentMethodIn(BaseModel):
    student_id: uuid.UUID
    #: A `Literal`, so an unknown method is a 422 that names the field rather than a check
    #: constraint violation surfacing as a 500 from the database.
    method: PaymentMethod


class PaymentMethodListIn(BaseModel):
    items: list[PaymentMethodIn]


class PaymentMethodOut(BaseModel):
    student_id: uuid.UUID
    #: Rendered as the block heading in the picker. A one-child family gets no heading, so
    #: this is read only when there is more than one -- but it is always sent, because the
    #: client deciding that is cheaper than a second read to find out.
    student_name: str
    method: str | None


class PaymentMethodListOut(BaseModel):
    items: list[PaymentMethodOut]


def _mine(session: TenantSessionDep, payer_person_id: uuid.UUID) -> list[PaymentMethodOut]:
    """Every child this caller is a guardian of, named, with whatever they last said.

    Guardianship and not payership: §3.3 allows several guardians per child and only one
    of them is `is_primary`. A second parent who signs in must still see and change how
    their own child is paid for.
    """
    rows = session.execute(
        select(Student.id, Person.first_name, Person.last_name, Student.payment_method)
        .join(Person, Person.id == Student.person_id)
        .join(Guardian, Guardian.student_id == Student.id)
        .where(Guardian.person_id == payer_person_id)
        .order_by(Person.first_name, Person.last_name)
    ).all()
    return [
        PaymentMethodOut(
            student_id=student_id,
            student_name=f"{first} {last}".strip(),
            method=method,
        )
        for student_id, first, last, method in rows
    ]


@router.get("/me/payment-methods", response_model=PaymentMethodListOut)
def my_payment_methods(request: Request, session: TenantSessionDep) -> PaymentMethodListOut:
    return PaymentMethodListOut(items=_mine(session, _caller(request)))


@router.put("/me/payment-methods", response_model=PaymentMethodListOut)
def set_my_payment_methods(
    body: PaymentMethodListIn, request: Request, session: TenantSessionDep
) -> PaymentMethodListOut:
    """Whole or not at all.

    Every id is checked before anything is written. A half-applied save leaves the picker
    showing one child changed and one not, with no error naming which -- and the family
    then presses save again and changes the first child twice.
    """
    studio_id = require_current_studio_id()
    payer_person_id = _caller(request)
    mine = {row.student_id for row in _mine(session, payer_person_id)}

    for item in body.items:
        if item.student_id not in mine:
            # 404 and not 403: probing ids must tell nobody whether the student exists.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": "no such student"},
            )

    for item in body.items:
        student = session.get(Student, item.student_id)
        if student is None:  # pragma: no cover -- `mine` was read from this table
            continue
        student.payment_method = item.method

    if body.items:
        AuditService.record(
            session,
            action="student.payment_method",
            entity_type="student",
            entity_id=body.items[0].student_id,
            studio_id=studio_id,
            actor_person_id=payer_person_id,
            # A payment route is not health data and names nobody, so it may be recorded.
            diff={str(item.student_id): item.method for item in body.items},
        )
    session.commit()
    return PaymentMethodListOut(items=_mine(session, payer_person_id))
