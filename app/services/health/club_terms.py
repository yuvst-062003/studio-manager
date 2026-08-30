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

#: The club's reviewed text. See the module docstring for why this starts at 1 and
#: `POLICY_VERSION` starts at 0.
CLUB_TERMS_VERSION = 1


# ---------------------------------------------------------------------------------------
# The text itself, for the PDF.
#
# **Why a second copy exists at all.** The screen renders `clubTerms.*` from
# web/packages/i18n/{he,en,ru}/health.ts; the signed PDF is written by a Python process
# that cannot read a TypeScript module. `_DISCLAIMER` in app/services/health/declarations.py
# had exactly this shape for exactly this reason, and `tests/health/test_club_terms.py`
# keeps the two in step -- terms that exist only in the app are terms absent from the
# document they are about, which is the failure mode that matters here.
# ---------------------------------------------------------------------------------------

#: The club's `תנאי תשלום`, as supplied. Three clauses, in the order the club wrote them.
#:
#: Clause 3 is a **pro-rata re-pricing rule, not a refund rule** -- it changes the rate
#: applied to months already used. It is recorded here as signed text and nothing in
#: billing reads it; automating it is explicitly out of scope (design §13).
PAYMENT_TERMS: dict[str, tuple[str, ...]] = {
    "he": (
        'תשלום בצ\'קים יתבצע לטובת "עמותת מכבי נתניה סיף ואגרוף". '
        "תאריך הצ'ק לא יאוחר מה-10 לכל חודש.",
        "ביטול מנוי יבוצע בכתב עד ה-27 לחודש, ויהיה תקף לגבי חודשים עתידיים בלבד.",
        "בעת ביטול מנוי שנתי, התעריף החודשי יחושב בהתאם לניצול החודשים בפועל של המנוי "
        "(לדוגמה: אם המנוי ניצל שלושה חודשים, החישוב יבוצע לפי תעריף מנוי לשלושה חודשים).",
    ),
    "en": (
        'Cheques are made payable to "עמותת מכבי נתניה סיף ואגרוף". '
        "The cheque date must be no later than the 10th of each month.",
        "Cancellation must be given in writing by the 27th of the month, and takes effect "
        "for future months only.",
        "When an annual membership is cancelled, the monthly rate is recalculated against "
        "the months actually used (for example: three months used is charged at the "
        "three-month rate).",
    ),
    "ru": (
        'Оплата чеками производится в пользу "עמותת מכבי נתניה סיף ואגרוף". '
        "Дата чека — не позднее 10-го числа каждого месяца.",
        "Отмена абонемента подаётся в письменном виде до 27-го числа месяца и действует "
        "только в отношении будущих месяцев.",
        "При отмене годового абонемента месячный тариф пересчитывается по фактически "
        "использованным месяцам (например: три использованных месяца тарифицируются по "
        "тарифу трёхмесячного абонемента).",
    ),
}

TERMS_TITLE = {
    "he": "תקנון ותנאי תשלום",
    "en": "Club terms and payment terms",
    "ru": "Правила клуба и условия оплаты",
}

#: The club's `טופס הרשמה` block 5, clause 1 -- no limitations.
CLAUSE_NONE_TEXT = {
    "he": (
        "הנני מצהיר/ה כי לרשום מעלה אין מגבלות רפואיות/רגישויות כלשהן והוא מסוגל לעמוד "
        "במאמץ הדרוש לחוג אליו נרשם. יחד עם זאת, במידה ותהיה מגבלה רפואית כלשהי, הנני "
        "מתחייב/ת לדווח על כך בהקדם למאמן ו/או מנהל המועדון."
    ),
    "en": (
        "I declare that the person named above has no medical limitations or sensitivities "
        "of any kind and is able to withstand the effort required by the class they have "
        "joined. Should any medical limitation arise, I undertake to report it promptly to "
        "the coach and/or the club manager."
    ),
    "ru": (
        "Настоящим заявляю, что у указанного выше лица нет каких-либо медицинских "
        "ограничений или повышенной чувствительности и он способен выдерживать нагрузку, "
        "необходимую для занятий в группе, в которую он записан. При возникновении любого "
        "медицинского ограничения обязуюсь незамедлительно сообщить об этом тренеру и/или "
        "руководителю клуба."
    ),
}

#: Clause 2 -- limitations exist, and the child can still train.
CLAUSE_LIMITED_TEXT = {
    "he": (
        "הנני מצהיר/ה כי למרות המגבלות הרפואיות המצוינות לעיל, הרשום מעלה מסוגל לעמוד "
        "במאמץ הדרוש לחוג אליו נרשם."
    ),
    "en": (
        "I declare that despite the medical limitations noted above, the person named above "
        "is able to withstand the effort required by the class they have joined."
    ),
    "ru": (
        "Настоящим заявляю, что несмотря на указанные выше медицинские ограничения, "
        "указанное выше лицо способно выдерживать нагрузку, необходимую для занятий в "
        "группе, в которую он записан."
    ),
}

#: Block 6 -- the sentence above the signature. `{studio}` is the club's own name, which is
#: `GLADIATOR` on the paper form and is not hard-coded here: the same product serves more
#: than one club, and a second club signing GLADIATOR's regulations is a real document
#: saying a false thing.
SIGNATURE_LINE = {
    "he": (
        "אני, {signer}, מאשר/ת בזאת שקראתי את הצהרת הבריאות ותקנון של מועדון {studio} "
        'ומתחייב/ת לפעול עפ"י הנהלים הרשומים בו.'
    ),
    "en": (
        "I, {signer}, hereby confirm that I have read the health declaration and the "
        "regulations of {studio}, and undertake to act according to the procedures set out "
        "in them."
    ),
    "ru": (
        "Я, {signer}, настоящим подтверждаю, что ознакомился(-ась) с декларацией о "
        "состоянии здоровья и правилами клуба {studio} и обязуюсь действовать в "
        "соответствии с изложенными в них порядками."
    ),
}


def _pick(table: dict[str, str], locale: str) -> str:
    return table.get(locale, table["he"])


def clause_text(clause_id: str, locale: str) -> str:
    """The sentence a family actually confirmed, by its id."""
    from app.services.health.clauses import CLAUSE_LIMITED

    table = CLAUSE_LIMITED_TEXT if clause_id == CLAUSE_LIMITED else CLAUSE_NONE_TEXT
    return _pick(table, locale)


def terms_title(locale: str) -> str:
    return _pick(TERMS_TITLE, locale)


def payment_terms(locale: str) -> tuple[str, ...]:
    return PAYMENT_TERMS.get(locale, PAYMENT_TERMS["he"])


def signature_line(locale: str, *, signer: str, studio: str) -> str:
    return _pick(SIGNATURE_LINE, locale).format(signer=signer, studio=studio)
