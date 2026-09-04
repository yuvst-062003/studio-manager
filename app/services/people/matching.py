"""§5.4a's matching. L7: a match is made on a **verified** email or phone, or not at all.

**Why verification is the whole rule.** Approving a request attaches children to the
matched Person, and that Person's app then shows them. If an unverified address were
enough, submitting somebody else's email would put your children in their app -- or,
worse, put theirs in yours. The submitted address is not evidence; the address on a
signed-in identity is.

`person.email` alone is therefore never a key. A manager typing a parent's address into
`+ תלמיד חדש` creates a Person carrying an unverified address, and that address's job is
to be what the INVITATION is sent to (§5.3) -- a mechanism with a token in it, which is
exactly the verification this module refuses to assume.

Phone verification has no provider in v1 (§5.2 is Google and Apple only), so a phone is a
key only when it sits on a Person whose identity signed in. That is narrower than §5.4a's
sentence and deliberately so: the alternative is trusting a string.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Person
from app.services.people.naming import format_person_name

#: E.164 without the plus. Israel is the club's country, so a leading 0 means +972.
_IL_COUNTRY_CODE = "972"
_DIGITS = re.compile(r"\D+")
#: Shorter than this is not a phone number, and a two-digit "phone" would match half the
#: club. Longer than E.164's 15 is not one either.
_MIN_DIGITS, _MAX_DIGITS = 7, 15


@dataclass(frozen=True)
class PersonMatch:
    person_id: uuid.UUID
    #: `"email"` or `"phone"`. Rendered in the queue so the manager can see WHAT matched
    #: before they agree to it (§5.4a's `request.matchedHint`).
    matched_on: str
    display_name: str


@dataclass(frozen=True)
class ChildMatch:
    student_id: uuid.UUID
    display_name: str
    birthdate: date | None


def normalize_phone(raw: str | None) -> str | None:
    """Digits only, in E.164 without the plus, or None if this is not a phone number."""
    if not raw:
        return None
    had_plus = raw.strip().startswith("+")
    digits = _DIGITS.sub("", raw)
    if not digits:
        return None
    if not had_plus and digits.startswith("0"):
        digits = _IL_COUNTRY_CODE + digits[1:]
    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        return None
    return digits


def match_person(
    session: Session,
    *,
    email: str | None = None,
    phone: str | None = None,
) -> PersonMatch | None:
    """§5.4a's person matching. Email first, then phone; None is the common case.

    Runs under the caller's `TenantSession`, so it can only ever see one studio. That is
    the correct scope: §3.3 lets one identity be a parent at two clubs, and each club's
    queue is answering a question about its own families.
    """
    if email:
        # The join is the rule: an address is a key only when an identity that signed in
        # carries it AND the provider said it was verified.
        row = (
            session.execute(
                select(Person)
                .join(AuthIdentity, Person.auth_identity_id == AuthIdentity.id)
                .where(
                    Person.anonymized_at.is_(None),
                    AuthIdentity.email == email,
                    AuthIdentity.email_verified.is_(True),
                    # §5.2 -- 'Apple private-relay addresses are stored as-is and never
                    # used for matching.'
                    AuthIdentity.is_private_relay.is_(False),
                )
                .order_by(Person.created_at)
            )
            .scalars()
            .first()
        )
        if row is not None:
            return PersonMatch(
                person_id=row.id,
                matched_on="email",
                display_name=format_person_name(row.first_name, row.last_name),
            )

    normalized = normalize_phone(phone)
    if normalized:
        # No phone-verification provider exists (§5.2), so the proxy for "verified" is
        # "this Person has a login". A pre-created Person's phone is a manager's typing.
        candidates = (
            session.execute(
                select(Person).where(
                    Person.anonymized_at.is_(None),
                    Person.auth_identity_id.is_not(None),
                    Person.phone.is_not(None),
                )
            )
            .scalars()
            .all()
        )
        for row in candidates:
            if normalize_phone(row.phone) == normalized:
                return PersonMatch(
                    person_id=row.id,
                    matched_on="phone",
                    display_name=format_person_name(row.first_name, row.last_name),
                )
    return None


def match_children(
    session: Session,
    *,
    first_name: str,
    last_name: str,
    birthdate: date | None,
) -> list[ChildMatch]:
    """§5.4a's duplicate-child detection.

    Name first, birthdate as a narrowing signal rather than a requirement -- `birthdate`
    is nullable on `person`, and a club that never recorded one still deserves the
    warning. A candidate whose birthdate is on file and differs is dropped: two children
    with the same name and different birthdays are two children.

    Returns a list and never merges anything. §5.4a is explicit that the manager sees a
    warning and decides; two siblings really can share a birthday, and the club knows that
    and we do not.
    """
    rows = session.execute(
        select(Student, Person)
        .join(Person, Student.person_id == Person.id)
        .where(
            Person.anonymized_at.is_(None),
            Person.first_name == first_name.strip(),
            Person.last_name == last_name.strip(),
        )
    ).all()
    return [
        ChildMatch(
            student_id=student.id,
            display_name=format_person_name(person.first_name, person.last_name),
            birthdate=person.birthdate,
        )
        for student, person in rows
        if person.birthdate is None or birthdate is None or person.birthdate == birthdate
    ]


def duplicate_student(
    session: Session,
    *,
    first_name: str,
    last_name: str,
    birthdate: date | None,
) -> ChildMatch | None:
    """The one child a self-service write would duplicate, or None.

    **This is the one genuinely valuable thing the approval queue did**, moved to where
    parents actually are. `match_children` above has run since M3 on the registration-request
    detail view — a screen whose sole producer was removed when `+ הוסף ילד` started enrolling
    directly — so from that day a parent adding a child the club already had created a second
    student for them, silently.

    A WARNING is the right shape for a manager reading a queue and a refusal is the right
    shape here, because there is no manager: accepting produces two students for one child,
    which only the office can undo and which nothing on either screen reveals.

    Same rule as `match_children`, single-valued: name equal, and a birthdate on file that
    differs is what makes two same-named children two children. A candidate with no birthdate
    recorded still matches, because a club that never recorded one has the names as its
    strongest signal and a duplicate is the more expensive mistake.
    """
    matches = match_children(
        session, first_name=first_name, last_name=last_name, birthdate=birthdate
    )
    return matches[0] if matches else None
