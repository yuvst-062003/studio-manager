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
from app.models.people import Enrollment, Student, TrialBooking
from app.models.person import Guardian, Person
from app.models.structure import Group
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
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
    person_id = session.execute(
        select(Guardian.person_id).where(Guardian.student_id == student.id)
    ).scalars().first()
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
    secret = Group(
        studio_id=studio.id, class_id=a_class, name="נבחרת בנות", is_invite_only=True
    )
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
