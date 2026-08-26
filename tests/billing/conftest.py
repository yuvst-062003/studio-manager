"""Signed-in callers, a priced student, and one charge lane MONEY can predict the id of.

Every fixture signs in for real rather than forging a token, for the reason
tests/structure/conftest.py states and every lane conftest since has repeated: §3.2's
matrix is enforced by a dependency reading `request.state.roles`, which
app/core/auth_context.py fills from a VERIFIED claim. A hand-made token would test the
dependency against an input the product cannot produce.

The two sign-ins per caller are not a workaround. The first creates the `auth_identity`
(nothing else can), the rows are attached to it, and the second picks up a token whose
`sid` and `roles` claims reflect them.

**Both sides of §3.2's financial boundary are here on purpose.** Invariant 3 forbids a
coach from ever reading a financial field, and `as_lead_coach`/`as_assistant_coach` are
the refused side of that rule. A lane that only has an allowed caller can prove the happy
path and nothing about the rule.

**Every caller carries X-Dev-Now, and it matters more here than it did for W3.** §5.10
keys the run on `(period_year, period_month)` and prorates from a date, so a test that
lets the server use wall-clock time is a test that passes in November and fails in
December -- and one that passes all month and fails on the 1st.

**G8 shapes what this file may offer.** There is no fixture that creates a הוראת קבע
mandate, because our provider cannot create one programmatically. `RecurringSubscription`
is the manager's RECORD of a mandate created in uPay's dashboard, and a lane that wanted
one would build it from a manual payment flow, not from here.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, time

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.billing import Charge, PricePlan
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: Mid-November 2026 -- inside the 2026/27 training year tests/schedule/conftest.py pins,
#: so a period billed here and a session materialized there mean the same month.
#:
#: **Deliberately not the 1st.** §5.10 prorates a mid-month join from the sessions
#: REMAINING in the period, so a clock pinned to the first of the month prorates nothing:
#: `remaining == total`, the multiplier is 1, and a proration that is completely broken
#: still returns the right answer. A date inside the month is what makes that test able
#: to fail.
T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
TODAY = date(2026, 11, 12)
YEAR_STARTS = date(2026, 9, 1)

#: The period `an_open_charge` is raised for. A tuple rather than two loose ints because
#: §4.3's idempotency key is (student_id, period_year, period_month, kind) and the two
#: always travel together.
PERIOD = (2026, 11)

#: ₪250.00 and ₪100.00. Written as agorot because that is what the column holds (G2) --
#: `250` here would be two and a half shekels, which is the exact class of mistake
#: invariant 1 exists to make impossible to write by accident.
MONTHLY_AGOROT = 25_000
REGISTRATION_AGOROT = 10_000


@dataclass
class Caller:
    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


@dataclass
class PricedStudent:
    """A child, and the two person ids a charge needs to be about them.

    `person_id` is the CHILD's person row; `payer_person_id` is the primary guardian's.
    They are different people and §4.3 keeps them apart deliberately: `charge.student_id`
    says who was taught and `charge.payer_person_id` says who owed, captured at creation
    so that changing the primary guardian later leaves historical charges with whoever
    actually owed them. A fixture returning only `student_id` would leave every test in
    this lane re-deriving the payer, and half of them getting it wrong.
    """

    student_id: uuid.UUID
    person_id: uuid.UUID
    payer_person_id: uuid.UUID


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון תשלומים", slug=f"bil-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _make_caller(
    client: TestClient,
    fake_provider,
    app_session: Session,
    studio: Studio,
    *,
    role: str | None,
    guardian_of: uuid.UUID | None = None,
    is_primary: bool = True,
) -> Caller:
    subject = f"{role or 'guardian'}-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="staff")

    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    person = Person(
        studio_id=studio.id,
        auth_identity_id=identity_id,
        first_name="בודק",
        last_name=role or "הורה",
        email=f"{subject}@example.invalid",
    )
    app_session.add(person)
    app_session.flush()
    if role is not None:
        app_session.add(
            RoleAssignment(
                studio_id=studio.id,
                person_id=person.id,
                role=role,
                scope_type="studio",
                granted_at=T0,
            )
        )
    if guardian_of is not None:
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=guardian_of,
                person_id=person.id,
                is_primary=is_primary,
                relation="parent",
            )
        )
    app_session.commit()

    signed = sign_in(client, code=code, app_name="staff")
    return Caller(token=signed.json()["access_token"], studio_id=studio.id, person_id=person.id)


@pytest.fixture
def as_owner(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="owner")


@pytest.fixture
def as_manager(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="manager")


@pytest.fixture
def as_lead_coach(client, fake_provider, app_session, studio) -> Caller:
    """Invariant 3's refused side. A coach may never read a financial field."""
    return _make_caller(client, fake_provider, app_session, studio, role="lead_coach")


@pytest.fixture
def as_assistant_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="assistant_coach")


@pytest.fixture
def as_guardian_of(client, fake_provider, app_session, studio):
    """A parent bound to an actual child, not to a placeholder id.

    Takes the student id rather than creating one, because the parent payments screen
    (`12e`, `12f`) shows one balance across ALL of a payer's children -- so a test of a
    two-child family needs one guardian over two students, which a fixture that made its
    own child could not express.

    **`is_primary` defaults to False here, and only here.** `a_priced_student` already
    installs the primary guardian -- the person `charge.payer_person_id` is captured from
    -- and `uq_guardian_one_primary_per_student` allows exactly one. A second parent who
    signs in is therefore a non-primary guardian, which is also the realistic shape: §3.3
    allows several guardians per child and one of them pays. Pass `is_primary=True` for a
    student that has no primary yet.
    """

    def _make(student_id: uuid.UUID, *, is_primary: bool = False) -> Caller:
        return _make_caller(
            client,
            fake_provider,
            app_session,
            studio,
            role=None,
            guardian_of=student_id,
            is_primary=is_primary,
        )

    return _make


@pytest.fixture
def a_price_plan(app_session: Session, studio: Studio) -> uuid.UUID:
    """C11's unit of pricing: training VOLUME, not a group.

    `sessions_per_week=2` is 'פעמיים בשבוע'. There is no `group_id` and no `class_id` on
    this table and that is the whole of C11 -- the club prices by how often a child
    trains, so a child in two groups still has one plan and one tuition charge.

    `active_to=None` marks it the current plan, which is what lets a mid-year price change
    leave last month's charges explainable rather than retroactively wrong.
    """
    row = PricePlan(
        studio_id=studio.id,
        name="פעמיים בשבוע",
        sessions_per_week=2,
        monthly_amount_agorot=MONTHLY_AGOROT,
        registration_fee_agorot=REGISTRATION_AGOROT,
        active_from=YEAR_STARTS,
        active_to=None,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_priced_student(
    app_session: Session, studio: Studio, a_price_plan: uuid.UUID
) -> PricedStudent:
    """An active child with a price, and a primary guardian to owe it.

    The guardian has no `auth_identity` -- they are a person who owes money, not a person
    who signs in. Use `as_guardian_of(student_id)` for a parent who does both; that
    creates a SECOND guardian row, which is realistic (§3.3 allows more than one) and is
    why `is_primary` exists to tell them apart.

    Committed rather than flushed, for the reason tests/health/conftest.py records: a
    flushed-only row lives inside `app_session`'s open transaction and is invisible to the
    request-scoped session a route opens on its own connection, so every route test in the
    lane would 404 on a student that is plainly there.
    """
    child = Person(studio_id=studio.id, first_name="ילד", last_name="בודק")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="בודק")
    app_session.add_all([child, payer])
    app_session.flush()

    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=a_price_plan,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student.id,
            person_id=payer.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    return PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)


@pytest.fixture
def an_open_charge(
    app_session: Session, studio: Studio, a_priced_student: PricedStudent
) -> uuid.UUID:
    """One month's tuition, unpaid, for `a_priced_student`.

    Inserted directly rather than through `BillingService.create_charge`, and that is not
    a shortcut: the seam raises `NotImplementedError` until M6 fills it in, so there is
    nothing to call yet. It is the same reasoning tests/attendance/conftest.py gives for
    inserting a session row rather than calling `ScheduleService.materialize_sessions` --
    what a lane needs from a fixture is a row whose id it can predict.

    `status='open'` is stated rather than left to the default so this fixture keeps
    meaning the same thing if the default ever moves. It is a DERIVED cache with exactly
    one writer (`recompute_charge_status`); nothing outside that method may set it, and a
    test that needs a settled charge should allocate a payment against it and recompute,
    not write `status` here.
    """
    row = Charge(
        studio_id=studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        student_id=a_priced_student.student_id,
        kind="tuition",
        period_year=PERIOD[0],
        period_month=PERIOD[1],
        amount_agorot=MONTHLY_AGOROT,
        due_date=date(2026, 11, 30),
        status="open",
        created_by="billing_run",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def tenant_session(studio: Studio) -> Iterator[TenantSession]:
    """A session scoped to `studio`, the way every request-scoped path runs.

    Services in this lane are written against `TenantSession`: it filters every query by
    the active studio and fails closed when there is none. `app_session` is a plain,
    unscoped `Session` -- fine for arranging fixture rows, wrong for exercising a service,
    because a list assertion made through it sees every studio's rows, including those
    committed by earlier tests and by the other lane sharing this database.

    Arrange with `app_session`, act and assert through this.
    """
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


@pytest.fixture
def a_group(app_session: Session, studio: Studio) -> uuid.UUID:
    """A group to enrol into.

    The run never reads a group -- C11 prices per student, and `price_plan` carries no
    `group_id` at all -- but `enrollment.group_id` is non-null, so eligibility needs one to
    exist. That asymmetry IS C11: a group is where a child trains, never what they pay.
    """
    from app.models.structure import Class as StudioClass
    from app.models.structure import Group

    klass = StudioClass(studio_id=studio.id, name="מתחילים", is_active=True)
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים א", is_active=True)
    app_session.add(group)
    app_session.commit()
    return group.id


@pytest.fixture
def an_enrolled_student(
    app_session: Session, studio: Studio, a_priced_student: PricedStudent, a_group: uuid.UUID
) -> uuid.UUID:
    """§5.10 step 1's eligibility: at least one `active` enrollment.

    Started at the training year's start, so this fixture prorates NOTHING -- Task 2's
    fixtures are the mid-month ones. Keeping the two apart matters: a proration test whose
    student also happens to be the flat-rate test's student cannot fail for one reason.
    """
    from app.models.people import Enrollment

    row = Enrollment(
        studio_id=studio.id,
        student_id=a_priced_student.student_id,
        group_id=a_group,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_second_enrollment(
    app_session: Session,
    studio: Studio,
    a_priced_student: PricedStudent,
    an_enrolled_student: uuid.UUID,
) -> uuid.UUID:
    """C11's test case: the same child in a SECOND group.

    One charge, not two. Walking enrollments instead of students is the defect that bills
    this child twice, at two different prices, silently and forever.
    """
    from app.models.people import Enrollment
    from app.models.structure import Class as StudioClass
    from app.models.structure import Group

    klass = StudioClass(studio_id=studio.id, name="תחרותית", is_active=True)
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="תחרותית א", is_active=True)
    app_session.add(group)
    app_session.flush()
    row = Enrollment(
        studio_id=studio.id,
        student_id=a_priced_student.student_id,
        group_id=group.id,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def an_unpriced_student(app_session: Session, studio: Studio, a_group: uuid.UUID) -> PricedStudent:
    """A child the manager enrolled but has not priced.

    §5.4 sets `price_plan_id` at conversion and nothing forces it, so this is a real state
    and the run must survive it without inventing a number. Charging zero would look like a
    working run; skipping silently would lose the child.
    """
    from app.models.people import Enrollment

    child = Person(studio_id=studio.id, first_name="ללא", last_name="מחיר")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="ללא מחיר")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=None,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=payer.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_group,
                status="active",
                started_on=YEAR_STARTS,
            ),
        ]
    )
    app_session.commit()
    return PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)


@dataclass
class MidMonthJoiner:
    """A child who joined inside the period, and the two session counts their charge must
    be derived from.

    Carrying the counts is what lets a test assert the **exact** amount rather than "less
    than a full month" -- which a calendar-day implementation also satisfies, and which is
    precisely the implementation §5.10 step 2 rules out.
    """

    student_id: uuid.UUID
    person_id: uuid.UUID
    payer_person_id: uuid.UUID
    joined_on: date
    remaining_sessions: int
    total_sessions: int


#: §5.6's worked structure -- the club trains Tuesday and Friday. Written as weekday numbers
#: the way `group_schedule_rule.weekday` stores them (0 = Sunday, per §5.6).
_TUESDAY, _FRIDAY = 2, 5

#: The mid-month joining date. Inside November 2026, and deliberately not a month boundary.
JOINED_MID_MONTH = date(2026, 11, 12)


@pytest.fixture
def a_scheduled_group(app_session: Session, studio: Studio) -> uuid.UUID:
    """A group that trains Tuesdays and Fridays, with a training year to hang it on.

    §5.6's own worked structure, chosen because the two days are **unevenly spread through
    a month** -- which is what makes a session count and a calendar-day count different
    numbers, and therefore what makes `test_proration_counts_sessions_and_not_calendar_days`
    able to fail.
    """
    from app.models.schedule import GroupScheduleRule, TrainingYear
    from app.models.structure import Class as StudioClass
    from app.models.structure import Group

    app_session.add(
        TrainingYear(
            studio_id=studio.id,
            name="תשפ״ז",
            starts_on=YEAR_STARTS,
            ends_on=date(2027, 6, 30),
            status="active",
        )
    )
    klass = StudioClass(studio_id=studio.id, name="מתחילים", is_active=True)
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="שלישי ושישי", is_active=True)
    app_session.add(group)
    app_session.flush()
    for weekday in (_TUESDAY, _FRIDAY):
        app_session.add(
            GroupScheduleRule(
                studio_id=studio.id,
                group_id=group.id,
                weekday=weekday,
                start_time=time(17, 0),
                end_time=time(18, 0),
                effective_from=YEAR_STARTS,
            )
        )
    app_session.commit()
    return group.id


@pytest.fixture
def a_mid_month_joiner(
    app_session: Session, studio: Studio, a_price_plan: uuid.UUID, a_scheduled_group: uuid.UUID
) -> MidMonthJoiner:
    """A child who joined on 2026-11-12, into a group that trains Tuesday and Friday.

    **Sessions are MATERIALIZED, not counted from the calendar.** §5.10 prorates from
    `session` rows, so a fixture that computed the count itself would let a calendar-day
    implementation pass every test built on it. `ScheduleService.materialize_sessions` is
    the same call M2's own code makes, and it writes real rows.

    The `0 < remaining < total` assertion at the end is a fixture guarding its own premise:
    a schedule change that flattened this case would otherwise weaken every proration test
    silently rather than failing one loudly.
    """
    from app.core.tenancy import use_studio
    from app.models.people import Enrollment
    from app.models.schedule import Session as SessionRow
    from app.services.schedule import ScheduleService

    child = Person(studio_id=studio.id, first_name="מצטרפת", last_name="באמצע")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="באמצע")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=JOINED_MID_MONTH,
        price_plan_id=a_price_plan,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=payer.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_scheduled_group,
                status="active",
                started_on=JOINED_MID_MONTH,
            ),
        ]
    )
    app_session.commit()

    # Materialized through a TenantSession, not `app_session`: `studio_id` is stamped by
    # `TenantSession`'s before_flush handler, so a plain Session inserts a session row with
    # a null tenant and the NOT NULL constraint refuses it. The scoped session is also how
    # every real caller reaches this service.
    with (
        use_studio(studio.id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        ScheduleService(scoped).materialize_sessions(
            a_scheduled_group, date(2026, 11, 1), date(2026, 12, 31)
        )
        scoped.commit()

    november = (
        app_session.execute(
            select(SessionRow).where(
                SessionRow.group_id == a_scheduled_group,
                SessionRow.starts_at >= datetime(2026, 11, 1, tzinfo=UTC),
                SessionRow.starts_at < datetime(2026, 12, 1, tzinfo=UTC),
                SessionRow.status != "cancelled",
            )
        )
        .scalars()
        .all()
    )
    total = len(november)
    remaining = sum(1 for row in november if row.starts_at.date() >= JOINED_MID_MONTH)
    assert 0 < remaining < total, (
        f"the fixture no longer straddles the joining date (remaining={remaining}, "
        f"total={total}); a proration test built on it would prove nothing"
    )
    return MidMonthJoiner(
        student_id=student.id,
        person_id=child.id,
        payer_person_id=payer.id,
        joined_on=JOINED_MID_MONTH,
        remaining_sessions=remaining,
        total_sessions=total,
    )


@pytest.fixture
def a_free_plan(app_session: Session, studio: Studio) -> uuid.UUID:
    """A plan with no registration fee. `registration_fee_agorot` is nullable because most
    plans have none, and a zero-amount charge would appear on the parent's screen as a line
    item for nothing."""
    row = PricePlan(
        studio_id=studio.id,
        name="פעם בשבוע",
        sessions_per_week=1,
        monthly_amount_agorot=15_000,
        registration_fee_agorot=None,
        active_from=YEAR_STARTS,
        active_to=None,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_joiner_on_a_free_plan(
    app_session: Session, studio: Studio, a_free_plan: uuid.UUID, a_scheduled_group: uuid.UUID
) -> PricedStudent:
    """A child on a plan that charges no registration fee, enrolled from the year's start
    so nothing about them prorates either."""
    from app.models.people import Enrollment

    child = Person(studio_id=studio.id, first_name="ללא", last_name="הרשמה")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="ללא הרשמה")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=a_free_plan,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=payer.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_scheduled_group,
                status="active",
                started_on=YEAR_STARTS,
            ),
        ]
    )
    app_session.commit()
    return PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)


@pytest.fixture
def a_frozen_student(
    app_session: Session, studio: Studio, a_price_plan: uuid.UUID, a_group: uuid.UUID
) -> PricedStudent:
    """§5.10 step 4 -- a student frozen across the billed period.

    An `active` enrollment AND a freeze covering November: eligibility and the freeze are
    two different facts, and a fixture that dropped the enrollment would let a run that
    ignores freezes entirely still pass.
    """
    from app.models.people import Enrollment, StudentFreeze

    child = Person(studio_id=studio.id, first_name="בהקפאה", last_name="בודק")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="הקפאה")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=a_price_plan,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=payer.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_group,
                status="active",
                started_on=YEAR_STARTS,
            ),
            StudentFreeze(
                studio_id=studio.id,
                student_id=student.id,
                from_date=date(2026, 11, 1),
                to_date=date(2026, 11, 30),
                reason="נסיעה",
            ),
        ]
    )
    app_session.commit()
    return PricedStudent(student_id=student.id, person_id=child.id, payer_person_id=payer.id)
