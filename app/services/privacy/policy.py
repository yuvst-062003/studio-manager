"""The version of the terms and privacy policy a consent row records, and its label.

**The text this ships is an UNREVIEWED DRAFT.** It was written against what the code
actually does -- tenancy-isolated student and guardian records, `EncryptedJSON` /
`EncryptedBytes` health declarations with keys in Railway secrets and never in the
database, attendance, uPay as the payment processor, an append-only audit log -- and
against the disclosure list Israel's Privacy Protection Law requires since Amendment 13
came into force on 14 August 2025. Nobody with a practising certificate has read a word of
it.

**Which is exactly why the version is 0.** `consent_record.version` is an INTEGER column
(`app/models/health.py`), so a string like `0.1-draft` cannot be stored in it and no lane
may add a column -- `alembic/versions/**` belongs to `main` and lands one revision per
wave. Zero is the honest encoding of the same fact: no reviewed policy will ever be
version 0, the first reviewed one is 1, and

    SELECT * FROM consent_record
     WHERE consent_type IN ('terms', 'privacy') AND version = 0;

finds every acceptance made against draft wording, forever, with no join and no guessing.
`POLICY_VERSION_LABEL` carries the human form to the API and onto the screen, where a
guardian and an operator both need to see the word "draft" rather than a bare 0.

When the reviewed text lands: raise `POLICY_VERSION` to 1, clear `POLICY_IS_DRAFT`, and
every family is asked again -- because `ConsentService.outstanding` requires a grant AT the
current version, and agreeing to v0 is not agreeing to v1.
"""

from __future__ import annotations

#: `consent_record.version` for every acceptance of the draft text. See the module
#: docstring for why this is an integer 0 rather than the string the wave plan suggested.
POLICY_VERSION = 0

#: What the screen and the API say out loud. Never parsed, never stored.
POLICY_VERSION_LABEL = "0.1-draft"

#: True while `POLICY_VERSION` is 0. Read by the API so the draft notice cannot be left
#: behind on a screen after the reviewed text lands -- the banner is data, not markup.
POLICY_IS_DRAFT = POLICY_VERSION == 0

#: §6.1 step 5 -- `5  אישורים  →  terms of service + privacy policy`. SPEC:1327: "Steps 5
#: and 6 are the only hard gates." These two and nothing else block the app.
REQUIRED_CONSENT_TYPES: tuple[str, ...] = ("terms", "privacy")

#: What `POST /privacy/consents` will write. `event` is deliberately absent: §4.3 makes an
#: event consent a consent about a STUDENT, granted through the RSVP flow against a
#: specific event (`app/services/events/rsvp.py`), and one granted here would carry
#: `subject_type='person'` and name no event at all.
#:
#: `club_terms` is present so `ConsentService.record` will write it, but the registration
#: agreement is what grants it -- not this route. See `expected_version` below.
GRANTABLE_CONSENT_TYPES: tuple[str, ...] = (
    "terms",
    "privacy",
    "photo_video",
    "medical_share",
    "club_terms",
)


def expected_version(consent_type: str) -> int:
    """The version a grant of `consent_type` must be made against.

    **Per type, because there are now two documents with two publishers.** `terms` and
    `privacy` are ours and move with `POLICY_VERSION`; `club_terms` is the club's own
    `תקנון` and `תנאי תשלום` and moves with `CLUB_TERMS_VERSION`.

    Before this existed, `ConsentService.record` compared every submission against
    `POLICY_VERSION` alone -- so a `club_terms` grant at version 1 was rejected as a
    version mismatch while our own policy sat at draft 0. The two numbers were never going
    to agree, and making them agree would have coupled a club's agreement to our lawyer's
    calendar.
    """
    # Imported here, not at module scope: app.services.health imports this module, and a
    # top-level import would close the cycle.
    from app.services.health.club_terms import CLUB_TERMS_CONSENT_TYPE, CLUB_TERMS_VERSION

    return CLUB_TERMS_VERSION if consent_type == CLUB_TERMS_CONSENT_TYPE else POLICY_VERSION
