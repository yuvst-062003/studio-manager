"""SPEC §5.2 and §6.1 -- the auth surface.

Two things worth reading before editing this file.

**The cookie is built exactly as §11.7 specifies and is EXPECTED TO FAIL on staging.**
`up.railway.app` is on the Public Suffix List, so the app hosts and the api host are
different *sites*; a host-only cookie is third-party across them and Safari drops it, so
a session dies at the fifteen-minute JWT expiry and cannot renew. That is `HB-domain`
reporting itself, not a defect here. The workaround -- moving the refresh token into
IndexedDB and sending it as a bearer header -- contradicts §11.7 and is strictly weaker,
because an XSS can read IndexedDB and cannot read an httpOnly cookie. **Do not take it.**
See infra/railway/README.md § The domain.

**These routes run before a studio exists.** They take `SessionDep` -- a plain, unscoped
Session -- and not `TenantSessionDep`, because §3.3 requires one identity to reach several
studios and there is no tenant in context between the redirect out and the callback back.
Every query they run goes through app/services/identity/resolution.py, which wraps each
one in `with_all_tenants(reason=...)`. Every OTHER router in this application takes
`TenantSessionDep` and fails closed.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.core.clock import now
from app.core.config import settings
from app.core.db import SessionDep
from app.models.identity import OAuthTransaction
from app.schemas.identity import (
    APPS,
    AppAccessOut,
    CallbackRequest,
    MeResponse,
    ProviderListResponse,
    ProviderOut,
    SessionResponse,
    StudioMembershipOut,
    SwitchStudioRequest,
)
from app.services.identity.providers import OAuthProvider, configured_providers, new_pkce_pair
from app.services.identity.refresh import (
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    RefreshRejectedError,
    hash_refresh_secret,
    issue_refresh_token,
    revoke_family,
    rotate_refresh_token,
)
from app.services.identity.resolution import (
    InvitationRejectedError,
    StudioMembership,
    accept_invitation,
    app_access,
    effective_identity_id,
    is_platform_admin,
    studios_for_identity,
    upsert_identity,
)
from app.services.identity.tokens import AccessClaims, mint_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["identity"])

#: A sign-in the user is actively walking through. Long enough to read a consent screen,
#: short enough that an abandoned transaction is not a standing invitation.
_TRANSACTION_TTL = timedelta(minutes=10)


def get_providers() -> dict[str, OAuthProvider]:
    """A dependency rather than a direct call, so tests can override it with the fake and
    exercise the same wiring production resolves through."""
    return configured_providers()


ProvidersDep = Annotated[dict[str, OAuthProvider], Depends(get_providers)]


def _set_refresh_cookie(response: Response, secret: str) -> None:
    """§11.7 -- 'secure/httpOnly/SameSite cookies for the refresh token', plus
    infra/railway/README.md's fourth requirement: host-only.

    **There is no `domain=` here and there must never be one.** That is not an omission.
    A Domain attribute would make a staging session valid against production, and it is
    also the first thing someone reaches for when the cookie stops flowing on Railway's
    generated subdomains -- where it would not help anyway, because Domain cannot cross a
    public suffix. The fix for that is the domain (HB-domain), not this line.
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=secret,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=True,
        samesite="lax",
    )


def _membership_out(membership: StudioMembership) -> StudioMembershipOut:
    return StudioMembershipOut(
        studio_id=membership.studio_id,
        studio_name=membership.studio_name,
        studio_is_demo=membership.studio_is_demo,
        person_id=membership.person_id,
        roles=list(membership.roles),
        is_guardian=membership.is_guardian,
    )


def _signing_key() -> str:
    key = settings.JWT_SIGNING_KEY
    if key is None:
        # A deployment with no signing key cannot mint a session, and minting one under a
        # default would be far worse than refusing. 503 rather than 500: this is a
        # configuration state, not a crash.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "auth_unconfigured", "message": "no signing key is configured"},
        )
    return key.get_secret_value()


def _build_session(
    session: SessionDep,
    response: Response,
    *,
    identity_id: uuid.UUID,
    is_developer: bool,
    is_platform_admin: bool,
    active_studio_id: uuid.UUID | None,
    acting_as_person_id: uuid.UUID | None = None,
    refresh_secret: str | None = None,
) -> SessionResponse:
    """Everything a fresh session needs, assembled once.

    Both the callback and switch-studio produce a session, and a second copy of this
    would be a second place for the claim set to drift.
    """
    at = now()
    memberships = studios_for_identity(session, identity_id)
    active = next((m for m in memberships if m.studio_id == active_studio_id), None)
    access = app_access(session, [m.person_id for m in memberships])

    if refresh_secret is not None:
        _set_refresh_cookie(response, refresh_secret)

    claims = AccessClaims(
        identity_id=identity_id,
        person_id=active.person_id if active else None,
        active_studio_id=active.studio_id if active else None,
        acting_as_person_id=acting_as_person_id,
        roles=active.roles if active else (),
        is_developer=is_developer,
        studio_is_demo=active.studio_is_demo if active else False,
        is_platform_admin=is_platform_admin,
        issued_at=at,
        expires_at=at + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES),
    )
    return SessionResponse(
        access_token=mint_access_token(claims, key=_signing_key()),
        expires_in=settings.ACCESS_TOKEN_TTL_MINUTES * 60,
        access=AppAccessOut(staff=access.staff, parent=access.parent),
        studios=[_membership_out(m) for m in memberships],
        active_studio_id=claims.active_studio_id,
    )


@router.get("/providers", response_model=ProviderListResponse)
def list_providers(providers: ProvidersDep) -> ProviderListResponse:
    """The sign-in buttons the client may render.

    Only configured providers. §5.2 keeps Apple in scope and HB-apple-developer keeps it
    unconfigurable, so this is what stops an Apple button appearing on a deployment that
    cannot complete an Apple sign-in.
    """
    return ProviderListResponse(
        items=[
            ProviderOut(name=name, start_url=f"/api/v1/auth/{name}/start")
            for name in sorted(providers)
        ]
    )


@router.get("/{provider}/start")
def start(
    provider: str,
    providers: ProvidersDep,
    session: SessionDep,
    app: str = "parent",
    return_path: str = "/",
) -> RedirectResponse:
    """§5.2 -- 'a standard top-level redirect, then PKCE code exchange server-side.'

    A 307 to the provider and never a rendered interstitial: an interstitial is one step
    closer to a webview, and Google answers `disallowed_useragent` inside one.
    """
    if provider not in providers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_provider", "message": f"no provider {provider!r}"},
        )
    if app not in APPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "unknown_app", "message": f"app must be one of {list(APPS)}"},
        )
    # An open redirect on the way OUT of an OAuth flow is a credential-phishing
    # primitive: the user has just authenticated and will trust wherever they land. A
    # single leading slash, and no second slash or backslash after it -- `//evil.invalid`
    # and `/\evil.invalid` are both protocol-relative URLs that browsers follow offsite.
    if not return_path.startswith("/") or return_path[1:2] in {"/", "\\"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_return_path", "message": "return_path must be app-relative"},
        )

    verifier, challenge = new_pkce_pair()
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE_URL}/api/v1/auth/{provider}/callback"
    session.add(
        OAuthTransaction(
            state=state,
            provider=provider,
            code_verifier=verifier,
            redirect_uri=redirect_uri,
            app=app,
            return_path=return_path,
            expires_at=now() + _TRANSACTION_TTL,
        )
    )
    session.commit()
    return RedirectResponse(
        providers[provider].authorization_url(
            state=state, code_challenge=challenge, redirect_uri=redirect_uri
        ),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )


@router.post("/{provider}/callback", response_model=SessionResponse)
def callback(
    provider: str,
    body: CallbackRequest,
    response: Response,
    providers: ProvidersDep,
    session: SessionDep,
) -> SessionResponse:
    """§5.2's server-side exchange, and §6.1 step 3's identity resolution."""
    if provider not in providers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_provider", "message": f"no provider {provider!r}"},
        )

    at = now()
    transaction = session.execute(
        select(OAuthTransaction).where(OAuthTransaction.state == body.state)
    ).scalar_one_or_none()
    # One rejection for four causes -- unknown, already used, expired, or issued for a
    # different provider. The state is this flow's entire CSRF defence, and distinguishing
    # them would tell an attacker which half of a guess was right.
    if (
        transaction is None
        or transaction.consumed_at is not None
        or transaction.provider != provider
        or at >= transaction.expires_at
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_state", "message": "this sign-in cannot be completed"},
        )
    # Consumed before the exchange, not after: a provider call that fails partway must
    # still burn the state, or a retry loop becomes a replay window.
    transaction.consumed_at = at

    try:
        provider_identity = providers[provider].exchange(
            code=body.code,
            code_verifier=transaction.code_verifier,
            redirect_uri=transaction.redirect_uri,
        )
    except Exception as exc:
        # A provider refusing the exchange is an ordinary outcome -- a user who took too
        # long, a replayed code -- and must not surface as a server fault. Logged as
        # `extra=`, never interpolated: an f-string has no key for the scrubber to match.
        logger.warning("oauth exchange failed", extra={"provider": provider, "error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "exchange_failed", "message": "this sign-in cannot be completed"},
        ) from exc

    identity = upsert_identity(session, provider_identity, at=at)
    resolved_id = effective_identity_id(identity)

    if body.invitation_token is not None:
        try:
            accept_invitation(session, token=body.invitation_token, identity_id=resolved_id, at=at)
        except InvitationRejectedError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invitation_rejected", "message": "this invitation is not valid"},
            ) from exc

    memberships = studios_for_identity(session, resolved_id)
    # §5.2 -- the switcher exists only when there is a choice, so a single membership is
    # activated here and several are left for the user to pick between.
    active_studio_id = memberships[0].studio_id if len(memberships) == 1 else None

    issued = issue_refresh_token(
        session,
        identity_id=resolved_id,
        active_studio_id=active_studio_id,
        acting_as_person_id=None,
        at=at,
    )
    result = _build_session(
        session,
        response,
        identity_id=resolved_id,
        is_developer=identity.is_developer,
        is_platform_admin=is_platform_admin(session, resolved_id),
        active_studio_id=active_studio_id,
        refresh_secret=issued.secret,
    )
    session.commit()
    return result


@router.get("/me", response_model=MeResponse)
def me(request: Request, session: SessionDep) -> MeResponse:
    """§6.1's resolve step.

    `access` and `studios` are re-derived from the database rather than read off the
    token. §3.1's "a query, not a role check" is only true if this endpoint asks -- a
    cached answer here is how a revoked coach keeps their app for fifteen more minutes.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    memberships = studios_for_identity(session, identity_id)

    # §19.4 -- 'the API resolves permissions from that Person exactly as it would for a
    # real login.' While a persona is active, §6.1's two access queries have to ask about
    # the PERSONA, not about the developer's own identity -- otherwise the switcher looks
    # like it works (the token carries the right roles) while every screen that reads
    # /auth/me shows the developer's access instead. dev+both is what caught it: it is
    # the only persona whose answer differs from the developer's in both directions.
    acting_as = getattr(request.state, "acting_as_person_id", None)
    subject_person_ids = (
        [acting_as] if isinstance(acting_as, uuid.UUID) else [m.person_id for m in memberships]
    )
    access = app_access(session, subject_person_ids)
    return MeResponse(
        identity_id=identity_id,
        access=AppAccessOut(staff=access.staff, parent=access.parent),
        studios=[_membership_out(m) for m in memberships],
        active_studio_id=getattr(request.state, "studio_id", None),
        dev_tools=bool(getattr(request.state, "is_developer", False)),
        acting_as_person_id=getattr(request.state, "acting_as_person_id", None),
    )


@router.post("/refresh", response_model=SessionResponse)
def refresh(request: Request, response: Response, session: SessionDep) -> SessionResponse:
    """§5.2's rotation.

    Every failure is the same 401 with no reason. `RefreshRejectedError.reason` goes to
    the log and nowhere else: telling a caller *why* their token failed tells an attacker
    whether the token existed at all.
    """
    presented = request.cookies.get(REFRESH_COOKIE_NAME)
    if not presented:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "no_session", "message": "sign in again"},
        )
    try:
        issued = rotate_refresh_token(session, presented=presented, at=now())
    except RefreshRejectedError as exc:
        session.commit()  # a reuse or denylist rejection revoked a family; keep it
        logger.info("refresh rejected", extra={"reason": exc.reason})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "no_session", "message": "sign in again"},
        ) from exc

    from app.models.identity import AuthIdentity

    identity = session.get(AuthIdentity, issued.row.auth_identity_id)
    result = _build_session(
        session,
        response,
        identity_id=issued.row.auth_identity_id,
        is_developer=bool(identity and identity.is_developer),
        is_platform_admin=is_platform_admin(session, issued.row.auth_identity_id),
        active_studio_id=issued.row.active_studio_id,
        acting_as_person_id=issued.row.acting_as_person_id,
        refresh_secret=issued.secret,
    )
    session.commit()
    return result


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, session: SessionDep) -> Response:
    """Ends the session server-side, not merely locally.

    Revoking the family is what makes this different from clearing a cookie: a copy of
    the cookie taken before logout would otherwise still refresh.
    """
    presented = request.cookies.get(REFRESH_COOKIE_NAME)
    if presented:
        from app.models.identity import RefreshToken

        row = session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_secret(presented))
        ).scalar_one_or_none()
        if row is not None:
            revoke_family(session, row.family_id, at=now(), reason="logout")
        session.commit()
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/switch-studio", response_model=SessionResponse)
def switch_studio(
    body: SwitchStudioRequest, request: Request, response: Response, session: SessionDep
) -> SessionResponse:
    """§5.2 -- 'A person belonging to more than one studio gets a studio switcher.'

    The target is checked against this identity's own memberships. A switch endpoint that
    trusted its input would be a cross-tenant read with a friendly name.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    if body.studio_id not in {m.studio_id for m in studios_for_identity(session, identity_id)}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_your_studio", "message": "this studio is not yours"},
        )

    presented = request.cookies.get(REFRESH_COOKIE_NAME)
    refresh_secret = None
    if presented:
        try:
            issued = rotate_refresh_token(session, presented=presented, at=now())
        except RefreshRejectedError as exc:
            session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "no_session", "message": "sign in again"},
            ) from exc
        # The studio lives on the refresh row, so the new session survives a rotation.
        issued.row.active_studio_id = body.studio_id
        refresh_secret = issued.secret

    from app.models.identity import AuthIdentity

    identity = session.get(AuthIdentity, identity_id)
    result = _build_session(
        session,
        response,
        identity_id=identity_id,
        is_developer=bool(identity and identity.is_developer),
        is_platform_admin=is_platform_admin(session, identity_id),
        active_studio_id=body.studio_id,
        refresh_secret=refresh_secret,
    )
    session.commit()
    return result
