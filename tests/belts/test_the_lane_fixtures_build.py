"""See tests/billing/test_the_lane_fixtures_build.py for why this exists."""

from __future__ import annotations

import uuid

from app.models.belts import BeltRank
from app.models.people import Student
from sqlalchemy.orm import Session


def test_every_belts_fixture_builds_against_the_real_schema(
    app_session: Session,
    as_owner,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_class: uuid.UUID,
    a_belt_ladder: list[uuid.UUID],
    a_student: uuid.UUID,
    tenant_session,
) -> None:
    ranks = [app_session.get(BeltRank, rank_id) for rank_id in a_belt_ladder]
    assert all(rank is not None for rank in ranks)
    # A total order within the class. uq_belt_rank_class_order enforces it; asserting the
    # fixture actually produces one is what makes "what is the next belt" answerable.
    assert [rank.order_index for rank in ranks] == [0, 1, 2]
    assert len({rank.class_id for rank in ranks}) == 1


def test_the_default_ladder_carries_a_bi_colour_grade(
    app_session: Session, a_belt_ladder: list[uuid.UUID]
) -> None:
    """Artboard 5b -- 'מערכת חגורות, כולל חגורות דו-צבעיות'. A ladder of solid belts would
    let this lane ship a BeltBar that renders one colour and never notice."""
    ranks = [app_session.get(BeltRank, rank_id) for rank_id in a_belt_ladder]
    bi_colour = [rank for rank in ranks if rank.secondary_color_hex is not None]
    assert len(bi_colour) == 1
    assert bi_colour[0].color_hex != bi_colour[0].secondary_color_hex


def test_a_student_starts_with_no_belt_recorded(app_session: Session, a_student: uuid.UUID) -> None:
    """Where every child starts, and the state a progression screen renders before it
    renders anything else. Awarding a rank is this lane's job."""
    student = app_session.get(Student, a_student)
    assert student is not None
    assert student.current_belt_id is None
