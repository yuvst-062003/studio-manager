"""The generated client describes what a client can actually reach.

Verified before this plan: scripts/export_openapi.py imported app.main with no
environment pinned, so `openapi.json` -- which ci-local.sh diffs and fails on -- was a
function of the exporting machine's ENV the moment a conditionally-mounted router
existed.

This test and ci-local.sh cover different failure modes, and neither is sufficient
alone. This test reads the committed `openapi.json` as it sits on disk and asserts it
is *clean* -- it catches a dev surface that was hand-edited into the file, or
committed from an export someone ran with the ENV pin removed, but on its own it
cannot tell a clean file from a stale one, since it never regenerates anything.
`ci-local.sh` regenerates the schema (line 27) and only then runs
`git diff --exit-code -- openapi.json web/packages/api-client/src/schema.d.ts`
(line 29) -- that diff is what catches the ENV pin itself being deleted from
export_openapi.py. Delete the pin and the diff gate fires; hand-edit the artefact and
this test fires.
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
