"""F2 of the 2026-09-08 scaling audit — one studio's bad row must not skip the rest.

Every worker shares one shape: select the active studios, then loop, opening a
`TenantSession` per studio. None wrapped the loop body, and `record_run` re-raises by
design — so the process exited non-zero and every studio after the failing one was never
processed. There is no retry before the next firing, which for the five daily jobs is
twenty-four hours.

**The damage scales with customer count while the signal does not.** At a hundred studios a
failure at studio thirty-seven leaves sixty-three clubs unbilled, unchased and unnotified,
and the operator sees one red row reading `billing-run failed` with nothing anywhere saying
how many tenants were skipped.
"""

from __future__ import annotations

import uuid

import pytest
from app.core.jobs import for_each_studio


def test_a_failing_studio_does_not_stop_the_ones_after_it() -> None:
    seen: list[int] = []

    def body(studio_id: uuid.UUID) -> None:
        index = order.index(studio_id)
        if index == 1:
            raise RuntimeError("this studio's data is bad")
        seen.append(index)

    order = [uuid.uuid4() for _ in range(3)]
    failed = for_each_studio(order, body)

    assert seen == [0, 2]
    assert failed == 1


def test_a_clean_pass_reports_no_failures() -> None:
    order = [uuid.uuid4() for _ in range(3)]
    seen: list[uuid.UUID] = []
    assert for_each_studio(order, seen.append) == 0
    assert seen == order


def test_every_studio_failing_is_still_not_an_exception() -> None:
    """A worker whose every studio fails has a real problem, and the heartbeat is where an
    operator should read it. Raising here would lose the count along with the ones that
    succeeded — there are none, but the caller cannot know that without the number."""
    order = [uuid.uuid4() for _ in range(2)]

    def always(studio_id: uuid.UUID) -> None:
        raise RuntimeError("nope")

    assert for_each_studio(order, always) == 2


def test_a_failure_is_logged_with_no_studio_data(caplog: pytest.LogCaptureFixture) -> None:
    """§11.7 — the studio id identifies a tenant, not a person, and is what an operator
    needs to find the bad row. Nothing else from the exception reaches the log message."""
    studio_id = uuid.uuid4()

    def body(_: uuid.UUID) -> None:
        raise RuntimeError("a child named Dana broke this")

    with caplog.at_level("ERROR"):
        for_each_studio([studio_id], body)

    assert any("Dana" not in record.getMessage() for record in caplog.records)
    assert caplog.records, "a skipped studio must leave a trace"
