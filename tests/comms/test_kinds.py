"""Which switch governs which notification, and the two that no switch governs.

§5.11's trigger table has fifteen rows and the settings screen offers eight switches, so
something has to map one onto the other. The mapping is the KIND PREFIX -- everything before
the first dot -- because that is the convention the three callers who already exist chose:
`billing.overdue.day3`, `health.declaration_missing`, `trial.reminder`. Reading the prefix
rather than keeping a fifteen-row table means M9 adding `attendance.at_risk` needs no edit
here, which is the whole point of a lane owning its own kinds.

**A prefix with no group is ungoverned, not muted.** §5.11 makes types "individually mutable
per user", and mutable means there is a switch. `trial.*` reaches a lead's guardian, who is
not a member yet and has no settings screen to have muted anything on. Defaulting an unknown
prefix to "off" would silently drop the follow-up ladder §5.4a spent a milestone on.
"""

from __future__ import annotations

import pytest
from app.models.comms import PREFERENCE_GROUPS
from app.services.comms.kinds import (
    ALWAYS_ON_GROUPS,
    ALWAYS_ON_KINDS,
    ANNOUNCEMENT,
    AT_RISK,
    HEALTH_REVIEW_PENDING,
    HEALTH_TRIAL_FLAGGED,
    group_for,
    is_transactional,
)
from app.services.comms.preferences import NotificationPreferenceService


@pytest.mark.parametrize(
    ("kind", "group"),
    [
        ("session.cancelled", "session_cancelled"),
        ("session.moved", "session_cancelled"),
        ("coach.substituted", "coach_substituted"),
        ("announcement.published", "announcement"),
        ("event.published", "event"),
        ("event.rsvp_deadline", "event"),
        ("billing.overdue.day3", "payment"),
        ("billing.payment_received", "payment"),
        ("belt.awarded", "belt"),
        ("attendance.at_risk", "attendance"),
        ("health.declaration_missing", "health"),
        ("health.declaration_renewal", "health"),
        ("health.review_pending", "health"),
    ],
)
def test_the_prefix_selects_the_preference_group(kind: str, group: str) -> None:
    assert group_for(kind) == group


def test_a_deeper_kind_still_resolves_on_its_first_segment() -> None:
    """`billing.overdue.day3` is the shape app/workers/billing.py already emits -- three
    segments, and the escalation day is data rather than a category. Splitting on the LAST
    dot would give a group called `day3`."""
    assert group_for("billing.overdue.day14") == "payment"


def test_a_kind_with_no_group_is_ungoverned_rather_than_muted() -> None:
    """`trial.*` reaches a lead's guardian. They are not a member, they have no settings
    screen, and §5.4a's day 1/3/7 ladder is the milestone that converts them. Treating an
    unmapped prefix as "off" would drop it silently."""
    assert group_for("trial.reminder") is None
    assert group_for("trial.followup") is None
    assert group_for("something.nobody.has.written.yet") is None


def test_every_group_the_mapping_produces_is_one_the_screen_can_render() -> None:
    """A group here that is missing from PREFERENCE_GROUPS is a notification nobody can
    switch off through a screen that claims to offer every switch."""
    produced = {
        group_for(kind)
        for kind in (
            "session.cancelled",
            "coach.substituted",
            "announcement.published",
            "event.published",
            "billing.overdue.day3",
            "belt.awarded",
            "attendance.at_risk",
            "health.declaration_missing",
        )
    }
    assert produced == set(PREFERENCE_GROUPS)


def test_the_two_transactional_notices_cannot_be_muted() -> None:
    """§5.11 -- "except health-declaration and payment-failure notices, which are
    transactional." A missing declaration is a child stepping onto a mat uncovered; a failed
    payment is money the club did not receive and does not know it did not receive."""
    assert is_transactional("health.declaration_missing")
    assert is_transactional("health.declaration_renewal")
    assert is_transactional("billing.payment_failed")


def test_the_review_hold_kind_is_stable_and_transactional() -> None:
    """Task 4c -- a manager must not be able to mute a notice that a child is blocked
    from training. `HEALTH_REVIEW_PENDING` inherits `health`'s always-on rule from its
    PREFIX alone; nothing in `ALWAYS_ON_KINDS` names it individually, which is the whole
    point of putting it under a prefix `_GROUP_BY_PREFIX` already maps."""
    assert HEALTH_REVIEW_PENDING == "health.review_pending"
    assert group_for(HEALTH_REVIEW_PENDING) == "health"
    assert group_for(HEALTH_REVIEW_PENDING) in ALWAYS_ON_GROUPS
    assert is_transactional(HEALTH_REVIEW_PENDING)
    assert HEALTH_REVIEW_PENDING not in ALWAYS_ON_KINDS


def test_the_trial_flagged_kind_is_stable_and_transactional() -> None:
    """Task 9 §4 -- its own kind rather than a second use of `HEALTH_REVIEW_PENDING`,
    because a trial never gets the `pending` enrollment that one's payload names. Same
    always-on guarantee though: a family who answered honestly deserves a manager to
    actually see it, regardless of that manager's notification settings."""
    assert HEALTH_TRIAL_FLAGGED == "health.trial_flagged"
    assert group_for(HEALTH_TRIAL_FLAGGED) == "health"
    assert group_for(HEALTH_TRIAL_FLAGGED) in ALWAYS_ON_GROUPS
    assert is_transactional(HEALTH_TRIAL_FLAGGED)
    assert HEALTH_TRIAL_FLAGGED not in ALWAYS_ON_KINDS


def test_a_manager_who_muted_everything_mutable_still_gets_the_review_hold_notice(
    tenant_session, as_manager
) -> None:
    """The behaviour `is_transactional` promises, exercised through the real preference
    check rather than re-derived: mute every group a switch actually governs, and
    `allows` must still say yes for the review hold -- asserted through kinds.py's own
    mapping (`ALWAYS_ON_GROUPS`), not by re-implementing which groups are mutable here."""
    service = NotificationPreferenceService(tenant_session)
    for group in PREFERENCE_GROUPS:
        if group in ALWAYS_ON_GROUPS:
            continue
        service.set(as_manager.person_id, group, enabled=False)

    assert service.allows(as_manager.person_id, HEALTH_REVIEW_PENDING)


def test_the_rest_of_the_payment_group_remains_mutable() -> None:
    """The exemption is one KIND inside a mutable group, not the group. A parent who turns
    off payment reminders keeps getting told when a payment fails, and stops being nagged
    about a charge they already know about."""
    assert not is_transactional("billing.overdue.day3")
    assert not is_transactional("billing.payment_received")
    assert not is_transactional("belt.awarded")


def test_an_ungoverned_kind_is_not_transactional_either() -> None:
    """Ungoverned and transactional are different facts that happen to have the same effect
    today. `trial.reminder` always delivers because nothing governs it; `billing.payment_failed`
    always delivers because §5.11 says so. Conflating them would make the follow-up ladder
    un-mutable the day somebody adds a `trial` switch."""
    assert not is_transactional("trial.reminder")


def test_the_always_on_sets_name_a_group_and_a_kind_and_do_not_overlap() -> None:
    """Two different granularities, deliberately. `health` is a whole group §5.11 refuses to
    make switchable; `billing.payment_failed` is a single kind inside a group that is."""
    assert frozenset({"health"}) == ALWAYS_ON_GROUPS
    assert frozenset({"billing.payment_failed"}) == ALWAYS_ON_KINDS
    assert all(group_for(kind) not in ALWAYS_ON_GROUPS for kind in ALWAYS_ON_KINDS)


def test_the_two_kinds_this_lane_names_for_other_people_are_stable() -> None:
    """`AT_RISK` is written here and raised by lane REPORTS (plan W5: "M9's jobs are pure
    callers"), and the dashboard card that renders it is this lane's. `ANNOUNCEMENT` is what
    §5.11's fan-out stamps so the delivery report can find its own notifications again.
    Both are constants rather than literals because two lanes read them."""
    assert AT_RISK == "attendance.at_risk"
    assert ANNOUNCEMENT == "announcement.published"
