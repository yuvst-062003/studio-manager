"""Seam 2 -- app/main.py mounts routers by discovery and is never edited again.

A lane adds app/routers/attendance.py and it mounts. If someone reintroduces an
explicit include_router list, this file fails and the seam is restored on purpose
rather than by accident.
"""

from pathlib import Path

from app.main import app
from fastapi.testclient import TestClient

MAIN = Path(__file__).resolve().parents[1] / "app" / "main.py"
MODELS_INIT = Path(__file__).resolve().parents[1] / "app" / "models" / "__init__.py"


def test_discovery_actually_mounted_a_router():
    """End-to-end proof: health.py is referenced nowhere in main.py, only found."""
    assert "health" not in MAIN.read_text(encoding="utf-8")
    assert TestClient(app).get("/api/v1/health").status_code == 200


def test_main_mounts_by_discovery_not_by_an_explicit_list():
    text = MAIN.read_text(encoding="utf-8")
    assert "pkgutil.iter_modules" in text, "routers must be discovered, not listed"
    # One include_router inside the loop, plus the versioned mount. No more.
    assert text.count("include_router") == 2


def test_models_are_discovered_too():
    text = MODELS_INIT.read_text(encoding="utf-8")
    assert "pkgutil.iter_modules" in text, "models must be discovered, not listed"


def test_dev_router_is_excluded_in_production():
    """Source assertion by necessity -- app/routers/dev.py does not exist until M0's
    §19 work. §19.6 requires the router not exist in prod, not merely be guarded."""
    text = MAIN.read_text(encoding="utf-8")
    assert 'settings.ENV == "production"' in text
    assert '"dev"' in text
