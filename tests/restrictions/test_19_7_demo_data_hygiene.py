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

import re
from pathlib import Path

import sqlalchemy as sa
from app.core.demo import CROSS_STUDIO_CALLERS, exclude_demo_studios
from app.models.studio import Studio
from sqlalchemy import select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]


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
    """
    pattern = re.compile(r"with_all_tenants")
    unaccounted = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        rel = str(path.relative_to(ROOT))
        if rel in CROSS_STUDIO_CALLERS:
            continue
        text = path.read_text(encoding="utf-8")
        if pattern.search(text) and "exclude_demo_studios" not in text:
            unaccounted.append(rel)
    assert unaccounted == [], (
        "these reach across studios without excluding the demo studio (§19.7). Apply "
        "exclude_demo_studios, or add the file to CROSS_STUDIO_CALLERS with the reason "
        f"it is exempt: {unaccounted}"
    )


def test_every_allowlisted_caller_still_exists_and_carries_a_reason():
    """An allowlist entry for a deleted file is an exemption nobody notices growing
    stale -- and the next file with that path inherits it."""
    for rel, reason in CROSS_STUDIO_CALLERS.items():
        assert (ROOT / rel).exists(), f"{rel} is allowlisted but does not exist"
        assert reason.strip(), rel
