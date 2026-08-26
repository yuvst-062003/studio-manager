"""SPEC 19.4's role switcher. Holdback 4.

19.6 restriction 1 is the assertion that matters most: "Cannot act inside a non-demo
studio in production. Not 'is discouraged from' -- the studio resolver excludes
is_demo = false for developer sessions in production, and a test asserts it." There is now
a route that could violate it, so the restriction stops being about a hypothetical.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from app.core.tenancy import with_all_tenants
from app.models.audit import AuditLog
from app.models.identity import AuthIdentity
from app.models.person import Person
from app.services.demo.service import DemoStudioService
from app.services.identity.act_as import ActAsRefusedError, resolve_persona
from sqlalchemy import select
from sqlalchemy.orm import Session

_SCOPE = "test reads the demo studio's seeded rows directly"


@pytest.fixture
def demo_studio_id(app_session: Session) -> Iterator[uuid.UUID]:
    DemoStudioService.reset(app_session)
    app_session.commit()
    yield DemoStudioService.studio_id(app_session)


@pytest.fixture
def persona_ids(app_session: Session, demo_studio_id: uuid.UUID) -> dict[str, uuid.UUID]:
    with with_all_tenants(reason=_SCOPE):
        rows = (
            app_session.execute(
                select(AuthIdentity.provider_subject, Person.id)
                .join(Person, Person.auth_identity_id == AuthIdentity.id)
                .where(
                    Person.studio_id == demo_studio_id,
                    AuthIdentity.provider_subject.like("demo-persona-%"),
                )
            )
            .tuples()
            .all()
        )
    return {subject.removeprefix("demo-persona-"): person_id for subject, person_id in rows}


# -- the switch ---------------------------------------------------------------
def test_switching_returns_a_token_carrying_the_new_persona(client, persona_ids):
    response = client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}")
    assert response.status_code == 200, response.text
    assert response.json()["acting_as_person_id"] == str(persona_ids["manager"])
    assert response.json()["roles"] == ["manager"]


def test_the_new_token_resolves_permissions_from_that_person(client, persona_ids):
    """19.4 -- 'the API resolves permissions from that Person exactly as it would for a
    real login.' Acting as the assistant coach must LOSE the manager's rights, or the
    persona that exists to verify no financial data leaks proves nothing."""
    manager = client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}").json()["access_token"]
    assistant = client.post(f"/api/v1/dev/act-as/{persona_ids['assistant']}").json()["access_token"]

    allowed = client.post(
        "/api/v1/classes",
        json={"name": f"שיעור-{uuid.uuid4().hex[:6]}"},
        headers={"Authorization": f"Bearer {manager}"},
    )
    refused = client.post(
        "/api/v1/classes",
        json={"name": f"שיעור-{uuid.uuid4().hex[:6]}"},
        headers={"Authorization": f"Bearer {assistant}"},
    )
    assert allowed.status_code == 201, allowed.text
    assert refused.status_code == 403


def test_switching_to_dev_none_loses_everything(client, persona_ids):
    """19.3 -- 'no roles, no children. The refusal screens in both apps.'"""
    token = client.post(f"/api/v1/dev/act-as/{persona_ids['none']}").json()["access_token"]
    body = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["access"] == {"staff": False, "parent": False}


def test_switching_to_dev_both_gets_both_apps(client, persona_ids):
    """19.3 -- 'lead_coach AND guardian. The dual-role case -- two apps, one identity.'"""
    token = client.post(f"/api/v1/dev/act-as/{persona_ids['both']}").json()["access_token"]
    body = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["access"] == {"staff": True, "parent": True}


def test_every_response_carries_x_acting_as(client, persona_ids):
    """19.4 -- 'so the active persona is visible in dev tools and in Sentry
    breadcrumbs.'"""
    token = client.post(f"/api/v1/dev/act-as/{persona_ids['lead']}").json()["access_token"]
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.headers["X-Acting-As"] == str(persona_ids["lead"])


def test_switching_does_not_invalidate_the_previous_token(client, persona_ids):
    """A NEW token is minted rather than the caller's being rewritten. Asserted because
    the alternative is worse in a way that is easy to miss: rewriting in place would leave
    the old persona valid for up to fifteen more minutes, so one identity would have two
    live personas and only one of them in the audit trail."""
    first = client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}").json()["access_token"]
    second = client.post(f"/api/v1/dev/act-as/{persona_ids['lead']}").json()["access_token"]
    assert first != second
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first}"}).status_code
        == 200
    )


# -- 19.4's audit trail -------------------------------------------------------
def test_every_switch_is_audit_logged_in_the_demo_studios_own_log(
    client, persona_ids, app_session, demo_studio_id
):
    """19.4 -- 'Every switch is audit-logged in the demo studio's own log.' An
    impersonation feature in a system holding medical data about minors leaves a trail or
    it is not a feature, it is a hole."""
    client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}")
    entries = (
        app_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "dev.act_as", AuditLog.studio_id == demo_studio_id)
            .order_by(AuditLog.created_at.desc())
        )
        .scalars()
        .all()
    )
    assert entries
    assert entries[0].entity_id == persona_ids["manager"]
    assert entries[0].entity_type == "person"


def test_the_audit_entry_names_the_persona_and_no_health_data(
    client, persona_ids, app_session, demo_studio_id
):
    """G7 -- 'Never put health contents in diff.' There are none to put here, and this is
    the test that would notice if a later change started including the persona's record
    rather than its label."""
    client.post(f"/api/v1/dev/act-as/{persona_ids['parent3']}")
    entry = (
        app_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "dev.act_as", AuditLog.studio_id == demo_studio_id)
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        .scalars()
        .one()
    )
    assert entry.diff is not None
    assert set(entry.diff) == {"persona", "label", "roles"}
    assert entry.diff["persona"] == "parent3"


def test_the_audit_trail_survives_a_demo_reset(client, persona_ids, app_session, demo_studio_id):
    """audit_log is in NEVER_WIPED (app/services/demo/service.py): '§19.4 audit-logs every
    persona switch to the demo studio's own log, and evidence is not scratch data.'"""
    client.post(f"/api/v1/dev/act-as/{persona_ids['manager']}")

    def _count() -> int:
        return len(
            app_session.execute(
                select(AuditLog.id).where(
                    AuditLog.action == "dev.act_as", AuditLog.studio_id == demo_studio_id
                )
            )
            .scalars()
            .all()
        )

    before = _count()
    DemoStudioService.reset(app_session)
    app_session.commit()
    assert _count() == before


# -- the dropdown -------------------------------------------------------------
def test_the_switcher_lists_all_nine_personas_in_19_3s_order(client, persona_ids):
    body = client.get("/api/v1/dev/personas").json()
    assert [p["key"] for p in body["items"]] == [
        "owner",
        "manager",
        "lead",
        "assistant",
        "parent3",
        "parent1",
        "trial",
        "both",
        "none",
    ]


def test_the_switcher_states_the_missing_student_persona(client, persona_ids):
    """19.3 -- 'the dev bar says so explicitly, so the gap is visible rather than
    confusing.' Served as data so the client cannot drift from the spec's own wording."""
    body = client.get("/api/v1/dev/personas").json()
    assert all(p["key"] != "student" for p in body["items"])
    assert "תלמיד" in body["no_student_persona_note"]


def test_each_persona_carries_what_it_exists_to_test(client, persona_ids):
    """19.3's right-hand column, carried to where the switch happens."""
    body = client.get("/api/v1/dev/personas").json()
    assistant = next(p for p in body["items"] if p["key"] == "assistant")
    assert "financial" in assistant["tests"]


# -- 19.6 ---------------------------------------------------------------------
def test_a_non_developer_cannot_switch_on_a_deployed_environment(client, monkeypatch):
    """RequireDeveloper. In development with no DEV_TOOLS_TOKEN this is permissive by
    design (app/core/dev_account.py's own reasoning), so this pins the STAGING shape,
    where a token is configured and staging is a public HTTPS origin."""
    from app.core.config import settings
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "ENV", "staging")
    monkeypatch.setattr(settings, "DEV_TOOLS_TOKEN", SecretStr("a-configured-token"))
    assert client.post(f"/api/v1/dev/act-as/{uuid.uuid4()}").status_code == 403


def test_switching_into_a_person_in_a_real_studio_is_refused_in_production(
    app_session, persona_ids
):
    """19.6 restriction 1. The route does not exist in production (restriction 2), so this
    asserts the SERVICE refuses -- the layer that would still be reachable if the router
    were ever mounted by mistake. Restriction 2 is the mechanism; this is the belt."""
    with pytest.raises(ActAsRefusedError):
        resolve_persona(
            app_session,
            person_id=persona_ids["manager"],
            env="production",
            studio_is_demo=False,
        )


def test_the_demo_studio_is_still_reachable_in_production(app_session, persona_ids):
    """19.1 -- 'in production the developer account can do anything it likes, but only
    ever inside a studio that contains no real people.' A service that refused everything
    in production would satisfy restriction 1 and delete the feature."""
    persona = resolve_persona(
        app_session, person_id=persona_ids["manager"], env="production", studio_is_demo=True
    )
    assert persona.roles == ("manager",)


def test_an_unknown_person_is_refused_the_same_way_as_a_forbidden_one(app_session):
    """One exception for both. Distinguishing them would let a developer session enumerate
    person ids in a studio it is not allowed to act in."""
    with pytest.raises(ActAsRefusedError):
        resolve_persona(app_session, person_id=uuid.uuid4(), env="development")


def test_in_production_the_route_does_not_exist_at_all(production_client):
    """19.6 restriction 2, and M0.2's mechanism: app/main.py's discovery loop skips a
    module named `dev` when ENV == production, so this 404s the way any unclaimed path
    does rather than 403-ing from an `if` someone could invert."""
    paths = production_client.app.openapi()["paths"]
    assert "/api/v1/dev/act-as/{person_id}" not in paths
    assert "/api/v1/dev/personas" not in paths


def test_a_role_held_in_many_scopes_is_listed_once(
    client, app_session, persona_ids, demo_studio_id
):
    """Ship-audit D4. A lead coach holds one group-scoped assignment per group, so after a
    long E2E run the switcher listed `lead_coach` nineteen times. The roles are a
    projection of WHAT the persona is, not of how many places they are it."""
    from app.models.person import RoleAssignment

    with with_all_tenants(reason=_SCOPE):
        app_session.add(
            RoleAssignment(
                studio_id=demo_studio_id,
                person_id=persona_ids["lead"],
                role="lead_coach",
                scope_type="group",
                scope_id=uuid.uuid4(),
                granted_at=datetime(2026, 1, 1, tzinfo=UTC),
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )
        )
        app_session.commit()

    body = client.get("/api/v1/dev/personas").json()
    lead = next(p for p in body["items"] if p["key"] == "lead")
    assert lead["roles"] == ["lead_coach"]
