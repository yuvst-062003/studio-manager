"""Register §2.3 — the at-risk threshold, the one studio setting this lane owns.

`app/workers/at_risk.py` reads it and `app/routers/attendance.py`'s `/attendance/settings`
writes it. Both go through here rather than through `PATCH /studio`
(`app/services/structure/logo.py::SETTINGS_FIELDS`) on purpose: that whitelist and the
`הגדרות` panel that reads it belong to a different vertical, and a shared JSONB blob is
exactly the case where two lanes editing the same list is how one silently drops the
other's key. `Studio.settings` is still the same JSONB column everything else already
merges into — `app/workers/health_reminders.py::VALIDITY_SETTING` is the existing
precedent for a lane reading its own key out of it with no entry in that whitelist at all.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.tenancy import require_current_studio_id
from app.models.studio import Studio
from app.services.attendance.errors import NotFoundError

#: SPEC §5.14, verbatim: "three or more consecutive expected sessions missed."
DEFAULT_AT_RISK_THRESHOLD = 3
AT_RISK_THRESHOLD_SETTING = "attendance_at_risk_threshold"


def _current_studio(session: Session) -> Studio:
    row = session.get(Studio, require_current_studio_id())
    if row is None:
        raise NotFoundError("studio")
    return row


def get_at_risk_threshold(session: Session, studio: Studio | None = None) -> int:
    """The configured threshold, or SPEC's own default when the studio never set one.

    Takes an optional `studio` so `app/workers/at_risk.py` — which already holds the row
    for every other per-studio decision in its loop — is not made to look it up twice.
    """
    blob = (studio or _current_studio(session)).settings or {}
    value = blob.get(AT_RISK_THRESHOLD_SETTING)
    return value if isinstance(value, int) and value > 0 else DEFAULT_AT_RISK_THRESHOLD


def set_at_risk_threshold(session: Session, *, threshold: int) -> int:
    studio = _current_studio(session)
    blob = dict(studio.settings or {})
    blob[AT_RISK_THRESHOLD_SETTING] = threshold
    studio.settings = blob
    session.commit()
    return threshold
