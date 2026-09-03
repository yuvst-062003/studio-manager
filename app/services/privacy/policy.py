"""The version of the terms and privacy policy a consent row records, and its label.

**The text now shipping has been reviewed and approved** (2026-09-01) -- it is no longer
the unreviewed draft this module was written against. `POLICY_VERSION` moved from 0 to 1
for exactly the reason `consent_record.version` exists: a family who agreed to the draft
wording did not agree to the reviewed one, and `ConsentService.outstanding` requires a
grant AT the current version -- so the version bump itself is what re-gates every family
and asks them again, honestly, against the text a lawyer has actually read.

**Raised again, 1 to 2, for decision 24 (2026-09-03).** The onboarding spec's decision 23
removes Apple from `privacy.terms.s2.body` and `privacy.policy.s6.body` -- `AppleProvider`
exists in code but has never been configured, so naming it as a sign-in option alongside
Google was never true. Same rule, same module: change the text, raise `POLICY_VERSION`,
every family is asked again. Approved because there are no live users yet.

**Why an integer, and why 0 was the draft.** `consent_record.version` is an INTEGER column
(`app/models/health.py`), so a label like the old `0.1-draft` could never be stored in it,
and no lane may add a column -- `alembic/versions/**` belongs to `main` and lands one
revision per wave. Zero was the honest encoding of "unreviewed": no reviewed policy is ever
version 0, so it stays reserved, and

    SELECT * FROM consent_record
     WHERE consent_type IN ('terms', 'privacy') AND version = 0;

finds every acceptance made against the draft wording, forever, should it ever need to be
traced back to what a family actually saw. `POLICY_VERSION_LABEL` carries the human form to
the API and onto the screen -- rendered only while `POLICY_IS_DRAFT` is true, so it now
reaches nobody, and is kept accurate rather than deleted for the day this text is revised
again and a new draft needs the same telling-apart.

If the text is ever revised again: raise `POLICY_VERSION` further and every family is asked
again, the same way this version's approval just did.
"""

from __future__ import annotations

#: `consent_record.version` for every acceptance of the current, reviewed text. 0 is
#: permanently reserved for the pre-review draft -- see the module docstring.
POLICY_VERSION = 2

#: What the screen and the API say out loud. Never parsed, never stored. Moves with
#: `POLICY_VERSION` -- a label reading "1.0" beside a version of 2 would be a lie on screen.
POLICY_VERSION_LABEL = "2.0"

#: True only while `POLICY_VERSION` is 0. Read by the API so a draft notice can never be
#: left behind on a screen after the reviewed text lands -- the banner is data, not markup.
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
