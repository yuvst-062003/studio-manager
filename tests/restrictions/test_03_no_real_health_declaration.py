"""§19.6 restriction 3: 'Cannot read any real person's health declaration. Legitimate
support access to real data goes through break-glass (§18.2), which is time-boxed,
reason-tagged, written to the tenant's own audit log and notified to the studio owner.
Break-glass excludes health declaration contents entirely, and the developer flag does
not change that.'

PARTIALLY VACUOUS. `break_glass_may_read` is fully asserted -- including the property
the restriction actually names, that passing is_developer=True changes nothing. What is
vacuous is coverage: `health_declaration` is M4's table and POST /platform/break-glass
is M9's route, so the detector at the bottom finds only this module today. It bites when
M9 lands the elevation path.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from app.core.break_glass import HEALTH_ENTITY_TYPES, break_glass_may_read

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("entity_type", sorted(HEALTH_ENTITY_TYPES))
def test_health_is_excluded_from_break_glass(entity_type):
    assert not break_glass_may_read(entity_type)


@pytest.mark.parametrize("entity_type", sorted(HEALTH_ENTITY_TYPES))
def test_the_developer_flag_does_not_change_that(entity_type):
    """The sentence §19.6 actually writes. The parameter exists precisely so this can
    be asserted rather than assumed from its absence."""
    assert break_glass_may_read(entity_type, is_developer=True) is break_glass_may_read(
        entity_type, is_developer=False
    )
    assert not break_glass_may_read(entity_type, is_developer=True)


@pytest.mark.parametrize("entity_type", ["student", "charge", "session", "attendance"])
def test_break_glass_still_reaches_the_data_it_exists_for(entity_type):
    """§18.2 exists because 'sometimes you genuinely will need to look at a studio's
    real data to debug something'. A function that refused everything would satisfy the
    restriction and delete the feature."""
    assert break_glass_may_read(entity_type)


def test_every_health_entity_type_spec_names_is_covered():
    """SPEC §4.3's health tables. Listed explicitly so adding a table in M4 without
    adding it here is a red build."""
    assert {
        "health_declaration",
        "health_declaration_version",
        "health_template",
    } <= HEALTH_ENTITY_TYPES


#: Prose that predates this module and names §18.2 as context rather than implementing
#: it. app/models/audit.py (Task 1) explains why AuditLog skips TenantMixin by listing
#: 'a break-glass grant (§18.2)' among the studio-less events it records -- documenting
#: SPEC vocabulary in a docstring is not a break-glass code path, so it is exempt
#: alongside app/core/break_glass.py itself.
_EXEMPT = frozenset(
    {
        ROOT / "app/core/break_glass.py",
        ROOT / "app/models/audit.py",
    }
)


def test_no_break_glass_code_path_bypasses_the_check():
    """VACUOUS TODAY -- §18.2's elevation route is M9's, so the only function here
    matching /break.?glass/ is the one in app/core/break_glass.py.

    Source-level by necessity: 'M9's read path consulted this' is not observable until
    that path exists. It bites the day it does.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path in _EXEMPT:
            continue
        text = path.read_text(encoding="utf-8")
        if re.search(r"break.?glass", text, re.IGNORECASE) and "break_glass_may_read" not in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], (
        "these touch break-glass without consulting break_glass_may_read (§18.2, "
        f"§19.6): {offenders}"
    )
