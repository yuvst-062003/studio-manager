"""SPEC §5.2 -- the two providers, and the only place in this codebase that talks to them.

Two rules the rest of the identity layer depends on:

* **Network lives here.** `authorization_url` is pure string-building; `exchange` is the
  one function that opens a socket. Every other module in this vertical is testable
  without one because of that split, and `FakeProvider` is what they use.
* **Never a webview.** §5.2: "Google returns `disallowed_useragent`. An installed PWA
  does not use one -- the flow is a standard top-level redirect." Nothing here opens an
  embedded browser and nothing may be added that does.

`AppleProvider` is complete and cannot be configured. Sign in with Apple **for the web**
needs a Services ID, a `.p8` key and an ES256 client-secret JWT you sign yourself -- all
behind a paid Apple Developer Program membership, which §6.5 dropped when it dropped the
store builds. It is built rather than deferred because §5.2 says retrofitting Apple later
would be an identity migration; `configured_providers()` simply does not offer it until
the settings exist, so no user meets a button that fails after they have committed to it.
Tracked as HB-apple-developer.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com"

GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUER = "https://accounts.google.com"

APPLE_AUTHORIZE = "https://appleid.apple.com/auth/authorize"
APPLE_TOKEN = "https://appleid.apple.com/auth/token"
APPLE_JWKS = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

#: A sign-in the user is watching. Long enough for a slow provider, short enough that a
#: hung exchange does not hold a worker while they stare at a spinner.
_HTTP_TIMEOUT = httpx.Timeout(10.0)


@dataclass(frozen=True)
class ProviderIdentity:
    """What a successful exchange yields.

    Deliberately small: a provider tells us **who signed in**, and nothing about what
    they may do here. Everything about permission is resolved from our own tables
    (§3.1's "a query, not a role check").
    """

    provider: str
    subject: str
    email: str | None
    email_verified: bool
    is_private_relay: bool

    @classmethod
    def from_claims(
        cls, *, provider: str, subject: str, email: str | None, email_verified: bool
    ) -> ProviderIdentity:
        # Compared on the domain after the last '@', lower-cased. Not `endswith`: a
        # lookalike domain such as `notprivaterelay.appleid.com.example.invalid` would
        # satisfy a substring test and be treated as a relay -- or, worse, an address at
        # `evil-privaterelay.appleid.com` would not be, and §5.2's "never used for
        # matching" would stop applying to the case it most needs to.
        domain = email.rsplit("@", 1)[-1].lower() if email and "@" in email else ""
        return cls(
            provider=provider,
            subject=subject,
            email=email,
            email_verified=email_verified,
            is_private_relay=domain == APPLE_PRIVATE_RELAY_DOMAIN,
        )


class OAuthProvider(Protocol):
    # A read-only property, not `name: str`. A bare annotation makes the protocol member
    # SETTABLE, and the two real providers are frozen dataclasses -- so every one of them
    # failed to satisfy their own protocol. Nothing assigns to `.name` anyway.
    @property
    def name(self) -> str: ...

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str: ...

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity: ...


def new_pkce_pair() -> tuple[str, str]:
    """RFC 7636 S256.

    The verifier stays server-side (`oauth_transaction.code_verifier`); only the
    challenge is ever sent. `token_urlsafe(64)` yields ~86 characters, inside RFC 7636's
    43-128 window with room to spare.
    """
    verifier = secrets.token_urlsafe(64)[:128]
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )
    return verifier, challenge


def _verify_id_token(raw: str, *, jwks_uri: str, issuer: str, audience: str) -> dict[str, Any]:
    """Verify a provider's id_token against its published keys.

    The signature is the whole point: the token arrives over a channel we initiated, but
    the *claims* inside it are what we turn into an account, so they have to be proven to
    come from the provider rather than merely to have arrived from its direction.
    """
    signing_key = PyJWKClient(jwks_uri).get_signing_key_from_jwt(raw)
    decoded: dict[str, Any] = jwt.decode(
        raw,
        signing_key.key,
        # An explicit list, for the same reason app/services/identity/tokens.py pins
        # one: trusting the header's own `alg` is what makes alg=none work. Google signs
        # RS256 and Apple ES256, so both are named and nothing else is.
        algorithms=["RS256", "ES256"],
        audience=audience,
        issuer=issuer,
    )
    return decoded


@dataclass(frozen=True)
class GoogleProvider:
    client_id: str
    client_secret: str
    name: str = "google"

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return f"{GOOGLE_AUTHORIZE}?" + urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": code_challenge,
                # Without this the provider falls back to `plain` and the verifier goes
                # over the wire -- the exact thing PKCE exists to prevent -- and nothing
                # in the response says it happened.
                "code_challenge_method": "S256",
                # §3.3's premise is one identity across studios, and a household sharing
                # a laptop is common. Forcing the chooser stops a parent silently
                # signing in as whoever used it last.
                "prompt": "select_account",
            }
        )

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        response = httpx.post(
            GOOGLE_TOKEN,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            timeout=_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        claims = _verify_id_token(
            response.json()["id_token"],
            jwks_uri=GOOGLE_JWKS,
            issuer=GOOGLE_ISSUER,
            audience=self.client_id,
        )
        return ProviderIdentity.from_claims(
            provider=self.name,
            subject=claims["sub"],
            email=claims.get("email"),
            email_verified=bool(claims.get("email_verified", False)),
        )


@dataclass(frozen=True)
class AppleProvider:
    """Complete, and unconfigurable until HB-apple-developer closes.

    Apple's "client secret" is not a string -- it is an ES256 JWT you sign yourself with
    a `.p8` key from the developer portal, valid for at most six months. That is exactly
    why this provider needs a Developer Program membership and Google does not.
    """

    client_id: str
    team_id: str
    key_id: str
    private_key: str
    name: str = "apple"

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return f"{APPLE_AUTHORIZE}?" + urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "name email",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                # Apple POSTs the callback whenever `name` or `email` is in scope.
                # Getting this wrong is a 405 on the callback and no other clue.
                "response_mode": "form_post",
            }
        )

    def _client_secret(self, *, at: int) -> str:
        return jwt.encode(
            {
                "iss": self.team_id,
                "iat": at,
                "exp": at + 3600,
                "aud": APPLE_ISSUER,
                "sub": self.client_id,
            },
            self.private_key,
            algorithm="ES256",
            headers={"kid": self.key_id},
        )

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        # `time.time()` and not app.core.clock.now(): this timestamp is Apple's, not
        # ours. A client secret minted under a shifted dev clock would be rejected by
        # their server as expired or immature, so §19.5's time travel must NOT reach it.
        response = httpx.post(
            APPLE_TOKEN,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self._client_secret(at=int(time.time())),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            timeout=_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        claims = _verify_id_token(
            response.json()["id_token"],
            jwks_uri=APPLE_JWKS,
            issuer=APPLE_ISSUER,
            audience=self.client_id,
        )
        # Apple sends email_verified as the STRING "true", not a boolean. bool("false")
        # is True in Python, so reading it directly would mark every Apple address
        # verified -- and §5.2 links accounts on exactly that field.
        return ProviderIdentity.from_claims(
            provider=self.name,
            subject=claims["sub"],
            email=claims.get("email"),
            email_verified=str(claims.get("email_verified", "false")).lower() == "true",
        )


class FakeProvider:
    """What every downstream test signs in with.

    It lives beside the real providers rather than in a conftest because the router, the
    resolution service and the personas layer all need it, and a fixture three test
    modules import from each other's conftest is worse than one class sitting next to the
    thing it stands in for. `configured_providers()` never returns it, and a test asserts
    that, so it is unreachable at runtime.
    """

    name = "fake"

    def __init__(self) -> None:
        self._codes: dict[str, ProviderIdentity] = {}

    def register(
        self, *, code: str, subject: str, email: str | None, email_verified: bool = True
    ) -> None:
        self._codes[code] = ProviderIdentity.from_claims(
            provider=self.name, subject=subject, email=email, email_verified=email_verified
        )

    def authorization_url(self, *, state: str, code_challenge: str, redirect_uri: str) -> str:
        return "https://fake.invalid/authorize?" + urlencode(
            {"state": state, "code_challenge": code_challenge, "redirect_uri": redirect_uri}
        )

    def exchange(self, *, code: str, code_verifier: str, redirect_uri: str) -> ProviderIdentity:
        if code not in self._codes:
            raise ValueError(f"unregistered code {code!r}")
        return self._codes[code]


def configured_providers() -> dict[str, OAuthProvider]:
    """Only providers whose credentials are actually present.

    A provider offered but unconfigured is a button that fails one step *after* the user
    has picked their account, which is worse than a button that is not there. Both halves
    of each credential are required for the same reason: a client id with no secret dies
    at the token exchange, after the user has already committed.
    """
    providers: dict[str, OAuthProvider] = {}
    if settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET:
        providers["google"] = GoogleProvider(
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET.get_secret_value(),
        )
    if (
        settings.APPLE_OAUTH_CLIENT_ID
        and settings.APPLE_OAUTH_TEAM_ID
        and settings.APPLE_OAUTH_KEY_ID
        and settings.APPLE_OAUTH_PRIVATE_KEY
    ):
        providers["apple"] = AppleProvider(
            client_id=settings.APPLE_OAUTH_CLIENT_ID,
            team_id=settings.APPLE_OAUTH_TEAM_ID,
            key_id=settings.APPLE_OAUTH_KEY_ID,
            private_key=settings.APPLE_OAUTH_PRIVATE_KEY.get_secret_value(),
        )
    return providers
