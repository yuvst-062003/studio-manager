"""§19.5 -- 'An X-Dev-Now header shifts the server's clock for that request only, in
non-production.'

Three properties, each of which can fail independently:
  1. the header shifts the clock at all,
  2. the shift does not survive the request (a contextvar leaked into the event loop
     would silently move every later request's clock -- the kind of bug that surfaces
     as "the billing run ran for the wrong month" three weeks later),
  3. production ignores it.
"""

from __future__ import annotations

import re
from datetime import UTC
from pathlib import Path

from app.core.clock import X_DEV_NOW_HEADER, now
from fastapi.testclient import TestClient
from tests.dev.conftest import app_in_env

ROOT = Path(__file__).resolve().parents[2]
TRAVELLED = "2027-03-01T09:00:00+00:00"


def test_now_is_timezone_aware_utc():
    """G3 -- always stored UTC. A naive datetime compares unequal to every aware one and
    raises when subtracted from one, so this is not a stylistic preference."""
    assert now().tzinfo is not None
    assert now().utcoffset() == UTC.utcoffset(None)


def test_the_header_shifts_the_clock_for_that_request():
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .get("/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: TRAVELLED})
            .json()
        )
    assert body["now"].startswith("2027-03-01T09:00:00")
    assert body["shifted"] is True


def test_the_shift_does_not_leak_into_the_next_request():
    with app_in_env("development") as application:
        client = TestClient(application)
        client.get("/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: TRAVELLED})
        body = client.get("/api/v1/dev/clock").json()
    assert not body["now"].startswith("2027"), "the offset outlived its request"
    assert body["shifted"] is False


def test_an_unparseable_header_is_a_400_not_a_silent_pass_through():
    """Silently ignoring a malformed header is the worst option: you think you are
    testing March and you are testing today, and the test that 'proves' the debt ladder
    passes for the wrong reason."""
    with app_in_env("development") as application:
        response = TestClient(application).get(
            "/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: "next tuesday"}
        )
    assert response.status_code == 400


def test_production_ignores_the_header_entirely():
    """/dev/clock does not exist in production, so this asks a route that does."""
    with app_in_env("production") as application:
        response = TestClient(application).get(
            "/api/v1/health", headers={X_DEV_NOW_HEADER: TRAVELLED}
        )
    assert response.status_code == 200
    assert now().year != 2027


def test_the_middleware_is_installed_conditionally_not_guarded():
    """Source assertion by necessity: 'the middleware object is absent from this app's
    stack' is not observable through the ASGI interface once the internal guard also
    exists. Decision B -- the non-installation is the mechanism and the internal guard
    is defence in depth, so both must be present and neither alone is enough."""
    text = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    assert re.search(r'if settings\.ENV != "production":\s*\n\s*app\.add_middleware', text)
    # Seam 2 is untouched -- the same assertion tests/test_router_discovery.py makes.
    assert text.count("include_router") == 2
    assert "pkgutil.iter_modules" in text


def test_nothing_outside_the_clock_module_reads_the_wall_clock():
    """The discipline gate. Time travel is worthless if half the app calls
    datetime.now() directly -- the billing run would shift and the debt ladder would
    not, and the difference would look like a billing bug.

    Source-level by necessity: 'this module called datetime.now' is not observable at
    runtime without patching the interpreter. `func.now()` in a model is SQL, not
    Python, and is deliberately not matched.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path.name == "clock.py":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\bdatetime\.(now|utcnow|today)\s*\(", line):
                offenders.append(f"{path.relative_to(ROOT)}:{lineno}")
    assert offenders == [], (
        "these read the wall clock directly and so cannot be time-travelled -- "
        f"use app.core.clock.now(): {offenders}"
    )


def test_the_discipline_gate_would_flag_a_direct_call(tmp_path):
    """Proves the detector fires, because today it finds nothing."""
    probe = tmp_path / "probe.py"
    probe.write_text("from datetime import datetime\nx = datetime.now()\n", encoding="utf-8")
    hits = [
        line
        for line in probe.read_text(encoding="utf-8").splitlines()
        if re.search(r"\bdatetime\.(now|utcnow|today)\s*\(", line)
    ]
    assert hits == ["x = datetime.now()"]
