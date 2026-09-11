#!/usr/bin/env bash
# Resize + JPEG-compress every capture, then emit a JS file of data URIs the
# artifact can inline. External images are blocked by the artifact CSP, so the
# pictures have to travel inside the page.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p web
: > web/images.js
echo "const IMG = {" >> web/images.js

for f in *.png; do
  name="${f%.png}"
  cp "$f" "web/$name.jpg"
  sips -s format jpeg -s formatOptions 72 -Z 1100 "web/$name.jpg" --out "web/$name.jpg" >/dev/null 2>&1
  b64=$(base64 -i "web/$name.jpg")
  printf '  "%s": "data:image/jpeg;base64,%s",\n' "$name" "$b64" >> web/images.js
done

echo "};" >> web/images.js
ls -la web/images.js | awk '{print "images.js", $5, "bytes"}'
