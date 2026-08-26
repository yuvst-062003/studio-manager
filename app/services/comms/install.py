"""§6.5's install-state report: who can receive a push at all.

"An iPhone parent who never installs receives **no push at all** — and §5.11 permits no email
or SMS fallback, so that parent is reachable only by telephone. ... The dashboard lists
guardians who have not installed, alongside the push-delivery report (§5.11), so the office
can see exactly who it needs to call."

**A different question from the delivery report, and the club needs both.** §5.11's report
answers "did THIS message land". This answers "can this family be reached by any message,
ever" — which is what decides whether push can be relied on for a cancellation in the first
place. A family on this list will be on every delivery report from now until somebody phones
them, so the two screens sit together and the second one is the fixable half.

**On iOS the two questions collapse into one.** A registration existing at all means the app
is on the home screen, because a Safari tab has no Push API to register from (§12: "the API
is absent, not denied"). On Android it means only that somebody granted a permission in an
ordinary tab. Same column, two different facts, so the platform is reported rather than summed
away — the iOS number is what §6.5's install walkthrough is actually judged on.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.comms import PUSH_PLATFORMS, PushToken
from app.models.people import Student
from app.models.person import Guardian, Person
from app.services.comms.announcements import ANNOUNCEABLE_STUDENT_STATUSES


@dataclass(frozen=True)
class InstallStateRow:
    """One family the office may need to phone."""

    person_id: uuid.UUID
    name: str
    phone: str | None


@dataclass
class InstallState:
    installed_count: int = 0
    not_installed_count: int = 0
    #: Every platform, including the ones at zero. A key that vanishes when the count is zero
    #: makes "no iPhone parents have installed" indistinguishable from "we stopped measuring",
    #: and §6.5 makes the first of those the product's main adoption risk.
    by_platform: dict[str, int] = field(default_factory=dict)
    not_installed: list[InstallStateRow] = field(default_factory=list)


class InstallStateService:
    def __init__(self, session: TenantSession) -> None:
        self._session = session

    def report(self) -> InstallState:
        """Every guardian of a currently-involved family, split by whether they can be pushed.

        Involvement follows `ANNOUNCEABLE_STUDENT_STATUSES` rather than a second rule: this
        list exists to be phoned, and a family who left three months ago on it is a call the
        office should not make. One definition, shared with the announcement audience, so the
        two screens cannot disagree about who is a current family.
        """
        guardians = list(
            self._session.execute(
                select(Person)
                .join(Guardian, Guardian.person_id == Person.id)
                .join(Student, Student.id == Guardian.student_id)
                .where(Student.status.in_(ANNOUNCEABLE_STUDENT_STATUSES))
                .distinct()
                .order_by(Person.last_name, Person.first_name)
            ).scalars()
        )

        #: `app='parent'` only. A coach who is also a parent has two registrations and two
        #: answers; counting the staff one would report a family as reachable because their
        #: father coaches on Tuesdays, and a cancellation lands in the parent app.
        installed: dict[uuid.UUID, str] = dict(
            self._session.execute(
                select(PushToken.person_id, PushToken.platform).where(PushToken.app == "parent")
            ).all()  # type: ignore[arg-type]
        )

        state = InstallState(by_platform=dict.fromkeys(PUSH_PLATFORMS, 0))
        for person in guardians:
            platform = installed.get(person.id)
            if platform is None:
                state.not_installed_count += 1
                state.not_installed.append(
                    InstallStateRow(
                        person_id=person.id,
                        name=f"{person.first_name} {person.last_name}".strip(),
                        phone=person.phone,
                    )
                )
            else:
                state.installed_count += 1
                state.by_platform[platform] += 1
        return state
