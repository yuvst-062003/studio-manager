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


def test_every_host_in_an_environment_shares_one_registrable_domain():
    """The rule production violated for a whole afternoon, now enforced.

    The refresh cookie is `SameSite=Lax` and host-only, so a browser will not send it
    across SITES -- and `up.railway.app` is on the Public Suffix List, which makes every
    Railway hostname its own registrable domain. Production on Railway hostnames therefore
    could not hold a session at all: sign-in completed, the API set the cookie on its own
    host, the browser refused to send it back, and the app returned to its sign-in screen.
    A login loop with nothing in it naming the cause.

    Checked as "the last two labels match" rather than against a real public-suffix list:
    a dependency for four hostnames is not worth it, and the shapes here are
    `x.gladiatorclub.co.il` and `localhost:PORT`. What matters is that a MIXTURE cannot
    pass -- `staff.gladiatorclub.co.il` alongside `api-production-x.up.railway.app` fails
    this, which is the arrangement that broke.
    """
    for env, hosts in HOSTS.items():
        sites = set()
        for url in hosts.values():
            host = url.split("//", 1)[-1].split("/")[0].split(":")[0]
            sites.add(".".join(host.split(".")[-2:]) if "." in host else host)
        assert len(sites) == 1, f"{env}: hosts span more than one site -- {sites}"


def test_the_transitional_allowlist_is_gone():
    """It existed only while production's certificates issued one at a time, and
    domains.json carried its removal condition. Every certificate has issued, so the
    split it bridged no longer exists -- and a temporary widening of a CORS allowlist that
    outlives its reason is just a permanently wider allowlist nobody decided on."""
    raw = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))
    assert "transitional_origins" not in raw
    assert allowed_origins("nowhere") == []


def test_app_origin_still_names_exactly_one_host_per_app():
    """`app_origin` decides where OAuth sends a freshly signed-in user. The transitional
    list widens what the API ACCEPTS and must never widen where it SENDS people -- a
    redirect to a host whose certificate has not issued is a dead end at the one moment a
    user has just proved who they are."""
    from app.core.cors import app_origin

    for app in ("staff", "parent", "dashboard"):
        origin = app_origin(app, "production")
        assert origin is not None and origin.startswith("https://"), app


def test_production_allowlists_its_three_apps_and_not_the_api():
    """Each app gets its own origin (they must not share origin-scoped IndexedDB), and
    the api is not among them -- an origin list is about who may CALL this server.

    This asserted `== 3` until production began migrating hostnames and the transitional
    list took it to six. A count is the wrong assertion anyway: what matters is that no
    origin repeats and that the API's own host is absent, and both survive the widening.
    """
    origins = allowed_origins("production")
    assert len(origins) == len(set(origins)), f"duplicate origin: {origins}"
    assert not any("api" in origin.split("//")[1].split(".")[0] for origin in origins), origins


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
