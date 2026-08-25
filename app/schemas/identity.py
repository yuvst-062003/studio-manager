"""Request and response shapes for /auth/*.

**No schema here carries a field named `is_developer`.** §19.2: "There is no API, no UI
and no admin screen that can grant it", and tests/restrictions/test_04 walks every request
body FastAPI publishes looking for exactly that name. `MeResponse.dev_tools` is a
*response* field reporting whether the dev bar should render -- a different question from
granting the flag, and named differently so the detector's intent is not sidestepped by
accident rather than honoured by luck.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

#: §6.5 -- three separately-origined PWAs. Which one started the flow decides where the
#: callback returns to, so it is validated rather than echoed.
APPS = ("staff", "parent", "dashboard")


class CallbackRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    state: str = Field(min_length=1, max_length=64)
    #: §6.1 step 3 -- 'invitation token -> attach identity to the pre-created Person'.
    invitation_token: str | None = Field(default=None, max_length=128)


class AcceptInvitationRequest(BaseModel):
    """§6.1 step 3's `[ יש לי קוד הזמנה ]` branch.

    The callback already accepts an `invitation_token`, but that only helps someone who
    has the code BEFORE they sign in. A parent whose email differs from the invitation by
    one character signs in successfully, matches nothing, and needs a way forward that is
    not "sign out and start again with a code you were not told to keep".
    """

    token: str = Field(min_length=1, max_length=128)


class SwitchStudioRequest(BaseModel):
    studio_id: uuid.UUID


class ProviderOut(BaseModel):
    """One sign-in button the client may render.

    Only configured providers are listed (app/services/identity/providers.py). A button
    for a provider whose credentials are absent fails one step *after* the user has
    picked their account, which is worse than a button that is not there.
    """

    name: str
    start_url: str


class ProviderListResponse(BaseModel):
    items: list[ProviderOut]


class StudioMembershipOut(BaseModel):
    studio_id: uuid.UUID
    studio_name: str
    studio_is_demo: bool
    person_id: uuid.UUID
    roles: list[str]
    is_guardian: bool


class AppAccessOut(BaseModel):
    """§6.1's two queries, as the client sees them.

    Two booleans and nothing else. A count of students or studios in the *other* app
    would leak what §6.1 says neither refusal screen may: "Neither screen leaks whether
    the account exists in the other app."
    """

    staff: bool
    parent: bool


class SessionResponse(BaseModel):
    """The access token lives in the body, never in a cookie (§10.3).

    The client holds it in memory and replays it, which is what keeps it out of
    automatic-credential territory -- a cookie-borne access token is sent by the browser
    on every request, which is what makes CSRF possible at all. The refresh token is in
    the Set-Cookie header and never here.
    """

    access_token: str
    expires_in: int
    access: AppAccessOut
    studios: list[StudioMembershipOut]
    active_studio_id: uuid.UUID | None


class MeResponse(BaseModel):
    identity_id: uuid.UUID
    access: AppAccessOut
    studios: list[StudioMembershipOut]
    active_studio_id: uuid.UUID | None
    #: §19.4 -- whether to render the dev bar. Reported, never accepted.
    dev_tools: bool
    #: §19.4 -- the persona the API is resolving permissions from.
    acting_as_person_id: uuid.UUID | None
