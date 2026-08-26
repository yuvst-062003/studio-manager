"""One event as an RFC 5545 calendar file. §5.8's הוסף ליומן.

**Written by hand, deliberately.** `.venv` is a symlink to `main`'s, so installing an ICS
library changes it for the other lane and for `main` -- a stop-and-tell rather than a lane
decision. A VEVENT with seven properties is shorter than the case for the dependency.

**CRLF, and every timestamp UTC with a Z.** RFC 5545 §3.1 wants CRLF, and a bare LF is the
commonest reason a client rejects a file outright rather than showing a parse error. G3
stores UTC and localises at the edge -- and a calendar file is not the edge: the
subscriber's own client does that, so a floating local time lands an event an hour out
twice a year.

**Line folding at 75 octets is NOT implemented, and that is a limit rather than an
oversight.** A Hebrew title is three-byte UTF-8, so a long description can exceed it. Every
client this was checked against accepts long lines; §5.11's subscription feed (M8) is where
folding belongs, because that file carries a year of events rather than one, and getting
folding wrong across a multi-byte character is worse than not folding.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.events import Event

#: RFC 5545 §3.3.11, in the order they must be applied. The backslash is FIRST: replacing
#: the comma first and the backslash second would escape the escape, turning `\,` into
#: `\\,` -- a literal backslash followed by a live separator.
_ESCAPES = (
    ("\\", "\\\\"),
    (";", "\\;"),
    (",", "\\,"),
    ("\r\n", "\\n"),
    ("\n", "\\n"),
    ("\r", "\\n"),
)


def escape_text(value: str) -> str:
    for needle, replacement in _ESCAPES:
        value = value.replace(needle, replacement)
    return value


def as_utc_stamp(moment: datetime) -> str:
    """`20261126T080000Z`. Converted rather than assumed: a value read back from Postgres
    is timezone-aware but not necessarily in UTC."""
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def render_event_ics(event: Event, *, studio_name: str, at: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//studio-manager//events//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{event.id}",
        f"DTSTAMP:{as_utc_stamp(at)}",
        f"DTSTART:{as_utc_stamp(event.starts_at)}",
        f"DTEND:{as_utc_stamp(event.ends_at)}",
        f"SUMMARY:{escape_text(event.title)}",
        # §5.8's external venue, falling back to the studio's own name. `location_text` is
        # free text precisely because a competition is at someone else's dojo.
        f"LOCATION:{escape_text(event.location_text or studio_name)}",
        # A cancelled event reaches the subscriber's calendar as cancelled rather than
        # silently vanishing: someone who already added it keeps the row, struck through,
        # which is what §5.8's cancellation notification pairs with.
        f"STATUS:{'CANCELLED' if event.status == 'cancelled' else 'CONFIRMED'}",
    ]
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
