"""F9 -- `GET /api/v1/search`, the dashboard's one search box.

ManagerOrOwner: the dashboard is their surface (F10 gates the nav the same way), and a
guardian's phone number in a result row is §11 personal data with no coach-facing need.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.auth_context import ManagerOrOwner
from app.core.tenancy import TenantSessionDep
from app.services.people.search import global_search

router = APIRouter(tags=["people", "search"])


class SearchStudentOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str


class SearchGuardianOut(BaseModel):
    person_id: uuid.UUID
    name: str
    student_id: uuid.UUID


class SearchGroupOut(BaseModel):
    id: uuid.UUID
    name: str


class SearchStaffOut(BaseModel):
    person_id: uuid.UUID
    name: str


class SearchOut(BaseModel):
    students: list[SearchStudentOut]
    guardians: list[SearchGuardianOut]
    groups: list[SearchGroupOut]
    staff: list[SearchStaffOut]


@router.get("/search", response_model=SearchOut)
def search(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    q: Annotated[str, Query(min_length=1, max_length=100)],
) -> SearchOut:
    return SearchOut.model_validate(global_search(session, q))
