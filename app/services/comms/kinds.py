"""Which switch governs which notification, and the two that no switch governs.

§5.11's trigger table has fifteen rows; the settings screen offers eight switches. Something
has to map one onto the other, and this is it.

**The map is on the kind's PREFIX**, everything before the first dot -- because that is the
convention the three callers who already exist chose, before this file did:
`billing.overdue.day3` (app/workers/billing.py), `health.declaration_missing`
(app/workers/health_reminders.py), `trial.reminder` (app/workers/followups.py). Reading the
prefix rather than keeping a fifteen-row table means lane REPORTS adding `attendance.at_risk`
needs no edit here, which is what "M9's jobs are pure callers" is supposed to buy.

**An unmapped prefix is UNGOVERNED, not muted.** §5.11 makes types "individually mutable per
user", and mutable means a switch exists. §5.4a's trial ladder reaches a lead's guardian --
someone who is not a member, has never signed in, and has no settings screen on which to have
muted anything. Defaulting the unknown to "off" would silently drop the follow-up sequence a
whole milestone was spent on. Ungoverned and transactional are different facts that happen to
share an outcome today, and they are kept apart so that adding a `trial` switch later mutes
the trial ladder without accidentally muting a payment failure.
"""

from __future__ import annotations

#: Kind prefix -> §5.11 preference group. See the module docstring for why it is the prefix.
_GROUP_BY_PREFIX: dict[str, str] = {
    "session": "session_cancelled",
    "coach": "coach_substituted",
    "announcement": "announcement",
    "event": "event",
    "billing": "payment",
    "belt": "belt",
    "attendance": "attendance",
    "health": "health",
}

#: Groups §5.11 refuses to make switchable at all. "except health-declaration ... notices,
#: which are transactional" -- a missing declaration is a child stepping onto a mat
#: uncovered, and §5.5's whole argument is that the app cannot stop that happening and so its
#: only job is to make the gap impossible to miss.
ALWAYS_ON_GROUPS = frozenset({"health"})

#: And the single KIND inside a mutable group that is still transactional. §5.11's exemption
#: is "payment-FAILURE notices", not payments: a parent may switch off the day 3/7/14 debt
#: ladder and still be told when a standing order bounced. Two granularities because §5.11
#: uses two.
ALWAYS_ON_KINDS = frozenset({"billing.payment_failed"})

#: What §5.11's fan-out stamps on every announcement recipient. A constant because the
#: delivery report finds its own notifications by it -- see
#: `app/services/comms/notifications.py::DeliveryReporter`.
ANNOUNCEMENT = "announcement.published"

#: §5.14's at-risk alert -- "three or more consecutive EXPECTED sessions missed. This fires a
#: notification to the group's coaches and to managers with a one-tap צור קשר עם ההורה — it is
#: not left sitting in a report nobody opens."
#:
#: **Raised by lane REPORTS (M9), rendered by lane COMMS (M8).** Plan W5 makes M9 a pure
#: caller of `NotificationService.enqueue`, and W5's contract commit gives the `alert-centre`
#: at-risk cards to M8 -- so the kind and its payload are named here, where the card and the
#: one-tap action live, rather than in the job that detects the absences. The payload
#: contract, which M9 fills and this lane reads:
#:
#:     {
#:       "student_id":        str(uuid),  # who
#:       "group_id":          str(uuid),  # which group's coaches were told
#:       "contact_person_id": str(uuid),  # the guardian to call
#:       "contact_phone":     str | None, # what the one-tap button dials
#:       "missed_count":      int,        # 3 or more (§5.14)
#:     }
#:
#: `contact_phone` is the field that makes this an alert rather than a report row. Without
#: it the card can say a child is at risk and offer nothing to do about it, which is exactly
#: the failure §5.14 wrote that sentence against. It is nullable because a family record may
#: genuinely carry no number, and the card says so (`atRisk.noPhone`) rather than rendering a
#: dead `tel:` link.
AT_RISK = "attendance.at_risk"


def group_for(kind: str) -> str | None:
    """The preference group governing `kind`, or None if nothing governs it.

    Split on the FIRST dot: `billing.overdue.day3` is three segments and the escalation day
    is data, not a category. Splitting on the last would produce a group called `day3`.
    """
    return _GROUP_BY_PREFIX.get(kind.split(".", 1)[0])


def is_transactional(kind: str) -> bool:
    """True when §5.11 sends this whatever the person's preferences say.

    Checked at both granularities because §5.11 uses both: a whole group (`health`) and a
    single kind inside an otherwise mutable one (`billing.payment_failed`).
    """
    return kind in ALWAYS_ON_KINDS or group_for(kind) in ALWAYS_ON_GROUPS
