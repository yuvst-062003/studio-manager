"""Every failure here must produce a distinct, honest state. The one thing this must
never do is render a red dot for something it simply cannot see."""

from __future__ import annotations

import inspect
import socket
import ssl
import urllib.error

from tools.cockpit import envs

DOMAINS = {
    "environments": {
        "development": {"api": "http://localhost:8000"},
        "staging": {"api": "https://api-staging-1e4d.up.railway.app"},
        "production": {"api": "https://PENDING-production-services"},
    }
}


def test_targets_reads_the_one_place_hostnames_are_written():
    assert envs.targets(DOMAINS)["staging"].startswith("https://api-staging")


def test_a_healthy_endpoint_reports_up_with_its_revision():
    def fetch(url, timeout):
        return {
            "status": "ok",
            "env": "staging",
            "revision": "0003",
            "started_at": "2026-08-25T05:11:00Z",
        }

    url = DOMAINS["environments"]["staging"]["api"]
    result = envs.classify("staging", url, fetch, is_remote=True)
    assert result.state == "up"
    assert result.revision == "0003"
    assert result.started_at == "2026-08-25T05:11:00Z"


def test_a_placeholder_host_is_not_deployed_never_an_error():
    def fetch(url, timeout):
        raise AssertionError("must not be called for a placeholder host")

    result = envs.classify(
        "production", "https://PENDING-production-services", fetch, is_remote=True
    )
    assert result.state == "not_deployed"


def test_localhost_from_a_remote_surface_is_local_not_down():
    """The phone genuinely cannot see localhost:8000. A red dot would be a lie about
    the environment rather than a fact about the observer."""

    def fetch(url, timeout):
        raise AssertionError("must not be called for localhost from a remote surface")

    result = envs.classify("development", "http://localhost:8000", fetch, is_remote=True)
    assert result.state == "local"


def test_localhost_from_the_laptop_is_probed_normally():
    def fetch(url, timeout):
        return {"status": "ok", "env": "development", "revision": "0003", "started_at": None}

    result = envs.classify("development", "http://localhost:8000", fetch, is_remote=False)
    assert result.state == "up"


def test_a_timeout_is_unknown_not_down():
    def fetch(url, timeout):
        raise TimeoutError("timed out")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "unknown"


def test_a_refused_connection_is_down():
    def fetch(url, timeout):
        raise ConnectionRefusedError("refused")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "down"


def test_a_urlerror_wrapping_a_refusal_is_still_down():
    """urllib wraps OSError in URLError, so the naive ordering reports `unknown` for a
    server that is definitively refusing connections."""

    def fetch(url, timeout):
        raise urllib.error.URLError(ConnectionRefusedError("refused"))

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "down"


def test_a_non_json_body_is_down_with_a_detail_rather_than_a_crash():
    def fetch(url, timeout):
        raise ValueError("Expecting value: line 1 column 1")

    result = envs.classify("staging", "https://x", fetch, is_remote=True)
    assert result.state == "down"
    assert result.detail is not None


def test_a_dns_failure_is_unknown():
    def fetch(url, timeout):
        raise socket.gaierror("nodename nor servname provided")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "unknown"


def test_a_body_that_is_not_ok_is_down():
    def fetch(url, timeout):
        return {"status": "degraded", "env": "staging"}

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "down"


def test_probe_all_never_raises_even_when_every_target_fails():
    def fetch(url, timeout):
        raise TimeoutError()

    results = envs.probe_all(envs.targets(DOMAINS), fetch, is_remote=True)
    assert {r.name for r in results} == {"development", "staging", "production"}


def test_every_state_it_can_return_is_declared():
    """A state the page has no styling for renders as nothing at all."""

    def fetch(url, timeout):
        return {"status": "ok"}

    for result in envs.probe_all(envs.targets(DOMAINS), fetch, is_remote=True):
        assert result.state in envs.STATES


def test_the_certificate_bundle_is_optional_not_required():
    """C3 -- this package must boot with nothing third-party installed. certifi makes
    HTTPS verification work on a macOS Python that ships no trust store, but a missing
    certifi falls back rather than raising."""
    context = envs._ssl_context()
    assert context is None or isinstance(context, ssl.SSLContext)


def test_plain_http_needs_no_context():
    """Passing an SSL context to an http:// request is meaningless, and building one
    costs a file read on every local probe."""
    assert "startswith" in inspect.getsource(envs.fetch_json)
