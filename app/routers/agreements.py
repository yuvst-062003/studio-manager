"""`הסכם הרשמה` -- the registration half of the club's agreement, and its gate status.

**Why this is not in `health_declarations.py`.** That router is the one door to §11.1's most
sensitive table, and every route in it is written under that rule. These routes carry an
address and a grade, which a coach may legitimately read. Two access rules in one file is how
one of them eventually gets applied to the wrong route.

The health half of the agreement is still `POST /students/{id}/health-declaration`. The parent
app's flow posts registration first, health second, terms third, and the gate opens only when
`agreement_status` says all three landed -- so a partial submission leaves the family exactly
where they were rather than half-registered.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.auth_context import AnyStaff
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.people import Student, StudentPickupContact
from app.models.person import Guardian, Person
from app.routers.health_templates import client_ip
from app.schemas.agreement import (
    AgreementStatusOut,
    ClubTermsIn,
    OtherParentDefaultsOut,
    PickupContactOut,
    RegistrationDefaultsOut,
    RegistrationIn,
    StudentRegistrationOut,
)
from app.services.health.agreement import (
    AgreementService,
    AgreementStatus,
    NationalIdInvalidError,
    NoGuardianError,
    RegistrationIncompleteError,
    agreement_status,
    registration_defaults,
    signing_person_id,
)
from app.services.health.club_terms import CLUB_TERMS_VERSION
from app.services.health.declarations import HealthDeclarationService

router = APIRouter(tags=["health"])

_STAFF_ROLES = ("owner", "manager")


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"code": code, "message": message},
    )


def _guardian_or_manager(
    request: Request, session: TenantSessionDep, student_id: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID | None, str | None]:
    """The same rule the declaration submit uses, and for the same reason.

    A coach is refused: §3.2 gives them no write here, and this writes a family's identifiers.
    A guardian is not a role (§3.1), so `require_roles` cannot express it and this is explicit.
    """
    if getattr(request.state, "identity_id", None) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    roles = set(getattr(request.state, "roles", ()) or ())
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "not yours"},
        )
    if not (roles & set(_STAFF_ROLES)) and not HealthDeclarationService.is_guardian_of(
        session, person_id=person_id, student_id=student_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "not yours"},
        )
    return (
        person_id,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
        client_ip(request),
    )


def _student(session: TenantSessionDep, student_id: uuid.UUID) -> Student:
    student = session.get(Student, student_id)
    if student is None:
        # 404, never 403: a cross-studio row is invisible rather than forbidden, and a 403
        # would confirm it exists.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such student"},
        )
    return student


def _status_out(
    session: TenantSessionDep,
    student: Student,
    *,
    signer_person_id: uuid.UUID | None,
    result: AgreementStatus,
) -> AgreementStatusOut:
    """One place building `AgreementStatusOut`, because all three endpoints below return one
    and a field added at one of them and not the others is a client that only sometimes sees
    it, depending on which step it just posted. Defaults are computed only while the
    registration step would actually render -- complete, they are dead weight in the
    response, and the family has nothing left to reuse them for anyway.
    """
    defaults: RegistrationDefaultsOut | None = None
    if not result.registration_complete:
        found = registration_defaults(session, student, signer_person_id=signer_person_id)
        if found is not None:
            defaults = RegistrationDefaultsOut(
                address=found.address,
                city=found.city,
                phone_home=found.phone_home,
                phone=found.phone,
                email=found.email,
                signer_national_id=found.signer_national_id,
                aliyah_year=found.aliyah_year,
                other_parent=(
                    OtherParentDefaultsOut(
                        first_name=found.other_parent.first_name,
                        last_name=found.other_parent.last_name,
                        national_id=found.other_parent.national_id,
                        phone=found.other_parent.phone,
                    )
                    if found.other_parent is not None
                    else None
                ),
                pickup_contacts=[
                    PickupContactOut(name=c.name, phone=c.phone, relation=c.relation)
                    for c in found.pickup_contacts
                ],
            )
    return AgreementStatusOut(
        health_signed=result.health_signed,
        registration_complete=result.registration_complete,
        terms_accepted=result.terms_accepted,
        complete=result.complete,
        club_terms_version=CLUB_TERMS_VERSION,
        school_class_required=result.school_class_required,
        registration_defaults=defaults,
    )


@router.get("/students/{student_id}/agreement", response_model=AgreementStatusOut)
def read_agreement_status(
    request: Request, student_id: uuid.UUID, session: TenantSessionDep
) -> AgreementStatusOut:
    """What the parent app's gate reads. Computed here so the client never re-derives it."""
    person_id, _, _ = _guardian_or_manager(request, session, student_id)
    student = _student(session, student_id)
    # The same subject a write would use, so a manager checking the status sees what the
    # FAMILY's gate sees rather than the state of their own consent record.
    try:
        subject_id: uuid.UUID | None = signing_person_id(
            session, student, caller_person_id=person_id
        )
    except NoGuardianError:
        subject_id = None
    result = agreement_status(session, student, signer_person_id=subject_id)
    return _status_out(session, student, signer_person_id=subject_id, result=result)


@router.put(
    "/students/{student_id}/agreement/registration",
    response_model=AgreementStatusOut,
    status_code=status.HTTP_200_OK,
)
def save_registration(
    request: Request,
    student_id: uuid.UUID,
    body: RegistrationIn,
    session: TenantSessionDep,
) -> AgreementStatusOut:
    """`טופס הרשמה` blocks 1-4. Idempotent: the form shows what is stored and replaces it."""
    person_id, identity_id, ip = _guardian_or_manager(request, session, student_id)
    student = _student(session, student_id)
    try:
        subject_id = signing_person_id(session, student, caller_person_id=person_id)
        AgreementService.save_registration(
            session,
            student,
            child=body.child.model_dump(),
            signer=body.signer.model_dump(),
            other_parent=body.other_parent.model_dump() if body.other_parent else None,
            pickup_contacts=[c.model_dump() for c in body.pickup_contacts],
            subject_person_id=subject_id,
            actor_person_id=person_id,
            at=now(),
            actor_identity_id=identity_id,
            actor_ip=ip,
        )
    except NoGuardianError as exc:
        raise _unprocessable("no_guardian", "this student has no guardian to sign for") from exc
    except NationalIdInvalidError as exc:
        # The FIELD, never the value -- a 422 body is as loggable as anything else.
        raise _unprocessable("national_id_invalid", exc.field) from exc
    except RegistrationIncompleteError as exc:
        raise _unprocessable("registration_incomplete", ", ".join(exc.fields)) from exc

    session.commit()
    session.refresh(student)
    result = agreement_status(session, student, signer_person_id=subject_id)
    return _status_out(session, student, signer_person_id=subject_id, result=result)


@router.post(
    "/students/{student_id}/agreement/club-terms",
    response_model=AgreementStatusOut,
    status_code=status.HTTP_201_CREATED,
)
def accept_club_terms(
    request: Request,
    student_id: uuid.UUID,
    body: ClubTermsIn,
    session: TenantSessionDep,
) -> AgreementStatusOut:
    """Step 3. Appends a `club_terms` row for the SIGNING PERSON, not for the student.

    §4.3 makes a terms acceptance a consent about the adult who accepted it -- which is also
    why a second child in the same family does not ask again: the parent already holds it.
    """
    from app.services.privacy.consent import PolicyVersionMismatchError

    person_id, identity_id, ip = _guardian_or_manager(request, session, student_id)
    student = _student(session, student_id)
    try:
        subject_id = signing_person_id(session, student, caller_person_id=person_id)
    except NoGuardianError as exc:
        raise _unprocessable("no_guardian", "this student has no guardian to sign for") from exc
    if not body.accepted:
        # Declining is not a withdrawal to record -- it is simply not proceeding. §11.6's
        # revocation path is `POST /privacy/consents`, which is where a considered withdrawal
        # belongs; a checkbox left unticked on a wizard step is not that.
        raise _unprocessable("club_terms_required", "the club terms must be accepted")
    try:
        AgreementService.accept_club_terms(
            session,
            studio_id=student.studio_id,
            # The GUARDIAN's acceptance, even when a manager typed it in: the gate checks the
            # family, so a consent recorded against the office leaves them blocked for ever.
            person_id=subject_id,
            version=body.version,
            at=now(),
            ip=ip,
            actor_identity_id=identity_id,
        )
    except PolicyVersionMismatchError as exc:
        raise _unprocessable("club_terms_version_mismatch", str(exc)) from exc

    session.commit()
    session.refresh(student)
    result = agreement_status(session, student, signer_person_id=subject_id)
    return _status_out(session, student, signer_person_id=subject_id, result=result)


@router.get("/students/{student_id}/registration", response_model=StudentRegistrationOut)
def read_student_registration(
    _: AnyStaff, request: Request, student_id: uuid.UUID, session: TenantSessionDep
) -> StudentRegistrationOut:
    """Who may collect this child, and (for a manager) the עמותה's aliyah figures.

    **`AnyStaff`, which includes coaches, and that is the whole point of the field.** A
    pickup contact only does its job if the person at the door can read it; storing it
    behind a manager-only rule would have made it write-only data. This is why the contacts
    live on their own table rather than inside `health_declaration.answers_encrypted` --
    §11.1's boundary is right for medical answers and wrong for "who is allowed to take this
    child home".

    `aliyah_years` is the opposite call: national-origin data, for the funding return, and a
    coach at the door has no use for it. Withheld below manager.
    """
    student = _student(session, student_id)
    contacts = [
        PickupContactOut(
            name=str((row.contact_encrypted or {}).get("name") or ""),
            phone=str((row.contact_encrypted or {}).get("phone") or ""),
            relation=(row.contact_encrypted or {}).get("relation"),
        )
        for row in session.execute(
            select(StudentPickupContact)
            .where(StudentPickupContact.student_id == student.id)
            .order_by(StudentPickupContact.created_at)
        ).scalars()
    ]
    contacts = [c for c in contacts if c.name]

    roles = set(getattr(request.state, "roles", ()) or ())
    aliyah: list[str] | None = None
    if roles & {"owner", "manager"}:
        aliyah = []
        for guardian in session.execute(
            select(Guardian).where(Guardian.student_id == student.id)
        ).scalars():
            person = session.get(Person, guardian.person_id)
            if person is not None and person.aliyah_year_encrypted:
                aliyah.append(str(person.aliyah_year_encrypted))

    return StudentRegistrationOut(pickup_contacts=contacts, aliyah_years=aliyah)
