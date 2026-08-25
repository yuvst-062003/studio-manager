"""W2's schemas, and G16 asserted across every wave this plan lands.

Task 2 Step 1 of docs/superpowers/plans/2026-08-25-foundations-w2-w5-contracts.md asks
for two things: that W2's `*Out` shapes carry what §7 says they carry, and that "every
`*Out` list response is a `CursorPage` (G16)". The second half is a rule about *all* the
waves, not about W2, so the detector below walks every schema module this plan owns
rather than naming W2's three.

**Why a detector and not four `assert isinstance` lines.** `app/schemas/_pagination.py`
says out loud what it exists to prevent: "M1 wrote `ClassListResponse`/`GroupListResponse`
by hand, each with the same two fields. That is fine for two, and it is nine verticals'
worth of drift by W5." Four assertions prove today is fine. A detector is what makes the
tenth vertical fail rather than quietly add an eleventh envelope shape to the generated
client.
"""

from __future__ import annotations

import importlib
import inspect
import pkgutil

import app.schemas
import pytest
from app.schemas._pagination import CursorPage
from app.schemas.people import RegistrationRequestOut, StudentOut
from app.schemas.schedule import SessionOut, TrialSlotOut
from pydantic import BaseModel

#: The verticals this plan authors. M1's modules are excluded deliberately -- see
#: GRANDFATHERED below, and `_pagination.py`'s docstring for why they exist at all.
OWNED_MODULES = (
    "schedule",
    "people",
    "health",
    "attendance",
    "billing",
    "events",
    "belts",
    "comms",
    "reports",
)

#: M1's six hand-rolled envelopes, listed rather than pattern-matched. They pre-date
#: `CursorPage` and live in files this plan does not own (§ Session ownership). Naming
#: them individually is what makes a *seventh* fail the build: the detector below allows
#: exactly these and nothing else, so M1 migrating them shrinks this tuple and anyone
#: adding one anywhere -- M1's modules included -- gets a red build instead of a shrug.
GRANDFATHERED = (
    "app.schemas.platform.StudioListResponse",
    "app.schemas.identity.ProviderListResponse",
    "app.schemas.structure.ClassListResponse",
    "app.schemas.structure.GroupListResponse",
    "app.schemas.structure.LocationListResponse",
    "app.schemas.structure.GroupStaffListResponse",
)


def _schema_modules():
    for info in pkgutil.iter_modules(app.schemas.__path__):
        yield importlib.import_module(f"app.schemas.{info.name}")


def _is_a_page_envelope(model: type[BaseModel]) -> bool:
    """A shape with `items` plus a paging field is a page envelope by any other name."""
    fields = set(model.model_fields)
    return "items" in fields and bool(fields & {"next_cursor", "has_more", "total", "count"})


def _origin(model: type[BaseModel]):
    return getattr(model, "__pydantic_generic_metadata__", {}).get("origin")


def test_every_page_envelope_is_cursor_page_or_a_named_exception():
    """G16, as a detector. Anything shaped like a page must *be* `CursorPage`."""
    bespoke = []
    for module in _schema_modules():
        for name, obj in vars(module).items():
            if not (inspect.isclass(obj) and issubclass(obj, BaseModel)):
                continue
            if obj is CursorPage or _origin(obj) is CursorPage:
                continue
            if not _is_a_page_envelope(obj):
                continue
            qualified = f"{module.__name__}.{name}"
            if qualified in GRANDFATHERED:
                continue
            bespoke.append(qualified)
    assert sorted(bespoke) == [], (
        "these define their own page envelope instead of CursorPage[T] (G16); add the "
        "vertical's alias as `XPage = CursorPage[XOut]` in its schema module"
    )


def test_the_detector_would_catch_a_hand_rolled_envelope():
    """The half that keeps the test above from being a tautology. It passes today; this
    is the evidence that it passes because the code is right, not because the shape check
    never matches anything."""

    class SomethingPage(BaseModel):
        items: list[str]
        next_cursor: str | None = None

    assert _is_a_page_envelope(SomethingPage)
    assert _origin(SomethingPage) is not CursorPage


def test_the_detector_recognises_a_real_cursor_page():
    assert _origin(CursorPage[SessionOut]) is CursorPage
    assert _is_a_page_envelope(CursorPage[SessionOut])


@pytest.mark.parametrize("vertical", OWNED_MODULES)
def test_each_landed_vertical_exposes_at_least_one_cursor_page(vertical):
    """A vertical with list endpoints and no `CursorPage` alias has either forgotten G16
    or hand-rolled something the detector above would have caught. Verticals that have not
    landed yet are skipped rather than asserted -- this file grows with the plan."""
    try:
        module = importlib.import_module(f"app.schemas.{vertical}")
    except ModuleNotFoundError:
        pytest.skip(f"{vertical} has not landed yet")
    pages = [name for name, obj in vars(module).items() if _origin(obj) is CursorPage]
    assert pages, f"app/schemas/{vertical}.py exposes no CursorPage alias"


# -- W2's own shapes ----------------------------------------------------------
def test_session_out_carries_both_regenerate_guards():
    """§5.6 / E2E-5. The gate is that a schedule change rewrites only future sessions and
    never a manually edited or ad-hoc one, and the client draws a lock from these two
    fields. A SessionOut without them makes E2E-5 unassertable from the API alone."""
    assert {"is_manually_edited", "is_ad_hoc"} <= set(SessionOut.model_fields)


def test_the_public_trial_slot_cannot_carry_staff_or_internal_ids():
    """§5.4's picker is unauthenticated. The docstring calls it "a deliberately narrower
    projection of SessionOut", and this is that claim as a test: the narrowing has to be
    structural, because a shape that cannot hold a coach's name cannot leak one."""
    fields = set(TrialSlotOut.model_fields)
    for leaked in ("staff", "training_year_id", "location_id", "attendance_taken"):
        assert leaked not in fields, f"TrialSlotOut leaks {leaked} to an anonymous caller"


def test_student_out_carries_status_but_never_flags():
    """§5.5's privacy split. `health_status` is a three-valued fact a coach may see;
    `derived_flags` is health data and travels only on the roster payload a coach is
    already authorised for. A general student shape carrying flags would leak them into
    every screen that happens to list students."""
    fields = set(StudentOut.model_fields)
    assert "health_status" in fields
    assert "derived_flags" not in fields


def test_the_approval_queue_row_never_carries_the_encrypted_payload():
    """§11.1. The payload is a stranger's personal data about a minor. A list endpoint
    that decrypted every row would defeat the encryption for the cost of one page load."""
    assert "payload" not in RegistrationRequestOut.model_fields
    assert "payload_encrypted" not in RegistrationRequestOut.model_fields
