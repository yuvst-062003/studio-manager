"""HB-staging-superuser — is the app actually connecting as the runtime role?

SPEC §11.2 makes `audit_log` append-only **by grant**: the application role holds INSERT
and SELECT and nothing else. Revision 0001 creates `studio_app`, revision 0002 revokes
UPDATE and DELETE from it, and tests/core/test_audit_append_only.py has asserted that
grant since M0.2.

None of that is worth anything if the API connects as a superuser instead. Railway's
managed Postgres hands out exactly one role, so staging pointed both DSNs at it: the grant
was correct and *unused*. That is the most dangerous shape a security control can take —
it passes every test and protects nothing, and the audit log looks like evidence right up
until someone needs it to be.

This module asks the live connection what it actually is, rather than asking the migration
what it intended. It is the difference between a documented rule and a measured one.

**Why production refuses and staging warns.** A production deploy that refuses is visible
in thirty seconds and fixable by setting one secret. A production deploy that quietly runs
the whole product as a superuser is visible at the moment the audit log stops being
evidence, which is far too late. Staging warns instead because the unenforced condition is
true there *today*: refusing would take staging down for a state this milestone is in the
middle of fixing, and a gate that has to be disabled in order to deploy is a gate that
gets deleted.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import Engine, text

from app.core.config import settings

logger = logging.getLogger(__name__)

_AUDIT_TABLE = "audit_log"


class RuntimeRoleNotEnforcedError(RuntimeError):
    """The connection can mutate `audit_log`, so §11.2 is not in force."""


@dataclass(frozen=True)
class RuntimeRoleReport:
    connected_as: str
    can_select_audit_log: bool
    can_insert_audit_log: bool
    can_update_audit_log: bool
    can_delete_audit_log: bool

    @property
    def enforced(self) -> bool:
        """Append-only, not read-only: §11.2 needs INSERT to stay, or the app cannot
        audit at all and the missing rows look identical to a quiet month."""
        return (
            self.can_insert_audit_log
            and self.can_select_audit_log
            and not self.can_update_audit_log
            and not self.can_delete_audit_log
        )

    def explain(self) -> str:
        return (
            f"the api is connected to Postgres as {self.connected_as!r}, which can "
            f"UPDATE or DELETE {_AUDIT_TABLE}. SPEC §11.2 requires the runtime role to "
            f"hold INSERT and SELECT and nothing else. Point DATABASE_URL at "
            f"{settings.APP_DB_ROLE!r} with a password from a secret; leave "
            f"MIGRATION_DATABASE_URL on the schema owner — that split is the mechanism, "
            f"not a leftover. See docs/deploy/railway-runbook.md."
        )


def describe_runtime_role(engine: Engine) -> RuntimeRoleReport:
    """What this connection can do to `audit_log`, asked of Postgres itself.

    `has_table_privilege(current_user, ...)` and not a lookup against APP_DB_ROLE: a check
    that trusted the setting would report whatever the config claimed, which is precisely
    what was wrong on staging.
    """
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT current_user AS role,"
                " has_table_privilege(current_user, :t, 'SELECT') AS can_select,"
                " has_table_privilege(current_user, :t, 'INSERT') AS can_insert,"
                " has_table_privilege(current_user, :t, 'UPDATE') AS can_update,"
                " has_table_privilege(current_user, :t, 'DELETE') AS can_delete"
            ),
            {"t": _AUDIT_TABLE},
        ).one()
    return RuntimeRoleReport(
        connected_as=str(row.role),
        can_select_audit_log=bool(row.can_select),
        can_insert_audit_log=bool(row.can_insert),
        can_update_audit_log=bool(row.can_update),
        can_delete_audit_log=bool(row.can_delete),
    )


def enforce_runtime_role(engine: Engine) -> RuntimeRoleReport | None:
    """Measure, then act on the measurement according to the environment.

    Returns None when the question could not be asked. An unreachable database must not
    become a new way for a boot to fail: this answers a question about grants, and when it
    cannot ask it says so and stands aside rather than turning every database blip into a
    failed deploy.
    """
    try:
        report = describe_runtime_role(engine)
    except Exception as exc:  # noqa: BLE001 -- the reason matters more than the type
        logger.warning(
            "could not verify the runtime database role",
            extra={"error": str(exc), "app_db_role": settings.APP_DB_ROLE},
        )
        return None

    if report.enforced:
        logger.info(
            "audit_log is append-only by grant",
            extra={"connected_as": report.connected_as},
        )
        return report

    if settings.ENV == "production":
        raise RuntimeRoleNotEnforcedError(report.explain())

    # G11 — the payload goes in `extra`, never interpolated into the message: an f-string
    # has no key for the scrubber to match on.
    logger.warning(report.explain(), extra={"connected_as": report.connected_as})
    return report
