import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DOMAINS = ROOT / "infra/railway/domains.json"

APPS = {"api", "staff", "parent", "dashboard"}
ENVIRONMENTS = {"development", "staging", "production"}


def _config() -> dict:
    return json.loads(DOMAINS.read_text(encoding="utf-8"))


def test_every_environment_is_configured():
    assert set(_config()["environments"]) == ENVIRONMENTS


def test_every_environment_names_all_three_apps_and_the_api():
    for env, hosts in _config()["environments"].items():
        assert set(hosts) == APPS, env


def test_staging_has_a_public_https_url():
    """SPEC §15 item 3 -- uPay IPN testing in W4 needs a public HTTPS URL."""
    api = _config()["environments"]["staging"]["api"]
    assert api.startswith("https://"), api
    for marker in ("TODO", "<", "PENDING"):
        assert marker not in api, f"staging api is still a placeholder: {api}"


@pytest.mark.xfail(
    strict=True,
    reason="production has no service instances yet — see docs/deploy/railway-runbook.md. "
    "strict=True so this fails the moment production hostnames land, forcing the "
    "marker off rather than letting it rot.",
)
def test_each_app_gets_its_own_origin():
    """Staff and parent must not share origin-scoped IndexedDB: it holds
    pending_ops (§10.6) and health flags (G7)."""
    for env, hosts in _config()["environments"].items():
        origins = [hosts[a] for a in ("staff", "parent", "dashboard")]
        assert len(set(origins)) == 3, f"{env}: apps share an origin -- {origins}"


def test_the_domain_is_named_in_exactly_one_place():
    """SPEC §15 item 5 is still open; swapping the domain must not need a rebuild."""
    assert "base_domain" in _config()
