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
"""

from __future__ import annotations

import uuid
from typing import Any

from app.models.comms import Notification


class NotificationService:
    """§5.11's fan-out. Lane COMMS (M8) fills these in."""

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
        mutable per user"), which is settings-shaped rather than referential.

        `payload` is what the tap opens: a session id, a charge id, an event id. It is
        never logged — §18.3 puts notification payloads in the "never" column.
        """
        raise NotImplementedError("M8 — lane COMMS owns app/services/comms/**")
