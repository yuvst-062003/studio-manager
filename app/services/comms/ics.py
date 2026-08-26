"""§5.12's subscription feed: a year of sessions, in RFC 5545, in Asia/Jerusalem.

`app/services/events/ics.py` renders ONE event and deliberately left two things here, in its
own words: "Line folding at 75 octets is NOT implemented, and that is a limit rather than an
oversight... §5.11's subscription feed (M8) is where folding belongs, because that file
carries a year of events rather than one, and getting folding wrong across a multi-byte
character is worse than not folding."

This adds folding, and the thing a year-long feed needs that a single event does not: real
`VTIMEZONE` data.

**Why a VTIMEZONE rather than M7's UTC stamps.** A `Z`-suffixed UTC time is unambiguous and
needs no timezone block, which is right for a one-off download. §5.12 asks for `DTSTART` and
`DTEND` **in Asia/Jerusalem**, and a local time with no VTIMEZONE is a FLOATING time -- it
means "15:00 wherever the reader happens to be". An Israeli parent abroad would see the wrong
hour for their whole trip, and everybody would see the wrong hour during the weeks when Israel
and the subscriber's country have changed their clocks on different dates. The timetable says
17:00; the feed has to say 17:00 and mean it.

**Written by hand, and no dependency added.** M7 made the same call for the same reason:
installing an ICS library is a change to an environment two lanes share, and a VTIMEZONE plus
a fold is shorter than the case for it.

**§5.12: "The feed contains no medical and no financial data."** `FeedEvent` has five text
fields and nowhere to put a balance or a health flag. That is the durable form of the
sentence, because the URL is unauthenticated by design and, once subscribed, is fetched by
Google's servers on their schedule and outside our control.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

# One definition of RFC 5545 §3.3.11's escaping, imported rather than copied. The order is
# subtle -- the backslash must be replaced first or it escapes the escapes -- and two copies
# of a rule like that is one copy too many.
from app.services.events.ics import as_utc_stamp, escape_text

JERUSALEM = ZoneInfo("Asia/Jerusalem")

#: Israel's own clock-change rules, from tzdata's `Zion` zone.
#:
#: **The EU rule is close and wrong.** Israel springs forward on the FRIDAY BEFORE the last
#: Sunday of March -- tzdata writes it `Mar Fri>=23 2:00`, which is what `BYDAY=FR` with
#: `BYMONTHDAY=23..29` expresses -- while the EU switches on the last Sunday. A feed that
#: assumed the EU rule would put every Israeli lesson an hour out for the last weekend of
#: March, every year, and nobody would report it as a calendar bug.
#:
#: The autumn change is the ordinary last Sunday of October.
#:
#: `DTSTART` inside a VTIMEZONE component is a LOCAL time with no zone by definition (RFC 5545
#: §3.6.5), which is why these two carry no `Z` and no TZID.
VTIMEZONE_ASIA_JERUSALEM = (
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Jerusalem",
    "X-LIC-LOCATION:Asia/Jerusalem",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0300",
    "TZNAME:IDT",
    "DTSTART:19700327T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0200",
    "TZNAME:IST",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
)


@dataclass(frozen=True)
class FeedEvent:
    """One row in a subscribed calendar.

    Five text fields and a flag, and that is the whole shape. §5.12 forbids medical and
    financial data in the feed, and a structure with nowhere to put either is a stronger
    guarantee than a rule somebody has to remember when they add a column.
    """

    #: §5.12 -- "a stable `UID` derived from the session id". Stable across renders, or every
    #: refresh becomes a delete-and-recreate in the subscriber's calendar.
    uid: str
    starts_at: datetime
    ends_at: datetime
    #: §5.12's example: `דנה · ג'ודו/מתחילים`.
    summary: str
    location: str | None = None
    #: §5.12 puts the coach here.
    description: str | None = None
    cancelled: bool = False


def local_stamp(moment: datetime) -> str:
    """`20261115T170000`, in Asia/Jerusalem, to be paired with `;TZID=Asia/Jerusalem`.

    Converted rather than assumed: G3 stores UTC and a value read back from Postgres is
    timezone-aware but not necessarily *in* UTC.

    A naive datetime raises. It came from somewhere this renderer does not control, and
    guessing that it meant UTC would move a lesson by two or three hours without any error to
    notice -- the exact failure §5.12's whole timezone section exists to prevent.
    """
    if moment.tzinfo is None:
        raise ValueError("a feed timestamp must be timezone-aware (G3 stores UTC)")
    return moment.astimezone(JERUSALEM).strftime("%Y%m%dT%H%M%S")


def fold(line: str) -> str:
    """RFC 5545 §3.1: no content line longer than 75 OCTETS; continuations begin with a space.

    The leading space counts toward the continuation's own 75, so a continuation carries 74
    octets of content.

    **Split on encoded bytes, and never inside a codepoint.** This is the whole reason M7
    deferred folding to this file: a Hebrew character is three-byte UTF-8, so folding by
    CHARACTER count overruns the octet limit, and folding by byte count without checking
    boundaries cuts a codepoint in half and puts mojibake in a parent's calendar. A UTF-8
    continuation byte is `0b10xxxxxx`, so backing off while `byte & 0xC0 == 0x80` lands on a
    character boundary.
    """
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line

    chunks: list[bytes] = []
    start, limit = 0, 75
    while start < len(raw):
        end = min(start + limit, len(raw))
        while end < len(raw) and raw[end] & 0xC0 == 0x80:
            end -= 1
        chunks.append(raw[start:end])
        start, limit = end, 74
    return "\r\n ".join(chunk.decode("utf-8") for chunk in chunks)


def _event_lines(event: FeedEvent, *, at: datetime) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{event.uid}",
        # REQUIRED by RFC 5545 §3.6.1 in every VEVENT, and a UTC `Z` stamp rather than a local
        # one: it records when this file was generated, which is a machine fact rather than an
        # hour a human turns up at. §5.12 asks for Asia/Jerusalem on DTSTART and DTEND.
        f"DTSTAMP:{as_utc_stamp(at)}",
        f"DTSTART;TZID=Asia/Jerusalem:{local_stamp(event.starts_at)}",
        f"DTEND;TZID=Asia/Jerusalem:{local_stamp(event.ends_at)}",
        f"SUMMARY:{escape_text(event.summary)}",
        # §5.12 -- a cancelled session reaches the subscriber's calendar as cancelled rather
        # than silently vanishing. Somebody who already added it keeps the row, struck
        # through, which is what §5.11's cancellation push pairs with.
        f"STATUS:{'CANCELLED' if event.cancelled else 'CONFIRMED'}",
    ]
    # Omitted rather than emitted empty: `LOCATION:` with nothing after it renders as a blank
    # line in some clients and as a location named "" in others.
    if event.location:
        lines.append(f"LOCATION:{escape_text(event.location)}")
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    lines.append("END:VEVENT")
    return lines


def render_feed(events: Sequence[FeedEvent], *, name: str, at: datetime) -> str:
    """The whole subscription file.

    An empty `events` still produces a valid calendar. A guardian whose children have no
    sessions this year has still subscribed, and returning nothing -- or a 404 -- would leave
    their calendar client showing an error indefinitely.

    `DTSTAMP` stays a UTC `Z` stamp while DTSTART and DTEND are local: it records when the
    file was generated, which is a machine fact rather than an hour a human turns up at.
    §5.12 asks for Asia/Jerusalem on the two that are.
    """
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//studio-manager//feed//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(name)}",
        *VTIMEZONE_ASIA_JERUSALEM,
    ]
    for event in events:
        lines.extend(_event_lines(event, at=at))
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(line) for line in lines) + "\r\n"


__all__ = [
    "JERUSALEM",
    "VTIMEZONE_ASIA_JERUSALEM",
    "FeedEvent",
    "as_utc_stamp",
    "fold",
    "local_stamp",
    "render_feed",
]
