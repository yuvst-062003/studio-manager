"""The landing gallery — §5.4a ①'s photos, finally fed by something.

`photo_urls` sat hard-coded to `[]` in the public landing payload because nothing could
write `settings.landing.photo_object_keys`. These routes are that writer, built on the
logo's exact rails: server-built keys, sniffed bytes, capped reads, and NO generic
`GET /files/{key}` — the public read is scoped by slug and by membership in the studio's
own list, so a key is never guessable into another club's page.
"""

from __future__ import annotations

import pytest
from app.models.studio import Studio
from sqlalchemy import select

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture(autouse=True)
def storage_root(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "filesystem")
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path / "objects"))
    return tmp_path / "objects"


def upload(client, caller, data: bytes, *, filename="photo.png", declared="image/png"):
    return client.post(
        "/api/v1/studio/landing-photos",
        files={"file": (filename, data, declared)},
        headers=caller.headers,
    )


# -- the happy path -----------------------------------------------------------
def test_a_manager_uploads_a_photo_and_gets_the_public_url_back(client, as_manager, studio) -> None:
    response = upload(client, as_manager, PNG)
    assert response.status_code == 200, response.text
    photos = response.json()["photos"]
    assert len(photos) == 1
    assert photos[0]["url"].startswith(f"/api/v1/public/studios/{studio.slug}/photos/")


def test_the_upload_appends_a_server_built_key(client, as_manager, app_session) -> None:
    upload(client, as_manager, PNG)
    app_session.expire_all()
    settings = app_session.execute(
        select(Studio.settings).where(Studio.id == as_manager.studio_id)
    ).scalar_one()
    keys = settings["landing"]["photo_object_keys"]
    assert len(keys) == 1
    assert keys[0].startswith(f"studios/{as_manager.studio_id}/landing/")
    assert keys[0].endswith(".png")


def test_photos_surface_on_the_public_landing_in_upload_order(client, as_manager, studio) -> None:
    first = upload(client, as_manager, PNG).json()["photos"][0]["url"]
    second = upload(client, as_manager, JPEG, filename="b.jpg", declared="image/jpeg").json()[
        "photos"
    ][1]["url"]
    landing = client.get(f"/api/v1/public/studios/{studio.slug}/landing")
    assert landing.status_code == 200
    assert landing.json()["photo_urls"] == [first, second]


def test_the_public_photo_route_serves_the_bytes_anonymously(client, as_manager, studio) -> None:
    url = upload(client, as_manager, PNG).json()["photos"][0]["url"]
    response = client.get(url)
    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"


def test_an_unknown_photo_id_is_a_404(client, studio) -> None:
    response = client.get(f"/api/v1/public/studios/{studio.slug}/photos/{'0' * 32}")
    assert response.status_code == 404


# -- delete -------------------------------------------------------------------
def test_delete_removes_the_photo_everywhere(client, as_manager, studio) -> None:
    photo = upload(client, as_manager, PNG).json()["photos"][0]
    response = client.delete(
        f"/api/v1/studio/landing-photos/{photo['id']}", headers=as_manager.headers
    )
    assert response.status_code == 204
    assert client.get(f"/api/v1/public/studios/{studio.slug}/landing").json()["photo_urls"] == []
    assert client.get(photo["url"]).status_code == 404


def test_delete_twice_is_still_204(client, as_manager) -> None:
    photo = upload(client, as_manager, PNG).json()["photos"][0]
    path = f"/api/v1/studio/landing-photos/{photo['id']}"
    assert client.delete(path, headers=as_manager.headers).status_code == 204
    assert client.delete(path, headers=as_manager.headers).status_code == 204


# -- the ceiling --------------------------------------------------------------
def test_the_seventh_photo_is_refused(client, as_manager) -> None:
    """Six is a strip; more is a gallery the page was never designed to scroll."""
    for _ in range(6):
        assert upload(client, as_manager, PNG).status_code == 200
    response = upload(client, as_manager, PNG)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "too_many_photos"


# -- what the bytes must be ---------------------------------------------------
def test_svg_is_refused_even_when_declared_as_png(client, as_manager) -> None:
    """The stored-XSS case. Declaring PNG must not launder SVG bytes."""
    response = upload(client, as_manager, SVG, filename="photo.png", declared="image/png")
    assert response.status_code == 415


def test_over_the_ceiling_is_refused(client, as_manager) -> None:
    from app.core.storage import MAX_UPLOAD_BYTES

    huge = b"\x89PNG\r\n\x1a\n" + b"\x00" * MAX_UPLOAD_BYTES
    assert upload(client, as_manager, huge).status_code == 413


# -- who may write ------------------------------------------------------------
def test_a_coach_may_not_upload_or_delete(client, as_lead_coach) -> None:
    assert upload(client, as_lead_coach, PNG).status_code == 403
    assert (
        client.delete(
            f"/api/v1/studio/landing-photos/{'0' * 32}", headers=as_lead_coach.headers
        ).status_code
        == 403
    )
