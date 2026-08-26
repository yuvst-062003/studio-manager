"""§5.5's declaration: submitted once, encrypted at rest, and read by exactly two roles.

**Everything sensitive in this product is in one table, and this module is the only door to it.**
G7 and §19.6 restriction 3: `health_declaration` holds a minor's medical answers and a drawn
signature. Never logged, never in an audit `diff` (§11.2), never returned to a coach-scoped caller.
What a coach sees is `derived_flags` — booleans, never free text.

**Two shapes, one boundary.** `HealthDeclarationOut` carries flags and no answers; a coach and a
parent-app roster may receive it. `HealthDeclarationFullOut` carries the answers, is manager and
owner only, and **every read of it is audit-logged**. The split is in the type system rather than at
the call site, where it would be one forgotten `exclude=` away from a child's medical record on a
roster.

**Encryption is the column's job, not this module's.** `answers_encrypted` and
`signature_image_encrypted` are `EncryptedJSON` / `EncryptedBytes` (§11.1), so plaintext is assigned
and the type encrypts on the way out. Calling `encrypt()` here would be a second place the AAD is
chosen, and an AAD that disagrees with the column's is a row that never decrypts again.

**`last_reminder_sent_at` is derived from `audit_log`, not stored.** There is no such column on
`student` or `health_declaration`, and inventing one would be a stop-and-tell — `main` owns
`alembic/versions/**`. It is not a workaround: §11.2 already logs the reminder as an append-only
row with SELECT granted to the app role, so `MAX(created_at)` over that action **is** the fact
`HealthStatusSummaryOut.last_reminder_sent_at` wants, from the only table that cannot lie about it.
Do not add the column later.
"""

from __future__ import annotations

import base64
import binascii
import logging
import uuid
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from sqlalchemy import func, select

from app.core.storage import ObjectStore, sniff_image_type, validate_key
from app.core.tenancy import TenantSession
from app.models.audit import AuditLog
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Student
from app.models.person import Guardian, Person
from app.schemas.health import HealthStatusSummaryOut
from app.services.audit import AuditService
from app.services.health import HealthService
from app.services.health.flags import derive_flags
from app.services.health.pdf import RenderedSection, render_declaration_pdf

logger = logging.getLogger(__name__)

#: §11.2's three actions on this entity. Named once so a grep for "who has seen my child's medical
#: information" finds every writer.
ACTION_CREATE = "health_declaration.create"
ACTION_READ_FULL = "health_declaration.read_full"
ACTION_REMINDER = "health_declaration.reminder_sent"

#: §4.3 — `student.health_status(missing|trial_signed|signed)`. A full declaration is the only
#: thing that reaches `signed`, and a trial one never downgrades a student who already has one.
_STATUS_FOR_KIND = {"full": "signed", "trial": "trial_signed"}
_STATUS_RANK = {"missing": 0, "trial_signed": 1, "signed": 2}


class DeclarationNotFoundError(Exception):
    """No student, or no declaration for them. A 404: a cross-studio row is invisible rather than
    forbidden, and a 403 would confirm it exists."""


class SignatureRequiredError(Exception):
    """§5.5 — 'the guardian answers the questions and **draws a signature**.'"""


class SignatureNotAPngError(Exception):
    """The bytes decide, not the caller's word. No SVG, ever — it can carry script and would be
    served from our own origin (app/core/storage.py §2.4)."""


class AnswersIncompleteError(Exception):
    """A required question was not answered.

    12c finding 5, which that spec calls the most consequential gap on the artboard: "a declaration
    that defaults every question to no and gets signed is a health record nobody actually
    answered". The client renders a genuine third state; this is the same rule on the server,
    because a client is a suggestion.
    """


def required_question_ids(schema: Mapping[str, Any]) -> tuple[str, ...]:
    """Questions marked `required: True`, plus every `boolean` question that is a flag question.

    **A flag question is required whether or not it says so.** §5.5 gives a coach a ⚠ derived from
    these and nothing else, so an unanswered one is a warning that silently is not one — and an
    unanswered flag deriving to `False` reads as "no asthma" rather than "nobody asked". A
    conditional question (`visible_if`) is never required: it is not on screen.
    """
    required: list[str] = []
    for section in schema.get("sections") or ():
        if not isinstance(section, Mapping):
            continue
        for question in section.get("questions") or ():
            if not isinstance(question, Mapping) or not question.get("id"):
                continue
            if question.get("visible_if"):
                continue
            if question.get("required") is True or question.get("flag") is True:
                required.append(str(question["id"]))
    return tuple(required)


def decode_signature(signature_image_base64: str | None) -> bytes:
    """Base64 → PNG bytes, or a refusal. Never returns something unverified."""
    if not signature_image_base64:
        raise SignatureRequiredError("a declaration is not signed until it is signed")
    payload = signature_image_base64
    # A canvas gives `data:image/png;base64,…`. Accepting both spellings costs one split and
    # saves a class of "it worked in the test and not in the browser".
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise SignatureNotAPngError("the signature is not valid base64") from exc
    if sniff_image_type(data) != "image/png":
        raise SignatureNotAPngError("a signature must be a PNG")
    return data


class HealthDeclarationService:
    """Every method takes the request's `TenantSession`, which fails closed."""

    # -- reads -----------------------------------------------------------------
    @staticmethod
    def student(session: TenantSession, student_id: uuid.UUID) -> Student:
        row = session.get(Student, student_id)
        if row is None:
            raise DeclarationNotFoundError(str(student_id))
        return row

    @staticmethod
    def is_guardian_of(
        session: TenantSession, *, person_id: uuid.UUID | None, student_id: uuid.UUID
    ) -> bool:
        """§3.3 — 'My children' is simply `SELECT student_id FROM guardian WHERE person_id = me`.

        Every guardian on a student — primary or not — sees and can do exactly the same things
        (§4.3). There is no branch on `is_primary` here and there is none anywhere in the product.
        """
        if person_id is None:
            return False
        return (
            session.execute(
                select(Guardian.id).where(
                    Guardian.person_id == person_id, Guardian.student_id == student_id
                )
            ).first()
            is not None
        )

    @staticmethod
    def for_student(session: TenantSession, student_id: uuid.UUID) -> HealthDeclaration | None:
        return session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == student_id)
        ).scalar_one_or_none()

    @staticmethod
    def require(session: TenantSession, student_id: uuid.UUID) -> HealthDeclaration:
        row = HealthDeclarationService.for_student(session, student_id)
        if row is None:
            raise DeclarationNotFoundError(str(student_id))
        return row

    @staticmethod
    def read_full(
        session: TenantSession,
        student_id: uuid.UUID,
        *,
        actor_person_id: uuid.UUID | None,
        actor_identity_id: uuid.UUID | None,
        actor_ip: str | None,
        action: str = ACTION_READ_FULL,
    ) -> HealthDeclaration:
        """The manager-and-owner path, and **the audit row is written here, not by the caller.**

        §11.2: "every read *and* write of health declarations". A route that had to remember to log
        would be a route that eventually forgets, and the forgetting is invisible — the response
        looks identical. So reading through this method is the only way to get the answers, and it
        cannot be done without leaving a row.

        The row is added to the session; the caller commits. An authorisation check is the
        router's (`.claude/rules/api.md`), not this method's.
        """
        row = HealthDeclarationService.require(session, student_id)
        AuditService.record(
            session,
            action=action,
            entity_type="health_declaration",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            is_sensitive=True,
            # G7 — no `diff` at all on a read. There is nothing that changed, and the only thing
            # this method could put there is the record itself.
            diff=None,
        )
        return row

    # -- the write -------------------------------------------------------------
    @staticmethod
    def submit(
        session: TenantSession,
        student_id: uuid.UUID,
        *,
        template_id: uuid.UUID,
        answers: dict[str, Any],
        signature_image_base64: str | None,
        signed_by_person_id: uuid.UUID,
        signed_ip: str | None,
        signed_user_agent: str | None,
        at: datetime,
        actor_identity_id: uuid.UUID | None = None,
    ) -> HealthDeclaration:
        """§5.5's submit, in the order the refusals must happen.

        **Validation before persistence, deliberately.** A rejected submission writes nothing at
        all, so a parent who mistyped a phone number does not end up with a half-saved medical
        record and a form they must fill in again from the top.

        **A second submission supersedes; it never coexists.** `uq_health_declaration_student_id`
        makes that the schema's rule too — two rows would be two answers to "is this child
        asthmatic". `pdf_object_key` is cleared so the render re-runs against the new answers; a
        stale PDF is the one artefact here that could be shown to a regulator.

        `valid_until` is never set. §5.5: declarations do not expire, and
        `health_declaration_validity_months` turns on renewal *reminders*, not an expiry this row
        records.
        """
        student = HealthDeclarationService.student(session, student_id)
        template = session.get(HealthFormTemplate, template_id)
        if template is None:
            raise DeclarationNotFoundError(str(template_id))

        signature = decode_signature(signature_image_base64)

        missing = [q for q in required_question_ids(template.schema) if q not in answers]
        if missing:
            # The ids, never the wording and never what was answered elsewhere in the payload.
            raise AnswersIncompleteError(", ".join(sorted(missing)))

        # `strict=True`: a live parent's answers are being written for the first time, and a
        # non-boolean under a flag question is a client bug worth failing loudly on.
        flags = derive_flags(answers, template.schema)

        row = HealthDeclarationService.for_student(session, student_id)
        if row is None:
            row = HealthDeclaration(
                studio_id=student.studio_id,
                student_id=student_id,
                template_id=template.id,
                template_version=template.version,
                answers_encrypted=answers,
                derived_flags=flags,
                signature_image_encrypted=signature,
                signed_by_person_id=signed_by_person_id,
                signed_at=at,
                signed_ip=signed_ip,
                signed_user_agent=signed_user_agent,
                created_at=at,
            )
            session.add(row)
        else:
            row.template_id = template.id
            row.template_version = template.version
            row.answers_encrypted = answers
            row.derived_flags = flags
            row.signature_image_encrypted = signature
            row.signed_by_person_id = signed_by_person_id
            row.signed_at = at
            row.signed_ip = signed_ip
            row.signed_user_agent = signed_user_agent
            row.updated_at = at
            row.pdf_object_key = None
        session.flush()

        HealthDeclarationService._advance_status(student, template.kind)

        AuditService.record(
            session,
            action=ACTION_CREATE,
            entity_type="health_declaration",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=signed_by_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=signed_ip,
            is_sensitive=True,
            # G7 — a count and a version. Never an answer, never a flag NAME: `{"asthma": true}`
            # in an audit diff is a diagnosis in a table managers can browse.
            diff={
                "template_version": template.version,
                "flags_raised": sum(1 for value in flags.values() if value),
            },
        )
        # `extra=`, never an f-string: an interpolated message has no key for the scrubber to
        # match, and this is the one code path in the product where that matters most (G7).
        logger.info(
            "health declaration signed",
            extra={"template_version": template.version, "template_kind": template.kind},
        )
        session.flush()
        return row

    @staticmethod
    def _advance_status(student: Student, template_kind: str) -> None:
        """§4.3's `health_status`, and it only ever moves forward.

        A trial declaration signed after a full one must not demote a student to `trial_signed`:
        §5.5's parent-app gate turns on exactly that difference, and the demotion would lock a
        family out of the app over a record they already filed.
        """
        candidate = _STATUS_FOR_KIND.get(template_kind)
        if candidate is None:
            return
        if _STATUS_RANK[candidate] > _STATUS_RANK.get(student.health_status, 0):
            student.health_status = candidate

    # -- §5.5's one-tap reminder ----------------------------------------------
    @staticmethod
    def record_reminder(
        session: TenantSession,
        student_id: uuid.UUID,
        *,
        actor_person_id: uuid.UUID | None,
        actor_identity_id: uuid.UUID | None,
        actor_ip: str | None,
        at: datetime,
    ) -> datetime:
        """§5.5's `שלח תזכורת להורה`, recorded where `last_reminder_sent_at` reads it from.

        The message itself goes through `NotificationService.enqueue` (W5's seam) at the call
        site; this is the ledger entry, and it is written whether or not lane COMMS has landed —
        a reminder the manager pressed is a thing that happened even if the push could not go.
        """
        student = HealthDeclarationService.student(session, student_id)
        AuditService.record(
            session,
            action=ACTION_REMINDER,
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            is_sensitive=False,
            diff={"health_status": student.health_status},
        )
        return at

    @staticmethod
    def last_reminder_sent_at(
        session: TenantSession, student_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, datetime]:
        """Derived from `audit_log`. See the module docstring for why there is no column.

        `AuditLog` has no `studio_id` filter applied by `TenantSession` — it is not a
        `TenantMixin` table — so the studio is constrained explicitly. Without it a reminder sent
        in another studio for a same-id student would leak a timestamp across the boundary; the
        ids are UUIDs so it cannot happen in practice, and stating it costs one clause.
        """
        if not student_ids:
            return {}
        rows = session.execute(
            select(AuditLog.entity_id, func.max(AuditLog.created_at))
            .where(
                AuditLog.action == ACTION_REMINDER,
                AuditLog.entity_type == "student",
                AuditLog.entity_id.in_(student_ids),
            )
            .group_by(AuditLog.entity_id)
        ).all()
        return {entity_id: sent_at for entity_id, sent_at in rows}

    # -- dashboard 4e ----------------------------------------------------------
    @staticmethod
    def status_summary(
        session: TenantSession, *, status: str | None = None, limit: int = 200
    ) -> list[HealthStatusSummaryOut]:
        """Dashboard `4e` — 'what is missing, from whom'.

        **Counts and names, no contents.** A manager chasing missing declarations needs to know
        *who*, and nothing about what any of the completed ones say — so this returns no flags and
        no answers, and needs no audit row: nothing medical is disclosed by it.

        `left` and `lost` students are excluded. A club does not chase a declaration from a family
        that has gone, and a compliance list padded with them is a list nobody works through.
        """
        stmt = (
            select(
                Student.id,
                Student.health_status,
                Person.first_name,
                Person.last_name,
            )
            .join(Person, Person.id == Student.person_id)
            .where(Student.status.not_in(("left", "lost")))
            .order_by(Person.first_name, Person.last_name, Student.id)
            .limit(limit)
        )
        if status is not None:
            stmt = stmt.where(Student.health_status == status)
        rows = session.execute(stmt).all()

        reminders = HealthDeclarationService.last_reminder_sent_at(
            session, [row[0] for row in rows]
        )
        return [
            HealthStatusSummaryOut(
                student_id=student_id,
                student_display_name=f"{first_name} {last_name}".strip(),
                health_status=health_status,
                last_reminder_sent_at=reminders.get(student_id),
            )
            for student_id, health_status, first_name, last_name in rows
        ]

    @staticmethod
    def recompute(session: TenantSession, student_id: uuid.UUID) -> dict[str, bool]:
        """The seam, from this module. One import site rather than five."""
        return HealthService(session).recompute_derived_flags(student_id)


# ==========================================================================================
# §5.5's rendered PDF
# ==========================================================================================
#: The three locales §9 ships, for the two words a boolean answer becomes.
#:
#: **12c finding 4, answered.** "Are the questions translated or are they data?" They are
#: manager-editable rows in `health_form_template.schema`, so they are **data** and are rendered in
#: whatever language the manager typed them in — a studio that reworded them into Russian has a
#: Russian questionnaire, and a translation layer would silently overwrite that. The *answers* are
#: not data: `True` is not a string anybody typed, so it is rendered in the studio's own locale.
#: This is the whole of i18n in the Python process, and it stays this small on purpose.
_ANSWER_WORDS: dict[str, tuple[str, str]] = {
    "he": ("כן", "לא"),
    "en": ("Yes", "No"),
    "ru": ("Да", "Нет"),
}
_UNANSWERED = {"he": "—", "en": "—", "ru": "—"}

#: D11's caveat, on the artefact a club is most likely to hand to an insurer. Mirrors
#: `template.disclaimer` in web/packages/i18n/{he,en,ru}/health.ts; the two are kept in step by
#: `tests/health/test_pdf_contents.py`, because a caveat that exists only in the app is a caveat
#: absent from the document it is about.
_DISCLAIMER: dict[str, str] = {
    "he": (
        "השאלון המצורף הוא נקודת פתיחה בלבד ואינו מסמך עמידה ברגולציה. "
        "באחריות המועדון להתאים אותו לדרישות הביטוח והחוק"
    ),
    "en": (
        "The bundled questionnaire is a starting point only and is not a compliance document. "
        "Adapting it to insurance and legal requirements is the club's responsibility"
    ),
    "ru": (
        "Прилагаемая анкета — только отправная точка и не является документом соответствия. "
        "Приведение её в соответствие с требованиями страхования и закона — обязанность клуба"
    ),
}


def _display_answer(value: Any, locale: str) -> str:
    """One answer, as it appears on the page.

    A boolean becomes the locale's word. Anything else is the parent's own text and is rendered
    verbatim: it is *their* answer, and paraphrasing a free-text medical note on the document they
    signed would make the document say something they did not.
    """
    yes, no = _ANSWER_WORDS.get(locale, _ANSWER_WORDS["he"])
    if value is None or value == "":
        return _UNANSWERED.get(locale, "—")
    if isinstance(value, bool):
        return yes if value else no
    return str(value)


def build_pdf_sections(
    schema: Mapping[str, Any], answers: Mapping[str, Any], locale: str
) -> list[RenderedSection]:
    """The template's own sections, paired with what was answered.

    **A question that was not on screen is not on the page.** A `visible_if` question whose
    condition did not hold was never asked, and printing it with a dash reads as a refusal to
    answer. §5.5's document is a record of what happened.
    """
    sections: list[RenderedSection] = []
    for section in schema.get("sections") or ():
        if not isinstance(section, Mapping):
            continue
        rows: list[tuple[str, str]] = []
        for question in section.get("questions") or ():
            if not isinstance(question, Mapping) or not question.get("id"):
                continue
            question_id = str(question["id"])
            condition = question.get("visible_if")
            if isinstance(condition, Mapping) and not all(
                answers.get(key) == value for key, value in condition.items()
            ):
                continue
            label = str(question.get("label") or question_id)
            rows.append((label, _display_answer(answers.get(question_id), locale)))
        if rows:
            sections.append(
                RenderedSection(
                    title=str(section.get("title") or section.get("id") or ""), rows=rows
                )
            )
    return sections


def declaration_pdf_key(studio_id: uuid.UUID, declaration_id: uuid.UUID) -> str:
    return validate_key(f"studios/{studio_id}/health-declarations/{declaration_id}.pdf")


def render_and_store_pdf(
    session: TenantSession,
    declaration: HealthDeclaration,
    *,
    store: ObjectStore,
    studio_name: str,
    student_name: str,
    locale: str,
) -> str:
    """§5.5 — 'renders a filled, signed PDF which is saved to object storage'.

    The bytes are §11.1 personal data and object storage is not an encrypted column, which is why
    §11.7 puts access behind short-lived signed URLs and never a public bucket. This lane serves
    them through the API, authorised per request, rather than handing out a key.

    Rendered from the template the declaration was **signed against** — unlike `derived_flags`,
    which follow the live questions. The document is the record; the flags are a cache. See
    `HealthService.recompute_derived_flags`.
    """
    template = session.get(HealthFormTemplate, declaration.template_id)
    if template is None:
        raise DeclarationNotFoundError(str(declaration.template_id))

    signer = session.get(Person, declaration.signed_by_person_id)
    signed_by = f"{signer.first_name} {signer.last_name}".strip() if signer else ""

    data = render_declaration_pdf(
        title=str(template.schema.get("title") or "הצהרת בריאות"),
        student_name=student_name,
        studio_name=studio_name,
        signed_at=declaration.signed_at,
        signed_by=signed_by,
        template_version=declaration.template_version,
        sections=build_pdf_sections(template.schema, declaration.answers_encrypted or {}, locale),
        disclaimer=_DISCLAIMER.get(locale, _DISCLAIMER["he"]),
        signature_png=declaration.signature_image_encrypted,
    )
    key = declaration_pdf_key(declaration.studio_id, declaration.id)
    store.put(key, data, content_type="application/pdf")
    declaration.pdf_object_key = key
    session.flush()
    # `extra=`, never an f-string, and no answer in either (G7).
    logger.info("health declaration pdf rendered", extra={"bytes": len(data)})
    return key
