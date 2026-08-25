"""SPEC §5.1's resumable setup wizard, and the two notions it forces apart.

§5.1 says two different things:

    "a progress checklist stays on the dashboard until it is complete"
    "each step can be skipped and returned to; progress is persisted so the wizard
     survives a closed app"

So there are two states, not one:

  *complete*      -- every one of the six steps is `done`. The dashboard checklist
                     disappears.
  `dismissed_at`  -- the owner reached step 6 and chose an exit. Auto-routing stops.

Collapsing them breaks one sentence or the other. If skipping counted as complete, the
checklist would vanish over a studio that has no classes. If the wizard reopened until
everything was `done`, an owner who deliberately skipped a step would be trapped in it on
every launch, forever -- which is the defect §3.7 of the design doc closes.

**Progress lives in `studio.settings` and not in a column.** §4.3 pins the studio column
list exactly as M0 built it, and a `setup_progress` column would need an Alembic revision
-- but `alembic/versions/**` is owned by main and a lane never runs `alembic revision`.
The JSONB column exists for precisely this.

**The container never computes completeness.** Each step reports its own outcome. That is
what makes the seam hold: the container cannot know when *belts* is finished without M7
reopening it, and M7 must not have to.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, attributes

from app.core.clock import now
from app.models.studio import Studio
from app.services.audit import AuditService

#: The canvas fixes six steps, progress running right-to-left. M1 owns 1, 3, 5 and 6; M7
#: fills `belts` and M6 fills `prices`. All six are listed here because *complete* means
#: all six are done -- a five-step list would report a studio complete before its belt
#: system existed.
WIZARD_STEPS: tuple[str, ...] = ("studio", "belts", "groups", "prices", "staff", "students")

#: `pending` is the absence of a report, never something a caller sets. A step reports its
#: own outcome, and "un-report it" is not one of the two outcomes §5.1 describes.
SETTABLE_STATUSES: tuple[str, ...] = ("done", "skipped")

StepStatus = Literal["pending", "done", "skipped"]

_PROGRESS_KEY = "setup_progress"
_VERSION = 1


class UnknownStepError(Exception):
    """A step id outside WIZARD_STEPS."""


def _studio(session: Session, studio_id: uuid.UUID) -> Studio:
    return session.execute(select(Studio).where(Studio.id == studio_id)).scalar_one()


def _blank() -> dict[str, Any]:
    return {"version": _VERSION, "steps": {}, "dismissed_at": None}


def _progress(studio: Studio) -> dict[str, Any]:
    stored = (studio.settings or {}).get(_PROGRESS_KEY)
    if not isinstance(stored, dict):
        return _blank()
    # Merged onto a blank rather than trusted wholesale: a row written by an older
    # version is missing keys this one reads, and a KeyError at read time would make a
    # studio unenterable rather than merely out of date.
    return {**_blank(), **stored, "steps": dict(stored.get("steps") or {})}


def _save(studio: Studio, progress: dict[str, Any]) -> None:
    """Merge into `settings`, never replace it.

    `settings` is shared JSONB -- standing_order_link, cash_instructions, billing_day and
    retention_months all live there. A whole-column assignment would drop them silently,
    and the loss would surface in a billing run rather than here.

    `flag_modified` is required: SQLAlchemy does not track mutation *inside* a JSONB dict,
    so rebinding the attribute is what marks the row dirty.
    """
    studio.settings = {**(studio.settings or {}), _PROGRESS_KEY: progress}
    attributes.flag_modified(studio, "settings")


def read(session: Session, *, studio_id: uuid.UUID) -> dict[str, Any]:
    """The payload all three routes return, so a caller never has to re-fetch."""
    progress = _progress(_studio(session, studio_id))
    steps = progress["steps"]
    rendered = [
        {
            "id": step_id,
            "order": index + 1,
            "status": (steps.get(step_id) or {}).get("status", "pending"),
            "at": (steps.get(step_id) or {}).get("at"),
        }
        for index, step_id in enumerate(WIZARD_STEPS)
    ]
    return {
        "steps": rendered,
        # Every one of the six, `done`. Not "not pending" -- that would let six skips
        # report a finished studio.
        "complete": all(step["status"] == "done" for step in rendered),
        "dismissed_at": progress["dismissed_at"],
    }


def set_step(
    session: Session,
    *,
    studio_id: uuid.UUID,
    step_id: str,
    status: str,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if step_id not in WIZARD_STEPS:
        raise UnknownStepError(step_id)

    studio = _studio(session, studio_id)
    progress = _progress(studio)
    at = now().isoformat()
    previous = (progress["steps"].get(step_id) or {}).get("status", "pending")
    progress["steps"][step_id] = {"status": status, "at": at}
    _save(studio, progress)

    AuditService.record(
        session,
        action="setup.step.updated",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        diff={"step": step_id, "from": previous, "to": status},
    )
    return read(session, studio_id=studio_id)


def dismiss(
    session: Session,
    *,
    studio_id: uuid.UUID,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Stop auto-routing. Says nothing about completeness.

    Idempotent, and the *first* timestamp wins: the question this answers is "when did the
    owner decide they were done being routed", and a second click does not move that.
    """
    studio = _studio(session, studio_id)
    progress = _progress(studio)
    if progress["dismissed_at"] is None:
        progress["dismissed_at"] = now().isoformat()
        _save(studio, progress)
        AuditService.record(
            session,
            action="setup.dismissed",
            entity_type="studio",
            entity_id=studio_id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            diff={"dismissed_at": progress["dismissed_at"]},
        )
    return read(session, studio_id=studio_id)
