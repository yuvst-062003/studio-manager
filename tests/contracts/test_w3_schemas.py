"""W3's contract commit, the schema half — and the data seam M4 and M5 share.

Plan §1.3 seam 4: "The attendance lane renders
`<HealthBadge status={row.health_status} flags={row.derived_flags} />` from two fields the
contract commit put in `GET /sync/bootstrap`; the health lane owns the component and the
code that populates those two fields. Neither lane opens the other's file."

That only works if both fields exist, are typed, and reject the thing §4.3 forbids. These
tests are the contract commit's half of the bargain.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.schemas.attendance import BootstrapPayload, RosterEntry
from app.schemas.health import HealthDeclarationFullOut, HealthDeclarationOut
from pydantic import ValidationError


# -- the seam -----------------------------------------------------------------
def test_a_roster_entry_carries_both_seam_fields():
    """The two fields, by name. M5 writes against these exact spellings."""
    fields = RosterEntry.model_fields
    assert "health_status" in fields
    assert "derived_flags" in fields


def test_a_roster_entry_defaults_to_missing_and_no_flags():
    """A student with no declaration is `missing` with an empty mapping, not an error.
    §5.5: nothing on the mat is ever blocked — the roster shows ⚠ and the coach can still
    mark them present."""
    entry = RosterEntry(student_id=uuid.uuid4(), display_name="דנה")
    assert entry.health_status == "missing"
    assert entry.derived_flags == {}


def test_health_status_is_one_of_exactly_three_values():
    """§4.3 — `health_status(missing|trial_signed|signed)`. A fourth value would be a
    badge M5 has no branch for."""
    for status in ("missing", "trial_signed", "signed"):
        entry = RosterEntry(student_id=uuid.uuid4(), display_name="דנה", health_status=status)
        assert entry.health_status == status

    with pytest.raises(ValidationError):
        RosterEntry(student_id=uuid.uuid4(), display_name="דנה", health_status="pending")


def test_derived_flags_accept_booleans():
    entry = RosterEntry(
        student_id=uuid.uuid4(),
        display_name="דנה",
        derived_flags={"asthma": True, "medication": False},
    )
    assert entry.derived_flags == {"asthma": True, "medication": False}


def test_derived_flags_reject_free_text():
    """§4.3 — 'booleans only … never free text'. G7.

    This is the test that keeps a medical description off a coach's roster. It rejects
    rather than coercing on purpose: `bool("no")` is `True`, so a coercing validator would
    turn a template answering "no" into a ⚠ warning — a false alarm that teaches coaches
    to ignore the badge, which is worse than showing no badge at all.
    """
    with pytest.raises(ValidationError) as error:
        RosterEntry(
            student_id=uuid.uuid4(),
            display_name="דנה",
            derived_flags={"allergy": "אגוזים"},
        )
    assert "booleans only" in str(error.value)


def test_derived_flags_reject_a_truthy_string_rather_than_coercing_it():
    """The specific coercion that would be worst. `bool("no")` is `True`."""
    with pytest.raises(ValidationError):
        RosterEntry(student_id=uuid.uuid4(), display_name="דנה", derived_flags={"asthma": "no"})


# -- invariant 3, asserted on the shape rather than on a route ----------------
def test_no_roster_field_is_financial():
    """Invariant 3: 'no coach-scoped endpoint returns any financial field.' The roster is
    the most coach-reachable payload in the product, so the cheapest place to enforce this
    is the shape itself."""
    for name in RosterEntry.model_fields:
        assert "agorot" not in name
        assert "balance" not in name
        assert "debt" not in name


def test_the_bootstrap_payload_carries_a_server_clock():
    """§10.5 resolves conflicts on `device_marked_at`. A device an hour out of sync would
    win or lose every conflict for the wrong reason, so the client is given the server's
    time to measure its own skew against. §10.4's staleness banner reads it too."""
    payload = BootstrapPayload(
        server_time=datetime.now(UTC),
        from_time=datetime.now(UTC),
        to_time=datetime.now(UTC),
    )
    assert payload.server_time.tzinfo is not None


# -- the privacy split --------------------------------------------------------
def test_the_coach_safe_declaration_carries_no_answers():
    """§5.5's whole privacy model. `HealthDeclarationOut` is what a coach may receive."""
    assert "answers" not in HealthDeclarationOut.model_fields
    assert "answers_encrypted" not in HealthDeclarationOut.model_fields


def test_the_full_declaration_is_a_separate_type_that_extends_it():
    """Two types rather than one shape with an optional field. A single shape puts the
    decision at the call site, one forgotten `exclude=` away from a leak; inheritance
    means the coach-safe shape cannot drift away from the full one either."""
    assert issubclass(HealthDeclarationFullOut, HealthDeclarationOut)
    assert "answers" in HealthDeclarationFullOut.model_fields


def test_the_full_declaration_carries_the_signing_context():
    """§11.2 — every read of this is audit-logged, and the row itself records who signed,
    from where."""
    fields = HealthDeclarationFullOut.model_fields
    assert "signed_by_person_id" in fields
    assert "signed_ip" in fields
