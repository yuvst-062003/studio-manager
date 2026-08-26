"""Domain errors the routers translate into HTTP.

Raised by services and caught by routers, rather than services raising `HTTPException`
directly: `.claude/rules/api.md` keeps authorization and transport in the router, and a
service that raised a 404 would be a service that only makes sense inside a request.
"""

from __future__ import annotations


class EventNotFoundError(LookupError):
    """No such event in the active studio."""


class EventNotEditableError(RuntimeError):
    """The event is not in a state this transition applies to.

    §5.8 notifies on publish and on cancel, so a PATCH that could move a published event's
    date as a side effect of an unrelated edit is not an edit -- it is a surprise.
    """


class EventNotPublishedError(RuntimeError):
    """The action needs a published event: nothing reaches a guardian while it is a draft."""


class RsvpDeadlinePassedError(RuntimeError):
    """§5.8's `rsvp_deadline`. `events.rsvp.deadlinePassed` is the string for it."""


class NotThisGuardiansStudentError(PermissionError):
    """§3.2's guardian column -- "own" always means only for my own children."""


class NotRegisteredForEventError(LookupError):
    """The student is not on this event's roster, so there is nothing to answer."""


class ConsentNotRequiredError(RuntimeError):
    """Signing a consent an event does not ask for would write a ledger row about nothing."""


class NotABeltExamError(RuntimeError):
    """§5.9 -- a result belongs to an event with `type='belt_exam'`."""


class AlreadyExaminedError(RuntimeError):
    """`uq_event_exam_result` is UNIQUE on (event_id, student_id).

    A correction is an edit of the existing row, not a second one -- a second row would
    award a second belt.
    """
