"""SPEC 5.2 -- 'OAuth must never run inside a webview. Google returns
disallowed_useragent. An installed PWA does not use one -- the flow is a standard
top-level redirect, then PKCE code exchange server-side.'

Network is confined to `exchange`, and every test here drives the fake. The one thing
worth asserting about the real providers without a socket is the URL they build: a
missing `code_challenge_method=S256` downgrades PKCE to `plain` silently, which sends the
verifier over the wire -- the exact thing PKCE exists to prevent -- and nothing in the
provider's response says it happened.
"""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import pytest
from app.services.identity.providers import (
    APPLE_PRIVATE_RELAY_DOMAIN,
    AppleProvider,
    FakeProvider,
    GoogleProvider,
    ProviderIdentity,
    configured_providers,
    new_pkce_pair,
)


def _query(url: str) -> dict[str, list[str]]:
    return parse_qs(urlparse(url).query)


def test_the_pkce_challenge_is_the_s256_of_the_verifier():
    """A challenge that is not the hash is one the provider rejects with an error that
    names neither half."""
    verifier, challenge = new_pkce_pair()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )
    assert challenge == expected


def test_two_pkce_pairs_are_never_the_same():
    assert new_pkce_pair()[0] != new_pkce_pair()[0]


def test_the_verifier_is_within_rfc_7636s_length_bounds():
    """43-128 characters. A short verifier is brute-forcible and some providers reject it
    with an error naming nothing useful."""
    verifier, _ = new_pkce_pair()
    assert 43 <= len(verifier) <= 128


def test_googles_authorization_url_pins_s256():
    query = _query(
        GoogleProvider(client_id="cid", client_secret="sec").authorization_url(
            state="st", code_challenge="ch", redirect_uri="https://api.example.invalid/cb"
        )
    )
    assert query["code_challenge_method"] == ["S256"]
    assert query["code_challenge"] == ["ch"]
    assert query["state"] == ["st"]
    assert query["response_type"] == ["code"]
    assert "openid" in query["scope"][0]
    assert "email" in query["scope"][0]


def test_googles_authorization_url_is_a_top_level_redirect_to_google():
    """5.2 -- never a webview. The host is asserted because a typo here is a phishing
    page that still appears to work."""
    url = GoogleProvider(client_id="cid", client_secret="sec").authorization_url(
        state="st", code_challenge="ch", redirect_uri="https://api.example.invalid/cb"
    )
    assert urlparse(url).netloc == "accounts.google.com"
    assert urlparse(url).scheme == "https"


def test_apples_authorization_url_asks_for_a_form_post():
    """Apple POSTs the callback whenever `name` or `email` is in scope. Getting this
    wrong is a 405 on the callback and no other clue."""
    url = AppleProvider(
        client_id="cid", team_id="team", key_id="kid", private_key="-----BEGIN"
    ).authorization_url(state="st", code_challenge="ch", redirect_uri="https://x.invalid/cb")
    assert _query(url)["response_mode"] == ["form_post"]
    assert urlparse(url).netloc == "appleid.apple.com"


def test_apple_pins_s256_too():
    url = AppleProvider(
        client_id="cid", team_id="team", key_id="kid", private_key="-----BEGIN"
    ).authorization_url(state="st", code_challenge="ch", redirect_uri="https://x.invalid/cb")
    assert _query(url)["code_challenge_method"] == ["S256"]


def test_an_apple_private_relay_address_is_recognised():
    """5.2 -- 'Apple's private-relay addresses are stored as-is and never used for
    matching.' Recognising them is what makes the second half possible."""
    identity = ProviderIdentity.from_claims(
        provider="apple",
        subject="001",
        email=f"abc123@{APPLE_PRIVATE_RELAY_DOMAIN}",
        email_verified=True,
    )
    assert identity.is_private_relay is True
    assert identity.email == f"abc123@{APPLE_PRIVATE_RELAY_DOMAIN}"


@pytest.mark.parametrize(
    "email",
    [
        "real@example.invalid",
        # Not a relay: the domain is a lookalike, and a substring match would say it is.
        "someone@notprivaterelay.appleid.com.example.invalid",
        None,
    ],
)
def test_an_ordinary_address_is_not_a_private_relay(email):
    identity = ProviderIdentity.from_claims(
        provider="apple", subject="001", email=email, email_verified=True
    )
    assert identity.is_private_relay is False


def test_a_relay_address_is_recognised_regardless_of_case():
    """Domains are case-insensitive, and a provider that upper-cased one would otherwise
    slip past the check that stops it being used for matching."""
    identity = ProviderIdentity.from_claims(
        provider="apple", subject="001", email="ABC@PrivateRelay.AppleID.com", email_verified=True
    )
    assert identity.is_private_relay is True


def test_the_fake_provider_round_trips_a_code_into_an_identity():
    """The fake is what every downstream test signs in with, so its contract is pinned
    here rather than discovered in a router test."""
    fake = FakeProvider()
    fake.register(code="code-1", subject="sub-1", email="a@example.invalid", email_verified=True)
    assert fake.exchange(
        code="code-1", code_verifier="v", redirect_uri="https://x/cb"
    ) == ProviderIdentity(
        provider="fake",
        subject="sub-1",
        email="a@example.invalid",
        email_verified=True,
        is_private_relay=False,
    )


def test_the_fake_rejects_an_unregistered_code():
    with pytest.raises(ValueError):
        FakeProvider().exchange(code="nope", code_verifier="v", redirect_uri="https://x/cb")


def test_no_provider_is_offered_when_nothing_is_configured(monkeypatch):
    """A button for a provider whose credentials are absent fails AFTER the user has
    committed to it, which is worse than no button. This is also what keeps Apple
    invisible until HB-apple-developer closes."""
    from app.core.config import settings

    for name in (
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "APPLE_OAUTH_CLIENT_ID",
        "APPLE_OAUTH_TEAM_ID",
        "APPLE_OAUTH_KEY_ID",
        "APPLE_OAUTH_PRIVATE_KEY",
    ):
        monkeypatch.setattr(settings, name, None)
    assert configured_providers() == {}


def test_google_is_offered_only_when_both_halves_are_set(monkeypatch):
    """A client id with no secret is a flow that dies at the token exchange, one step
    after the user has already picked their Google account."""
    from app.core.config import settings
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", None)
    monkeypatch.setattr(settings, "APPLE_OAUTH_CLIENT_ID", None)
    assert "google" not in configured_providers()

    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", SecretStr("sec"))
    assert "google" in configured_providers()


def test_the_fake_is_never_reachable_at_runtime(monkeypatch):
    """It lives beside the real providers so three test modules can import it from one
    place, but nothing in production may resolve it."""
    from app.core.config import settings
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", SecretStr("sec"))
    assert "fake" not in configured_providers()
