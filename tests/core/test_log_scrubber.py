"""SPEC 11.7 and G7 -- sensitive fields never serialize into log output."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from io import StringIO

import pytest
from app.core.logging import (
    REDACTED,
    JsonFormatter,
    ScrubbingFilter,
    is_sensitive_key,
    scrub,
)

# A realistic declaration, not a toy. Hebrew free text is the case a naive str()-based
# scrubber gets wrong.
DECLARATION = {
    "student_id": "3f2b0a1c",
    "answers": {
        "asthma": "כן, משתמש במשאף לפני אימון",
        "allergies": "אגוזים, בוטנים",
        "medication": "ונטולין",
    },
    "derived_flags": {"asthma": True, "allergy": True},
    "signature_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    "signed_by_person_id": "9a1c7d40",
}

PAYMENT = {"card_owner_name": "ישראל ישראלי", "four_digits": "4242", "amount_agorot": 25000}


@pytest.fixture
def captured() -> Iterator[StringIO]:
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ScrubbingFilter())
    logger = logging.getLogger("test.scrubber")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    yield stream
    logger.handlers = []


# -- the key predicate -------------------------------------------------------
@pytest.mark.parametrize(
    "name",
    [
        "answers",
        "answers_encrypted",
        "derived_flags",
        "signature_image",
        "signature_image_encrypted",
        "payload_encrypted",
        "medical_note",
        "card_owner_name",
        "four_digits",
        "raw_query",
        "password",
        "refresh_token",
        "ENCRYPTION_KEYS",
        "Authorization",
    ],
)
def test_sensitive_keys_are_recognised_case_insensitively(name: str):
    assert is_sensitive_key(name)


@pytest.mark.parametrize("name", ["student_id", "session_id", "amount_agorot", "status"])
def test_ordinary_keys_are_left_alone(name: str):
    assert not is_sensitive_key(name)


# -- scrub() -----------------------------------------------------------------
def test_scrub_redacts_nested_health_answers():
    cleaned = scrub(DECLARATION)
    assert cleaned["answers"] == REDACTED
    assert cleaned["derived_flags"] == REDACTED
    assert cleaned["signature_image"] == REDACTED
    assert cleaned["student_id"] == "3f2b0a1c"


def test_scrub_reaches_inside_lists():
    cleaned = scrub({"declarations": [DECLARATION, DECLARATION]})
    for entry in cleaned["declarations"]:
        assert entry["answers"] == REDACTED


def test_scrub_does_not_mutate_its_input():
    """A scrubber that mutates would silently corrupt the object the caller is about to
    persist."""
    before = json.dumps(DECLARATION, ensure_ascii=False, sort_keys=True)
    scrub(DECLARATION)
    assert json.dumps(DECLARATION, ensure_ascii=False, sort_keys=True) == before


def test_scrub_survives_a_cycle():
    node: dict[str, object] = {"answers": "secret"}
    node["self"] = node
    assert scrub(node)["answers"] == REDACTED


def test_scrub_handles_a_pydantic_model():
    """Services log schemas, not only dicts."""
    from pydantic import BaseModel

    class Declaration(BaseModel):
        student_id: str
        answers: dict[str, str]

    cleaned = scrub(Declaration(student_id="abc", answers={"medication": "ונטולין"}))
    assert cleaned["answers"] == REDACTED
    assert cleaned["student_id"] == "abc"


# -- end to end through the logging stack -----------------------------------
def test_a_health_declaration_logged_as_extra_never_reaches_the_output(captured: StringIO):
    logging.getLogger("test.scrubber").info(
        "health declaration stored", extra={"declaration": DECLARATION}
    )
    output = captured.getvalue()
    for secret in ("משאף", "בוטנים", "ונטולין", "iVBORw0KGgo"):
        assert secret not in output, f"{secret!r} reached the log"
    assert REDACTED in output


def test_card_details_never_reach_the_output(captured: StringIO):
    logging.getLogger("test.scrubber").info("payment recorded", extra={"payment": PAYMENT})
    output = captured.getvalue()
    assert "ישראל ישראלי" not in output
    assert "4242" not in output
    # G2's money is not sensitive -- redacting it would make the log useless.
    assert "25000" in output


def test_a_dict_passed_positionally_is_scrubbed_too(captured: StringIO):
    logging.getLogger("test.scrubber").info("stored %s", DECLARATION)
    assert "ונטולין" not in captured.getvalue()


def test_a_top_level_sensitive_extra_key_is_redacted_whole(captured: StringIO):
    logging.getLogger("test.scrubber").info("signed", extra={"answers": DECLARATION["answers"]})
    assert "ונטולין" not in captured.getvalue()


def test_the_output_is_valid_json_with_the_fields_an_operator_needs(captured: StringIO):
    logging.getLogger("test.scrubber").info("hello", extra={"studio_id": "abc"})
    record = json.loads(captured.getvalue().strip())
    assert record["message"] == "hello"
    assert record["level"] == "INFO"
    assert record["logger"] == "test.scrubber"
    assert record["studio_id"] == "abc"
    assert "timestamp" in record


def test_an_exception_traceback_is_carried_without_leaking_a_payload(captured: StringIO):
    try:
        raise ValueError("boom")
    except ValueError:
        logging.getLogger("test.scrubber").exception("failed", extra={"row": DECLARATION})
    record = json.loads(captured.getvalue().strip())
    assert "ValueError: boom" in record["exception"]
    assert "ונטולין" not in captured.getvalue()
