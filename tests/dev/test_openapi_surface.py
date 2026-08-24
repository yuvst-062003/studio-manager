"""The generated client describes what a client can actually reach.

Verified before this plan: scripts/export_openapi.py imported app.main with no
environment pinned, so `openapi.json` -- which ci-local.sh diffs and fails on -- was a
function of the exporting machine's ENV the moment a conditionally-mounted router
existed.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_the_committed_schema_carries_no_dev_surface():
    schema = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
    dev_paths = [p for p in schema["paths"] if "/dev" in p]
    assert dev_paths == [], (
        "the dev surface reached the generated api-client. Run "
        "`.venv/bin/python scripts/export_openapi.py` and commit the result: the "
        f"export must pin ENV=production. Found {dev_paths}"
    )


def test_the_export_still_carries_the_real_surface():
    """The complement, so 'no dev paths' can never be satisfied by an empty file."""
    schema = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
    assert "/api/v1/health" in schema["paths"]
