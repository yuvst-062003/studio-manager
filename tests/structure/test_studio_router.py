"""M1.8's three scoped studio-logo routes.

There is deliberately **no** generic `GET /files/{key}`. A generic file route invites
both path traversal and enumeration across tenants, so reads are scoped routes and the
studio comes from the verified JWT via TenantSession -- one studio cannot address
another's object even by guessing. The last test in this file is that claim.
"""

from __future__ import annotations

import logging
import uuid

import pytest
from app.core.storage import MAX_UPLOAD_BYTES
from app.models.studio import Studio
from sqlalchemy import select

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture(autouse=True)
def storage_root(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "filesystem")
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path / "objects"))
    return tmp_path / "objects"


def upload(client, caller, data: bytes, *, filename="logo.png", declared="image/png"):
    return client.post(
        "/api/v1/studio/logo",
        files={"file": (filename, data, declared)},
        headers=caller.headers,
    )


# -- the happy path -----------------------------------------------------------
def test_a_manager_uploads_a_logo_and_gets_a_url_back(client, as_manager) -> None:
    response = upload(client, as_manager, PNG)
    assert response.status_code == 200, response.text
    assert response.json()["logo_url"].startswith("/api/v1/studio/logo")


def test_the_upload_points_the_studio_column_at_a_server_built_key(
    client, as_manager, app_session
) -> None:
    upload(client, as_manager, PNG)
    app_session.expire_all()
    key = app_session.execute(
        select(Studio.logo_object_key).where(Studio.id == as_manager.studio_id)
    ).scalar_one()
    assert key == f"studios/{as_manager.studio_id}/logo.png"


def test_the_bytes_come_back_from_the_scoped_get(client, as_manager) -> None:
    upload(client, as_manager, PNG)
    response = client.get("/api/v1/studio/logo", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"


@pytest.mark.parametrize(("data", "extension"), [(PNG, "png"), (JPEG, "jpg"), (WEBP, "webp")])
def test_all_three_allowed_formats_round_trip(
    client, as_manager, app_session, data: bytes, extension: str
) -> None:
    assert upload(client, as_manager, data).status_code == 200
    app_session.expire_all()
    key = app_session.execute(
        select(Studio.logo_object_key).where(Studio.id == as_manager.studio_id)
    ).scalar_one()
    assert key.endswith(f"logo.{extension}")


def test_a_second_upload_replaces_the_first(client, as_manager) -> None:
    upload(client, as_manager, PNG)
    upload(client, as_manager, JPEG, filename="other.jpg", declared="image/jpeg")
    response = client.get("/api/v1/studio/logo", headers=as_manager.headers)
    assert response.content == JPEG
    assert response.headers["content-type"] == "image/jpeg"


def test_delete_clears_the_column_and_the_bytes(client, as_manager, app_session) -> None:
    upload(client, as_manager, PNG)
    assert client.delete("/api/v1/studio/logo", headers=as_manager.headers).status_code == 204
    app_session.expire_all()
    key = app_session.execute(
        select(Studio.logo_object_key).where(Studio.id == as_manager.studio_id)
    ).scalar_one()
    assert key is None
    assert client.get("/api/v1/studio/logo", headers=as_manager.headers).status_code == 404


def test_get_before_any_upload_is_404_not_500(client, as_manager) -> None:
    assert client.get("/api/v1/studio/logo", headers=as_manager.headers).status_code == 404


# -- a key that outlived its bytes -------------------------------------------
# Both cases below answer 404, because 404 is the honest answer to "show me the logo"
# either way. They are NOT the same event, and the screen cannot tell them apart: the
# dashboard renders nothing and says nothing, which is how a broken deployment read as a
# frontend bug for three rounds (2026-08-31 — the `api` service had no volume, so
# STORAGE_ROOT lived in the container and every redeploy emptied it). The log is the only
# place the difference survives, so it is asserted.
def test_a_logo_key_whose_object_is_gone_is_404_and_is_logged(
    client, as_manager, storage_root, caplog
) -> None:
    upload(client, as_manager, PNG)
    key = f"studios/{as_manager.studio_id}/logo.png"
    # Exactly what a redeploy does to an unmounted STORAGE_ROOT: the column still points
    # at the key, the bytes are gone.
    (storage_root / key).unlink()

    with caplog.at_level(logging.WARNING):
        assert client.get("/api/v1/studio/logo", headers=as_manager.headers).status_code == 404

    missing = [record for record in caplog.records if "logo object missing" in record.message]
    assert len(missing) == 1, caplog.text
    # `extra=`, so the scrubber has keys to match — never interpolated into the message.
    assert missing[0].logo_object_key == key
    assert missing[0].studio_id == str(as_manager.studio_id)


def test_no_logo_at_all_is_404_and_stays_quiet(client, as_manager, caplog) -> None:
    """The ordinary case stays quiet. A warning on every club that never uploaded a logo
    is a warning nobody reads, which would cost the test above its whole value."""
    with caplog.at_level(logging.WARNING):
        assert client.get("/api/v1/studio/logo", headers=as_manager.headers).status_code == 404
    assert [record for record in caplog.records if "logo object missing" in record.message] == []


def test_delete_with_no_logo_is_still_204(client, as_manager) -> None:
    assert client.delete("/api/v1/studio/logo", headers=as_manager.headers).status_code == 204


# -- §2.4, what it refuses -----------------------------------------------------
def test_svg_is_refused_even_when_declared_as_png(client, as_manager) -> None:
    """The stored-XSS case. Declaring PNG must not launder SVG bytes."""
    response = upload(client, as_manager, SVG, filename="logo.png", declared="image/png")
    assert response.status_code == 415, response.text
    assert response.json()["detail"]["code"] == "unsupported_image"


def test_png_bytes_declared_as_svg_are_accepted_because_the_bytes_decide(
    client, as_manager
) -> None:
    """The other direction of the same rule: the header is not consulted at all."""
    response = upload(client, as_manager, PNG, filename="x.svg", declared="image/svg+xml")
    assert response.status_code == 200, response.text


def test_a_gif_is_refused(client, as_manager) -> None:
    assert upload(client, as_manager, b"GIF89a" + b"\x00" * 64).status_code == 415


def test_an_empty_body_is_refused(client, as_manager) -> None:
    assert upload(client, as_manager, b"").status_code == 415


def test_over_two_megabytes_is_refused(client, as_manager) -> None:
    oversize = PNG + b"\x00" * (MAX_UPLOAD_BYTES + 1)
    response = upload(client, as_manager, oversize)
    assert response.status_code == 413, response.text
    assert response.json()["detail"]["code"] == "too_large"


def test_exactly_two_megabytes_is_accepted(client, as_manager) -> None:
    at_limit = PNG + b"\x00" * (MAX_UPLOAD_BYTES - len(PNG))
    assert len(at_limit) == MAX_UPLOAD_BYTES
    assert upload(client, as_manager, at_limit).status_code == 200


# -- §3.2, who may -------------------------------------------------------------
def test_an_owner_may_upload(client, as_owner) -> None:
    assert upload(client, as_owner, PNG).status_code == 200


def test_a_coach_may_not_upload_or_delete(client, as_lead_coach) -> None:
    """§3.2 -- 'Studio settings' is owner ✓ manager ✓ and nothing else."""
    assert upload(client, as_lead_coach, PNG).status_code == 403
    assert client.delete("/api/v1/studio/logo", headers=as_lead_coach.headers).status_code == 403


def test_a_coach_may_still_read_the_logo(client, as_manager, as_lead_coach) -> None:
    """Reading is not a settings write. A staff app that could not render the club's own
    logo would be enforcing a rule about writes by breaking a read."""
    upload(client, as_manager, PNG)
    assert client.get("/api/v1/studio/logo", headers=as_lead_coach.headers).status_code == 200


def test_an_anonymous_caller_gets_401_from_every_verb(client) -> None:
    assert client.get("/api/v1/studio/logo").status_code == 401
    posted = client.post("/api/v1/studio/logo", files={"file": ("l.png", PNG, "image/png")})
    assert posted.status_code == 401
    assert client.delete("/api/v1/studio/logo").status_code == 401


# -- §2.5, tenancy -------------------------------------------------------------
def test_one_studio_cannot_read_another_studios_logo(
    client, as_manager, app_session, fake_provider
) -> None:
    """There is no key in the URL, so there is nothing to guess. This asserts the
    consequence: a manager of a different studio reading the same path gets their own
    studio's answer, which is 404."""
    from tests.structure.conftest import _make_caller

    upload(client, as_manager, PNG)

    other = Studio(name="מועדון שני", slug=f"o2-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.commit()
    stranger = _make_caller(client, fake_provider, app_session, other, role="manager")

    assert client.get("/api/v1/studio/logo", headers=stranger.headers).status_code == 404
    # And the first studio's bytes are untouched by the stranger's DELETE.
    assert client.delete("/api/v1/studio/logo", headers=stranger.headers).status_code == 204
    assert client.get("/api/v1/studio/logo", headers=as_manager.headers).content == PNG


def test_there_is_no_generic_file_route(client, as_manager) -> None:
    """§2.5 -- a generic GET /files/{key} invites traversal and cross-tenant
    enumeration, so it must not exist at all rather than be guarded."""
    from app.main import app

    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert not any("/files/" in p for p in paths), paths


def test_the_upload_is_audited(client, as_manager, app_session) -> None:
    from app.models.audit import AuditLog

    upload(client, as_manager, PNG)
    actions = (
        app_session.execute(
            select(AuditLog.action).where(AuditLog.studio_id == as_manager.studio_id)
        )
        .scalars()
        .all()
    )
    assert "studio.logo.uploaded" in actions
