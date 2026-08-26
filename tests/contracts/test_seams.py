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
import json
import subprocess
import sys
import textwrap
import uuid
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any

import pytest
from app.models.schedule import Session
from app.services.schedule import ScheduleService
from sqlalchemy.orm import Session as OrmSession

ROOT = Path(__file__).resolve().parents[2]

#: The two W4/W5 seams. `create_charge -> Charge` resolves in-process since W4's contract
#: commit promoted `billing.py`; `enqueue -> Notification` still names
#: `app/models/_pending/`, which is the only reason the subprocess below survives. Named
#: once so the day W5 moves `comms.py` up, the greps land here and this helper can go.
_CREATE_CHARGE = "app.services.billing.BillingService.create_charge"
_ENQUEUE = "app.services.comms.NotificationService.enqueue"


def _signature(func):
    """`eval_str=True` is load-bearing.

    Every module in `app/` carries `from __future__ import annotations`, so annotations
    are *strings* at runtime and a naive `inspect.signature` compares `"uuid.UUID"` to
    `uuid.UUID` and fails for a seam that is perfectly correct. Resolving them is also
    what makes the assertion mean something: it proves the annotation names a type that
    actually imports, not merely that someone typed the right characters.
    """
    return inspect.signature(func, eval_str=True)


@cache
def _pending_signature(dotted: str) -> dict[str, Any]:
    """One seam's fully-resolved signature, computed in a **fresh interpreter**.

    One seam still names a model in `app/models/_pending/`: `NotificationService.enqueue ->
    Notification`, until W5's contract commit migrates `comms.py`. `create_charge ->
    Charge` was in the same position until W4 promoted `billing.py`, and is resolved here
    now only because both seams share this helper.

    Importing `comms` **anywhere in this process** registers `notification` in
    `Base.metadata` with nothing behind it -- and `DemoStudioService.wipe_plan` derives
    the reset's wipe from that metadata, so it would then issue `DELETE FROM notification`
    against a database holding no such relation, in whichever unrelated test happened to
    run after this module. An order-dependent failure three suites away is the worst
    possible way to pay for an import.

    So the resolution happens somewhere the pollution cannot outlive it.
    `tests/core/test_alembic_baseline.py` shells out to `alembic check` for the same
    reason. The assertions keep their full strength -- every annotation is really resolved
    against the really-imported class, `eval_str=True` and all -- they just compare
    `repr`s, because a class cannot cross a process boundary. This helper is deleted the
    day W5 moves `comms.py` up, which is the last model it is here for.
    """
    script = textwrap.dedent(f"""
        import inspect, json
        from app.models.billing import Charge               # noqa: F401 -- resolves the annotation
        from app.models._pending.comms import Notification  # noqa: F401
        module_name, class_name, method = {dotted!r}.rsplit(".", 2)
        module = __import__(module_name, fromlist=[class_name])
        signature = inspect.signature(
            getattr(getattr(module, class_name), method),
            eval_str=True,
            # The seam imports these under `if TYPE_CHECKING`, so they are absent
            # from its module globals at runtime -- which is where eval_str looks.
            locals={{"Charge": Charge, "Notification": Notification}},
        )
        print(json.dumps({{
            "order": list(signature.parameters),
            "annotations": {{n: repr(p.annotation) for n, p in signature.parameters.items()}},
            "kinds": {{n: p.kind.name for n, p in signature.parameters.items()}},
            "defaults": {{
                n: repr(p.default) for n, p in signature.parameters.items()
                if p.default is not inspect.Parameter.empty
            }},
            "return": repr(signature.return_annotation),
        }}))
    """)
    result = subprocess.run(
        [sys.executable, "-c", script], cwd=ROOT, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout)


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


def test_materialize_sessions_is_reached_through_a_session_bound_service():
    """How M3 actually calls the seam: `ScheduleService(session).materialize_sessions(...)`.

    The seam's signature has no room for a database session — it takes a group and two
    dates and nothing else, and W2's contract commit fixed that before either worktree
    existed — so M2 put the session on the constructor rather than widening the method and
    breaking the contract. That constructor is now part of what M3 builds against, which is
    why it is asserted here beside the method it serves.

    **This replaces an assertion that the body raised `NotImplementedError`.** That was the
    right test while the body was a stub: a seam returning `[]` would have let M3 pass its
    own tests against a lie and ship a permanently empty trial-slot picker. Now that lane
    SCHEDULE has filled it in, the behaviour is owned by `tests/schedule/test_materialization.py`,
    and asserting it here too would give two files an opinion about one rule.
    """
    parameters = _signature(ScheduleService.__init__).parameters
    assert list(parameters) == ["self", "session"]
    assert parameters["session"].annotation is OrmSession


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
    """**Updated by lane HEALTH (M4), which filled the body.**

    Until M4 this read `pytest.raises(NotImplementedError)`, which encoded "nobody has written
    this yet". The method is written now, and the property the test was really protecting is the
    one below: a service with no `TenantSession` **refuses** rather than quietly returning `{}` or
    opening a session of its own. §4.2's filter fails closed, and a service that chose its own
    tenant would be a service whose guarantees depend on who imported it.

    `NotImplementedError` subclasses `RuntimeError`, so this assertion is strictly weaker than the
    one it replaces and would still have passed before M4 filled the body. The signature
    assertions above are untouched — those are the seam.
    """
    from app.services.health import HealthService

    with pytest.raises(RuntimeError):
        HealthService().recompute_derived_flags(uuid.uuid4())


# -- W4: BillingService.create_charge / recompute_charge_status ----------------
def test_create_charge_takes_the_five_facts_a_charge_cannot_exist_without():
    """Plan W4 seam, verbatim. `studio_id` is explicit rather than read from the request
    context because the billing run is a **worker** (§5.10) -- there is no request, so
    `TenantSession` has nothing to infer from and the tenant has to be passed."""

    assert _pending_signature(_CREATE_CHARGE)["order"] == [
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

    signature = _pending_signature(_CREATE_CHARGE)
    for name in ("student_id", "event_id"):
        assert signature["kinds"][name] == "KEYWORD_ONLY", name
        assert signature["defaults"][name] == repr(None), name


def test_create_charge_is_typed_end_to_end():
    """`amount_agorot: int` is G2 stated in the signature: the seam cannot accept a float
    without the annotation being changed by someone who has to notice they are doing it."""
    from app.schemas.billing import ChargeKind

    annotations = _pending_signature(_CREATE_CHARGE)["annotations"]
    assert annotations["studio_id"] == repr(uuid.UUID)
    assert annotations["payer_person_id"] == repr(uuid.UUID)
    assert annotations["kind"] == repr(ChargeKind)
    assert annotations["amount_agorot"] == repr(int)
    assert annotations["due_date"] == repr(date)
    assert annotations["student_id"] == repr(uuid.UUID | None)
    assert annotations["event_id"] == repr(uuid.UUID | None)
    # The class itself cannot cross the process boundary; the subprocess resolved it.
    assert _pending_signature(_CREATE_CHARGE)["return"].endswith("billing.Charge'>")


def test_recompute_charge_status_takes_a_charge_and_returns_nothing():
    """`-> None`, deliberately. §4.3: `charge.status` is "a derived cache maintained in
    one place". Returning the Charge would invite a caller to read the status off the
    return value and cache it, which is how a derived field acquires a second reader that
    later becomes a second writer."""
    signature = _pending_signature("app.services.billing.BillingService.recompute_charge_status")
    assert signature["order"] == ["self", "charge_id"]
    assert signature["annotations"]["charge_id"] == repr(uuid.UUID)
    assert signature["return"] == repr(None)


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
    order = _pending_signature(_ENQUEUE)["order"]
    assert order == ["self", "person_id", "kind", "title", "body", "payload"]


def test_enqueue_is_typed_end_to_end():
    """`-> Notification`, not `-> None`. §5.11 fans one notification out to both channels,
    and a caller that wants the delivery report for what it just sent needs the row's
    identity — returning nothing would force M9 to re-query by guesswork."""
    signature = _pending_signature(_ENQUEUE)
    annotations = signature["annotations"]
    assert annotations["person_id"] == repr(uuid.UUID)
    assert annotations["kind"] == repr(str)
    assert annotations["title"] == repr(str)
    assert annotations["body"] == repr(str)
    assert annotations["payload"] == repr(dict[str, Any])
    assert signature["return"].endswith("comms.Notification'>")


def test_enqueue_is_the_only_way_in_and_refuses_rather_than_returning_nothing():
    from app.services.comms import NotificationService

    with pytest.raises(NotImplementedError):
        NotificationService().enqueue(uuid.uuid4(), "belt_awarded", "t", "b", {})
