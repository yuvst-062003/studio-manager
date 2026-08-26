"""SPEC §13 invariant 5: the billing run is idempotent across repeated executions.

**Wired to a real run by lane MONEY (M6).** It was vacuous until then -- correct and
intended -- and what was never vacuous is the harness: `assert_idempotent` was unit-tested
here against deliberately non-idempotent stubs, so wiring it was a change to something
already known to work rather than something written under deadline. Those self-tests stay
below, because the harness is what the real assertion rests on.

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
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

import pytest
from app.core.tenancy import use_studio
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.models.structure import Class as StudioClass
from app.models.structure import Group
from app.models.studio import Studio
from sqlalchemy import select
from sqlalchemy.orm import Session


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


#: The period the seeded run bills. Inside the 2026/27 training year the rest of the suite
#: pins, and deliberately not a month boundary.
_T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
_PERIOD = (2026, 11)


def _seed_a_billable_period(session: Session) -> tuple[uuid.UUID, int]:
    """One studio, one priced student, one active enrollment. Returns (studio_id, charges).

    Seeded here rather than borrowed from `tests/billing/conftest.py`, because this
    directory runs **unscoped in every lane** -- an invariant that depended on one lane's
    fixtures would be an invariant only that lane could run.

    Committed rather than flushed: the run opens its own SAVEPOINTs, and a row living only
    inside an uncommitted transaction is a row the second execution cannot see.
    """
    suffix = uuid.uuid4().hex[:8]
    studio = Studio(name="מועדון חיוב", slug=f"inv5-{suffix}")
    session.add(studio)
    session.flush()

    plan = PricePlan(
        studio_id=studio.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=25_000,
        # A real fee, so the seeded period exercises BOTH idempotence mechanisms. The
        # tuition charge is protected by `uq_charge_student_period_kind`; the registration
        # fee carries a NULL period, so no index applies to it and §5.10 step 6's
        # once-per-student rule is a plain query -- which makes it the more fragile of the
        # two and exactly the one an invariant should be standing over.
        registration_fee_agorot=10_000,
        active_from=date(2026, 9, 1),
    )
    child = Person(studio_id=studio.id, first_name="ילד", last_name="בודק")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="בודק")
    klass = StudioClass(studio_id=studio.id, name="מתחילים", is_active=True)
    session.add_all([plan, child, payer, klass])
    session.flush()

    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים א", is_active=True)
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=date(2026, 9, 1),
        price_plan_id=plan.id,
    )
    session.add_all([group, student])
    session.flush()
    session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=payer.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=group.id,
                status="active",
                started_on=date(2026, 9, 1),
            ),
        ]
    )
    session.commit()
    # Two: the month's tuition and the once-ever registration fee.
    return studio.id, 2


def test_the_billing_run_is_idempotent(app_session):
    """**Wired by lane MONEY (M6).** Until M6 this skipped, because the seam it guards had
    no body -- and W4's contract commit corrected the trigger from "the class imports" to
    "the body is still a stub" so the skip could not silently become permanent.

    Why this one matters more than most: the billing run creates money rows. A run that is
    not idempotent produces "we charged them twice" in a community where every parent knows
    every other parent (§8.1a).

    Three executions, snapshotted after **each** -- see the harness's own self-tests below
    for why after each and not only at the end.
    """
    from app.services.billing.run import BillingRunService

    studio_id, expected = _seed_a_billable_period(app_session)

    def run() -> None:
        with use_studio(studio_id):
            BillingRunService(app_session).run(
                studio_id, period_year=_PERIOD[0], period_month=_PERIOD[1], at=_T0
            )
        app_session.commit()

    def snapshot() -> list[tuple[Any, ...]]:
        rows = app_session.execute(
            select(
                Charge.kind,
                Charge.amount_agorot,
                Charge.period_year,
                Charge.period_month,
                Charge.student_id,
            )
            .where(Charge.studio_id == studio_id)
            .order_by(Charge.student_id, Charge.kind)
        ).all()
        return [tuple(row) for row in rows]

    assert_idempotent(run, snapshot)
    assert len(snapshot()) == expected, (
        "the run produced no charges at all, so idempotence was asserted over nothing"
    )


# -- and the seam detector is proven to tell a stub from an implementation ----
def test_the_seam_detector_has_no_live_stub_left_to_point_at():
    """**Retired, and this is the note the previous version asked for.**

    The live case pointed at `BillingService.create_charge` until lane MONEY filled it in,
    then moved to `NotificationService.enqueue` -- with the instruction "when W5 fills that
    in, move it again to whichever seam is then pending -- or retire it, and say so here."

    There is no third. W5 was the last wave with a cross-lane seam, and lane COMMS (M8)
    filled `enqueue` in, so `app/services/` now holds no empty-bodied contract method at
    all. That was checked with this file's own detector rather than by grep: every class in
    every module under `app.services` was walked and `is_still_a_seam` returned False for
    each of their methods.

    What the retirement does NOT cost. The detector is still exercised, in both directions,
    by the two fixture cases below -- one stub it must recognise, one real body it must
    reject. And the tripwire it guards is asserted directly rather than by proxy:
    `test_the_billing_seam_is_no_longer_a_stub` is what keeps
    `test_the_billing_run_is_idempotent` from silently asserting over a method that raises.

    If a later wave introduces a new seam, this is where its live case goes -- point this
    test at it and delete this paragraph.
    """
    from app.services.comms import NotificationService

    assert not is_still_a_seam(NotificationService.enqueue)


def test_the_billing_seam_is_no_longer_a_stub():
    """The other half, and the reason the tripwire above is a real assertion rather than a
    skip. If this ever goes red, M6 was reverted and `test_the_billing_run_is_idempotent`
    is asserting over a method that raises."""
    service = _billing_service()
    assert service is not None, "W4's contract commit should have landed the seam"
    assert not is_still_a_seam(service.create_charge)
    assert not is_still_a_seam(service.recompute_charge_status)


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
