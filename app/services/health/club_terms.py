"""The club's own `תקנון` and `תנאי תשלום`: what version a signature was made against.

**Deliberately parallel to `app/services/privacy/policy.py`, and deliberately separate
from it.** That module versions the PLATFORM's terms of use and privacy policy, gates §6.1
step 5, and sits at `POLICY_VERSION = 0` because its text is an unreviewed draft nobody
with a practising certificate has read.

This one versions a different document, written by a different party. The club's
regulations and payment terms came off the club's own `טופס הרשמה` and its own price list.
They are not a draft of ours, so this **starts at 1** rather than 0 -- version 0 in the
other module means "draft wording", and borrowing that number here would say something
untrue about the club's text.

One version number for both documents, not two. The paper form's single signature covers
the regulations and the payment terms together, and splitting them would let a club change
a payment date without re-confirming the regulations that date sits inside.

**Where the text lives: i18n, not here and not the database.** `clubTerms.*` in
web/packages/i18n/{he,en,ru}/health.ts, exactly as `privacy.terms.*` lives in
`reports.ts` beside `POLICY_VERSION`. Making it a studio setting was considered and
rejected in the design (§13): one club, and a manager-editable legal text needs a review
step this product does not have.

**To change the terms:** edit the strings, raise `CLUB_TERMS_VERSION`, and every family is
asked again -- because a grant is checked AT the current version, and agreeing to v1 is not
agreeing to v2.
"""

from __future__ import annotations

#: §4.3's `consent_record.consent_type` value these grants carry.
CLUB_TERMS_CONSENT_TYPE = "club_terms"

#: The club's reviewed text. See the module docstring for why this started at 1 while
#: `POLICY_VERSION` started at 0. Raised to 2 alongside `POLICY_VERSION` for decision 24
#: (2026-09-03): the cheque payee clause changed (decision 22), so every family is asked
#: again -- the rule this module's docstring states above.
CLUB_TERMS_VERSION = 2


# ---------------------------------------------------------------------------------------
# The text itself, for the PDF. **Hebrew only, and that is the point.**
#
# **Why a second copy exists at all.** The screen renders `clubTerms.*` from
# web/packages/i18n/{he,en,ru}/health.ts; the signed PDF is written by a Python process
# that cannot read a TypeScript module. `_DISCLAIMER` in app/services/health/declarations.py
# had exactly this shape for exactly this reason -- terms that exist only in the app are
# terms absent from the document they are about, which is the failure mode that matters.
#
# **Why these are strings and not {he, en, ru} tables** (owner decision, 2026-09-07). The
# signed declaration is the club's archived legal record and is Hebrew, always. It used to
# follow `studio.default_locale`, which made the language of a legal document a setting --
# and one nobody had deliberately chosen: both live studios happen to be `he`, so the other
# two branches were text that could only ever appear by accident.
#
# **A family still reads the terms in its own language.** That happens on screen, from the
# i18n files above, where a Russian-speaking parent reads the clause in Russian and ticks
# the box in Russian; tests/structure/test_full_template.py guards all three locales there
# and must keep doing so. What is Hebrew is the record of what they agreed to, not the
# thing they agreed to.
# ---------------------------------------------------------------------------------------

#: The club's `תנאי תשלום`, as supplied. Three clauses, in the order the club wrote them.
#:
#: Clause 3 is a **pro-rata re-pricing rule, not a refund rule** -- it changes the rate
#: applied to months already used. It is recorded here as signed text and nothing in
#: billing reads it; automating it is explicitly out of scope (design §13).
PAYMENT_TERMS: tuple[str, ...] = (
    "תשלום בצ'קים יתבצע לטובת \"בריין בילדינג (ע״ר)\". תאריך הצ'ק לא יאוחר מה-10 לכל חודש.",
    "ביטול מנוי יבוצע בכתב עד ה-27 לחודש, ויהיה תקף לגבי חודשים עתידיים בלבד.",
    "בעת ביטול מנוי שנתי, התעריף החודשי יחושב בהתאם לניצול החודשים בפועל של המנוי "
    "(לדוגמה: אם המנוי ניצל שלושה חודשים, החישוב יבוצע לפי תעריף מנוי לשלושה חודשים).",
)

#: The heading over the payment terms.
TERMS_TITLE = "תקנון ותנאי תשלום"

#: The heading over the health clause -- and **not** `TERMS_TITLE`, which is what it used to be.
#:
#: Both sections carried the same title, so the document printed `תקנון ותנאי תשלום` twice in a
#: row: once over the sentence in which a parent declares their child fit to train, and again
#: over the actual payment terms. That sentence is the clause the whole document exists to
#: record. Filing it under a payment heading mislabels it on a page a family signs and a club
#: might hand an insurer, and the repetition makes the second heading read as a stray duplicate.
CLAUSE_TITLE = "הצהרת כשירות"

#: The club's `טופס הרשמה` block 5, clause 1 -- no limitations.
CLAUSE_NONE_TEXT = (
    "הנני מצהיר/ה כי לרשום מעלה אין מגבלות רפואיות/רגישויות כלשהן והוא מסוגל לעמוד "
    "במאמץ הדרוש לחוג אליו נרשם. יחד עם זאת, במידה ותהיה מגבלה רפואית כלשהי, הנני "
    "מתחייב/ת לדווח על כך בהקדם למאמן ו/או מנהל המועדון."
)

#: Clause 2 -- limitations exist, and the child can still train.
CLAUSE_LIMITED_TEXT = (
    "הנני מצהיר/ה כי למרות המגבלות הרפואיות המצוינות לעיל, הרשום מעלה מסוגל לעמוד "
    "במאמץ הדרוש לחוג אליו נרשם."
)

#: Block 6 -- the sentence above the signature. `{studio}` is the club's own name, which is
#: `GLADIATOR` on the paper form and is not hard-coded here: the same product serves more
#: than one club, and a second club signing GLADIATOR's regulations is a real document
#: saying a false thing.
SIGNATURE_LINE = (
    "אני, {signer}, מאשר/ת בזאת שקראתי את הצהרת הבריאות ותקנון של מועדון {studio} "
    'ומתחייב/ת לפעול עפ"י הנהלים הרשומים בו.'
)


def clause_text(clause_id: str) -> str:
    """The sentence a family actually confirmed, by its id.

    The import is local because `clauses` imports this module for `CLAUSE_QUESTION_ID`; hoisting
    it to the top makes the pair circular.
    """
    from app.services.health.clauses import CLAUSE_LIMITED

    return CLAUSE_LIMITED_TEXT if clause_id == CLAUSE_LIMITED else CLAUSE_NONE_TEXT


def terms_title() -> str:
    return TERMS_TITLE


def clause_title() -> str:
    return CLAUSE_TITLE


def payment_terms() -> tuple[str, ...]:
    return PAYMENT_TERMS


def signature_line(*, signer: str, studio: str) -> str:
    return SIGNATURE_LINE.format(signer=signer, studio=studio)
