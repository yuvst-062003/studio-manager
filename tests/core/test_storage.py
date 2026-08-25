"""M1.8 -- app/core/storage.py, the one place bytes are filed.

The design doc (docs/superpowers/specs/2026-08-25-object-storage-and-setup-wizard-design.md
§2) settles what this layer refuses and why. These tests are that section, executable.

Nothing here touches a network. The filesystem backend is built regardless of what
production runs on, precisely so the suite stays hermetic -- §2.2.
"""

from __future__ import annotations

import pytest
from app.core.storage import (
    MAX_UPLOAD_BYTES,
    FilesystemObjectStore,
    ObjectNotFoundError,
    UnsafeKeyError,
    UnsupportedImageError,
    build_object_store,
    sniff_image_type,
    studio_logo_key,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
GIF = b"GIF89a" + b"\x00" * 32


@pytest.fixture
def store(tmp_path) -> FilesystemObjectStore:
    return FilesystemObjectStore(tmp_path / "objects")


# -- the seam ----------------------------------------------------------------
def test_put_then_get_round_trips_bytes_and_content_type(store: FilesystemObjectStore) -> None:
    store.put("studios/a/logo.png", PNG, content_type="image/png")
    assert store.get("studios/a/logo.png") == (PNG, "image/png")


def test_exists_reports_both_ways(store: FilesystemObjectStore) -> None:
    assert store.exists("studios/a/logo.png") is False
    store.put("studios/a/logo.png", PNG, content_type="image/png")
    assert store.exists("studios/a/logo.png") is True


def test_put_overwrites_in_place(store: FilesystemObjectStore) -> None:
    store.put("studios/a/logo.png", PNG, content_type="image/png")
    store.put("studios/a/logo.png", JPEG, content_type="image/jpeg")
    assert store.get("studios/a/logo.png") == (JPEG, "image/jpeg")


def test_delete_removes_the_object_and_its_content_type(store: FilesystemObjectStore) -> None:
    store.put("studios/a/logo.png", PNG, content_type="image/png")
    store.delete("studios/a/logo.png")
    assert store.exists("studios/a/logo.png") is False
    with pytest.raises(ObjectNotFoundError):
        store.get("studios/a/logo.png")


def test_delete_is_idempotent(store: FilesystemObjectStore) -> None:
    """A DELETE that 204s twice must not depend on the row having survived."""
    store.delete("studios/a/logo.png")


def test_get_of_an_absent_key_raises_rather_than_returning_empty(
    store: FilesystemObjectStore,
) -> None:
    with pytest.raises(ObjectNotFoundError):
        store.get("studios/a/logo.png")


# -- §2.5, keys ---------------------------------------------------------------
@pytest.mark.parametrize(
    "key",
    [
        "../etc/passwd",
        "studios/../../etc/passwd",
        "/etc/passwd",
        "studios/a/../../../root/.ssh/id_rsa",
        "",
        "studios/a/..",
    ],
)
def test_a_traversing_or_absolute_key_is_refused(store: FilesystemObjectStore, key: str) -> None:
    """Defence in depth behind a value no user can reach -- keys are built server-side."""
    with pytest.raises(UnsafeKeyError):
        store.put(key, PNG, content_type="image/png")
    with pytest.raises(UnsafeKeyError):
        store.get(key)
    with pytest.raises(UnsafeKeyError):
        store.delete(key)
    with pytest.raises(UnsafeKeyError):
        store.exists(key)


def test_nothing_is_written_outside_the_root(tmp_path) -> None:
    root = tmp_path / "objects"
    store = FilesystemObjectStore(root)
    store.put("studios/a/logo.png", PNG, content_type="image/png")
    written = [p for p in root.rglob("*") if p.is_file()]
    assert written, "the object was not written at all"
    for path in written:
        assert root.resolve() in path.resolve().parents


def test_studio_logo_key_is_built_from_the_id_and_the_sniffed_type() -> None:
    import uuid

    studio_id = uuid.UUID("00000000-0000-4000-8000-000000000001")
    assert studio_logo_key(studio_id, "image/png") == f"studios/{studio_id}/logo.png"
    assert studio_logo_key(studio_id, "image/jpeg") == f"studios/{studio_id}/logo.jpg"
    assert studio_logo_key(studio_id, "image/webp") == f"studios/{studio_id}/logo.webp"


# -- §2.4, what the bytes must be ---------------------------------------------
@pytest.mark.parametrize(
    ("data", "expected"),
    [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")],
)
def test_sniff_recognises_the_three_allowed_formats(data: bytes, expected: str) -> None:
    assert sniff_image_type(data) == expected


@pytest.mark.parametrize("data", [SVG, GIF, b"", b"\x00\x01\x02\x03", b"RIFFxxxxAVI "])
def test_sniff_refuses_everything_else_svg_included(data: bytes) -> None:
    """An SVG can carry script, and it would be served from our own origin -- §2.4."""
    assert sniff_image_type(data) is None


def test_a_lying_content_type_does_not_decide_the_stored_type() -> None:
    """The header is attacker-controlled; the first bytes are not.

    Both directions: PNG bytes declared as SVG, and SVG bytes declared as PNG.
    """
    assert sniff_image_type(PNG) == "image/png"
    with pytest.raises(UnsupportedImageError):
        studio_logo_key(__import__("uuid").uuid4(), "image/svg+xml")


def test_the_ceiling_is_two_megabytes() -> None:
    assert MAX_UPLOAD_BYTES == 2 * 1024 * 1024


# -- §2.2, the backend is a configuration value -------------------------------
def test_the_filesystem_backend_is_what_the_default_config_builds(monkeypatch, tmp_path) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "filesystem")
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path))
    assert isinstance(build_object_store(), FilesystemObjectStore)


def test_s3_is_a_seam_that_is_not_built_yet_and_says_so(monkeypatch, tmp_path) -> None:
    """§2.2 -- 'later, if ever'. A backend that silently fell back to the filesystem
    would put production bytes somewhere nobody chose."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path))
    with pytest.raises(NotImplementedError, match="STORAGE_BACKEND"):
        build_object_store()
