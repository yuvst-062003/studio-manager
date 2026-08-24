"""SPEC §13 invariant 5: the billing run is idempotent across repeated executions.

Vacuous until M6 lands `BillingService` -- correct and intended. What is *not* vacuous is
the harness: `assert_idempotent` is unit-tested here against deliberately
non-idempotent stubs, so when M6 arrives the real assertion is a one-line change to
something already known to work rather than something written under deadline.

Why this one matters more than most: the billing run creates money rows. A run that is
not idempotent produces "we charged them twice" in a community where every parent knows
every other parent (SPEC §8.1a).
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from typing import Any

import pytest


def assert_idempotent(
    run: Callable[[], Any],
    snapshot: Callable[[], Any],
    *,
    executions: int = 3,
) -> None:
    """Run once, snapshot, then run again and re-snapshot after **every** execution.

    Comparing only the first and last snapshots is not enough, and the first version of
    this harness got it wrong: a run that alternates between two states returns to the
    first state after an odd number of executions, so a first-vs-last check with
    `executions=3` passes a two-cycle. Its own self-test caught that. Checking after each
    execution catches accumulation and alternation alike, whatever the parity.
    """
    run()
    baseline = snapshot()
    for execution in range(2, executions + 1):
        run()
        current = snapshot()
        assert current == baseline, (
            f"the run is not idempotent: execution {execution} produced {current!r}, "
            f"execution 1 produced {baseline!r}"
        )


def _billing_service() -> Any | None:
    try:
        module = importlib.import_module("app.services.billing")
    except ModuleNotFoundError:
        return None
    return getattr(module, "BillingService", None)


def test_the_billing_run_is_idempotent():
    service = _billing_service()
    if service is None:
        pytest.skip(
            "M6 has not landed app.services.billing.BillingService yet. This is the one "
            "invariant that cannot be written before the thing it guards exists; the "
            "harness is tested below instead."
        )
    raise AssertionError(  # pragma: no cover -- reached only once M6 lands
        "BillingService now exists. Wire assert_idempotent() to a real run over a seeded "
        "period and delete this line."
    )


# -- the harness is proven to work -------------------------------------------
def test_the_harness_accepts_an_idempotent_run():
    charges: dict[str, int] = {}

    def run() -> None:
        charges.setdefault("2026-09/student-1", 25000)

    assert_idempotent(run, lambda: dict(charges))


def test_the_harness_rejects_a_run_that_charges_twice():
    """The exact bug: keyed on nothing, so a second run bills the same month again."""
    charges: list[int] = []

    def run() -> None:
        charges.append(25000)

    with pytest.raises(AssertionError, match="not idempotent"):
        assert_idempotent(run, lambda: list(charges))


def test_the_harness_rejects_a_run_that_alternates():
    """Why the harness snapshots after every execution rather than only at the end.

    This test is why: with a first-vs-last comparison and executions=3, the flag is back
    to its execution-1 value by the end and the bug goes unnoticed.
    """
    state = {"flipped": False}

    def run() -> None:
        state["flipped"] = not state["flipped"]

    with pytest.raises(AssertionError, match="not idempotent"):
        assert_idempotent(run, lambda: dict(state))
