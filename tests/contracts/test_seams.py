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
from typing import Any

import pytest
from app.models.billing import Charge
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


# -- W3: HealthService.recompute_derived_flags --------------------------------
def test_recompute_derived_flags_takes_a_student():
    """Plan W3 seam, verbatim:
    `HealthService.recompute_derived_flags(student_id) -> dict[str, bool]`."""
    from app.services.health import HealthService

    parameters = _signature(HealthService.recompute_derived_flags).parameters
    assert list(parameters) == ["self", "student_id"]


def test_recompute_derived_flags_returns_booleans():
    """`dict[str, bool]`, not `dict[str, Any]`. §4.3 allows booleans only, and the
    annotation is the first place that rule is stated to M5."""
    from app.services.health import HealthService

    signature = _signature(HealthService.recompute_derived_flags)
    assert signature.parameters["student_id"].annotation is uuid.UUID
    assert signature.return_annotation == dict[str, bool]


def test_recompute_derived_flags_refuses_rather_than_returning_nothing():
    from app.services.health import HealthService

    with pytest.raises(NotImplementedError):
        HealthService().recompute_derived_flags(uuid.uuid4())


# -- W4: BillingService.create_charge / recompute_charge_status ----------------
def test_create_charge_takes_the_five_facts_a_charge_cannot_exist_without():
    """Plan W4 seam, verbatim. `studio_id` is explicit rather than read from the request
    context because the billing run is a **worker** (§5.10) -- there is no request, so
    `TenantSession` has nothing to infer from and the tenant has to be passed."""
    from app.services.billing import BillingService

    parameters = _signature(BillingService.create_charge).parameters
    assert list(parameters) == [
        "self",
        "studio_id",
        "payer_person_id",
        "kind",
        "amount_agorot",
        "due_date",
        "student_id",
        "event_id",
    ]


def test_student_and_event_are_keyword_only():
    """The reason this is asserted rather than left to style. Both are `UUID | None` in
    adjacent positions, so positionally `create_charge(..., event_id)` binds an event to
    `student_id` and type checking cannot see it -- the annotations are identical. M7's
    event fees are a pure caller of this method (plan W4), which makes M7 exactly the lane
    that would hit it. Keyword-only makes the mistake unspellable."""
    from app.services.billing import BillingService

    parameters = _signature(BillingService.create_charge).parameters
    for name in ("student_id", "event_id"):
        assert parameters[name].kind is inspect.Parameter.KEYWORD_ONLY, name
        assert parameters[name].default is None, name


def test_create_charge_is_typed_end_to_end():
    """`amount_agorot: int` is G2 stated in the signature: the seam cannot accept a float
    without the annotation being changed by someone who has to notice they are doing it."""
    from app.schemas.billing import ChargeKind
    from app.services.billing import BillingService

    signature = _signature(BillingService.create_charge)
    assert signature.parameters["studio_id"].annotation is uuid.UUID
    assert signature.parameters["payer_person_id"].annotation is uuid.UUID
    assert signature.parameters["kind"].annotation == ChargeKind
    assert signature.parameters["amount_agorot"].annotation is int
    assert signature.parameters["due_date"].annotation is date
    assert signature.parameters["student_id"].annotation == uuid.UUID | None
    assert signature.parameters["event_id"].annotation == uuid.UUID | None
    assert signature.return_annotation is Charge


def test_recompute_charge_status_takes_a_charge_and_returns_nothing():
    """`-> None`, deliberately. §4.3: `charge.status` is "a derived cache maintained in
    one place". Returning the Charge would invite a caller to read the status off the
    return value and cache it, which is how a derived field acquires a second reader that
    later becomes a second writer."""
    from app.services.billing import BillingService

    signature = _signature(BillingService.recompute_charge_status)
    assert list(signature.parameters) == ["self", "charge_id"]
    assert signature.parameters["charge_id"].annotation is uuid.UUID
    assert signature.return_annotation is None


def test_the_billing_seams_refuse_rather_than_returning_nothing():
    from app.services.billing import BillingService

    with pytest.raises(NotImplementedError):
        BillingService().create_charge(
            uuid.uuid4(), uuid.uuid4(), "tuition", 32000, date(2026, 9, 1)
        )
    with pytest.raises(NotImplementedError):
        BillingService().recompute_charge_status(uuid.uuid4())


# -- W5: NotificationService.enqueue ------------------------------------------
def test_enqueue_takes_a_person_a_kind_and_a_message():
    """Plan W5 seam, verbatim:
    `NotificationService.enqueue(person_id, kind, title, body, payload) -> Notification`.

    M9's at-risk and retention jobs are pure callers of this (plan W5), which is what lets
    the REPORTS lane raise a notification without opening a single file in the COMMS lane.
    """
    from app.services.comms import NotificationService

    parameters = _signature(NotificationService.enqueue).parameters
    assert list(parameters) == ["self", "person_id", "kind", "title", "body", "payload"]


def test_enqueue_is_typed_end_to_end():
    """`-> Notification`, not `-> None`. §5.11 fans one notification out to both channels,
    and a caller that wants the delivery report for what it just sent needs the row's
    identity — returning nothing would force M9 to re-query by guesswork."""
    from app.models.comms import Notification
    from app.services.comms import NotificationService

    signature = _signature(NotificationService.enqueue)
    assert signature.parameters["person_id"].annotation is uuid.UUID
    assert signature.parameters["kind"].annotation is str
    assert signature.parameters["title"].annotation is str
    assert signature.parameters["body"].annotation is str
    assert signature.parameters["payload"].annotation == dict[str, Any]
    assert signature.return_annotation is Notification


def test_enqueue_is_the_only_way_in_and_refuses_rather_than_returning_nothing():
    from app.services.comms import NotificationService

    with pytest.raises(NotImplementedError):
        NotificationService().enqueue(uuid.uuid4(), "belt_awarded", "t", "b", {})
