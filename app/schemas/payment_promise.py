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
    charge_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    method: Literal["cash", "cheque"] = "cash"


class PaymentPromiseOut(BaseModel):
    id: uuid.UUID
    status: str
    method: str
    total_agorot: int
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
    payer_person_id: uuid.UUID
    payer_name: str
    charge_count: int
    created_at: datetime.datetime


class ManagerPaymentPromiseListOut(BaseModel):
    items: list[ManagerPaymentPromiseOut]
