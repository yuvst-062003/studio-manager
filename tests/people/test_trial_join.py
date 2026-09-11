"""Entrance A — a trial family joining the club from their own app.

§5.4a ④ has asked "איך היה?" on days 1, 3 and 7 since M3 and offered the family nothing to
press; after 21 days the same worker writes them off as `lost`. The only route in was a
manager opening the student card. This is the other entrance, and it ends on the same
finishing line: health declaration → payment method per child → pay.

**It converts the student who already exists.** Reusing `add_child` would create a SECOND
record for a child already on the roster — one `trial`, one `active`, both on the register
— which is the duplicate defect this whole spec exists to close.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment, RegistrationRequest, Student, TrialBooking
from app.models.person import Guardian, Person
from app.models.structure import Group
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
from app.services.people.trials import TrialService
from sqlalchemy import select
from tests.people.conftest import T0, make_session

SUNDAY = T0.replace(hour=14)


@pytest.fixture
def two_groups_once_a_week(fake_schedule, studio, a_group, a_second_group, a_training_year):
    """One session a week in each group. Two groups ticked is a weekly volume of two —
    `weekly_volume` SUMS rather than unions, which is what "twice a week" means when the
    sessions belong to different groups."""
    for group_id, moment in ((a_group, SUNDAY), (a_second_group, SUNDAY + timedelta(days=3))):
        fake_schedule.sessions[group_id] = [
            make_session(
                studio_id=studio.id,
                group_id=group_id,
                training_year_id=a_training_year,
                starts_at=moment,
            )
        ]
    return fake_schedule


@pytest.fixture
def plans(app_session, studio):
    def _make(name: str, per_week: int | None, agorot: int) -> PricePlan:
        row = PricePlan(
            studio_id=studio.id,
            name=name,
            sessions_per_week=per_week,
            monthly_amount_agorot=agorot,
            active_from=T0.date().replace(day=1),
        )
        app_session.add(row)
        return row

    made = {
        "one": _make("פעם בשבוע", 1, 30_000),
        "two": _make("פעמיים בשבוע", 2, 40_000),
        "open": _make("מנוי חופשי", None, 55_000),
    }
    app_session.commit()
    return made


def _trial_student(session, *, group_id, attended: bool | None = True) -> Student:
    """§5.4a's funnel state: a `trial` student with a booking nobody has decided about."""
    tag = uuid.uuid4().hex[:8]
    created = StudentService.create(
        session,
        first_name=f"נועה{tag}",
        last_name=f"לוי{tag}",
        birthdate=None,
        guardian_first_name=f"הורה{tag}",
        guardian_last_name=f"לוי{tag}",
        guardian_email=f"g-{tag}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
    )
    student = created.student
    StudentStatusService.transition(session, student=student, to_status="trial", at=T0)
    # §5.4a's booking funnel writes the short form, and §5.5 keeps that enough for as long
    # as the child is still trying the club out.
    student.health_status = "trial_signed"
    session.add(
        TrialBooking(
            student_id=student.id,
            group_id=group_id,
            session_id=None,
            booked_at=T0,
            attended=attended,
            outcome="pending",
            is_override=False,
        )
    )
    session.flush()
    return student


def _guardian_of(session, student: Student) -> Person:
    person_id = (
        session.execute(select(Guardian.person_id).where(Guardian.student_id == student.id))
        .scalars()
        .first()
    )
    return session.get(Person, person_id)


# -- the service ---------------------------------------------------------------
def test_joining_converts_the_existing_student_and_never_creates_a_second(
    tenant_session, studio, a_group, a_second_group, two_groups_once_a_week, plans
):
    """The spec's first acceptance criterion, whole: one student record, two enrolments,
    the two-a-week plan, and a prorated first charge."""
    student = _trial_student(tenant_session, group_id=a_group)
    before = tenant_session.execute(select(Student.id)).scalars().all()

    joined = StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group, a_second_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )
    tenant_session.commit()

    after = tenant_session.execute(select(Student.id)).scalars().all()
    assert sorted(map(str, after)) == sorted(map(str, before)), "a second student was created"

    assert joined.id == student.id
    assert joined.status == "active"
    assert joined.price_plan_id == plans["two"].id

    enrolled = set(
        tenant_session.execute(
            select(Enrollment.group_id).where(Enrollment.student_id == student.id)
        ).scalars()
    )
    assert enrolled == {a_group, a_second_group}

    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == student.id, Charge.kind == "tuition")
    ).scalar_one()
    assert charge.status == "open"
    # No materialized sessions in this period, so `_charge_one` bills a flat month --
    # 'no sessions means no denominator, not a free month'. The number pins WHICH plan
    # was chosen, which `price_plan_id` alone would not if two plans shared an id shape.
    assert charge.amount_agorot == plans["two"].monthly_amount_agorot


def test_the_health_declaration_is_not_promoted_by_joining(
    tenant_session, a_group, two_groups_once_a_week, plans
):
    """§5.4a: 'the trial declaration is not sufficient for enrollment — converting requires
    the full form.' Promoting it here would switch off §5.5's gate for exactly the students
    who have signed nothing."""
    student = _trial_student(tenant_session, group_id=a_group)
    StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )
    assert student.health_status == "trial_signed"


def test_joining_closes_the_open_trial_so_the_lost_sweep_cannot_contradict_it(
    tenant_session, a_group, two_groups_once_a_week, plans
):
    """§5.4a ⑤ writes off a `pending` booking after 21 days. A booking left pending after
    the family joined is the club telling them nobody was paying attention."""
    student = _trial_student(tenant_session, group_id=a_group)
    StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )
    tenant_session.flush()
    booking = tenant_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == student.id)
    ).scalar_one()
    assert booking.outcome == "converted"


def test_an_invite_only_group_is_refused_as_not_found(
    tenant_session, studio, a_group, a_class, two_groups_once_a_week, plans, fake_schedule
):
    """`is_invite_only` is enforced on every enrolment path, and 404 rather than 403: a 403
    confirms the group exists, which is the one fact the flag is keeping."""
    secret = Group(studio_id=studio.id, class_id=a_class, name="נבחרת בנות", is_invite_only=True)
    tenant_session.add(secret)
    tenant_session.flush()
    fake_schedule.sessions[secret.id] = [
        make_session(
            studio_id=studio.id,
            group_id=secret.id,
            training_year_id=uuid.uuid4(),
            starts_at=SUNDAY,
        )
    ]
    student = _trial_student(tenant_session, group_id=a_group)

    with pytest.raises(NotFoundError):
        StudentService.join_from_trial(
            tenant_session,
            student_id=student.id,
            group_ids=[secret.id],
            at=T0,
            actor_person_id=None,
            schedule=fake_schedule,
        )


def test_a_student_who_is_not_on_a_trial_cannot_join(
    tenant_session, a_group, two_groups_once_a_week, plans
):
    """`active -> active` is not a legal move, and the transition runs FIRST so an illegal
    one refuses before an enrolment is written."""
    student = _trial_student(tenant_session, group_id=a_group)
    StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )
    tenant_session.flush()
    with pytest.raises(RefusedError):
        StudentService.join_from_trial(
            tenant_session,
            student_id=student.id,
            group_ids=[a_group],
            at=T0,
            actor_person_id=None,
            schedule=two_groups_once_a_week,
        )


def test_a_join_with_no_group_is_refused(tenant_session, a_group, two_groups_once_a_week, plans):
    student = _trial_student(tenant_session, group_id=a_group)
    with pytest.raises(RefusedError):
        StudentService.join_from_trial(
            tenant_session,
            student_id=student.id,
            group_ids=[],
            at=T0,
            actor_person_id=None,
            schedule=two_groups_once_a_week,
        )


def test_a_club_with_no_plans_leaves_the_joined_student_unpriced_rather_than_refusing(
    tenant_session, a_group, two_groups_once_a_week
):
    """A family who pressed join must not be left staring at a refusal because the club has
    not set its prices up. They are active and enrolled; the price is the manager's gap and
    `GET /billing/unpriced-students` is where they see it."""
    student = _trial_student(tenant_session, group_id=a_group)
    joined = StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )
    assert joined.status == "active"
    assert joined.price_plan_id is None


# -- the route -----------------------------------------------------------------
def test_the_route_refuses_a_child_who_is_not_the_callers(
    client, as_guardian, tenant_session, a_group, two_groups_once_a_week, plans
):
    """Under `/me/`, the collection is 'my children'. An id outside it does not exist
    rather than being forbidden — a 403 would confirm the child is in this studio."""
    student = _trial_student(tenant_session, group_id=a_group)
    tenant_session.commit()

    response = client.post(
        f"/api/v1/me/students/{student.id}/join",
        headers=as_guardian.headers,
        json={"group_ids": [str(a_group)]},
    )
    assert response.status_code == 404


def test_the_route_converts_for_a_guardian_of_the_child(
    client, app_session, fake_provider, studio, tenant_session, a_group, plans, monkeypatch
):
    """End to end through the router, because a service test cannot see the guardian check
    or the schedule seam the route builds."""
    from app.routers import students as students_router

    student = _trial_student(tenant_session, group_id=a_group)
    parent = _guardian_of(tenant_session, student)
    tenant_session.commit()

    caller = _sign_in_as(client, app_session, fake_provider, parent)

    class _OneADay:
        def materialize_sessions(self, group_id, from_date, to_date):
            return [
                make_session(
                    studio_id=studio.id,
                    group_id=group_id,
                    training_year_id=uuid.uuid4(),
                    starts_at=SUNDAY,
                )
            ]

    monkeypatch.setattr(students_router, "schedule_reader", lambda session: _OneADay())

    response = client.post(
        f"/api/v1/me/students/{student.id}/join",
        headers=caller,
        json={"group_ids": [str(a_group)]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "active"


def _sign_in_as(client, app_session, fake_provider, person: Person) -> dict[str, str]:
    """Attach a login to an existing Person and return their headers.

    §5.4a's trial funnel creates the parent's Person with no `auth_identity_id` — the
    family has never signed in — so this is the moment they first do.
    """
    from app.models.identity import AuthIdentity
    from tests.conftest import sign_in

    subject = f"trial-parent-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="parent")
    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()
    row = app_session.get(Person, person.id)
    row.auth_identity_id = identity_id
    app_session.commit()
    signed = sign_in(client, code=code, app_name="parent")
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


# -- what the family already answered, and the plan they chose ------------------
#
# Both exist for one screen: §5.4a ④'s "איך היה?" now lands on a three-step conversion --
# declaration, groups and plan, payment -- and its first step SHOWS the family the answers
# they already gave rather than asking the thirteen questions a second time (owner,
# 2026-09-12). The answers are in the full member template's own id-space already, because
# `TrialBookingPage` renders `kind=full` minus the clause, so there is nothing to map.
def _trial_declaration_for(session, student: Student, *, answers: dict) -> RegistrationRequest:
    parent = _guardian_of(session, student)
    row = RegistrationRequest(
        source="public_link",
        payload_encrypted={
            "guardian": {"person_id": str(parent.id)},
            "children": [
                {
                    "student_id": str(student.id),
                    "first_name": "נועה",
                    "last_name": "לוי",
                    "trial_declaration": {
                        "template_id": str(uuid.uuid4()),
                        "answers": answers,
                        "signature_image_base64": "",
                        "declared_by": "הורה לוי",
                        "declared_at": T0.isoformat(),
                    },
                }
            ],
        },
        matched_person_id=parent.id,
        status="approved",
        submitted_at=T0,
        reviewed_at=T0,
        reviewed_by_person_id=None,
        created_at=T0,
    )
    session.add(row)
    session.flush()
    return row


def test_the_trial_answers_come_back_for_the_child_who_gave_them(tenant_session, a_group):
    """Step 1 of the conversion shows what the family wrote. Without this read it would ask
    the thirteen questions again, which is what the owner refused: they answered them on the
    booking form and the answers are already the member form's own."""
    student = _trial_student(tenant_session, group_id=a_group)
    _trial_declaration_for(tenant_session, student, answers={"q_asthma": False, "q_meds": True})

    found = TrialService.declaration_for_student(tenant_session, student_id=student.id)

    assert found is not None
    assert found["answers"] == {"q_asthma": False, "q_meds": True}
    assert found["declared_by"] == "הורה לוי"


def test_each_sibling_gets_their_own_answers_out_of_the_one_payload(tenant_session, a_group):
    """One booking writes ONE row holding every child. Matching on the parent alone would
    show a sibling's answers under this child's name — and these are medical answers about a
    named minor, so the wrong one is not a cosmetic mix-up."""
    first = _trial_student(tenant_session, group_id=a_group)
    second = _trial_student(tenant_session, group_id=a_group)
    parent = _guardian_of(tenant_session, first)
    # Siblings share a parent. `_trial_student` gives each child its own, so without this
    # the second child's guardian is a different person and the narrowing below correctly
    # finds nothing — which would make this test pass for the wrong reason.
    tenant_session.add(
        Guardian(student_id=second.id, person_id=parent.id, is_primary=False, relation="parent")
    )
    tenant_session.add(
        RegistrationRequest(
            source="public_link",
            payload_encrypted={
                "guardian": {"person_id": str(parent.id)},
                "children": [
                    {
                        "student_id": str(first.id),
                        "trial_declaration": {"answers": {"q_asthma": True}},
                    },
                    {
                        "student_id": str(second.id),
                        "trial_declaration": {"answers": {"q_asthma": False}},
                    },
                ],
            },
            matched_person_id=parent.id,
            status="approved",
            submitted_at=T0,
            reviewed_at=T0,
            created_at=T0,
        )
    )
    tenant_session.flush()

    mine = TrialService.declaration_for_student(tenant_session, student_id=first.id)
    theirs = TrialService.declaration_for_student(tenant_session, student_id=second.id)

    assert mine is not None and mine["answers"] == {"q_asthma": True}
    assert theirs is not None and theirs["answers"] == {"q_asthma": False}


def test_a_child_with_no_trial_declaration_reads_as_none_rather_than_raising(
    tenant_session, a_group
):
    """A child a manager put on a trial by hand has no booking form behind them. The screen
    then asks the questions properly; it must not fail to open."""
    student = _trial_student(tenant_session, group_id=a_group)
    assert TrialService.declaration_for_student(tenant_session, student_id=student.id) is None


def test_joining_takes_the_plan_the_family_picked(
    tenant_session, a_group, a_second_group, two_groups_once_a_week, plans
):
    """The owner's call (2026-09-12): the conversion screen shows plans and the family
    chooses, exactly as the join wizard's own step does — `toRegisterPayload` has always
    sent a `price_plan_id`, so the two doors disagreed until now.

    Two groups is a weekly volume of two, so `plan_for_volume` would derive `two`. Picking
    `open` proves the choice is what was used and not the derivation."""
    student = _trial_student(tenant_session, group_id=a_group)

    joined = StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group, a_second_group],
        price_plan_id=plans["open"].id,
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )

    assert joined.price_plan_id == plans["open"].id


def test_a_plan_from_another_studio_is_refused_rather_than_priced(
    tenant_session, a_group, two_groups_once_a_week, plans
):
    """The price becomes a field a client posts the moment this is accepted, which is the
    exact objection `join_from_trial`'s own docstring raised against having one at all. It
    is answered by refusing, not by trusting."""
    student = _trial_student(tenant_session, group_id=a_group)

    with pytest.raises(RefusedError):
        StudentService.join_from_trial(
            tenant_session,
            student_id=student.id,
            group_ids=[a_group],
            price_plan_id=uuid.uuid4(),
            at=T0,
            actor_person_id=None,
            schedule=two_groups_once_a_week,
        )


def test_no_plan_chosen_still_derives_one_from_the_volume(
    tenant_session, a_group, a_second_group, two_groups_once_a_week, plans
):
    """The picker is a courtesy, not a requirement: a club with no published plans shows
    nothing to pick and the volume rule still prices the child."""
    student = _trial_student(tenant_session, group_id=a_group)

    joined = StudentService.join_from_trial(
        tenant_session,
        student_id=student.id,
        group_ids=[a_group, a_second_group],
        at=T0,
        actor_person_id=None,
        schedule=two_groups_once_a_week,
    )

    assert joined.price_plan_id == plans["two"].id


def test_the_route_shows_a_guardian_their_own_childs_trial_answers(
    client, as_guardian, app_session, tenant_session, a_group
):
    """The read the conversion screen's first step opens on. A guardian of this child, and
    the answers themselves — see `MyTrialDeclarationOut` on why this shape returns contents
    where `HealthDeclarationOut` returns flags."""
    student = _trial_student(tenant_session, group_id=a_group)
    tenant_session.add(
        Guardian(student_id=student.id, person_id=as_guardian.person_id, relation="parent")
    )
    _trial_declaration_for(tenant_session, student, answers={"q_asthma": False})
    tenant_session.commit()

    response = client.get(
        f"/api/v1/me/students/{student.id}/trial-declaration", headers=as_guardian.headers
    )

    assert response.status_code == 200
    assert response.json()["answers"] == {"q_asthma": False}


def test_the_route_refuses_a_child_who_is_not_the_callers_with_404(
    client, as_guardian, tenant_session, a_group
):
    """404 and never 403 — a 403 confirms the child is in this studio, and this body is a
    minor's medical answers."""
    student = _trial_student(tenant_session, group_id=a_group)
    _trial_declaration_for(tenant_session, student, answers={"q_asthma": True})
    tenant_session.commit()

    response = client.get(
        f"/api/v1/me/students/{student.id}/trial-declaration", headers=as_guardian.headers
    )

    assert response.status_code == 404
