"""infra/railway/README.md -- 'Every hostname lives in domains.json and nowhere else, so
the swap is one file.'

A literal origin in app/core/cors.py would be a second place, and on the day HB-domain
closes it would be the one nobody remembers to change. The README names this as M1's
work, alongside the OAuth redirect URIs.
"""

from __future__ import annotations

import json

from app.core.cors import DOMAINS_PATH, allowed_origins

HOSTS = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))["environments"]


def test_every_origin_comes_from_domains_json():
    origins = allowed_origins("staging")
    for app_name in ("staff", "parent", "dashboard"):
        assert HOSTS["staging"][app_name] in origins, app_name


def test_the_api_is_not_its_own_cors_origin():
    """A same-origin request needs no CORS entry, and listing the api host would make a
    misconfigured client appear to work."""
    assert HOSTS["staging"]["api"] not in allowed_origins("staging")


def test_development_allows_the_three_vite_ports():
    origins = allowed_origins("development")
    assert HOSTS["development"]["staff"] in origins
    assert HOSTS["development"]["parent"] in origins
    assert HOSTS["development"]["dashboard"] in origins


def test_test_resolves_to_the_development_origins():
    """`ENV=test` is the suite's own environment and has no entry of its own. Falling
    back to development is what lets a test client exercise the real middleware."""
    assert allowed_origins("test") == allowed_origins("development")


def test_production_never_allows_a_localhost_origin():
    """The one that matters. A dev origin left in the production allowlist is a
    credentialed cross-origin hole that no test of the happy path would notice."""
    assert not any("localhost" in origin for origin in allowed_origins("production"))


def test_a_placeholder_host_never_becomes_an_allowed_origin():
    """The rule this has always been about, now stated directly.

    It used to assert `allowed_origins("production") == []`, which was true only because
    domains.json carried `PENDING-production-services` for all four hosts. Production was
    populated on 2026-08-30 and that assertion started failing -- correctly, and for the
    best possible reason: the environment exists now.

    Rewriting it as "production is empty" would have been asserting the absence of the
    thing we just built. The invariant underneath never changed: a placeholder must not
    turn into an origin, because it would allowlist a hostname that does not exist -- and
    would allowlist the SAME one three times, so the list would look populated while
    protecting nothing. That is what is checked here, against a placeholder rather than
    against whichever environment happens to be unfinished today.
    """
    assert allowed_origins("nowhere") == []
    for origin in allowed_origins("production"):
        assert "PENDING" not in origin, origin
        assert origin.startswith("https://"), origin


def test_production_allowlists_its_three_apps_and_not_the_api():
    """Each app gets its own origin (they must not share origin-scoped IndexedDB), and
    the api is not among them -- an origin list is about who may CALL this server."""
    origins = allowed_origins("production")
    assert len(origins) == len(set(origins)) == 3, origins
    assert not any("api-" in origin for origin in origins), origins


def test_no_environment_allows_a_wildcard():
    """`allow_origins=['*']` and `allow_credentials=True` are mutually exclusive in the
    fetch spec, and the refresh cookie needs credentials. A wildcard here would not
    error -- it would silently stop the cookie being sent."""
    for env in ("development", "staging", "production", "test"):
        assert "*" not in allowed_origins(env)


def test_an_unknown_environment_is_empty_rather_than_permissive():
    """Failing closed. An environment name nobody wrote down should reach no client, not
    every client."""
    assert allowed_origins("nowhere") == []
