"""W2's contract commit, the model half: §4.3's schedule and people blocks.

The milestone plan's W2 table lists twelve tables across two verticals. They land here,
on `main`, **before** either worktree exists -- §2.2: "Anything discovered mid-wave that
belongs here is a stop-and-tell, not a lane edit."

These are structural assertions over `Base.metadata`, not database round-trips. The
schema is the contract; whether Postgres is running is a different test's problem.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import pytest
import sqlalchemy as sa
from app.core.encryption import EncryptedJSON
from app.models.base import Base
from sqlalchemy.dialects.postgresql import ARRAY

W2_SCHEDULE_TABLES = (
    "training_year",
    "studio_closure",
    "group_schedule_rule",
    "session",
    "session_staff",
    "session_note",
)
W2_PEOPLE_TABLES = (
    "student",
    "student_freeze",
    "student_status_history",
    "trial_booking",
    "enrollment",
    "registration_request",
)


@pytest.mark.parametrize("table", W2_SCHEDULE_TABLES + W2_PEOPLE_TABLES)
def test_the_table_exists(table):
    assert table in Base.metadata.tables


@pytest.mark.parametrize("table", W2_SCHEDULE_TABLES + W2_PEOPLE_TABLES)
def test_every_w2_table_is_tenant_scoped(table):
    """G9. Invariant 2 asserts the same thing globally; this one names the wave, so a
    lane that adds a thirteenth table learns it here rather than in a shared gate."""
    columns = Base.metadata.tables[table].c
    assert "studio_id" in columns
    assert columns["studio_id"].nullable is False


# -- schedule -----------------------------------------------------------------
def test_a_session_records_whether_a_human_edited_it():
    """E2E-5 rests entirely on this column. §5.6: changing a rule rewrites only FUTURE
    sessions, and never one a human has touched. Without `is_manually_edited` there is
    no way to express the second half."""
    columns = Base.metadata.tables["session"].c
    assert columns["is_manually_edited"].nullable is False
    assert columns["is_ad_hoc"].nullable is False


def test_a_session_remembers_the_rule_it_came_from():
    """A regenerate has to know which sessions it owns. An ad-hoc session has no rule
    and must survive the rewrite, so the column is nullable on purpose."""
    columns = Base.metadata.tables["session"].c
    assert "generated_from_rule_id" in columns
    assert columns["generated_from_rule_id"].nullable is True


def test_a_session_note_is_soft_deleted():
    """G15 -- soft-delete on user-generated content. A coach's note about a child is
    exactly that."""
    assert "deleted_at" in Base.metadata.tables["session_note"].c


def test_a_closure_records_whether_a_human_chose_it():
    """§5.6: Israeli holiday presets are proposals the manager ticks, NEVER automatic
    closures. `source` is what makes that distinction auditable after the fact."""
    assert "source" in Base.metadata.tables["studio_closure"].c


# -- people -------------------------------------------------------------------
def test_a_person_is_a_student_at_most_once():
    """§4.3 -- `student  studio_id, person_id UNIQUE`."""
    columns = Base.metadata.tables["student"].c
    assert columns["person_id"].unique is True


def test_a_student_carries_the_health_status_m5_renders():
    """The W3 seam, declared in W2 because `BootstrapPayload.roster[].health_status`
    reads it. M4 populates it, M5 renders it, neither opens the other's file."""
    assert "health_status" in Base.metadata.tables["student"].c


def test_a_registration_request_encrypts_its_payload():
    """§11.1 -- an unapproved registration is a stranger's personal data about a minor,
    sitting in a queue. It is encrypted at rest before a manager ever sees it."""
    column = Base.metadata.tables["registration_request"].c["payload_encrypted"]
    assert isinstance(column.type, EncryptedJSON)


def test_a_trial_booking_records_a_manager_override():
    """§5.4 -- a manager granting a SECOND free trial is a deliberate, visible act."""
    assert "is_override" in Base.metadata.tables["trial_booking"].c


def test_status_history_is_append_only_in_shape():
    """§5.4's funnel report reads this table. A row is a fact that happened; there is no
    `deleted_at` because un-happening a status change would break the funnel."""
    columns = Base.metadata.tables["student_status_history"].c
    assert "to_status" in columns
    assert "deleted_at" not in columns


# -- G2, restated on this wave's tables ---------------------------------------
@pytest.mark.parametrize("table", W2_SCHEDULE_TABLES + W2_PEOPLE_TABLES)
def test_no_w2_table_smuggles_in_a_float(table):
    """W2 carries no money at all -- price_plan is W4's. The assertion is that it stays
    that way: the cheapest moment to catch a stray `amount` column is the wave it is
    added in."""
    for column in Base.metadata.tables[table].columns:
        assert not isinstance(column.type, (sa.Float, sa.Numeric)), column.name


# -- C11 and C12, the two defects the club's real structure exposed -----------
def test_an_enrollment_carries_which_days_the_student_actually_comes():
    """C12 -- §5.7's four attendance states cannot say "not expected today". A student in a
    twice-weekly group who attends once was `absent_unexcused` every week forever and read
    as 50% attendance while attending everything they agreed to."""
    column = Base.metadata.tables["enrollment"].c["attends_weekdays"]
    assert isinstance(column.type, ARRAY)
    assert column.nullable, "NULL means every session of the group -- the common case"


def test_attends_weekdays_is_bounded_to_a_week_and_never_empty():
    """0-6, matching `group_schedule_rule.weekday`. Empty is rejected rather than treated
    as NULL: NULL means "every session", empty would silently mean "no session", and two
    spellings of an enrollment expecting nothing is one too many."""
    checks = {
        c.name: str(c.sqltext)
        for c in Base.metadata.tables["enrollment"].constraints
        if isinstance(c, sa.CheckConstraint)
    }
    # `ck_` prefix and the table name come from the metadata naming convention.
    body = checks["ck_enrollment_enrollment_attends_weekdays"]
    assert "array_length(attends_weekdays, 1) > 0" in body
    assert "ARRAY[0,1,2,3,4,5,6]" in body


def test_an_enrollment_holds_no_price():
    """C11 -- tuition is priced per student by training volume, so a child in two groups is
    one charge. A `price_plan_id` here is what made them two."""
    assert "price_plan_id" not in Base.metadata.tables["enrollment"].c
    assert "price_plan_id" in Base.metadata.tables["student"].c


def test_a_student_may_hold_more_than_one_live_enrollment():
    """§5.4 used to open 'each child is enrolled in one group'. The schema never enforced
    it, §3.3 calls `enrollment` a link table, and the club contradicts it outright -- so
    the uniqueness that exists is per (student, GROUP), never per student."""
    live = next(
        i for i in Base.metadata.tables["enrollment"].indexes if i.name == "uq_enrollment_live"
    )
    assert live.unique is True
    assert [c.name for c in live.columns] == ["student_id", "group_id"]
