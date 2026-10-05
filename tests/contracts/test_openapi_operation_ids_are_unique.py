"""Every operation in the schema has an id of its own.

The `generated` CI job regenerates `openapi.json` plus the TypeScript client and fails on
any uncommitted diff (SPEC §8.2). That gate is only a gate if the export is a FUNCTION of
the source — and for one route it was not.

`@router.api_route("/health", methods=["GET", "HEAD"])` is a single route carrying two
methods, and FastAPI builds one operation id for it out of `route.methods`, which is a
`set`. So the id came out `read_health_api_v1_health_get` or `..._head` depending on where
string hashing put "GET" and "HEAD" in that process: measured on 2026-10-05, seeds 0-2 gave
one and seeds 3-5 the other, from identical source on an identical FastAPI. Both path
entries then pointed at whichever name won, FastAPI warned `Duplicate Operation ID`, and
the committed artifact disagreed with the regenerated one about half the time. The job was
green on 2026-10-04 and red on 2026-10-05 with no change to the schema between them.

A coin-flip gate is worse than no gate: it spends somebody's afternoon on a diff that is
not a regression, and the next genuine staleness is read as the same flake and waved
through. So the duplicate is asserted against directly, where it is cheap to read, rather
than left for the diff to discover non-deterministically.
"""

from __future__ import annotations

from collections import defaultdict


def test_no_two_operations_share_an_operation_id() -> None:
    """Asserted over whichever surface this suite is running against.

    `scripts/export_openapi.py` exports with `ENV=production`, where §19.2 has dropped the
    dev router. A duplicate in a dev-only route would therefore not reach the committed
    artifact — but it is still a duplicate, and `/dev/*` is mounted in every other
    environment, so it is worth failing on here too.
    """
    from app.main import app

    seen: dict[str, list[str]] = defaultdict(list)
    for path, methods in app.openapi()["paths"].items():
        for method, operation in methods.items():
            operation_id = operation.get("operationId")
            if operation_id is not None:
                seen[operation_id].append(f"{method.upper()} {path}")

    duplicates = {name: where for name, where in seen.items() if len(where) > 1}
    assert not duplicates, (
        "these operation ids are shared, so the generated client is a coin flip: "
        f"{duplicates}. Give each verb its own route rather than one `api_route` carrying "
        "several methods — see app/routers/health.py."
    )
