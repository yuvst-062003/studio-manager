"""Request and response models for the dev router. .claude/rules/api.md: every request
body and query param is validated by a Pydantic schema, and every endpoint declares an
explicit response_model."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.config import Env
from app.integrations.upay.ipn import IpnShape


class DevPing(BaseModel):
    env: Env


class DevClock(BaseModel):
    now: datetime
    shifted: bool


class DemoResetRequest(BaseModel):
    #: Omitted means "the latest set". Naming one pins a bisect to the data it was
    #: authored against.
    version: str | None = None


class DemoResetResponse(BaseModel):
    version: str
    tables_wiped: list[str]
    layers_seeded: list[str]


class SimulateIpnRequest(BaseModel):
    shape: IpnShape
    order_public_ref: uuid.UUID
    expected_amount_agorot: int
    #: Omitted means a fresh one. Naming it is how a duplicate is simulated across two
    #: calls rather than only within one.
    transaction_id: str | None = None


class SimulateIpnResponse(BaseModel):
    shape: IpnShape
    delivered: bool
    target_url: str
    query: dict[str, str]
    note: str


# -- §19.4's role switcher ----------------------------------------------------
class PersonaOut(BaseModel):
    """One entry in the dev bar's dropdown.

    `tests` carries §19.3's right-hand column -- what this persona exists to walk -- so
    the reason is visible where the switch happens rather than only in the spec.
    """

    key: str | None
    person_id: uuid.UUID
    studio_id: uuid.UUID
    label: str
    roles: list[str]
    is_guardian: bool
    tests: str


class PersonaListResponse(BaseModel):
    items: list[PersonaOut]
    #: §19.3 -- 'the dev bar says so explicitly, so the gap is visible rather than
    #: confusing.' Served as data so the client states the gap in the spec's own words
    #: instead of hardcoding a sentence that can drift from them.
    no_student_persona_note: str


class ActAsResponse(BaseModel):
    """A new access token carrying the persona, not a mutation of the caller's.

    §19.4: "Switching sets acting_as_person_id on the session; the API resolves
    permissions from that Person exactly as it would for a real login."
    """

    access_token: str
    expires_in: int
    acting_as_person_id: uuid.UUID
    persona_label: str
    studio_id: uuid.UUID
    roles: list[str]
