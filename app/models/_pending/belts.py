"""SPEC §4.3's belt block, and §5.9's grading.

**Belt colours are data, never brand** (D3). `belt_rank.color_hex` is per-studio,
per-class configuration, which is exactly why D3 rejected belt colours as a brand palette:
using them as brand would collide with rank display, and they carry no meaning for a
non-martial-art studio.

**G10 / D7 lives in the component, not here.** A belt bar always carries a 1px ring in the
current foreground colour, because fill alone makes white invisible on light (1.08:1),
black invisible on dark (1.02:1), and yellow fail even the 3:1 non-text threshold (2.02:1)
-- with brown (2.38) and green (2.86) failing on dark as well, per D12. This module stores
the colour; `BeltBar` is what guarantees it is never rendered fill-only, and it has no prop
that turns the ring off.

Ranks are ordered **within a class**: a karate white belt and a judo white belt are
different rows on different ladders (§5.9).
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey


class BeltRank(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `belt_rank  studio_id, class_id, name, kyu?, order_index, color_hex`.

    `secondary_color_hex` is not in §4.3's column list but artboard `5b` is explicit --
    'מערכת חגורות, כולל חגורות דו-צבעיות' -- and `BeltBar` already renders a second
    colour. Without a column to hold it, M7 would have to invent its own storage or its
    own bar, and a second bar is how the fill-only bug D7 exists to prevent comes back.

    `kyu` is nullable because dan grades are counted the other way and some studios use
    neither.
    """

    __tablename__ = "belt_rank"
    __tenant_table_args__ = (
        CheckConstraint("order_index >= 0", name="belt_rank_order_non_negative"),
        # A total order within the class. Two ranks at the same position make
        # "next belt" ambiguous, which is the whole question a progression screen answers.
        Index("uq_belt_rank_class_order", "class_id", "order_index", unique=True),
        Index("uq_belt_rank_class_name", "class_id", "name", unique=True),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("class.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    kyu: Mapped[int | None] = mapped_column(Integer)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    #: D3 -- DATA, not a token. This is the one place a raw hex is correct, and the
    #: reason G13's "named tokens, never hardcoded hex" does not apply: the value is
    #: configured per studio at runtime, not chosen by a designer at build time.
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False)
    #: Artboard `5b`'s bi-colour grades. NULL for a solid belt.
    secondary_color_hex: Mapped[str | None] = mapped_column(String(7))


class StudentBelt(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `student_belt  student_id, belt_rank_id, awarded_on, awarded_by_person_id,
    event_id?, note?`.

    The grading **history**, not the current belt. `student.current_belt_id` is the cache;
    this is the record of how they got there, which is what parent artboard `12d`
    (התקדמות חגורה ומבחנים) renders.

    `event_id` is nullable because §5.9 allows a promotion outside a formal exam -- a coach
    awarding a stripe at the end of a session is a real thing in a children's club.
    """

    __tablename__ = "student_belt"
    __tenant_table_args__ = (
        # A student is awarded a given rank once. A re-award is a data-entry mistake, and
        # it would make the progression screen show the same belt twice.
        Index("uq_student_belt_student_rank", "student_id", "belt_rank_id", unique=True),
        Index("ix_student_belt_student_id_awarded_on", "student_id", "awarded_on"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    belt_rank_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("belt_rank.id", ondelete="RESTRICT"), nullable=False
    )
    awarded_on: Mapped[date] = mapped_column(Date, nullable=False)
    awarded_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("event.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
