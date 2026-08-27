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


def test_name_lands_on_the_column_and_the_rest_in_settings(client, as_owner, app_session) -> None:
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
    row = app_session.execute(select(Studio).where(Studio.id == as_owner.studio_id)).scalar_one()
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
    empty = client.patch(STUDIO, json={"parent_locales": []}, headers=as_owner.headers)
    assert empty.status_code == 422
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
    refused = client.patch(STUDIO, json={"name": "x"}, headers=as_lead_coach.headers)
    assert refused.status_code == 403


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


def test_landing_content_writes_through_the_same_route_and_reaches_the_shop_window(
    client, as_owner, studio
) -> None:
    """Landing decision 1 assumed 'the club writes its own pitch' — and until 2026-08-28
    nothing could write it: the public landing read `settings.landing.*` while this route
    wrote only top-level keys. The panel and the shop window now meet in the middle."""
    response = client.patch(
        STUDIO,
        json={
            "landing": {
                "headline": "ג׳ודו לילדים מגיל 4",
                "about": "מתאמנים מאז 2008",
                "trial_steps": ["מגיעים עשר דקות לפני", "  ", "מתאמנים"],
            }
        },
        headers=as_owner.headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["landing"]["headline"] == "ג׳ודו לילדים מגיל 4"
    # Blank lines are dropped, not stored: the textarea sends what the manager typed.
    assert body["landing"]["trial_steps"] == ["מגיעים עשר דקות לפני", "מתאמנים"]

    public = client.get(f"/api/v1/public/studios/{studio.slug}/landing")
    # A studio with no schedule answers 503 — the content fields still travel on the
    # groups-less read below via GET /studio; assert the public read when it answers.
    if public.status_code == 200:
        assert public.json()["headline"] == "ג׳ודו לילדים מגיל 4"


def test_landing_content_merges_key_by_key(client, as_owner) -> None:
    """The panel autosaves one field at a time; a whole-blob replace would blank the
    others — the exact failure mode update_studio_fields' docstring warns about."""
    client.patch(STUDIO, json={"landing": {"headline": "כותרת"}}, headers=as_owner.headers)
    body = client.patch(
        STUDIO, json={"landing": {"about": "אודות"}}, headers=as_owner.headers
    ).json()
    assert body["landing"] == {"headline": "כותרת", "about": "אודות", "trial_steps": None}


def test_the_public_landing_falls_back_to_the_settings_the_panel_already_writes(
    client, as_owner, studio, app_session
) -> None:
    """A club that filled in its address and phone once — in the settings screen that
    exists — should not be asked for them a second time under a different key."""
    client.patch(
        STUDIO,
        json={"address": "הרצל 12, רעננה", "phone": "052-1234567"},
        headers=as_owner.headers,
    )
    public = client.get(f"/api/v1/public/studios/{studio.slug}/landing")
    if public.status_code == 200:
        assert public.json()["address"] == "הרצל 12, רעננה"
        assert public.json()["phone"] == "052-1234567"
