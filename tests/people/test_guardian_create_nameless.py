"""Decision 20 (2026-09-03 onboarding doors spec) — the manager's 3-field add-student form
sends a guardian email and no guardian name at all. `GuardianCreate` (§6's API table) must
accept that, and the existing "a guardian needs an email or a phone" rule must still hold.
"""

from __future__ import annotations

import pytest
from app.schemas.people import GuardianCreate
from pydantic import ValidationError


def test_guardian_create_accepts_an_email_with_no_names():
    guardian = GuardianCreate(email="parent@example.invalid")
    assert guardian.first_name is None
    assert guardian.last_name is None
    assert guardian.email == "parent@example.invalid"


def test_guardian_create_accepts_a_phone_with_no_names_either():
    guardian = GuardianCreate(phone="0521234567")
    assert guardian.first_name is None
    assert guardian.last_name is None


def test_guardian_create_still_refuses_neither_email_nor_phone():
    """The validator this schema carries is about reachability, not names — a guardian
    with a name and nothing else to invite them on is exactly as unreachable as one with
    neither."""
    with pytest.raises(ValidationError):
        GuardianCreate(first_name="דוד", last_name="כהן")
