"""The fixtures W3's contract commit owes lane ATTENDANCE (plan §2.2 item 8).

Not a test of the lane's code -- none exists yet. This asserts the *fixtures resolve*, so
the lane's first red is its own logic rather than a conftest that never worked. Same shape
as tests/people/test_lane_gate.py, and the same reason: a contract commit that hands over
fixtures nobody ran hands over a guess.
"""

from __future__ import annotations

import uuid

import pytest


def test_a_session_exists_to_mark_attendance_against(a_session):
    assert isinstance(a_session, uuid.UUID)


def test_a_student_is_enrolled_in_the_group_that_session_belongs_to(an_enrolled_student):
    """§5.7's roster is enrollment-derived. A student with no enrollment is not on it, so a
    lane testing marks needs the row that puts them there."""
    assert isinstance(an_enrolled_student, uuid.UUID)


def test_every_role_the_matrix_scopes_this_lane_by_can_sign_in(
    as_manager, as_lead_coach, as_assistant_coach, as_guardian
):
    """§3.2's matrix is what every route in this lane is scoped by, so the lane needs a
    caller at each level before it writes its first route."""
    tokens = {c.token for c in (as_manager, as_lead_coach, as_assistant_coach, as_guardian)}
    assert len(tokens) == 4


def test_the_callers_carry_a_pinned_clock(as_manager):
    """§10.5 resolves conflicts on `device_marked_at`, so every test in this lane compares
    a device clock against a server clock. X-Dev-Now (§19) is the only way to make those
    the same value on both sides of the assertion."""
    assert "X-Dev-Now" in as_manager.headers


def test_a_coach_can_be_attached_to_the_group(assign_coach, as_lead_coach, a_group):
    """§3.2 -- 'View students in own groups'. A coach reaches a roster through group_staff,
    so a lane asserting a coach's own-groups scope needs to be able to create that row."""
    assign_coach(as_lead_coach.person_id, a_group)


def test_another_studios_session_is_reachable_as_a_negative(other_studio_session_id):
    """The tenant filter should make it invisible rather than merely forbidden -- 404,
    never 403 -- and a lane cannot assert that without a row in another studio."""
    assert isinstance(other_studio_session_id, uuid.UUID)


def test_the_tenant_scoped_session_is_the_one_services_are_written_against(tenant_session):
    """Arrange with app_session, act and assert through this. A list assertion made through
    the unscoped session sees every studio's rows, including those committed by the other
    lane sharing this database."""
    assert tenant_session.is_active


@pytest.mark.parametrize("status", ["unmarked", "present", "absent_excused", "absent_unexcused"])
def test_the_four_statuses_are_importable_from_the_model(status):
    """§5.14 -- `unmarked` is a real, storable state and a report must never treat it as
    absent. The lane branches on these four constantly; they come from one place."""
    from app.models.attendance import ATTENDANCE_STATUSES

    assert status in ATTENDANCE_STATUSES
