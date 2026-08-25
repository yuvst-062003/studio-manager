"""§19.7 -- 'The demo studio is excluded from platform_studio_stats, from every
cross-studio report and from the operations board totals (§18.3), so it never
contaminates the numbers you use to judge real studios.'

The helper is built now so that no later report has to remember. Two kinds of assertion
here, and the docstrings say which is which:

* The helper's own behaviour -- NOT VACUOUS. The demo studio exists today, so the
  filter is asserted against a real row.
* The detector over cross-studio call sites -- VACUOUS TODAY. `platform_studio_stats`
  is M9's and the operations board is M9's; the only `with_all_tenants` call sites in
  M0 are the demo service's own. It bites the moment M9 lands a report, which is
  exactly when it must.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
import sqlalchemy as sa
from app.core.demo import CROSS_STUDIO_CALLERS, exclude_demo_studios
from app.models.studio import Studio
from sqlalchemy import select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]

HATCH = "with_all_tenants"


def hatch_use_lines(path: Path) -> list[int]:
    """Every line in one file that actually USES the escape hatch.

    Reads the parse tree, not the text, and it took two attempts to get here -- both
    recorded because the second is the interesting one.

    A bare substring search flagged app/models/person.py for the accurate *comment*
    "this index is read under with_all_tenants". Requiring call syntax fixed that and
    then flagged app/routers/identity.py, whose docstring **quotes** the call as
    ``with_all_tenants(reason=...)`` while the file itself never opens the hatch. Text
    matching cannot tell code from an accurate description of code, and a gate that
    fires on accurate documentation gets vaguer documentation rather than safer code.

    Both real shapes are matched, and neither may be dropped:

    * ``with_all_tenants(reason=...)`` -- the broad context manager (app/core/tenancy.py),
      including the ``session.with_all_tenants(...)`` method form;
    * ``.execution_options(with_all_tenants=True)`` -- the narrow per-statement flag
      (app/services/demo/service.py and fixtures.py).
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:  # pragma: no cover -- app/ failing to parse fails elsewhere first
        return []

    lines: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (isinstance(func, ast.Name) and func.id == HATCH) or (
            isinstance(func, ast.Attribute) and func.attr == HATCH
        ):
            lines.add(node.lineno)
        for keyword in node.keywords:
            if (
                keyword.arg == HATCH
                and isinstance(keyword.value, ast.Constant)
                and keyword.value.value is True
            ):
                lines.add(node.lineno)
    return sorted(lines)


def test_the_filter_removes_the_demo_studio(migrated):
    with Session(migrated) as session:
        stmt = exclude_demo_studios(
            select(Studio.slug).execution_options(with_all_tenants=True), Studio.id
        )
        slugs = set(session.execute(stmt).scalars())
    assert "demo" not in slugs


def test_the_unfiltered_query_would_have_included_it(migrated):
    """The control. Without it, `demo not in slugs` is satisfied just as happily by a
    query that returns nothing at all."""
    with Session(migrated) as session:
        slugs = set(
            session.execute(select(Studio.slug).execution_options(with_all_tenants=True)).scalars()
        )
    assert "demo" in slugs


def test_the_filter_keeps_real_studios(migrated):
    import uuid

    real = uuid.uuid4()
    with Session(migrated) as session:
        session.execute(
            sa.text(
                "INSERT INTO studio (id, name, slug, timezone, default_locale, status, "
                "is_demo, settings, created_at, updated_at) VALUES "
                "(:id, 'Real Club', :slug, 'Asia/Jerusalem', 'he', 'active', false, "
                "'{}'::jsonb, now(), now())"
            ),
            {"id": real, "slug": f"real-{real.hex[:8]}"},
        )
        session.commit()
        stmt = exclude_demo_studios(
            select(Studio.id).execution_options(with_all_tenants=True), Studio.id
        )
        found = set(session.execute(stmt).scalars())
        session.execute(sa.text("DELETE FROM studio WHERE id = :id"), {"id": real})
        session.commit()
    assert real in found


def test_every_cross_studio_call_site_is_accounted_for():
    """VACUOUS TODAY -- the only with_all_tenants call sites in M0 are the demo
    service's own and the tenancy module that defines the hatch.

    It bites in M9, when platform_studio_stats and the operations board land: a report
    that reaches across studios must either apply exclude_demo_studios or be listed in
    CROSS_STUDIO_CALLERS with a reason. Source-level by necessity -- 'this query
    excluded the demo studio' is not observable without executing every report against
    a seeded database, and a gate that needs M9's data to run is a gate M9 turns off.

    The mitigation check requires a *call* (`exclude_demo_studios(`), not a substring
    match on the name -- a file that only mentions the helper in a comment or a TODO
    would satisfy a plain `"exclude_demo_studios" not in text` check without ever
    calling it, which detects the mitigation's name rather than its use.
    """
    # Matches both with_all_tenants(reason=...) (app/core/tenancy.py:77, the broad
    # context manager) and .execution_options(with_all_tenants=True) (tenancy.py:37,
    # the narrow per-statement flag used by app/services/demo/service.py and
    # fixtures.py) -- they share the literal string "with_all_tenants" and both are
    # cross-studio escape hatches this gate must catch. Do not narrow this to match
    # only one of them.
    unaccounted = _unaccounted(ROOT / "app")
    assert unaccounted == [], (
        "these reach across studios without excluding the demo studio (§19.7). Apply "
        "exclude_demo_studios, or add the file to CROSS_STUDIO_CALLERS with the reason "
        f"it is exempt: {unaccounted}"
    )


def _unaccounted(root: Path) -> list[str]:
    """The scan, extracted so the self-tests below can drive it over a probe tree instead
    of over app/. Extracted in M1, when the detector fired on a file that only NAMED the
    hatch in a comment -- and then again on one whose docstring quoted the call."""
    call_pattern = re.compile(r"exclude_demo_studios\s*\(")
    unaccounted = []
    for path in sorted(root.rglob("*.py")):
        try:
            rel = str(path.relative_to(ROOT))
        except ValueError:
            rel = str(path.relative_to(root))
        if rel in CROSS_STUDIO_CALLERS:
            continue
        text = path.read_text(encoding="utf-8")
        if hatch_use_lines(path) and not call_pattern.search(text):
            unaccounted.append(rel)
    return unaccounted


def test_a_docstring_that_quotes_the_call_is_not_a_caller(tmp_path):
    """The second false positive. app/routers/identity.py's docstring explains that the
    resolver "wraps each one in with_all_tenants(reason=...)" -- describing what a
    DIFFERENT module does -- and a call-shaped text match read it as a call here."""
    (tmp_path / "probe.py").write_text(
        '"""The resolver wraps each query in with_all_tenants(reason=...).\n\n'
        '    .execution_options(with_all_tenants=True) is the narrow form.\n    """\n'
        "x = 1\n",
        encoding="utf-8",
    )
    assert _unaccounted(tmp_path) == []


def test_a_file_that_only_names_the_hatch_in_a_comment_is_not_a_caller(tmp_path):
    """M1 found this the expensive way. app/models/person.py carries the comment
    "this index is read under with_all_tenants", which is an accurate note about how a
    query elsewhere uses the index -- and a bare substring search read it as a
    cross-studio query in a file that contains no query at all.

    The detector already holds the MITIGATION to 'a call, not a name'. The hazard gets
    the same standard, or the gate teaches people to write vaguer comments.
    """
    (tmp_path / "probe.py").write_text(
        '"""This index is read under with_all_tenants by the login resolver."""\n'
        "# see with_all_tenants in app/core/tenancy.py\n",
        encoding="utf-8",
    )
    assert _unaccounted(tmp_path) == []


@pytest.mark.parametrize(
    "line",
    [
        # Valid Python, because the detector parses rather than greps -- a fragment that
        # does not parse would be reported as "no uses" and the test would pass for
        # entirely the wrong reason.
        'with with_all_tenants(reason="a report"):\n    pass',
        "stmt.execution_options(with_all_tenants=True)",
        "session.with_all_tenants(reason='x')",
    ],
)
def test_a_real_use_of_the_hatch_is_still_caught(tmp_path, line):
    """The other half. A detector narrowed until it stops false-positiving has to be
    shown still catching both hatch shapes -- the broad context manager and the narrow
    per-statement flag -- or the fix is just a deletion."""
    (tmp_path / "probe.py").write_text(f"{line}\n", encoding="utf-8")
    assert _unaccounted(tmp_path) == ["probe.py"]


def test_every_allowlisted_caller_still_exists_and_carries_a_reason():
    """An allowlist entry for a deleted file is an exemption nobody notices growing
    stale -- and the next file with that path inherits it."""
    for rel, reason in CROSS_STUDIO_CALLERS.items():
        assert (ROOT / rel).exists(), f"{rel} is allowlisted but does not exist"
        assert reason.strip(), rel
