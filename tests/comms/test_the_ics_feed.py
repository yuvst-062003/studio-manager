"""§5.12's subscription feed — RFC 5545, and the two things M7 deliberately left here.

`app/services/events/ics.py` renders ONE event and says so in its own docstring:

    "Line folding at 75 octets is NOT implemented, and that is a limit rather than an
    oversight. A Hebrew title is three-byte UTF-8, so a long description can exceed it.
    Every client this was checked against accepts long lines; §5.11's subscription feed
    (M8) is where folding belongs, because that file carries a year of events rather than
    one, and getting folding wrong across a multi-byte character is worse than not folding."

This is that file, and it adds the other thing a year-long feed needs: real `VTIMEZONE`
data. M7's single-event renderer emits UTC stamps with a `Z`, which is correct and needs no
timezone block. §5.12 asks for `DTSTART`/`DTEND` **in Asia/Jerusalem**, and a local time
without a VTIMEZONE is a floating time — an hour out for a subscriber abroad, and an hour out
for everybody twice a year.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.comms.ics import FeedEvent, fold, local_stamp, render_feed
from tests.comms.conftest import T0


def _event(**kwargs) -> FeedEvent:
    base = {
        "uid": "session-11111111-1111-1111-1111-111111111111",
        "starts_at": datetime(2026, 11, 15, 15, 0, tzinfo=UTC),
        "ends_at": datetime(2026, 11, 15, 16, 0, tzinfo=UTC),
        "summary": "דנה · ג'ודו/מתחילים",
        "location": "אולם ראשי",
        "description": "מאמן: יוסי",
        "cancelled": False,
    }
    base.update(kwargs)
    return FeedEvent(**base)


def _lines(ics: str) -> list[str]:
    return ics.split("\r\n")


# -- the calendar wrapper -----------------------------------------------------
def test_the_feed_is_a_well_formed_vcalendar() -> None:
    ics = render_feed([_event()], name="ג'ודו", at=T0)
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "VERSION:2.0" in ics
    assert "CALSCALE:GREGORIAN" in ics


def test_every_line_is_crlf_terminated() -> None:
    """RFC 5545 §3.1. A bare LF is the commonest reason a client rejects a file outright
    rather than showing a parse error -- M7's renderer found the same thing."""
    ics = render_feed([_event()], name="ג'ודו", at=T0)
    assert "\n" not in ics.replace("\r\n", "")


def test_an_empty_feed_is_still_a_valid_calendar() -> None:
    """A guardian whose children have no sessions this year still subscribed. Returning
    nothing, or a 404, would make their calendar client show an error forever."""
    ics = render_feed([], name="ג'ודו", at=T0)
    assert "BEGIN:VCALENDAR" in ics and "END:VCALENDAR" in ics
    assert "BEGIN:VEVENT" not in ics


# -- §5.12's Asia/Jerusalem, and why it needs a VTIMEZONE ---------------------
def test_the_feed_carries_real_timezone_rules_and_not_a_floating_time() -> None:
    """§5.12 -- "`DTSTART`/`DTEND` in `Asia/Jerusalem`". A local time with no VTIMEZONE is a
    FLOATING time: it means "15:00 wherever the reader is", so an Israeli parent travelling
    sees the wrong hour for the whole trip, and everybody sees the wrong hour for the weeks
    between the two countries' clock changes."""
    ics = render_feed([_event()], name="ג'ודו", at=T0)
    assert "BEGIN:VTIMEZONE" in ics
    assert "TZID:Asia/Jerusalem" in ics
    assert "DTSTART;TZID=Asia/Jerusalem:" in ics
    assert "DTEND;TZID=Asia/Jerusalem:" in ics


def test_the_daylight_rule_is_the_friday_before_the_last_sunday_of_march() -> None:
    """Israel does not use the EU rule, and this is the difference.

    tzdata's `Zion` zone says `Mar Fri>=23 2:00` -- the Friday before the last Sunday of
    March, which is what `BYDAY=FR` with `BYMONTHDAY=23..29` expresses. The EU switches on the
    last SUNDAY, so a feed that assumed it would put every Israeli lesson an hour out for the
    last weekend of March, every year.
    """
    ics = render_feed([_event()], name="ג'ודו", at=T0)
    assert "FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29" in ics
    assert "TZOFFSETTO:+0300" in ics


def test_standard_time_returns_on_the_last_sunday_of_october() -> None:
    ics = render_feed([_event()], name="ג'ודו", at=T0)
    assert "FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU" in ics
    assert "TZOFFSETTO:+0200" in ics


def test_a_winter_lesson_renders_at_its_israeli_wall_clock_time() -> None:
    """G3 -- stored UTC, rendered Asia/Jerusalem. 15:00Z in November is 17:00 in Israel, which
    is the hour on the timetable and the hour the parent is expecting."""
    assert local_stamp(datetime(2026, 11, 15, 15, 0, tzinfo=UTC)) == "20261115T170000"


def test_a_summer_lesson_renders_an_hour_later_because_of_dst() -> None:
    """The same UTC hour in June is 18:00, not 17:00. This is the case a floating time gets
    wrong and a VTIMEZONE gets right."""
    assert local_stamp(datetime(2027, 6, 15, 15, 0, tzinfo=UTC)) == "20270615T180000"


def test_a_naive_timestamp_is_never_guessed_at() -> None:
    """A value read back from Postgres is timezone-aware. One that is not came from somewhere
    this renderer does not control, and assuming it was UTC would silently move a lesson."""
    import pytest

    with pytest.raises(ValueError):
        local_stamp(datetime(2026, 11, 15, 15, 0))


# -- folding, which is why M7 left this here ---------------------------------
def test_a_short_line_is_left_alone() -> None:
    assert fold("SUMMARY:קצר") == "SUMMARY:קצר"


def test_a_long_hebrew_summary_folds_without_splitting_a_character() -> None:
    """The reason M7 deferred this. A Hebrew character is three-byte UTF-8, so a fold by
    CHARACTER count overruns 75 octets, and a naive fold by BYTE count cuts a codepoint in
    half and produces mojibake in a parent's calendar."""
    ics = render_feed([_event(summary="ג" * 200)], name="ג'ודו", at=T0)
    for line in _lines(ics):
        assert len(line.encode("utf-8")) <= 75, line
    assert "�" not in ics


def test_a_folded_line_unfolds_back_to_the_original() -> None:
    """The octet count alone would pass for a renderer that dropped characters. This is the
    assertion that actually protects the content."""
    summary = "דנה · " + "ג'ודו למתחילים " * 12
    ics = render_feed([_event(summary=summary)], name="ג'ודו", at=T0)
    unfolded = ics.replace("\r\n ", "")
    assert f"SUMMARY:{summary}" in unfolded


def test_a_continuation_line_begins_with_exactly_one_space() -> None:
    """RFC 5545 §3.1's unfolding removes the CRLF and the single following space. Two spaces
    would leave one in the value, which is how a title acquires drifting whitespace."""
    ics = render_feed([_event(summary="ג" * 200)], name="ג'ודו", at=T0)
    continuations = [line for line in _lines(ics) if line.startswith(" ")]
    assert continuations
    assert all(not line.startswith("  ") for line in continuations)


# -- the VEVENT itself --------------------------------------------------------
def test_the_uid_is_stable_across_two_renders() -> None:
    """§5.12 -- "a stable `UID` derived from the session id". An unstable UID makes every
    refresh a delete-and-recreate, and since Google refetches on its own schedule (up to
    ~24h) a parent's calendar would churn every day."""
    first = render_feed([_event()], name="ג'ודו", at=T0)
    second = render_feed([_event()], name="ג'ודו", at=T0.replace(hour=23))
    assert "UID:session-11111111-1111-1111-1111-111111111111" in first
    assert "UID:session-11111111-1111-1111-1111-111111111111" in second


def test_a_cancelled_session_arrives_as_cancelled_rather_than_vanishing() -> None:
    """§5.12. Somebody who already added it keeps the row, struck through -- which is what
    §5.11's cancellation push pairs with. A silently disappearing event tells a parent
    nothing."""
    assert "STATUS:CANCELLED" in render_feed([_event(cancelled=True)], name="ג", at=T0)
    assert "STATUS:CONFIRMED" in render_feed([_event(cancelled=False)], name="ג", at=T0)


def test_the_summary_is_the_child_and_the_group() -> None:
    """§5.12's example, verbatim: `דנה · ג'ודו/מתחילים`. The child's name is what makes a
    two-child family's calendar readable at a glance."""
    assert "SUMMARY:דנה · ג'ודו/מתחילים" in render_feed([_event()], name="ג", at=T0)


def test_special_characters_are_escaped() -> None:
    """RFC 5545 §3.3.11. A comma or a semicolon in a group name is a value separator, so an
    unescaped one silently truncates the title at the comma."""
    ics = render_feed([_event(summary="ג'ודו, מתחילים; ב")], name="ג", at=T0)
    assert "SUMMARY:ג'ודו\\, מתחילים\\; ב" in ics


def test_a_newline_in_a_description_becomes_an_escaped_one() -> None:
    """A raw newline would end the content line and make the rest of the description parse as
    an unknown property -- or as the next event."""
    ics = render_feed([_event(description="שורה\nשנייה")], name="ג", at=T0)
    assert "\\n" in ics
    assert "DESCRIPTION:שורה\\nשנייה" in ics.replace("\r\n ", "")


def test_an_absent_location_or_description_emits_no_empty_property() -> None:
    """`LOCATION:` with nothing after it renders as a blank line in some clients and as a
    location called "" in others. Omitting the property says the same thing correctly."""
    ics = render_feed([_event(location=None, description=None)], name="ג", at=T0)
    # Matched on whole lines, not on a substring: the VTIMEZONE block carries
    # `X-LIC-LOCATION:Asia/Jerusalem`, which contains `LOCATION:` and is not one.
    assert not [line for line in _lines(ics) if line.startswith("LOCATION:")]
    assert not [line for line in _lines(ics) if line.startswith("DESCRIPTION:")]


def test_the_feed_carries_no_medical_and_no_financial_data() -> None:
    """§5.12, stated as a constraint on this renderer: "The feed contains no medical and no
    financial data."

    `FeedEvent` has five text fields and none of them can hold a balance or a health flag,
    which is the durable version of that sentence -- the URL is unauthenticated and, once
    subscribed, is fetched by Google's servers on their schedule and outside our control.
    """
    assert set(FeedEvent.__dataclass_fields__) == {
        "uid",
        "starts_at",
        "ends_at",
        "summary",
        "location",
        "description",
        "cancelled",
    }


def test_the_dtstamp_is_utc_because_it_is_not_a_wall_clock_time() -> None:
    """`DTSTAMP` is when the file was generated, which is a machine fact rather than a hour a
    human turns up at. §5.12 asks for Asia/Jerusalem on DTSTART and DTEND specifically."""
    ics = render_feed([_event()], name="ג", at=T0)
    assert f"DTSTAMP:{T0.strftime('%Y%m%dT%H%M%SZ')}" in ics
