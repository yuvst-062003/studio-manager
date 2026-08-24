"""SPEC §13 invariant 4 / SPEC §11.7 / G7: health data never appears in serialized log
output.

Not a unit test of `scrub()` -- `tests/core/test_log_scrubber.py` is that. This runs a
realistic declaration through the logging stack the application actually configures, and
greps the bytes that come out.
"""

from __future__ import annotations

import logging
from io import StringIO

import pytest
from app.core.logging import REDACTED, JsonFormatter, ScrubbingFilter

DECLARATION = {
    "student_id": "8b0d4c2e",
    "template_version": 3,
    "answers": {
        "chronic_illness": "אסתמה",
        "medication": "ונטולין, לפני אימון",
        "allergies": "בוטנים ואגוזי לוז",
        "surgeries": "ניתוח ברך 2024",
        "free_text": "יש לפנות לאמא בכל מקרה של קוצר נשימה",
    },
    "derived_flags": {"asthma": True, "allergy": True, "medication": True},
    "signature_image": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
}

# Every value a coach, a log aggregator or a support engineer must never see.
SECRETS = [
    "אסתמה",
    "ונטולין",
    "בוטנים",
    "אגוזי לוז",
    "ניתוח ברך",
    "קוצר נשימה",
    "iVBORw0KGgo",
]


def _logger(name: str) -> tuple[logging.Logger, StringIO]:
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())
    logger = logging.getLogger(name)
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    return logger, stream


@pytest.fixture
def emitted() -> tuple[logging.Logger, StringIO]:
    return _logger("invariant.health")


def test_a_declaration_logged_as_extra_never_serializes(emitted):
    logger, stream = emitted
    logger.info("declaration signed", extra={"declaration": DECLARATION})
    for secret in SECRETS:
        assert secret not in stream.getvalue(), f"{secret!r} reached the log"


def test_a_declaration_logged_positionally_never_serializes(emitted):
    logger, stream = emitted
    logger.warning("stored %s", DECLARATION)
    for secret in SECRETS:
        assert secret not in stream.getvalue()


def test_a_list_of_declarations_never_serializes(emitted):
    logger, stream = emitted
    logger.info("batch", extra={"batch": {"rows": [DECLARATION, DECLARATION]}})
    for secret in SECRETS:
        assert secret not in stream.getvalue()


def test_a_declaration_inside_an_exception_path_never_serializes(emitted):
    logger, stream = emitted
    try:
        raise RuntimeError("pdf render failed")
    except RuntimeError:
        logger.exception("render", extra={"row": DECLARATION})
    output = stream.getvalue()
    assert "pdf render failed" in output
    for secret in SECRETS:
        assert secret not in output


def test_the_non_sensitive_context_an_operator_needs_survives(emitted):
    """A scrubber that redacts everything is a scrubber nobody keeps switched on."""
    logger, stream = emitted
    logger.info("declaration signed", extra={"declaration": DECLARATION})
    output = stream.getvalue()
    assert "8b0d4c2e" in output
    assert REDACTED in output


# -- proven to fire ----------------------------------------------------------
def test_the_same_payload_without_the_filter_does_leak():
    """The control.

    Without ScrubbingFilter the answers land in the output verbatim. That is what proves
    the assertions above are testing the filter rather than the absence of the data.
    """
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("invariant.health.control")
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    logger.info("declaration signed", extra={"declaration": DECLARATION})
    assert "ונטולין" in stream.getvalue()
    logger.handlers = []
