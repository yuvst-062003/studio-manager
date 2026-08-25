"""Request and response shapes for §11.3's subject-access export.

M9 owns the reports themselves — financial, attendance, funnel, overview, each with CSV and
XLSX export (§5.14). Those are read models over tables this wave does not touch, so the
contract commit carries only the one shape that has a table behind it: the export *request*.

**Privacy strings live in the `reports` namespace under `privacy.*`**, for the same reason
this module holds the export request: `web/packages/i18n/types.ts` lists exactly nine
namespaces and `index.ts` is authored once, so there is no `privacy.ts` to add.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas._pagination import CursorPage

#: §4.3's `status`, enumerated in `app/models/reports.py` with the reason each state
#: exists. `expired` is the one a smaller enum would have dropped, and §11.3's
#: "time-limited download link" is what requires it.
ExportStatus = Literal["pending", "running", "completed", "failed", "expired"]


class DataExportRequestIn(BaseModel):
    """§11.3: a guardian asks for everything held about one of their students; a manager
    may ask for any student. Who is allowed to name whom is the route's permission check,
    not this shape's job."""

    subject_person_id: uuid.UUID


class DataExportRequestOut(BaseModel):
    """The request's state, and a link only while there is one.

    **`object_key` is deliberately absent.** It is an internal pointer into object storage
    (§8.1), and handing it to a caller turns a bundle containing a child's complete record —
    health declarations included — into a direct object reference. §11.3 promises a
    *time-limited* link, which a raw storage key is not: `download_url` is issued per
    request, expires, and can be refused after `expired` without the object having to move.
    """

    id: uuid.UUID
    subject_person_id: uuid.UUID
    requested_by_person_id: uuid.UUID
    status: ExportStatus
    #: Present only while `status == 'completed'`. Null before, and null again after the
    #: link's time limit passes.
    download_url: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    #: Why it failed, for whoever answers the guardian. Never the contents of the bundle.
    error: str | None = None


DataExportRequestPage = CursorPage[DataExportRequestOut]
