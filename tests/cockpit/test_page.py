"""The page is served as-is with no build step, so the things that would normally be
caught by a bundler have to be caught here."""

from __future__ import annotations

from tools.cockpit import ROOT

PAGE = ROOT / "tools/cockpit/local/static/index.html"
SCRIPT = ROOT / "scripts/cockpit.sh"


def test_the_page_exists_and_has_no_build_step():
    text = PAGE.read_text(encoding="utf-8")
    assert '<script type="module" src=' not in text, "served as-is, never bundled"


def test_the_page_takes_its_token_by_substitution_not_by_hardcoding():
    """A token baked into a committed file would be the same on every machine and in
    every clone, which is the same as having none."""
    assert "{{TOKEN}}" in PAGE.read_text(encoding="utf-8")


def test_the_page_never_loads_anything_from_the_product_workspace():
    """C2 -- the cockpit must render when web/ will not build."""
    text = PAGE.read_text(encoding="utf-8")
    for forbidden in ("@studio/", "../../web/", "/web/packages/"):
        assert forbidden not in text


def test_the_page_loads_no_script_from_a_third_party():
    """Fonts are the one remote thing; a CDN script would make the tool that reports
    on a broken network depend on the network."""
    text = PAGE.read_text(encoding="utf-8")
    for forbidden in ("cdn.", "unpkg", "jsdelivr", "cdnjs"):
        assert forbidden not in text


def test_the_page_sends_the_token_on_api_calls():
    assert "X-Cockpit-Token" in PAGE.read_text(encoding="utf-8")


def test_the_page_handles_both_refusals_the_server_can_return():
    text = PAGE.read_text(encoding="utf-8")
    for expected in ("confirm_required", "busy"):
        assert expected in text, f"the page ignores a {expected} response"


def test_the_start_script_is_executable_and_uses_the_venv_interpreter():
    assert SCRIPT.stat().st_mode & 0o111
    text = SCRIPT.read_text(encoding="utf-8")
    assert ".venv/bin/python" in text, "a bare python3 is the 3.8 earlier on PATH"


def test_claude_md_carries_the_state_tick_rule():
    """Spec §4.3 -- the one discipline the design asks for. If it is not written where
    every agent reads it, it will not happen."""
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "state.yaml" in text


def test_the_token_never_travels_in_a_url():
    """EventSource cannot send headers, so reaching for it would mean a second way to
    authenticate this server -- a token in a query string -- for one route only."""
    text = PAGE.read_text(encoding="utf-8")
    # The comment explaining the choice is fine; using it is not.
    assert "new EventSource(" not in text
    assert "?t=" not in text
    assert "X-Cockpit-Token" in text
