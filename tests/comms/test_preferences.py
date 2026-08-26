"""§5.11 — "Every notification type is individually mutable per user, except
health-declaration and payment-failure notices, which are transactional."

Two sentences, and the second is the one a schema forgets. A settings screen that offers
eight switches and honours seven is worse than one that offers seven, because the parent who
turned off health reminders believes they did.

**§4.3 has no table for this and W5's contract commit landed none.** Revision 0010 adds it,
authored inside the lane by agreement rather than in the wave's contract commit — recorded in
docs/superpowers/plans/2026-08-26-m8-comms.md § Approved exceptions.
"""

from __future__ import annotations

import pytest
from app.core.tenancy import CrossTenantWriteError
from app.models.comms import PREFERENCE_GROUPS, NotificationPreference
from sqlalchemy.exc import IntegrityError


def test_the_eight_groups_are_the_eight_the_settings_screen_renders() -> None:
    """`web/packages/i18n/he/comms.ts` carries exactly these under `preferences.kind.*`. A
    group in one list and not the other is either a switch with no label or a label with no
    switch, and both ship silently."""
    assert PREFERENCE_GROUPS == (
        "session_cancelled",
        "coach_substituted",
        "announcement",
        "event",
        "payment",
        "belt",
        "attendance",
        "health",
    )


def test_a_preference_is_one_row_per_person_per_group(tenant_session, as_manager) -> None:
    """One switch per group, not one per kind.

    §5.11's trigger table has fifteen rows and grows every milestone; the screen offers
    eight. A row per kind would make "turn off payment reminders" a five-row write that can
    half-succeed, and a parent would then be muted for the day-3 reminder and not the day-7.
    """
    tenant_session.add(
        NotificationPreference(person_id=as_manager.person_id, kind_group="belt", enabled=False)
    )
    tenant_session.commit()

    tenant_session.add(
        NotificationPreference(person_id=as_manager.person_id, kind_group="belt", enabled=True)
    )
    with pytest.raises(IntegrityError):
        tenant_session.commit()
    tenant_session.rollback()


def test_two_people_may_hold_opposite_answers_for_one_group(
    tenant_session, as_manager, as_lead_coach
) -> None:
    """The uniqueness is per PERSON per group. A constraint on `kind_group` alone would let
    the first coach to open the screen decide for the whole studio."""
    tenant_session.add_all(
        [
            NotificationPreference(
                person_id=as_manager.person_id, kind_group="belt", enabled=False
            ),
            NotificationPreference(
                person_id=as_lead_coach.person_id, kind_group="belt", enabled=True
            ),
        ]
    )
    tenant_session.commit()


def test_a_group_the_screen_does_not_offer_is_refused_by_the_database(
    tenant_session, as_manager
) -> None:
    """The CHECK is the backstop under the service's own validation. A typo'd group would
    otherwise be a row that mutes nothing and reads, in the database, exactly like a row that
    mutes something."""
    tenant_session.add(
        NotificationPreference(person_id=as_manager.person_id, kind_group="belts", enabled=False)
    )
    with pytest.raises(IntegrityError):
        tenant_session.commit()
    tenant_session.rollback()


def test_absence_is_the_default_and_no_row_is_written_at_sign_up(
    tenant_session, as_manager
) -> None:
    """A new guardian receives everything without eight inserts, and a group added in a later
    milestone defaults to on for people who never saw it. This asserts the *absence*, which
    is the part a later refactor would helpfully break by seeding defaults."""
    rows = (
        tenant_session.query(NotificationPreference)
        .filter(NotificationPreference.person_id == as_manager.person_id)
        .all()
    )
    assert rows == []


def test_a_preference_belongs_to_a_studio(tenant_session, as_manager) -> None:
    """G9. `TenantSession` stamps `studio_id` on the way in, and refuses a write aimed
    anywhere else — a person is tenant-scoped, so their switches are too."""
    row = NotificationPreference(person_id=as_manager.person_id, kind_group="belt", enabled=False)
    tenant_session.add(row)
    tenant_session.commit()
    assert row.studio_id == as_manager.studio_id

    import uuid as _uuid

    row.studio_id = _uuid.uuid4()
    with pytest.raises(CrossTenantWriteError):
        tenant_session.commit()
    tenant_session.rollback()
