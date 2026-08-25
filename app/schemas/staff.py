"""Wire shapes for `/api/v1/staff` — dashboard artboard 3d."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StaffGroupOut(BaseModel):
    id: str
    name: str


class StaffMemberOut(BaseModel):
    #: None for a pending invitation — nobody has accepted it, so no Person exists yet.
    person_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    roles: list[str]
    groups: list[StaffGroupOut]
    weekly_hours: float | None = Field(
        default=None,
        description=(
            "Always null in M1. Weekly load is group_schedule_rule × session, both W2 "
            "contract models. Zero would report an idle coach rather than a missing "
            "measurement."
        ),
    )
    #: Derived from §3.2's matrix, never stored.
    permissions: list[str]
    status: str


class StaffListResponse(BaseModel):
    items: list[StaffMemberOut]
    groups_without_coach: list[StaffGroupOut] = Field(
        description=(
            "3d's banner, at the resolution M1 can answer. It draws 'sessions this week "
            "with no coach', which needs materialised sessions; W2's SCHEDULE lane "
            "sharpens this to that."
        )
    )
