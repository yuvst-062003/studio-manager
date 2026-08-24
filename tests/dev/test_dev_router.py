"""The harness itself, and the router's shape."""

from app.core.dev_account import dev_tools_allowed
from fastapi.testclient import TestClient
from tests.dev.conftest import app_in_env


def test_the_harness_restores_what_it_swapped():
    """The failure this guards: a production app/main left in sys.modules turns every
    later test in the session into a test of a different application."""
    import app.main as before

    with app_in_env("production"):
        pass

    import app.main as after

    assert after is before
    assert TestClient(after.app).get("/api/v1/health").status_code == 200


def test_ping_reports_the_environment_it_was_built_in():
    with app_in_env("development") as application:
        body = TestClient(application).get("/api/v1/dev/ping").json()
    assert body["env"] == "development"


# -- who may call /dev/* at all (the truth table) -----------------------------
def test_a_developer_identity_is_allowed():
    assert dev_tools_allowed(
        env="staging", is_developer=True, presented_token=None, configured_token=None
    )


def test_localhost_with_no_token_configured_is_allowed():
    """Development is a machine with no auth layer yet. Documented rather than implied."""
    assert dev_tools_allowed(
        env="development", is_developer=False, presented_token=None, configured_token=None
    )


def test_staging_with_no_token_configured_is_refused():
    """Staging is a public HTTPS origin (§15 item 3). An unauthenticated
    POST /dev/demo/reset there is a stranger wiping your test data; an unauthenticated
    POST /dev/upay/simulate-ipn is a stranger inventing payments. Closed by default."""
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token=None, configured_token=None
    )


def test_a_matching_token_is_allowed_and_a_wrong_one_is_not():
    assert dev_tools_allowed(
        env="staging", is_developer=False, presented_token="s3cret", configured_token="s3cret"
    )
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token="wrong", configured_token="s3cret"
    )


def test_production_is_refused_on_every_input():
    """Defence in depth. The router is not mounted in production at all, so this branch
    is unreachable through HTTP -- which is exactly why it must be asserted directly."""
    for is_developer in (True, False):
        for token in (None, "s3cret"):
            assert not dev_tools_allowed(
                env="production",
                is_developer=is_developer,
                presented_token=token,
                configured_token="s3cret",
            )
