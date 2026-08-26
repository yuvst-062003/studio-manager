"""§10.5's four conflict rows, with no database in the way.

The rules are stated in one paragraph of the spec and they are the hardest thing in this
lane, so they are settled here as a pure function before anything writes a row. Every path
through `AttendanceService.apply_batch` reads through `resolve_mark`, which is what stops
the timestamp rule and the pre-report rule from being re-derived at three call sites.

One test per row, per the milestone plan's table:

    | same device flushes twice          | no-op on client_mark_id                    |
    | two coaches mark the same session  | last write by device_marked_at             |
    | a parent pre-report vs a bulk mark | the pre-report wins REGARDLESS of timestamp |
    | a coach's explicit tap             | may still override the pre-report (§5.7)    |
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.services.attendance.resolve import Decision, ExistingMark, IncomingMark, resolve_mark

T0 = datetime(2026, 11, 3, 17, 0, tzinfo=UTC)


def _existing(
    *,
    status: str = "present",
    source: str = "coach",
    at: datetime = T0,
    mark_id: uuid.UUID | None = None,
) -> ExistingMark:
    return ExistingMark(
        status=status,
        source=source,
        device_marked_at=at,
        client_mark_id=mark_id or uuid.uuid4(),
    )


def _incoming(
    *,
    status: str = "present",
    source: str = "coach",
    at: datetime = T0,
    mark_id: uuid.UUID | None = None,
) -> IncomingMark:
    return IncomingMark(
        status=status,
        source=source,
        device_marked_at=at,
        client_mark_id=mark_id or uuid.uuid4(),
    )


def test_a_mark_with_nothing_to_conflict_with_is_applied():
    assert resolve_mark(None, _incoming()) is Decision.APPLY


def test_the_same_device_flushing_twice_is_a_no_op():
    """§10.5 -- 'Idempotent on `client_mark_id`; the replay is a no-op.'

    Not KEEP_EXISTING: the caller must be able to tell "I already have this exact mark"
    from "somebody else's mark won", because the first is a successful flush and the
    second is a conflict a coach may need to see.
    """
    mark_id = uuid.uuid4()
    existing = _existing(mark_id=mark_id, at=T0)
    incoming = _incoming(mark_id=mark_id, at=T0 + timedelta(hours=2), status="absent_unexcused")
    assert resolve_mark(existing, incoming) is Decision.REPLAY


def test_two_coaches_resolve_by_device_marked_at_and_the_later_tap_wins():
    """§10.5 -- 'Last write by `device_marked_at` wins.'

    On the DEVICE clock, not arrival: resolving on arrival would let whoever reconnected
    second overwrite the earlier mark, which is the normal case in a basement dojo.
    """
    existing = _existing(status="present", at=T0)
    incoming = _incoming(status="absent_unexcused", at=T0 + timedelta(minutes=5))
    assert resolve_mark(existing, incoming) is Decision.APPLY


def test_two_coaches_resolve_by_device_marked_at_and_the_earlier_tap_loses():
    existing = _existing(status="present", at=T0 + timedelta(minutes=5))
    incoming = _incoming(status="absent_unexcused", at=T0)
    assert resolve_mark(existing, incoming) is Decision.KEEP_EXISTING


def test_a_bulk_action_never_overwrites_a_parent_pre_report_even_when_it_is_later():
    """§10.5's exception, and the one rule the artboards get wrong (`9f` finding 1).

    'a parent pre-report, which never loses to a bulk action REGARDLESS of timestamp.'
    The timestamp here is deliberately in the bulk mark's favour: a coach hitting
    'all present' at 17:00 must not silently overwrite a parent who reported at 09:00.
    """
    existing = _existing(status="absent_excused", source="parent", at=T0 - timedelta(hours=8))
    incoming = _incoming(status="present", source="bulk", at=T0)
    assert resolve_mark(existing, incoming) is Decision.KEEP_EXISTING


def test_a_bulk_action_does_overwrite_an_unmarked_row():
    """§5.7 -- 'סמן הכל נוכח sets every `unmarked` row to `present`.' The protection is
    specific to a parent's pre-report, not a blanket refusal to write."""
    existing = _existing(status="unmarked", source="system", at=T0 - timedelta(hours=8))
    incoming = _incoming(status="present", source="bulk", at=T0)
    assert resolve_mark(existing, incoming) is Decision.APPLY


def test_a_bulk_action_does_not_overwrite_a_mark_a_coach_already_set():
    """§5.7 -- 'it does not touch rows a coach has already set.'"""
    existing = _existing(status="absent_unexcused", source="coach", at=T0 - timedelta(minutes=1))
    incoming = _incoming(status="present", source="bulk", at=T0)
    assert resolve_mark(existing, incoming) is Decision.KEEP_EXISTING


def test_a_coachs_explicit_tap_may_override_a_parent_pre_report():
    """§5.7 -- 'A pre-reported absence can only be changed by an explicit coach tap.'

    The protection is against the BULK action specifically. A child who was reported sick
    and then turned up is a real child, and the coach on the mat is the one who knows.
    """
    existing = _existing(status="absent_excused", source="parent", at=T0 - timedelta(hours=8))
    incoming = _incoming(status="present", source="coach", at=T0)
    assert resolve_mark(existing, incoming) is Decision.APPLY


def test_a_coachs_earlier_tap_still_loses_to_a_later_parent_report():
    """The pre-report exception is not a general 'parent always wins'. Between a coach and
    a parent, with no bulk action involved, §10.5's timestamp rule is what applies."""
    existing = _existing(status="present", source="coach", at=T0)
    incoming = _incoming(status="absent_excused", source="parent", at=T0 - timedelta(hours=8))
    assert resolve_mark(existing, incoming) is Decision.KEEP_EXISTING


def test_an_identical_instant_keeps_what_is_already_stored():
    """Two devices whose clocks agree to the microsecond is not a real scenario, but a
    resolver has to answer anyway. Keeping the stored row makes the function total and
    makes a replay-with-a-new-id idempotent in practice as well as in principle."""
    existing = _existing(status="present", at=T0)
    incoming = _incoming(status="absent_unexcused", at=T0)
    assert resolve_mark(existing, incoming) is Decision.KEEP_EXISTING


def test_a_stored_unmarked_row_always_loses_to_a_real_mark():
    """§5.14 -- `unmarked` is a real STORED state, and that is exactly why it must not win
    a timestamp comparison. A materialized roster writes `unmarked` rows at session
    creation time, which is hours before any coach taps anything; resolving those on
    `device_marked_at` alone would make every roster permanently unmarkable."""
    existing = _existing(status="unmarked", source="system", at=T0 + timedelta(hours=5))
    incoming = _incoming(status="present", source="coach", at=T0)
    assert resolve_mark(existing, incoming) is Decision.APPLY


def test_a_real_mark_is_never_replaced_by_an_unmarked_one_from_an_older_device():
    """The mirror of the case above, and the reason it is not simply 'unmarked never
    wins': a coach who taps a row back to `unmarked` is making a real correction, and a
    later device clock is what says so."""
    existing = _existing(status="present", source="coach", at=T0)
    incoming = _incoming(status="unmarked", source="coach", at=T0 + timedelta(minutes=1))
    assert resolve_mark(existing, incoming) is Decision.APPLY
