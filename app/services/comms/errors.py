"""What this lane refuses, and why each refusal is a distinct type.

Routers translate these to status codes (G6 keeps the mapping there, not here). They are
separate classes rather than one `CommsError` with a code because the router's `except`
clauses are the readable list of what can go wrong, and a single type collapses that into a
chain of string comparisons.
"""

from __future__ import annotations


class CommsError(Exception):
    """Base for everything this lane refuses."""


class TransactionalKindError(CommsError):
    """§5.11 -- "except health-declaration and payment-failure notices, which are
    transactional."

    Raised when somebody tries to switch off a group §5.11 does not allow to be switched
    off. The settings screen renders `preferences.alwaysOn` instead of a switch, and this is
    what makes that a rule rather than a rendering choice: a screen is not an enforcement
    point, and the rule here is about a child's medical cover and about money the club did
    not receive.
    """


class UnknownPreferenceGroupError(CommsError):
    """A `kind_group` outside PREFERENCE_GROUPS.

    The database's CHECK would also catch it, but an IntegrityError reaches a caller as a
    500. The group name arrives over the wire from the settings screen, so a typo is a client
    bug and deserves a 422 that says which field.
    """


class NotYourAnnouncementError(CommsError):
    """§3.2 -- a lead coach publishes to their own groups and nowhere else.

    The ROLE check is a router dependency (`.claude/rules/api.md`: authorization is checked
    in the router, never inside a service). This is the different question the service does
    have to answer: which groups are *this* coach's.
    """


class AnnouncementAlreadyPublishedError(CommsError):
    """`published_at` is not null.

    §5.11's fan-out reaches every family in the audience, so publishing twice buzzes 24
    households twice. `[ שליחה ]` is a button on a phone and a double tap is the ordinary
    accident, which is why this is refused rather than deduplicated after the fact.
    """


class AnnouncementNotFoundError(CommsError):
    """Missing, soft-deleted, or another studio's -- the caller cannot tell which, and that
    is deliberate."""


class AudienceOutOfScopeError(CommsError):
    """`scope_id` names nothing, or names a row of the wrong kind.

    `announcement_scope_id_present` is a CHECK, so the database would refuse a studio-wide
    announcement that named a group. It would not refuse a group-scoped one naming a class
    id, which is an audience that resolves to nobody -- a send that reports success and
    reaches no one.
    """


class FeedNotFoundError(CommsError):
    """An unknown or rotated calendar token.

    §5.12's URL is unauthenticated, so this is the answer to a guess. It carries nothing:
    no "this studio has no such feed", no distinction between never-existed and rotated,
    because either would confirm something to whoever is guessing.
    """
