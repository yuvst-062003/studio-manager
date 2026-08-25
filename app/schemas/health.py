"""Request and response shapes for /health-templates and /students/{id}/health-declaration.

**G7 is the whole design of this module.** Two shapes exist where one would be simpler,
and the split is the privacy boundary:

- `HealthDeclarationOut` carries `derived_flags` and no answers. It is what a coach and a
  parent-app roster may receive.
- `HealthDeclarationFullOut` carries the answers. Manager and owner only, and **every read
  is audit-logged** (§4.3, §11.2).

A single shape with an optional `answers` field would put the decision at the call site,
where it is one forgotten `exclude=` away from leaking a child's medical record onto a
roster. Two types put it in the type system.

**`derived_flags` holds booleans only** (§4.3). The validator below rejects anything else
rather than coercing it, because a free-text "flag" is a medical description on a coach's
screen — precisely what the flag mechanism replaced.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas._pagination import CursorPage

#: §4.3 — `health_form_template  kind(full|trial)`.
HEALTH_TEMPLATE_KIND_PATTERN = r"^(full|trial)$"

#: §4.3 — `student.health_status`. Declared as a `Literal` rather than a pattern because
#: it is **the W3 seam** (`BootstrapPayload.roster[].health_status`): M5 branches on these
#: three values to pick a badge, and a union type in the generated client makes a typo a
#: compile error in the lane rather than a blank badge in production.
HealthStatus = Literal["missing", "trial_signed", "signed"]

#: §5.5 — what a coach sees. Booleans, never free text. The keys are the studio's own,
#: derived from its template, so the type is a mapping rather than a fixed model.
DerivedFlags = dict[str, bool]


def _flags_are_booleans(value: Any) -> Any:
    """§4.3 — 'derived_flags holds **booleans only** … never free text.'

    **This runs in `mode="before"`, and that is the whole point.** Pydantic's lax mode
    coerces on the way in, so an `after` validator never sees what the caller actually
    sent — by the time it runs, `{"asthma": "no"}` is already `{"asthma": False}` and
    `{"asthma": 1}` is already `{"asthma": True}`. Both would have passed a check that
    only asks "is this a bool now?".

    Both coercions are dangerous in opposite directions. `"no"` silently becoming `False`
    hides a real condition. `1` silently becoming `True` raises a ⚠ nobody's declaration
    asked for — a false alarm that teaches coaches to ignore the badge, which is worse
    than showing no badge at all. §5.5's warning is only useful while it is trusted.

    So the raw value is inspected and rejected rather than converted. A caller sending a
    string has a bug in their derivation, and the loud failure is the cheap way to find it.
    """
    if not isinstance(value, dict):
        return value
    for key, flag in value.items():
        if not isinstance(flag, bool):
            raise ValueError(
                f"derived_flags[{key!r}] is {type(flag).__name__}, not a bool: §4.3 allows "
                "booleans only, never free text"
            )
    return value


class HealthFormTemplateOut(BaseModel):
    """The questions, never the answers. Nothing in this shape is personal data."""

    id: uuid.UUID
    kind: str = Field(pattern=HEALTH_TEMPLATE_KIND_PATTERN)
    version: int
    #: Sections, questions and types (§5.5). D11: the bundled set is a **starting point**
    #: a manager may edit, and the app must say so where they edit it.
    schema_: dict[str, Any] = Field(alias="schema")
    source_pdf_object_key: str | None = None
    published_at: datetime | None = None


class HealthDeclarationIn(BaseModel):
    """What a parent submits (parent `12c` הצהרת בריאות — מילוי וחתימה).

    The answers arrive in the clear over TLS and are encrypted before they hit the
    database (§11.1). They are never logged on the way through (G7) — the M0 scrubber
    covers serialization, and a reviewer checks the call sites.
    """

    template_id: uuid.UUID
    answers: dict[str, Any]
    #: A finger-drawn signature, base64 PNG. Optional in the shape so a validation error
    #: on the answers does not discard a signature the parent already drew.
    signature_image_base64: str | None = None


class HealthDeclarationOut(BaseModel):
    """**The coach-safe projection.** Flags, no answers. See the module docstring."""

    id: uuid.UUID
    student_id: uuid.UUID
    template_version: int
    #: §5.5 — booleans only. This is what a coach sees.
    derived_flags: DerivedFlags = Field(default_factory=dict)
    signed_at: datetime
    #: §5.5 — NULL by default; declarations do not expire.
    valid_until: date | None = None
    has_signature: bool = False
    pdf_object_key: str | None = None

    _validate_flags = field_validator("derived_flags", mode="before")(_flags_are_booleans)


class HealthDeclarationFullOut(HealthDeclarationOut):
    """**Manager and owner only, and every read is audit-logged** (§4.3, §11.2).

    Separate from `HealthDeclarationOut` by inheritance so it cannot drift: adding a field
    to the coach-safe shape adds it here too, and adding one here never leaks downward.
    """

    answers: dict[str, Any]
    signed_by_person_id: uuid.UUID
    signed_ip: str | None = None
    signed_user_agent: str | None = None


class HealthStatusSummaryOut(BaseModel):
    """Dashboard `4e` מסמכים והצהרות — 'what is missing, from whom'.

    Counts and names, no contents. A manager chasing missing declarations needs to know
    *who*, and nothing about what any of the completed ones say.
    """

    student_id: uuid.UUID
    student_display_name: str
    health_status: HealthStatus
    #: §5.5's one-tap `שלח תזכורת להורה`, so the row can render the button in the right
    #: state without a second request.
    last_reminder_sent_at: datetime | None = None


class ConsentRecordOut(BaseModel):
    id: uuid.UUID
    subject_type: Literal["person", "student"]
    subject_id: uuid.UUID
    consent_type: Literal["terms", "privacy", "photo_video", "medical_share", "event"]
    version: int
    granted: bool
    granted_at: datetime
    revoked_at: datetime | None = None


HealthStatusSummaryPage = CursorPage[HealthStatusSummaryOut]
ConsentRecordPage = CursorPage[ConsentRecordOut]
