"""`GET /api/v1/me/onboarding-status` -- §3's one answer to "what is left".

Today four screens each re-derive the same question from a different pile of facts
(`student.status`, `health_status`, `agreement_complete`, `price_plan_id is None`,
consent records, `trial_booking.attended`, `session.access.parent`) and disagree with
each other -- which is how a parent ends up signing the same health form forever. This
module computes the four flags once, from real facts, so every caller reads the same
answer.

**What these flags do NOT know.** They describe the family's EXISTING state in the
active studio -- the students already on the account, the consents already granted, the
charges already open. They have no idea a wizard run in progress is about to create a
NEW student: decision 6 scopes `health` and `payment` to "the students THIS run is
creating," and that scoping is layered on top of this by whichever screen calls it (wave
D/E), not answered here. A parent with existing children who all hold current
declarations reads `health: complete` even while a brand-new child mid-wizard still needs
one -- a caller must not skip a step on the strength of this flag alone when a new
student is involved.

**F9 -- a signed-in caller with no active studio.** The moment right after OAuth on a
fresh `/join/<token>` visit: `identity_id` is set, but there is no studio membership yet,
so the JWT carries no `person_id`/`active_studio_id` and a `TenantSession` would fail
closed (`NoActiveStudioError`) on the first query. `OnboardingStatusService.empty()` is
the honest answer for that caller -- nothing exists anywhere yet, so every flag reads
`False` and `next` opens on the first step, `agreements`. The router picks between
`compute()` and `empty()` before ever constructing a tenant-scoped session; see
`app/routers/onboarding.py`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import ClassVar, Literal

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.people import Student
from app.models.person import Guardian
from app.services.billing import BillingService
from app.services.health.agreement import agreement_status
from app.services.privacy.consent import ConsentService

#: The one place this literal is spelled out. The router (`app/routers/onboarding.py`)
#: imports it for its response models rather than re-typing the four names, so the wire
#: shape and the computed shape cannot drift apart.
OnboardingStepKey = Literal["agreements", "students", "health", "payment"]

#: The three consents a family must hold at their CURRENT version. `terms` and `privacy`
#: move with `POLICY_VERSION`; `club_terms` is the club's own and moves with
#: `CLUB_TERMS_VERSION` -- both resolved through `ConsentService.holds_current` ->
#: `expected_version()`, never compared against one global number (see that function's
#: own docstring for the bug that shape caused once already).
_AGREEMENT_CONSENT_TYPES: tuple[str, ...] = ("terms", "privacy", "club_terms")


@dataclass(frozen=True)
class OnboardingStatus:
    #: Keyed by `OnboardingStatusService.STEP_ORDER`.
    steps: dict[OnboardingStepKey, bool]
    #: The first step in `STEP_ORDER` whose flag is `False`, or `None` when every flag is
    #: `True` -- §3's "if nothing is needed it does not open at all."
    next: OnboardingStepKey | None


class OnboardingStatusService:
    """Read-only. Never writes, never commits -- the caller (the router) owns the
    session's lifecycle and rolls it back, same as every other read in this file's
    neighbourhood (`onboarding_info` in `app/routers/onboarding.py`)."""

    STEP_ORDER: ClassVar[tuple[OnboardingStepKey, ...]] = (
        "agreements",
        "students",
        "health",
        "payment",
    )

    @staticmethod
    def empty() -> OnboardingStatus:
        """F9's answer: no studio in context means no `person_id` to query against, so
        there are no facts to report -- every flag is honestly `False`."""
        flags: dict[OnboardingStepKey, bool] = dict.fromkeys(
            OnboardingStatusService.STEP_ORDER, False
        )
        return OnboardingStatus(steps=flags, next=OnboardingStatusService.STEP_ORDER[0])

    @staticmethod
    def compute(session: TenantSession, *, person_id: uuid.UUID) -> OnboardingStatus:
        """The four flags, for a caller resolved to a real `person_id` in the active
        studio. See the module docstring for what each one does and does not mean."""
        agreements = all(
            ConsentService.holds_current(session, person_id=person_id, consent_type=consent_type)
            for consent_type in _AGREEMENT_CONSENT_TYPES
        )

        students = list(
            session.execute(
                select(Student)
                .join(Guardian, Guardian.student_id == Student.id)
                .where(Guardian.person_id == person_id)
            )
            .scalars()
            .all()
        )

        # `all()` on an empty list is `True` -- vacuously correct ("every one of the
        # caller's students holds a current declaration" when there are none to hold
        # one), and harmless: `students` below is already `False` in that case, and
        # `next` stops there first regardless of what `health` says.
        health = all(
            agreement_status(session, student, signer_person_id=person_id).health_signed
            for student in students
        )

        _charged, _paid, open_charge_count = BillingService(session).payer_balance(person_id)

        flags: dict[OnboardingStepKey, bool] = {
            "agreements": agreements,
            "students": len(students) > 0,
            "health": health,
            "payment": open_charge_count == 0,
        }
        next_step = next(
            (key for key in OnboardingStatusService.STEP_ORDER if not flags[key]), None
        )
        return OnboardingStatus(steps=flags, next=next_step)
