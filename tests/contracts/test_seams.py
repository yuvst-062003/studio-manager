"""The cross-lane seams, asserted as signatures.

Plan §2.2 item 4: "Empty-bodied service classes with **real signatures and real return
types** for anything the *other* lane calls. Each raises `NotImplementedError` and has a
test asserting the signature."

**Why a signature test is worth writing at all.** A seam is the one thing two concurrently
running lanes agree on without talking. If lane M2 quietly renames `from_date` to `start`,
lane M3's code still compiles — it fails at import time in *M3's* worktree, days later,
and looks like M3's bug. This file makes the change fail in the lane that made it.

The assertions are on `inspect.signature`, not on behaviour, because there is no behaviour
yet. That is the point: the contract exists before either implementation does.
"""

from __future__ import annotations

import inspect
import uuid
from datetime import date

import pytest
from app.models.schedule import Session
from app.services.schedule import ScheduleService


def _signature(func):
    """`eval_str=True` is load-bearing.

    Every module in `app/` carries `from __future__ import annotations`, so annotations
    are *strings* at runtime and a naive `inspect.signature` compares `"uuid.UUID"` to
    `uuid.UUID` and fails for a seam that is perfectly correct. Resolving them is also
    what makes the assertion mean something: it proves the annotation names a type that
    actually imports, not merely that someone typed the right characters.
    """
    return inspect.signature(func, eval_str=True)


# -- W2: ScheduleService.materialize_sessions ---------------------------------
def test_materialize_sessions_takes_a_group_and_a_date_range():
    """Plan W2 seam, verbatim: `materialize_sessions(group_id, from_date, to_date)`."""
    parameters = _signature(ScheduleService.materialize_sessions).parameters
    assert list(parameters) == ["self", "group_id", "from_date", "to_date"]


def test_materialize_sessions_is_typed_end_to_end():
    """`-> list[Session]`, not `-> list`. M3 builds its trial-slot picker against the
    generated client, and an untyped return is what makes a seam drift silently."""
    signature = _signature(ScheduleService.materialize_sessions)
    assert signature.parameters["group_id"].annotation is uuid.UUID
    assert signature.parameters["from_date"].annotation is date
    assert signature.parameters["to_date"].annotation is date
    assert signature.return_annotation == list[Session]


def test_materialize_sessions_refuses_rather_than_returning_nothing():
    """A stub returning `[]` would let M3 pass its own tests against a lie and ship a
    permanently empty picker. `NotImplementedError` cannot be mistaken for an answer."""
    with pytest.raises(NotImplementedError):
        ScheduleService().materialize_sessions(uuid.uuid4(), date(2026, 9, 1), date(2026, 9, 30))
