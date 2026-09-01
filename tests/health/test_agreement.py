"""The registration half of `הסכם הרשמה`: where each fact lands, and what refuses it.

The health half already had a test file. This one covers what the club's paper form added:
blocks 1-4 written to real columns, the pickup contacts a coach must be able to read, and
the `club_terms` acceptance that is versioned separately from the platform's own policy.

**The property this file exists to protect** is the one that drove the whole design: none
of it may end up inside `health_declaration.answers_encrypted`, where §11.1 would make a
child's address manager-only with every read audit-logged.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.core.national_id import normalize_national_id
from app.models.health import ConsentRecord
from app.models.people import Student, StudentPickupContact
from app.models.person import Guardian, Person
from app.services.health.agreement import (
    AgreementService,
    NationalIdInvalidError,
    RegistrationIncompleteError,
    agreement_status,
    registration_defaults,
)
from app.services.health.club_terms import CLUB_TERMS_VERSION
from app.services.privacy.consent import PolicyVersionMismatchError
from sqlalchemy import select, text
from tests.health.conftest import T0

VALID_CHILD_ID = "100000009"
VALID_PARENT_ID = "100000017"
VALID_OTHER_ID = "100000025"


def _child(**overrides):
    base = {
        "national_id": VALID_CHILD_ID,
        "address": "הרצל 12",
        "city": "נתניה",
        "grade": "ג'",
    }
    return {**base, **overrides}


def _save(tenant_session, student, person_id, **overrides):
    kwargs = {
        "child": _child(),
        "signer": {"national_id": VALID_PARENT_ID},
        "other_parent": None,
        "pickup_contacts": [],
        "subject_person_id": person_id,
        "actor_person_id": person_id,
        "at": T0,
    }
    kwargs.update(overrides)
    return AgreementService.save_registration(tenant_session, student, **kwargs)


@pytest.fixture
def student_row(tenant_session, a_student) -> Student:
    return tenant_session.get(Student, a_student)


@pytest.fixture
def signer(tenant_session, studio) -> Person:
    person = Person(studio_id=studio.id, first_name="הורה", last_name="חותם", created_at=T0)
    tenant_session.add(person)
    tenant_session.flush()
    return person


# -- where the facts land ---------------------------------------------------------------
def test_registration_lands_on_columns_not_in_the_health_record(
    tenant_session, student_row, signer
):
    """The decision the whole design turns on. These are ordinary admin fields; putting them
    in `answers_encrypted` would give a child's address the medical access rule, and a coach
    at the door could not read it."""
    _save(tenant_session, student_row, signer.id)
    tenant_session.flush()

    child = tenant_session.get(Person, student_row.person_id)
    reloaded_signer = tenant_session.get(Person, signer.id)
    assert child.address is None
    assert child.city is None
    assert reloaded_signer.address == "הרצל 12"
    assert reloaded_signer.city == "נתניה"
    assert student_row.grade == "ג'"


def test_family_contact_fields_land_on_the_signing_guardian_not_the_child(
    tenant_session, student_row, signer
):
    """The redesigned family step asks address/contact once, on the signer.

    The old per-child gate stored those five fields on every child's `person` row, creating
    sibling copies with nothing keeping them together. The request shape is still the old
    client shape for compatibility, but the service must write the fields to the signer.
    """
    _save(
        tenant_session,
        student_row,
        signer.id,
        child=_child(
            address="הרצל 12",
            city="נתניה",
            phone_home="09-7412233",
            phone="054-8123456",
            email="parent@example.invalid",
        ),
    )
    tenant_session.flush()

    child = tenant_session.get(Person, student_row.person_id)
    assert child.address is None
    assert child.city is None
    assert child.phone_home is None
    assert child.phone is None
    assert child.email is None

    reloaded_signer = tenant_session.get(Person, signer.id)
    assert reloaded_signer.address == "הרצל 12"
    assert reloaded_signer.city == "נתניה"
    assert reloaded_signer.phone_home == "09-7412233"
    assert reloaded_signer.phone == "054-8123456"
    assert reloaded_signer.email == "parent@example.invalid"


def test_registration_status_reads_required_family_fields_from_the_signer(
    tenant_session, student_row, signer
):
    child = tenant_session.get(Person, student_row.person_id)
    child.national_id_encrypted = normalize_national_id(VALID_CHILD_ID).encode()
    student_row.grade = "ג'"
    signer.national_id_encrypted = normalize_national_id(VALID_PARENT_ID).encode()
    signer.address = "הרצל 12"
    tenant_session.flush()

    assert not agreement_status(
        tenant_session, student_row, signer_person_id=signer.id
    ).registration_complete

    signer.city = "נתניה"
    tenant_session.flush()
    assert agreement_status(
        tenant_session, student_row, signer_person_id=signer.id
    ).registration_complete


# -- reused when a sibling registers -----------------------------------------------------
def _sibling(app_session, studio) -> Student:
    """A second child of the same family, the way `AddSibling` creates one."""
    person = Person(studio_id=studio.id, first_name="ילד", last_name="שני")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=date(2026, 9, 1)
    )
    app_session.add(student)
    app_session.commit()
    return student


def test_registration_defaults_is_none_for_a_familys_first_child(
    tenant_session, student_row, signer
):
    """Nothing on file yet -- the form renders exactly as blank as it always has."""
    assert registration_defaults(tenant_session, student_row, signer_person_id=signer.id) is None


def test_registration_defaults_is_none_with_no_signer(tenant_session, student_row):
    assert registration_defaults(tenant_session, student_row, signer_person_id=None) is None


def test_registration_defaults_reuses_the_signers_family_facts(
    tenant_session, app_session, studio, student_row, signer
):
    """A second child's registration should not re-ask what the first one already told the
    club: address, phones, email and the signer's own ת.ז. all live on the signer's `person`
    row, shared across every child they guard."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        child=_child(
            address="הרצל 12",
            city="נתניה",
            phone_home="09-7412233",
            phone="054-8123456",
            email="parent@example.invalid",
        ),
        signer={"national_id": VALID_PARENT_ID, "aliyah_year": "2015"},
    )
    tenant_session.commit()

    sibling = _sibling(app_session, studio)
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=sibling.id,
            person_id=signer.id,
            is_primary=True,
            relation="parent",
            created_at=T0,
        )
    )
    tenant_session.commit()

    defaults = registration_defaults(tenant_session, sibling, signer_person_id=signer.id)

    assert defaults is not None
    assert defaults.address == "הרצל 12"
    assert defaults.city == "נתניה"
    assert defaults.phone_home == "09-7412233"
    assert defaults.phone == "054-8123456"
    assert defaults.email == "parent@example.invalid"
    assert defaults.signer_national_id == normalize_national_id(VALID_PARENT_ID)
    assert defaults.aliyah_year == "2015"


def test_registration_defaults_copies_the_other_parent_and_pickup_list_from_a_sibling(
    tenant_session, app_session, studio, student_row, signer
):
    """`other_parent` and `pickup_contacts` are stored per STUDENT even though a family
    answers them once -- copied forward from whichever sibling of this signer most recently
    recorded them, which is the family's own most current answer."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        other_parent={
            "first_name": "דני",
            "last_name": "לוי",
            "national_id": VALID_OTHER_ID,
            "phone": "050-1112222",
        },
        pickup_contacts=[{"name": "סבתא רותי", "phone": "052-9998888"}],
    )
    tenant_session.commit()

    sibling = _sibling(app_session, studio)
    tenant_session.add_all(
        [
            # `signer` guards both children -- without this row on the FIRST child too, the
            # lookup has no sibling to find and the test would pass on a family shape that
            # cannot occur (a signer who signed for a child they are not on record as
            # guarding).
            Guardian(
                studio_id=studio.id,
                student_id=student_row.id,
                person_id=signer.id,
                is_primary=True,
                relation="parent",
                created_at=T0,
            ),
            Guardian(
                studio_id=studio.id,
                student_id=sibling.id,
                person_id=signer.id,
                is_primary=True,
                relation="parent",
                created_at=T0,
            ),
        ]
    )
    tenant_session.commit()

    defaults = registration_defaults(tenant_session, sibling, signer_person_id=signer.id)

    assert defaults is not None
    assert defaults.other_parent is not None
    assert defaults.other_parent.first_name == "דני"
    assert defaults.other_parent.last_name == "לוי"
    assert defaults.other_parent.national_id == normalize_national_id(VALID_OTHER_ID)
    assert defaults.other_parent.phone == "050-1112222"
    assert [c.name for c in defaults.pickup_contacts] == ["סבתא רותי"]
    assert [c.phone for c in defaults.pickup_contacts] == ["052-9998888"]


def test_registration_defaults_never_copies_a_sibling_into_their_own_form(
    tenant_session, student_row, signer
):
    """A single child with nobody else on the account sees a blank form, same as today --
    the lookup excludes the student's own rows and finds no sibling to borrow from."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        pickup_contacts=[{"name": "דוד", "phone": "050-0000000"}],
    )
    tenant_session.commit()

    defaults = registration_defaults(tenant_session, student_row, signer_person_id=signer.id)

    assert defaults is not None
    assert defaults.pickup_contacts == ()
    assert defaults.other_parent is None


def test_the_national_id_is_normalized_before_storage(tenant_session, student_row, signer):
    """`18` and `000000018` are one person. Two rows disagreeing about the spelling are two
    people to any lookup that comes later."""
    _save(tenant_session, student_row, signer.id, child=_child(national_id="100000009"))
    tenant_session.flush()
    child = tenant_session.get(Person, student_row.person_id)
    assert child.national_id_encrypted.decode() == normalize_national_id("100000009")


def test_the_national_id_is_ciphertext_on_disk(tenant_session, student_row, signer, app_session):
    """A ת.ז. is a national identifier. §11.1 keeps it out of plaintext at rest.

    Raw SQL, not an ORM select, for the reason `test_the_answers_are_ciphertext_on_disk` gives:
    `EncryptedBytes` decrypts on read, so a select through the column type hands back the
    plaintext and this test would pass just as happily with the encryption removed. A Core
    `__table__.c` select is NOT raw enough -- the TypeDecorator applies there too, which is
    exactly how the first draft of this test fooled itself."""
    person_id = student_row.person_id
    _save(tenant_session, student_row, signer.id)
    tenant_session.commit()
    raw = app_session.execute(
        text("SELECT national_id_encrypted FROM person WHERE id = :p"), {"p": str(person_id)}
    ).scalar_one()
    assert raw.startswith(b"SMv1"), "the envelope format from app/core/encryption.py"
    assert VALID_CHILD_ID.encode() not in raw


# -- what refuses -----------------------------------------------------------------------
@pytest.mark.parametrize("field", ["national_id", "address", "city", "grade"])
def test_a_missing_required_field_is_refused(tenant_session, student_row, signer, field):
    with pytest.raises(RegistrationIncompleteError) as exc:
        _save(tenant_session, student_row, signer.id, child=_child(**{field: ""}))
    assert field in exc.value.fields


@pytest.fixture
def adult_student(tenant_session, studio) -> Student:
    """§3.3's adult who is their own guardian: `student.person_id` and the sole
    `guardian.person_id` are the same row.

    `JoinFlow`'s `selfStudent` checkbox creates exactly this, so it is not a hypothetical
    shape -- it is what a parent gets today by ticking a box that already ships.
    """
    person = Person(studio_id=studio.id, first_name="יובל", last_name="בוגר", created_at=T0)
    tenant_session.add(person)
    tenant_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="active")
    tenant_session.add(student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student.id,
            person_id=person.id,
            is_primary=True,
            created_at=T0,
        )
    )
    tenant_session.flush()
    return student


def _save_adult(tenant_session, student, **overrides):
    """One ת.ז. for both blocks, because for this student they are one person."""
    return _save(
        tenant_session,
        student,
        student.person_id,
        child=_child(national_id=VALID_PARENT_ID, grade=""),
        signer={"national_id": VALID_PARENT_ID},
        **overrides,
    )


def test_an_adult_who_is_their_own_guardian_needs_no_school_class(tenant_session, adult_student):
    """`כיתה/גן` is a school class, and a grown adult has no answer for it.

    Requiring it makes the gate unpassable for everyone who ticks `selfStudent` -- the
    exact failure this module's own comment warns about: "a required field nobody can
    answer is where a hard gate turns into a support call."
    """
    _save_adult(tenant_session, adult_student)
    tenant_session.flush()
    assert not adult_student.grade


def test_the_gate_opens_for_an_adult_with_no_school_class(tenant_session, adult_student):
    """The write half is not the whole bug. `agreement_status` reads `student.grade` too,
    so accepting the save while the status still demands a grade leaves the family through
    the form and still behind the gate -- a dead end with nothing left to fill in."""
    _save_adult(tenant_session, adult_student)
    tenant_session.flush()
    status = agreement_status(
        tenant_session, adult_student, signer_person_id=adult_student.person_id
    )
    assert status.registration_complete


def test_the_status_tells_the_client_not_to_ask_for_a_school_class(
    tenant_session, adult_student, student_row
):
    """The form has to know, and it cannot work this out for itself: deciding needs the
    guardian rows, which no client can see. A form that requires a field the server does not
    is a submit button that never fires, whatever the API accepts."""
    adult = agreement_status(
        tenant_session, adult_student, signer_person_id=adult_student.person_id
    )
    child = agreement_status(tenant_session, student_row, signer_person_id=None)
    assert not adult.school_class_required
    assert child.school_class_required


def test_a_student_with_no_guardian_at_all_is_not_treated_as_an_adult(
    tenant_session, student_row, signer
):
    """The rule is "the sole guardian IS the student", not "nobody else is a guardian".

    An unlinked student has no guardians either, and reading that as self-guarding would
    quietly drop `כיתה/גן` for every child whose guardian link has not landed yet.
    """
    with pytest.raises(RegistrationIncompleteError) as exc:
        _save(tenant_session, student_row, signer.id, child=_child(grade=""))
    assert "grade" in exc.value.fields


def test_an_adult_whose_parent_is_still_the_guardian_keeps_the_child_shape(
    tenant_session, adult_student, signer
):
    """A nineteen-year-old whose mother signs and pays is answered FOR, so the parent form
    is the right one. Two guardian rows means not self-guarding, whatever the ages."""
    tenant_session.add(
        Guardian(
            studio_id=adult_student.studio_id,
            student_id=adult_student.id,
            person_id=signer.id,
            created_at=T0,
        )
    )
    tenant_session.flush()
    with pytest.raises(RegistrationIncompleteError) as exc:
        _save_adult(tenant_session, adult_student)
    assert "grade" in exc.value.fields


def test_an_invalid_national_id_is_refused(tenant_session, student_row, signer):
    """A mistyped ID looks exactly like a real one and travels onto an insurance list."""
    with pytest.raises(NationalIdInvalidError):
        _save(tenant_session, student_row, signer.id, child=_child(national_id="123456789"))


def test_a_refusal_writes_nothing_at_all(tenant_session, student_row, signer):
    """Validation before assignment. A half-saved record plus a form to fill in again from
    the top is the worst outcome available on a hard gate."""
    with pytest.raises(NationalIdInvalidError):
        _save(tenant_session, student_row, signer.id, child=_child(national_id="123456789"))
    tenant_session.flush()
    child = tenant_session.get(Person, student_row.person_id)
    assert child.address is None and child.national_id_encrypted is None
    assert student_row.grade is None


def test_the_refusal_never_carries_the_id(tenant_session, student_row, signer):
    """G7's reasoning applied to an identifier: an exception message reaches a log."""
    with pytest.raises(NationalIdInvalidError) as exc:
        _save(tenant_session, student_row, signer.id, child=_child(national_id="123456789"))
    assert "123456789" not in str(exc.value)


# -- pickup contacts --------------------------------------------------------------------
def test_pickup_contacts_are_stored_and_replaced_wholesale(tenant_session, student_row, signer):
    """Replace, not merge. The form shows the whole list and submits the whole list, so a
    contact the family deleted must actually go -- "this person may collect my child" is
    exactly the permission that has to be withdrawable."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        pickup_contacts=[
            {"name": "סבתא רותי", "phone": "050-1111111", "relation": "סבתא"},
            {"name": "דוד יוסי", "phone": "050-2222222"},
        ],
    )
    tenant_session.flush()
    names = {
        row.contact_encrypted["name"]
        for row in tenant_session.execute(
            select(StudentPickupContact).where(StudentPickupContact.student_id == student_row.id)
        ).scalars()
    }
    assert names == {"סבתא רותי", "דוד יוסי"}

    _save(
        tenant_session,
        student_row,
        signer.id,
        pickup_contacts=[{"name": "סבתא רותי", "phone": "050-1111111"}],
    )
    tenant_session.flush()
    remaining = list(
        tenant_session.execute(
            select(StudentPickupContact).where(StudentPickupContact.student_id == student_row.id)
        ).scalars()
    )
    assert len(remaining) == 1, "the removed contact is gone, not merged back in"


def test_a_nameless_pickup_contact_is_dropped(tenant_session, student_row, signer):
    """An empty repeatable row the parent tabbed past is not a person."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        pickup_contacts=[{"name": "  ", "phone": "050-1111111"}],
    )
    tenant_session.flush()
    assert not list(
        tenant_session.execute(
            select(StudentPickupContact).where(StudentPickupContact.student_id == student_row.id)
        ).scalars()
    )


# -- the other parent -------------------------------------------------------------------
def test_the_other_parent_becomes_a_person_and_a_guardian(tenant_session, student_row, signer):
    _save(
        tenant_session,
        student_row,
        signer.id,
        other_parent={
            "first_name": "אמא",
            "last_name": "כהן",
            "national_id": VALID_OTHER_ID,
            "phone": "050-3333333",
        },
    )
    tenant_session.flush()
    guardians = list(
        tenant_session.execute(
            select(Guardian).where(Guardian.student_id == student_row.id)
        ).scalars()
    )
    assert any(tenant_session.get(Person, g.person_id).first_name == "אמא" for g in guardians)


def test_the_other_parent_gets_no_login_and_no_role(tenant_session, student_row, signer):
    """§3.1 -- guardian is not a role, and inviting somebody is a manager's deliberate act,
    never a side effect of a parent filling in a form."""
    _save(
        tenant_session,
        student_row,
        signer.id,
        other_parent={"first_name": "אבא", "last_name": "כהן", "national_id": VALID_OTHER_ID},
    )
    tenant_session.flush()
    created = tenant_session.execute(select(Person).where(Person.first_name == "אבא")).scalar_one()
    assert created.auth_identity_id is None


def test_the_same_other_parent_twice_is_matched_not_duplicated(tenant_session, student_row, signer):
    """Matched on ת.ז., which is the only reliable key on this form."""
    blob = {"first_name": "אמא", "last_name": "כהן", "national_id": VALID_OTHER_ID}
    _save(tenant_session, student_row, signer.id, other_parent=blob)
    tenant_session.flush()
    _save(tenant_session, student_row, signer.id, other_parent=blob)
    tenant_session.flush()
    people = list(
        tenant_session.execute(select(Person).where(Person.first_name == "אמא")).scalars()
    )
    assert len(people) == 1


# -- the club's terms -------------------------------------------------------------------
def test_accepting_the_club_terms_appends_a_consent_row(tenant_session, studio, signer):
    row = AgreementService.accept_club_terms(
        tenant_session,
        studio_id=studio.id,
        person_id=signer.id,
        version=CLUB_TERMS_VERSION,
        at=T0,
    )
    assert row is not None
    assert row.consent_type == "club_terms"
    assert row.version == CLUB_TERMS_VERSION
    assert row.granted is True


def test_club_terms_are_accepted_while_the_platform_policy_is_still_draft(
    tenant_session, studio, signer
):
    """The integration hazard this design had to solve. `ConsentService.record` compared every
    submission against `POLICY_VERSION` alone, which is 0 for our unreviewed draft -- so a
    club-terms grant at version 1 was rejected as a version mismatch. The two numbers were
    never going to agree: they version documents by different authors."""
    from app.services.privacy.policy import POLICY_VERSION

    assert CLUB_TERMS_VERSION != POLICY_VERSION, "the whole point of the per-type version"
    assert (
        AgreementService.accept_club_terms(
            tenant_session,
            studio_id=studio.id,
            person_id=signer.id,
            version=CLUB_TERMS_VERSION,
            at=T0,
        )
        is not None
    )


def test_accepting_a_version_that_is_not_published_is_refused(tenant_session, studio, signer):
    """The client posts back the version it RENDERED. Recording today's version for a screen
    that showed last month's is how a ledger comes to hold agreements nobody made."""
    with pytest.raises(PolicyVersionMismatchError):
        AgreementService.accept_club_terms(
            tenant_session,
            studio_id=studio.id,
            person_id=signer.id,
            version=CLUB_TERMS_VERSION + 99,
            at=T0,
        )


def test_accepting_twice_does_not_stack_rows(tenant_session, studio, signer):
    """The flow skips the terms step for a family who already hold this version, so a second
    call here is a duplicate rather than a decision."""
    for _ in range(2):
        AgreementService.accept_club_terms(
            tenant_session,
            studio_id=studio.id,
            person_id=signer.id,
            version=CLUB_TERMS_VERSION,
            at=T0,
        )
    tenant_session.flush()
    rows = list(
        tenant_session.execute(
            select(ConsentRecord).where(
                ConsentRecord.subject_id == signer.id,
                ConsentRecord.consent_type == "club_terms",
            )
        ).scalars()
    )
    assert len(rows) == 1


# -- the gate ---------------------------------------------------------------------------
def test_each_clause_of_the_gate_blocks_independently(tenant_session, student_row, signer, studio):
    """A family failing only the terms clause is blocked exactly as hard as one with no
    declaration at all. Computed in one place so the client cannot re-derive it differently."""
    status = agreement_status(tenant_session, student_row, signer_person_id=signer.id)
    assert not status.complete
    assert not status.registration_complete and not status.terms_accepted

    _save(tenant_session, student_row, signer.id)
    tenant_session.flush()
    status = agreement_status(tenant_session, student_row, signer_person_id=signer.id)
    assert status.registration_complete
    assert not status.terms_accepted, "registration alone does not open the gate"
    assert not status.complete

    AgreementService.accept_club_terms(
        tenant_session,
        studio_id=studio.id,
        person_id=signer.id,
        version=CLUB_TERMS_VERSION,
        at=T0,
    )
    tenant_session.flush()
    status = agreement_status(tenant_session, student_row, signer_person_id=signer.id)
    assert status.terms_accepted
    assert not status.health_signed, "and the health declaration is still its own condition"
    assert not status.complete


def test_an_anonymous_reader_sees_the_terms_as_unaccepted(tenant_session, student_row):
    """No signer, no acceptance to look up. Defaulting to True here would open the gate for
    exactly the caller least entitled to it."""
    status = agreement_status(tenant_session, student_row, signer_person_id=None)
    assert not status.terms_accepted


# -- publishing new questions re-gates every family --------------------------------------
def test_publishing_a_new_template_version_forces_everyone_to_sign_again(
    tenant_session, student_row, signer, studio, app_session
):
    """**The rule the whole gate turns on once a manager edits the form.**

    `student.health_status` only records that a declaration exists. A manager who publishes a
    new version has changed what the club asks, and every signature on file answered a
    different form. §11.6 already says this about consent -- "agreeing to v1 is not agreeing
    to v2" -- and questions are no different: an attestation to wording nobody agreed to is
    not an attestation.
    """
    from app.models.health import HealthDeclaration, HealthFormTemplate
    from app.services.structure.health_templates import (
        FULL_TEMPLATE_SCHEMA,
        ensure_full_template,
    )

    template = ensure_full_template(tenant_session, studio.id, at=T0)
    tenant_session.add(
        HealthDeclaration(
            studio_id=studio.id,
            student_id=student_row.id,
            template_id=template.id,
            template_version=template.version,
            answers_encrypted={"asthma": False},
            derived_flags={},
            signed_by_person_id=signer.id,
            signed_at=T0,
        )
    )
    student_row.health_status = "signed"
    tenant_session.flush()

    assert agreement_status(
        tenant_session, student_row, signer_person_id=signer.id
    ).health_signed, "signed against the current questions"

    # The manager publishes a new version. Nothing about the declaration row changes.
    tenant_session.add(
        HealthFormTemplate(
            studio_id=studio.id,
            kind="full",
            version=FULL_TEMPLATE_SCHEMA["version"] + 1,
            schema={**FULL_TEMPLATE_SCHEMA, "version": FULL_TEMPLATE_SCHEMA["version"] + 1},
            published_at=T0,
            created_at=T0,
        )
    )
    tenant_session.flush()

    status = agreement_status(tenant_session, student_row, signer_person_id=signer.id)
    assert not status.health_signed, "the old signature answered questions nobody asks now"
    assert not status.complete, "and the gate closes again"
    assert student_row.health_status == "signed", (
        "without rewriting history: the row still records that they DID sign, and the PDF "
        "still renders against the template they signed"
    )


def test_a_studio_with_no_published_template_does_not_open_the_gate(
    tenant_session, student_row, signer, app_session
):
    """The fault direction. If there is no published template there is nothing to have signed
    against, and defaulting to `True` would let everybody through on the one failure where
    nobody can sign at all."""
    student_row.health_status = "signed"
    tenant_session.flush()
    assert not agreement_status(
        tenant_session, student_row, signer_person_id=signer.id
    ).health_signed
