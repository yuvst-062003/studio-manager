#!/usr/bin/env python
"""Build the face `app/services/health/pdf.py` embeds in every signed declaration.

**Why a merged face rather than two embedded fonts.** §9 ships three locales — `he`, `en` and
`ru` — and no single Noto face covers Hebrew *and* Cyrillic. The alternative to merging is
embedding two fonts and splitting every text run by which face covers each character, which puts
a second split inside `_Page.text_rtl` that interacts with the *direction* split already there:
different boundaries over the same string, plus a doubled `/W` array, a doubled descriptor, and
`_wrap`/`width` having to know which face they are measuring in. The writer's single-font
invariant is what keeps all of that short and correct, so the merge happens here, once, offline.

**Why this is a build script and not a runtime step.** `pdf.py` is deliberately dependency-free
(see its module docstring) and `fonttools` is not a runtime dependency. The output is committed
alongside this script, so the binary in the tree is reproducible from a pinned input rather than
being a blob somebody once downloaded.

**Provenance.** Both inputs are Noto, OFL 1.1, with no Reserved Font Name — so the merged result
may carry its own name, which it does, because it is not either upstream face. Sibling faces of
one superfamily: unitsPerEm 1000 for both, ascent 1068 vs 1069, descent -292 vs -293. That is
what makes the merge typographically sound rather than two unrelated fonts on one line.

**Layout tables are dropped on purpose.** `pdf.py` positions every run itself with a `Tm` and
writes glyph ids through `/Identity-H`; it applies no shaping and consults no `GSUB`/`GPOS`. They
are dead weight in a file that is embedded whole into every declaration PDF.

Usage::

    .venv/bin/python scripts/build-pdf-font.py

Then regenerate the golden fixture, because merging changes glyph ids::

    REGENERATE_GOLDEN=1 .venv/bin/pytest tests/health/test_pdf.py
"""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import ssl
import sys
import tempfile
import urllib.request

import certifi
from fontTools.merge import Merger
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS_DIR = pathlib.Path(__file__).resolve().parent.parent / "app" / "services" / "health" / "fonts"

#: Vendored, and the base of the merge: it already carries the Hebrew the product is written in
#: plus a Latin set, so keeping it as the base leaves those glyphs untouched.
HEBREW = FONTS_DIR / "NotoSansHebrew-Regular.ttf"
HEBREW_SHA256 = "7ef36a2c3593758cdb622e1bdef4f84523e92fbc3ccc667438dd80ff54c2de88"

#: Noto's Latin/Greek/Cyrillic face, pinned. Not vendored — only its Cyrillic survives the subset
#: below, and committing 616 KB to extract 256 glyphs from it would be the wrong trade.
CYRILLIC_URL = "https://notofonts.github.io/latin-greek-cyrillic/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf"
CYRILLIC_SHA256 = "141494de430d4f68e13c91138e10ae755909de8f5ff274db6f17becd393a2898"

#: What we take from the Cyrillic donor. Deliberately narrow: everything else the writer draws is
#: already in the Hebrew face, and a wider subset would only grow a file that ships inside every
#: declaration. U+0400–U+04FF is Cyrillic proper; U+2010–U+2027 is the dash-and-quote punctuation
#: Russian prose uses (`—` in `Да — арахис`) which the Hebrew face's Latin block does not cover.
CYRILLIC_RANGES = (range(0x0400, 0x0500), range(0x2010, 0x2028))

OUTPUT = FONTS_DIR / "NotoSansStudio-Regular.ttf"
#: The merged face is neither upstream font, so it says so. `pdf.py`'s `FONT_NAME` must match.
FAMILY = "NotoSansStudio"

#: `pdf.py` reads exactly these and nothing else. Anything not named here is dead weight in a
#: file embedded whole into every PDF.
KEEP_TABLES = ("cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "glyf", "loca")


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_cyrillic(into: pathlib.Path, *, local: pathlib.Path | None = None) -> pathlib.Path:
    """Fetch the donor, or use `--source` when it is already on disk.

    The CA bundle comes from `certifi` rather than the interpreter's default: this venv's Python
    was not installed with one, so a plain `urlopen` fails `CERTIFICATE_VERIFY_FAILED` on a URL
    `curl` fetches happily. The checksum below is what actually establishes trust in the bytes;
    the bundle only gets us to them.
    """
    target = into / "NotoSans-Regular.ttf"
    if local is not None:
        print(f"using local donor {local}")
        target.write_bytes(local.read_bytes())
    else:
        print(f"fetching {CYRILLIC_URL}")
        context = ssl.create_default_context(cafile=certifi.where())
        with urllib.request.urlopen(  # noqa: S310 — pinned https URL, checksummed below
            CYRILLIC_URL, timeout=60, context=context
        ) as response:
            target.write_bytes(response.read())
    found = digest(target)
    if found != CYRILLIC_SHA256:
        raise SystemExit(
            f"checksum mismatch for the Cyrillic donor.\n  expected {CYRILLIC_SHA256}\n"
            f"  got      {found}\nThe upstream file changed; verify it before updating the pin."
        )
    return target


#: Everything the merge cannot use, plus everything `pdf.py` never reads. `fvar`/`gvar`/`avar`/
#: `HVAR`/`STAT` are the variable-font machinery: the vendored Hebrew face is a *variable* font,
#: which is why a naive merge dies on `VarStore has no attribute mergeMap` — and why every
#: declaration PDF until now embedded a variation system no PDF viewer was ever going to apply.
_DEAD_TABLES = ["GSUB", "GPOS", "GDEF", "STAT", "HVAR", "MVAR", "VVAR", "kern", "DSIG", "gasp"]


def flatten(source: pathlib.Path, target: pathlib.Path, *, unicodes: list[int] | None) -> None:
    """One static, layout-free face, optionally reduced to `unicodes`.

    **Pinned to the default instance, not to a chosen weight.** A PDF viewer handed a variable
    font through `/FontFile2` applies no variations at all — it draws the default instance — so
    pinning to the default is exactly what is on the page today. Any other value would silently
    restyle every declaration ever rendered.
    """
    font = TTFont(source)
    if "fvar" in font:
        axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        instantiateVariableFont(font, axes, inplace=True, updateFontNames=False)

    options = Options()
    options.drop_tables += _DEAD_TABLES
    options.layout_features = []
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=unicodes if unicodes is not None else list(font.getBestCmap()))
    subsetter.subset(font)
    font.save(target)


#: Seconds since 1904-01-01, the TrueType epoch — 2026-09-07, the day this face was first built.
#: **Pinned, because fontTools stamps `head.created`/`head.modified` with the wall clock on save.**
#: Without this the build is not reproducible: two runs produce two different fonts, the font is
#: embedded whole in every PDF, and the golden fixture §5.5 mandates then fails for whoever next
#: runs `build-pdf-font.py` — a diff that means nothing, in the one test whose whole value is that
#: a diff always means something. Same reasoning as the deterministic `/ID` in `pdf.py`.
BUILD_TIMESTAMP = 3871584000


def stamp(font: TTFont) -> None:
    """Pin both timestamps, and stop `save()` putting the wall clock back.

    `recalcTimestamp` is the load-bearing half: without it `TTFont.save()` rewrites
    `head.modified` to `now()` on the way out, which also shifts `head.checkSumAdjustment` — so
    setting the fields alone leaves the build as irreproducible as it was.
    """
    font.recalcTimestamp = False
    font["head"].created = BUILD_TIMESTAMP
    font["head"].modified = BUILD_TIMESTAMP


def rename(font: TTFont) -> None:
    """A merged font that still called itself Noto Sans Hebrew would be a lie to anyone opening
    the PDF's font panel, and `pdf.py` pins `/BaseFont` by constant rather than reading the `name`
    table precisely so a rename cannot silently change a golden fixture."""
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16):
            value = FAMILY if record.nameID != 4 else f"{FAMILY} Regular"
            if record.nameID == 3:
                value = f"{FAMILY};StudioManager"
            record.string = value.encode("utf-16-be" if record.platformID == 3 else "latin-1")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=pathlib.Path,
        help="a NotoSans-Regular.ttf already on disk, instead of fetching it",
    )
    arguments = parser.parse_args()

    if digest(HEBREW) != HEBREW_SHA256:
        raise SystemExit(f"{HEBREW.name} is not the pinned revision; update HEBREW_SHA256.")

    with tempfile.TemporaryDirectory() as work_dir:
        work = pathlib.Path(work_dir)
        donor = fetch_cyrillic(work, local=arguments.source)

        hebrew_flat = work / "hebrew.ttf"
        flatten(HEBREW, hebrew_flat, unicodes=None)
        print(f"hebrew face flattened to {len(TTFont(hebrew_flat).getBestCmap())} codepoints")

        cyrillic_only = work / "cyrillic.ttf"
        flatten(donor, cyrillic_only, unicodes=[cp for span in CYRILLIC_RANGES for cp in span])
        print(f"donor subset to {len(TTFont(cyrillic_only).getBestCmap())} codepoints")

        # The Hebrew face is first, so where both define a codepoint its glyph wins and today's
        # Hebrew and Latin render exactly as they do now.
        merged = Merger().merge([str(hebrew_flat), str(cyrillic_only)])
        # Materialised before the loop, because the body deletes from what it is iterating.
        present = list(merged.keys())
        for tag in present:
            if tag not in KEEP_TABLES and tag != "GlyphOrder":
                del merged[tag]
        rename(merged)
        stamp(merged)
        merged.save(OUTPUT)

    written = TTFont(OUTPUT)
    cmap = written.getBestCmap()
    counts = {
        "hebrew": sum(1 for c in cmap if 0x0590 <= c <= 0x05FF),
        "latin": sum(1 for c in cmap if 0x0020 <= c <= 0x024F),
        "cyrillic": sum(1 for c in cmap if 0x0400 <= c <= 0x04FF),
    }
    print(f"\nwrote {OUTPUT.relative_to(FONTS_DIR.parent.parent.parent.parent)}")
    print(f"  {OUTPUT.stat().st_size:,} bytes · {written['maxp'].numGlyphs} glyphs")
    print(f"  coverage: {counts}")
    missing = [c for c in "אבגדהוזחטיךכלםמןנסעףפץצקרשת" if ord(c) not in cmap]
    missing += [
        c
        for c in "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяё"
        if ord(c) not in cmap
    ]
    missing += [
        c
        for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        if ord(c) not in cmap
    ]
    if missing:
        raise SystemExit(f"the merged face is missing: {''.join(missing)}")
    print("  every Hebrew, Cyrillic and Latin letter present")
    print("\nNow regenerate the golden fixture — merging changes glyph ids:")
    print("  REGENERATE_GOLDEN=1 .venv/bin/pytest tests/health/test_pdf.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
