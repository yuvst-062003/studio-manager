"""§6.1 step 5 -- `5  אישורים  →  terms of service + privacy policy`, the BLOCKING gate.

SPEC:1314 puts step 5 in the blocking band and SPEC:1327 states "Steps 5 and 6 are the
only hard gates." Step 6 shipped in M4 and step 5 did not: `ConsentRecord` was constructed
in exactly one place in the product (`app/services/events/rsvp.py`, the per-event
competition consent), so of the five `CONSENT_TYPES` only `event` was ever written and no
guardian had ever accepted terms or a privacy policy in a product built around health data
about minors.

**What these tests hold, and why each is here rather than left to the screen:**

  * A grant is a ROW, and a re-grant is a NEW row. `ConsentRecord`'s own docstring:
    "`granted` is a boolean rather than a status because a withdrawal is a *new row*, not
    an edit". A ledger that UPDATEs cannot answer "what did they agree to, and when",
    which is the only question the table exists for.
  * The row records the VERSION of the text that was on screen. The policy text this wave
    ships is an unreviewed draft, so every acceptance made against it must stay findable
    after a lawyer rewrites it -- `POLICY_VERSION` is 0 for exactly that reason and the
    first reviewed policy is 1.
  * §11.2 audits the acceptance, and the audit `diff` never carries the policy text or the
    IP. The IP has a column of its own on both tables; a `diff` is read by people.
"""

from __future__ import annotations

from app.models.audit import AuditLog
from app.models.health import ConsentRecord
from app.services.privacy import POLICY_VERSION, POLICY_VERSION_LABEL
from sqlalchemy import select
from tests.privacy.conftest import T0, Caller


def test_a_fresh_guardian_owes_both_consents(client, as_guardian: Caller):
    """The gate's read. Nothing accepted yet, so both of step 5's consents are outstanding."""
    response = client.get("/api/v1/privacy/consents", headers=as_guardian.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outstanding"] == ["terms", "privacy"]
    assert body["required"] == ["terms", "privacy"]
    assert body["policy_version"] == POLICY_VERSION
    # The text is reviewed now (POLICY_VERSION > 0), so the screen must NOT say "draft" --
    # and it reads that from here rather than from a hardcoded client constant that the
    # next draft would leave lying.
    assert body["policy_is_draft"] is False
    assert body["policy_version_label"] == POLICY_VERSION_LABEL


def test_accepting_writes_one_row_per_consent_and_clears_the_gate(
    client, as_guardian: Caller, tenant_session
):
    response = client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"terms": True, "privacy": True}},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["outstanding"] == []

    rows = (
        tenant_session.execute(
            select(ConsentRecord).where(ConsentRecord.subject_id == as_guardian.person_id)
        )
        .scalars()
        .all()
    )
    assert sorted(row.consent_type for row in rows) == ["privacy", "terms"]
    for row in rows:
        # §4.3 -- "a terms acceptance is about the adult who accepted it".
        assert row.subject_type == "person"
        assert row.granted is True
        assert row.revoked_at is None
        assert row.version == POLICY_VERSION
        assert row.granted_at is not None

    # And the gate is clear on a fresh read, not only in the POST's own response.
    assert (
        client.get("/api/v1/privacy/consents", headers=as_guardian.headers).json()["outstanding"]
        == []
    )


def test_re_accepting_appends_and_never_updates(client, as_guardian: Caller, tenant_session):
    """The property the table exists for: two acceptances are two rows.

    An UPDATE would leave one row whose `granted_at` is the LAST time somebody tapped
    accept, and no record of the first -- so "when did this family agree" would be
    answerable only for the most recent tap.
    """
    body = {"version": POLICY_VERSION, "grants": {"terms": True, "privacy": True}}
    first = client.post("/api/v1/privacy/consents", json=body, headers=as_guardian.headers)
    assert first.status_code == 200, first.text
    second = client.post("/api/v1/privacy/consents", json=body, headers=as_guardian.headers)
    assert second.status_code == 200, second.text

    rows = (
        tenant_session.execute(
            select(ConsentRecord).where(ConsentRecord.subject_id == as_guardian.person_id)
        )
        .scalars()
        .all()
    )
    assert len(rows) == 4
    assert len([r for r in rows if r.consent_type == "terms"]) == 2


def test_withdrawing_is_a_new_row_and_the_gate_comes_back(
    client, as_guardian: Caller, tenant_session
):
    """ "A consent that cannot be withdrawn is not consent" -- ConsentRecord's docstring.

    Withdrawing the privacy consent puts §6.1's gate back in front of the app, which is the
    honest consequence and not a bug: the product cannot process the family's data without
    it.
    """
    client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"terms": True, "privacy": True}},
        headers=as_guardian.headers,
    )
    withdrawal = client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"privacy": False}},
        headers=as_guardian.headers,
    )
    assert withdrawal.status_code == 200, withdrawal.text
    assert withdrawal.json()["outstanding"] == ["privacy"]

    rows = (
        tenant_session.execute(
            select(ConsentRecord).where(
                ConsentRecord.subject_id == as_guardian.person_id,
                ConsentRecord.consent_type == "privacy",
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    # The grant is untouched; the withdrawal is the new row beside it.
    assert sorted(row.granted for row in rows) == [False, True]
    revoked = next(row for row in rows if row.granted is False)
    assert revoked.revoked_at is not None


def test_photo_video_consent_is_recordable_and_defaults_to_nothing(
    client, as_guardian: Caller, tenant_session
):
    """§6.1 step 7. Skippable, so the gate never asks for it -- but it must be RECORDABLE.

    SPEC: "Skipping = NO consent recorded (the safe default)". Nothing here writes a row
    unless the guardian asked for one, and `photo_video` is deliberately absent from
    `required` so it can never block.
    """
    state = client.get("/api/v1/privacy/consents", headers=as_guardian.headers).json()
    assert "photo_video" not in state["required"]
    assert state["outstanding"] == ["terms", "privacy"]
    assert (
        not tenant_session.execute(
            select(ConsentRecord).where(ConsentRecord.consent_type == "photo_video")
        )
        .scalars()
        .all()
    )

    granted = client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"photo_video": True}},
        headers=as_guardian.headers,
    )
    assert granted.status_code == 200, granted.text
    # Still blocked on step 5 -- a photo consent is not a terms acceptance.
    assert granted.json()["outstanding"] == ["terms", "privacy"]
    photo = (
        tenant_session.execute(
            select(ConsentRecord).where(ConsentRecord.consent_type == "photo_video")
        )
        .scalars()
        .all()
    )
    assert len(photo) == 1
    assert photo[0].granted is True


def test_an_event_consent_cannot_be_granted_here(client, as_guardian: Caller):
    """`event` is per-STUDENT and belongs to the RSVP flow (app/services/events/rsvp.py).

    Accepting one through this route would write `subject_type='person'` for a consent
    §4.3 defines as being about a child, and the event it referred to would be nowhere.
    """
    response = client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"event": True}},
        headers=as_guardian.headers,
    )
    assert response.status_code == 422, response.text


def test_accepting_a_version_that_is_not_on_screen_is_refused(client, as_guardian: Caller):
    """The client posts back the version it RENDERED. A mismatch means the text changed.

    Recording the server's current version for a screen that showed the previous one is
    how a consent ledger comes to hold agreements nobody made.
    """
    response = client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION + 7, "grants": {"terms": True}},
        headers=as_guardian.headers,
    )
    assert response.status_code == 409, response.text


def test_the_acceptance_is_audited_and_the_diff_holds_no_policy_text(
    client, as_guardian: Caller, app_session
):
    """§11.2 lists consent changes among the always-audited actions.

    The `diff` carries the three facts a person answering "what did they agree to" needs
    and nothing else. Never the policy body -- an audit row is not a copy of the document
    -- and never the IP, which has its own column on both tables.
    """
    client.post(
        "/api/v1/privacy/consents",
        json={"version": POLICY_VERSION, "grants": {"terms": True, "privacy": True}},
        headers=as_guardian.headers,
    )
    entries = (
        app_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "consent_record",
                AuditLog.actor_person_id == as_guardian.person_id,
            )
        )
        .scalars()
        .all()
    )
    assert len(entries) == 2
    for entry in entries:
        assert entry.action == "consent.grant"
        assert entry.diff is not None
        assert set(entry.diff) == {"consent_type", "version", "granted"}
        assert entry.studio_id == as_guardian.studio_id


def test_consents_need_a_signed_in_caller(client):
    assert client.get("/api/v1/privacy/consents").status_code == 401
    assert (
        client.post(
            "/api/v1/privacy/consents",
            json={"version": POLICY_VERSION, "grants": {"terms": True}},
        ).status_code
        == 401
    )


def test_a_grant_at_the_pre_bump_version_no_longer_clears_the_gate(
    client, as_guardian: Caller, tenant_session
):
    """Decision 24 raises `POLICY_VERSION` from 1 to 2, precisely so a family who accepted
    the OLD text is asked again. The POST route itself refuses to record anything but the
    version currently on screen (`test_accepting_a_version_that_is_not_on_screen_is_
    refused`), so the only way to represent "a family who agreed under the old copy" is to
    write the row directly, the way that acceptance actually looked: `version=1`, granted,
    and nothing since.

    This proves the BEHAVIOUR the bump exists for -- that the gate stands again -- not just
    that the constant now reads 2.
    """
    PRE_BUMP_VERSION = 1
    for consent_type in ("terms", "privacy"):
        tenant_session.add(
            ConsentRecord(
                subject_type="person",
                subject_id=as_guardian.person_id,
                consent_type=consent_type,
                version=PRE_BUMP_VERSION,
                granted=True,
                granted_at=T0,
            )
        )
    tenant_session.commit()

    response = client.get("/api/v1/privacy/consents", headers=as_guardian.headers)
    assert response.status_code == 200, response.text
    assert response.json()["outstanding"] == ["terms", "privacy"]
