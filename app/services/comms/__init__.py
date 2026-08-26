"""W5's cross-lane seam: `NotificationService.enqueue`.

Plan W5: "M9's jobs are pure callers." The REPORTS lane raises at-risk alerts (§5.14 —
three or more consecutive absences) and retention notices without opening a single file the
COMMS lane owns, and the COMMS lane changes how a message is fanned out to push and inbox
without M9 knowing that happened.

**Why one entry point rather than "insert a notification row".** §5.11's rule is that every
message goes to *both* levels — push is the doorbell, the inbox is where the message lives,
and they are not alternatives. A caller that wrote the `notification` row itself would
produce an inbox entry with no push and no `notification_delivery` rows, which means no
delivery report, which means the silent-failure gap §5.11 exists to close reopens for
exactly the alerts M9 raises. The fan-out belongs behind the seam.

**Filled in by lane COMMS (M8).** The body lives in `app/services/comms/notifications.py`
so this file stays what the contract commit made it: a signature, and the argument for it.
The signature itself has not moved a character — `tests/contracts/test_seams.py` asserts it
down to the annotations, and three workers were already calling it while it still raised.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from app.core.tenancy import TenantSession
from app.services.comms.notifications import NotificationFanOut

# W5's contract commit promoted the model out of `app/models/_pending/`, so this now names a
# real, migrated table. The TYPE_CHECKING guard stays: it costs the signature nothing --
# `from __future__ import annotations` makes every annotation a string, so mypy and the IDE
# resolve `Notification` while the interpreter never does -- and it keeps this service from
# importing the model layer at runtime for a return type it does not construct.
if TYPE_CHECKING:
    from app.models.comms import Notification


class NotificationService:
    """§5.11's fan-out.

    **Constructible with no arguments, and that is load-bearing.**
    `app/workers/billing.py`, `app/workers/followups.py` and
    `app/workers/health_reminders.py` all write `NotificationService().enqueue(...)` inside a
    `use_studio` scope, and `enqueue`'s signature is frozen by the contract test — there is
    nowhere to pass a session through it. With no session, one is opened here and committed
    here; with a session, the caller keeps its own transaction boundary, which is what lets
    an announcement write `published_at` and twenty-four notifications as one unit of work.
    """

    def __init__(self, session: TenantSession | None = None) -> None:
        self._fan_out = NotificationFanOut(session)

    def enqueue(
        self,
        person_id: uuid.UUID,
        kind: str,
        title: str,
        body: str,
        payload: dict[str, Any],
    ) -> Notification:
        """Queue one notification for one person, on every channel §5.11 requires.

        Returns the `Notification` rather than nothing, so a caller can ask for the
        delivery report on what it just sent. §5.11's report is per-send, and a caller
        forced to re-find its own row by (person, kind, time) would be guessing.

        `kind` is a plain string and not an enum on purpose: §5.11's trigger list grows
        every milestone — M5 adds at-risk, M6 adds five payment kinds, M7 adds belts — and
        a closed union here would make each of those a change to a file this lane owns.
        Notification preferences are keyed off it ("every notification type is individually
        mutable per user"), which is settings-shaped rather than referential. The mapping
        from a kind to the switch that governs it is `app/services/comms/kinds.py`.

        `payload` is what the tap opens: a session id, a charge id, an event id. It is
        never logged — §18.3 puts notification payloads in the "never" column.

        **Lane REPORTS (M9), the payload contract for the one kind you raise:**
        `attendance.at_risk` carries `student_id`, `group_id`, `contact_person_id`,
        `contact_phone` and `missed_count`. §5.14 requires the alert to carry a one-tap
        `צור קשר עם ההורה`, and `contact_phone` is what that button dials — without it the
        dashboard card degrades into the report row §5.14 says it must not be. Written out
        in `app/services/comms/kinds.py::AT_RISK` so it is readable without asking.
        """
        return self._fan_out.enqueue(person_id, kind, title, body, payload)
