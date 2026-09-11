#!/usr/bin/env bash
# Rebuild the checkpoint-proof artifact. Run after each checkpoint, then republish
# web/proof.html to the SAME artifact URL.
#
# Images travel inside the page as data URIs: the artifact CSP blocks external images,
# so a <img src="https://..."> would render as nothing at all.
set -euo pipefail
cd "$(dirname "$0")"

OUT=proof-web
mkdir -p "$OUT"
: > "$OUT/images.js"
echo "const IMG = {" >> "$OUT/images.js"

emit() {
  local key="$1" src="$2"
  [ -f "$src" ] || return 0
  cp "$src" "$OUT/$key.jpg"
  sips -s format jpeg -s formatOptions 70 -Z 1200 "$OUT/$key.jpg" --out "$OUT/$key.jpg" >/dev/null 2>&1
  printf '  "%s": "data:image/jpeg;base64,%s",\n' "$key" "$(base64 -i "$OUT/$key.jpg")" >> "$OUT/images.js"
}

# Three sets, because the page compares three things:
#   before-*  the dashboard as it was on 2026-09-10, before any checkpoint
#   after-*   the PROTOTYPE's own screens — the design being ported
#   proto-*   extra prototype captures (a drawer open, a modal) the nine views do not show
for f in dashboard-redesign/before-*.png dashboard-redesign/after-*.png dashboard-redesign/proto-*.png; do
  [ -f "$f" ] || continue
  emit "$(basename "$f" .png)" "$f"
done

# Every checkpoint's own proof.
for d in dashboard-checkpoints/*/; do
  [ -d "$d" ] || continue
  cp_name=$(basename "$d")
  for f in "$d"*.png; do
    [ -f "$f" ] || continue
    emit "${cp_name}--$(basename "$f" .png)" "$f"
  done
done

echo "};" >> "$OUT/images.js"
ls -la "$OUT/images.js" | awk '{print "images.js", $5, "bytes"}'
