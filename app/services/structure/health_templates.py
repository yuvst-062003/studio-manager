"""The two seeded question sets: conflict C3's trial form, and D11's default full one.

§14 puts health declarations in M4. §5.4a's trial funnel puts a declaration at step 3 of
five, and M3 builds that funnel. §4.3 already types the column `kind(full|trial)`, so the
seam was already cut: M1 seeded the SHORT trial form, and M4 builds everything around the
declaration itself -- the signature capture, the encryption, the PDF render, the
derived-flag pipeline.

**The full set arrived here in W3's contract commit, not in the lane**, because D11 says it
is seeded by migration and `main` owns `alembic/versions/**`. Revision `0007` carries a
frozen copy for every studio that existed when it ran; `ensure_full_template` below is the
same guarantee for every studio provisioned afterwards, and for the demo studio after a
reset. What lane HEALTH owns is making it **editable** -- D11 gives a manager the right to
add, remove and reword questions -- not the default itself.

**What this module deliberately does not build:** `health_declaration`. Nothing here stores
an answer, so G7 has nothing to protect in it -- which is the property that let M1 touch
health at all, and it still holds.
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


# ---------------------------------------------------------------------------------------
# D11 -- the default `full` question set, W3's contract commit.
#
# 15 item 1 made the studio's own הצהרת בריאות PDF a hard blocker on the whole M4 lane,
# because 5.5 said the template was "derived from the studio's existing PDF". D11 closed
# that on 2026-08-24: ship a standard Israeli sports health declaration as the default,
# seeded by migration, editable in the app, with the studio's own PDF kept at
# `source_pdf_object_key` for reference if they upload one.
# ---------------------------------------------------------------------------------------

#: **`is_bundled_default` carries D11's caveat in machine-readable form.** A health
#: declaration for minors in an Israeli sports club touches insurance and regulatory
#: ground. This set is a STARTING POINT and the app must say so where the manager edits it
#: -- the visible half is `template.disclaimer` in web/packages/i18n/{he,en,ru}/health.ts.
#: It is not a compliance artefact and must not be presented as one. Without a marker on
#: the row, the editor cannot tell whose questions it is showing: a studio that has
#: reworded every one of them is no longer editing ours, and telling them otherwise is the
#: opposite of the caveat.
#:
#: Longer than the trial form on purpose. 5.4a's trial declaration is step 3 of a five-step
#: funnel walked on a phone, so it trades completeness for brevity and a long form is
#: exactly where that funnel leaks. This one is signed once, at leisure, and makes the
#: opposite trade.
FULL_TEMPLATE_SCHEMA: dict[str, Any] = {
    "version": 1,
    "kind": "full",
    "is_bundled_default": True,
    "title": "הצהרת בריאות",
    "sections": [
        {
            "id": "medical_history",
            "title": "רקע רפואי",
            "questions": [
                {
                    "id": "chronic_illness",
                    "type": "boolean",
                    "label": "האם קיימת מחלה כרונית?",
                },
                {
                    "id": "chronic_illness_details",
                    "type": "text",
                    "label": "פירוט המחלה הכרונית",
                    "required": False,
                    "visible_if": {"chronic_illness": True},
                },
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
                    "id": "medication_details",
                    "type": "text",
                    "label": "אילו תרופות",
                    "required": False,
                    "visible_if": {"medication": True},
                },
                {
                    "id": "epilepsy",
                    "type": "boolean",
                    "label": "האם יש אפילפסיה או פרכוסים?",
                    "flag": True,
                },
                {"id": "diabetes", "type": "boolean", "label": "האם יש סוכרת?", "flag": True},
            ],
        },
        {
            "id": "cardiac",
            "title": "לב ומאמץ",
            "questions": [
                {
                    "id": "heart",
                    "type": "boolean",
                    "label": "האם ידוע על מחלת לב, מום לבבי או ניתוח לב?",
                    "flag": True,
                },
                {
                    "id": "chest_pain",
                    "type": "boolean",
                    "label": "האם הופיעו כאבים בחזה במהלך מאמץ גופני?",
                },
                {
                    "id": "fainting",
                    "type": "boolean",
                    "label": "האם הייתה התעלפות או סחרחורת במהלך מאמץ גופני?",
                },
                {
                    "id": "family_sudden_death",
                    "type": "boolean",
                    "label": "האם היה במשפחה מקרה של מוות פתאומי לפני גיל 50?",
                },
            ],
        },
        {
            "id": "orthopaedic",
            "title": "אורתופדיה ופציעות",
            "questions": [
                {
                    "id": "injury",
                    "type": "boolean",
                    "label": "האם קיימת פציעה פעילה או בעיה אורתופדית?",
                    "flag": True,
                },
                {
                    "id": "surgery_last_year",
                    "type": "boolean",
                    "label": "האם עבר/ה ניתוח בשנה האחרונה?",
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
            "id": "other",
            "title": "נוסף",
            "questions": [
                {
                    "id": "other",
                    "type": "boolean",
                    "label": "האם יש מצב רפואי נוסף שחשוב שנדע עליו?",
                    "flag": True,
                },
                {
                    "id": "other_details",
                    "type": "text",
                    "label": "פירוט",
                    "required": False,
                    "visible_if": {"other": True},
                },
                {"id": "health_fund", "type": "text", "label": "קופת חולים", "required": False},
                {
                    "id": "emergency_contact",
                    "type": "phone",
                    "label": "טלפון לשעת חירום",
                    "required": True,
                },
            ],
        },
        {
            "id": "declaration",
            "title": "הצהרה",
            "questions": [
                {
                    "id": "fit_to_train",
                    "type": "boolean",
                    "label": "אני מצהיר/ה שהתלמיד/ה כשיר/ה לפעילות גופנית ולאימוני ג'ודו",
                    "required": True,
                },
                {
                    "id": "notify_changes",
                    "type": "boolean",
                    "label": "אני מתחייב/ת לעדכן את המועדון בכל שינוי במצב הבריאותי",
                    "required": True,
                },
            ],
        },
    ],
}

#: The questions whose answers become 5.5's `derived_flags`. Named here rather than derived
#: by scanning for `"flag": True`, for the same reason TRIAL_FLAG_QUESTIONS is: M4's
#: pipeline reads one list, and a question that quietly loses its flag is a visible diff
#: rather than a silent one.
#:
#: These eight ids are exactly the `flag.*` labels already shipped in
#: web/packages/i18n/{he,en,ru}/health.ts. A flag with no label renders a blank chip on a
#: coach's roster -- a warning that silently is not one, on the one screen where 5.5's
#: warning actually matters.
FULL_FLAG_QUESTIONS = (
    "asthma",
    "allergy",
    "medication",
    "epilepsy",
    "heart",
    "diabetes",
    "injury",
    "other",
)


def ensure_full_template(
    session: Session, studio_id: uuid.UUID, *, at: datetime
) -> HealthFormTemplate:
    """Idempotent by (studio_id, kind, version), exactly like `ensure_trial_template`.

    D11 says the default set is seeded by migration, and revision 0007 does that for every
    studio that existed when it ran. **This is the other half.** A studio provisioned
    afterwards never ran that INSERT, and a demo reset wipes `health_form_template` and
    re-seeds it from the fixture layer -- so without this, "the product ships with a default
    question set" would be true only of the studios alive on the day 0007 landed, and lane
    HEALTH could not fix it from inside a worktree because seeding is a migration.
    """
    existing = session.execute(
        select(HealthFormTemplate).where(
            HealthFormTemplate.studio_id == studio_id,
            HealthFormTemplate.kind == "full",
            HealthFormTemplate.version == FULL_TEMPLATE_SCHEMA["version"],
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    template = HealthFormTemplate(
        studio_id=studio_id,
        kind="full",
        version=FULL_TEMPLATE_SCHEMA["version"],
        schema=FULL_TEMPLATE_SCHEMA,
        published_at=at,
        created_at=at,
    )
    session.add(template)
    session.flush()
    return template
