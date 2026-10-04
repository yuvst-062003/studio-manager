#!/usr/bin/env python
"""Load a club's roster into one studio, through the import's own service calls.

The owner's decision of 2026-10-04: Gladiator's roster goes into production directly, not
through the dashboard's upload screen. This is that door, and it is deliberately the SAME
two calls the file import makes for each row (`web/.../import/run.ts`):

  1. `StudentService.create` -- with `contact_pending=True`, because the office kept no
     parent and no contact for anyone: the child is created with nobody attached and the
     manager adds each family from the student card afterwards;
  2. `StudentService.convert` -- the group, the plan, and the method the family already paid
     by, dated TODAY. Never a date from the file: a conversion raises its first charge on its
     start date, and a past one would raise back months. (With no guardian it raises nothing
     at all -- the owner's "no charges yet", relied on and tested in
     `tests/people/test_contact_pending.py`.)

Nothing is emailed, pushed or invited: there is nobody to send to, and `create` mints no
invitation for a contact-pending child.

**The dataset never enters the repository.** It is a JSON file the operator writes from the
club's spreadsheet into a scratch directory -- children's names are personal data about
minors -- shaped as::

    {"rows": [{"line": 2, "first_name": "...", "last_name": "...", "group": "קבוצה 1",
               "plan": "פעמיים בשבוע" | null, "payment": "cash" | "cheque" |
               "standing_order" | null}]}

and this script prints **line numbers and counts only**, never a name.

Usage, against an environment's database (the runtime role is enough)::

    .venv/bin/python scripts/load-roster.py --data roster.json --studio-slug <slug>
    .venv/bin/python scripts/load-roster.py --data roster.json --studio-slug <slug> \
        --apply --confirm-studio-id <id printed by the dry run>

Dry run is the default and writes nothing. `--apply` demands the studio id the dry run
printed, so the write lands in the studio the owner confirmed and no other.

**Idempotent.** A row whose trimmed first + last name already has an enrollment in the same
group of this studio is reported as already loaded and skipped, so a second run creates
nothing. Two children who share a first name in different groups are two rows, which is
the case the file actually has.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.core.clock import now  # noqa: E402
from app.core.db import get_engine  # noqa: E402
from app.core.tenancy import TenantSession, use_studio, with_all_tenants  # noqa: E402
from app.models.billing import PricePlan  # noqa: E402
from app.models.people import Enrollment, Student  # noqa: E402
from app.models.person import Person, RoleAssignment  # noqa: E402
from app.models.structure import Group  # noqa: E402
from app.models.studio import Studio  # noqa: E402
from app.services.people.students import StudentService  # noqa: E402
from app.services.schedule.service import ScheduleService  # noqa: E402
from sqlalchemy import select  # noqa: E402

_SCOPE = "scripts/load-roster.py -- resolving the target studio by slug before scoping to it"
_METHODS = {"cash", "cheque", "standing_order"}


@dataclass
class Planned:
    line: int
    action: str  # create | skip
    reason: str = ""
    group_id: uuid.UUID | None = None
    group_name: str = ""
    plan_id: uuid.UUID | None = None
    payment: str | None = None
    first_name: str = ""
    last_name: str = ""


def _key(value: str) -> str:
    return " ".join(value.replace("׳", "'").split()).lower()


def find_studio(session: TenantSession, slug: str) -> Studio | None:
    with with_all_tenants(reason=_SCOPE):
        return session.execute(select(Studio).where(Studio.slug == slug)).scalar_one_or_none()


def studio_owner(session: TenantSession) -> uuid.UUID | None:
    """The studio's live owner, who the audit rows name as the actor -- the person on whose
    behalf this load is run, never a platform hatch."""
    return session.execute(
        select(RoleAssignment.person_id).where(
            RoleAssignment.role == "owner", RoleAssignment.revoked_at.is_(None)
        )
    ).scalar_one_or_none()


def plan_rows(session: TenantSession, rows: list[dict[str, Any]], today: date) -> list[Planned]:
    groups = session.execute(select(Group).where(Group.is_active.is_(True))).scalars().all()
    plans = (
        session.execute(
            select(PricePlan).where(
                PricePlan.active_from <= today,
                (PricePlan.active_to.is_(None)) | (PricePlan.active_to >= today),
            )
        )
        .scalars()
        .all()
    )
    loaded = {
        (_key(first), _key(last), group_id)
        for first, last, group_id in session.execute(
            select(Person.first_name, Person.last_name, Enrollment.group_id)
            .join(Student, Student.person_id == Person.id)
            .join(Enrollment, Enrollment.student_id == Student.id)
        )
    }

    planned: list[Planned] = []
    seen: set[tuple[str, str, uuid.UUID]] = set()
    for row in rows:
        line = int(row["line"])
        first = (row.get("first_name") or "").strip()
        last = (row.get("last_name") or "").strip()
        out = Planned(line=line, action="skip", first_name=first, last_name=last)
        planned.append(out)
        if not first:
            out.reason = "no first name"
            continue
        group_matches = [
            g for g in groups if g.kind == "base" and _key(g.name) == _key(row.get("group") or "")
        ]
        if len(group_matches) != 1:
            out.reason = f"group matched {len(group_matches)} active base groups"
            continue
        group = group_matches[0]
        out.group_id = group.id
        out.group_name = group.name

        if row.get("plan"):
            plan_matches = [
                p
                for p in plans
                if _key(p.name) == _key(row["plan"]) and p.class_id in (None, group.class_id)
            ]
            # A plan named for the group's own class wins over a studio-wide namesake.
            own = [p for p in plan_matches if p.class_id == group.class_id]
            plan_matches = own or plan_matches
            if len(plan_matches) != 1:
                out.reason = f"plan matched {len(plan_matches)} live plans"
                continue
            out.plan_id = plan_matches[0].id

        payment = row.get("payment")
        if payment is not None and payment not in _METHODS:
            out.reason = "unknown payment method"
            continue
        out.payment = payment

        key = (_key(first), _key(last), group.id)
        if key in loaded:
            out.reason = "already loaded"
            continue
        if key in seen:
            out.reason = "duplicate of an earlier line in this file"
            continue
        seen.add(key)
        out.action = "create"
    return planned


def apply(session: TenantSession, planned: list[Planned], actor: uuid.UUID) -> int:
    schedule = ScheduleService(session)
    at = now()
    created = 0
    for row in planned:
        if row.action != "create":
            continue
        assert row.group_id is not None
        student = StudentService.create(
            session,
            first_name=row.first_name,
            # `person.last_name` is NOT NULL; the by-hand form and the import send a lone
            # space for a name typed without one, never a surname nobody wrote.
            last_name=row.last_name or " ",
            birthdate=None,
            guardian_first_name=None,
            guardian_last_name=None,
            guardian_email=None,
            guardian_phone=None,
            at=at,
            actor_person_id=actor,
            source="manager",
            contact_pending=True,
        ).student
        StudentService.convert(
            session,
            student_id=student.id,
            group_id=row.group_id,
            started_on=at.date(),
            price_plan_id=row.plan_id,
            attends_weekdays=None,
            reason="club roster load, 2026-10-04",
            at=at,
            actor_person_id=actor,
            schedule=schedule,
            payment_received=row.payment,
        )
        # One commit per child, as the import's one request per row: a failure halfway
        # leaves every earlier child whole, and the re-run skips them.
        session.commit()
        created += 1
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data", required=True, type=pathlib.Path)
    parser.add_argument("--studio-slug", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-studio-id")
    args = parser.parse_args()

    rows = json.loads(args.data.read_text(encoding="utf-8"))["rows"]
    with TenantSession(bind=get_engine(), expire_on_commit=False) as lookup:
        studio = find_studio(lookup, args.studio_slug)
    if studio is None:
        print(f"no studio with slug {args.studio_slug!r}")
        return 2
    print(f"studio: {studio.name} · id {studio.id} · demo={studio.is_demo}")

    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        actor = studio_owner(s)
        if actor is None:
            print("the studio has no live owner to act as")
            return 2
        planned = plan_rows(s, rows, now().date())
        for row in planned:
            detail = row.reason or (
                f"group {row.group_name} · plan {row.plan_id or '—'} · paid {row.payment or '—'}"
            )
            print(f"line {row.line:>3}  {row.action:<6}  {detail}")
        counts = Counter(row.action for row in planned)
        by_group = Counter(row.group_name for row in planned if row.action == "create")
        no_plan = [row.line for row in planned if row.action == "create" and row.plan_id is None]
        print(f"rows {len(planned)} · create {counts['create']} · skip {counts['skip']}")
        print(f"create per group: {dict(by_group)}")
        print(f"created without a plan: lines {no_plan}")

        if not args.apply:
            print("dry run -- nothing written")
            return 0
        if args.confirm_studio_id != str(studio.id):
            print("--apply needs --confirm-studio-id matching the studio above")
            return 2
        created = apply(s, planned, actor)
        print(f"applied -- {created} students created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
