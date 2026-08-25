"""The container ships every file the API reads, and the Dockerfile is where that is proved.

This exists because of a crash that no test could have caught. `app/core/cors.py` builds
its allowlist from `infra/railway/domains.json`, resolved as `parents[2]` and read at
**import** time -- so a missing file is not a degraded feature, it is a container that
cannot boot. The Dockerfile copied `app/` and nothing else, so the file was there on every
developer's disk and in no image ever built. Staging ran a pre-M1 snapshot, which is the
only reason it took until the first real deploy to surface.

The general test is the one that matters. Naming `domains.json` alone would restore the
same blind spot the moment a second module reaches outside `app/`, so instead every
module-level `Path` in the package that points into the repo but outside `app/` has to be
covered by a `COPY`. A lane that adds such a read finds out from pytest rather than from a
crashlooping deploy.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

import app as app_package

REPO = Path(__file__).resolve().parents[1]
DOCKERFILE = REPO / "Dockerfile"
APP_DIR = REPO / "app"


def _copy_sources() -> list[Path]:
    """Every source path the Dockerfile copies, repo-relative.

    The last token of a COPY is its destination; `--from=` and friends are not paths.
    """
    sources: list[Path] = []
    for raw in DOCKERFILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.upper().startswith("COPY "):
            continue
        tokens = [t for t in line.split()[1:] if not t.startswith("--")]
        sources.extend(Path(t) for t in tokens[:-1])
    return sources


def _is_shipped(relative: Path, sources: list[Path]) -> bool:
    return any(relative == src or relative.is_relative_to(src) for src in sources)


def _app_modules() -> list[object]:
    modules = [app_package]
    for info in pkgutil.walk_packages(app_package.__path__, f"{app_package.__name__}."):
        modules.append(importlib.import_module(info.name))
    return modules


def test_the_domains_file_the_cors_allowlist_reads_is_in_the_image():
    """The specific regression: §11.7's cookie needs CORS, CORS needs this file."""
    from app.core.cors import DOMAINS_PATH

    relative = DOMAINS_PATH.resolve().relative_to(REPO)
    assert _is_shipped(relative, _copy_sources()), (
        f"{relative} is read at import by app/core/cors.py but no COPY in the Dockerfile "
        f"puts it in the image -- the API cannot boot in a container"
    )


def test_no_module_level_path_escapes_what_the_image_ships():
    """The closed rule. A new read outside app/ fails here, not in production."""
    sources = _copy_sources()
    escaped: list[str] = []

    for module in _app_modules():
        for name, value in vars(module).items():
            if not isinstance(value, Path):
                continue
            resolved = value.resolve()
            if not resolved.is_relative_to(REPO) or resolved.is_relative_to(APP_DIR):
                continue
            relative = resolved.relative_to(REPO)
            if not _is_shipped(relative, sources):
                escaped.append(f"{module.__name__}.{name} -> {relative}")

    assert not escaped, "read at import but never copied into the image: " + ", ".join(
        sorted(escaped)
    )


def test_the_parser_reads_the_dockerfile_that_is_actually_used():
    """A detector that finds nothing proves nothing. Anchor it to a real COPY."""
    sources = _copy_sources()
    assert Path("app") in sources, "expected the Dockerfile to copy app/"
    assert _is_shipped(Path("app/core/cors.py"), sources)
    assert not _is_shipped(Path("README.md"), sources)
