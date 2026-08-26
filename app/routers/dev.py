"""SPEC §19 -- the developer account's endpoints.

**This module's existence is the mechanism.** app/main.py's discovery loop skips a
module named `dev` when settings.ENV == "production" (seam 2, M0.2, app/main.py:31), so
in production these routes are never registered: they 404 the way any unclaimed path
does, rather than 403-ing from an `if` a later edit could invert. tests/restrictions/
test_02 asserts the OpenAPI path set, not the status code, because a status code proves
much less.

Nothing outside this module and app/services/demo may import from here. If a service
needs something in this file, the thing is in the wrong file.

Routes resolve under /api/v1/dev/... : main.py mounts every discovered router beneath
/api/v1 (G5). SPEC §7 writes the short form.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.core.clock import is_shifted, now
from app.core.config import settings
from app.core.cors import app_origin
from app.core.db import SessionDep
from app.core.dev_account import RequireDeveloper
from app.integrations.upay.ipn import IPN_SOURCE_IP, build_ipn_query
from app.models.identity import RefreshToken
from app.schemas.dev import (
    ActAsResponse,
    DemoResetRequest,
    DemoResetResponse,
    DevClock,
    DevPing,
    PersonaListResponse,
    PersonaOut,
    SimulateIpnRequest,
    SimulateIpnResponse,
)
from app.services.audit import AuditService
from app.services.demo.fixtures import LATEST_VERSION, SEEDS
from app.services.demo.service import DemoStudioService
from app.services.identity.act_as import (
    NO_STUDENT_PERSONA_NOTE,
    ActAsRefusedError,
    resolve_persona,
    switchable_personas,
)
from app.services.identity.refresh import (
    REFRESH_COOKIE_NAME,
    hash_refresh_secret,
    issue_refresh_token,
    set_refresh_cookie,
)
from app.services.identity.tokens import AccessClaims, mint_access_token

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/ping", response_model=DevPing)
def ping(_: RequireDeveloper) -> DevPing:
    """Proof of mount. Restriction 2's test asserts this resolves outside production and
    does not exist inside it, so it stays the cheapest possible route: no database, no
    tenant scope, nothing that could fail for an unrelated reason and make the
    restriction look satisfied when it is not."""
    return DevPing(env=settings.ENV)


@router.get("/clock", response_model=DevClock)
def read_clock(_: RequireDeveloper) -> DevClock:
    """What time does the server think it is, and did you move it? The second field is
    the one that matters: a shift that silently failed to apply looks identical to no
    shift at all, and you would debug the billing run instead of the header."""
    return DevClock(now=now(), shifted=is_shifted())


@router.post("/demo/reset", response_model=DemoResetResponse)
def reset_demo_studio(
    _: RequireDeveloper,
    session: SessionDep,
    body: DemoResetRequest | None = None,
) -> DemoResetResponse:
    """§19.7 -- restore the fixture set from a versioned seed.

    G16 / SPEC §8.3 says every mutating endpoint accepts an optional Idempotency-Key.
    This one deliberately does not honour it: no dedup infrastructure exists anywhere in
    this codebase yet, and a full wipe-and-reseed converges to the same end state no
    matter how many times it runs, so there is nothing for a dedup layer to protect
    against here. A future endpoint that needs real request deduplication should build
    that infrastructure rather than copy this exemption.
    """
    version = (body.version if body else None) or LATEST_VERSION
    if version not in SEEDS:
        # .claude/rules/api.md wants {code, message, details?} at the TOP level of the
        # response. It lands nested under FastAPI's default "detail" wrapper instead,
        # because no exception handler exists anywhere in this app (`grep -rn
        # exception_handler app` is empty) -- a pre-existing, repo-wide gap this
        # endpoint is merely the first to expose. Closing it needs a global handler and
        # its own tests, out of scope here; flagged as recommended M1 work.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unknown_fixture_version",
                "message": f"no fixture set {version!r}",
                "details": {"available": sorted(SEEDS)},
            },
        )
    result = DemoStudioService.reset(session, version=version)
    session.commit()
    return DemoResetResponse(
        version=result.version,
        tables_wiped=list(result.tables_wiped),
        layers_seeded=list(result.layers_seeded),
    )


#: The webhook's path as OpenAPI names it. **Templated, not concrete.**
#: `openapi()["paths"]` is keyed by the route template, so testing a concrete
#: `/api/v1/webhooks/upay/<a-uuid>` against it can never match -- which is what made
#: `delivered` false for ever, the exact failure the OpenAPI check was chosen to avoid.
IPN_WEBHOOK_TEMPLATE = "/api/v1/webhooks/upay/{public_ref}"


@router.post("/upay/simulate-ipn", response_model=SimulateIpnResponse)
async def simulate_ipn(
    _: RequireDeveloper, body: SimulateIpnRequest, request: Request
) -> SimulateIpnResponse:
    """§19.5's fourth tool, and the one W4's exit gate is driven from.

    **It delivers.** It used to compute a payload, decide it could not be delivered, and
    return the query -- so `delivered: true` would have been a claim rather than an
    action even once the check passed. Now the payload is actually GET-ed at the webhook
    and the webhook's own status code comes back on the response, which is the difference
    between a tool that reports the pipeline works and one that reports it would.

    Delivery goes through the app's own ASGI stack rather than over the network: the same
    routing, the same middleware, the same database, and no dependence on knowing our own
    public origin or on a second worker being free to answer us. The webhook handler is
    sync, so Starlette runs it in a threadpool and awaiting it here cannot deadlock.

    The mounted check reads `request.app.openapi()["paths"]`, not `request.app.routes`:
    `include_router` mounts each discovered router through an opaque `_IncludedRouter`
    that exposes no `.routes` in this FastAPI version (tests/invariants/test_03
    documents the trap), so a `.routes` walk would report `False` forever. It is compared
    against `IPN_WEBHOOK_TEMPLATE` -- see that constant.

    Both dev headers are forwarded. The inner request is unauthenticated, so without
    `X-Dev-Now` a simulated IPN fired under a clock shift would be stamped at the real
    now while the order it settles lives in the travelled month; and on staging
    `X-Dev-Token` is what `dev_tools_allowed` checks, so the delivery inherits exactly
    the authority this caller already proved rather than asserting any of its own.
    """
    query = build_ipn_query(
        shape=body.shape,
        order_public_ref=body.order_public_ref,
        expected_amount_agorot=body.expected_amount_agorot,
        transaction_id=body.transaction_id or f"DEV-{body.order_public_ref.hex[:12]}",
    )
    path = f"/api/v1/webhooks/upay/{body.order_public_ref}"

    if IPN_WEBHOOK_TEMPLATE not in request.app.openapi()["paths"]:
        return SimulateIpnResponse(
            shape=body.shape,
            delivered=False,
            target_url=path,
            query=query,
            webhook_status=None,
            note=(
                f"nothing is mounted at {IPN_WEBHOOK_TEMPLATE}, so this is the payload "
                "that would have been sent"
            ),
        )

    # §5.10's weak signal, sent so a simulated delivery looks like a real one on the row
    # rather than arriving from nowhere. It is recorded and never gated on.
    headers = {"X-Forwarded-For": IPN_SOURCE_IP}
    for header in ("X-Dev-Now", "X-Dev-Token"):
        value = request.headers.get(header)
        if value is not None:
            headers[header] = value

    transport = httpx.ASGITransport(app=request.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ipn-simulator") as client:
        response = await client.get(path, params=query, headers=headers)

    return SimulateIpnResponse(
        shape=body.shape,
        delivered=True,
        target_url=path,
        query=query,
        webhook_status=response.status_code,
        note=f"delivered to the webhook, which answered {response.status_code}",
    )


# -- §19.4's role switcher ----------------------------------------------------
@router.get("/personas", response_model=PersonaListResponse)
def list_personas(_: RequireDeveloper, session: SessionDep) -> PersonaListResponse:
    """What the dev bar's dropdown renders.

    Only personas this environment would actually let you switch INTO -- the same rule
    the switch itself applies. Offering one that would be refused is a dropdown with a
    trapdoor in it.
    """
    return PersonaListResponse(
        items=[
            PersonaOut(
                key=persona.key,
                person_id=persona.person_id,
                studio_id=persona.studio_id,
                label=persona.label,
                roles=list(persona.roles),
                is_guardian=persona.is_guardian,
                tests=persona.tests,
            )
            for persona in switchable_personas(session, env=settings.ENV)
        ],
        no_student_persona_note=NO_STUDENT_PERSONA_NOTE,
    )


@router.post("/act-as/{person_id}", response_model=ActAsResponse)
def act_as(
    _: RequireDeveloper, person_id: uuid.UUID, request: Request, session: SessionDep
) -> ActAsResponse:
    """§19.4 -- the role switcher.

    **Mints a NEW access token; it does not mutate the caller's.** A switch is a new
    session shape, and rewriting a token in place would leave the previous one valid for
    up to fifteen more minutes -- one identity with two live personas, only one of which
    is in the audit trail.

    The refresh row is updated too, so the persona survives a rotation. Without that, the
    switch would silently revert the next time the access token expired, which on a
    fifteen-minute clock is the middle of whatever you were testing.
    """
    at = now()
    try:
        persona = resolve_persona(session, person_id=person_id, env=settings.ENV)
    except ActAsRefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "act_as_refused", "message": "this persona is not available here"},
        ) from exc

    identity_id = getattr(request.state, "identity_id", None)
    # §19.4 -- 'Every switch is audit-logged in the demo studio's own log.' An
    # impersonation feature in a system holding medical data about minors leaves a trail
    # or it is not a feature, it is a hole. The diff names the persona and its roles and
    # nothing else: G7 forbids health contents here, and there are none to put.
    AuditService.record(
        session,
        action="dev.act_as",
        entity_type="person",
        entity_id=persona.person_id,
        studio_id=persona.studio_id,
        actor_identity_id=identity_id if isinstance(identity_id, uuid.UUID) else None,
        diff={"persona": persona.key, "label": persona.label, "roles": list(persona.roles)},
    )

    presented = request.cookies.get(REFRESH_COOKIE_NAME)
    if presented:
        row = session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_secret(presented))
        ).scalar_one_or_none()
        if row is not None and row.revoked_at is None and row.used_at is None:
            row.acting_as_person_id = persona.person_id
            row.active_studio_id = persona.studio_id

    key = settings.JWT_SIGNING_KEY
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "auth_unconfigured", "message": "no signing key is configured"},
        )

    claims = AccessClaims(
        identity_id=identity_id if isinstance(identity_id, uuid.UUID) else uuid.uuid4(),
        person_id=persona.person_id,
        active_studio_id=persona.studio_id,
        acting_as_person_id=persona.person_id,
        # §19.4 -- 'the API resolves permissions from that Person exactly as it would for
        # a real login.' The roles are the PERSONA's, not the developer's: acting as the
        # assistant coach has to actually lose the manager's rights, or the persona that
        # exists to verify no financial data leaks proves nothing.
        roles=persona.roles,
        is_developer=True,
        studio_is_demo=persona.studio_is_demo,
        is_platform_admin=False,
        issued_at=at,
        expires_at=at + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES),
    )
    session.commit()
    return ActAsResponse(
        access_token=mint_access_token(claims, key=key.get_secret_value()),
        expires_in=settings.ACCESS_TOKEN_TTL_MINUTES * 60,
        acting_as_person_id=persona.person_id,
        persona_label=persona.label,
        studio_id=persona.studio_id,
        roles=list(persona.roles),
    )


@router.get("/sign-in-as/{persona_key}")
def sign_in_as(
    _: RequireDeveloper,
    persona_key: str,
    request: Request,
    session: SessionDep,
    app: str = "dashboard",
    return_path: str = "/",
) -> RedirectResponse:
    """§19.4's switcher, entered from a URL bar rather than from the dev bar.

    **Why this exists at all.** `POST /dev/act-as/{person_id}` already mints a persona
    session, but it returns a bearer token in a JSON body and a browser has nowhere to put
    one: `setAccessToken` is a module-scoped variable in
    `packages/core/src/identity/session.ts`, deliberately unreachable from a console, and
    `useSession` bootstraps from the §11.7 cookie alone. So the switcher could only ever
    be used *after* a real OAuth sign-in had already happened -- and on a machine where no
    client id is configured, `configured_providers()` is empty, the sign-in screen renders
    no buttons, and there is no first session to switch from. This route is the only way
    into the apps in that state.

    It therefore ends exactly where the OAuth callback's GET arm ends -- a refresh cookie
    and a redirect -- rather than inventing a second way to establish a session. The
    cookie is set by `set_refresh_cookie`, the same function the real callback uses, so
    `secure`/`httpOnly`/`SameSite` cannot drift between the two doors.

    **The refresh token is issued against the PERSONA's own identity**, not against a
    developer identity acting as them. Every §19.3 persona has a real `auth_identity` row
    (`demo-persona-*`), so `/auth/me` re-derives §6.1's access queries from the database
    for that person exactly as it would after a real login -- which is what makes the
    assistant-coach persona's "no financial data leaks" worth asserting.

    Hit it through the **app's own origin**, not the API's, so the cookie lands where the
    app will look for it:

        http://localhost:5175/api/v1/dev/sign-in-as/manager
    """
    # An open redirect out of a route that has just minted a session is a
    # credential-phishing primitive -- the user has authenticated and will trust wherever
    # they land. Same check, and the same reason, as `/auth/{provider}/start`.
    if not return_path.startswith("/") or return_path[1:2] in {"/", "\\"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_return_path", "message": "return_path must be app-relative"},
        )

    # Resolved from domains.json before anything is minted. An unknown app name is the
    # other half of the open-redirect defence: the destination is chosen from a table this
    # repository owns, never built from the query string.
    origin = app_origin(app, settings.ENV)
    if origin is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "unknown_app", "message": f"no host for {app!r}"},
        )

    at = now()
    # Ship-audit D3 -- the reserved `platform` key, which is a DOOR and not a persona:
    # §16's console sits above every studio, so it cannot be one of §19.3's nine, and
    # `/dev/personas` deliberately does not list it. It signs in the seeded developer
    # identity; whether that identity is a platform operator is the `platform_admin`
    # table's answer (seeded outside production by `seed_personas`, never writable by any
    # route), read by the same session derivation a real login uses. No studio in the
    # session: the platform operator works outside every tenant, and TenantSession's
    # fail-closed 401 on studio-scoped routes is correct for them.
    if persona_key == "platform":
        from app.models.identity import AuthIdentity, PlatformAdmin
        from app.services.demo.personas import DEVELOPER_IDENTITY_SUBJECT

        developer = session.execute(
            select(AuthIdentity).where(AuthIdentity.provider_subject == DEVELOPER_IDENTITY_SUBJECT)
        ).scalar_one_or_none()
        holds_it = developer is not None and (
            session.execute(
                select(PlatformAdmin.id).where(PlatformAdmin.auth_identity_id == developer.id)
            ).scalar_one_or_none()
            is not None
        )
        if developer is None or not holds_it:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "platform_admin_not_seeded",
                    "message": "reset the demo studio first: the developer identity holds "
                    "no platform_admin row yet",
                },
            )
        issued = issue_refresh_token(
            session,
            identity_id=developer.id,
            active_studio_id=None,
            acting_as_person_id=None,
            at=at,
        )
        AuditService.record(
            session,
            action="dev.sign_in_as",
            entity_type="auth_identity",
            entity_id=developer.id,
            studio_id=None,
            actor_identity_id=developer.id,
            diff={"persona": "platform", "label": "platform admin", "roles": []},
        )
        session.commit()
        redirect = RedirectResponse(
            f"{origin}{return_path}", status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )
        set_refresh_cookie(redirect, issued.secret)
        return redirect

    # `switchable_personas` and not a direct query: it applies §19.6 restriction 1 itself,
    # so a persona this caller could not switch INTO is not offered here either. A second
    # lookup would be a second place that rule could be forgotten.
    persona = next(
        (p for p in switchable_personas(session, env=settings.ENV) if p.key == persona_key), None
    )
    if persona is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_persona", "message": f"no persona {persona_key!r}"},
        )

    identity_id = persona.auth_identity_id
    if identity_id is None:
        # A §19.3 persona with no identity row cannot be signed in as, and silently
        # redirecting to a signed-out app would look like the sign-in failed for some
        # reason to do with the app. Say which half is missing.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "persona_has_no_identity",
                "message": f"persona {persona_key!r} has no auth identity to sign in as",
            },
        )

    issued = issue_refresh_token(
        session,
        identity_id=identity_id,
        active_studio_id=persona.studio_id,
        acting_as_person_id=persona.person_id,
        at=at,
    )

    # §19.4 -- 'Every switch is audit-logged in the demo studio's own log.' A route that
    # hands out a session in a single GET leaves a trail or it is not a developer tool.
    # The diff names the persona and its roles and nothing else: G7 forbids health
    # contents here, and there are none to put.
    AuditService.record(
        session,
        action="dev.sign_in_as",
        entity_type="person",
        entity_id=persona.person_id,
        studio_id=persona.studio_id,
        actor_identity_id=identity_id,
        diff={"persona": persona.key, "label": persona.label, "roles": list(persona.roles)},
    )
    session.commit()

    redirect = RedirectResponse(
        f"{origin}{return_path}", status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )
    set_refresh_cookie(redirect, issued.secret)
    return redirect
