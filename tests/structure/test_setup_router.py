"""M1.9 -- SPEC §5.1's resumable setup wizard, server side.

§5.1 states two different things, and the design doc §3.4 keeps them apart on purpose:

  "a progress checklist stays on the dashboard until it is complete"
  "each step can be skipped and returned to; progress is persisted so the wizard
   survives a closed app"

*complete* is all six steps `done` and governs the dashboard checklist. `dismissed_at` is
the owner choosing an exit at step 6 and governs auto-routing. Collapsing them breaks one
sentence or the other: if skipping counted as complete the checklist would vanish over a
studio with no classes, and if the wizard reopened until everything was `done` an owner who
skipped a step would be trapped in it forever. Both directions are asserted below.

Progress lives in `studio.settings`, so none of this needs a migration -- and
`alembic/versions/**` is owned by main, which a lane never touches.
"""

from __future__ import annotations

import uuid

from app.models.audit import AuditLog
from app.models.studio import Studio
from app.services.structure.setup import SETTABLE_STATUSES, WIZARD_STEPS
from sqlalchemy import select

SETUP = "/api/v1/setup"


def get_setup(client, caller):
    return client.get(SETUP, headers=caller.headers)


def patch_step(client, caller, step_id: str, status: str):
    return client.patch(f"{SETUP}/steps/{step_id}", json={"status": status}, headers=caller.headers)


# -- the shape ----------------------------------------------------------------
def test_a_fresh_studio_has_six_pending_steps(client, as_owner) -> None:
    body = get_setup(client, as_owner).json()
    assert [s["id"] for s in body["steps"]] == list(WIZARD_STEPS)
    assert {s["status"] for s in body["steps"]} == {"pending"}
    assert body["complete"] is False
    assert body["dismissed_at"] is None


def test_the_six_steps_are_the_canvas_order(client, as_owner) -> None:
    """The canvas fixes six steps, progress running right-to-left. M1 owns 1, 3, 5 and 6;
    M7 fills belts at 2 and M6 fills prices at 4."""
    steps = get_setup(client, as_owner).json()["steps"]
    assert [s["order"] for s in steps] == [1, 2, 3, 4, 5, 6]
    assert [s["id"] for s in steps] == [
        "studio",
        "belts",
        "groups",
        "prices",
        "staff",
        "students",
    ]


# -- transitions --------------------------------------------------------------
def test_marking_a_step_done_persists_and_is_read_back(client, as_owner) -> None:
    assert patch_step(client, as_owner, "studio", "done").status_code == 200
    steps = {s["id"]: s for s in get_setup(client, as_owner).json()["steps"]}
    assert steps["studio"]["status"] == "done"
    assert steps["studio"]["at"] is not None


def test_a_step_can_be_skipped_and_returned_to(client, as_owner) -> None:
    """§5.1 in as many words. A skip that could not be undone would make the checklist a
    trap rather than a reminder."""
    patch_step(client, as_owner, "groups", "skipped")
    assert _status(client, as_owner, "groups") == "skipped"
    patch_step(client, as_owner, "groups", "done")
    assert _status(client, as_owner, "groups") == "done"


def _status(client, caller, step_id: str) -> str:
    steps = {s["id"]: s for s in get_setup(client, caller).json()["steps"]}
    return steps[step_id]["status"]


def test_progress_survives_a_closed_app_because_it_is_a_row_not_a_session(
    client, as_owner, app_session
) -> None:
    patch_step(client, as_owner, "studio", "done")
    app_session.expire_all()
    settings_blob = app_session.execute(
        select(Studio.settings).where(Studio.id == as_owner.studio_id)
    ).scalar_one()
    assert settings_blob["setup_progress"]["steps"]["studio"]["status"] == "done"
    assert settings_blob["setup_progress"]["version"] == 1


def test_writing_progress_does_not_clobber_the_rest_of_settings(
    client, as_owner, app_session
) -> None:
    """`settings` is shared JSONB. A whole-column overwrite would silently drop
    cash_instructions, billing_day and retention_months."""
    studio = app_session.get(Studio, as_owner.studio_id)
    studio.settings = {**(studio.settings or {}), "billing_day": 10}
    app_session.commit()

    patch_step(client, as_owner, "studio", "done")
    app_session.expire_all()
    settings_blob = app_session.execute(
        select(Studio.settings).where(Studio.id == as_owner.studio_id)
    ).scalar_one()
    assert settings_blob["billing_day"] == 10
    assert "setup_progress" in settings_blob


# -- the split that SPEC §5.1 forces ------------------------------------------
def test_complete_needs_every_one_of_the_six_done(client, as_owner) -> None:
    for step in WIZARD_STEPS[:-1]:
        patch_step(client, as_owner, step, "done")
    assert get_setup(client, as_owner).json()["complete"] is False
    patch_step(client, as_owner, WIZARD_STEPS[-1], "done")
    assert get_setup(client, as_owner).json()["complete"] is True


def test_skipping_is_not_completing(client, as_owner) -> None:
    """Otherwise the dashboard checklist vanishes over a studio with no classes."""
    for step in WIZARD_STEPS:
        patch_step(client, as_owner, step, "skipped")
    assert get_setup(client, as_owner).json()["complete"] is False


def test_dismiss_stops_auto_routing_without_claiming_completeness(client, as_owner) -> None:
    """Otherwise an owner who skipped a step is trapped in the wizard forever."""
    body = client.post(f"{SETUP}/dismiss", headers=as_owner.headers).json()
    assert body["dismissed_at"] is not None
    assert body["complete"] is False
    assert {s["status"] for s in body["steps"]} == {"pending"}


def test_dismiss_is_idempotent_and_keeps_the_first_timestamp(client, as_owner) -> None:
    first = client.post(f"{SETUP}/dismiss", headers=as_owner.headers).json()["dismissed_at"]
    second = client.post(f"{SETUP}/dismiss", headers=as_owner.headers).json()["dismissed_at"]
    assert first == second


def test_completing_every_step_does_not_dismiss_on_its_own(client, as_owner) -> None:
    """The other half of the same split: the container never infers an exit the owner did
    not take."""
    for step in WIZARD_STEPS:
        patch_step(client, as_owner, step, "done")
    body = get_setup(client, as_owner).json()
    assert body["complete"] is True
    assert body["dismissed_at"] is None


# -- refusals -----------------------------------------------------------------
def test_an_unknown_step_id_is_404(client, as_owner) -> None:
    assert patch_step(client, as_owner, "belts-and-braces", "done").status_code == 404


def test_a_ticked_step_can_be_reopened(client, as_owner) -> None:
    """F6 reversed the original refusal, on the rollover wizard's precedent: a one-way
    ratchet would send an owner back through the whole wizard to correct one press."""
    assert patch_step(client, as_owner, "studio", "done").status_code == 200
    reopened = patch_step(client, as_owner, "studio", "pending")
    assert reopened.status_code == 200
    body = get_setup(client, as_owner).json()
    step = next(s for s in body["steps"] if s["id"] == "studio")
    assert step["status"] == "pending"
    assert body["complete"] is False


# -- §3.2 ---------------------------------------------------------------------
def test_a_manager_may_drive_the_wizard(client, as_manager) -> None:
    assert get_setup(client, as_manager).status_code == 200
    assert patch_step(client, as_manager, "studio", "done").status_code == 200


def test_a_coach_may_not_read_or_write_setup(client, as_lead_coach) -> None:
    assert get_setup(client, as_lead_coach).status_code == 403
    assert patch_step(client, as_lead_coach, "studio", "done").status_code == 403
    assert client.post(f"{SETUP}/dismiss", headers=as_lead_coach.headers).status_code == 403


def test_an_anonymous_caller_is_401(client) -> None:
    assert client.get(SETUP).status_code == 401
    assert client.post(f"{SETUP}/dismiss").status_code == 401


# -- tenancy ------------------------------------------------------------------
def test_one_studio_cannot_see_anothers_progress(
    client, as_owner, app_session, fake_provider
) -> None:
    from tests.structure.conftest import _make_caller

    for step in WIZARD_STEPS:
        patch_step(client, as_owner, step, "done")

    other = Studio(name="מועדון שלישי", slug=f"o3-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.commit()
    stranger = _make_caller(client, fake_provider, app_session, other, role="owner")

    body = get_setup(client, stranger).json()
    assert body["complete"] is False
    assert {s["status"] for s in body["steps"]} == {"pending"}


# -- §11.2 --------------------------------------------------------------------
def test_every_transition_is_audited(client, as_owner, app_session) -> None:
    patch_step(client, as_owner, "studio", "done")
    client.post(f"{SETUP}/dismiss", headers=as_owner.headers)
    actions = (
        app_session.execute(select(AuditLog.action).where(AuditLog.studio_id == as_owner.studio_id))
        .scalars()
        .all()
    )
    assert "setup.step.updated" in actions
    assert "setup.dismissed" in actions


def test_the_schema_and_the_service_agree_on_what_is_settable() -> None:
    """The Literal is spelled out rather than built from SETTABLE_STATUSES, so this is
    what keeps the two from drifting."""
    from typing import get_args

    from app.schemas.setup import SetupStepIn

    assert set(get_args(SetupStepIn.model_fields["status"].annotation)) == set(SETTABLE_STATUSES)
