"""Splice the base64 image map into the page, producing the artifact file."""

import pathlib

here = pathlib.Path(__file__).parent
page = (here / "web" / "page.html").read_text(encoding="utf-8")
images = (here / "web" / "images.js").read_text(encoding="utf-8")

out = page.replace("/*__IMAGES__*/", images)
assert "/*__IMAGES__*/" not in out, "placeholder not replaced"

target = here / "web" / "dashboard-before-after.html"
target.write_text(out, encoding="utf-8")
print(f"{target} — {target.stat().st_size / 1_000_000:.2f} MB")
