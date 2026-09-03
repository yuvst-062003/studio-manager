"""Decision 23 — Apple is removed from the privacy policy.

`/auth/providers` returns Google only on staging and production; `AppleProvider` exists in
code but has never been configured (see `app/services/identity/providers.py`), so no parent
has ever seen an Apple button and no data has ever reached Apple. The privacy copy in
`reports.ts` (`he`/`en`/`ru`) named Apple as a sign-in provider alongside Google anyway — an
option that was never real. Removing it must leave grammatical sentences behind, not a
dangling "Google or".

This reads the compiled locale source directly rather than importing it: `web/packages/
i18n` is a TypeScript package and these are the Python tests, so the only shared ground is
the text on disk.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
I18N = ROOT / "web/packages/i18n"

LOCALES = ("he", "en", "ru")


def test_no_locale_names_apple_in_the_reports_namespace():
    """§reports.ts carries §6.1 step 5's terms/privacy copy (`privacy.*`) and nothing else
    that would legitimately mention a sign-in provider by name. Google is the only
    configured provider (decision 23), so the word must not appear anywhere in this
    namespace, in any locale — not in a rendered string and not in a code comment either."""
    for locale in LOCALES:
        text = (I18N / locale / "reports.ts").read_text(encoding="utf-8")
        assert "Apple" not in text, f"{locale}/reports.ts still names Apple"


def test_the_sign_in_provider_sentences_still_name_google():
    """Removing Apple must not remove the sentence's only remaining fact. Both
    `privacy.terms.s2.body` (who may use the account) and `privacy.policy.s6.body` (who the
    data is shared with) name the sign-in provider — after decision 23 that is Google alone,
    not an empty gap where "Google or Apple" used to be."""
    for locale in LOCALES:
        text = (I18N / locale / "reports.ts").read_text(encoding="utf-8")
        assert "Google" in text, f"{locale}/reports.ts lost the Google mention too"
