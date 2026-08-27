"""The canvas is a source, not a souvenir — so it is asserted like one.

Two W6 conflicts, C9 and C10, were the same failure in two directions: a design decision
recorded in prose while the artboard kept drawing the old thing. Both were closed by editing
the canvas, and neither would stay closed on prose alone, because the whole hazard is that
`docs/design/canvas/*.dc.html` is what a human opens at 2am and a table in `decisions.md`
is not.

**Why these assertions live in `tests/contracts/` and run in every lane.** A lane porting an
artboard reads the HTML, not this repo's decision history. If the canvas regains a cut
element, the next lane builds it faithfully and the review that catches it happens after the
code exists. Failing at the moment the canvas changes is the only point where the fix is one
edit.

**What these tests deliberately do NOT do.** They do not assert the canvas matches the built
components — that would fail every time a screen legitimately evolves, and a test everybody
learns to ignore protects nothing. They assert exactly the elements SPEC or a recorded
decision says must not exist, and nothing about what may.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

CANVAS = Path(__file__).resolve().parents[2] / "docs" / "design" / "canvas"
PARENT = CANVAS / "01-parent-app" / "Parent App.dc.html"
DASHBOARD = CANVAS / "03-manager-dashboard" / "Manager Dashboard.dc.html"


def _artboard(path: Path, artboard_id: str) -> str:
    """One artboard's markup, sliced out of its surface file.

    The files are one page each, ~300 KB of inline styles, so a naive substring search over
    the whole file would let a string legitimately present on artboard `9f` satisfy — or
    falsely fail — an assertion aimed at `3f`.
    """
    source = path.read_text(encoding="utf-8")
    starts = [
        (match.start(), match.group(1))
        for match in re.finditer(r'<div class="dv-opt" id="([^"]+)"', source)
    ]
    assert starts, f"{path.name} has no artboards — the canvas format changed"
    for index, (position, found) in enumerate(starts):
        if found != artboard_id:
            continue
        end = starts[index + 1][0] if index + 1 < len(starts) else len(source)
        return source[position:end]
    pytest.fail(f"artboard {artboard_id} is not in {path.name}")


def test_the_canvas_still_holds_sixty_one_artboards():
    """The exit-gate number, asserted rather than remembered.

    §13's visual layer and W6's gate are both phrased as "all 61". A canvas that silently
    grew a 62nd or lost one turns that sentence into a number nobody is checking.
    """
    total = 0
    for surface in sorted(CANVAS.glob("*/*.dc.html")):
        total += len(re.findall(r'<div class="dv-opt" id="([^"]+)"', surface.read_text()))
    assert total == 61


# -- C10 — the setting SPEC §5.5 says must not exist --------------------------
def test_3f_does_not_draw_a_health_declaration_attendance_block():
    """SPEC §5.5: "There is therefore **no `block_attendance_without_health` setting** --
    nothing to configure."

    The reasoning is in the spec and worth keeping next to the assertion: blocking a row in
    an app does not stop a child stepping onto a mat, because the coach controls that
    physically. A hard block would only stop the *record* from being accurate, making the
    data worse without making anyone safer.

    3f drew the toggle anyway, and the drawn row contradicted itself -- its subtitle read
    "המאמן יראה התראה, החניך לא ייחסם אוטומטית", a switch labelled *block* that promised not
    to block. W6 removed it. `SettingsScreen.test.tsx` holds the same negative against the
    built panel; this one holds it against the mockup, which is the copy someone reads first.
    """
    assert "חסימת השתתפות" not in _artboard(DASHBOARD, "3f")
    assert "block_attendance_without_health" not in _artboard(DASHBOARD, "3f")


# -- C9 / D9 — the three recorded reductions ----------------------------------
def test_2b_keeps_the_inbox_and_not_the_conversation():
    """D9.1. §2.3 lists in-app two-way chat as explicitly out of scope and §5.11 permits
    exactly two levels: push, and a one-way inbox.

    The inbox half is asserted alongside the cut half on purpose. A test that only checked
    the absence would pass just as happily against a deleted artboard, and D9 cut a tab, not
    a screen -- the count of fully cut artboards in this plan is zero.
    """
    board = _artboard(PARENT, "2b")
    assert "שיחה עם המשרד" not in board
    assert "הודעות" in board


def test_7c_has_no_weight_or_category_column():
    """D9.2. §2.2 defers weight categories to v2, and they imply student fields §4.3 does
    not carry. RSVP counts, parent consent and payment status stay."""
    board = _artboard(DASHBOARD, "7c")
    assert "משקל" not in board
    assert "קטגוריה" not in board
    assert "אישור הורה חתום" in board


def test_13a_and_13c_have_no_stats_strip():
    """Landing decision 2 (2026-08-27). No field carries `214 חניכים פעילים` /
    `18 שנים ברעננה` / `4 מאמנים מוסמכים`, and computing them would publish a live
    headcount on an unauthenticated endpoint — which sits badly beside `PublicGroupOut`'s
    written refusal ("No class id, no staff, no enrollment count"). The strip was removed
    from the canvas the way D9's cuts were; this is what keeps it removed.

    The positive halves pin that the artboards themselves survived the cut: the hero
    headline and the schedule heading are still drawn.
    """
    for artboard_id in ("13a", "13c"):
        board = _artboard(PARENT, artboard_id)
        assert "חניכים פעילים" not in board
        assert "מאמנים מוסמכים" not in board
        assert "מתי אפשר להגיע" in board


def test_12f_is_titled_payments_and_scopes_the_receipt_to_card_rows():
    """D9.3. §5.10: uPay issues a חשבונית/קבלה for **card payments only**, and the system
    issues no tax document for cash, bank transfer or הוראת קבע.

    A screen titled `קבלות ותשלומים` promises a receipt for every row, which is false for
    the payment methods §5.10 expects to be the common ones.
    """
    board = _artboard(PARENT, "12f")
    assert "קבלות ותשלומים" not in board
    assert "תשלומים" in board
    # The narrowed affordance, not merely the absence of the old title: the screen has to
    # say WHICH rows a receipt exists for, or a parent reads its absence as a bug.
    assert "כרטיס בלבד" in board
