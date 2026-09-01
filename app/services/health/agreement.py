"""The club's `הסכם הרשמה`: one signature over registration details, health and terms.

**The whole design in one paragraph.** The club's paper `טופס הרשמה` is a single page with a
single signature covering six blocks. This module reproduces that in a product where those
six blocks have four different homes and four different access rules: registration details
on `person` and `student`, pickup contacts on `student_pickup_contact`, medical answers
behind §11.1's health boundary in `health_declaration`, and the acceptance of the club's
`תקנון ותנאי תשלום` in §11.6's `consent_record`. The parent signs once. The document is a
view over all four.

**Why the pieces are not merged into one row.** Putting the registration details into
`health_declaration.answers_encrypted` would have cost no migration -- and would have made a
child's address manager-and-owner only with every read audit-logged, so a coach could not
learn who is allowed to collect a child from the mat. The boundary that protects medical
answers is the wrong boundary for a home phone number.

**Why the terms are not welded to the declaration.** Health changes more often than terms.
A parent correcting an asthma answer re-signs the health step; because the acceptance is a
`consent_record` row rather than a field on the declaration, they are not walked back
through the `תקנון` they already accepted this version of. And when the club does change a
payment date, `CLUB_TERMS_VERSION` moves and everybody is asked again -- machinery §11.6
already had.

**G7.** Nothing here logs an answer, a ת.ז., an address or a pickup contact. What reaches a
log is counts and ids.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.core.national_id import InvalidNationalIdError, normalize_national_id
from app.core.tenancy import TenantSession
from app.models.health import ConsentRecord, HealthDeclaration, HealthFormTemplate
from app.models.people import Student, StudentPickupContact
from app.models.person import Guardian, Person
from app.services.audit import AuditService
from app.services.health.club_terms import CLUB_TERMS_CONSENT_TYPE, CLUB_TERMS_VERSION
from app.services.health.declarations import HealthDeclarationService

#: §11.2's action for the registration half. The health half keeps its own
#: `health_declaration.create`; two actions because they are two different sensitivities and
#: a single one would make "who has read my child's medical record" unanswerable by grep.
ACTION_REGISTRATION = "registration_agreement.update"


class AgreementError(Exception):
    """Base for the refusals below, so a router can map them in one place."""


class NationalIdInvalidError(AgreementError):
    """A ת.ז. failed its check digit. Carries the FIELD, never the value."""

    def __init__(self, field: str) -> None:
        super().__init__(f"{field} failed its check digit")
        self.field = field


class RegistrationIncompleteError(AgreementError):
    """A required registration field was left empty. Carries field names, never values."""

    def __init__(self, fields: list[str]) -> None:
        super().__init__(", ".join(sorted(fields)))
        self.fields = sorted(fields)


@dataclass(frozen=True)
class AgreementStatus:
    """What the parent app needs to decide whether to open the gate, computed once.

    Returned on `/me/students` so the client never re-derives it. **A gate whose condition is
    spelled out at two call sites is a gate that will eventually disagree with itself**, and
    the failure mode is either a family locked out of an app they have finished with, or one
    walking past a signature the club needs.
    """

    health_signed: bool
    registration_complete: bool
    terms_accepted: bool
    #: Whether this student's form must ask for `כיתה/גן`. False for a student who is their
    #: own guardian -- see `is_self_guarding`. Sent rather than derived for the reason in the
    #: docstring above: the client would otherwise need the guardian rows to work it out, and
    #: a form that requires a field the server does not is a submit button that never fires.
    school_class_required: bool = True

    @property
    def complete(self) -> bool:
        return self.health_signed and self.registration_complete and self.terms_accepted


class NoGuardianError(AgreementError):
    """Staff tried to file an agreement for a student with no guardian on record.

    Refused rather than filed against the member of staff. See `signing_person_id`.
    """


def signing_person_id(
    session: TenantSession, student: Student, *, caller_person_id: uuid.UUID
) -> uuid.UUID:
    """**Whose agreement this is, which is not always who is typing it.**

    §5.1 sanctions a manager filing on a family's behalf -- the paper club, where the parent
    signed a page and somebody enters it. Two things follow, and both were bugs before this
    function existed:

    * The `signer` block carries the PARENT's ת.ז. Attributing it to the caller writes a
      different family's national identifier onto the manager's own `person` row every time
      they file one.
    * The gate checks whether the PARENT holds the club's terms. A consent recorded against
      the manager leaves the family blocked for ever, however many forms the office types in
      -- the exact failure §5.1's path exists to avoid.

    So the subject is the caller when the caller is a guardian, and the student's guardian
    otherwise. `actor_person_id` on the audit row stays the caller, which is the honest record
    of who sat at the keyboard.

    Primary first only as a tie-break for WHICH guardian, never as a privilege: §4.3 gives
    every guardian the same rights, and this is picking a subject, not a rank.
    """
    if HealthDeclarationService.is_guardian_of(
        session, person_id=caller_person_id, student_id=student.id
    ):
        return caller_person_id
    guardian = (
        session.execute(
            select(Guardian)
            .where(Guardian.student_id == student.id)
            .order_by(Guardian.is_primary.desc(), Guardian.created_at)
        )
        .scalars()
        .first()
    )
    if guardian is None:
        raise NoGuardianError(str(student.id))
    return guardian.person_id


#: What step 1 will not submit without. Everything else on the paper form -- the second
#: parent, the landline, the student's own email, pickup contacts, the aliyah year -- is
#: optional, because none of it is needed to insure a child or to reach a guardian, and a
#: required field nobody can answer is where a hard gate turns into a support call.
REQUIRED_REGISTRATION_FIELDS = ("national_id", "address", "city", "grade")

#: The same list for a student who is their own guardian. `grade` is `כיתה/גן` -- a SCHOOL
#: class, a fact about a school-age child, and a grown adult has no answer for it. §3.3
#: allows an adult student who is also their own guardian, and `JoinFlow`'s `selfStudent`
#: checkbox creates exactly one, so this is not a hypothetical shape: without this list
#: every parent who ticks that box meets a required field nobody can fill, on a HARD gate.
REQUIRED_REGISTRATION_FIELDS_SELF = ("national_id", "address", "city")


def is_self_guarding(session: TenantSession, student: Student) -> bool:
    """**The sole guardian IS the student.** Not "nobody else is a guardian".

    A student whose guardian link has not landed yet has no guardian rows either, and
    reading that absence as self-guarding would quietly drop `כיתה/גן` for every child in
    that state -- a silent hole in the club's own form.

    Two rows is not self-guarding either, and that is deliberate: a nineteen-year-old whose
    mother still signs and pays is answered FOR, so the parent form is the right one for
    them. Age is never consulted; the guardian link already carries the answer.
    """
    person_ids = (
        session.execute(select(Guardian.person_id).where(Guardian.student_id == student.id))
        .scalars()
        .all()
    )
    return len(person_ids) == 1 and person_ids[0] == student.person_id


def required_registration_fields(session: TenantSession, student: Student) -> tuple[str, ...]:
    """Which list this student is held to.

    One function, because the write path and the gate MUST agree. A save that succeeds
    against a status that still demands a grade puts the family through the form and leaves
    them behind the gate with nothing left to fill in -- the dead end §4's refusal rule
    exists to prevent, arrived at from the other direction.
    """
    if is_self_guarding(session, student):
        return REQUIRED_REGISTRATION_FIELDS_SELF
    return REQUIRED_REGISTRATION_FIELDS


def _has_national_id(person: Person | None) -> bool:
    return bool(person is not None and person.national_id_encrypted)


def agreement_status(
    session: TenantSession, student: Student, *, signer_person_id: uuid.UUID | None
) -> AgreementStatus:
    """The three conditions, evaluated together. See `AgreementStatus`."""
    child = session.get(Person, student.person_id)
    # Resolved once and reused below, so the gate, the write path and the form the client
    # renders are all reading the same answer to the same question.
    required = required_registration_fields(session, student)
    school_class_required = "grade" in required
    registration_complete = (
        _has_national_id(child)
        and child is not None
        and bool(child.address)
        and bool(child.city)
        and (bool(student.grade) or not school_class_required)
    )

    terms_accepted = False
    if signer_person_id is not None:
        # Imported here rather than at module scope: app.services.privacy.consent imports
        # policy, which imports club_terms, which this module also imports.
        from app.services.privacy.consent import ConsentService

        terms_accepted = ConsentService.holds_current(
            session, person_id=signer_person_id, consent_type=CLUB_TERMS_CONSENT_TYPE
        )

    return AgreementStatus(
        health_signed=_signed_against_current_questions(session, student),
        registration_complete=bool(registration_complete),
        terms_accepted=terms_accepted,
        school_class_required=school_class_required,
    )


def _signed_against_current_questions(session: TenantSession, student: Student) -> bool:
    """Signed, **and signed against the questions being asked today**.

    `student.health_status` only records that a declaration exists. A manager who publishes a
    new template version has changed what the club asks -- added a question, reworded one --
    and every signature already on file answered a different form. Treating those as current
    would leave the club holding attestations to wording nobody agreed to.

    This is the same rule §11.6 already applies to consent: "agreeing to v1 of a privacy policy
    is not agreeing to v2". `ConsentService.outstanding` enforces it for the club's terms; this
    enforces it for the questions. Publishing therefore re-gates every family, which is what
    publishing MEANS.

    **A missing published template does not open the gate.** If the lookup fails there is
    nothing to have signed against, and defaulting to `True` would let everyone through on the
    one fault where nobody can sign at all.
    """
    if student.health_status != "signed":
        return False
    declaration = session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == student.id)
    ).scalar_one_or_none()
    if declaration is None:
        return False
    current = (
        session.execute(
            select(HealthFormTemplate)
            .where(
                HealthFormTemplate.kind == "full",
                HealthFormTemplate.published_at.is_not(None),
            )
            .order_by(HealthFormTemplate.version.desc())
        )
        .scalars()
        .first()
    )
    if current is None:
        return False
    return declaration.template_version == current.version


def _set_national_id(person: Person, raw: str | None, *, field: str) -> None:
    """Normalized before storage, so `18` and `000000018` are the same person to any lookup."""
    if raw is None or not str(raw).strip():
        return
    try:
        person.national_id_encrypted = normalize_national_id(str(raw)).encode()
    except InvalidNationalIdError as exc:
        raise NationalIdInvalidError(field) from exc


class AgreementService:
    """Every write the registration half of the agreement makes."""

    @staticmethod
    def save_registration(
        session: TenantSession,
        student: Student,
        *,
        child: dict[str, Any],
        signer: dict[str, Any],
        other_parent: dict[str, Any] | None,
        pickup_contacts: list[dict[str, Any]],
        #: Whose details these are -- the guardian. See `signing_person_id`.
        subject_person_id: uuid.UUID,
        #: Who is typing. The audit actor, and nothing else.
        actor_person_id: uuid.UUID,
        at: datetime,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
    ) -> None:
        """Blocks 1-4 of the paper form, written to the columns they belong in.

        **Validation before any assignment.** A refusal must leave the row untouched, or a
        parent who mistyped one ת.ז. gets a half-saved record and a form to fill in again.
        """
        child_person = session.get(Person, student.person_id)
        if child_person is None:
            raise RegistrationIncompleteError(["student"])

        missing = [
            field
            for field in required_registration_fields(session, student)
            if not str(child.get(field) or "").strip()
        ]
        if missing:
            raise RegistrationIncompleteError(missing)
        if not str(signer.get("national_id") or "").strip():
            raise RegistrationIncompleteError(["signer_national_id"])

        # -- the child ------------------------------------------------------------------
        _set_national_id(child_person, child.get("national_id"), field="child_national_id")
        child_person.address = str(child["address"]).strip()
        child_person.city = str(child["city"]).strip()
        for column, key in (("phone_home", "phone_home"), ("phone", "phone"), ("email", "email")):
            value = child.get(key)
            if value is not None and str(value).strip():
                setattr(child_person, column, str(value).strip())
        # NULL rather than "" when there is no school class to record: an empty string is a
        # value, and `bool(student.grade)` above would read it the same either way while a
        # roster would print it as a blank כיתה rather than omitting the field.
        student.grade = str(child.get("grade") or "").strip() or None

        # -- the signing parent ---------------------------------------------------------
        # `subject_person_id`, NOT the caller: a manager filing on a family's behalf would
        # otherwise write that family's ת.ז. onto their own row.
        signer_person = session.get(Person, subject_person_id)
        if signer_person is None:
            raise RegistrationIncompleteError(["signer"])
        _set_national_id(signer_person, signer.get("national_id"), field="signer_national_id")
        if signer.get("aliyah_year"):
            signer_person.aliyah_year_encrypted = str(signer["aliyah_year"]).strip()

        # -- the other parent -----------------------------------------------------------
        if other_parent and str(other_parent.get("first_name") or "").strip():
            AgreementService._upsert_other_parent(session, student, other_parent, at=at)

        # -- who may collect the child ---------------------------------------------------
        AgreementService._replace_pickup_contacts(session, student, pickup_contacts, at=at)

        session.flush()
        AuditService.record(
            session,
            action=ACTION_REGISTRATION,
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            # G7 applied to identifiers: counts and field NAMES, never a ת.ז., an address or
            # a pickup contact's phone number. An audit diff is read by more people than the
            # record it describes.
            diff={
                "fields_set": sorted(REQUIRED_REGISTRATION_FIELDS),
                "pickup_contacts": len(pickup_contacts),
                "other_parent": bool(other_parent),
            },
        )

    @staticmethod
    def _upsert_other_parent(
        session: TenantSession, student: Student, blob: dict[str, Any], *, at: datetime
    ) -> None:
        """A `Person` with no login and a `Guardian` row -- the shape `registrations.py` uses.

        **Matched on ת.ז. only, never on name.** Two siblings' parents share a surname, and a
        false match writes one family's identifier onto another family's record. A parent with
        no ID given is a new row: a duplicate person is a tidiness problem, and a merged one is
        a data-protection incident.

        This does NOT invite them, create an `auth_identity` or grant a role. §3.1: guardian is
        not a role, and inviting somebody is a manager's deliberate act, not a side effect of a
        parent filling in a form.
        """
        raw_id = str(blob.get("national_id") or "").strip()
        existing: Person | None = None
        if raw_id:
            try:
                normalized = normalize_national_id(raw_id).encode()
            except InvalidNationalIdError as exc:
                raise NationalIdInvalidError("other_parent_national_id") from exc
            for candidate in session.execute(select(Person)).scalars():
                if candidate.national_id_encrypted == normalized:
                    existing = candidate
                    break

        person = existing
        if person is None:
            person = Person(
                studio_id=student.studio_id,
                first_name=str(blob.get("first_name") or "").strip(),
                last_name=str(blob.get("last_name") or "").strip(),
                created_at=at,
            )
            session.add(person)
            session.flush()
        if raw_id:
            _set_national_id(person, raw_id, field="other_parent_national_id")
        if str(blob.get("phone") or "").strip():
            person.phone = str(blob["phone"]).strip()
        if blob.get("aliyah_year"):
            person.aliyah_year_encrypted = str(blob["aliyah_year"]).strip()

        already = session.execute(
            select(Guardian).where(
                Guardian.student_id == student.id, Guardian.person_id == person.id
            )
        ).scalar_one_or_none()
        if already is None:
            session.add(
                Guardian(
                    studio_id=student.studio_id,
                    student_id=student.id,
                    person_id=person.id,
                    is_primary=False,
                    relation="parent",
                    created_at=at,
                )
            )

    @staticmethod
    def _replace_pickup_contacts(
        session: TenantSession, student: Student, contacts: list[dict[str, Any]], *, at: datetime
    ) -> None:
        """Replace, not merge.

        The form shows the full list and submits the full list, so a contact the parent
        deleted must actually go. Merging would make removal impossible from the only screen
        that offers it -- and "this person may collect my child" is exactly the permission a
        family needs to be able to withdraw.
        """
        for existing in session.execute(
            select(StudentPickupContact).where(StudentPickupContact.student_id == student.id)
        ).scalars():
            session.delete(existing)
        session.flush()

        for contact in contacts:
            name = str(contact.get("name") or "").strip()
            if not name:
                continue
            session.add(
                StudentPickupContact(
                    studio_id=student.studio_id,
                    student_id=student.id,
                    contact_encrypted={
                        "name": name,
                        "phone": str(contact.get("phone") or "").strip(),
                        "relation": str(contact.get("relation") or "").strip() or None,
                    },
                    created_at=at,
                )
            )

    @staticmethod
    def accept_club_terms(
        session: TenantSession,
        *,
        studio_id: uuid.UUID,
        person_id: uuid.UUID,
        version: int,
        at: datetime,
        ip: str | None = None,
        actor_identity_id: uuid.UUID | None = None,
    ) -> ConsentRecord | None:
        """Append the acceptance, unless this person already holds the current version.

        Returns `None` when it was already held. **Not an error**: the flow deliberately skips
        the terms step for a family who accepted this version already, so a re-signature that
        does reach here is a duplicate rather than a mistake, and §11.6 makes consent an
        append-only ledger rather than a set of rows to pile up.
        """
        from app.services.privacy.consent import ConsentService, PolicyVersionMismatchError

        if version != CLUB_TERMS_VERSION:
            # The client posts back the version it RENDERED. Recording today's version for a
            # screen that showed last month's is how a ledger comes to hold agreements nobody
            # made -- the same rule `ConsentService.record` states for the platform's policy.
            raise PolicyVersionMismatchError(version, CLUB_TERMS_VERSION)
        if ConsentService.holds_current(
            session, person_id=person_id, consent_type=CLUB_TERMS_CONSENT_TYPE
        ):
            return None
        rows = ConsentService.record(
            session,
            person_id=person_id,
            grants={CLUB_TERMS_CONSENT_TYPE: True},
            version=version,
            at=at,
            ip=ip,
            actor_identity_id=actor_identity_id,
            studio_id=studio_id,
        )
        return rows[0] if rows else None
