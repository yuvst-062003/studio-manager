"""Models authored, reviewed, and **not yet migrated.**

`app/models/__init__.py` imports every module beside it whose name does not begin with an
underscore, so nothing in this package reaches `Base.metadata` and nothing here has a
table. That is the whole mechanism, and it exists because two gates derive from the
metadata rather than from a list:

* `tests/core/test_alembic_baseline.py::test_the_migrations_match_the_models` runs
  `alembic check`. A model with no migration behind it is drift, and drift is exactly what
  that gate exists to catch — a lane adds a model, `main` authors the revision in the
  contract commit, and the two disagree.
* `DemoStudioService.wipe_plan` walks `Base.metadata.sorted_tables` for every table
  carrying `studio_id`. A table in the metadata but not in the database makes the reset
  fail on a relation that does not exist.

`main` owns `alembic/versions/**` and authors **one revision per wave, in that wave's
contract commit** — so these nine files could not be migrated by the branch that wrote
them, and migrating them all on `main` today would commit W3–W5's schemas before those
waves have checked them against the club. W2 is the argument for that caution rather than
against it: C11 and C12 arrived from the club's real structure and changed `enrollment`,
`price_plan` and `charge` on the day the contract was written.

**Each wave's contract commit moves its own files up one directory** and autogenerates its
revision:

    W3  _pending/attendance.py  _pending/health.py   -> 0007   DONE 2026-08-26
    W4  _pending/billing.py  _pending/events.py  _pending/belts.py  -> 0008
    W5  _pending/comms.py  _pending/reports.py  -> 0009

`docs/plan/migrations/` carries a draft per wave saying what each revision must contain and
what autogenerate gets wrong.

W3 is the wave that showed what "move it up" actually means, and it was not a move both
times. `_pending/attendance.py` became `app/models/attendance.py` whole; `_pending/health.py`
was **appended** into the `app/models/health.py` M1 had already created, because
`health_form_template` shipped in revision `0005` as conflict C3's resolution. Moving that
file over the existing one would have deleted the template and broken M3's trial-booking
flow. W4 and W5 have no such split -- every file below is a clean promotion -- but the rule
to check first stands.

Nothing outside this package may import from it. Two service seams did —
`app/services/{billing,comms}/__init__.py` — and they now name the pending path explicitly,
so the day their wave moves the file is the day the import stops lying.
"""
