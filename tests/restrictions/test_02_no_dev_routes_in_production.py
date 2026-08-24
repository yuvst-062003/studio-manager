"""§19.6 restriction 2: the developer account cannot reach /dev/* in production.

NOT VACUOUS. The mechanism is live today and this test watches it fire.

The assertion that matters is the second one in each test. A 404 proves very little on
its own -- a typo'd path 404s too. What §19.2 requires is that the routes **do not
exist**: "the router is never registered, so the endpoints do not exist rather than
being guarded by an `if` statement someone can invert." So the test reads the OpenAPI
path set, which is the app's own account of what it serves.

Routes resolve under /api/v1/dev/... , not /dev/... : app/main.py mounts every
discovered router beneath an /api/v1 prefix (G5). SPEC §7 writes the short form.
"""

from fastapi.testclient import TestClient
from tests.dev.conftest import app_in_env

PING = "/api/v1/dev/ping"


def test_a_dev_route_resolves_outside_production():
    """The control. Without this, the production assertion below would pass just as
    happily against a router that was never written."""
    with app_in_env("development") as application:
        assert TestClient(application).get(PING).status_code == 200


def test_no_dev_route_resolves_in_production():
    with app_in_env("production") as application:
        assert TestClient(application).get(PING).status_code == 404
        dev_paths = [p for p in application.openapi()["paths"] if "/dev" in p]
        assert dev_paths == [], f"the dev surface exists in production: {dev_paths}"


def test_the_dev_router_is_absent_from_staging_too_only_if_staging_is_production():
    """Staging keeps the dev tools on purpose -- §19.1: the role switcher exists
    'across any studio in that environment'. Recorded as an assertion so nobody
    'hardens' staging into uselessness and calls it a fix."""
    with app_in_env("staging") as application:
        assert TestClient(application).get(PING).status_code == 200
