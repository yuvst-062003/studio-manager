"""§5.4(c) and §5.4a's approval queue.

**A request, not an enrollment** (L6). §5.4: "This creates a `registration_request` with
`source = 'parent_app'` and `matched_person_id` set -- a request, not an enrollment. The
manager approves it, consistent with (b): conversion is always a human decision."

**The payload is a stranger's personal data about a minor** (§11.1, L10). It never appears
in a list response, never in a log, never in an audit `diff`. The queue renders two display
names -- §5.4a's own mock-up shows the parent's name and each child's, and a queue that
showed neither would be a list of timestamps -- and reading the full submission is a
separate, audit-logged fetch.

**The group comes from the DECISION, not the submission.** §5.4: "Approving is where the
group is chosen, which is why `group_id` lives on the decision and not on the submission --
the public link's only job is a first lesson." The group a parent picked in the form is a
*preference* the queue renders; the manager may override it and the payload does not argue
back.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import RegistrationRequest
from app.models.person import Person
from app.services.audit import AuditService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader
from app.services.people.matching import ChildMatch, match_children, match_person


@dataclass
class RequestSummary:
    """One row of dashboard `6c`'s queue. Two names, and nothing else from the payload."""

    id: uuid.UUID
    source: str
    status: str
    submitted_at: datetime
    reviewed_at: datetime | None
    matched_person_id: uuid.UUID | None
    child_display_name: str
    guardian_display_name: str


@dataclass
class RequestDetail:
    summary: RequestSummary
    children: list[dict[str, Any]] = field(default_factory=list)
    preferred_group_id: uuid.UUID | None = None
    possible_duplicate_students: list[ChildMatch] = field(default_factory=list)


class RegistrationService:
    # -- intake ----------------------------------------------------------------
    @staticmethod
    def submit_from_parent(
        session: Session,
        *,
        submitter_person_id: uuid.UUID,
        first_name: str,
        last_name: str,
        birthdate: date | None,
        preferred_group_id: uuid.UUID | None,
        at: datetime,
    ) -> RegistrationRequest:
        """§5.4(c) -- parent artboard `12g`, `+ הוסף ילד`.

        `matched_person_id` is the submitter's own person id, not a guess: they are signed
        in, so the match is certain rather than probable. That is the one case in §5.4a's
        matching where the queue shows no ambiguity.

        **No enrollment, and no student.** L6 -- if this created either, a parent would have
        enrolled themselves. The row is a request, and approving it is what creates rows.
        """
        submitter = session.get(Person, submitter_person_id)
        if submitter is None:
            raise NotFoundError(str(submitter_person_id))

        row = RegistrationRequest(
            source="parent_app",
            payload_encrypted={
                "guardian": {
                    "person_id": str(submitter.id),
                    "display_name": f"{submitter.first_name} {submitter.last_name}",
                },
                "children": [
                    {
                        "first_name": first_name.strip(),
                        "last_name": last_name.strip(),
                        "birthdate": birthdate.isoformat() if birthdate else None,
                    }
                ],
                # A preference the queue renders, never the decision. §5.4 puts the group on
                # the approval.
                "preferred_group_id": str(preferred_group_id) if preferred_group_id else None,
            },
            matched_person_id=submitter.id,
            status="pending",
            submitted_at=at,
            created_at=at,
        )
        session.add(row)
        session.flush()
        AuditService.record(
            session,
            action="registration_request.submitted",
            entity_type="registration_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=submitter.id,
            # L10 -- the source and the submitter, never the child. `audit_log` is
            # append-only, so a child's name written here is beyond anonymization's reach.
            diff={"source": "parent_app", "children": 1},
        )
        session.flush()
        return row

    # -- the queue -------------------------------------------------------------
    @staticmethod
    def summarize(session: Session, row: RegistrationRequest) -> RequestSummary:
        """Decrypts ONE row to read two display names.

        L10 keeps the payload out of the list response, and this is the compromise that
        makes the queue usable: §5.4a's mock-up shows the parent's name and each child's,
        and a queue that showed neither would be a list of timestamps. Two names, and
        nothing else -- no birthdate, no phone, no health answer.
        """
        payload = row.payload_encrypted or {}
        children = payload.get("children") or []
        child_names = ", ".join(
            f"{child.get('first_name', '')} {child.get('last_name', '')}".strip()
            for child in children
        )
        guardian = payload.get("guardian") or {}
        return RequestSummary(
            id=row.id,
            source=row.source,
            status=row.status,
            submitted_at=row.submitted_at,
            reviewed_at=row.reviewed_at,
            matched_person_id=row.matched_person_id,
            child_display_name=child_names,
            guardian_display_name=guardian.get("display_name") or "",
        )

    @staticmethod
    def list_requests(
        session: Session,
        *,
        status: str | None = "pending",
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[RequestSummary], uuid.UUID | None]:
        """Dashboard `6c`. Pending first by default: §5.4a's queue is a to-do list."""
        stmt = select(RegistrationRequest)
        if status:
            stmt = stmt.where(RegistrationRequest.status == status)
        if after is not None:
            stmt = stmt.where(RegistrationRequest.id > after)
        rows = list(
            session.execute(stmt.order_by(RegistrationRequest.id).limit(limit + 1)).scalars()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        summaries = [RegistrationService.summarize(session, row) for row in rows]
        return summaries, (summaries[-1].id if has_more and summaries else None)

    @staticmethod
    def read_full(
        session: Session,
        *,
        request_id: uuid.UUID,
        actor_person_id: uuid.UUID | None,
        at: datetime,
    ) -> RequestDetail:
        """The manager opening one submission. **Audit-logged as sensitive.**

        §11.2 logs 'every note read on a student', and this is a stranger's submission about
        a minor -- the summary is free, the full read is recorded. The diff names what was
        read, never what it said (G7).
        """
        row = session.get(RegistrationRequest, request_id)
        if row is None:
            raise NotFoundError(str(request_id))

        payload = row.payload_encrypted or {}
        children = payload.get("children") or []
        duplicates: list[ChildMatch] = []
        for child in children:
            birthdate = child.get("birthdate")
            duplicates.extend(
                match_children(
                    session,
                    first_name=child.get("first_name", ""),
                    last_name=child.get("last_name", ""),
                    birthdate=date.fromisoformat(birthdate) if birthdate else None,
                )
            )

        AuditService.record(
            session,
            action="registration_request.read",
            entity_type="registration_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            is_sensitive=True,
            diff={"children": len(children)},
        )
        session.flush()
        preferred = payload.get("preferred_group_id")
        return RequestDetail(
            summary=RegistrationService.summarize(session, row),
            children=children,
            preferred_group_id=uuid.UUID(preferred) if preferred else None,
            possible_duplicate_students=duplicates,
        )

    # -- the decision ----------------------------------------------------------
    @staticmethod
    def approve(
        session: Session,
        *,
        request_id: uuid.UUID,
        group_id: uuid.UUID | None,
        actor_person_id: uuid.UUID | None,
        at: datetime,
        schedule: ScheduleReader,
    ) -> list[uuid.UUID]:
        """§5.4a's approval transaction, atomic. Returns the student ids created.

        Per child in the payload: Person -> Student -> Guardian(`is_primary` on the
        submitting parent) -> Enrollment. On the parent: the matched Person, or a new one
        plus an Invitation if they have no login yet.

        **`group_id` comes from the decision**, not the submission (§5.4). The group the
        parent picked is a preference the queue renders; the manager may override it.

        **What is NOT created, and why.** §5.4a's list ends "HealthDeclaration -> consent
        records". Both are M4's tables (C3) and do not exist in W2, so `health_status` stays
        `missing` and §5.5's app gate collects the full declaration from the parent -- which
        is what §5.4(b) prescribes for the manager path anyway. Recorded here so the
        omission is a known seam rather than a forgotten line.

        One transaction, no commit: the router commits. An approval that created a Student
        and then failed on the enrollment would leave a child in the club with no group and
        nothing to notice it by.
        """
        from app.services.people.students import StudentService

        row = session.get(RegistrationRequest, request_id)
        if row is None:
            raise NotFoundError(str(request_id))
        if row.status != "pending":
            raise ConflictError(f"this request was already {row.status}")
        if group_id is None:
            raise RefusedError(
                "approving is where the group is chosen (§5.4); the decision needs one"
            )

        payload = row.payload_encrypted or {}
        guardian_blob = payload.get("guardian") or {}
        parent = session.get(Person, row.matched_person_id) if row.matched_person_id else None
        if parent is None:
            matched = match_person(
                session,
                email=guardian_blob.get("email"),
                phone=guardian_blob.get("phone"),
            )
            parent = session.get(Person, matched.person_id) if matched else None

        created: list[uuid.UUID] = []
        for child in payload.get("children") or []:
            birthdate = child.get("birthdate")
            result = StudentService.create(
                session,
                first_name=child.get("first_name", ""),
                last_name=child.get("last_name", ""),
                birthdate=date.fromisoformat(birthdate) if birthdate else None,
                guardian_first_name=(guardian_blob.get("display_name") or "הורה").split(" ")[0],
                guardian_last_name=" ".join(
                    (guardian_blob.get("display_name") or "הורה").split(" ")[1:]
                ),
                # L7 -- if the queue already matched a Person, reuse their VERIFIED address
                # so `StudentService.create` links rather than duplicates. §5.4a: "No second
                # invitation, no second account, no second login."
                guardian_email=parent.email if parent else guardian_blob.get("email"),
                guardian_phone=parent.phone if parent else guardian_blob.get("phone"),
                at=at,
                actor_person_id=actor_person_id,
                status="pending_approval",
                source=row.source,
            )
            StudentService.convert(
                session,
                student_id=result.student.id,
                group_id=group_id,
                started_on=at.date(),
                price_plan_id=None,
                attends_weekdays=None,
                reason="approved from the queue",
                at=at,
                actor_person_id=actor_person_id,
                schedule=schedule,
            )
            created.append(result.student.id)

        row.status = "approved"
        row.reviewed_at = at
        row.reviewed_by_person_id = actor_person_id
        AuditService.record(
            session,
            action="registration_request.approved",
            entity_type="registration_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={"group_id": str(group_id), "students_created": len(created)},
        )
        session.flush()
        return created

    @staticmethod
    def reject(
        session: Session,
        *,
        request_id: uuid.UUID,
        reason: str | None,
        actor_person_id: uuid.UUID | None,
        at: datetime,
    ) -> RegistrationRequest:
        """`ck_registration_request_review_recorded` -- a non-pending row must carry
        `reviewed_at`. Set here, so the constraint is satisfied rather than worked around."""
        row = session.get(RegistrationRequest, request_id)
        if row is None:
            raise NotFoundError(str(request_id))
        if row.status != "pending":
            raise ConflictError(f"this request was already {row.status}")
        row.status = "rejected"
        row.reviewed_at = at
        row.reviewed_by_person_id = actor_person_id
        AuditService.record(
            session,
            action="registration_request.rejected",
            entity_type="registration_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={"reason": reason},
        )
        session.flush()
        return row
