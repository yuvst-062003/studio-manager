"""`/api/v1/staff` — dashboard artboard 3d (צוות).

§3.2 puts 'Manage staff and role assignments' at owner ✓ manager ✓ and nothing else, which
is the guard this route carries. A coach reading the studio's whole staff table with every
colleague's permissions is not something any coach screen needs.

One route, one payload: 3d is a single view, so it makes a single request rather than
three that have to be reconciled while they land.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas.staff import StaffListResponse
from app.services.structure import staff as staff_service

router = APIRouter(tags=["staff"])


@router.get("/staff", response_model=StaffListResponse)
def list_staff(_: ManagerOrOwner, session: TenantSessionDep) -> StaffListResponse:
    # `now()` and not datetime.now(): an expired invitation must expire on the same clock
    # §19.5's X-Dev-Now shifts, or a time-travelled demo shows invitations that are stale
    # everywhere except this screen.
    return StaffListResponse.model_validate(staff_service.list_staff(session, at=now()))
