"""The build cockpit — a developer tool, not a product surface.

Never imports `app` or anything under `web`. Its job is to report the truth when
those will not import, so it cannot depend on them. The only third-party import
permitted anywhere in this package is `yaml`.
"""

from __future__ import annotations

from pathlib import Path

# Resolved from __file__, never from the cwd: the server is started from a shell
# script that does not chdir, and every subprocess is launched with this as cwd.
ROOT = Path(__file__).resolve().parents[2]
