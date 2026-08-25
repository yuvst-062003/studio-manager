"""Holdback 2 -- the input app/core/tenancy.py has been waiting for since M0.2.

`studio_id_from_request` already implements §19.6 restriction 1 correctly, and
tests/restrictions/test_01 already asserts the rule in full. What was absent was only the
input: nothing populated `request.state`. This middleware is that, and nothing more.

**It never rejects a request.** An absent or invalid token leaves the state unset and lets
the route's own dependency decide -- `studio_id_from_request` returns 401 for a
tenant-scoped route, `/auth/*` and `/health` need no studio at all, and a middleware that
401'd everything would make the unauthenticated surface unreachable. Failing open here is
safe precisely because failing closed happens one layer down.

**Unset, not False.** A middleware that wrote `is_developer = False` on every
unauthenticated request would be one line away from writing `True`, and the state would
look equally deliberate either way. `tenancy.py` reads these with `getattr(..., False)`,
so absent and False mean the same thing to it -- and absent additionally means *nobody
claimed anything*.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.clock import now
from app.core.config import settings
from app.services.identity.tokens import InvalidAccessTokenError, verify_access_token

_BEARER = "bearer "


class AuthContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        header = request.headers.get("Authorization", "")
        key = settings.JWT_SIGNING_KEY
        if key is not None and header.lower().startswith(_BEARER):
            token = header[len(_BEARER) :].strip()
            try:
                # `now()` and not datetime.now(): §19.5's X-Dev-Now shifts the only clock
                # for one request, and a session that could not be time-travelled would
                # make every billing-run test sign in under real time.
                claims = verify_access_token(token, key=key.get_secret_value(), at=now())
            except InvalidAccessTokenError:
                # Deliberately silent. §5.2 expires a token every fifteen minutes by
                # design, so this is the ordinary path -- logging it would bury the real
                # failures underneath it.
                return await call_next(request)

            request.state.identity_id = claims.identity_id
            request.state.person_id = claims.person_id
            request.state.acting_as_person_id = claims.acting_as_person_id
            # The name tenancy.py reads, from the token's `sid` claim -- written when the
            # auth router resolved the studio.
            request.state.studio_id = claims.active_studio_id
            request.state.roles = claims.roles
            # §19.6's two inputs, both from VERIFIED claims. Deriving either after
            # verification -- a database read, a config lookup -- would be a second source
            # of truth for a decision that already has one.
            request.state.is_developer = claims.is_developer
            request.state.studio_is_demo = claims.studio_is_demo
            request.state.is_platform_admin = claims.is_platform_admin

        response = await call_next(request)

        # §19.4 -- 'every response carries an X-Acting-As header so the active persona is
        # visible in dev tools and in Sentry breadcrumbs.'
        acting_as = getattr(request.state, "acting_as_person_id", None)
        if acting_as is not None:
            response.headers["X-Acting-As"] = str(acting_as)
        return response


def require_roles(*allowed: str) -> Callable[[Request], None]:
    """SPEC §3.2's permission matrix as a router dependency.

    .claude/rules/api.md: "Authorization is checked in the router via a dependency, never
    inside a service." A service that checked its own caller would be a service whose
    guarantees depend on who imported it.

    Reads `request.state.roles`, which is a fifteen-minute snapshot from the verified JWT.
    §5.2 accepts that latency in as many words -- "Role changes take effect on the next
    refresh, at most 15 minutes later" -- and pays for the case that cannot wait
    (removing a coach) with the refresh denylist rather than a database read per request.

    The 401/403 split is decided here rather than left to dependency ordering. FastAPI
    resolves a route's parameters in declaration order, so whether an anonymous caller met
    this dependency or `studio_id_from_request` first would depend on which parameter a
    router happened to list first -- and the answer would differ per route. An anonymous
    caller gets 401 ("authenticate"), an authenticated one without the role gets 403
    ("you may not"), from every route, whatever order its parameters are in.
    """

    def dependency(request: Request) -> None:
        if getattr(request.state, "identity_id", None) is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "unauthenticated", "message": "sign in first"},
            )
        roles = set(getattr(request.state, "roles", ()) or ())
        if not roles & set(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": "this action is not yours"},
            )

    return dependency


#: §3.2 -- 'Create/edit classes, groups, schedules' and 'Manage staff and role
#: assignments'. A coach who can create a group can assign themselves to it.
ManagerOrOwner = Annotated[None, Depends(require_roles("owner", "manager"))]

#: §3.2 -- 'View students in own groups' reaches every staff role, and a roster is
#: unreadable without the group it belongs to. Refusing reads to coaches would break the
#: coach app in order to enforce a rule about writes.
AnyStaff = Annotated[
    None, Depends(require_roles("owner", "manager", "lead_coach", "assistant_coach"))
]
