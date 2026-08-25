"""The schema on disk matches the models, and the two foreign keys M0 deferred are real.

app/models/audit.py: "actor_person_id and actor_identity_id are plain UUIDs with no
foreign key: they reference person and auth_identity, which M1 owns. M1's revision adds
the constraints once the tables they point at exist." This is that revision, and this is
the test that says so -- landing the tables without the constraints would leave that
comment true forever and nobody would notice.
"""

from __future__ import annotations

from app.core.config import settings
from sqlalchemy import Engine, inspect, text

M1_TABLES = (
    "auth_identity",
    "platform_admin",
    "refresh_token",
    "auth_revocation",
    "oauth_transaction",
    "person",
    "role_assignment",
    "invitation",
    "guardian",
    "location",
    "class",
    "group",
    "group_staff",
    "health_form_template",
)


def _foreign_keys(engine: Engine, table: str) -> dict[tuple[str, ...], str]:
    return {
        tuple(fk["constrained_columns"]): fk["referred_table"]
        for fk in inspect(engine).get_foreign_keys(table)
    }


def test_every_m1_table_exists_at_head(migrated: Engine):
    present = set(inspect(migrated).get_table_names())
    assert set(M1_TABLES) <= present, sorted(set(M1_TABLES) - present)


def test_audit_log_actor_columns_now_carry_their_foreign_keys(migrated: Engine):
    """M0.2 deferred these with a comment naming M1."""
    fks = _foreign_keys(migrated, "audit_log")
    assert fks.get(("actor_person_id",)) == "person"
    assert fks.get(("actor_identity_id",)) == "auth_identity"


def test_studio_records_who_created_it(migrated: Engine):
    """4.3 -- `studio ... created_by_identity_id`. app/models/studio.py deferred it with
    the same reasoning as audit_log's actor columns."""
    assert _foreign_keys(migrated, "studio").get(("created_by_identity_id",)) == "auth_identity"


def test_is_developer_defaults_to_false_in_the_database(migrated: Engine):
    """19.2's exact wording is 'BOOLEAN NOT NULL DEFAULT false'. A model-level default is
    applied by Python; this asserts the database itself, which is what a seed or a
    migration inserting a row without naming the column will actually get."""
    columns = {c["name"]: c for c in inspect(migrated).get_columns("auth_identity")}
    assert columns["is_developer"]["nullable"] is False
    assert "false" in str(columns["is_developer"]["default"]).lower()


def test_the_partial_unique_indexes_are_really_partial(migrated: Engine):
    """A non-partial unique on role_assignment would forbid ever naming a second owner,
    even after the first is revoked. The WHERE clause is the whole difference between
    '3.1's exactly one' and 'one, forever'."""
    with migrated.connect() as connection:
        rows = dict(
            connection.execute(
                text(
                    "SELECT indexname, indexdef FROM pg_indexes "
                    "WHERE indexname IN ('uq_role_assignment_one_live_owner', "
                    "'uq_role_assignment_live', 'uq_guardian_one_primary_per_student', "
                    "'uq_group_staff_live')"
                )
            ).all()
        )
    assert set(rows) == {
        "uq_role_assignment_one_live_owner",
        "uq_role_assignment_live",
        "uq_guardian_one_primary_per_student",
        "uq_group_staff_live",
    }
    for name, definition in rows.items():
        assert " WHERE " in definition, f"{name} is unique but not partial: {definition}"


def test_the_runtime_role_can_use_every_new_table(migrated):
    """SPEC 11.2's split only works if the runtime role can actually reach what a
    migration created. Revision 0001 sets ALTER DEFAULT PRIVILEGES so new tables inherit
    the grant -- this asserts that actually happened rather than trusting it did."""
    role = settings.APP_DB_ROLE
    with migrated.connect() as connection:
        for table in M1_TABLES:
            granted = connection.execute(
                text("SELECT has_table_privilege(:role, :table, 'SELECT, INSERT')"),
                {"role": role, "table": table},
            ).scalar_one()
            assert granted is True, f"{role} cannot use {table}"


def test_the_runtime_role_still_cannot_rewrite_the_audit_log(migrated):
    """11.2, re-asserted after a revision that touched audit_log. A revision that adds a
    constraint must not quietly re-grant what 0002 revoked."""
    with migrated.connect() as connection:
        can_update = connection.execute(
            text("SELECT has_table_privilege(:role, 'audit_log', 'UPDATE')"),
            {"role": settings.APP_DB_ROLE},
        ).scalar_one()
    assert can_update is False
