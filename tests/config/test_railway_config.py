import json
from pathlib import Path

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


# The `xfail(strict=True)` that stood here is gone, and its removal is the point: it was
# written to FAIL the moment production hostnames landed, "forcing the marker off rather
# than letting it rot". They landed on 2026-08-30 -- production was populated, and its four
# hosts are in domains.json -- so the marker came off. It did exactly the job it was
# designed for, which is why this comment records that rather than the file simply losing
# six lines.
def test_each_app_gets_its_own_origin():
    """Staff and parent must not share origin-scoped IndexedDB: it holds
    pending_ops (§10.6) and health flags (G7)."""
    for env, hosts in _config()["environments"].items():
        origins = [hosts[a] for a in ("staff", "parent", "dashboard")]
        assert len(set(origins)) == 3, f"{env}: apps share an origin -- {origins}"


def test_the_domain_is_named_in_exactly_one_place():
    """SPEC §15 item 5 is still open; swapping the domain must not need a rebuild."""
    assert "base_domain" in _config()
