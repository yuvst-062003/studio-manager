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
    #: May be empty when `prepay_months` or `claimed_plan_id` is not: a family with
    #: nothing owed may still buy three months forward, or claim a program already paid
    #: for. The service refuses a promise that is none of the three.
    charge_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    method: Literal["cash", "cheque", "standing_order"] = "cash"
    #: Whole months bought forward beyond the charges above, priced at the payer's monthly
    #: total. Capped at the same two years the studio setting is: a longer term is a
    #: deposit, not a prepayment.
    prepay_months: int = Field(default=0, ge=0, le=24)
    #: The plan-claim flow (owner request, 2026-08-30): the payment program the parent
    #: says they already paid for, from the plan picker. Priced by the SERVER from the
    #: plan row -- the body names a plan, never an amount.
    claimed_plan_id: uuid.UUID | None = None
    #: Whether the money has ALREADY changed hands, rather than being about to. The signup
    #: plan step offers both under every route (owner correction, 2026-08-30). It settles
    #: nothing -- it tells the manager whether to go and look for this money now or wait.
    already_paid: bool = False


class PaymentPromiseOut(BaseModel):
    id: uuid.UUID
    status: str
    method: str
    total_agorot: int
    prepay_months: int
    #: Which program the claim half is about, or null. The payments screen uses it to
    #: tell a plan claim from a settle-my-charges promise without inferring from emptiness.
    claimed_plan_id: uuid.UUID | None
    #: What the parent said about the money: already handed over, or about to be.
    already_paid: bool
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
    #: The program a plan claim is about, by name -- "which plan is this money for" is the
    #: first thing the manager asks before marking it received. Null for ordinary promises.
    claimed_plan_name: str | None
    #: **The manager's next action, in one boolean.** True means this family says the
    #: money is already in the drawer or on the statement, so it can be checked right now;
    #: false means it is coming. Both are still confirmed by hand -- a claim is never a
    #: settlement (G8).
    already_paid: bool
    payer_person_id: uuid.UUID
    payer_name: str
    charge_count: int
    created_at: datetime.datetime


class ManagerPaymentPromiseListOut(BaseModel):
    items: list[ManagerPaymentPromiseOut]
