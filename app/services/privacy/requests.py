"""§11.3's subject-access bundle and §11.4's erasure, as request rows.

Neither is PERFORMED here. `app/workers/privacy.py` owns the work and both of its work
functions are named seams that raise on purpose (HB-privacy-worker-unbuilt): the bundle is
not assembled and the purge deletes nothing. This module creates the request, authorises
who may see it, and lists it -- so that the refusal is visible to the guardian who asked
and to the person who has to answer them.

**Who may act for whom lives here**, in `subject_person_ids_for` and `may_act_for`, and is
CALLED from the router (`.claude/rules/api.md`: authorisation is checked in the router via
a dependency, never inside a service). The set is a query, not a rule: §3.3 makes a
guardian a `guardian` row rather than a role, so `require_roles` cannot express "or the
parent of this child" and something has to run the join.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import Student
from app.models.person import Guardian, Person
from app.models.reports import DataExportRequest, DeletionRequest
from app.services.audit import AuditService


class PrivacyService:
    """Handle GDPR data export and deletion requests."""

    def __init__(self, session: Session):
        self.session = session

    # -- who may act for whom ------------------------------------------------------

    @staticmethod
    def subject_person_ids_for(session: Session, person_id: uuid.UUID | None) -> set[uuid.UUID]:
        """The person ids this caller is the subject of, or the guardian of.

        Themselves, plus the `person` row behind every student they are a guardian of.
        §11.3 phrases the guardian's right as "everything held about their students", and
        a student's personal data hangs off `student.person_id` -- so the subject of an
        export about a child is the child's PERSON, not the student row.
        """
        if person_id is None:
            return set()
        children = (
            session.execute(
                select(Student.person_id)
                .join(Guardian, Guardian.student_id == Student.id)
                .where(Guardian.person_id == person_id)
            )
            .scalars()
            .all()
        )
        return {person_id, *children}

    @staticmethod
    def may_act_for(
        session: Session,
        *,
        actor_person_id: uuid.UUID | None,
        subject_person_id: uuid.UUID,
        is_manager: bool,
    ) -> bool:
        """§16's operator, or the subject themselves, or their guardian. Nobody else.

        A manager is allowed anyone in the studio because §11.3 says so in as many words
        -- "Managers can trigger the same for any student" -- and because the tenant
        session has already narrowed "anyone" to this studio.
        """
        if is_manager:
            return True
        return subject_person_id in PrivacyService.subject_person_ids_for(session, actor_person_id)

    # -- §11.3 ---------------------------------------------------------------------

    def request_data_export(
        self,
        subject_person_id: uuid.UUID,
        requested_by_person_id: uuid.UUID,
        include_audit_trail: bool = True,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
    ) -> DataExportRequest:
        """Create a new data export request.

        Returns the created request with initial status 'pending'. `app/workers/privacy.py`
        picks it up on its next run and -- until `assemble_export_bundle` is built -- moves
        it to `failed` with the reason recorded.

        **`include_audit_trail` is accepted and not stored.** There is no column for it and
        no lane may add one, so the flag reaches the bundle assembler through nothing. It
        stays in the request shape because the route is public API and dropping a field is
        a breaking change; the assembler will need a column, and that is a `main` revision.
        """
        # Validate that subject_person_id belongs to the current studio (tenant scope)
        subject = self.session.query(Person).filter(Person.id == subject_person_id).first()
        if not subject:
            raise ValueError(f"Person {subject_person_id} not found")

        export = DataExportRequest(
            subject_person_id=subject_person_id,
            requested_by_person_id=requested_by_person_id,
            status="pending",
        )
        self.session.add(export)
        self.session.flush()
        # §11.2 lists a data export among the always-audited actions, and §4.3 keeps two
        # people on the row precisely so a manager-initiated export is distinguishable
        # from the guardian's own. The audit entry is what makes that readable.
        AuditService.record(
            self.session,
            action="privacy.export_requested",
            entity_type="data_export_request",
            entity_id=export.id,
            studio_id=export.studio_id,
            actor_person_id=requested_by_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            diff={
                "subject_person_id": str(subject_person_id),
                "include_audit_trail": include_audit_trail,
            },
        )
        return export

    def get_export_status(self, job_id: uuid.UUID) -> DataExportRequest | None:
        """Poll the status of an export job."""
        return self.session.query(DataExportRequest).filter(DataExportRequest.id == job_id).first()

    def list_exports(self, subject_person_ids: set[uuid.UUID] | None) -> list[DataExportRequest]:
        """`None` means every subject in this studio -- §16's operator view.

        A set means those subjects and nobody else. The distinction is the caller's to
        make; this only runs the query, newest first, because "where is my export" is
        about the most recent one.
        """
        query = select(DataExportRequest)
        if subject_person_ids is not None:
            if not subject_person_ids:
                return []
            query = query.where(DataExportRequest.subject_person_id.in_(subject_person_ids))
        return list(
            self.session.execute(query.order_by(DataExportRequest.created_at.desc()))
            .scalars()
            .all()
        )

    # -- §11.4 ---------------------------------------------------------------------

    def request_deletion(
        self,
        subject_person_id: uuid.UUID,
        requested_by_person_id: uuid.UUID,
        reason: str,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
    ) -> DeletionRequest:
        """Create a new data deletion request.

        Returns the created request with initial status 'pending'. The worker's
        `purge_subject_data` raises until it is built, so the request will move to `failed`
        rather than to a `completed` that would be a compliance claim nothing downstream
        could check -- see that function's docstring.
        """
        # Validate that subject_person_id belongs to the current studio (tenant scope)
        subject = self.session.query(Person).filter(Person.id == subject_person_id).first()
        if not subject:
            raise ValueError(f"Person {subject_person_id} not found")

        deletion = DeletionRequest(
            subject_person_id=subject_person_id,
            requested_by_person_id=requested_by_person_id,
            status="pending",
            reason=reason,
        )
        self.session.add(deletion)
        self.session.flush()
        AuditService.record(
            self.session,
            action="privacy.deletion_requested",
            entity_type="deletion_request",
            entity_id=deletion.id,
            studio_id=deletion.studio_id,
            actor_person_id=requested_by_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            diff={"subject_person_id": str(subject_person_id), "reason": reason},
        )
        return deletion

    def get_deletion_status(self, deletion_id: uuid.UUID) -> DeletionRequest | None:
        """Poll the status of a deletion request."""
        return self.session.query(DeletionRequest).filter(DeletionRequest.id == deletion_id).first()

    def list_deletions(self, subject_person_ids: set[uuid.UUID] | None) -> list[DeletionRequest]:
        """See `list_exports` -- same scoping rule, same reason."""
        query = select(DeletionRequest)
        if subject_person_ids is not None:
            if not subject_person_ids:
                return []
            query = query.where(DeletionRequest.subject_person_id.in_(subject_person_ids))
        return list(
            self.session.execute(query.order_by(DeletionRequest.created_at.desc())).scalars().all()
        )
