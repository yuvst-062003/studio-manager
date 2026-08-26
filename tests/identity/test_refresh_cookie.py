"""§11.7's cookie attributes, and the one of them that varies by environment.

`Secure` is not negotiable anywhere a real person signs in, and these tests exist so that
the single exception below cannot quietly become the rule.

**The exception.** Safari refuses a `Secure` cookie over plain `http://` and grants no
localhost exemption -- Chrome and Firefox do grant one, which is why this went unnoticed
until someone opened the local dashboard in Safari and got the language picker back. The
cookie was set, silently dropped, and `/auth/refresh` answered 401. Local development is
served over http, so on a developer's machine `Secure` does not protect a session; it
prevents there being one at all, in the browser that matters most for a product whose
§6.5 install story is iPhone-first.

So `Secure` is dropped in `development` and nowhere else. The environment is the
condition rather than the request's scheme on purpose: behind Railway's proxy the scheme
a request appears to arrive on depends on `X-Forwarded-Proto` being trusted, so keying on
it would mean one proxy misconfiguration silently unsets `Secure` in production. An
explicit environment check cannot fail that way -- it fails loudly, in a test, here.
"""

from __future__ import annotations

import pytest
from app.core.config import settings
from app.services.identity.refresh import REFRESH_COOKIE_PATH, set_refresh_cookie
from fastapi import Response


def _header(env: str, monkeypatch) -> str:
    monkeypatch.setattr(settings, "ENV", env)
    response = Response()
    set_refresh_cookie(response, "a-secret")
    header = response.headers.get("set-cookie")
    assert header is not None, "no cookie was set at all"
    return header


# -- the attribute that varies -------------------------------------------------
@pytest.mark.parametrize("env", ["staging", "production"])
def test_the_cookie_is_secure_everywhere_a_real_person_signs_in(env, monkeypatch):
    assert "Secure" in _header(env, monkeypatch)


def test_the_cookie_is_not_secure_in_development(monkeypatch):
    """The exception, asserted so it is a decision rather than an accident.

    Without this, Safari cannot hold a session on http://localhost and the dev sign-in
    route is unusable in it -- see this module's docstring.
    """
    assert "Secure" not in _header("development", monkeypatch)


# -- the attributes that never vary --------------------------------------------
@pytest.mark.parametrize("env", ["development", "staging", "production"])
def test_httponly_never_varies(env, monkeypatch):
    """§11.7's actual defence. `Secure` protects the cookie in transit; `HttpOnly` is what
    keeps an XSS from reading it, and no environment has an excuse to drop it."""
    assert "HttpOnly" in _header(env, monkeypatch)


@pytest.mark.parametrize("env", ["development", "staging", "production"])
def test_samesite_and_path_never_vary(env, monkeypatch):
    header = _header(env, monkeypatch)
    assert "SameSite=lax" in header
    # Scoped to the one endpoint that reads it. Widening this would send the refresh
    # token on every API call for no benefit.
    assert f"Path={REFRESH_COOKIE_PATH}" in header


def test_there_is_never_a_domain_attribute(monkeypatch):
    """infra/railway/README.md's fourth requirement: host-only.

    A `Domain=` would make a staging session valid against production, and it is the
    first thing someone reaches for when a cookie will not stick on Railway's generated
    subdomains -- where it cannot help anyway, because Domain cannot cross a public
    suffix. Asserted in development too, since that is where the temptation now lives.
    """
    for env in ("development", "staging", "production"):
        assert "Domain=" not in _header(env, monkeypatch)
