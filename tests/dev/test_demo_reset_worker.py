"""The worker's refusals. §19.7 names staging and no other environment."""

from __future__ import annotations

import app.workers.demo_reset as worker
from app.services.demo import DEMO_STUDIO_NAME
from app.services.demo.service import DemoStudioService
from sqlalchemy import text
from sqlalchemy.orm import Session


def test_it_refuses_to_run_in_production(monkeypatch):
    """In production the demo studio is a smoke-test target you may have deliberately
    left mid-flow. An overnight job that wipes it destroys the evidence you left."""
    monkeypatch.setattr(worker.settings, "ENV", "production", raising=False)
    assert worker.main() == 1


def test_it_refuses_to_run_in_development(monkeypatch):
    """In development it is your own scratch data."""
    monkeypatch.setattr(worker.settings, "ENV", "development", raising=False)
    assert worker.main() == 1


def test_it_runs_in_staging(monkeypatch, migrated):
    monkeypatch.setattr(worker.settings, "ENV", "staging", raising=False)
    assert worker.main() == 0


def test_it_persists_the_reset(monkeypatch, migrated):
    """The worker must commit -- DemoStudioService.reset() itself does not (task 6's own
    tests commit explicitly, and app/routers/dev.py's route commits itself for the same
    reason). worker.main() returning 0 only proves the reset ran in-process; only a read
    through a second, independent session proves it actually landed. This is the same
    pattern as tests/dev/test_dev_router.py::test_reset_persists_the_wipe_and_reseed."""
    monkeypatch.setattr(worker.settings, "ENV", "staging", raising=False)

    with Session(migrated) as probe:
        studio_id = DemoStudioService.studio_id(probe)
        probe.execute(text("UPDATE studio SET name = 'wrecked' WHERE id = :id"), {"id": studio_id})
        probe.commit()

    assert worker.main() == 0

    with Session(migrated) as probe:
        name = probe.execute(
            text("SELECT name FROM studio WHERE id = :id"), {"id": studio_id}
        ).scalar_one()
    assert name == DEMO_STUDIO_NAME
