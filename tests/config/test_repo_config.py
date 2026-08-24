"""Regression guard for the Part 5 config corrections (C1, C6, C7, C8).

Each of these was a real defect: a rule scoped to a path that never exists matches
zero files while appearing configured, and an allowlist that does not match the
mandated command prompts on every call.
"""

import json
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{path} has no YAML frontmatter"
    _, fm, _ = text.split("---", 2)
    return yaml.safe_load(fm)


# -- C1 ----------------------------------------------------------------------
def test_c1_claude_md_layout_matches_spec_8_2():
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "web/src/" not in text, "CLAUDE.md still describes the single-app web/src/ layout"
    for expected in (
        "web/packages/api-client",
        "web/packages/ui",
        "web/packages/core",
        "web/packages/i18n",
        "web/apps/staff",
        "web/apps/parent",
        "web/apps/dashboard",
    ):
        assert expected in text, f"CLAUDE.md Layout is missing {expected}"


def test_c1_claude_md_i18n_line_is_namespaced():
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "web/src/i18n/he.ts" not in text
    assert "web/packages/i18n/he/" in text


def test_c1_rtl_rule_is_scoped_to_paths_that_exist():
    rule = ROOT / ".claude/rules/ui-rtl-a11y.md"
    paths = _frontmatter(rule)["paths"]
    assert paths == ["web/apps/**", "web/packages/**"], paths
    # The defect this guards: a glob that matches nothing reads as protection.
    for glob in paths:
        root = ROOT / glob.split("/**")[0]
        assert root.is_dir(), f"rule path {glob} matches zero files -- {root} does not exist"


# -- C6 ----------------------------------------------------------------------
def test_c6_spec_does_not_offer_a_payment_mode_endpoint():
    text = (ROOT / "SPEC.md").read_text(encoding="utf-8")
    assert "payment-mode" not in text, (
        "4.3 states there is no payment_mode on a person; 7 must not list the endpoint"
    )


# -- C7 ----------------------------------------------------------------------
def test_c7_api_rule_uses_studio_id_and_names_the_mechanism():
    text = (ROOT / ".claude/rules/api.md").read_text(encoding="utf-8")
    assert "club_id" not in text, "the schema has no club_id column"
    assert "studio_id" in text
    assert "TenantMixin" in text, "the enforcement mechanism should be named, not implied"


# -- C8 ----------------------------------------------------------------------
@pytest.mark.parametrize(
    "pattern",
    [
        "Bash(.venv/bin/pytest:*)",
        "Bash(.venv/bin/ruff:*)",
        "Bash(.venv/bin/mypy:*)",
        "Bash(.venv/bin/alembic upgrade:*)",
        "Bash(./scripts/lane-check.sh:*)",
        "Bash(npx eslint:*)",
        "Bash(git worktree:*)",
        # M0.2 -- the database, the migration read-only subcommands and the parity check.
        "Bash(docker compose:*)",
        "Bash(./scripts/dev-db.sh:*)",
        "Bash(.venv/bin/alembic check)",
        "Bash(node web/scripts/i18n-parity.mjs:*)",
    ],
)
def test_c8_allowlist_matches_the_mandated_commands(pattern):
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    assert pattern in settings["permissions"]["allow"]


def test_c8_alembic_downgrade_deny_actually_matches():
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    deny = settings["permissions"]["deny"]
    assert "Bash(.venv/bin/alembic downgrade:*)" in deny, (
        "G1 mandates the .venv/bin prefix, so a bare `alembic downgrade` deny protects nothing"
    )


def test_the_allowlist_never_blanket_allows_alembic():
    """`Bash(.venv/bin/alembic:*)` would swallow `downgrade`, which the deny list exists
    to stop. The allowlist names read-only subcommands one at a time on purpose."""
    settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
    assert "Bash(.venv/bin/alembic:*)" not in settings["permissions"]["allow"]
    assert "Bash(alembic:*)" not in settings["permissions"]["allow"]
