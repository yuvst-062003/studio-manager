"""SPEC §11.7 -- structured JSON logs with a scrubbing filter.

    "No health data, card owner names or last-4 digits in application logs --
     enforced by a log scrubber and a test that asserts sensitive fields never
     serialize into log output."

G7 says the same about health declarations specifically: never log their contents.

**What this covers, and what it does not.** Scrubbing is *by key*. Anything passed as
``extra=``, and any dict, list, dataclass or Pydantic model passed as a positional
argument, is walked and redacted. A raw f-string that interpolates an answer straight
into the message -- ``logger.info(f"answers={answers}")`` -- has no key to match and
cannot be caught here. That is a code-review rule, not a runtime guarantee, and
pretending otherwise would be worse than saying so. **Log the payload as ``extra``,
never in the message.**

``derived_flags`` is redacted even though coaches are allowed to see it: allowed *in the
app*, in front of the one coach who needs it, is not the same as allowed *in a log file
an operator greps*.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any

REDACTED = "[redacted]"

SENSITIVE_KEYS = frozenset(
    {
        # Health (§11.1, G7)
        "answers",
        "answers_encrypted",
        "derived_flags",
        "health_answers",
        "health_declaration",
        "signature_image",
        "signature_image_encrypted",
        "medical_note",
        "medical_notes",
        "payload_encrypted",
        # Payments (§11.7; §12 -- uPay's IPN carries card details in its query string)
        "card_owner_name",
        "four_digits",
        "card_number",
        "raw_query",
        # Credentials
        "password",
        "secret",
        "token",
        "refresh_token",
        "access_token",
        "id_token",
        "authorization",
        "api_key",
        "encryption_keys",
        "private_key",
    }
)

#: Matched as substrings, so a lane's new column is covered the day it lands rather than
#: the day someone remembers to extend the set above.
SENSITIVE_SUBSTRINGS = (
    "_encrypted",
    "password",
    "secret",
    "token",
    "authorization",
    "api_key",
    "card_owner",
    "four_digits",
)

_MAX_DEPTH = 12

#: Attributes logging puts on every record. Anything else came from ``extra``.
_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "message",
    "asctime",
    "taskName",
}


def is_sensitive_key(name: str) -> bool:
    lowered = name.lower()
    return lowered in SENSITIVE_KEYS or any(s in lowered for s in SENSITIVE_SUBSTRINGS)


def scrub(value: Any, _depth: int = 0, _seen: frozenset[int] = frozenset()) -> Any:
    """Return a copy with every sensitive key's value replaced.

    Never mutates its input: the caller is usually about to persist the object it just
    logged.
    """
    if _depth > _MAX_DEPTH or id(value) in _seen:
        return REDACTED
    if is_dataclass(value) and not isinstance(value, type):
        value = asdict(value)
    elif hasattr(value, "model_dump"):  # pydantic v2, without importing it here
        value = value.model_dump()

    if isinstance(value, dict):
        seen = _seen | {id(value)}
        return {
            str(k): REDACTED if is_sensitive_key(str(k)) else scrub(v, _depth + 1, seen)
            for k, v in value.items()
        }
    if isinstance(value, list | tuple | set):
        seen = _seen | {id(value)}
        return [scrub(v, _depth + 1, seen) for v in value]
    return value


class ScrubbingFilter(logging.Filter):
    """Installed on every handler. Always returns True -- it edits, it never drops."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key in _RESERVED:
                continue
            record.__dict__[key] = (
                REDACTED if is_sensitive_key(key) else scrub(record.__dict__[key])
            )
        if isinstance(record.args, dict):
            record.args = scrub(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(scrub(a) for a in record.args)
        if isinstance(record.msg, dict | list):
            record.msg = scrub(record.msg)
        return True


class JsonFormatter(logging.Formatter):
    """SPEC §8.1 -- structured JSON logs. ``ensure_ascii=False`` keeps Hebrew readable
    rather than turning every message into escape sequences."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Install the formatter and the filter on the root logger. Called from main."""
    from app.core.config import settings

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL.upper())
