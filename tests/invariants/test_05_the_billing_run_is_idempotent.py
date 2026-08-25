"""SPEC §13 invariant 5: the billing run is idempotent across repeated executions.

Vacuous until M6 *implements* `BillingService` -- correct and intended. What is *not*
vacuous is the harness: `assert_idempotent` is unit-tested here against deliberately
non-idempotent stubs, so when M6 arrives the real assertion is a one-line change to
something already known to work rather than something written under deadline.

**The trigger was corrected in W4's contract commit.** As written, this fired the moment
`app.services.billing.BillingService` could be imported. Plan §2.2 makes that the wrong
signal: every cross-lane seam lands on `main` as an empty-bodied class with a real
signature a full milestone before the lane that fills it in, so the class exists in W4 and
M6 is still unwritten. Firing then would have meant demanding a real billing run be
asserted against a method that raises `NotImplementedError`, and the only ways out are to
delete the tripwire or to weaken it -- which is how a tripwire that fires at the wrong
moment gets disarmed for good. It now asks whether the body is still a stub.

Why this one matters more than most: the billing run creates money rows. A run that is
not idempotent produces "we charged them twice" in a community where every parent knows
every other parent (SPEC §8.1a).
"""

from __future__ import annotations

import ast
import importlib
import inspect
import textwrap
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


def is_still_a_seam(method: Any) -> bool:
    """True while `method`'s entire body is `raise NotImplementedError`.

    Parsed rather than called. Calling it would mean constructing arguments here, which
    couples this tripwire to a signature M6 is allowed to extend -- and then the tripwire
    breaks for a reason that has nothing to do with idempotence, at the exact moment
    someone is busy. The docstring is skipped because §2.2's seams all carry one.
    """
    try:
        source = textwrap.dedent(inspect.getsource(method))
    except OSError, TypeError:
        return False
    body = ast.parse(source).body[0].body  # type: ignore[attr-defined]
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    if len(body) != 1 or not isinstance(body[0], ast.Raise):
        return False
    raised = body[0].exc
    if isinstance(raised, ast.Call):
        raised = raised.func
    return isinstance(raised, ast.Name) and raised.id == "NotImplementedError"


def test_the_billing_run_is_idempotent():
    service = _billing_service()
    if service is None:
        pytest.skip(
            "app.services.billing.BillingService does not exist yet. This is the one "
            "invariant that cannot be written before the thing it guards exists; the "
            "harness is tested below instead."
        )
    if is_still_a_seam(service.create_charge):
        pytest.skip(
            "BillingService is still W4's empty-bodied seam -- create_charge raises "
            "NotImplementedError. There is no billing run to assert idempotence over "
            "until lane MONEY (M6) fills it in."
        )
    raise AssertionError(  # pragma: no cover -- reached only once M6 implements the body
        "BillingService.create_charge has a real body. Wire assert_idempotent() to a real "
        "run over a seeded period and delete this line."
    )


# -- and the seam detector is proven to tell a stub from an implementation ----
def test_the_seam_detector_recognises_the_contract_stub():
    """The live case, asserted against the real seam rather than a fixture, so this stops
    passing the moment M6 writes a body -- which is precisely when the tripwire above must
    start firing."""
    service = _billing_service()
    assert service is not None, "W4's contract commit should have landed the seam"
    assert is_still_a_seam(service.create_charge)
    assert is_still_a_seam(service.recompute_charge_status)


def test_the_seam_detector_rejects_a_real_body():
    class Implemented:
        def create_charge(self) -> int:
            """A body that does something."""
            return 1

    assert not is_still_a_seam(Implemented.create_charge)


def test_the_seam_detector_rejects_a_body_that_only_starts_with_a_raise():
    """A method that raises conditionally is implemented, not a stub. Without this the
    detector would read `if x: raise NotImplementedError` followed by real work as a seam
    and stay silent through the whole of M6."""

    class PartlyImplemented:
        def create_charge(self, ok: bool) -> int:
            if not ok:
                raise NotImplementedError
            return 1

    assert not is_still_a_seam(PartlyImplemented.create_charge)


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
