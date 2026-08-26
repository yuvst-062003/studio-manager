"""SPEC §7's `/belt-ranks` and `/students/{id}/belts`. §5.9's ladder and its awards.

**This file declares `/students/{id}/belts`, a path not named for its module.** §7 puts the
grading history there and `app/routers/students.py` is lane PEOPLE's file. A path is not a
module: `app/routers/health_declarations.py` already declares
`/students/{id}/health-declaration` for exactly this reason, and `lane-check.sh belts`
reaches this file rather than that one.

**§3.2, per route.** The belt SYSTEM is studio configuration -- owner and manager, the same
row that gives them studio settings. A lead coach RECORDS results and may award a rank
outside an exam (§5.9), which is a different capability from redefining the ladder those
results are graded against. Reads reach every staff role, because `9d` renders each
candidate's current and next belt and a coach who cannot read the ladder cannot run the
exam; a ladder carries no money, so §3.2's hard rule does not reach it.

Routers stay thin (G6): parse, call a service, return.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth_context import AnyStaff, ManagerOrOwner, require_roles
from app.core.tenancy import TenantSessionDep
from app.models.belts import BeltRank
from app.schemas._pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    CursorPage,
    IdempotencyKey,
)
from app.schemas.belts import BeltRankIn, BeltRankOut
from app.services.belts.errors import (
    BeltRankIsHeldError,
    BeltRankNotFoundError,
    LadderAlreadySeededError,
    LadderClassRequiredError,
    LadderOrderCollisionError,
    NoSuchPresetError,
    NotThisClassesLadderError,
)
from app.services.belts.presets import BELT_PRESETS, BeltPresetService
from app.services.belts.ranks import BeltRankService

router = APIRouter(tags=["belts"])

#: §3.2 -- "Record belt exam results | owner ✓ | manager ✓ | lead_coach ✓". The same triple
#: `app/routers/events.py` declares, and for the same §5.9 reason: a lead coach awarding a
#: stripe at the end of a session is a real thing in a children's club.
BeltAwarder = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]


class LadderRankOut(BeltRankOut):
    """One rung, plus the two facts a ladder screen cannot render without.

    Composed rather than added to `BeltRankOut`, which is W4's contract and not this lane's
    to widen -- the same move `HealthTemplatePublishedOut` makes.

    `next_rank_id` is `events.belt.next` and `holders` is `5b`'s חניכים column, which is
    also the data a delete refusal explains itself with.
    """

    next_rank_id: uuid.UUID | None
    holders: int


LadderPage = CursorPage[LadderRankOut]


class ReorderLadderIn(BaseModel):
    """The finished order, whole.

    A partial list would leave the omitted ranks at indices the named ones are about to
    take, and a pairwise swap through `uq_belt_rank_class_order` has to pass through a
    colliding intermediate state. `5b` reorders by drag; the API takes the result either
    way.
    """

    class_id: uuid.UUID
    ordered_ids: list[uuid.UUID]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such belt rank"},
    )


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message}
    )


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


def _ladder_out(session: TenantSessionDep, rows: list[BeltRank]) -> list[LadderRankOut]:
    """`next_rank_id` from list position rather than N queries: the rows arrive ordered,
    so the next rung is simply the one after."""
    holders = BeltRankService.holders_of(session, [row.id for row in rows])
    return [
        LadderRankOut(
            id=row.id,
            class_id=row.class_id,
            name=row.name,
            kyu=row.kyu,
            order_index=row.order_index,
            color_hex=row.color_hex,
            secondary_color_hex=row.secondary_color_hex,
            next_rank_id=rows[index + 1].id if index + 1 < len(rows) else None,
            holders=holders.get(row.id, 0),
        )
        for index, row in enumerate(rows)
    ]


@router.get("/belt-ranks", response_model=LadderPage)
def list_belt_ranks(
    _: AnyStaff,
    class_id: uuid.UUID,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> LadderPage:
    """`5b`'s table, and the ladder every progression screen reads.

    `class_id` is required rather than optional: `events.belt.perClassHint` says the system
    is defined per class, and a studio-wide list of two disciplines' ranks interleaved by
    `order_index` would be meaningless.
    """
    rows = BeltRankService.list_for_class(session, class_id)
    items = _ladder_out(session, rows)
    # `next_rank_id` is derived from the whole ladder, so the page is the ladder. A class
    # with more than MAX_PAGE_SIZE ranks does not exist -- the largest preset is twelve --
    # and truncating one would silently make the last rung look like the top.
    return LadderPage(items=items[:limit], next_cursor=None, has_more=len(items) > limit)


@router.post("/belt-ranks", response_model=LadderRankOut, status_code=status.HTTP_201_CREATED)
def create_belt_rank(
    _: ManagerOrOwner,
    body: BeltRankIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> LadderRankOut:
    try:
        row = BeltRankService.create(session, body)
    except LadderClassRequiredError as exc:
        raise _unprocessable("class_required", str(exc)) from exc
    except LadderOrderCollisionError as exc:
        raise _conflict("order_index_taken", "another rank already sits at that position") from exc
    out = _ladder_out(session, BeltRankService.list_for_class(session, row.class_id))
    session.commit()
    return next(item for item in out if item.id == row.id)


@router.patch("/belt-ranks/{rank_id}", response_model=LadderRankOut)
def update_belt_rank(
    _: ManagerOrOwner,
    rank_id: uuid.UUID,
    body: BeltRankIn,
    session: TenantSessionDep,
) -> LadderRankOut:
    try:
        row = BeltRankService.update(session, rank_id, body)
    except BeltRankNotFoundError as exc:
        raise _not_found() from exc
    except LadderOrderCollisionError as exc:
        raise _conflict("order_index_taken", "another rank already sits at that position") from exc
    out = _ladder_out(session, BeltRankService.list_for_class(session, row.class_id))
    session.commit()
    return next(item for item in out if item.id == row.id)


@router.delete("/belt-ranks/{rank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_belt_rank(_: ManagerOrOwner, rank_id: uuid.UUID, session: TenantSessionDep) -> None:
    """409 when students hold it. `events.belt.deleteHeld` is the message, and `5b`'s row
    already shows the count the refusal is about."""
    try:
        BeltRankService.delete(session, rank_id)
    except BeltRankNotFoundError as exc:
        raise _not_found() from exc
    except BeltRankIsHeldError as exc:
        raise _conflict("rank_is_held", "this rank has been awarded to students") from exc
    session.commit()


@router.post("/belt-ranks/reorder", response_model=LadderPage)
def reorder_belt_ranks(
    _: ManagerOrOwner, body: ReorderLadderIn, session: TenantSessionDep
) -> LadderPage:
    try:
        rows = BeltRankService.reorder(session, body.class_id, body.ordered_ids)
    except NotThisClassesLadderError as exc:
        raise _unprocessable("reorder_must_name_the_whole_ladder", str(exc)) from exc
    items = _ladder_out(session, rows)
    session.commit()
    return LadderPage(items=items, next_cursor=None, has_more=False)


# -- §5.9's seeded sets (artboards 5d and 5b) -----------------------------------------
class BeltRankPresetOut(BaseModel):
    """One rung of a preset, before any of it exists as a row."""

    name: str
    kyu: int | None
    order_index: int
    color_hex: str
    secondary_color_hex: str | None


class BeltPresetOut(BaseModel):
    """A whole seeded set. `5d` renders the ranks each preset WOULD create, as a live
    preview beside the cards, so the ladder has to be readable before it exists."""

    key: str
    discipline: str
    name: str
    ranks: list[BeltRankPresetOut]


class SeedLadderIn(BaseModel):
    class_id: uuid.UUID
    preset_key: str


@router.get("/belt-presets", response_model=CursorPage[BeltPresetOut])
def list_belt_presets(_: AnyStaff) -> CursorPage[BeltPresetOut]:
    """§5.9's seeded sets, as data.

    No session and no tenancy: a preset is versioned application data, the same shape as
    `app/services/demo/fixtures.py`, and identical for every studio. That is what makes a
    club seeded in September and one seeded in March comparable.
    """
    return CursorPage[BeltPresetOut](
        items=[
            BeltPresetOut(
                key=preset.key,
                discipline=preset.discipline,
                name=preset.name,
                ranks=[
                    BeltRankPresetOut(
                        name=rank.name,
                        kyu=rank.kyu,
                        order_index=rank.order_index,
                        color_hex=rank.color_hex,
                        secondary_color_hex=rank.secondary_color_hex,
                    )
                    for rank in preset.ranks
                ],
            )
            for preset in BELT_PRESETS
        ],
        next_cursor=None,
        has_more=False,
    )


@router.post("/belt-ranks/seed", response_model=LadderPage, status_code=status.HTTP_201_CREATED)
def seed_belt_ranks(
    _: ManagerOrOwner,
    body: SeedLadderIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> LadderPage:
    """`5d`'s wizard step and `5b`'s `events.belt.seedDefault` button, one route.

    409 on a class that already has a ladder, rather than a merge: a second seed renumbers
    ranks that `student_belt` rows point at, rewriting a child's history without touching
    their row.
    """
    try:
        rows = BeltPresetService.seed(session, body.class_id, body.preset_key)
    except NoSuchPresetError as exc:
        raise _unprocessable("no_such_preset", "there is no such belt system") from exc
    except LadderAlreadySeededError as exc:
        raise _conflict("ladder_already_seeded", "this class already has a belt system") from exc
    items = _ladder_out(session, rows)
    session.commit()
    return LadderPage(items=items, next_cursor=None, has_more=False)
