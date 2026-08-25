"""The security properties are structural, so they are asserted structurally: a test
that only exercised the happy path would pass just as well on a server bound to
0.0.0.0 with CORS wide open."""

from __future__ import annotations

from pathlib import Path

from tools.cockpit.local import server

SOURCE = Path(server.__file__).read_text(encoding="utf-8")


def test_it_binds_loopback_and_never_all_interfaces():
    assert server.HOST == "127.0.0.1"
    assert "0.0.0.0" not in SOURCE


def test_the_page_token_is_random_and_long_enough_to_matter():
    assert len(server.PAGE_TOKEN) >= 16
    assert server._new_token() != server.PAGE_TOKEN


def test_no_cors_header_is_ever_sent():
    assert "Access-Control-Allow-Origin" not in SOURCE


def test_the_state_payload_carries_no_secret():
    assert server.PAGE_TOKEN not in repr(server.build_state_payload())


def test_the_payload_reports_waves_holdbacks_git_runs_and_commands():
    payload = server.build_state_payload()
    assert {"waves", "holdbacks", "git", "runs", "staleness", "commands"} <= set(payload)


def test_the_payload_does_not_probe_the_network():
    """/api/state must never be slow. Env probes live on their own route so a hung
    Railway cannot delay the page."""
    assert "envs" not in server.build_state_payload()


def test_the_payload_is_json_serialisable():
    import json

    json.dumps(server.build_state_payload())


def test_the_active_wave_is_surfaced_for_the_page_to_lead_with():
    payload = server.build_state_payload()
    assert payload["active"]["wave"]["id"] == "W0"


def test_holdbacks_arrive_tiered_by_distance():
    """Not grouped by kind: what you need first is what blocks the wave you are in."""
    assert list(server.build_state_payload()["holdbacks"]) == ["now", "next", "later"]


def test_nothing_blocking_a_far_wave_reaches_the_now_tier_unless_it_needs_lead_time():
    tiers = server.build_state_payload()["holdbacks"]
    for holdback in tiers["now"]:
        assert holdback["wave"] in (0, None) or holdback["lead_time"], holdback["id"]


def test_commands_are_offered_by_id_and_never_as_argv():
    """If the page were handed argv it could edit it. It is handed ids only."""
    for entry in server.build_state_payload()["commands"]:
        assert set(entry) == {"id", "label", "takes_vertical", "confirm"}


def test_a_stream_terminates_instead_of_hanging_the_client(monkeypatch, tmp_path):
    """A stream carries no Content-Length, so closing the connection is the only thing
    that tells a client the body has ended. Sending Connection: keep-alive instead
    delivered every frame correctly and then hung curl and fetch alike -- which no
    structural assertion about the source would have caught."""
    import json
    import threading
    import urllib.request
    from http.server import ThreadingHTTPServer

    from tools.cockpit.local import runner as run_mod

    class _FakeProc:
        returncode = 0
        stdout = iter(["one\n", "two\n"])

        def wait(self) -> int:
            return 0

    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc())
    monkeypatch.setattr(server, "RUNNER", run_mod.Runner())
    # Without this the fake run is written into the real history and shows on the
    # real dashboard as a passing pytest that never ran -- a test putting a lie
    # into the status board it is testing.
    monkeypatch.setattr("tools.cockpit.local.signals.RUNS_DIR", tmp_path)

    httpd = ThreadingHTTPServer((server.HOST, 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://{server.HOST}:{httpd.server_address[1]}"
    try:
        post = urllib.request.Request(
            f"{base}/api/run",
            data=json.dumps({"command": "pytest"}).encode(),
            headers={"X-Cockpit-Token": server.PAGE_TOKEN, "Content-Type": "application/json"},
        )
        run_id = json.loads(urllib.request.urlopen(post, timeout=5).read())["run"]
        get = urllib.request.Request(
            f"{base}/api/run/{run_id}/stream", headers={"X-Cockpit-Token": server.PAGE_TOKEN}
        )
        # timeout is the assertion: before the fix this read never returned.
        body = urllib.request.urlopen(get, timeout=5).read().decode()
    finally:
        httpd.shutdown()

    assert 'data: "one"' in body
    assert 'data: "__exit__:0"' in body
