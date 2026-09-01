#!/usr/bin/env python3
"""Seed guardian contact fields from the duplicated child copies.

The parent-onboarding redesign stops writing address, city, home phone, mobile and email
onto each child's `person` row. This one-time data move copies the most recently updated
child value for each guardian and prints every family where sibling copies disagreed.

Default is a dry run. Use `--apply` to write the guardian rows.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.core.tenancy import TenantSession, use_studio  # noqa: E402
from app.models.people import Student  # noqa: E402
from app.models.person import Guardian, Person  # noqa: E402
from app.models.studio import Studio  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

FIELDS = ("address", "city", "phone_home", "phone", "email")


@dataclass(frozen=True)
class Candidate:
    value: str
    updated_at: Any
    child_name: str


def _pick(candidates: list[Candidate]) -> Candidate | None:
    useful = [candidate for candidate in candidates if candidate.value.strip()]
    if not useful:
        return None
    return max(useful, key=lambda candidate: candidate.updated_at)


def _seed_studio(session: TenantSession, *, apply: bool, writer: csv.DictWriter) -> int:
    writes = 0
    guardians = session.execute(select(Guardian).order_by(Guardian.person_id)).scalars().all()
    by_person: dict[Any, list[Guardian]] = defaultdict(list)
    for guardian in guardians:
        by_person[guardian.person_id].append(guardian)

    for guardian_person_id, rows in by_person.items():
        guardian_person = session.get(Person, guardian_person_id)
        if guardian_person is None:
            continue

        candidates: dict[str, list[Candidate]] = {field: [] for field in FIELDS}
        for guardian in rows:
            student = session.get(Student, guardian.student_id)
            child = session.get(Person, student.person_id) if student else None
            if child is None or child.id == guardian_person.id:
                continue
            child_name = f"{child.first_name} {child.last_name}".strip()
            for field in FIELDS:
                value = str(getattr(child, field) or "").strip()
                if value:
                    candidates[field].append(Candidate(value, child.updated_at, child_name))

        changed = False
        for field, options in candidates.items():
            winner = _pick(options)
            if winner is None:
                continue
            distinct = sorted({option.value for option in options})
            if len(distinct) > 1:
                guardian_name = f"{guardian_person.first_name} {guardian_person.last_name}"
                writer.writerow(
                    {
                        "studio_id": guardian_person.studio_id,
                        "guardian_person_id": guardian_person.id,
                        "guardian_name": guardian_name,
                        "field": field,
                        "winning_value": winner.value,
                        "winning_child": winner.child_name,
                        "values_seen": " | ".join(distinct),
                    }
                )
            if getattr(guardian_person, field) != winner.value:
                changed = True
                if apply:
                    setattr(guardian_person, field, winner.value)
        if changed:
            writes += 1

    if apply:
        session.flush()
    return writes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write guardian rows")
    args = parser.parse_args()

    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 10})
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=[
            "studio_id",
            "guardian_person_id",
            "guardian_name",
            "field",
            "winning_value",
            "winning_child",
            "values_seen",
        ],
    )
    writer.writeheader()

    total = 0
    with Session(bind=engine) as plain:
        studio_ids = plain.execute(select(Studio.id).order_by(Studio.id)).scalars().all()

    for studio_id in studio_ids:
        with use_studio(studio_id), TenantSession(bind=engine, expire_on_commit=False) as scoped:
            total += _seed_studio(scoped, apply=args.apply, writer=writer)
            if args.apply:
                scoped.commit()
            else:
                scoped.rollback()

    print(f"# guardian rows {'updated' if args.apply else 'that would be updated'}: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
