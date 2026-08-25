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
    assert server.PAGE_TOKEN != server._new_token()


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


def test_holdbacks_arrive_grouped_in_kind_order():
    assert list(server.build_state_payload()["holdbacks"]) == ["external", "conflict", "carried"]


def test_commands_are_offered_by_id_and_never_as_argv():
    """If the page were handed argv it could edit it. It is handed ids only."""
    for entry in server.build_state_payload()["commands"]:
        assert set(entry) == {"id", "label", "takes_vertical", "confirm"}
