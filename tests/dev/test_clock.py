"""§19.5 -- 'An X-Dev-Now header shifts the server's clock for that request only, in
non-production.'

Properties, each of which can fail independently:
  1. the header shifts the clock at all,
  2. the shift does not outlive the call that set it -- proved two ways: the contract
     itself with no ASGI layer at all (enter/exit, and nested enter/exit restoring the
     outer value rather than clearing it), and a same-task two-request replay that
     reproduces the one caller this actually protects (see
     test_the_shift_does_not_outlive_its_request's docstring for why that test uses
     httpx.ASGITransport and not TestClient -- the difference is load-bearing, not
     stylistic),
  3. production ignores it,
  4. an unparseable header is rejected rather than silently ignored.

Round-1 review history: this file originally carried
test_the_shift_does_not_leak_into_the_next_request, built on two sequential
TestClient(...).get() calls. It could not go red: starlette's TestClient (this pin,
1.6.0) gives every call -- bare or inside a `with` block -- its own
anyio.from_thread.BlockingPortal task, i.e. a freshly copied contextvars.Context, so a
missing use_dev_now().reset() was invisible to it regardless of whether the reset ran.
Worse, the same review found that on the real HTTP path (uvicorn) the reset is *also*
inert, for the same reason via a different mechanism -- see app/core/clock.py's module
docstring. The test below replaces it with two that provably fire; see
.superpowers/sdd/2026-08-24-m0-4-demo-studio-and-dev-bar/task-2-report.md's round-1
section for the drill evidence.
"""

from __future__ import annotations

import ast
import asyncio
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
from app.core.clock import X_DEV_NOW_HEADER, now, parse_dev_now, use_dev_now
from app.core.dev_account import DEV_TOKEN_HEADER
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


def test_use_dev_now_reverts_on_exit_and_restores_the_outer_value_when_nested():
    """The contract itself, with no ASGI layer at all: enter, assert shifted, exit,
    assert reverted. The nested case is the one a naive `_dev_now.set(None)` gets
    wrong on exit -- it would clear the shift outright instead of restoring the outer
    one. Token-based `.reset()` is what makes nesting correct, and that is worth
    pinning directly rather than trusting it as a side effect of the ContextVar API."""
    assert now().year != 2027, "the clock must start unshifted"
    outer = datetime(2027, 3, 1, tzinfo=UTC)
    inner = datetime(2099, 1, 1, tzinfo=UTC)
    with use_dev_now(outer):
        assert now() == outer
        with use_dev_now(inner):
            assert now() == inner
        assert now() == outer, "the inner exit must restore the outer shift, not clear it"
    assert now().year != 2027, "the outer exit must restore the unshifted clock"


def test_the_shift_does_not_outlive_its_request():
    """Same-task, two-request replay of the shape use_dev_now actually protects: a
    worker calling it more than once inside one job loop, sequentially, in one task
    (app/core/clock.py's module docstring).

    Why httpx.ASGITransport and not fastapi.testclient.TestClient: TestClient spawns a
    fresh anyio task -- a freshly copied contextvars.Context -- for every call, bare or
    inside a `with` block, so two sequential TestClient.get()s can never observe a
    leaked ContextVar no matter what use_dev_now does. uvicorn does the same thing to
    every real HTTP request, for a different reason (a brand new empty Context per
    request, not a copy). ASGITransport has neither behaviour: it awaits the ASGI app
    directly with no task spawned, so both requests below share one task and one
    context -- the one condition that actually exercises the reset. Do not
    'simplify' this back to TestClient: that is exactly the change that made the
    predecessor of this test unable to fail.

    asyncio.run in a *sync* def, not an async def: this repo has no pytest-asyncio and
    no asyncio_mode in pyproject.toml, so an async def test would be silently skipped
    or collected as an error rather than run.
    """

    async def scenario(application: object) -> dict[str, object]:
        transport = httpx.ASGITransport(app=application)  # type: ignore[arg-type]
        async with httpx.AsyncClient(transport=transport, base_url="http://dev") as client:
            await client.get("/api/v1/dev/clock", headers={X_DEV_NOW_HEADER: TRAVELLED})
            response = await client.get("/api/v1/dev/clock")
            return dict(response.json())

    with app_in_env("development") as application:
        body = asyncio.run(scenario(application))
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


def test_a_configured_token_refuses_an_unauthenticated_shift(monkeypatch):
    """Staging is a public HTTPS origin (§15 item 3, app/core/config.py's own reasoning
    for DEV_TOOLS_TOKEN existing). Before this fix, X-Dev-Now honoured any caller on any
    non-production environment -- including staging -- with no token check at all, even
    though app.core.dev_account.dev_tools_allowed already required one for every other
    /dev/* route on the same environment. This is the branch where a token IS configured
    and none is presented: the shift must not apply."""
    monkeypatch.setenv("DEV_TOOLS_TOKEN", "s3cret")
    with app_in_env("staging") as application:
        response = TestClient(application).get(
            "/api/v1/health", headers={X_DEV_NOW_HEADER: TRAVELLED}
        )
    assert response.status_code == 403
    assert now().year != 2027


def test_a_configured_token_refuses_a_wrong_one_too(monkeypatch):
    """The control for the case above: a caller presenting *some* token still must not
    get through with the wrong one."""
    monkeypatch.setenv("DEV_TOOLS_TOKEN", "s3cret")
    with app_in_env("staging") as application:
        response = TestClient(application).get(
            "/api/v1/health",
            headers={X_DEV_NOW_HEADER: TRAVELLED, DEV_TOKEN_HEADER: "wrong"},
        )
    assert response.status_code == 403
    assert now().year != 2027


def test_a_matching_configured_token_still_shifts_the_clock(monkeypatch):
    """The other branch: a token IS configured and the caller presents the matching
    one -- the shift must still apply, the same as it always did. Hits /dev/clock
    rather than /health so the response also proves the shift landed, not just that the
    request was let through."""
    monkeypatch.setenv("DEV_TOOLS_TOKEN", "s3cret")
    with app_in_env("staging") as application:
        body = (
            TestClient(application)
            .get(
                "/api/v1/dev/clock",
                headers={X_DEV_NOW_HEADER: TRAVELLED, DEV_TOKEN_HEADER: "s3cret"},
            )
            .json()
        )
    assert body["now"].startswith("2027-03-01T09:00:00")
    assert body["shifted"] is True


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


def test_parse_dev_now_accepts_a_bare_date_as_midnight_utc():
    """`?at=2027-03-01` is what you actually type when testing a billing day -- the
    module docstring advertises this and it had no direct test."""
    assert parse_dev_now("2027-03-01") == datetime(2027, 3, 1, tzinfo=UTC)


_WALL_CLOCK_CALL = re.compile(r"\b(?:datetime\.(?:now|utcnow|today)|date\.today)\s*\(")


def _reads_wall_clock_directly(line: str) -> bool:
    """The discipline gate's detector, extracted to a module-level function so the gate
    and its own self-test exercise the same logic rather than two copies of the same
    pattern that could drift apart -- tests/dev/test_dev_router.py's
    `_binds_settings_and_reads_env` is the shape this follows.

    Matches both the `datetime` module's `.now()` / `.utcnow()` / `.today()` and a bare
    `date.today()`, which targets the `date` class directly and so slipped past the
    original pattern entirely -- Task 11 avoided it only because its brief hand-held
    the line.

    Kept for the two line-level self-tests below, which prove the pattern itself fires.
    The real gate now uses `wall_clock_call_lines`, which reads the parse tree instead --
    see its docstring for what a line-based scan could not tell apart."""
    return bool(_WALL_CLOCK_CALL.search(line))


#: `datetime.now` / `.utcnow` / `.today`, and a bare `date.today` -- the same four the
#: regex above matched.
_WALL_CLOCK_ATTRS = {
    ("datetime", "now"),
    ("datetime", "utcnow"),
    ("datetime", "today"),
    ("date", "today"),
}


def wall_clock_call_lines(path: Path) -> list[int]:
    """Every line in one file that actually CALLS the wall clock.

    Reads the parse tree, not the text. A line-based scan cannot tell a call from a
    sentence about a call -- and M1 hit exactly that: the docstring of
    app/services/identity/tokens.py explains that the module must never call
    datetime.now(), and the old scan read that explanation as a violation. A gate that
    fires on accurate documentation does not get better code, it gets vaguer comments,
    and the rule stops being written down in the modules that obey it.

    A syntax error is reported as no calls rather than swallowed differently: `app/` is
    imported by the rest of the suite, so an unparseable file there is already a much
    louder failure than this gate.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:  # pragma: no cover -- app/ failing to parse fails elsewhere first
        return []
    return sorted(
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and (node.func.value.id, node.func.attr) in _WALL_CLOCK_ATTRS
    )


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
        offenders.extend(
            f"{path.relative_to(ROOT)}:{lineno}" for lineno in wall_clock_call_lines(path)
        )
    assert offenders == [], (
        "these read the wall clock directly and so cannot be time-travelled -- "
        f"use app.core.clock.now(): {offenders}"
    )


def test_the_discipline_gate_would_flag_a_direct_call(tmp_path):
    """Proves the detector itself fires, using the same `_reads_wall_clock_directly`
    the real gate calls above -- not a second copy of its pattern, which would only
    prove that *a* duplicate regex fires, not that the gate's actual logic does."""
    probe = tmp_path / "probe.py"
    probe.write_text("from datetime import datetime\nx = datetime.now()\n", encoding="utf-8")
    hits = [
        line
        for line in probe.read_text(encoding="utf-8").splitlines()
        if _reads_wall_clock_directly(line)
    ]
    assert hits == ["x = datetime.now()"]


def test_the_discipline_gate_would_flag_a_bare_date_today(tmp_path):
    """`date.today()` targets the `date` class directly, not the `datetime` module, so
    the original pattern -- anchored on `datetime\\.` -- let it through entirely. Same
    shape as the test above: exercises the real `_reads_wall_clock_directly`, not a
    second copy of its pattern, which would only prove that *a* duplicate regex fires."""
    probe = tmp_path / "probe.py"
    probe.write_text("from datetime import date\nx = date.today()\n", encoding="utf-8")
    hits = [
        line
        for line in probe.read_text(encoding="utf-8").splitlines()
        if _reads_wall_clock_directly(line)
    ]
    assert hits == ["x = date.today()"]


# -- and proven NOT to fire on prose that describes the rule ------------------
# M1 found this. `app/services/identity/tokens.py`'s docstring explains that the module
# must not call datetime.now() -- and the line-based scan read that sentence as a call,
# so the gate forbade any module from writing down the very rule it was obeying. A gate
# that punishes accurate documentation gets vaguer documentation, not better code.
def test_the_gate_ignores_a_call_written_inside_a_docstring(tmp_path):
    probe = tmp_path / "probe.py"
    probe.write_text(
        '"""This module must never call datetime.now() -- use app.core.clock."""\n'
        "import app.core.clock as clock\n"
        "x = clock.now()\n",
        encoding="utf-8",
    )
    assert wall_clock_call_lines(probe) == []


def test_the_gate_ignores_a_call_written_inside_a_comment(tmp_path):
    probe = tmp_path / "probe.py"
    probe.write_text("# never datetime.now() here\nx = 1\n", encoding="utf-8")
    assert wall_clock_call_lines(probe) == []


def test_the_gate_still_flags_a_real_call_in_a_file_that_also_documents_the_rule(tmp_path):
    """The other half. A detector taught to ignore prose has to be shown still catching
    the call sitting three lines below the prose, or the fix is just a hole."""
    probe = tmp_path / "probe.py"
    probe.write_text(
        '"""Never call datetime.now() -- use app.core.clock.now()."""\n'
        "from datetime import datetime\n"
        "x = datetime.now()\n",
        encoding="utf-8",
    )
    assert wall_clock_call_lines(probe) == [3]


def test_the_gate_flags_every_shape_the_regex_did(tmp_path):
    """The AST rule must not be narrower than the pattern it replaced: both the
    `datetime` module's three and a bare `date.today()`."""
    probe = tmp_path / "probe.py"
    probe.write_text(
        "from datetime import date, datetime\n"
        "a = datetime.now()\n"
        "b = datetime.utcnow()\n"
        "c = datetime.today()\n"
        "d = date.today()\n",
        encoding="utf-8",
    )
    assert wall_clock_call_lines(probe) == [2, 3, 4, 5]
