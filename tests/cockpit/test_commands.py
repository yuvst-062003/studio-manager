"""If this table can be escaped, every other safety property of the laptop surface is
decoration. These tests are the boundary."""

from __future__ import annotations

import pytest
from tools.cockpit.local import commands


def test_the_verticals_are_the_ones_lane_check_is_actually_invoked_with():
    """Taken from lane-check.sh invocations in the milestone plan, not from milestone
    names. M6's lane is called MONEY but its vertical is `billing`, and M1 checks as
    two verticals, not one."""
    assert "billing" in commands.VERTICALS
    assert "money" not in commands.VERTICALS
    assert {"identity", "structure"} <= set(commands.VERTICALS)


def test_a_known_command_resolves_to_an_argv_list():
    assert commands.resolve("pytest") == (".venv/bin/pytest", "-q")


def test_lane_check_takes_a_vertical():
    assert commands.resolve("lane-check", "core") == ("./scripts/lane-check.sh", "core")


def test_an_unknown_command_id_is_refused():
    with pytest.raises(commands.CommandError, match="unknown command"):
        commands.resolve("rm-rf")


def test_a_vertical_outside_the_enum_is_refused():
    with pytest.raises(commands.CommandError, match="not a known vertical"):
        commands.resolve("lane-check", "../../etc")


@pytest.mark.parametrize(
    "hostile",
    [
        "core; rm -rf /",
        "core && whoami",
        "core|sh",
        "core$(id)",
        "core `id`",
        "../core",
        "core/../..",
        "core core",
        "core\n",
        "",
        "CORE",
        " core",
    ],
)
def test_hostile_verticals_are_refused(hostile: str):
    with pytest.raises(commands.CommandError):
        commands.resolve("lane-check", hostile)


def test_a_vertical_passed_to_a_command_that_takes_none_is_refused():
    with pytest.raises(commands.CommandError, match="takes no argument"):
        commands.resolve("ci-local", "core")


def test_lane_check_without_a_vertical_is_refused():
    with pytest.raises(commands.CommandError, match="requires a vertical"):
        commands.resolve("lane-check")


def test_alembic_downgrade_is_unreachable_through_any_input():
    """It is on .claude/settings.json's deny list. It must not re-enter here."""
    for command in commands.COMMANDS.values():
        assert "downgrade" not in " ".join(command.argv)
    for candidate in ("alembic-downgrade", "downgrade", "alembic_downgrade"):
        with pytest.raises(commands.CommandError):
            commands.resolve(candidate)


def test_every_compose_command_carries_the_project_name():
    """M0.4's retrospective: docker-compose.yml pins container_name, so compose from a
    second worktree creates a new project with an empty volume and then claims the
    running container. Without this, db-reset can wipe a volume nothing is using."""
    for command_id in ("db-up", "db-reset", "ci-local"):
        env = commands.env_for(command_id)
        assert env["COMPOSE_PROJECT_NAME"] == "studio-manager", command_id


def test_a_non_compose_command_does_not_set_the_project_name():
    assert "COMPOSE_PROJECT_NAME" not in commands.env_for("pytest")


def test_only_db_reset_requires_confirmation():
    confirming = {cid for cid, c in commands.COMMANDS.items() if c.confirm}
    assert confirming == {"db-reset"}


def test_the_frontend_command_runs_from_inside_the_web_workspace():
    """npx from the repo root downloads a fresh toolchain and reads none of web/'s
    config -- measured in M0.1 and recorded in lane-check.sh's header."""
    assert commands.cwd_for("typecheck-web") == "web"


def test_every_command_has_a_label_for_the_page_to_render():
    for command_id, command in commands.COMMANDS.items():
        assert command.label.strip(), command_id


def test_no_command_argv_contains_a_shell_metacharacter():
    """argv goes to Popen with shell=False, so a metacharacter here would be a literal
    argument rather than an injection -- but its presence would mean someone tried to
    express a pipeline in this table, which is not what it is for."""
    for command in commands.COMMANDS.values():
        for part in command.argv:
            assert not set(part) & set(";|&$`><"), command.id
