"""The allowlist, as data.

There is no free-text path into a subprocess anywhere in this tool. A caller names an
entry in this table and optionally a vertical from a closed enum; nothing else reaches
argv. `alembic downgrade` is absent by design -- it is on .claude/settings.json's deny
list and must not re-enter the project through a button.
"""

from __future__ import annotations

from dataclasses import dataclass

# Every value taken from an actual `lane-check.sh <vertical>` invocation in
# docs/plan/milestone-plan.md, not inferred from milestone names. Two traps that avoids:
# M6's lane is called MONEY but its vertical, its i18n namespace and its check argument
# are all `billing`; and M1 checks as two verticals, `identity` and `structure`.
VERTICALS = (
    "core",
    "identity",
    "structure",
    "schedule",
    "people",
    "health",
    "attendance",
    "billing",
    "events",
    "belts",
    "comms",
    "reports",
    "privacy",
)


class CommandError(ValueError):
    """A request that does not name an allowlisted command and a legal argument."""


@dataclass(frozen=True)
class Command:
    id: str
    argv: tuple[str, ...]
    label: str
    takes_vertical: bool = False
    cwd: str = "."
    compose: bool = False
    confirm: bool = False


_ALL = (
    Command("lane-check", ("./scripts/lane-check.sh",), "lane-check", takes_vertical=True),
    Command("ci-local", ("./scripts/ci-local.sh",), "ci-local", compose=True),
    Command("pytest", (".venv/bin/pytest", "-q"), "pytest"),
    Command("mypy", (".venv/bin/mypy", "app", "scripts", "tools"), "mypy"),
    Command("ruff", (".venv/bin/ruff", "check", "app", "scripts", "tests", "tools"), "ruff"),
    Command("typecheck-web", ("npm", "run", "typecheck"), "typecheck (web)", cwd="web"),
    Command("i18n-parity", ("node", "web/scripts/i18n-parity.mjs"), "i18n parity"),
    Command("db-up", ("./scripts/dev-db.sh", "up"), "db up", compose=True),
    Command("db-reset", ("./scripts/dev-db.sh", "reset"), "db reset", compose=True, confirm=True),
    Command("alembic-head", (".venv/bin/alembic", "upgrade", "head"), "alembic upgrade head"),
    Command("alembic-current", (".venv/bin/alembic", "current"), "alembic current"),
    Command("alembic-check", (".venv/bin/alembic", "check"), "alembic check"),
)

COMMANDS: dict[str, Command] = {command.id: command for command in _ALL}


def _get(command_id: str) -> Command:
    command = COMMANDS.get(command_id)
    if command is None:
        raise CommandError(f"unknown command {command_id!r}")
    return command


def resolve(command_id: str, vertical: str | None = None) -> tuple[str, ...]:
    command = _get(command_id)
    if not command.takes_vertical:
        if vertical is not None:
            raise CommandError(f"{command_id!r} takes no argument")
        return command.argv
    if vertical is None:
        raise CommandError(f"{command_id!r} requires a vertical")
    if vertical not in VERTICALS:
        raise CommandError(f"{vertical!r} is not a known vertical")
    return (*command.argv, vertical)


def env_for(command_id: str) -> dict[str, str]:
    """Extra environment for one command. Merged over os.environ by the runner.

    COMPOSE_PROJECT_NAME is not a nicety: docker-compose.yml pins container_name, so
    compose invoked without it from a second worktree creates a *new* project with an
    empty volume and then claims the running container.
    """
    return {"COMPOSE_PROJECT_NAME": "studio-manager"} if _get(command_id).compose else {}


def cwd_for(command_id: str) -> str:
    return _get(command_id).cwd
