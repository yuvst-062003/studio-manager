"""M1.9's step 1 -- פרטי מועדון, and the הגדרות panel that reads the same row.

§4.3 pins the studio column list exactly as M0 built it, so `sport`, `address`, `phone`
and `parent_locales` go into the JSONB `settings` rather than into new columns. §4.3's
"settings includes:" is a description of what the column holds, not a closed set. Nothing
here needs a migration.
"""

from __future__ import annotations

from app.models.studio import Studio
from sqlalchemy import select

STUDIO = "/api/v1/studio"


def test_get_returns_the_merged_column_and_settings_view(client, as_owner) -> None:
    body = client.get(STUDIO, headers=as_owner.headers).json()
    assert body["name"]
    assert body["default_locale"] == "he"
    assert body["logo_url"] is None
    assert body["parent_locales"] == ["he"]


def test_name_lands_on_the_column_and_the_rest_in_settings(
    client, as_owner, app_session
) -> None:
    response = client.patch(
        STUDIO,
        json={
            "name": "מכבי ג'ודו רעננה",
            "sport": "judo",
            "address": "אחוזה 120, רעננה",
            "phone": "09-771-2233",
            "parent_locales": ["he", "ru"],
        },
        headers=as_owner.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    row = app_session.execute(
        select(Studio).where(Studio.id == as_owner.studio_id)
    ).scalar_one()
    assert row.name == "מכבי ג'ודו רעננה"
    assert row.settings["sport"] == "judo"
    assert row.settings["address"] == "אחוזה 120, רעננה"
    assert row.settings["phone"] == "09-771-2233"
    assert row.settings["parent_locales"] == ["he", "ru"]


def test_a_partial_patch_leaves_the_untouched_fields_alone(client, as_owner) -> None:
    client.patch(STUDIO, json={"phone": "09-000-0000"}, headers=as_owner.headers)
    body = client.patch(STUDIO, json={"address": "הרצל 1"}, headers=as_owner.headers).json()
    assert body["phone"] == "09-000-0000"
    assert body["address"] == "הרצל 1"


def test_parent_locales_must_be_a_non_empty_subset_of_the_three(client, as_owner) -> None:
    """§9 ships he, en and ru. A studio offering a language with no locale file would
    render keys at a parent."""
    assert client.patch(STUDIO, json={"parent_locales": []}, headers=as_owner.headers).status_code == 422
    assert (
        client.patch(STUDIO, json={"parent_locales": ["fr"]}, headers=as_owner.headers).status_code
        == 422
    )


def test_parent_locales_are_deduplicated_and_ordered(client, as_owner) -> None:
    body = client.patch(
        STUDIO, json={"parent_locales": ["ru", "he", "ru"]}, headers=as_owner.headers
    ).json()
    assert body["parent_locales"] == ["he", "ru"]


def test_the_default_locale_is_always_offered_to_parents(client, as_owner) -> None:
    """Dropping the studio's own default would leave the fallback pointing at a language
    the studio says it does not offer."""
    body = client.patch(STUDIO, json={"parent_locales": ["ru"]}, headers=as_owner.headers).json()
    assert "he" in body["parent_locales"]


def test_an_empty_name_is_refused(client, as_owner) -> None:
    assert client.patch(STUDIO, json={"name": "   "}, headers=as_owner.headers).status_code == 422


def test_a_coach_may_read_but_never_write_studio_details(client, as_lead_coach) -> None:
    assert client.get(STUDIO, headers=as_lead_coach.headers).status_code == 200
    assert client.patch(STUDIO, json={"name": "x"}, headers=as_lead_coach.headers).status_code == 403


def test_an_anonymous_caller_is_401(client) -> None:
    assert client.get(STUDIO).status_code == 401
    assert client.patch(STUDIO, json={"name": "x"}).status_code == 401


def test_the_write_is_audited(client, as_owner, app_session) -> None:
    from app.models.audit import AuditLog

    client.patch(STUDIO, json={"phone": "09-1"}, headers=as_owner.headers)
    actions = (
        app_session.execute(select(AuditLog.action).where(AuditLog.studio_id == as_owner.studio_id))
        .scalars()
        .all()
    )
    assert "studio.details.updated" in actions
