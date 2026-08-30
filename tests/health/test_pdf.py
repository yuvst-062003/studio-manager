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
    assert b"NotoSansHebrew" in produced
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
