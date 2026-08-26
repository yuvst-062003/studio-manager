"""§5.8's three-way tie: the RSVP, the consent, and the fee that becomes a charge.

**The seam is asserted by how it is CALLED, not by what it returns.** `create_charge` is
still `NotImplementedError` on `main` -- lane MONEY fills it in -- so every test here
substitutes a recording double and asserts the call shape. That is the stronger assertion
anyway: `student_id` and `event_id` are keyword-only precisely because both are
`UUID | None` in adjacent positions, so a positional call would bind an event id to
`student_id` and no type checker would see it. A test that only checked a return value
would pass on exactly that bug.

The double is a real class with the real signature rather than a `MagicMock`, for the same
reason: a mock accepts a positional `event_id` happily, which is the one mistake this seam
was shaped to make unspellable.

**Confirmation is derived, not stored** (§5.8): an RSVP does not count as confirmed until
the parent signs, so `rsvp='yes'` is always recorded and the charge waits for the pair.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

import pytest
from app.models.billing import Charge
from app.models.events import Event
from app.models.health import ConsentRecord
from app.models.people import Enrollment, Student
from app.models.person import Person
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.events.conftest import EVENT_FEE_AGOROT, T0, YEAR_STARTS


@dataclass
class RecordingBilling:
    """A stand-in for `BillingService` with `create_charge`'s real signature.

    Keyword-only `student_id` and `event_id`, exactly as the contract declares them: a
    positional call raises `TypeError` here, in the test, where it is visible. A
    `MagicMock` would accept one happily, which is the single mistake this seam was shaped
    to make unspellable.

    **It writes a real `charge` row, and that is not this lane writing a billing table.**
    It is the double doing what the method it replaces does.
    `fk_event_registration_charge_id_charge` means Postgres rejects a fabricated id, so a
    double that returned one could never prove `charge_id` is persisted at all -- and that
    is the guarantee worth having. The rule the plan states is about M7's production code,
    and `app/services/events/**` still contains no billing write: `tests/events/conftest.py`
    is still free of any charge fixture, and `a_registered_student` still starts null.

    The row is deliberately minimal -- the columns `charge` cannot be inserted without.
    Nothing here models M6's proration, its idempotency key or its status derivation. When
    lane MONEY lands, this double is deleted rather than kept in step with it.
    """

    session: Session
    calls: list[dict] = field(default_factory=list)

    def create_charge(
        self,
        studio_id: uuid.UUID,
        payer_person_id: uuid.UUID,
        kind: str,
        amount_agorot: int,
        due_date: date,
        *,
        student_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
    ) -> Charge:
        self.calls.append(
            {
                "studio_id": studio_id,
                "payer_person_id": payer_person_id,
                "kind": kind,
                "amount_agorot": amount_agorot,
                "due_date": due_date,
                "student_id": student_id,
                "event_id": event_id,
            }
        )
        row = Charge(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            student_id=student_id,
            kind=kind,
            amount_agorot=amount_agorot,
            due_date=due_date,
            status="open",
            created_by="event",
        )
        # Its own session, committed immediately: the row has to exist before the request's
        # flush writes `charge_id` and Postgres checks the foreign key.
        self.session.add(row)
        self.session.commit()
        return row


@pytest.fixture
def billing(monkeypatch, app_session):
    double = RecordingBilling(session=app_session)
    monkeypatch.setattr("app.services.events.fees.BillingService", lambda: double, raising=True)
    return double


def test_a_guardian_answers_for_their_own_child(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["registration"]["rsvp"] == "yes"
    assert body["registration"]["responded_at"] is not None
    assert body["registration"]["responded_by_person_id"] == str(parent.person_id)


def test_a_guardian_cannot_answer_for_a_child_who_is_not_theirs(
    client, app_session, as_guardian_of, a_student, studio, an_event, a_registered_student, billing
):
    """§3.2 -- "own" in the guardian column always means only for my own children."""
    person = Person(studio_id=studio.id, first_name="זר", last_name="בודק")
    app_session.add(person)
    app_session.flush()
    other = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(other)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(other.id), "rsvp": "yes"},
    )
    assert response.status_code == 403


def test_yes_alone_does_not_confirm_when_the_event_wants_a_consent(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§5.8 -- "the guardian must sign the event's consent text before the RSVP counts as
    confirmed". `an_event` sets `requires_consent`, so the answer is recorded and NO charge
    is raised. `events.consent.blocksConfirmation` is the sentence; this is it in code."""
    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    ).json()
    assert body["registration"]["rsvp"] == "yes"
    assert body["confirmed"] is False
    assert body["registration"]["charge_id"] is None
    assert billing.calls == []


def test_signing_the_consent_completes_the_pair_and_raises_exactly_one_charge(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§5.8 -- "confirming attendance creates a `charge` with `kind='event'` for that
    student's payer". The fee is created on CONFIRMATION, so whichever of the two acts
    completes the pair is the one that fires the seam -- and it fires once."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    response = client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["registration"]["consent_signed_at"] is not None
    assert body["confirmed"] is True
    assert body["registration"]["charge_id"] is not None

    assert len(billing.calls) == 1
    call = billing.calls[0]
    assert call["kind"] == "event"
    assert call["amount_agorot"] == EVENT_FEE_AGOROT
    assert call["student_id"] == a_student
    assert call["event_id"] == uuid.UUID(str(an_event))
    assert call["payer_person_id"] == parent.person_id


def test_signing_first_and_answering_second_works_the_same_way(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """The other order. A parent may sign the form and answer later, and the pair is a
    pair either way -- so the charge must not depend on which act came first."""
    parent = as_guardian_of(a_student)
    signed = client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    ).json()
    assert signed["confirmed"] is False
    assert billing.calls == []

    answered = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    ).json()
    assert answered["confirmed"] is True
    assert len(billing.calls) == 1


def test_the_event_id_never_binds_to_student_id(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """The reason the seam is keyword-only. Both are `UUID | None` in adjacent positions,
    so positionally an event id binds happily to `student_id`. Asserted as the two values
    being DIFFERENT and each in its own slot -- a swap leaves every test above green."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    call = billing.calls[0]
    assert call["student_id"] != call["event_id"]
    assert call["student_id"] == a_student
    assert call["event_id"] == uuid.UUID(str(an_event))


def test_answering_repeatedly_does_not_raise_a_second_charge(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """`events.rsvp.change` exists -- a parent may change their answer. Answering yes
    twice must not bill the family twice, and `charge_id` already on the row is what says
    the fee has been raised."""
    parent = as_guardian_of(a_student)
    for _ in range(3):
        client.post(
            f"/api/v1/events/{an_event}/rsvp",
            headers=parent.headers,
            json={"student_id": str(a_student), "rsvp": "yes"},
        )
        client.post(
            f"/api/v1/events/{an_event}/consent",
            headers=parent.headers,
            json={"student_id": str(a_student)},
        )
    assert len(billing.calls) == 1


def test_a_free_event_confirms_with_no_charge_at_all(
    client, app_session, as_manager, as_guardian_of, a_student, a_group, studio, billing
):
    """`fee_agorot` NULL is a free event, and zero is not the same thing -- a zero-fee
    event would create a zero charge and a receipt for nothing
    (`app/schemas/events.py`)."""
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_student,
            group_id=a_group,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "seminar",
            "title": "סמינר חינם",
            "starts_at": T0.replace(day=26).isoformat(),
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    ).json()
    client.post(f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers)

    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{created['id']}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    ).json()
    assert body["registration"]["rsvp"] == "yes"
    assert body["confirmed"] is True
    assert body["registration"]["charge_id"] is None
    assert billing.calls == []


def test_declining_never_raises_a_charge(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "no"},
    ).json()
    assert body["registration"]["rsvp"] == "no"
    assert body["confirmed"] is False
    assert body["registration"]["charge_id"] is None
    assert billing.calls == []


def test_signing_writes_the_consent_ledger_row_too(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§11.6's ledger. `consent_record` carries `consent_type='event'` and was authored in
    `0007` for exactly this. It has no `event_id`, so it cannot say WHICH event --
    `event_registration.consent_signed_at` is the authoritative per-event fact, and this
    row is the completeness §11.6 asks for."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    rows = list(
        app_session.execute(
            select(ConsentRecord).where(
                ConsentRecord.subject_id == a_student,
                ConsentRecord.consent_type == "event",
            )
        ).scalars()
    )
    assert len(rows) == 1
    assert rows[0].granted is True
    assert rows[0].subject_type == "student"


def test_signing_twice_does_not_write_a_second_ledger_row(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§11.6 makes a withdrawal a new row, not an edit -- so a duplicate grant would be
    indistinguishable from a genuine re-grant after a revocation."""
    parent = as_guardian_of(a_student)
    for _ in range(2):
        client.post(
            f"/api/v1/events/{an_event}/consent",
            headers=parent.headers,
            json={"student_id": str(a_student)},
        )
    rows = list(
        app_session.execute(
            select(ConsentRecord).where(ConsentRecord.subject_id == a_student)
        ).scalars()
    )
    assert len(rows) == 1


def test_signing_a_consent_an_event_never_asked_for_is_refused(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """A ledger row about nothing. `requires_consent` is what makes the signature mean
    something, and without it there is no wording to have agreed to."""
    event = app_session.get(Event, an_event)
    event.requires_consent = False
    event.consent_text = None
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "consent_not_required"


def test_an_answer_after_the_deadline_is_refused(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """`events.rsvp.deadlinePassed` exists, and `7d`'s whole footer is a deadline."""
    event = app_session.get(Event, an_event)
    event.rsvp_deadline = T0.replace(hour=8)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "rsvp_deadline_passed"


def test_a_parent_sees_their_own_events_and_no_draft(
    client, as_guardian_of, a_student, an_event, a_registered_student
):
    """`GET /me/events` is `12h`. It resolves through `guardian`, and a draft never
    appears -- §4.3 makes a draft invisible to guardians, which is the whole reason drafts
    exist."""
    parent = as_guardian_of(a_student)
    response = client.get("/api/v1/me/events", headers=parent.headers)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert [row["event"]["id"] for row in rows] == [str(an_event)]
    assert all(row["event"]["status"] != "draft" for row in rows)
    # 7d puts the fee inside the parent's own confirm button. A parent who cannot see what
    # confirming costs is being asked to agree to an unnamed amount.
    assert rows[0]["event"]["fee_agorot"] == EVENT_FEE_AGOROT


def test_the_roster_is_readable_by_staff_and_carries_no_charge_for_a_coach(
    client, as_manager, as_assistant_coach, an_event, a_registered_student
):
    """`7c`'s participants table. §3.2's hard rule reaches the roster too: the payment
    column is M6's data on M7's screen, and a coach gets `charge_id = null`."""
    manager = client.get(f"/api/v1/events/{an_event}/registrations", headers=as_manager.headers)
    assert manager.status_code == 200, manager.text
    assert manager.json()["items"][0]["student_display_name"]

    coach = client.get(
        f"/api/v1/events/{an_event}/registrations", headers=as_assistant_coach.headers
    )
    assert coach.status_code == 200
    assert all(row["charge_id"] is None for row in coach.json()["items"])


def test_attendance_is_recorded_against_the_event_and_touches_no_charge(
    client, app_session, as_assistant_coach, a_student, an_event, a_registered_student
):
    """§5.8 -- "attendance is taken on an event with the same UI as a session". §3.2 gives
    every staff role "Take/edit attendance", so a coach may do this.

    Nothing here touches `charge_id`: a no-show still owes the fee, and a refund is a
    credit M6 writes."""
    from app.models.events import EventRegistration

    response = client.post(
        f"/api/v1/events/{an_event}/attendance",
        headers=as_assistant_coach.headers,
        json={"marks": [{"student_id": str(a_student), "attended": True}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["marked"] == 1

    app_session.expire_all()
    row = app_session.get(EventRegistration, a_registered_student)
    assert row.attended is True
    # attended is distinct from rsvp: saying yes and turning up are different facts, and
    # §5.8's post-event report is about the second one.
    assert row.rsvp == "pending"
