"""§5.6's seven Israeli holidays, as dates a manager can tick.

Every expected date below is a real-world published date, not a value this module
produced. That is the whole point of the file: an arithmetic Hebrew calendar is easy to
write plausibly and wrong, and the two-day epoch error in particular yields a Rosh Hashanah
on a Sunday — which the לא אד״ו ראש rule forbids outright, and which the second test here
catches independently of any single date.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.schedule.holidays import (
    PRESET_KEYS,
    HolidayPreset,
    hebrew_new_year,
    presets_for_year,
)

#: 1 Tishrei, published. Five consecutive years, so a formula that happens to be right for
#: one year cannot pass.
KNOWN_ROSH_HASHANAH = {
    5786: date(2025, 9, 23),
    5787: date(2026, 9, 12),
    5788: date(2027, 10, 2),
    5789: date(2028, 9, 21),
    5790: date(2029, 9, 10),
}


@pytest.mark.parametrize(("hebrew_year", "expected"), sorted(KNOWN_ROSH_HASHANAH.items()))
def test_rosh_hashanah_matches_the_published_date(hebrew_year: int, expected: date):
    assert hebrew_new_year(hebrew_year) == expected


def test_one_tishrei_never_falls_on_sunday_wednesday_or_friday():
    """לא אד״ו ראש. Independent of any single published date: a postponement rule dropped
    from the implementation shows up here across a century even if 5787 happens to survive.
    `date.weekday()` is Monday-based, so Sunday is 6, Wednesday 2, Friday 4."""
    forbidden = {6, 2, 4}
    for hebrew_year in range(5750, 5850):
        assert hebrew_new_year(hebrew_year).weekday() not in forbidden, hebrew_year


def test_the_seven_presets_of_5_6_are_offered_and_no_others():
    assert PRESET_KEYS == (
        "rosh_hashanah",
        "yom_kippur",
        "sukkot",
        "pesach",
        "yom_haatzmaut",
        "shavuot",
        "summer_break",
    )


def test_presets_for_2026_carry_the_published_dates():
    """Gregorian 2026 spans the tail of Hebrew 5786 (spring) and the head of 5787 (autumn),
    which is why the endpoint takes a Gregorian year and the function has to look at two
    Hebrew ones."""
    by_key = {p.key: p for p in presets_for_year(2026)}

    assert by_key["pesach"].date_from == date(2026, 4, 2)
    assert by_key["pesach"].date_to == date(2026, 4, 8)  # 15-21 Nisan, Israel keeps 7
    assert by_key["yom_haatzmaut"].date_from == date(2026, 4, 22)
    assert by_key["shavuot"].date_from == date(2026, 5, 22)
    assert by_key["rosh_hashanah"].date_from == date(2026, 9, 12)
    assert by_key["rosh_hashanah"].date_to == date(2026, 9, 13)
    assert by_key["yom_kippur"].date_from == date(2026, 9, 21)
    assert by_key["sukkot"].date_from == date(2026, 9, 26)


def test_yom_haatzmaut_is_moved_when_5_iyar_falls_on_a_monday():
    """The 2004 rule: 5 Iyar on Monday moves the day to Tuesday, so Yom Hazikaron's eve
    does not fall on מוצאי שבת. 5 Iyar 5788 is Monday 1 May 2028."""
    by_key = {p.key: p for p in presets_for_year(2028)}
    assert by_key["yom_haatzmaut"].date_from == date(2028, 5, 2)


def test_summer_break_is_a_gregorian_proposal_not_a_hebrew_date():
    """חופש גדול is the Israeli school summer holiday, not a festival. Proposed as
    1 July – 31 August, which the manager edits or refuses like any other proposal."""
    by_key = {p.key: p for p in presets_for_year(2026)}
    assert by_key["summer_break"] == HolidayPreset(
        key="summer_break",
        name="חופש גדול",
        date_from=date(2026, 7, 1),
        date_to=date(2026, 8, 31),
    )


def test_every_preset_is_returned_in_date_order_and_lands_inside_the_asked_for_year():
    presets = presets_for_year(2027)
    assert presets == sorted(presets, key=lambda p: p.date_from)
    for preset in presets:
        assert preset.date_from.year == 2027 or preset.date_to.year == 2027
        assert preset.date_to >= preset.date_from


def test_a_preset_is_a_proposal_and_carries_no_applied_state():
    """§5.6 — 'proposals the manager ticks, never automatic closures'. A preset that could
    be in a state is a preset something could apply on the manager's behalf."""
    fields = set(HolidayPreset.__dataclass_fields__)
    assert fields == {"key", "name", "date_from", "date_to"}
