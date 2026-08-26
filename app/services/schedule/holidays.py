"""§5.6's Israeli holiday presets — **proposals the manager ticks, never closures**.

Nothing in this module writes a row or reads one. It answers "which dates might this club
close for", and `StudioClosure` is created only when a human says yes. That separation is
the whole of §5.6's rule: "Nothing is closed automatically — studios differ, and a wrong
guess deletes real lessons."

**Why arithmetic and not a dependency.** Seven holidays need a Hebrew calendar. Adding a
package touches `requirements-dev.txt`, which this lane does not own; a static table of
dates silently expires. The algorithm below is Reingold & Dershowitz's, and it is forty
lines of integers with no state.

Python's `date.toordinal()` **is** the R.D. (Rata Die) scale the algorithm is written in --
`date(1, 1, 1).toordinal() == 1` -- so the conversion out is `date.fromordinal` and nothing
else. `HEBREW_EPOCH` is the R.D. of 1 Tishrei of Hebrew year 1.

**The epoch is the bug worth naming.** `-1373429` appears in circulation and is two days
early; it produces a Rosh Hashanah on a Sunday, which לא אד״ו ראש forbids. That is what
`test_one_tishrei_never_falls_on_sunday_wednesday_or_friday` exists to catch, independently
of whether any single published date happens to line up.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

#: R.D. of 1 Tishrei, Hebrew year 1. See the module docstring on why the value matters.
HEBREW_EPOCH = -1373427

#: §5.6, in the order it lists them. `summer_break` is חופש גדול.
PRESET_KEYS = (
    "rosh_hashanah",
    "yom_kippur",
    "sukkot",
    "pesach",
    "yom_haatzmaut",
    "shavuot",
    "summer_break",
)

#: Hebrew names, used as the fallback label and as the text written into
#: `studio_closure.reason` when a manager ticks the proposal. The client renders
#: `t(locale, 'schedule.closure.preset.<key>')` and only falls back to these (D-M2-4).
PRESET_NAMES = {
    "rosh_hashanah": "ראש השנה",
    "yom_kippur": "יום כיפור",
    "sukkot": "סוכות",
    "pesach": "פסח",
    "yom_haatzmaut": "יום העצמאות",
    "shavuot": "שבועות",
    "summer_break": "חופש גדול",
}

#: The Israeli school summer holiday, as month/day. Not a festival and not derivable from
#: the Hebrew calendar — it is a Ministry of Education date, and a judo club's own summer
#: break usually starts from it. Proposed, then edited or refused like anything else.
SUMMER_BREAK_FROM = (7, 1)
SUMMER_BREAK_TO = (8, 31)


@dataclass(frozen=True)
class HolidayPreset:
    """One proposal. **No `applied` field, deliberately** — a preset is not a thing that
    can be in a state, it is a suggestion. Ticking one creates a `StudioClosure`."""

    key: str
    name: str
    date_from: date
    date_to: date


def _elapsed_days(hebrew_year: int) -> int:
    """Days from the epoch to 1 Tishrei, molad plus the דחיית ל״א אד״ו.

    The two remaining dechiyot (גטר״ד and בט״ו תקפ״ט אקרים) are not applied here; they are
    what `_year_length_correction` reconstructs from the length of the neighbouring years,
    which is the same answer reached from the other side.
    """
    months = (235 * hebrew_year - 234) // 19
    parts = 12084 + 13753 * months
    day = 29 * months + parts // 25920
    return day + 1 if (3 * (day + 1)) % 7 < 3 else day


def _year_length_correction(hebrew_year: int) -> int:
    before = _elapsed_days(hebrew_year - 1)
    this = _elapsed_days(hebrew_year)
    after = _elapsed_days(hebrew_year + 1)
    if after - this == 356:
        return 2
    if this - before == 382:
        return 1
    return 0


def hebrew_new_year(hebrew_year: int) -> date:
    """The Gregorian date of 1 Tishrei — Rosh Hashanah, day one."""
    rd = HEBREW_EPOCH + _elapsed_days(hebrew_year) + _year_length_correction(hebrew_year)
    return date.fromordinal(rd)


def _shift(anchor: date, days: int) -> date:
    return date.fromordinal(anchor.toordinal() + days)


def _spring_anchor(hebrew_year: int) -> date:
    """15 Nisan of `hebrew_year`, as a date.

    Nisan through Elul is a fixed 177 days (30+29+30+29+30+29), so 1 Nisan is always
    `hebrew_new_year(h + 1) - 177` regardless of whether the year is leap or how Cheshvan
    and Kislev fell. Counting forward from Tishrei instead would need both of those.
    """
    return _shift(hebrew_new_year(hebrew_year + 1), -163)


def _yom_haatzmaut(hebrew_year: int) -> date:
    """5 Iyar, with the observance shifts Israel legislated.

    Friday or Saturday moves **earlier**, to Thursday, so the day is not kept on Shabbat.
    Monday moves **later**, to Tuesday (the 2004 amendment), so Yom Hazikaron's eve does
    not fall on מוצאי שבת. `date.weekday()` is Monday-based: 0 Mon … 4 Fri, 5 Sat, 6 Sun.
    """
    day = _shift(_spring_anchor(hebrew_year), 20)
    weekday = day.weekday()
    if weekday == 4:  # Friday -> Thursday
        return _shift(day, -1)
    if weekday == 5:  # Saturday -> Thursday
        return _shift(day, -2)
    if weekday == 0:  # Monday -> Tuesday
        return _shift(day, 1)
    return day


def _presets_for_hebrew_year(hebrew_year: int) -> list[HolidayPreset]:
    new_year = hebrew_new_year(hebrew_year)
    spring = _spring_anchor(hebrew_year)

    def preset(key: str, date_from: date, date_to: date) -> HolidayPreset:
        return HolidayPreset(key=key, name=PRESET_NAMES[key], date_from=date_from, date_to=date_to)

    atzmaut = _yom_haatzmaut(hebrew_year)
    return [
        # 1-2 Tishrei. Two days in Israel as well as outside it — Rosh Hashanah is the one
        # festival where the diaspora's second day is kept here too.
        preset("rosh_hashanah", new_year, _shift(new_year, 1)),
        preset("yom_kippur", _shift(new_year, 9), _shift(new_year, 9)),
        # 15-22 Tishrei: Sukkot through Simchat Torah. Clubs that train through חול המועד
        # untick it or shorten it; that is what a proposal is for.
        preset("sukkot", _shift(new_year, 14), _shift(new_year, 21)),
        # 15-21 Nisan. Seven days, not eight: this is an Israeli club.
        preset("pesach", spring, _shift(spring, 6)),
        preset("yom_haatzmaut", atzmaut, atzmaut),
        # 6 Sivan, one day.
        preset("shavuot", _shift(spring, 50), _shift(spring, 50)),
    ]


def presets_for_year(year: int) -> list[HolidayPreset]:
    """Every §5.6 proposal touching Gregorian `year`, in date order.

    §7 spells the endpoint `GET /holiday-presets?year=2026`, a **Gregorian** year, and a
    Gregorian year always straddles two Hebrew ones: 2026 holds Pesach of 5786 and Rosh
    Hashanah of 5787. Both are computed and then filtered by overlap, which is also what
    makes a training year spanning September to June a matter of asking twice.
    """
    # Hebrew year H starts in Gregorian H-3761 or H-3760; both candidates are generated
    # and the overlap filter decides, rather than a boundary condition someone has to get
    # right.
    candidates: list[HolidayPreset] = []
    for hebrew_year in (year + 3760, year + 3761):
        candidates.extend(_presets_for_hebrew_year(hebrew_year))
    candidates.append(
        HolidayPreset(
            key="summer_break",
            name=PRESET_NAMES["summer_break"],
            date_from=date(year, *SUMMER_BREAK_FROM),
            date_to=date(year, *SUMMER_BREAK_TO),
        )
    )

    inside = [p for p in candidates if p.date_from.year == year or p.date_to.year == year]
    return sorted(inside, key=lambda p: (p.date_from, p.key))
