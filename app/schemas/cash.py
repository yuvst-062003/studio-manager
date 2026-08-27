"""Shapes for the cash-request flow (feature pass 2026-08-27).

Two views of the same row on purpose: the payer's own request carries charge ids so the
payments screen can badge exactly the months it covers; the manager's list carries the
payer's display name, because 'who is bringing cash' is the whole question that screen
answers. Amounts are agorot integers throughout (G2).
"""

from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, Field


class CashRequestCreateIn(BaseModel):
    charge_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


class CashRequestOut(BaseModel):
    id: uuid.UUID
    status: str
    total_agorot: int
    charge_ids: list[uuid.UUID]
    created_at: datetime.datetime
    decided_at: datetime.datetime | None


class CashRequestListOut(BaseModel):
    items: list[CashRequestOut]


class ManagerCashRequestOut(BaseModel):
    id: uuid.UUID
    status: str
    total_agorot: int
    payer_person_id: uuid.UUID
    payer_name: str
    charge_count: int
    created_at: datetime.datetime


class ManagerCashRequestListOut(BaseModel):
    items: list[ManagerCashRequestOut]
