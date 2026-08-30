"""§19.3's six data layers — the demo club, finally populated (2026-08-30).

Every layer here was a `PlannedLayer` from M0 until today, which meant `POST
/dev/demo/reset` restored a club with no groups, no students and no history: pressing
reset produced a product nobody could demo, and the empty public group list it left
behind is what a parent read as "I can't pick a program".

The rules of `fixtures.py` apply in full: seeds run on a **plain Session**, so every row
sets `studio_id` itself; ids that other layers (or the personas layer before us) need are
**deterministic** (`uuid5`, same trick as `persona_student_id`), so a reset never
re-points a link; and each layer's `tables` tuple is asserted reachable by the wipe.

Volume is a portrait, not a load test: ~40 children across five groups, half a term of
attendance, two months of money. Enough for every screen to look inhabited, small enough
that a reset stays instant.
"""

from __future__ import annotations

import random
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.core.clock import now
from app.models.attendance import Attendance
from app.models.belts import BeltRank, StudentBelt
from app.models.billing import Charge, Payment, PaymentAllocation, PricePlan, Product, UpayIpnRecord
from app.models.events import Event, EventExamResult
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Enrollment, Student, TrialBooking
from app.models.person import Guardian, Person
from app.models.schedule import GroupScheduleRule, StudioClosure, TrainingYear
from app.models.schedule import Session as SessionRow
from app.models.structure import Class, Group, Location
from app.services.belts.presets import JUDO_CHILDREN, KARATE
from app.services.demo.personas import SEEDED_AT, persona_student_id

ZONE = ZoneInfo("Asia/Jerusalem")

#: One generator, one seed: a reset always builds the same club, so a bug seen in demo
#: data is a bug someone else can see too.
_SEED = 20260830


def _did(kind: str, key: str) -> uuid.UUID:
    """A deterministic id, namespaced like `persona_student_id` is."""
    return uuid.uuid5(uuid.NAMESPACE_URL, f"studio-manager/demo/{kind}/{key}")


def _at(day: date, hhmm: str) -> datetime:
    """A wall-clock moment in the studio's zone, stored UTC (G3)."""
    hour, minute = (int(part) for part in hhmm.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=ZONE).astimezone(UTC)


YEAR_STARTS = date(2026, 8, 1)
YEAR_ENDS = date(2027, 7, 31)

#: (key, class key, name, kind, invite_only, age_min, age_max, [(weekday, start, end)])
GROUPS: tuple[
    tuple[str, str, str, str, bool, int | None, int | None, list[tuple[int, str, str]]], ...
] = (
    (
        "gozalim",
        "judo",
        "גוזלים",
        "base",
        False,
        4,
        6,
        [(0, "16:00", "16:45"), (3, "16:00", "16:45")],
    ),
    (
        "juniors",
        "judo",
        "ג'וניורים",
        "base",
        False,
        6,
        9,
        [(0, "17:00", "18:00"), (3, "17:00", "18:00")],
    ),
    ("noar", "judo", "נוער", "base", False, 9, 13, [(1, "17:30", "18:45"), (4, "17:30", "18:45")]),
    (
        "bogrim",
        "judo",
        "בוגרים",
        "base",
        False,
        13,
        None,
        [(2, "19:00", "20:30"), (4, "19:00", "20:30")],
    ),
    (
        "nivheret",
        "judo",
        "נבחרת",
        "base",
        True,
        9,
        None,
        [(2, "17:30", "19:00"), (5, "10:00", "12:00")],
    ),
)

CLASSES: tuple[tuple[str, str, str], ...] = (
    ("judo", "ג'ודו", "judo"),
    ("karate", "קראטה", "karate"),
)


def seed_structure(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M2 — two classes, five groups with schedules, a hall, the year and its closures."""
    session.add(
        Location(
            id=_did("location", "main"),
            studio_id=studio_id,
            name="אולם ראשי",
            address="רחוב הספורט 12",
        )
    )

    for key, name, discipline in CLASSES:
        session.add(
            Class(id=_did("class", key), studio_id=studio_id, name=name, discipline=discipline)
        )
    session.flush()

    for key, class_key, name, kind, invite_only, age_min, age_max, rules in GROUPS:
        session.add(
            Group(
                id=_did("group", key),
                studio_id=studio_id,
                class_id=_did("class", class_key),
                name=name,
                kind=kind,
                is_invite_only=invite_only,
                age_min=age_min,
                age_max=age_max,
            )
        )
        session.flush()
        for weekday, starts, ends in rules:
            session.add(
                GroupScheduleRule(
                    studio_id=studio_id,
                    group_id=_did("group", key),
                    weekday=weekday,
                    start_time=time.fromisoformat(starts),
                    end_time=time.fromisoformat(ends),
                    location_id=_did("location", "main"),
                    effective_from=YEAR_STARTS,
                )
            )

    session.add(
        TrainingYear(
            id=_did("year", "2026"),
            studio_id=studio_id,
            name='תשפ"ז 2026–2027',
            starts_on=YEAR_STARTS,
            ends_on=YEAR_ENDS,
            status="active",
        )
    )
    session.flush()
    for closure_key, frm, to, reason in (
        ("sukkot", date(2026, 10, 5), date(2026, 10, 12), "סוכות"),
        ("pesach", date(2027, 4, 21), date(2027, 4, 28), "פסח"),
    ):
        session.add(
            StudioClosure(
                id=_did("closure", closure_key),
                studio_id=studio_id,
                training_year_id=_did("year", "2026"),
                date_from=frm,
                date_to=to,
                reason=reason,
                source="holiday_preset",
            )
        )
    session.flush()


FIRST_NAMES = (
    "נועם",
    "איתי",
    "יהונתן",
    "דניאל",
    "אורי",
    "עומר",
    "אריאל",
    "לביא",
    "איתן",
    "רז",
    "מאיה",
    "טליה",
    "נועה",
    "אביגיל",
    "שירה",
    "יעל",
    "רוני",
    "אלה",
    "תמר",
    "ליה",
)
FAMILY_NAMES = (
    "כהן",
    "לוי",
    "מזרחי",
    "פרץ",
    "ביטון",
    "אברהם",
    "פרידמן",
    "דהן",
    "אזולאי",
    "גבאי",
    "שפירא",
    "עמר",
    "בן דוד",
    "רוזן",
    "חדד",
)

#: The persona-linked children adopt the EXACT ids the personas layer already points at.
PERSONA_CHILDREN: tuple[tuple[str, int, str, str], ...] = (
    ("parent3", 0, "דנה", "juniors"),
    ("parent3", 1, "יוסי", "noar"),
    ("parent3", 2, "נעמי", "gozalim"),
    ("parent1", 0, "עמית", "juniors"),
    ("both", 0, "גיא", "noar"),
    ("both", 1, "הילה", "bogrim"),
    ("trial", 0, "אלון", "juniors"),
)

GROUP_KEYS = ("gozalim", "juniors", "noar", "bogrim", "nivheret")


def _birthdate_for(group_key: str, rng: random.Random) -> date:
    lows = {"gozalim": 4, "juniors": 6, "noar": 9, "bogrim": 13, "nivheret": 10}
    highs = {"gozalim": 6, "juniors": 9, "noar": 13, "bogrim": 17, "nivheret": 16}
    age = rng.randint(lows[group_key], highs[group_key])
    return date(2026 - age, rng.randint(1, 12), rng.randint(1, 28))


def seed_students(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M3 — the roster: ~40 children, enrollments, one trial booking, one lead.

    The persona children take `persona_student_id(...)` so §19.3's parent personas open
    the family screens onto real children; everyone else gets a plain parent Person with
    a Guardian link, same shape the real product creates.
    """
    rng = random.Random(_SEED)

    def add_student(
        student_id: uuid.UUID,
        first: str,
        family: str,
        group_key: str | None,
        *,
        status: str,
        guardian_person: uuid.UUID | None,
    ) -> None:
        person = Person(
            id=_did("student-person", str(student_id)),
            studio_id=studio_id,
            first_name=first,
            last_name=family,
            locale="he",
            created_at=SEEDED_AT,
        )
        session.add(person)
        # One flush per dependency hop, explicitly: this codebase maps without
        # relationship()s, and a shared flush proved willing to insert a student before
        # its person (and an enrollment before its student). A seed can afford the
        # round-trips; silence about ordering cannot be afforded anywhere.
        session.flush()
        session.add(
            Student(
                id=student_id,
                studio_id=studio_id,
                person_id=person.id,
                status=status,
                health_status="missing",
                joined_on=YEAR_STARTS + timedelta(days=rng.randint(0, 20)),
            )
        )
        session.flush()
        if guardian_person is not None:
            session.add(
                Guardian(
                    studio_id=studio_id,
                    student_id=student_id,
                    person_id=guardian_person,
                    is_primary=True,
                    relation="parent",
                    created_at=SEEDED_AT,
                )
            )
        if group_key is not None and status in ("active", "trial"):
            session.add(
                Enrollment(
                    studio_id=studio_id,
                    student_id=student_id,
                    group_id=_did("group", group_key),
                    status="active",
                    started_on=YEAR_STARTS,
                )
            )

    # -- the persona children: their Guardian rows already exist (personas layer) -------
    for persona_key, index, first, group_key in PERSONA_CHILDREN:
        add_student(
            persona_student_id(persona_key, index),
            first,
            {"parent3": "הורה", "parent1": "לוי", "both": "כפול", "trial": "ניסיון"}[persona_key],
            group_key,
            status="trial" if persona_key == "trial" else "active",
            guardian_person=None,
        )

    # -- one open trial booking, for the funnel screens ---------------------------------
    session.add(
        TrialBooking(
            id=_did("trial-booking", "alon"),
            studio_id=studio_id,
            student_id=persona_student_id("trial", 0),
            group_id=_did("group", "juniors"),
            booked_at=now() - timedelta(days=2),
            attended=None,
        )
    )

    # -- ~33 more families --------------------------------------------------------------
    counter = 0
    for family in FAMILY_NAMES[:11]:
        children = 3 if counter % 4 == 0 else 2 if counter % 2 == 0 else 1
        parent = Person(
            id=_did("parent", f"{family}-{counter}"),
            studio_id=studio_id,
            first_name=rng.choice(FIRST_NAMES),
            last_name=family,
            locale="he",
            created_at=SEEDED_AT,
        )
        session.add(parent)
        for child_index in range(children):
            group_key = GROUP_KEYS[counter % len(GROUP_KEYS)]
            add_student(
                _did("student", f"{family}-{counter}-{child_index}"),
                FIRST_NAMES[(counter * 3 + child_index) % len(FIRST_NAMES)],
                family,
                group_key,
                status="active",
                guardian_person=parent.id,
            )
            counter += 1

    # -- one lead: a phone enquiry the manager typed in, no enrollment yet --------------
    lead_parent = Person(
        id=_did("parent", "lead"),
        studio_id=studio_id,
        first_name="סיגל",
        last_name="ברק",
        locale="he",
        created_at=SEEDED_AT,
    )
    session.add(lead_parent)
    add_student(
        _did("student", "lead"), "עידן", "ברק", None, status="lead", guardian_person=lead_parent.id
    )
    session.flush()


def _all_students(session: OrmSession, studio_id: uuid.UUID) -> list[Student]:
    return list(session.execute(select(Student).where(Student.studio_id == studio_id)).scalars())


def seed_health(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M4 — the roster's declarations: most signed, the trial child trial-signed, and a
    visible handful missing so `4e` and the reminders have something to chase."""
    rng = random.Random(_SEED + 4)
    full = (
        session.execute(
            select(HealthFormTemplate).where(
                HealthFormTemplate.studio_id == studio_id,
                HealthFormTemplate.kind == "full",
            )
        )
        .scalars()
        .first()
    )
    trial = (
        session.execute(
            select(HealthFormTemplate).where(
                HealthFormTemplate.studio_id == studio_id,
                HealthFormTemplate.kind == "trial",
            )
        )
        .scalars()
        .first()
    )
    if full is None or trial is None:  # the templates layer always runs first
        return

    for student in _all_students(session, studio_id):
        guardian = (
            session.execute(
                select(Guardian).where(
                    Guardian.studio_id == studio_id, Guardian.student_id == student.id
                )
            )
            .scalars()
            .first()
        )
        if guardian is None:
            continue
        if student.status == "trial":
            template, health_status = trial, "trial_signed"
        elif student.status == "lead" or rng.random() < 0.25:
            continue  # stays `missing`
        else:
            template, health_status = full, "signed"
        session.add(
            HealthDeclaration(
                id=_did("declaration", str(student.id)),
                studio_id=studio_id,
                student_id=student.id,
                template_id=template.id,
                template_version=template.version,
                answers_encrypted={"demo": True, "answers": {}},
                derived_flags=[],
                signed_by_person_id=guardian.person_id,
                signed_at=SEEDED_AT,
                valid_until=YEAR_ENDS,
            )
        )
        student.health_status = health_status
    session.flush()


def seed_attendance(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M5 — the sessions the rules call for (year start → three weeks out) and a term's
    partial attendance: mostly present, some absences, and a couple of sessions nobody
    marked, so 4c's `ממתין לסימון` card is never empty."""
    rng = random.Random(_SEED + 5)
    today = now().date()
    horizon = min(today + timedelta(days=21), YEAR_ENDS)
    closures = [
        (row.date_from, row.date_to)
        for row in session.execute(
            select(StudioClosure).where(StudioClosure.studio_id == studio_id)
        ).scalars()
    ]

    coach_person = (
        session.execute(
            select(Person).where(Person.studio_id == studio_id, Person.first_name == "רון")
        )
        .scalars()
        .first()
    )

    enrolled: dict[uuid.UUID, list[uuid.UUID]] = {}
    for row in session.execute(
        select(Enrollment).where(Enrollment.studio_id == studio_id, Enrollment.status == "active")
    ).scalars():
        enrolled.setdefault(row.group_id, []).append(row.student_id)

    mark_counter = 0
    for key, _class_key, _name, _kind, _invite, _lo, _hi, rules in GROUPS:
        group_id = _did("group", key)
        for weekday, starts, ends in rules:
            day = YEAR_STARTS
            while day <= horizon:
                # 0=Sunday, matching the column; a closure day simply has no session.
                if day.isoweekday() % 7 == weekday and not any(
                    frm <= day <= to for frm, to in closures
                ):
                    starts_at = _at(day, starts)
                    session_id = _did("session", f"{key}-{day.isoformat()}-{starts}")
                    session.add(
                        SessionRow(
                            id=session_id,
                            studio_id=studio_id,
                            group_id=group_id,
                            training_year_id=_did("year", "2026"),
                            starts_at=starts_at,
                            ends_at=_at(day, ends),
                            location_id=_did("location", "main"),
                            status="scheduled",
                        )
                    )
                    session.flush()  # the marks below point at this row
                    # The past gets marks — except roughly one session in eight,
                    # which stays unmarked on purpose.
                    if day < today and rng.random() > 0.12:
                        for student_id in enrolled.get(group_id, []):
                            roll = rng.random()
                            status = (
                                "present"
                                if roll < 0.85
                                else "absent_excused"
                                if roll < 0.93
                                else "absent_unexcused"
                            )
                            mark_counter += 1
                            session.add(
                                Attendance(
                                    studio_id=studio_id,
                                    session_id=session_id,
                                    student_id=student_id,
                                    status=status,
                                    source="coach",
                                    marked_by_person_id=coach_person.id if coach_person else None,
                                    marked_at=_at(day, ends),
                                    device_marked_at=_at(day, ends),
                                    client_mark_id=_did("mark", str(mark_counter)),
                                )
                            )
                day += timedelta(days=1)
    session.flush()


PLANS: tuple[tuple[str, str, int | None, int], ...] = (
    ("once", "אימון בשבוע", 1, 24_000),
    ("twice", "פעמיים בשבוע", 2, 32_000),
    ("open", "מנוי חופשי", None, 42_000),
)


def seed_money(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M6 — three plans, a settled month and an open one, a little honest debt, two
    unmatched IPNs for the reconciliation queue, and two shop items."""
    rng = random.Random(_SEED + 6)
    for key, name, per_week, amount in PLANS:
        session.add(
            PricePlan(
                id=_did("plan", key),
                studio_id=studio_id,
                name=name,
                sessions_per_week=per_week,
                monthly_amount_agorot=amount,
                registration_fee_agorot=15_000,
                active_from=YEAR_STARTS,
            )
        )
    for key, name, price, sizes in (
        ("gi", "חליפת ג'ודו", 18_000, ["120", "130", "140", "150", "160"]),
        ("belt", "חגורה", 4_000, []),
    ):
        session.add(
            Product(
                id=_did("product", key),
                studio_id=studio_id,
                name=name,
                description=None,
                price_agorot=price,
                sizes=sizes,
            )
        )
    session.flush()

    # -- tuition: August settled, September open, a few families genuinely behind -------
    payers: dict[uuid.UUID, list[Student]] = {}
    for student in _all_students(session, studio_id):
        if student.status != "active":
            continue
        guardian = (
            session.execute(
                select(Guardian).where(
                    Guardian.studio_id == studio_id, Guardian.student_id == student.id
                )
            )
            .scalars()
            .first()
        )
        if guardian is None:
            continue
        plan_key = PLANS[len(payers) % len(PLANS)][0]
        student.price_plan_id = _did("plan", plan_key)
        payers.setdefault(guardian.person_id, []).append(student)

    debtors = set(rng.sample(sorted(payers, key=str), k=max(2, len(payers) // 6)))
    for payer_id, children in payers.items():
        monthly = sum(
            next(
                amount for key, _n, _w, amount in PLANS if _did("plan", key) == child.price_plan_id
            )
            for child in children
        )
        august = Charge(
            id=_did("charge", f"{payer_id}-2026-08"),
            studio_id=studio_id,
            payer_person_id=payer_id,
            student_id=children[0].id,
            kind="tuition",
            period_year=2026,
            period_month=8,
            amount_agorot=monthly,
            due_date=date(2026, 8, 10),
            created_by="billing_run",
        )
        session.add(august)
        session.add(
            Charge(
                id=_did("charge", f"{payer_id}-2026-09"),
                studio_id=studio_id,
                payer_person_id=payer_id,
                student_id=children[0].id,
                kind="tuition",
                period_year=2026,
                period_month=9,
                amount_agorot=monthly,
                due_date=date(2026, 9, 10),
                created_by="billing_run",
            )
        )
        if payer_id in debtors:
            continue  # August stays open and overdue — the ladder needs someone to climb
        payment = Payment(
            id=_did("payment", f"{payer_id}-2026-08"),
            studio_id=studio_id,
            payer_person_id=payer_id,
            method=rng.choice(["cash", "standing_order", "bank_transfer", "cheque"]),
            amount_agorot=monthly,
            received_at=_at(date(2026, 8, rng.randint(3, 9)), "10:00"),
        )
        session.add(payment)
        session.add(
            PaymentAllocation(
                studio_id=studio_id,
                payment_id=payment.id,
                charge_id=august.id,
                amount_agorot=monthly,
            )
        )
        august.status = "settled"

    # -- the reconciliation queue's two riddles -----------------------------------------
    riddles: tuple[tuple[str, str | None], ...] = (("320.00", "משה כהן"), ("410.50", None))
    for index, (ipn_amount, owner_name) in enumerate(riddles):
        session.add(
            UpayIpnRecord(
                id=_did("ipn", str(index)),
                studio_id=studio_id,
                received_at=now() - timedelta(days=3 + index),
                raw_query=f"transactionid=demo-{index}&Amount={ipn_amount}",
                transactionid=f"demo-{index}",
                amount=ipn_amount,
                card_owner_name=owner_name,
                match_status="unmatched",
            )
        )
    session.flush()


def seed_belts(session: OrmSession, studio_id: uuid.UUID) -> None:
    """M7 — the two ladders from their presets, a first award for most of the roster,
    one completed belt exam with results, and one upcoming competition."""
    rng = random.Random(_SEED + 7)
    for class_key, preset in (("judo", JUDO_CHILDREN), ("karate", KARATE)):
        for rank in preset.ranks:
            session.add(
                BeltRank(
                    id=_did("rank", f"{class_key}-{rank.order_index}"),
                    studio_id=studio_id,
                    class_id=_did("class", class_key),
                    name=rank.name,
                    kyu=rank.kyu,
                    order_index=rank.order_index,
                    color_hex=rank.color_hex,
                    secondary_color_hex=rank.secondary_color_hex,
                )
            )
    session.flush()

    exam = Event(
        id=_did("event", "exam"),
        studio_id=studio_id,
        type="belt_exam",
        title="מבחן חגורות קיץ",
        starts_at=_at(date(2026, 8, 20), "17:00"),
        ends_at=_at(date(2026, 8, 20), "19:00"),
        location_text="אולם ראשי",
        status="completed",
    )
    competition = Event(
        id=_did("event", "competition"),
        studio_id=studio_id,
        type="competition",
        title="אליפות המחוז",
        starts_at=_at(date(2026, 9, 25), "09:00"),
        ends_at=_at(date(2026, 9, 25), "15:00"),
        location_text="היכל הספורט, ראשון לציון",
        rsvp_deadline=_at(date(2026, 9, 18), "20:00"),
        fee_agorot=8_000,
        status="published",
    )
    session.add_all([exam, competition])
    session.flush()

    first_rank = _did("rank", "judo-1")
    second_rank = _did("rank", "judo-2")
    examined = 0
    for student in _all_students(session, studio_id):
        if student.status != "active" or rng.random() < 0.2:
            continue
        session.add(
            StudentBelt(
                studio_id=studio_id,
                student_id=student.id,
                belt_rank_id=first_rank,
                awarded_on=date(2026, 8, 3),
            )
        )
        student.current_belt_id = first_rank
        if examined < 6:
            examined += 1
            session.add(
                EventExamResult(
                    studio_id=studio_id,
                    event_id=exam.id,
                    student_id=student.id,
                    belt_rank_id=second_rank,
                    result="pass",
                )
            )
            session.add(
                StudentBelt(
                    studio_id=studio_id,
                    student_id=student.id,
                    belt_rank_id=second_rank,
                    awarded_on=date(2026, 8, 20),
                    event_id=exam.id,
                )
            )
            student.current_belt_id = second_rank
    session.flush()
