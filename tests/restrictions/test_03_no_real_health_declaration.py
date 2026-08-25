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

import ast
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


#: The module that DEFINES the rule. Everything else must consult it.
_EXEMPT = frozenset({ROOT / "app/core/break_glass.py"})

#: A break-glass IDENTIFIER -- a name in the code, not the phrase in a sentence.
_BREAK_GLASS_NAME = re.compile(r"break_?glass", re.IGNORECASE)


def _touches_break_glass(path: Path) -> bool:
    """Whether this file has any break-glass NAME in it, read from the parse tree.

    Prose is invisible here, and that is the point. The exemption list used to carry
    app/models/audit.py because its docstring explains that AuditLog records "a
    break-glass grant (§18.2)" -- documenting SPEC vocabulary is not a code path -- and
    M1 hit the same thing twice more: app/services/identity/platform.py's docstring says
    M9 owns break-glass, and app/routers/platform.py's says the same.

    A per-file exemption is the wrong remedy for that. It silences the file, so the day
    M9 adds a real break-glass path to a file exempted for a *comment*, this gate says
    nothing. Reading identifiers instead keeps every file in scope and lets all of them
    describe the rule they obey.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:  # pragma: no cover -- app/ failing to parse fails elsewhere first
        return False
    for node in ast.walk(tree):
        name = None
        if isinstance(node, ast.Name):
            name = node.id
        elif isinstance(node, ast.Attribute):
            name = node.attr
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            name = node.name
        elif isinstance(node, ast.arg):
            name = node.arg
        elif isinstance(node, ast.alias):
            name = node.asname or node.name
        elif isinstance(node, ast.ImportFrom):
            # The MODULE path lives here, not on the aliases beneath it -- so
            # `from app.core.break_glass import something` has no break-glass name in any
            # alias, and reading only aliases would miss the most direct form of use
            # there is.
            name = node.module
        if name and _BREAK_GLASS_NAME.search(name):
            return True
    return False


def test_no_break_glass_code_path_bypasses_the_check():
    """VACUOUS TODAY -- §18.2's elevation route is M9's, so the only break-glass
    identifier in app/ is the one app/core/break_glass.py defines.

    Source-level by necessity: 'M9's read path consulted this' is not observable until
    that path exists. It bites the day it does.
    """
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path in _EXEMPT:
            continue
        if _touches_break_glass(path) and "break_glass_may_read" not in path.read_text(
            encoding="utf-8"
        ):
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], (
        "these touch break-glass without consulting break_glass_may_read (§18.2, "
        f"§19.6): {offenders}"
    )


def test_the_detector_ignores_the_phrase_in_a_docstring(tmp_path):
    """The false positive this replaced a per-file exemption to fix."""
    probe = tmp_path / "probe.py"
    probe.write_text(
        '"""M9 owns break-glass (§18.2); this module does not."""\n# no break_glass here\n',
        encoding="utf-8",
    )
    assert _touches_break_glass(probe) is False


@pytest.mark.parametrize(
    "source",
    [
        "from app.core.break_glass import something\n",
        "def break_glass_read(x):\n    return x\n",
        "grant = session.break_glass_grant\n",
        "def f(break_glass=None):\n    return break_glass\n",
    ],
)
def test_the_detector_still_sees_a_real_break_glass_name(tmp_path, source):
    """The other half. A detector taught to ignore prose has to be shown still catching
    an import, a definition, an attribute and a parameter."""
    probe = tmp_path / "probe.py"
    probe.write_text(source, encoding="utf-8")
    assert _touches_break_glass(probe) is True
