"""§5.9's ladder. Artboard `5b` is its specification.

**Ordered within a class, and the order is total.** `uq_belt_rank_class_order` enforces it
and `events.belt.orderHint` states it: הסדר קובע מהי הדרגה הבאה. `order_index` rather than
sorting by `kyu`, because not every rank has one -- a striped junior belt often does not --
and a null would scatter those rows to one end of the list.

**Reordering rewrites the whole ladder, in two passes.** A pairwise swap through a UNIQUE
index has to pass through a colliding intermediate state, so pass one parks every row
ABOVE the highest index currently in use and pass two writes the real positions. Parking
below zero would be the obvious trick and it is not available: `belt_rank_order_non_negative`
is a CHECK, so the negative range cannot be written even transiently.

Parking above the maximum rather than at `len(rows)` matters when the ladder has gaps --
indices 0, 5 and 100 are a legal ladder, and `len` would land the first parked row on top
of the second real one.

**Colour is data, validated as a colour.** `HexColour` in the contract schema is the shape.
D3 makes the value per-studio configuration rather than a token, and a value that is not a
colour reaches `BeltBar` as a CSS declaration it cannot render -- so the belt disappears
rather than erroring, which is the failure mode nobody reports.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.schemas.belts import BeltRankIn
from app.services.belts.errors import (
    BeltRankIsHeldError,
    BeltRankNotFoundError,
    LadderClassRequiredError,
    LadderOrderCollisionError,
    NotThisClassesLadderError,
)


class BeltRankService:
    @staticmethod
    def list_for_class(session: TenantSession, class_id: uuid.UUID) -> list[BeltRank]:
        return list(
            session.execute(
                select(BeltRank).where(BeltRank.class_id == class_id).order_by(BeltRank.order_index)
            ).scalars()
        )

    @staticmethod
    def read(session: TenantSession, rank_id: uuid.UUID) -> BeltRank:
        row = session.get(BeltRank, rank_id)
        if row is None:
            raise BeltRankNotFoundError(str(rank_id))
        return row

    @staticmethod
    def create(session: TenantSession, data: BeltRankIn) -> BeltRank:
        if data.class_id is None:
            raise LadderClassRequiredError("a rank belongs to a class")
        BeltRankService._assert_position_free(
            session, data.class_id, data.order_index, excluding=None
        )
        row = BeltRank(
            class_id=data.class_id,
            name=data.name,
            kyu=data.kyu,
            order_index=data.order_index,
            color_hex=data.color_hex,
            secondary_color_hex=data.secondary_color_hex,
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def update(session: TenantSession, rank_id: uuid.UUID, data: BeltRankIn) -> BeltRank:
        """The class is not moved. A rank belongs to one ladder for its whole life --
        moving it would carry every `student_belt` row pointing at it into a sequence those
        children were never graded against."""
        row = BeltRankService.read(session, rank_id)
        BeltRankService._assert_position_free(
            session, row.class_id, data.order_index, excluding=rank_id
        )
        row.name = data.name
        row.kyu = data.kyu
        row.order_index = data.order_index
        row.color_hex = data.color_hex
        row.secondary_color_hex = data.secondary_color_hex
        session.flush()
        return row

    @staticmethod
    def delete(session: TenantSession, rank_id: uuid.UUID) -> None:
        row = BeltRankService.read(session, rank_id)
        if BeltRankService.holders(session, rank_id):
            raise BeltRankIsHeldError(str(rank_id))
        session.delete(row)
        session.flush()

    @staticmethod
    def reorder(
        session: TenantSession, class_id: uuid.UUID, ordered_ids: list[uuid.UUID]
    ) -> list[BeltRank]:
        """The finished order, written in two passes. See the module docstring."""
        current = BeltRankService.list_for_class(session, class_id)
        if {row.id for row in current} != set(ordered_ids) or len(ordered_ids) != len(current):
            raise NotThisClassesLadderError("a reorder names exactly this class's ranks")
        by_id = {row.id: row for row in current}
        parking = max(row.order_index for row in current) + 1
        for offset, rank_id in enumerate(ordered_ids):
            by_id[rank_id].order_index = parking + offset
        session.flush()
        for offset, rank_id in enumerate(ordered_ids):
            by_id[rank_id].order_index = offset
        session.flush()
        return [by_id[rank_id] for rank_id in ordered_ids]

    @staticmethod
    def next_after(session: TenantSession, rank_id: uuid.UUID) -> BeltRank | None:
        """`events.belt.next`.

        `None` at the top of the ladder, which is what makes a student there ineligible
        rather than eligible for nothing.
        """
        row = BeltRankService.read(session, rank_id)
        return session.execute(
            select(BeltRank)
            .where(
                BeltRank.class_id == row.class_id,
                BeltRank.order_index > row.order_index,
            )
            .order_by(BeltRank.order_index)
            .limit(1)
        ).scalar_one_or_none()

    @staticmethod
    def holders_of(session: TenantSession, rank_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """`5b`'s student count, one query for a whole ladder rather than one per row."""
        if not rank_ids:
            return {}
        counts = {rank_id: 0 for rank_id in rank_ids}
        for rank_id, count in session.execute(
            select(StudentBelt.belt_rank_id, func.count())
            .where(StudentBelt.belt_rank_id.in_(rank_ids))
            .group_by(StudentBelt.belt_rank_id)
        ):
            counts[rank_id] = count
        return counts

    @staticmethod
    def holders(session: TenantSession, rank_id: uuid.UUID) -> int:
        return BeltRankService.holders_of(session, [rank_id])[rank_id]

    @staticmethod
    def _assert_position_free(
        session: TenantSession,
        class_id: uuid.UUID,
        order_index: int,
        *,
        excluding: uuid.UUID | None,
    ) -> None:
        stmt = select(BeltRank.id).where(
            BeltRank.class_id == class_id, BeltRank.order_index == order_index
        )
        if excluding is not None:
            stmt = stmt.where(BeltRank.id != excluding)
        if session.execute(stmt).first() is not None:
            raise LadderOrderCollisionError(str(order_index))
