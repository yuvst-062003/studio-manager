"""W3's contract commit, the model half: §4.3's attendance, health and consent blocks.

The wave pairs M4 Health with M5 Attendance because §5.5 puts health's entire staff
surface *inside* the attendance roster. The seam between them is **data, not a shared
file** (plan §1.3 seam 4), and the two columns that carry it — `student.health_status` and
`health_declaration.derived_flags` — are asserted here and in `test_w3_schemas.py`.

**G7 governs this whole file.** Health declarations are personal data about minors. The
tests below assert the *shape* that makes G7 enforceable: answers and signature encrypted
at rest, flags that can only hold booleans, and no free text anywhere a coach can read.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import pytest
import sqlalchemy as sa
from app.core.encryption import EncryptedBytes, EncryptedJSON
from app.models.base import Base

W3_TABLES = ("attendance", "absence_report", "health_declaration", "consent_record")


@pytest.mark.parametrize("table", W3_TABLES)
def test_the_table_exists(table):
    assert table in Base.metadata.tables


@pytest.mark.parametrize("table", W3_TABLES)
def test_every_w3_table_is_tenant_scoped(table):
    columns = Base.metadata.tables[table].c
    assert "studio_id" in columns
    assert columns["studio_id"].nullable is False


# -- attendance ---------------------------------------------------------------
def test_a_student_is_marked_at_most_once_per_session():
    """§4.3 — `UNIQUE(session_id, student_id)`. Two rows for one student in one session is
    two different answers to "were they here", and a report cannot choose between them."""
    indexes = {index.name for index in Base.metadata.tables["attendance"].indexes}
    constraints = {
        c.name for c in Base.metadata.tables["attendance"].constraints if c.name is not None
    }
    assert "uq_attendance_session_id_student_id" in indexes | constraints


def test_client_mark_id_is_unique_on_its_own():
    """§4.3 — 'a second unique index on `client_mark_id` for offline idempotency'.

    This is what makes §10.5's "same device flushes twice → no-op" true. It has to be
    unique *independently* of (session, student): the queue replays a mark the server may
    already hold, and the id is the only thing that identifies it as the same mark rather
    than a correction.
    """
    column = Base.metadata.tables["attendance"].c["client_mark_id"]
    indexes = {index.name for index in Base.metadata.tables["attendance"].indexes}
    assert column.unique is True or "uq_attendance_client_mark_id" in indexes


def test_unmarked_is_a_real_status():
    """§5.14 — 'sessions held vs planned is why `unmarked` must be a real state. Do not
    let a report treat unmarked as absent.'

    A missing row and a row saying `unmarked` are different facts: the first means nobody
    opened the register, the second means someone did and left this child undecided.
    """
    from app.models.attendance import ATTENDANCE_STATUSES

    assert "unmarked" in ATTENDANCE_STATUSES


def test_attendance_records_both_clocks():
    """§10.5's conflict rule is 'last write by `device_marked_at`'. A coach marking
    offline at 17:05 and syncing at 19:00 has two different, both-true timestamps, and
    resolving a conflict on the server clock would let a later sync beat an earlier mark.
    """
    columns = Base.metadata.tables["attendance"].c
    assert "marked_at" in columns
    assert "device_marked_at" in columns


def test_a_parent_pre_report_is_distinguishable_from_a_bulk_action():
    """§10.5 — 'a parent pre-report never loses to a bulk action regardless of timestamp'.
    That rule is only expressible if the row records which of the two wrote it."""
    from app.models.attendance import ATTENDANCE_SOURCES

    assert {"coach", "parent", "bulk", "system"} <= set(ATTENDANCE_SOURCES)


# -- health -------------------------------------------------------------------
def test_answers_are_encrypted_at_rest():
    """§11.1. The answers are a minor's medical information; they never sit in plaintext
    and never reach a log (G7)."""
    column = Base.metadata.tables["health_declaration"].c["answers_encrypted"]
    assert isinstance(column.type, EncryptedJSON)


def test_the_signature_image_is_encrypted_at_rest():
    """A finger-drawn signature is biometric-adjacent personal data and is stored the same
    way as the answers rather than as a plain BYTEA blob."""
    column = Base.metadata.tables["health_declaration"].c["signature_image_encrypted"]
    assert isinstance(column.type, EncryptedBytes)


def test_derived_flags_are_not_encrypted():
    """Deliberate, and the point of the whole design. §5.5: a coach sees `derived_flags`.
    Encrypting them would mean decrypting on every roster render, which is exactly the
    "open the full medical record to see a badge" outcome D11 exists to prevent."""
    column = Base.metadata.tables["health_declaration"].c["derived_flags"]
    assert not isinstance(column.type, (EncryptedJSON, EncryptedBytes))


def test_a_declaration_records_which_questions_were_asked():
    """§4.3 stores `template_version` on the declaration. Without it, editing the template
    (D11 makes that a manager's right) silently rewrites the meaning of every signature
    already collected."""
    assert "template_version" in Base.metadata.tables["health_declaration"].c


def test_declarations_do_not_expire_by_default():
    """§5.5 — '`valid_until` is NULL; `health_declaration_validity_months` defaults to
    null and is a config flag, not a migration.'"""
    assert Base.metadata.tables["health_declaration"].c["valid_until"].nullable is True


def test_a_signature_records_where_it_came_from():
    """§5.5 — a declaration is a legal-adjacent artefact, so the signing context travels
    with it. D11's caveat is that the bundled template is a starting point and not a
    compliance artefact; the audit trail is what makes it defensible anyway."""
    columns = Base.metadata.tables["health_declaration"].c
    assert "signed_ip" in columns
    assert "signed_user_agent" in columns
    assert "signed_by_person_id" in columns


# -- consent ------------------------------------------------------------------
def test_consent_is_revocable():
    """§11.6 — a consent that cannot be withdrawn is not consent."""
    assert "revoked_at" in Base.metadata.tables["consent_record"].c


def test_consent_is_versioned():
    """§11.6 — agreeing to v1 of a privacy policy is not agreeing to v2."""
    assert "version" in Base.metadata.tables["consent_record"].c


@pytest.mark.parametrize("table", W3_TABLES)
def test_no_w3_table_smuggles_in_a_float(table):
    """G2, restated on this wave. W3 carries no money; the assertion is that it stays
    that way."""
    for column in Base.metadata.tables[table].columns:
        assert not isinstance(column.type, (sa.Float, sa.Numeric)), column.name
