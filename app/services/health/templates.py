"""D11's editable question set — the `kind='full'` template a manager owns.

**What this lane owns and what it does not.** Revision `0007` seeded a standard Israeli sports
health declaration as the default `full` question set for every studio, and
`app/services/structure/health_templates.py` is the same guarantee for studios provisioned after
it. What lives here is D11's other half: *a manager can add, remove and reword questions.*
`kind='trial'` is conflict C3's row — M1 seeded it so M3's trial bookings had something to write
against, and M3 writes declarations against it while a funnel is mid-way through asking. This
module refuses it.

**A published version is immutable, and that is the load-bearing rule here.** §4.3 puts
`template_version` on `health_declaration` precisely so a signature records which questions were
actually asked. Editing a published row in place would silently rewrite the meaning of every
signature already collected — and a health declaration for minors in an Israeli sports club is the
artefact least able to survive that.

So editing writes a **draft**: one row per studio with `published_at IS NULL`, at
`highest_published_version + 1`. A manager may reword it as many times as they like; nothing a
parent signs and nothing a coach sees moves until `publish` stamps `published_at` on it. That
also gives the editor a half-finished state that is safe to leave open, which a wizard-shaped
screen (§5.1 is resumable) will otherwise invent for itself.

**`is_bundled_default` is dropped on first edit.** It is D11's caveat in machine-readable form: it
tells the editor whose questions it is showing. A studio that has reworded ours is no longer
editing ours, and an editor that still claims otherwise is the opposite of the caveat.

**A publish re-derives the whole studio.** Flags are a function of (answers, template version), so
a manager adding a flag question makes every declaration's flags stale. `HealthService.
recompute_derived_flags` is the single named entry point that fixes them, which is exactly why the
seam is one function rather than a rule each writer remembers.

**G7 is stated here even though a template holds no answers.** The audit `diff` carries version
numbers and question *ids* — never wording, never anything a parent typed. The next person editing
this file should find the rule already written down rather than discover it.
"""

from __future__ import annotations

import copy
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.core.storage import MAX_UPLOAD_BYTES, ObjectStore, validate_key
from app.core.tenancy import TenantSession
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.services.audit import AuditService
from app.services.health import HealthService
from app.services.health.flags import flag_question_ids

logger = logging.getLogger(__name__)

#: The first bytes of a PDF. The declared `Content-Type` is attacker-controlled and the magic
#: bytes are not — the same rule `app/core/storage.py` §2.4 applies to images.
PDF_MAGIC = b"%PDF-"


class TemplateNotFoundError(Exception):
    """No such template in this studio. A 404, never a 403: a cross-studio row is invisible
    rather than merely forbidden, and a 403 would confirm it exists."""


class NotThisLanesTemplateError(Exception):
    """Conflict C3 — `kind='trial'` belongs to M1 and M3. A 409: the row exists and the caller
    may manage templates; this operation does not apply to that row."""


class InvalidSchemaError(Exception):
    """A question set that cannot be answered, or can be answered ambiguously."""


class NothingToPublishError(Exception):
    """No draft. Silently re-stamping the live version would tell a manager their unsaved edits
    went out."""


class UnsupportedSourceDocumentError(Exception):
    """The bytes are not a PDF."""


def validate_schema(schema: dict[str, Any]) -> None:
    """The two properties a question set cannot be published without.

    **At least one question.** A declaration nobody is asked anything is not a declaration, and
    §5.5's coach badge derives from answers that would not exist.

    **Unique question ids.** Two questions under one id means one answer for two questions, and
    `derived_flags` would take whichever the serialiser happened to write last — a ⚠ that is right
    or wrong depending on dict ordering.

    Deliberately not a full JSON-Schema validation. D11 hands the wording to the manager, and a
    validator that policed phrasing would be this file deciding what a studio may ask.
    """
    sections = schema.get("sections")
    if not isinstance(sections, list):
        raise InvalidSchemaError("a template needs a `sections` list")

    ids: list[str] = []
    for section in sections:
        if not isinstance(section, dict):
            raise InvalidSchemaError("every section is an object")
        for question in section.get("questions") or ():
            if not isinstance(question, dict) or not question.get("id"):
                raise InvalidSchemaError("every question needs an id")
            ids.append(str(question["id"]))

    if not ids:
        raise InvalidSchemaError(
            "a template with no questions cannot be answered, and §5.5's coach badge derives "
            "from answers"
        )
    duplicates = sorted({qid for qid in ids if ids.count(qid) > 1})
    if duplicates:
        raise InvalidSchemaError(f"duplicate question ids: {', '.join(duplicates)}")


class HealthTemplateService:
    """Every method takes the request's `TenantSession`, which fails closed."""

    @staticmethod
    def read(session: TenantSession, template_id: uuid.UUID) -> HealthFormTemplate:
        """One row, of either kind. Reading the trial template is fine -- M3 already does, and
        `NotThisLanesTemplateError` guards *writes*, which is where conflict C3 actually bites."""
        row = session.execute(
            select(HealthFormTemplate).where(HealthFormTemplate.id == template_id)
        ).scalar_one_or_none()
        if row is None:
            raise TemplateNotFoundError(str(template_id))
        return row

    @staticmethod
    def _owned(session: TenantSession, template_id: uuid.UUID) -> HealthFormTemplate:
        row = HealthTemplateService.read(session, template_id)
        if row.kind != "full":
            raise NotThisLanesTemplateError(row.kind)
        return row

    @staticmethod
    def current_full(session: TenantSession) -> HealthFormTemplate:
        """The highest **published** `full` version -- what a parent signs against today."""
        row = session.execute(
            select(HealthFormTemplate)
            .where(
                HealthFormTemplate.kind == "full",
                HealthFormTemplate.published_at.is_not(None),
            )
            .order_by(HealthFormTemplate.version.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row is None:
            raise TemplateNotFoundError("no published full template in this studio")
        return row

    @staticmethod
    def draft(session: TenantSession) -> HealthFormTemplate | None:
        """This studio's unpublished `full` questions, if a manager has started editing.

        At most one: a second draft would be a second answer to "what are we about to ask", and
        the editor would have to pick. The uniqueness is enforced by construction below rather
        than by an index, because the index this table has is on (studio_id, kind, version) and a
        partial one is schema this lane may not add.
        """
        return session.execute(
            select(HealthFormTemplate)
            .where(
                HealthFormTemplate.kind == "full",
                HealthFormTemplate.published_at.is_(None),
            )
            .order_by(HealthFormTemplate.version.desc())
            .limit(1)
        ).scalar_one_or_none()

    @staticmethod
    def edit_draft(
        session: TenantSession, template_id: uuid.UUID, *, schema: dict[str, Any], at: datetime
    ) -> HealthFormTemplate:
        """Save the studio's draft question set. D11's core right.

        `template_id` names the version being revised, and the row that changes is the **draft**,
        which may be a different row -- the returned object carries the id that actually moved.
        Revising a published version in place is refused by construction rather than by a check,
        which is why there is no branch here that could get it wrong.

        The `version` and `kind` in the incoming document are ignored and overwritten. A client
        that could set its own version could collide with a published one, and the unique index on
        (studio_id, kind, version) would turn a manager's edit into an integrity error they cannot
        act on.
        """
        source = HealthTemplateService._owned(session, template_id)
        validate_schema(schema)

        draft = HealthTemplateService.draft(session)
        if draft is None:
            published = HealthTemplateService.current_full(session)
            draft = HealthFormTemplate(
                studio_id=source.studio_id,
                kind="full",
                version=published.version + 1,
                schema={},
                source_pdf_object_key=published.source_pdf_object_key,
                published_at=None,
                created_at=at,
            )
            session.add(draft)

        stored = copy.deepcopy(schema)
        stored["kind"] = "full"
        stored["version"] = draft.version
        # D11's caveat, machine-readable. See the module docstring.
        stored.pop("is_bundled_default", None)

        draft.schema = stored
        draft.updated_at = at
        session.flush()
        return draft

    @staticmethod
    def publish(
        session: TenantSession,
        template_id: uuid.UUID,
        *,
        at: datetime,
        actor_person_id: uuid.UUID | None = None,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
    ) -> tuple[HealthFormTemplate, int]:
        """Stamp `published_at` on the draft, then re-derive the studio.

        Returns `(published_row, declarations_recomputed)`. The count is reported rather than
        swallowed for the reason `app/workers/followups.py` reports its undeliverable tally: a
        publish that said nothing about the roster it just invalidated would look identical to one
        that fixed it.

        `template_id` names any `full` row -- the draft itself or the version being superseded.
        Publishing with no draft is refused: there is nothing to publish, and silently re-stamping
        the live version would tell a manager their unsaved edits went out.
        """
        HealthTemplateService._owned(session, template_id)
        draft = HealthTemplateService.draft(session)
        if draft is None:
            raise NothingToPublishError("no draft questions in this studio")
        validate_schema(draft.schema)

        previous = HealthTemplateService.current_full(session)
        was = set(flag_question_ids(previous.schema))
        now_flags = set(flag_question_ids(draft.schema))

        draft.published_at = at
        draft.updated_at = at
        session.flush()

        recomputed = HealthTemplateService._recompute_studio(session)

        AuditService.record(
            session,
            action="health_template.publish",
            entity_type="health_form_template",
            entity_id=draft.id,
            studio_id=draft.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            # G7 -- ids and counts. Never wording, never an answer.
            diff={
                "from_version": previous.version,
                "to_version": draft.version,
                "questions_added": sorted(now_flags - was),
                "questions_removed": sorted(was - now_flags),
                "declarations_recomputed": recomputed,
            },
        )
        # `extra=`, never an f-string: an interpolated message has no key for the scrubber to
        # match. Nothing here would be sensitive anyway; the habit is the point (G7).
        logger.info(
            "health template published",
            extra={"template_version": draft.version, "declarations_recomputed": recomputed},
        )
        return draft, recomputed

    @staticmethod
    def _recompute_studio(session: TenantSession) -> int:
        """Re-derive every declaration in the active studio, through the seam.

        `TenantSession` scopes the select, so "every declaration" means every declaration *here* --
        a publish in one studio never touches another's roster.
        """
        service = HealthService(session)
        student_ids = list(session.execute(select(HealthDeclaration.student_id)).scalars().all())
        for student_id in student_ids:
            service.recompute_derived_flags(student_id)
        return len(student_ids)

    @staticmethod
    def attach_source_pdf(
        session: TenantSession,
        template_id: uuid.UUID,
        *,
        data: bytes,
        store: ObjectStore,
        at: datetime,
    ) -> str:
        """D11 — 'a manager may upload their own PDF, stored for reference'.

        **Reference only.** Nothing reads it back into the question set, and
        `test_uploading_a_pdf_never_changes_the_questions` says so rather than a comment. D11
        rejected "sign the PDF" outright: a signature over an image yields no `derived_flags`, so
        a coach gets no warning and reading anything at all would mean opening the full medical
        record.
        """
        row = HealthTemplateService._owned(session, template_id)
        if len(data) > MAX_UPLOAD_BYTES:
            raise UnsupportedSourceDocumentError(
                f"{len(data)} bytes exceeds the {MAX_UPLOAD_BYTES}-byte limit"
            )
        if not data.startswith(PDF_MAGIC):
            raise UnsupportedSourceDocumentError("the bytes are not a PDF")

        key = validate_key(f"studios/{row.studio_id}/health-template/{row.id}.pdf")
        store.put(key, data, content_type="application/pdf")
        row.source_pdf_object_key = key
        row.updated_at = at
        session.flush()
        return key
