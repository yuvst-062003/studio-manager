"""Splice the image bundle into the proof page, ready to republish."""

import pathlib

here = pathlib.Path(__file__).parent / "proof-web"
page = (here / "page.html").read_text(encoding="utf-8")
images = (here / "images.js").read_text(encoding="utf-8")

out = page.replace("/*__IMAGES__*/", images)
assert "/*__IMAGES__*/" not in out, "placeholder not replaced"

target = here / "proof.html"
target.write_text(out, encoding="utf-8")
print(f"{target} — {target.stat().st_size / 1_000_000:.2f} MB")
