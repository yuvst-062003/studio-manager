"""G7 as a test rather than a review note: **never log declaration contents.**

CLAUDE.md states the rule twice — once as a gotcha ("Health declarations contain personal data
about minors. Never log their contents") and once as the mechanism ("Log payloads as `extra=`,
never interpolated into the message — an f-string has no key for the scrubber to match").

The milestone plan says "the M0 scrubber test covers serialization; the reviewer checks the call
sites". A reviewer checks the call sites that exist on the day they look. This checks them on every
run, by driving the two paths that actually hold a minor's answers and asserting that nothing an
answer could be spelled as reaches a log record — in the message, in the formatted output, or in
the `extra` payload the scrubber is supposed to be handed.

**Why it asserts on the raw record and not on the emitted string.** The scrubber redacts on the way
out, so a message that interpolated a phone number and was then redacted would pass a test that
read the handler's output. The bug this file is looking for is the f-string, which is invisible
downstream — by the time the record exists, `"…050-0000000…"` is the message and there is no key
for anything to match on.
"""

from __future__ import annotations

import logging

from tests.health.test_declarations import ANSWERS, SIGNATURE_B64

#: Every distinctive string a declaration in this suite contains. A substring of the signature is
#: included because base64 in a log is exactly as much a leak as the phone number is.
SECRETS = (
    "050-0000000",
    SIGNATURE_B64[:32],
)


def _record_haystack(record: logging.LogRecord) -> str:
    """Everything a record carries, as one string.

    `getMessage()` covers the message and its `%`-args. `__dict__` covers `extra=` — which is where
    a payload is *supposed* to go, and which is therefore also where a careless caller would put an
    answer thinking `extra=` made it safe. It does not: `extra=` makes it *scrubbable*, and only
    for keys the scrubber knows.
    """
    parts = [record.getMessage(), repr(record.args)]
    for key, value in record.__dict__.items():
        if key in ("msg", "args"):
            continue
        parts.append(f"{key}={value!r}")
    return "\n".join(parts)


def _assert_clean(records: list[logging.LogRecord]) -> None:
    for record in records:
        haystack = _record_haystack(record)
        for secret in SECRETS:
            assert secret not in haystack, (
                f"a health declaration's contents reached logger {record.name!r} at "
                f"{record.levelname} — G7. Log ids and counts with extra=, never the answers."
            )


def _sign(client, caller, student_id, template_id):
    return client.post(
        f"/api/v1/students/{student_id}/health-declaration",
        json={
            "template_id": str(template_id),
            "answers": ANSWERS,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers=caller.headers,
    )


def test_submitting_a_declaration_logs_no_answer_and_no_signature(
    client, as_manager, a_student, a_full_template, caplog
):
    with caplog.at_level(logging.DEBUG):
        response = _sign(client, as_manager, a_student, a_full_template)
    assert response.status_code == 201
    _assert_clean(caplog.records)


def test_reading_the_full_declaration_logs_no_answer(
    client, as_manager, a_student, a_full_template, caplog
):
    """The one route in the product that returns a minor's medical answers. If any path logs
    them, it is this one."""
    _sign(client, as_manager, a_student, a_full_template)
    with caplog.at_level(logging.DEBUG):
        response = client.get(
            f"/api/v1/students/{a_student}/health-declaration/full", headers=as_manager.headers
        )
    assert response.status_code == 200
    _assert_clean(caplog.records)


def test_a_refused_submission_logs_no_answer(
    client, as_manager, a_student, a_full_template, caplog
):
    """The refusal path is the easy one to forget. An exception handler that logged the body to
    explain the 422 would leak exactly the payload the happy path is careful with."""
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            f"/api/v1/students/{a_student}/health-declaration",
            json={
                "template_id": str(a_full_template),
                "answers": {k: v for k, v in ANSWERS.items() if k != "clause_confirmed"},
                "signature_image_base64": SIGNATURE_B64,
            },
            headers=as_manager.headers,
        )
    assert response.status_code == 422
    _assert_clean(caplog.records)


def test_publishing_a_template_logs_no_answer(
    client, as_manager, a_student, a_full_template, caplog
):
    """A publish decrypts every declaration in the studio to re-derive its flags. That is the one
    place a whole roster's answers pass through memory at once."""
    _sign(client, as_manager, a_student, a_full_template)
    client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={
            "schema": {
                "version": 1,
                "kind": "full",
                "sections": [
                    {
                        "id": "s",
                        "questions": [
                            {"id": "asthma", "type": "boolean", "label": "אסתמה?", "flag": True},
                            {
                                "id": "emergency_contact",
                                "type": "phone",
                                "label": "טלפון",
                                "required": True,
                            },
                        ],
                    }
                ],
            }
        },
        headers=as_manager.headers,
    )
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            f"/api/v1/health-templates/{a_full_template}/publish", headers=as_manager.headers
        )
    assert response.status_code == 201
    _assert_clean(caplog.records)
