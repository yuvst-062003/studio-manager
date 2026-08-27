"""Wire shapes for `/api/v1/staff` — dashboard artboard 3d."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StaffGroupOut(BaseModel):
    id: str
    name: str


class StaffMemberOut(BaseModel):
    #: None for a pending invitation — nobody has accepted it, so no Person exists yet.
    person_id: str | None = None
    #: Present only on a pending invitation — the id resend and revoke act on (F5).
    invitation_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    roles: list[str]
    groups: list[StaffGroupOut]
    weekly_hours: float | None = Field(
        default=None,
        description=(
            "F8: measured from this week's staffed sessions. Null only on a pending "
            "invitation, which staffs nothing yet."
        ),
    )
    #: Derived from §3.2's matrix, never stored.
    permissions: list[str]
    status: str


class StaffListResponse(BaseModel):
    items: list[StaffMemberOut]
    #: F8 — 3d's banner at its drawn resolution: this week's scheduled sessions with
    #: nobody staffing them.
    sessions_without_coach: int = 0
    groups_without_coach: list[StaffGroupOut] = Field(
        description=(
            "3d's banner, at the resolution M1 can answer. It draws 'sessions this week "
            "with no coach', which needs materialised sessions; W2's SCHEDULE lane "
            "sharpens this to that."
        )
    )


class StaffInvitationIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    roles: list[str] = Field(min_length=1, max_length=3)
    first_name: str | None = None
    last_name: str | None = None


class StaffInvitationOut(BaseModel):
    """The token, exactly once (F5, on the platform invite's pattern). Only its SHA-256
    is stored, and there is no mailer in this product: the link is the manager's to
    share, like §5.4b's onboarding link."""

    id: str
    email: str
    expires_at: str
    token: str


class StaffRolesIn(BaseModel):
    roles: list[str] = Field(min_length=1, max_length=3)
