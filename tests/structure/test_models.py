"""SPEC 4.3's structure block -- the tables M2's schedule and M5's attendance both hang
off, which is why M1 owns them and why W1 is sequential.

4.3 reaches a group through its class and gives `group` no studio_id of its own. G9 and
invariant 2 are unconditional, so the models denormalize it one level: the tenant filter
stays a single predicate rather than becoming a join, which is what lets
TenantSession apply it to every query without knowing the schema.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.structure import GROUP_STAFF_ROLES


def test_a_group_belongs_to_a_class():
    """4.1 -- class -> group is the spine every later milestone hangs off."""
    fks = {fk.column.table.name for fk in Base.metadata.tables["group"].c["class_id"].foreign_keys}
    assert fks == {"class"}


def test_group_and_group_staff_carry_studio_id_even_though_4_3_omits_it():
    for name in ("group", "group_staff"):
        assert Base.metadata.tables[name].c["studio_id"].nullable is False, name


def test_group_staff_roles_are_the_two_coach_roles_only():
    """4.3 -- role(lead_coach|assistant_coach). A manager is not group staff; a manager
    is a studio-scoped role_assignment."""
    assert GROUP_STAFF_ROLES == ("lead_coach", "assistant_coach")


def test_a_class_name_is_unique_inside_a_studio():
    """Two classes called ג'ודו in one club is a data-entry mistake, and the setup
    wizard is exactly where it would be made."""
    names = {index.name for index in Base.metadata.tables["class"].indexes}
    assert "uq_class_studio_id_name" in names


def test_a_group_name_is_unique_inside_its_class():
    """Not inside the studio: 'מתחילים' under both ג'ודו and קראטה is two real groups."""
    names = {index.name for index in Base.metadata.tables["group"].indexes}
    assert "uq_group_class_id_name" in names


def test_one_coach_holds_at_most_one_live_assignment_per_group():
    """A coach re-added to a group they already lead is a duplicate, and a duplicate is
    what makes 3.2's 'view students in own groups' return the same roster twice."""
    names = {index.name for index in Base.metadata.tables["group_staff"].indexes}
    assert "uq_group_staff_live" in names


def test_m1_ships_none_of_m2s_schedule_tables():
    """The boundary, asserted. M2 owns training_year, studio_closure,
    group_schedule_rule, session and session_staff -- and W2's contract commit is where
    they land, on main, before either worktree exists."""
    for name in (
        "training_year",
        "studio_closure",
        "group_schedule_rule",
        "session",
        "session_staff",
    ):
        assert name not in Base.metadata.tables, f"{name} is M2's, not M1's"
