"""§5.5's signed PDF: explicit bidi, an embedded Hebrew face, and the golden fixture.

§5.5 names this a known-fiddly area and **mandates a golden-PDF fixture test**. It is here, and so
are the three properties that make the golden file worth anything:

  - the render is **byte-deterministic**, so a diff means a change and never a timestamp;
  - the Hebrew is really Hebrew, in an **embedded** face, so the file opens the same on a machine
    with no Hebrew font installed — which is most of them;
  - the bidi is **explicit**, tested at the function that does it, because a PDF viewer applies no
    bidi of its own: whatever order the glyphs are written in is the order they appear.

G7: the sample answers below are about a fixture child who does not exist.

Regenerate the fixture with `REGENERATE_GOLDEN=1 .venv/bin/pytest tests/health/test_pdf.py`, and
read the diff before committing it. The regeneration switch exists so a deliberate change is one
command; the review is what makes it safe.
"""

from __future__ import annotations

import base64
import os
import re
import zlib
from pathlib import Path

import pytest
from app.services.health.pdf import (
    RenderedSection,
    is_rtl_char,
    render_declaration_pdf,
    shape_rtl,
)
from tests.health.conftest import T0

GOLDEN = Path(__file__).parent / "golden" / "declaration.pdf"

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

GOLDEN_INPUT = {
    "title": "הצהרת בריאות",
    "student_name": "נועה לוי",
    "studio_name": "מועדון הג'ודו",
    "signed_at": T0,
    "signed_by": "מיכל כהן",
    "template_version": 1,
    "sections": [
        RenderedSection(
            title="רקע רפואי",
            rows=[
                ("האם יש אסתמה?", "כן"),
                ("האם יש אלרגיה?", "לא"),
                ("טלפון לשעת חירום", "050-0000000"),
            ],
        ),
        RenderedSection(
            title="הצהרה",
            rows=[("אני מצהיר/ה שהתלמיד/ה כשיר/ה לפעילות גופנית ולאימוני ג'ודו", "כן")],
        ),
    ],
    "signature_line": "אני, הורה בדיקה, מאשר/ת בזאת שקראתי את הצהרת הבריאות ותקנון המועדון",
    "signature_png": None,
}


# -- bidi ----------------------------------------------------------------------
def test_a_hebrew_run_is_reversed_into_visual_order():
    """A PDF viewer applies no bidi. Whatever order the glyphs are written in is the order they
    appear, so logical order on the page reads backwards."""
    assert shape_rtl("שלום") == "םולש"


def test_digits_inside_a_hebrew_sentence_keep_their_own_order():
    """A phone number reversed is a different phone number, and this one is the emergency
    contact on a child's health declaration."""
    assert "054" in shape_rtl("טלפון 054")


def test_a_date_keeps_its_own_order():
    assert "03.11.2026" in shape_rtl("נחתמה בתאריך 03.11.2026")


def test_latin_inside_a_hebrew_sentence_is_not_reversed():
    assert "PDF" in shape_rtl("קובץ PDF מצורף")


def test_a_pure_latin_string_is_untouched():
    """An English-locale studio name must not come out backwards."""
    assert shape_rtl("Studio Manager") == "Studio Manager"


def test_a_pure_digit_string_is_untouched():
    assert shape_rtl("050-0000000") == "050-0000000"


def test_the_whole_line_still_reads_right_to_left():
    """The last logical run lands leftmost. `שלום עולם` → `םלוע םולש`: each word reversed AND the
    words swapped, which is what a right-to-left reader sees as the original."""
    assert shape_rtl("שלום עולם") == "םלוע םולש"


def test_brackets_are_mirrored_inside_a_hebrew_run():
    """An opening bracket on the right of an RTL run is a closing bracket glyph. Unmirrored, the
    parenthesis points the wrong way — visible, small, and exactly the kind of thing that survives
    review by an LTR reader."""
    shaped = shape_rtl("(אסתמה)")
    assert shaped.startswith("(")
    assert shaped.endswith(")")


def test_hebrew_presentation_forms_count_as_rtl():
    """U+FB1D-FB4F is the Hebrew presentation block. A classifier that only knew U+0590-05FF would
    treat `ﬠ` as neutral and lay it out left-to-right."""
    assert is_rtl_char("שׁ")


def test_an_empty_string_survives():
    assert shape_rtl("") == ""


# -- the document --------------------------------------------------------------
def test_rendering_twice_is_byte_identical():
    """The property the golden fixture rests on. ReportLab stamps a creation date and a random
    document id into every file, which is why this lane writes its own PDF: a byte comparison
    against a file carrying `now()` fails on the second run for reasons unrelated to the render."""
    assert render_declaration_pdf(**GOLDEN_INPUT) == render_declaration_pdf(**GOLDEN_INPUT)


def test_it_is_a_pdf():
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    assert produced.startswith(b"%PDF-1.7")
    assert produced.rstrip().endswith(b"%%EOF")


def test_the_pdf_embeds_a_hebrew_capable_font_rather_than_a_base14_one():
    """§5.5 — 'an embedded RTL-capable font (Noto Sans Hebrew)'. Without `/FontFile2` the file
    opens correctly only on a machine that happens to have the face installed, and none of the
    base-14 fonts has a Hebrew glyph at all."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    assert b"/FontFile2" in produced
    # `NotoSansStudio`, not `NotoSansHebrew`: the face is that one merged with Noto Sans's
    # Cyrillic (`scripts/build-pdf-font.py`), because §9's `ru` locale had no glyphs at all.
    assert b"NotoSansStudio" in produced
    assert b"/Identity-H" in produced
    assert b"/CIDFontType2" in produced


def test_no_creation_date_or_random_id_leaks_in():
    """Anything varying per run makes the golden fixture a source of flakes rather than a gate."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    assert b"/CreationDate" not in produced
    assert b"/ModDate" not in produced


def test_the_signed_date_comes_from_the_argument_and_not_from_the_clock():
    """`app.core.clock.now()` is the only clock and this function does not call it: the date on a
    signed declaration is the date it was signed, which a re-render years later must not change."""
    from datetime import UTC, datetime

    other = render_declaration_pdf(
        **{**GOLDEN_INPUT, "signed_at": datetime(2027, 1, 1, tzinfo=UTC)}
    )
    assert other != render_declaration_pdf(**GOLDEN_INPUT)


def test_the_date_is_rendered_in_asia_jerusalem():
    """CLAUDE.md — stored UTC, rendered Asia/Jerusalem. T0 is 12:00 UTC on 3 November 2026, which
    is 14:00 local; a renderer that printed UTC would still say 03.11.2026 on that date and would
    be wrong on any evening signature."""
    from datetime import UTC, datetime

    # 22:00 UTC on 2 November is 00:00 on 3 November in Jerusalem.
    late = render_declaration_pdf(
        **{**GOLDEN_INPUT, "signed_at": datetime(2026, 11, 2, 22, 0, tzinfo=UTC)}
    )
    same_day_utc = render_declaration_pdf(
        **{**GOLDEN_INPUT, "signed_at": datetime(2026, 11, 3, 6, 0, tzinfo=UTC)}
    )
    # Both are 3 November locally, so the two documents differ only by the time of day they print
    # — and this lane prints a date. Identical bytes prove the local date, not the UTC one.
    assert late == same_day_utc


def test_the_signature_image_is_embedded_when_there_is_one():
    produced = render_declaration_pdf(**{**GOLDEN_INPUT, "signature_png": ONE_PIXEL_PNG})
    assert b"/Subtype /Image" in produced
    assert produced != render_declaration_pdf(**GOLDEN_INPUT)


def test_a_declaration_with_no_signature_still_renders():
    """The manager-filed case (§5.1's paper club). A crash here would make a legitimate record
    impossible to produce at all."""
    assert render_declaration_pdf(**GOLDEN_INPUT).startswith(b"%PDF")


def test_the_clubs_signature_line_is_on_the_page():
    """What replaced D11's caveat. The club's `טופס הרשמה` block 6 puts a sentence above the
    signature -- "שקראתי את הצהרת הבריאות ותקנון של מועדון ..." -- and a signature with no
    statement of what was signed is the one thing this document cannot be missing."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    without = render_declaration_pdf(**{**GOLDEN_INPUT, "signature_line": ""})
    assert produced != without


def test_the_renderer_no_longer_accepts_a_disclaimer():
    """D11's caveat was TRUE of a questionnaire we wrote and shipped to a club that had not
    reviewed it. Template v2 is the club's own form and its own תקנון, signed under the club's
    own name, so the sentence would now be false -- and a keyword the renderer still accepted
    is a caveat one caller could quietly put back."""
    with pytest.raises(TypeError):
        render_declaration_pdf(**{**GOLDEN_INPUT, "disclaimer": "anything at all"})


def test_terms_paragraphs_reach_the_page():
    """The club's `תנאי תשלום` are prose, not question-and-answer. A section carrying only
    paragraphs must still render -- before this the renderer skipped any section with no rows,
    which would have silently dropped the payment terms from the signed document."""
    terms = RenderedSection(
        title="תקנון ותנאי תשלום",
        paragraphs=["ביטול מנוי יבוצע בכתב עד ה-27 לחודש, ויהיה תקף לגבי חודשים עתידיים בלבד."],
    )
    produced = render_declaration_pdf(**{**GOLDEN_INPUT, "sections": [terms]})
    assert produced.startswith(b"%PDF")
    assert produced != render_declaration_pdf(**{**GOLDEN_INPUT, "sections": []})


def test_a_very_long_question_wraps_rather_than_running_off_the_page():
    long_row = RenderedSection(
        title="נוסף",
        rows=[("  ".join(["האם יש מצב רפואי נוסף שחשוב שנדע עליו"] * 6), "לא")],
    )
    produced = render_declaration_pdf(**{**GOLDEN_INPUT, "sections": [long_row]})
    assert produced.startswith(b"%PDF")


def test_many_sections_paginate():
    """A studio may add questions without limit (D11). One page that silently drops the rest is
    a signed document missing the answers it was signed over."""
    sections = [
        RenderedSection(title=f"פרק {i}", rows=[(f"שאלה {j}", "לא") for j in range(8)])
        for i in range(8)
    ]
    produced = render_declaration_pdf(**{**GOLDEN_INPUT, "sections": sections})
    assert produced.count(b"/Type /Page\n") >= 2


def test_the_rendered_pdf_matches_the_golden_fixture():
    """§5.5 mandates this comparison. Regenerate deliberately; the diff is the review."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    if os.environ.get("REGENERATE_GOLDEN"):
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_bytes(produced)
        pytest.skip("golden fixture regenerated — review the diff before committing")
    assert GOLDEN.exists(), "run REGENERATE_GOLDEN=1 pytest tests/health/test_pdf.py"
    assert produced == GOLDEN.read_bytes()


def test_the_questionnaire_version_is_not_printed_on_the_document():
    """`גרסת שאלון N` was bookkeeping on a page a family keeps. The version still lives on
    `health_declaration.template_version`, where the audit trail needs it."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    other = render_declaration_pdf(**{**GOLDEN_INPUT, "template_version": 99})
    assert produced == other, "the version cannot be on the page if changing it changes nothing"


# ==========================================================================================
# Russian — §9's third locale, which this writer could not draw at all
# ==========================================================================================
# §9 ships `ru` as a first-class locale and `web/packages/i18n/ru/health.ts` really does send
# `Да`/`Нет` as declaration answers. The face embedded here covered Hebrew and Latin and **no
# Cyrillic whatsoever**, so a Russian-speaking family's signed declaration rendered its name,
# its answers and its signature line as rows of `.notdef` boxes.
#
# Two defects, and the second hid behind the first: `_is_ltr_char` tested `char.isascii()`, so
# Cyrillic classified as *neutral*, resolved to the base RTL direction, and came out reversed.
# Fixing only the font would have shipped `воцензуК` — worse than boxes, because boxes are
# visibly broken and a backwards name is not, to a reader who cannot read the script.
#
# §9's own test matrix says "every component in both `he` and `en`", which is why neither
# defect was caught. `test_a_declaration_draws_no_missing_glyphs` below is the guard that does
# not depend on someone remembering to add a locale: it fails for ANY script the face lacks.

RUSSIAN_INPUT = {
    **GOLDEN_INPUT,
    "student_name": "Даниил Кузнецов",
    "signed_by": "Екатерина Кузнецова",
    "sections": [
        RenderedSection(
            title="Общее здоровье",
            rows=[
                ("Есть ли астма?", "Нет"),
                ("Есть ли аллергия?", "Да — арахис"),
                ("Телефон для экстренной связи", "050-0000000"),
            ],
        ),
    ],
    "signature_line": "Я, Екатерина Кузнецова, подтверждаю, что прочитала декларацию о здоровье",
}


def _drawn_glyph_ids(pdf: bytes) -> list[int]:
    """Every glyph id the document actually paints.

    Reads the content streams rather than the font's cmap on purpose. A cmap assertion proves
    the face covers a character; only the drawn stream proves the character reached the page as
    that glyph — which is the seam the two defects above slipped through.
    """
    ids: list[int] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf, re.S):
        try:
            content = zlib.decompress(match.group(1))
        except zlib.error:
            continue  # the embedded font file and the signature raster
        for run in re.findall(rb"<([0-9A-Fa-f]+)> Tj", content):
            ids.extend(int(run[at : at + 4], 16) for at in range(0, len(run), 4))
    return ids


def test_cyrillic_inside_a_hebrew_sentence_keeps_its_own_order():
    """Exactly what `test_latin_inside_a_hebrew_sentence_is_not_reversed` asserts, in the
    script that was classified as neutral instead of as text."""
    assert shape_rtl("שם: Кузнецов") == "Кузнецов :םש"


def test_a_pure_cyrillic_string_is_untouched():
    assert shape_rtl("Кузнецов") == "Кузнецов"


def test_cyrillic_is_not_reversed_the_way_a_neutral_run_would_be():
    """The precise defect: `_is_ltr_char` tested `isascii()`, so every Cyrillic letter was a
    neutral and the run took the base RTL direction."""
    assert shape_rtl("Даниил Кузнецов") == "Даниил Кузнецов"


def test_the_embedded_face_covers_cyrillic():
    from app.services.health.pdf import _font

    face = _font()
    missing = [c for c in "ДаниилКузнецовЕкатеринаЖШЩЪЫЬЭЮЯёй" if face.glyph(c) == 0]
    assert not missing, f"the embedded face has no glyph for {''.join(missing)}"


def test_a_russian_declaration_draws_no_missing_glyphs():
    """The seam test. A Russian family's declaration must reach the page as real glyphs."""
    produced = render_declaration_pdf(**RUSSIAN_INPUT)
    assert 0 not in _drawn_glyph_ids(produced), "the document paints .notdef boxes"


def test_a_declaration_draws_no_missing_glyphs():
    """The same guard on the Hebrew fixture, so a future font swap that drops Hebrew or Latin
    coverage fails here rather than on a family's signed document."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    assert 0 not in _drawn_glyph_ids(produced)


# ==========================================================================================
# Base direction — a paragraph is not RTL just because the document is
# ==========================================================================================
# `shape_rtl` hardcoded the base direction to RTL, which is right for the Hebrew this document is
# mostly made of and wrong for every LTR paragraph in it. Unicode resolves a neutral run at the
# edge of a line to the *paragraph* direction (UBA N2), so a sentence-final full stop in a Russian
# or English paragraph was classified RTL and emitted first: `.и/или руководителю клуба`.
#
# Invisible in Russian behind the missing glyphs, and invisible in English because nobody had
# rendered an English declaration and looked at it. The club's `תנאי תשלום` are Hebrew, so the
# only prose long enough to show it was in a locale nothing exercised.


def test_a_russian_sentence_keeps_its_full_stop_at_the_end():
    assert shape_rtl("и/или руководителю клуба.") == "и/или руководителю клуба."


def test_a_russian_clause_keeps_its_comma_at_the_end():
    assert shape_rtl("выдерживать нагрузку,") == "выдерживать нагрузку,"


def test_an_english_sentence_keeps_its_full_stop_at_the_end():
    """The same defect in the locale §9's matrix claims to cover."""
    assert shape_rtl("Signed by the parent.") == "Signed by the parent."


def test_a_hebrew_sentence_still_keeps_its_full_stop_on_the_left():
    """The mirror case, and the reason the base direction has to be derived rather than fixed
    either way: in an RTL paragraph the full stop genuinely does belong at the visual left."""
    assert shape_rtl("ההורה חתם.") == ".םתח הרוהה"


def test_hebrew_inside_a_russian_sentence_is_still_reversed():
    """Base LTR does not mean 'no bidi'. An RTL run inside an LTR paragraph still reverses."""
    assert shape_rtl("Клуб מועדון today") == "Клуб ןודעומ today"
