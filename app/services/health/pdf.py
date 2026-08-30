"""§5.5's signed PDF: a dependency-free writer with an embedded Hebrew face and explicit bidi.

§5.5, verbatim: *"Hebrew PDF rendering requires an embedded RTL-capable font (Noto Sans Hebrew) and
explicit bidi handling. This is a known-fiddly area and gets its own test fixture comparing rendered
output against a golden PDF."* All three clauses are load-bearing and each is answered here.

**Why this is written rather than imported.** `requirements-dev.txt` carries no PDF library and
adding one is outside this lane's ownership — but that is the smaller reason. The larger one is the
golden fixture §5.5 mandates: ReportLab stamps a `/CreationDate` and a random `/ID` into every
document, so a byte comparison fails on the second run for reasons that have nothing to do with the
rendering. A writer that emits the same bytes for the same inputs makes the fixture mean what it is
supposed to mean, and a diff in it is always a real change.

**Why Identity-H and glyph ids rather than an encoding.** The text operators below carry two-byte
**glyph indices**, not characters, so the file never has to agree with a consumer about what a byte
means — no `/Differences` array, no WinAnsi, no code page. The cost is that the writer must read the
font's own `cmap` to find those indices, which is what `_TrueTypeFont` does.

**Why bidi is done here and not left to the viewer.** A PDF viewer applies **no** bidi algorithm.
Whatever order the glyphs are written in is the order they appear on the page, so handing it logical
order produces Hebrew that reads backwards. `shape_rtl` is the reordering, and it is a named,
separately tested function rather than an inline `[::-1]` for the reason §5.5 gives: this is the
fiddly part.

**G7.** Nothing in this module logs. It is handed the answers already rendered to display strings by
its caller, holds them only long enough to lay them out, and returns bytes.
"""

from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

#: CLAUDE.md — all timestamps stored UTC, rendered Asia/Jerusalem. A signed declaration carries the
#: date the parent actually signed it in their own timezone; a UTC date is wrong for every evening
#: signature, which in Israel is most of them.
STUDIO_TZ = ZoneInfo("Asia/Jerusalem")

FONT_PATH = Path(__file__).parent / "fonts" / "NotoSansHebrew-Regular.ttf"
#: The name that appears in `/BaseFont`. Fixed rather than read from the `name` table: a font
#: update that renamed itself would silently change every golden fixture in the suite.
FONT_NAME = "NotoSansHebrew"

# -- page geometry, in PDF points (1/72") --------------------------------------
PAGE_WIDTH = 595.0  # A4
PAGE_HEIGHT = 842.0
MARGIN = 56.0
#: RTL: text is laid out from the right margin leftwards.
RIGHT_EDGE = PAGE_WIDTH - MARGIN
LEFT_EDGE = MARGIN
LINE_WIDTH = RIGHT_EDGE - LEFT_EDGE

SIZE_TITLE = 20.0
SIZE_SUBTITLE = 11.0
SIZE_SECTION = 13.0
SIZE_BODY = 11.0
SIZE_SMALL = 9.0

LEADING = 1.45

#: A signature is ink on a wide, short canvas. Fixed box so a parent who drew a large signature and
#: one who drew a small one produce the same document layout.
SIGNATURE_BOX = (200.0, 70.0)

#: §4.3's `derived_flags` are booleans and this module renders none of them; it renders the answers
#: it is handed. Bracket mirroring is the only glyph substitution done here.
_MIRRORED = {"(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<"}


# ==========================================================================================
# bidi
# ==========================================================================================
def is_rtl_char(char: str) -> bool:
    """Hebrew, including the presentation block.

    U+0590–U+05FF is Hebrew proper. U+FB1D–U+FB4F is the Hebrew presentation forms block, which
    carries pointed letters such as `שׁ` — a classifier that stopped at U+05FF would call one of
    those neutral and lay it out left-to-right in the middle of a word.
    """
    code = ord(char[0]) if char else 0
    return 0x0590 <= code <= 0x05FF or 0xFB1D <= code <= 0xFB4F


def _is_ltr_char(char: str) -> bool:
    """Latin letters and digits. Both behave the same way inside an RTL line: they keep their own
    order and are positioned as a unit, which is why `054` does not come out as `450`."""
    return char.isascii() and char.isalnum()


def shape_rtl(text: str) -> str:
    """Logical order in, **visual order out**, for a right-to-left paragraph.

    A simplified Unicode bidi pass, sufficient for the character classes a health declaration
    actually contains: Hebrew, Latin, digits, and the punctuation between them.

      1. classify each character as RTL, LTR-ish (Latin letter or digit), or neutral;
      2. resolve each neutral run to the direction of its neighbours, or to the base direction
         (RTL) when they disagree or it is at an edge;
      3. emit the runs in reverse order — base RTL puts the first logical run rightmost — reversing
         the characters inside each RTL run and mirroring its brackets, and leaving LTR runs alone.

    `"טלפון 054"` → `"054 ןופלט"`: read right-to-left that is the original, and the phone number is
    still the phone number. `"קובץ PDF מצורף"` keeps `PDF` spelled forwards.

    **Not a full UBA implementation, and deliberately not.** The full algorithm has explicit
    embedding controls, isolates, and bracket-pair resolution, none of which appears in a question
    a manager typed into a form. What is here is tested against the cases that do appear
    (`tests/health/test_pdf.py`), and a case it cannot handle is a case that never reaches it.
    """
    if not text:
        return ""

    # 1 -- classify. 'R', 'L', 'N'.
    classes = ["R" if is_rtl_char(c) else "L" if _is_ltr_char(c) else "N" for c in text]

    # 2 -- resolve neutrals.
    resolved = list(classes)
    index = 0
    while index < len(resolved):
        if resolved[index] != "N":
            index += 1
            continue
        start = index
        while index < len(resolved) and resolved[index] == "N":
            index += 1
        before = classes[start - 1] if start > 0 else None
        after = classes[index] if index < len(resolved) else None
        # A neutral run takes its neighbours' direction only when they agree. Otherwise the base
        # direction wins -- which for a Hebrew form is RTL, so the space before an English word
        # belongs to the Hebrew around it.
        direction = before if before is not None and before == after else "R"
        for position in range(start, index):
            resolved[position] = direction

    # 3 -- runs, emitted right-to-left.
    runs: list[tuple[str, str]] = []
    for char, direction in zip(text, resolved, strict=True):
        if runs and runs[-1][0] == direction:
            runs[-1] = (direction, runs[-1][1] + char)
        else:
            runs.append((direction, char))

    out: list[str] = []
    for direction, chunk in reversed(runs):
        if direction == "R":
            out.append("".join(_MIRRORED.get(c, c) for c in reversed(chunk)))
        else:
            out.append(chunk)
    return "".join(out)


# ==========================================================================================
# TrueType
# ==========================================================================================
class _TrueTypeFont:
    """Just enough of a TTF to embed it and measure it: `cmap`, `hmtx`, `head`, `hhea`, `OS/2`.

    Not a font library. A CIDFontType2 embedded whole needs the glyph ids for the text, the advance
    widths for the `/W` array and for wrapping, and the descriptor metrics — and nothing else. The
    font file itself goes into the PDF unmodified, so no `glyf` or `loca` parsing is needed at all:
    subsetting would save bytes and would mean rebuilding those two tables correctly, which is a
    much larger surface than an object-storage saving justifies.
    """

    def __init__(self, path: Path) -> None:
        self.data = path.read_bytes()
        self._tables = self._read_table_directory()
        self.units_per_em: int = struct.unpack_from(">H", self.data, self._offset("head") + 18)[0]
        self._x_min, self._y_min, self._x_max, self._y_max = struct.unpack_from(
            ">hhhh", self.data, self._offset("head") + 36
        )
        hhea = self._offset("hhea")
        self.ascent: int
        self.descent: int
        self.ascent, self.descent = struct.unpack_from(">hh", self.data, hhea + 4)
        self._num_h_metrics = struct.unpack_from(">H", self.data, hhea + 34)[0]
        self.num_glyphs = struct.unpack_from(">H", self.data, self._offset("maxp") + 4)[0]
        self._cmap = self._read_cmap()
        self._advance_cache: dict[int, int] = {}

    def _read_table_directory(self) -> dict[str, tuple[int, int]]:
        count = struct.unpack_from(">H", self.data, 4)[0]
        tables: dict[str, tuple[int, int]] = {}
        for index in range(count):
            base = 12 + 16 * index
            tag = self.data[base : base + 4].decode("latin-1")
            offset, length = struct.unpack_from(">II", self.data, base + 8)
            tables[tag] = (offset, length)
        return tables

    def _offset(self, tag: str) -> int:
        try:
            return self._tables[tag][0]
        except KeyError as exc:
            raise ValueError(f"{FONT_PATH.name} has no {tag!r} table") from exc

    def _read_cmap(self) -> dict[int, int]:
        """Format 4 only — the segmented Unicode BMP mapping every modern face carries.

        Format 12 would be needed for anything above U+FFFF; a health declaration in Hebrew,
        Russian or English contains nothing there, and a face that offered only format 12 would
        raise below rather than silently mapping every character to `.notdef`.
        """
        base = self._offset("cmap")
        count = struct.unpack_from(">H", self.data, base + 2)[0]
        chosen: int | None = None
        for index in range(count):
            platform, encoding, offset = struct.unpack_from(">HHI", self.data, base + 4 + 8 * index)
            table = base + offset
            if struct.unpack_from(">H", self.data, table)[0] != 4:
                continue
            if (platform, encoding) in ((3, 1), (0, 3), (0, 4), (0, 6)):
                chosen = table
                break
        if chosen is None:
            raise ValueError(f"{FONT_PATH.name} has no format-4 Unicode cmap subtable")

        seg_count = struct.unpack_from(">H", self.data, chosen + 6)[0] // 2
        ends_at = chosen + 14
        starts_at = ends_at + seg_count * 2 + 2
        deltas_at = starts_at + seg_count * 2
        ranges_at = deltas_at + seg_count * 2

        mapping: dict[int, int] = {}
        for segment in range(seg_count):
            end = struct.unpack_from(">H", self.data, ends_at + segment * 2)[0]
            start = struct.unpack_from(">H", self.data, starts_at + segment * 2)[0]
            delta = struct.unpack_from(">h", self.data, deltas_at + segment * 2)[0]
            range_offset_at = ranges_at + segment * 2
            range_offset = struct.unpack_from(">H", self.data, range_offset_at)[0]
            if start == 0xFFFF:
                continue
            for code in range(start, end + 1):
                if range_offset == 0:
                    glyph = (code + delta) & 0xFFFF
                else:
                    glyph_at = range_offset_at + range_offset + (code - start) * 2
                    if glyph_at + 2 > len(self.data):
                        continue
                    glyph = struct.unpack_from(">H", self.data, glyph_at)[0]
                    if glyph != 0:
                        glyph = (glyph + delta) & 0xFFFF
                if glyph:
                    mapping[code] = glyph
        return mapping

    def glyph(self, char: str) -> int:
        """`.notdef` (0) for an uncovered character, which renders as a visible box.

        Deliberately not a silent drop. A missing glyph on a signed medical document should be
        obvious to whoever looks at it, not quietly absent from a sentence that then reads
        differently.
        """
        return self._cmap.get(ord(char), 0)

    def advance(self, glyph: int) -> int:
        """In font units. `hmtx` repeats the last advance for every monospaced tail glyph."""
        if glyph in self._advance_cache:
            return self._advance_cache[glyph]
        hmtx = self._offset("hmtx")
        index = min(glyph, self._num_h_metrics - 1)
        at = hmtx + index * 4
        value = struct.unpack_from(">H", self.data, at)[0] if at + 2 <= len(self.data) else 0
        self._advance_cache[glyph] = value
        return value

    def width(self, text: str, size: float) -> float:
        units = sum(self.advance(self.glyph(char)) for char in text)
        return float(units) * size / self.units_per_em

    @property
    def bbox(self) -> tuple[int, int, int, int]:
        scale = 1000 / self.units_per_em
        return (
            int(self._x_min * scale),
            int(self._y_min * scale),
            int(self._x_max * scale),
            int(self._y_max * scale),
        )

    def scaled_ascent(self) -> int:
        return int(self.ascent * 1000 / self.units_per_em)

    def scaled_descent(self) -> int:
        return int(self.descent * 1000 / self.units_per_em)


_FONT: _TrueTypeFont | None = None


def _font() -> _TrueTypeFont:
    """One parse per process. The face is 112 KB and the cmap walk is not free; the render is
    called once per signature, and a worker re-parsing it per row would be the slow part."""
    global _FONT
    if _FONT is None:
        _FONT = _TrueTypeFont(FONT_PATH)
    return _FONT


# ==========================================================================================
# PNG
# ==========================================================================================
@dataclass(frozen=True)
class _Raster:
    width: int
    height: int
    rgb: bytes
    alpha: bytes | None


def _decode_png(data: bytes) -> _Raster:
    """8-bit, non-interlaced PNG → raw RGB plus an optional alpha plane.

    **Why decode at all rather than pass the IDAT through.** A PDF image can take a zlib stream
    directly when the PNG is greyscale or truecolour with no alpha — the classic pass-through
    trick. A signature drawn on a `<canvas>` is RGBA, which PDF has no colour space for: the alpha
    has to become a separate `/SMask`, and splitting the planes means undoing the row filters.
    So the pass-through is not available for the one image this module actually renders, and
    supporting both paths would be two code paths where the rare one is untested.
    """
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a PNG")
    offset = 8
    header: tuple[int, int, int, int, int, int, int] | None = None
    idat = bytearray()
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from(">I4s", data, offset)
        payload = data[offset + 8 : offset + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            idat += payload
        elif kind == b"IEND":
            break
        offset += 12 + length
    if header is None:
        raise ValueError("PNG has no IHDR")

    width, height, depth, colour, compression, filter_method, interlace = header
    if depth != 8 or compression != 0 or filter_method != 0 or interlace != 0:
        raise ValueError("only 8-bit, non-interlaced, zlib PNG is supported")
    channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(colour)
    if channels is None:
        raise ValueError(f"unsupported PNG colour type {colour}")

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(height * stride)
    previous = bytearray(stride)
    at = 0
    for row in range(height):
        filter_type = raw[at]
        at += 1
        line = bytearray(raw[at : at + stride])
        at += stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            if filter_type == 0:
                value = line[i]
            elif filter_type == 1:
                value = line[i] + left
            elif filter_type == 2:
                value = line[i] + up
            elif filter_type == 3:
                value = line[i] + (left + up) // 2
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                value = line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else up_left)
            else:
                raise ValueError(f"unknown PNG filter {filter_type}")
            line[i] = value & 0xFF
        out[row * stride : (row + 1) * stride] = line
        previous = line

    rgb = bytearray(width * height * 3)
    alpha: bytearray | None = bytearray(width * height) if colour in (4, 6) else None
    for pixel in range(width * height):
        base = pixel * channels
        if colour == 0:
            grey = out[base]
            rgb[pixel * 3 : pixel * 3 + 3] = bytes((grey, grey, grey))
        elif colour == 4:
            grey = out[base]
            rgb[pixel * 3 : pixel * 3 + 3] = bytes((grey, grey, grey))
            assert alpha is not None
            alpha[pixel] = out[base + 1]
        elif colour == 2:
            rgb[pixel * 3 : pixel * 3 + 3] = out[base : base + 3]
        else:
            rgb[pixel * 3 : pixel * 3 + 3] = out[base : base + 3]
            assert alpha is not None
            alpha[pixel] = out[base + 3]
    return _Raster(width, height, bytes(rgb), bytes(alpha) if alpha is not None else None)


# ==========================================================================================
# the document
# ==========================================================================================
@dataclass(frozen=True)
class RenderedSection:
    """One section of the declaration, already reduced to display strings.

    **The caller renders the answers, not this module.** A boolean answer is `כן`/`לא` in Hebrew,
    `Yes`/`No` in English and `Да`/`Нет` in Russian, and that is i18n's job (§9) — a PDF writer
    that decided it would be a tenth place locale strings live.
    """

    title: str
    rows: list[tuple[str, str]] = field(default_factory=list)
    #: Prose, for sections that are not question-and-answer: the club's `תקנון ותנאי תשלום`
    #: and the health clause the family confirmed. A row puts its answer at the reading end
    #: of the line, which is right for `האם יש אסתמה?  כן` and wrong for a paragraph of
    #: terms -- it would set the whole clause as a label with nothing opposite it.
    paragraphs: list[str] = field(default_factory=list)


class _Writer:
    """Indirect objects, in the order they are created. Deterministic by construction."""

    def __init__(self) -> None:
        self._objects: list[bytes] = []

    def add(self, body: bytes) -> int:
        self._objects.append(body)
        return len(self._objects)

    def reserve(self) -> int:
        self._objects.append(b"")
        return len(self._objects)

    def put(self, number: int, body: bytes) -> None:
        self._objects[number - 1] = body

    def build(self, root: int) -> bytes:
        out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        offsets: list[int] = []
        for index, body in enumerate(self._objects, start=1):
            offsets.append(len(out))
            out += f"{index} 0 obj\n".encode()
            out += body
            out += b"\nendobj\n"
        start_xref = len(out)
        out += f"xref\n0 {len(self._objects) + 1}\n".encode()
        out += b"0000000000 65535 f \n"
        for offset in offsets:
            out += f"{offset:010d} 00000 n \n".encode()
        # A deterministic /ID: the hash of everything written so far. The spec wants two strings,
        # the first stable across revisions of one document and the second per revision; there is
        # only ever one revision here, so both are the same digest. A random id -- the usual
        # choice -- is precisely what would make the golden fixture unusable.
        digest = hashlib.sha256(bytes(out)).hexdigest()[:32].upper()
        out += (
            f"trailer\n<< /Size {len(self._objects) + 1} /Root {root} 0 R "
            f"/ID [<{digest}> <{digest}>] >>\nstartxref\n{start_xref}\n%%EOF\n"
        ).encode()
        return bytes(out)


def _stream(dictionary: str, payload: bytes, *, compress: bool = True) -> bytes:
    data = zlib.compress(payload, 9) if compress else payload
    extra = " /Filter /FlateDecode" if compress else ""
    return (
        f"<< {dictionary} /Length {len(data)}{extra} >>\nstream\n".encode() + data + b"\nendstream"
    )


def _hex_glyphs(text: str) -> str:
    font = _font()
    return "".join(f"{font.glyph(char):04X}" for char in text)


def _wrap(text: str, size: float, max_width: float) -> list[str]:
    """Greedy word wrap in **logical** order. `shape_rtl` runs per line, afterwards.

    Shaping first and wrapping second would break a line in visual space, which puts the second
    half of a word on the wrong end of the next line.
    """
    font = _font()
    if font.width(text, size) <= max_width:
        return [text]
    lines: list[str] = []
    current = ""
    for word in text.split(" "):
        candidate = f"{current} {word}".strip()
        if current and font.width(candidate, size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


class _Page:
    """One page's content stream, laid out top-down from the right margin."""

    def __init__(self) -> None:
        self.ops: list[str] = []
        self.y = PAGE_HEIGHT - MARGIN
        self.images: dict[str, int] = {}

    def has_room(self, height: float) -> bool:
        return self.y - height >= MARGIN

    def text_rtl(self, text: str, size: float, *, grey: float = 0.0, indent: float = 0.0) -> None:
        """One line, right-aligned, shaped into visual order.

        Right-aligned by measurement rather than by a PDF text-alignment feature, because there is
        no such feature: `Tm` places an origin and the glyphs run left to right from it. The line's
        own width is what puts its right edge on the margin.
        """
        shaped = shape_rtl(text)
        width = _font().width(shaped, size)
        x = RIGHT_EDGE - indent - width
        self.y -= size * LEADING
        self.ops.append(
            f"BT {grey:.3f} g /F1 {size:.2f} Tf 1 0 0 1 {x:.2f} {self.y:.2f} Tm "
            f"<{_hex_glyphs(shaped)}> Tj ET"
        )

    def text_ltr_at(self, text: str, size: float, x: float, *, grey: float = 0.0) -> None:
        shaped = shape_rtl(text)
        self.ops.append(
            f"BT {grey:.3f} g /F1 {size:.2f} Tf 1 0 0 1 {x:.2f} {self.y:.2f} Tm "
            f"<{_hex_glyphs(shaped)}> Tj ET"
        )

    def gap(self, amount: float) -> None:
        self.y -= amount

    def rule(self, *, grey: float = 0.8) -> None:
        self.y -= 6
        self.ops.append(
            f"{grey:.3f} G 0.6 w {LEFT_EDGE:.2f} {self.y:.2f} m {RIGHT_EDGE:.2f} {self.y:.2f} l S"
        )
        self.y -= 6

    def image(self, name: str, width: float, height: float) -> None:
        self.y -= height
        x = RIGHT_EDGE - width
        self.ops.append(f"q {width:.2f} 0 0 {height:.2f} {x:.2f} {self.y:.2f} cm /{name} Do Q")

    def content(self) -> bytes:
        return "\n".join(self.ops).encode("latin-1")


def render_declaration_pdf(
    *,
    title: str,
    student_name: str,
    studio_name: str,
    signed_at: datetime,
    signed_by: str,
    template_version: int,
    sections: list[RenderedSection],
    signature_line: str = "",
    signature_png: bytes | None = None,
) -> bytes:
    """§5.5's *"renders a filled, signed PDF"*. Deterministic for identical inputs.

    `signed_at` is a parameter and never `clock.now()`: the date on a signed declaration is the date
    it was signed, and a re-render years later — after a key rotation, or to satisfy §11.3's export
    — must produce the same document. It is rendered in `Asia/Jerusalem` (CLAUDE.md), because a UTC
    date is the wrong day for every evening signature.

    **No expiry is printed**, and that is §5.5 rather than an omission: declarations do not expire.
    Eight artboards assume a validity date; `health.declaration.noExpiry` is the copy that replaced
    it, and printing one here would put the contradiction on the one artefact a club might hand to
    an insurer.
    """
    font = _font()
    local = signed_at.astimezone(STUDIO_TZ)

    pages: list[_Page] = []
    page = _Page()
    pages.append(page)

    def new_page() -> None:
        nonlocal page
        page = _Page()
        pages.append(page)

    def ensure(height: float) -> None:
        if not page.has_room(height):
            new_page()

    page.text_rtl(title, SIZE_TITLE)
    page.text_rtl(studio_name, SIZE_SUBTITLE, grey=0.35)
    page.text_rtl(f"עבור {student_name}", SIZE_SUBTITLE, grey=0.35)
    page.rule()

    for section in sections:
        ensure(SIZE_SECTION * LEADING + SIZE_BODY * LEADING * 2)
        page.gap(8)
        page.text_rtl(section.title, SIZE_SECTION)
        for question, answer in section.rows:
            answer_width = font.width(shape_rtl(answer), SIZE_BODY)
            wrapped = _wrap(question, SIZE_BODY, LINE_WIDTH - answer_width - 24)
            ensure(SIZE_BODY * LEADING * len(wrapped) + 4)
            for index, line in enumerate(wrapped):
                page.text_rtl(line, SIZE_BODY)
                if index == 0:
                    # The answer sits at the reading END of the row, which in RTL is the left.
                    page.text_ltr_at(answer, SIZE_BODY, LEFT_EDGE, grey=0.25)
            page.gap(2)
        for paragraph in section.paragraphs:
            wrapped = _wrap(paragraph, SIZE_BODY, LINE_WIDTH)
            ensure(SIZE_BODY * LEADING * len(wrapped) + 4)
            for line in wrapped:
                page.text_rtl(line, SIZE_BODY)
            page.gap(4)

    ensure(SIGNATURE_BOX[1] + SIZE_BODY * LEADING * 4 + 24)
    page.gap(14)
    page.rule()
    page.text_rtl("חתימה", SIZE_SECTION)

    image_object: int | None = None
    if signature_png is not None:
        raster = _decode_png(signature_png)
        width, height = SIGNATURE_BOX
        # Fit inside the box, preserving the drawn aspect ratio: a stretched signature is not the
        # signature that was drawn.
        scale = min(width / raster.width, height / raster.height)
        page.gap(6)
        page.image("Im1", raster.width * scale, raster.height * scale)
        page.images["Im1"] = 0  # filled in below, once the object number exists
    else:
        page.gap(SIGNATURE_BOX[1])

    page.text_rtl(f"{signed_by} · {local:%d.%m.%Y}", SIZE_SMALL, grey=0.35)
    page.text_rtl(f"גרסת שאלון {template_version}", SIZE_SMALL, grey=0.5)
    # The club's own sentence from `טופס הרשמה` block 6 -- "אני, ..., מאשר בזאת שקראתי את
    # הצהרת הבריאות ותקנון של מועדון ... ומתחייב לפעול עפ"י הנהלים הרשומים בו".
    #
    # **This replaces D11's disclaimer, it does not sit beside it.** That caveat said the
    # questionnaire was "a starting point only and not a compliance document", which was
    # true of a question set we wrote and handed to a club that had not reviewed it. This
    # document is the club's own form and the club's own תקנון, signed under the club's own
    # name, so printing that sentence on it would be false. See the design doc §11.
    if signature_line:
        page.gap(6)
        for line in _wrap(signature_line, SIZE_SMALL, LINE_WIDTH):
            page.text_rtl(line, SIZE_SMALL, grey=0.35)

    # -- objects ---------------------------------------------------------------
    writer = _Writer()
    font_file = writer.add(_stream(f"/Length1 {len(font.data)}", font.data))
    descriptor = writer.add(
        (
            f"<< /Type /FontDescriptor /FontName /{FONT_NAME} /Flags 4 "
            f"/FontBBox [{' '.join(str(v) for v in font.bbox)}] /ItalicAngle 0 "
            f"/Ascent {font.scaled_ascent()} /Descent {font.scaled_descent()} "
            f"/CapHeight {font.scaled_ascent()} /StemV 80 /FontFile2 {font_file} 0 R >>"
        ).encode()
    )
    # /W: every glyph the document actually uses. The default /DW covers the rest, and listing all
    # ~1,300 glyphs would put a kilobyte of widths in a file for the sake of glyphs nobody drew.
    used: set[int] = set()
    for content in (title, studio_name, student_name, signed_by, signature_line):
        used.update(font.glyph(c) for c in content)
    for section in sections:
        used.update(font.glyph(c) for c in section.title)
        for question, answer in section.rows:
            used.update(font.glyph(c) for c in question)
            used.update(font.glyph(c) for c in answer)
        # A paragraph glyph missing from /W renders at the default width, so the club's
        # terms would set with visibly wrong spacing -- on the page a family signs.
        for paragraph in section.paragraphs:
            used.update(font.glyph(c) for c in paragraph)
    used.update(font.glyph(c) for c in "0123456789.:·עבורגרסתשאלוןחתימה ")
    widths = " ".join(
        f"{glyph} [{int(font.advance(glyph) * 1000 / font.units_per_em)}]"
        for glyph in sorted(used)
        if glyph
    )
    cid_font = writer.add(
        (
            f"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{FONT_NAME} "
            f"/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
            f"/FontDescriptor {descriptor} 0 R /DW 1000 /W [{widths}] /CIDToGIDMap /Identity >>"
        ).encode()
    )
    type0 = writer.add(
        (
            f"<< /Type /Font /Subtype /Type0 /BaseFont /{FONT_NAME} /Encoding /Identity-H "
            f"/DescendantFonts [{cid_font} 0 R] >>"
        ).encode()
    )

    if signature_png is not None:
        raster = _decode_png(signature_png)
        smask_ref = ""
        if raster.alpha is not None:
            smask = writer.add(
                _stream(
                    f"/Type /XObject /Subtype /Image /Width {raster.width} "
                    f"/Height {raster.height} /ColorSpace /DeviceGray /BitsPerComponent 8",
                    raster.alpha,
                )
            )
            smask_ref = f" /SMask {smask} 0 R"
        image_object = writer.add(
            _stream(
                f"/Type /XObject /Subtype /Image /Width {raster.width} "
                f"/Height {raster.height} /ColorSpace /DeviceRGB /BitsPerComponent 8"
                f"{smask_ref}",
                raster.rgb,
            )
        )

    pages_object = writer.reserve()
    page_objects: list[int] = []
    for rendered in pages:
        contents = writer.add(_stream("", rendered.content()))
        resources = f"/Font << /F1 {type0} 0 R >>"
        if rendered.images and image_object is not None:
            resources += f" /XObject << /Im1 {image_object} 0 R >>"
        page_objects.append(
            writer.add(
                (
                    f"<< /Type /Page\n/Parent {pages_object} 0 R "
                    f"/MediaBox [0 0 {PAGE_WIDTH:.0f} {PAGE_HEIGHT:.0f}] "
                    f"/Resources << {resources} >> /Contents {contents} 0 R >>"
                ).encode()
            )
        )
    writer.put(
        pages_object,
        (
            f"<< /Type /Pages /Count {len(page_objects)} "
            f"/Kids [{' '.join(f'{n} 0 R' for n in page_objects)}] >>"
        ).encode(),
    )
    catalog = writer.add(f"<< /Type /Catalog /Pages {pages_object} 0 R /Lang (he-IL) >>".encode())
    return writer.build(catalog)
