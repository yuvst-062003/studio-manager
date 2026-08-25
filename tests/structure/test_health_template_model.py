"""Conflict C3, the model half. 14 puts health in M4; M3's trial booking needs a
declaration before that. 4.3 already types the column `kind(full|trial)`, so seeding a
trial template in M1 unblocks M3 without pulling M4 forward.

`health_declaration` is deliberately NOT here, and the last test is what keeps it that
way. This file holds the questions; nothing in it can hold a minor's answers, and that
is the property that lets M1 touch health at all (G7, 19.6 restriction 3).
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.models.base import Base
from app.models.health import HEALTH_TEMPLATE_KINDS


def test_a_template_is_either_full_or_trial():
    assert HEALTH_TEMPLATE_KINDS == ("full", "trial")


def test_the_template_is_tenant_scoped():
    assert Base.metadata.tables["health_form_template"].c["studio_id"].nullable is False


def test_a_studio_has_at_most_one_template_per_kind_and_version():
    """A second published v1 trial template is ambiguity at the exact moment a parent is
    signing something."""
    names = {index.name for index in Base.metadata.tables["health_form_template"].indexes}
    assert "uq_health_form_template_kind_version" in names


def test_the_schema_is_versioned_because_a_declaration_records_what_was_signed():
    """4.3 stores template_version on the declaration. A template with no version makes
    that column meaningless the first time the questions change."""
    assert "version" in Base.metadata.tables["health_form_template"].c


def test_m1_ships_no_table_that_can_hold_a_declaration():
    """G7 and 19.6 restriction 3. M4 adds health_declaration and consent_record to this
    same file; until then this module must not create somewhere for a minor's answers to
    land, encrypted or otherwise."""
    assert "health_declaration" not in Base.metadata.tables
    assert "consent_record" not in Base.metadata.tables


def test_no_column_here_could_hold_an_answer():
    """The stronger form of the test above. A column named `answers` or `signature` on
    the TEMPLATE would be the same defect wearing a different table name."""
    columns = set(Base.metadata.tables["health_form_template"].c.keys())
    for forbidden in ("answers", "answers_encrypted", "signature_image_encrypted", "derived_flags"):
        assert forbidden not in columns, forbidden
