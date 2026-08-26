"""SPEC §7's `GET /sync/bootstrap?from&to` — §6.1's offline priming payload.

**Its own file because §7 puts it under `/sync` and not under `/attendance`.** That is not
cosmetic: the endpoint is the whole offline cache's source, and W3's contract commit had to
name it explicitly in `scripts/lane-check.sh` because the default per-vertical branch
resolved `app/routers/attendance.py` alone and would have type-checked the roster while
silently skipping the endpoint the entire queue drains from.

**Tagged `coach`.** Same reason as `app/routers/attendance.py`: §13's third invariant is
enforced against that tag, and `BootstrapPayload` carries whole rosters — it is the single
largest coach-reachable payload in the product and the one a financial field would leak
through most quietly.

§6.1: "Offline priming is not optional. A coach whose very first session is in a basement
with no signal must already have the roster. The first launch blocks on this fetch." So this
is one round trip by design rather than a convenience wrapper, and the client is entitled to
treat a 200 here as "I can now work with no network at all".
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select

from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.people import Enrollment
from app.models.person import Guardian
from app.schemas.attendance import BootstrapPayload
from app.services.attendance.bootstrap import build_bootstrap
from app.services.people.group_days import STUDIO_ZONE

router = APIRouter(tags=["coach", "attendance"])

STAFF_ROLES = {"owner", "manager", "lead_coach", "assistant_coach"}
COACH_ROLES = {"lead_coach", "assistant_coach"}


@router.get("/sync/bootstrap", response_model=BootstrapPayload)
def bootstrap(
    request: Request,
    session: TenantSessionDep,
    # `from` and `to` are §7's names and `from` is a Python keyword, so the parameters are
    # aliased rather than the endpoint renamed -- the same shape `app/routers/sessions.py`
    # uses for `GET /sessions`.
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> BootstrapPayload:
    """Everything a coach needs for a date window, in one payload.

    **Both parameters are optional and default to today and tomorrow**, which is §6.1's
    window verbatim. A first launch has no watermark to compute a range from, and making
    it invent one would put the definition of "the window" in every client rather than
    here.

    The window is clamped to §10.6's two days and echoed back in `from_time`/`to_time`, so
    a client asking for a week gets two days and can *tell* that it did — it evicts against
    what it received rather than what it asked for.
    """
    if getattr(request.state, "identity_id", None) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )

    server_now = now()
    today = server_now.astimezone(STUDIO_ZONE).date()
    start = from_date or today
    end = to_date or (start + timedelta(days=1))

    roles = set(getattr(request.state, "roles", ()) or ())
    person_id = getattr(request.state, "person_id", None)
    person_id = person_id if isinstance(person_id, uuid.UUID) else None

    if roles & STAFF_ROLES:
        # §10.2 — the staff app's offline scope is "full for attendance". A manager gets
        # the studio; a coach gets the studio too, and NOT only their own sessions.
        #
        # That is deliberate and it is §5.6's substitution rule, not laziness: a coach
        # covering for a colleague is told *by push*, which is exactly the notice that does
        # not arrive in a basement. Priming only the sessions already assigned to them
        # would leave the substitute standing in front of a class with no roster, which is
        # the failure mode this whole payload exists to prevent. A club's two days of
        # rosters is tens of KB (§10.6), so the wider scope costs nothing.
        visible: set[uuid.UUID] | None = None
    else:
        if person_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "unauthenticated", "message": "sign in first"},
            )
        # §10.2 — the parent app's offline scope is a READ-ONLY cache of "upcoming
        # sessions... the student profile". Same payload, narrowed to their own children's
        # groups; an empty set is a real answer and returns nothing rather than everything.
        visible = set(
            session.execute(
                select(Enrollment.group_id)
                .join(Guardian, Guardian.student_id == Enrollment.student_id)
                .where(Guardian.person_id == person_id, Enrollment.ended_on.is_(None))
            )
            .scalars()
            .all()
        )

    return build_bootstrap(
        session,
        from_date=start,
        to_date=end,
        visible_group_ids=visible,
        coach_person_id=None,
        now=server_now,
    )
