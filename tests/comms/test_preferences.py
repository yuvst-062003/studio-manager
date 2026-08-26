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
from app.services.comms.errors import TransactionalKindError, UnknownPreferenceGroupError
from app.services.comms.preferences import NotificationPreferenceService
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


# -- the service the screen and the fan-out both read -------------------------
def test_absence_of_a_row_means_the_notification_is_allowed(tenant_session, as_manager) -> None:
    """The default is on, and it is on because nothing was written rather than because
    something was. A service that required a row would send nothing to a guardian who has
    never opened the settings screen, which is every guardian on day one."""
    service = NotificationPreferenceService(tenant_session)
    assert service.allows(as_manager.person_id, "belt.awarded")


def test_a_disabled_group_mutes_every_kind_under_it(tenant_session, as_manager) -> None:
    """One switch, five kinds. §5.11's escalation ladder is `billing.overdue.day3`, `day7`
    and `day14`, and a parent who turned payment reminders off meant all of them."""
    service = NotificationPreferenceService(tenant_session)
    service.set(as_manager.person_id, "payment", enabled=False)
    assert not service.allows(as_manager.person_id, "billing.overdue.day3")
    assert not service.allows(as_manager.person_id, "billing.overdue.day14")
    assert not service.allows(as_manager.person_id, "billing.payment_received")


def test_one_persons_switch_does_not_mute_another(
    tenant_session, as_manager, as_lead_coach
) -> None:
    service = NotificationPreferenceService(tenant_session)
    service.set(as_manager.person_id, "belt", enabled=False)
    assert not service.allows(as_manager.person_id, "belt.awarded")
    assert service.allows(as_lead_coach.person_id, "belt.awarded")


def test_a_transactional_kind_is_allowed_even_with_its_group_off(
    tenant_session, as_manager
) -> None:
    """§5.11 names both facts in one sentence: the `payment` switch is real, and
    payment-failure notices are transactional. A parent who muted reminders still hears that
    their standing order bounced."""
    service = NotificationPreferenceService(tenant_session)
    service.set(as_manager.person_id, "payment", enabled=False)
    assert service.allows(as_manager.person_id, "billing.payment_failed")


def test_an_ungoverned_kind_is_allowed_whatever_is_stored(tenant_session, as_manager) -> None:
    """§5.4a's trial ladder has no switch, so nothing can have turned it off. This asserts
    the service does not fall through to some other group's answer."""
    service = NotificationPreferenceService(tenant_session)
    for group in PREFERENCE_GROUPS:
        if group != "health":
            service.set(as_manager.person_id, group, enabled=False)
    assert service.allows(as_manager.person_id, "trial.reminder")


def test_the_health_group_refuses_to_be_switched_off(tenant_session, as_manager) -> None:
    """§5.11. The screen renders `preferences.alwaysOn` instead of a switch, and the service
    refuses rather than trusting it to -- a screen is not an enforcement point, and this is
    a rule about a child's medical cover."""
    service = NotificationPreferenceService(tenant_session)
    with pytest.raises(TransactionalKindError):
        service.set(as_manager.person_id, "health", enabled=False)


def test_the_health_group_may_still_be_switched_on(tenant_session, as_manager) -> None:
    """Refusing `enabled=True` too would make the endpoint fail on a no-op, which is what a
    settings screen sends when somebody toggles twice."""
    NotificationPreferenceService(tenant_session).set(as_manager.person_id, "health", enabled=True)


def test_a_group_nobody_has_defined_is_refused_before_the_database_sees_it(
    tenant_session, as_manager
) -> None:
    """The CHECK would catch it, and an IntegrityError reaches a caller as a 500. §5.11's
    screen sends a group name over the wire, so a typo is a client bug that deserves a 422."""
    service = NotificationPreferenceService(tenant_session)
    with pytest.raises(UnknownPreferenceGroupError):
        service.set(as_manager.person_id, "belts", enabled=False)


def test_setting_the_same_group_twice_updates_rather_than_duplicating(
    tenant_session, as_manager
) -> None:
    """`uq_notification_preference_person_id_kind_group` would reject the second insert, so
    a service that always inserted would turn the second toggle into a 500."""
    service = NotificationPreferenceService(tenant_session)
    service.set(as_manager.person_id, "belt", enabled=False)
    service.set(as_manager.person_id, "belt", enabled=True)
    assert service.allows(as_manager.person_id, "belt.awarded")
    rows = (
        tenant_session.query(NotificationPreference)
        .filter(NotificationPreference.person_id == as_manager.person_id)
        .all()
    )
    assert len(rows) == 1


def test_the_screen_is_handed_all_eight_groups_in_order_whatever_is_stored(
    tenant_session, as_manager
) -> None:
    """A screen that rendered only stored rows would show a new guardian nothing at all, and
    would reorder itself as they toggled. The order is PREFERENCE_GROUPS', which is the
    order `preferences.kind.*` reads in Hebrew."""
    service = NotificationPreferenceService(tenant_session)
    service.set(as_manager.person_id, "belt", enabled=False)
    rows = service.list_for(as_manager.person_id)
    assert [row.kind_group for row in rows] == list(PREFERENCE_GROUPS)
    assert {row.kind_group: row.enabled for row in rows}["belt"] is False
    assert {row.kind_group: row.enabled for row in rows}["event"] is True


def test_the_screen_is_told_which_switch_it_must_not_render(tenant_session, as_manager) -> None:
    """§5.11's exemption reaches the UI as data, not as a hardcoded list in a component.
    `preferences.alwaysOn` -- התראה זו נשלחת תמיד -- is rendered where this flag is true."""
    rows = NotificationPreferenceService(tenant_session).list_for(as_manager.person_id)
    always_on = {row.kind_group: row.always_on for row in rows}
    assert always_on["health"] is True
    assert always_on["payment"] is False
