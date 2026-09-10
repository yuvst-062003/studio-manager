"""Wire shapes for `/api/v1/staff` — dashboard artboard 3d."""

from __future__ import annotations

import uuid

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
    #: 0025 -- the person to call if this one is hurt on a mat. Collected from ASSISTANT
    #: COACHES only (that revision's docstring says why that role and not the others) and
    #: null for everyone who has not filled it in, which on the day it shipped is everyone.
    #:
    #: **On THIS response and no other.** `GET /staff` is `ManagerOrOwner`; a coach-scoped
    #: route must never learn to carry these, because they are a third party's name and
    #: number and a coach browsing their colleagues' next-of-kin is not a thing this product
    #: does. It is also why the fields live here rather than on a roster row or a session's
    #: staff list, both of which a coach can read.
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None
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
    group_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description=(
            "Groups this coach starts on. `invite_staff` creates the Person NOW and "
            "acceptance only binds a login to it (§5.3), so the assignments are real "
            "from the moment the invitation is written — nothing waits for the coach to "
            "sign in. Empty means no group yet, which §3.3 allows."
        ),
    )
    class_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description=(
            "Classes this MANAGER runs, for a manager scoped to classes rather than to the "
            "whole studio (2026-09-09). Non-empty means the grants written are class-scoped "
            "and no studio-wide one is written at all — a studio row beside them would hand "
            "back exactly the club-wide authority the scoping withholds. Only valid with "
            '`roles: ["manager"]`; a coach\'s scope is the roster `group_ids` puts them on.'
        ),
    )


class StaffInvitationOut(BaseModel):
    """The token, exactly once (F5, on the platform invite's pattern). Only its SHA-256
    is stored, and there is no mailer in this product: the link is the manager's to
    share, like §5.4b's onboarding link."""

    id: str
    email: str
    expires_at: str
    token: str


class StaffRolesIn(BaseModel):
    """The staff-row editor. Roles, and — since 2026-09-10 — the person's own details.

    The owner's report was "אי אפשר לערוך איש צוות", and it was accurate: this took `roles`
    and nothing else, so a coach invited with a typo in their name carried it for ever. The
    invite form is the only place a name is ever written and nothing could rewrite it.

    `None` means NOT MENTIONED and never "set to empty". The role editor sends `{roles}`
    alone and must keep doing so without blanking a name, which is the distinction every
    partial update has to get right and the one a test here pins.
    """

    roles: list[str] = Field(min_length=1, max_length=3)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, min_length=3, max_length=320)
