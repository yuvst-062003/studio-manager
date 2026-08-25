"""Conflict C3's resolution, in code.

§14 puts health declarations in M4. §5.4a's trial funnel puts a declaration at step 3 of
five, and M3 builds that funnel. §4.3 already types the column `kind(full|trial)`, so the
seam was already cut: M1 seeds the SHORT trial form, and M4 builds the full one and
everything around it -- the signature capture, the encryption, the PDF render, the
derived-flag pipeline.

**What M1 deliberately does not build:** `health_declaration`. Nothing here stores an
answer, so G7 has nothing to protect in this module -- which is the property that lets M1
touch health at all.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import HealthFormTemplate

#: §5.4a -- 'הצהרת בריאות מקוצרת'. Short on purpose: the declaration is step 3 of a
#: five-step funnel a parent walks on a phone, and a trial form as long as the full one is
#: exactly where that funnel leaks.
#:
#: The three flag questions are not optional. §5.5 gives coaches a ⚠ badge derived from
#: them and nothing else -- "Coaches see only derived_flags" -- and a child's first
#: session is the one where nobody in the room knows them.
TRIAL_TEMPLATE_SCHEMA: dict[str, Any] = {
    "version": 1,
    "kind": "trial",
    "title": "הצהרת בריאות לשיעור ניסיון",
    "sections": [
        {
            "id": "medical",
            "title": "מידע רפואי",
            "questions": [
                {"id": "asthma", "type": "boolean", "label": "האם יש אסתמה?", "flag": True},
                {"id": "allergy", "type": "boolean", "label": "האם יש אלרגיה?", "flag": True},
                {
                    "id": "allergy_details",
                    "type": "text",
                    "label": "פירוט האלרגיה",
                    "required": False,
                    "visible_if": {"allergy": True},
                },
                {
                    "id": "medication",
                    "type": "boolean",
                    "label": "האם התלמיד/ה נוטל/ת תרופות באופן קבוע?",
                    "flag": True,
                },
                {
                    "id": "restrictions",
                    "type": "text",
                    "label": "מגבלות פעילות גופנית",
                    "required": False,
                },
            ],
        },
        {
            "id": "consent",
            "title": "אישור",
            "questions": [
                {
                    "id": "fit_to_train",
                    "type": "boolean",
                    "label": "אני מאשר/ת שהתלמיד/ה כשיר/ה לפעילות גופנית",
                    "required": True,
                },
                {
                    "id": "emergency_contact",
                    "type": "phone",
                    "label": "טלפון לשעת חירום",
                    "required": True,
                },
            ],
        },
    ],
}

#: The questions whose answers become §5.5's `derived_flags`. Named here rather than
#: derived by scanning for `"flag": True`, so M4's pipeline has one list to read and a
#: question that quietly loses its flag is a visible diff rather than a silent one.
TRIAL_FLAG_QUESTIONS = ("asthma", "allergy", "medication")


def ensure_trial_template(
    session: Session, studio_id: uuid.UUID, *, at: datetime
) -> HealthFormTemplate:
    """Idempotent by (studio_id, kind, version).

    The setup wizard is resumable (§5.1) and a studio can be provisioned once but set up
    over several sittings, so this runs more than once for the same studio. A second
    published v1 trial template would be ambiguity at the exact moment a parent is signing
    something -- and the partial unique index in app/models/health.py would turn it into
    an integrity error rather than a duplicate. This makes it a no-op instead.
    """
    existing = session.execute(
        select(HealthFormTemplate).where(
            HealthFormTemplate.studio_id == studio_id,
            HealthFormTemplate.kind == "trial",
            HealthFormTemplate.version == TRIAL_TEMPLATE_SCHEMA["version"],
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    template = HealthFormTemplate(
        studio_id=studio_id,
        kind="trial",
        version=TRIAL_TEMPLATE_SCHEMA["version"],
        schema=TRIAL_TEMPLATE_SCHEMA,
        published_at=at,
        created_at=at,
    )
    session.add(template)
    session.flush()
    return template
