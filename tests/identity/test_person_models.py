"""SPEC 3.1, 3.3 and 4.3's person block.

The assertion that matters most here is the negative one: there is no `guardian` role
and no `guardian` value in the role enum. 3.1 is explicit -- "Guardian is not a role.
There is no guardian role to grant, no role_assignment row, and nothing for a manager to
assign." A role enum that accepted it would collapse 6.1's two access queries into one,
and the refusal screens would stop distinguishing the two apps.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.person import ROLES


def test_guardian_is_not_a_role():
    """3.1. The single most load-bearing negative in the identity model."""
    assert "guardian" not in ROLES
    assert ROLES == ("owner", "manager", "lead_coach", "assistant_coach")


def test_a_person_does_not_need_a_login():
    """3.3 -- 'A person does not need a login; auth_identity_id is nullable.' A young
    student is a Person with no identity and the parent runs the app."""
    assert Base.metadata.tables["person"].c["auth_identity_id"].nullable is True


def test_guardian_is_the_only_link_between_a_parent_and_anything():
    """3.3 -- 'guardian -- a link (person, student, is_primary). This is the only thing
    that connects a parent to anything. There is no household or family entity.'"""
    table = Base.metadata.tables["guardian"]
    for column in ("student_id", "person_id", "is_primary", "relation"):
        assert column in table.c, column


def test_guardian_student_id_has_no_foreign_key_yet():
    """D-M1-1. `student` is M3's table. This mirrors audit_log's actor columns, which
    carried plain UUIDs with no constraint until M1 landed the tables they point at."""
    assert list(Base.metadata.tables["guardian"].c["student_id"].foreign_keys) == []


def test_one_person_holds_at_most_one_live_row_per_scope():
    """3.2's matrix is per (person, role, scope). Two live assistant_coach rows on the
    same group are not a second grant, they are a duplicate -- and a duplicate is what
    makes a revocation look like it only half-worked."""
    names = {index.name for index in Base.metadata.tables["role_assignment"].indexes}
    assert "uq_role_assignment_live" in names


def test_a_studio_has_at_most_one_live_owner():
    """3.1 -- 'owner: One studio; created with the studio; exactly one; cannot be
    removed.' Partial on revoked_at IS NULL, so naming a successor stays possible."""
    names = {index.name for index in Base.metadata.tables["role_assignment"].indexes}
    assert "uq_role_assignment_one_live_owner" in names


def test_every_tenant_scoped_person_table_is_scoped():
    for name in ("person", "role_assignment", "invitation", "guardian"):
        assert Base.metadata.tables[name].c["studio_id"].nullable is False, name


def test_an_invitation_stores_a_hash_and_never_the_token():
    """5.3 -- 'the invitation carries a token binding the accepting auth identity to the
    pre-created Person.' That token is a bearer credential; a database read must not
    yield one."""
    table = Base.metadata.tables["invitation"]
    assert "token_hash" in table.c
    assert "token" not in table.c


def test_exactly_one_guardian_per_student_is_primary():
    """5.3 -- 'Exactly one guardian per student carries is_primary. That flag decides
    only whose name the bill is addressed to and which person a הוראת קבע payment is
    matched to.'"""
    names = {index.name for index in Base.metadata.tables["guardian"].indexes}
    assert "uq_guardian_one_primary_per_student" in names


def test_a_person_can_be_anonymized_without_deleting_the_row():
    """11.4 and 3.3 point 5 -- 'Anonymization wipes the Person while leaving financial
    rows intact, because financial rows never duplicate a name.' M9 writes it; the
    column exists from the start so no later migration rewrites this table."""
    assert "anonymized_at" in Base.metadata.tables["person"].c
