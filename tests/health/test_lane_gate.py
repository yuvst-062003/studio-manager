"""The fixtures W3's contract commit owes lane HEALTH (plan §2.2 item 8).

Not a test of the lane's code -- none exists yet. This asserts the *fixtures resolve*, so
the lane's first red is its own logic rather than a conftest that never worked.
"""

from __future__ import annotations

import uuid


def test_a_student_exists_to_declare_about(a_student):
    assert isinstance(a_student, uuid.UUID)


def test_the_default_full_template_is_reachable(a_full_template):
    """D11's bundled set. The lane builds the editor on top of it and the declaration flow
    against it; both need the row revision 0007 seeded."""
    assert isinstance(a_full_template, uuid.UUID)


def test_the_trial_template_is_still_there_and_is_not_this_lanes(a_trial_template):
    """Conflict C3 -- M1 seeded it so M3's trial bookings had something to write against.
    This lane owns the `full` one and must not touch the trial one."""
    assert isinstance(a_trial_template, uuid.UUID)


def test_both_roles_allowed_to_read_a_full_declaration_can_sign_in(as_owner, as_manager):
    """§3.2 gives 'Read full health declaration' to manager and owner and to nobody else,
    so the lane needs both to assert the boundary from the allowed side."""
    assert as_owner.token != as_manager.token


def test_both_coach_levels_can_sign_in(as_lead_coach, as_assistant_coach):
    """The refused side of the same boundary. A coach sees `derived_flags` and nothing
    else (§5.5), and that has to be asserted for both coach roles rather than one."""
    assert as_lead_coach.token != as_assistant_coach.token


def test_a_guardian_of_a_real_child_can_sign_in(as_guardian_of, a_student):
    """§5.5's gate is a hard block in the PARENT app, so the lane needs a parent bound to
    an actual child rather than to a placeholder id the gate could never resolve."""
    caller = as_guardian_of(a_student)
    assert caller.token


def test_the_keyring_is_configured_for_the_encrypted_columns():
    """`answers_encrypted` and `signature_image_encrypted` are EncryptedJSON/EncryptedBytes
    (§11.1), and `Keyring.from_settings()` refuses outright when ENCRYPTION_KEYS is empty --
    which it is locally and on CI. The autouse fixture is what makes the lane's first write
    succeed instead of failing for a reason with nothing to do with the code under test."""
    from app.core.encryption import Keyring

    assert Keyring.from_settings() is not None


def test_audit_entries_can_be_read_back(audit_entries):
    """§11.2 -- every read of a full declaration is audit-logged. The lane asserts that on
    every manager read path, so the reader is a fixture rather than eight copies: eight
    copies is eight chances for one of them to query the wrong entity_type and pass by
    looking empty."""
    assert audit_entries("health_declaration", uuid.uuid4()) == []


def test_the_tenant_scoped_session_is_the_one_services_are_written_against(tenant_session):
    """Arrange with app_session, act and assert through this."""
    assert tenant_session.is_active
