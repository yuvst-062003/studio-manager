"""Shapes for the payment-promise flow (cash and cheques).

Two views of the same row on purpose: the payer's own promise carries charge ids so the
payments screen can badge exactly the months it covers; the manager's list carries the
payer's display name, because 'who is bringing money' is the whole question that screen
answers. Amounts are agorot integers throughout (G2).
"""

from __future__ import annotations

import datetime
import uuid
from typing import Literal

from pydantic import BaseModel, Field


class PaymentPromiseCreateIn(BaseModel):
    #: May be empty when `prepay_months` is not: a family with nothing owed may still buy
    #: three months forward. The service refuses a promise that is neither.
    charge_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    method: Literal["cash", "cheque"] = "cash"
    #: Whole months bought forward beyond the charges above, priced at the payer's monthly
    #: total. Capped at the same two years the studio setting is: a longer term is a
    #: deposit, not a prepayment.
    prepay_months: int = Field(default=0, ge=0, le=24)


class PaymentPromiseOut(BaseModel):
    id: uuid.UUID
    status: str
    method: str
    total_agorot: int
    prepay_months: int
    charge_ids: list[uuid.UUID]
    created_at: datetime.datetime
    decided_at: datetime.datetime | None


class PaymentPromiseListOut(BaseModel):
    items: list[PaymentPromiseOut]


class ManagerPaymentPromiseOut(BaseModel):
    id: uuid.UUID
    status: str
    method: str
    total_agorot: int
    #: Beside the amount in the manager's queue, because "3,600 ₪" with no explanation is
    #: the number they phone the office about. Twelve months forward is why it is large.
    prepay_months: int
    payer_person_id: uuid.UUID
    payer_name: str
    charge_count: int
    created_at: datetime.datetime


class ManagerPaymentPromiseListOut(BaseModel):
    items: list[ManagerPaymentPromiseOut]
