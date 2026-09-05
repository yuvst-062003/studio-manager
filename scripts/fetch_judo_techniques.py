#!/usr/bin/env python3
"""Build the judo technique dataset. Run by a person, never by the app.

The output is committed, so the running app has no dependency on anyone's uptime and the
library works offline in the installed PWA. Re-run it when a source changes.

WHERE THE DATA COMES FROM, and why not from the obvious place:

  * `judo.ijf.org` is the obvious place and is NOT a source. Its robots.txt carries
    `Content-Signal: search=yes, ai-train=no, use=reference` plus an express EU DSM
    Article 4 reservation. "Reference" means cite and link, not reproduce. So we link to
    the IJF and copy nothing from them.

  * Kodokan Global (`kdkjd.org`) -- the sport's governing body, and the authority on
    technique naming. Gives the 100 techniques, their families, both Gokyo
    classifications, and a video on the official Kodokan YouTube channel for every one.

  * English Wikipedia's `List of judo techniques` (CC BY-SA 4.0) -- gives the kanji and
    the literal meaning of each name.

WHAT IS TAKEN, and what is not. Only FACTS: names, kanji, classification, Gokyo group, a
YouTube id. Facts carry no copyright, so nothing is republished and no share-alike
attaches. The Kodokan's English definitions are read to WRITE the Hebrew from and are not
shipped -- a translation of their sentence would still be their sentence.

The Hebrew lives in `hebrew.json`, hand-authored, and is merged rather than generated.
Keeping it out of this script's output is what lets the script be re-run without
destroying work no scraper can redo.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

KODOKAN = "https://kdkjd.org/%E6%8A%80/%E6%9F%94%E9%81%93-%E6%8A%80%E5%90%8D%E7%A7%B0%E4%B8%80%E8%A6%A7/"
WIKIPEDIA = "https://en.wikipedia.org/wiki/List_of_judo_techniques"
IJF = "https://judo.ijf.org/techniques/{slug}"
UA = "studio-manager-judo-seed/1.0 (one-off dataset build; contact the studio admin)"

ROOT = Path(__file__).resolve().parent.parent
#: The dataset lives in the feature that reads it rather than in `web/packages/`.
#: A new workspace package would need an alias in `web/tsconfig.json` and an `npm install`
#: that rewrites `package-lock.json` -- two shared files, while another session is working
#: in this repo. `workspaceAliases()` would have registered it with Vite and Vitest for
#: free, so promoting it to `@studio/judo` is a file move plus a manifest, and belongs in
#: the same commit that wires the tab.
DATA = ROOT / "web" / "apps" / "parent" / "src" / "features" / "techniques" / "data"
OUT = DATA / "techniques.json"
HEBREW = DATA / "hebrew.json"

#: Kodokan table heading -> (category, subcategory). The headings carry their own counts,
#: which `--check` asserts against, so a page redesign that drops a family is loud.
FAMILIES = {
    "Te-waza": ("nage-waza", "te", 16),
    "Koshi-waza": ("nage-waza", "koshi", 10),
    "Ashi-waza": ("nage-waza", "ashi", 21),
    "Ma-sutemi-waza": ("nage-waza", "ma-sutemi", 5),
    "Yoko-sutemi-waza": ("nage-waza", "yoko-sutemi", 16),
    "Osaekomi-waza": ("katame-waza", "osaekomi", 10),
    "Shime-waza": ("katame-waza", "shime", 12),
    "Kansetsu-waza": ("katame-waza", "kansetsu", 10),
}


def _ssl_context() -> ssl.SSLContext:
    """A context with a CA bundle that actually exists.

    The python.org 3.14 build on macOS ships no root certificates, so a bare urlopen dies
    with CERTIFICATE_VERIFY_FAILED against every host here. `certifi` is already in the
    virtualenv; the system bundle is the fallback for a checkout without it. Verification
    is never disabled -- an unverified fetch of a dataset we then commit is how a
    man-in-the-middle edits the club's reference material.
    """
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        system = Path("/etc/ssl/cert.pem")
        return ssl.create_default_context(cafile=str(system) if system.exists() else None)


CONTEXT = _ssl_context()


def fetch(url: str, *, timeout: int = 45) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=timeout, context=CONTEXT) as response:
        return response.read().decode("utf-8", errors="replace")


def strip_tags(fragment: str) -> str:
    """Text of an HTML fragment, with <br> preserved as a separator.

    The Kodokan puts the name and its definition in one cell divided by a <br>, so a
    naive tag strip would weld them into a single unusable string.
    """
    fragment = re.sub(r"<br\s*/?>", "\x00", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).replace(" ", " ").strip()


def key(name: str) -> str:
    """Join key across sources.

    The two sources disagree about punctuation for the same technique -- the Kodokan
    writes `Seoi-nage`, Wikipedia writes `Seoi nage`, and `Ude-higishi-juji-gatame`
    appears with several spellings. Everything that is not a letter is dropped.
    """
    return re.sub(r"[^a-z]", "", name.lower())


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def parse_kodokan(page: str) -> tuple[list[dict], dict[str, int]]:
    """The eight family tables, and the 1920 Gokyo grouping."""
    techniques: list[dict] = []
    gokyo: dict[str, int] = {}

    for table in re.findall(r"<table>(.*?)</table>", page, re.S):
        heading_match = re.search(r"<th[^>]*>(.*?)</th>", table, re.S)
        if not heading_match:
            continue
        heading = strip_tags(heading_match.group(1))
        family = heading.split("(")[0].strip()

        # The Gokyo tables are a different shape: a group name and a list of techniques.
        # Only the 1920 revision is taken -- it is the one in use, and holding both would
        # make `gokyoGroup` ambiguous with nothing on screen to disambiguate it.
        if "Revised in 1920" in heading:
            for row in re.findall(r"<tr>(?!\s*<th)(.*?)</tr>", table, re.S):
                cells = [strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
                if len(cells) != 2:
                    continue
                group_match = re.search(r"(\d)", cells[0])
                if not group_match:
                    continue
                group = int(group_match.group(1))
                for member in re.split(r",\s*", re.sub(r"\(.*?\)", "", cells[1])):
                    if member.strip():
                        gokyo[key(member)] = group
            continue

        if family not in FAMILIES:
            continue
        category, subcategory, _ = FAMILIES[family]

        order = 0
        for row in re.findall(r"<tr>(?!\s*<th)(.*?)</tr>", table, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            # A technique row is two cells whose first is the family's running number.
            # Some families open with a single-cell image caption, which that excludes.
            #
            # The test is the NUMBER and not the video link. Sasae-tsurikomi-ashi has no
            # video on the Kodokan's page, and keying on the link dropped it -- a Gokyo
            # group 1 throw, among the first any student is taught. `youtubeId` is
            # nullable precisely so a technique can exist without one.
            if len(cells) != 2 or not strip_tags(cells[0]).strip().isdigit():
                continue
            video = re.search(r"(?:youtu\.be/|v=)([A-Za-z0-9_-]{11})", row)
            parts = strip_tags(cells[1]).split("\x00")
            name = parts[0].strip()
            if not name:
                continue
            order += 1
            techniques.append(
                {
                    "slug": slugify(name),
                    "nameRomaji": name,
                    "category": category,
                    "subcategory": subcategory,
                    "youtubeId": video.group(1) if video else None,
                    "orderIndex": order,
                    # Read to write the Hebrew from. Deliberately NOT shipped -- see the
                    # module docstring.
                    "_definitionEn": parts[1].strip() if len(parts) > 1 else "",
                }
            )
    return techniques, gokyo


def parse_wikipedia(page: str) -> dict[str, tuple[str, str]]:
    """`Name (kanji): meaning` list items -> {key: (kanji, meaning)}."""
    body = page.split('id="Nage-waza', 1)[-1]
    found: dict[str, tuple[str, str]] = {}
    for item in re.findall(r"<li[^>]*>(.*?)</li>", body, re.S):
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", item))).strip()
        match = re.match(r"^([A-Za-z][A-Za-z \-']+?)\s*\(([一-鿿぀-ヿ]+)\)\s*:?\s*(.*)$", text)
        if not match:
            continue
        name, kanji, meaning = match.groups()
        meaning = meaning.split(".")[0].strip()
        found.setdefault(key(name), (kanji, meaning))
    return found


def verify_ijf(name: str, *, pause: float) -> str | None:
    """The IJF slug, but only if the page is really there.

    The slug is derivable from the romaji and deriving it without checking is how a child
    taps "3D animation" and gets a blank frame with nothing to read.
    """
    slug = "-".join(part.capitalize() for part in name.split("-"))
    request = urllib.request.Request(IJF.format(slug=slug), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=20, context=CONTEXT) as response:
            ok = response.status == 200
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        ok = False
    time.sleep(pause)
    return slug if ok else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-ijf", action="store_true", help="do not verify IJF pages (100 requests)")
    parser.add_argument("--pause", type=float, default=0.3, help="seconds between IJF requests")
    args = parser.parse_args()

    print("fetching Kodokan…", file=sys.stderr)
    techniques, gokyo = parse_kodokan(fetch(KODOKAN))
    print("fetching Wikipedia…", file=sys.stderr)
    wikipedia = parse_wikipedia(fetch(WIKIPEDIA))
    hebrew = json.loads(HEBREW.read_text(encoding="utf-8")) if HEBREW.exists() else {}
    # What the last run proved about the IJF. `--skip-ijf` carries these forward rather
    # than emptying the column: reading the slug from the Hebrew overlay (which has never
    # held one) silently wiped all 100 verified URLs on the first re-run, and a dataset
    # that loses a verified fact because a flag was passed is worse than one that refuses.
    previous = (
        {t["slug"]: t.get("ijfSlug") for t in json.loads(OUT.read_text(encoding="utf-8"))}
        if OUT.exists()
        else {}
    )

    for technique in techniques:
        k = key(technique["nameRomaji"])
        kanji, meaning = wikipedia.get(k, ("", ""))
        overlay = hebrew.get(technique["slug"], {})
        technique["nameKanji"] = overlay.get("nameKanji") or kanji
        technique["nameHebrew"] = overlay.get("nameHebrew", "")
        technique["meaning"] = overlay.get("meaning", "")
        technique["descriptionHe"] = overlay.get("descriptionHe", "")
        technique["gokyoGroup"] = gokyo.get(k)
        technique["_meaningEn"] = meaning
        if not args.skip_ijf:
            technique["ijfSlug"] = verify_ijf(technique["nameRomaji"], pause=args.pause)
        else:
            technique["ijfSlug"] = previous.get(technique["slug"])

    # ── Report. A silent seed is how a family arrives with half a dataset. ──
    counts: dict[str, int] = {}
    for technique in techniques:
        counts[technique["subcategory"]] = counts.get(technique["subcategory"], 0) + 1
    print(f"\n{len(techniques)} techniques", file=sys.stderr)
    problems = 0
    for _, (_, subcategory, expected) in FAMILIES.items():
        got = counts.get(subcategory, 0)
        flag = "ok " if got == expected else "!! "
        if got != expected:
            problems += 1
        print(f"  {flag}{subcategory:<12} {got:>3} / {expected}", file=sys.stderr)
    for field, label in (("nameKanji", "kanji"), ("nameHebrew", "Hebrew name"), ("descriptionHe", "Hebrew text")):
        missing = [t["slug"] for t in techniques if not t.get(field)]
        print(f"  missing {label:<12} {len(missing):>3}" + (f"  e.g. {', '.join(missing[:4])}" if missing else ""), file=sys.stderr)
    verified = sum(1 for t in techniques if t["ijfSlug"])
    source = "verified" if not args.skip_ijf else "carried over"
    print(f"  IJF {source:<13} {verified:>3} / {len(techniques)}", file=sys.stderr)

    shipped = [{k: v for k, v in t.items() if not k.startswith("_")} for t in techniques]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(shipped, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)}", file=sys.stderr)

    # The English source material, for writing the Hebrew from. Not committed, not shipped.
    source = DATA / ".source-definitions.json"
    source.write_text(
        json.dumps({t["slug"]: {"en": t["_definitionEn"], "meaning": t["_meaningEn"]} for t in techniques}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
