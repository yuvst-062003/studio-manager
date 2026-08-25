# Migration drafts — W2 to W5

These four files are **drafts, not revisions.** Nothing here is loaded by Alembic, collected
by pytest, or checked by ruff or mypy: `pyproject.toml` scopes all three to `app`, `scripts`,
`tests` and `tools`, and Alembic only reads `alembic/versions/`.

## Why they exist

Seam 1 of the parallel plan: **`main` owns `alembic/versions/**` outright, one revision per
wave, authored in the wave's contract commit before the worktrees are created.** A lane never
runs `alembic revision`. That rule is enforced deterministically —
`.claude/hooks/block-protected.sh` refuses any write to that directory with exit code 2 — and
the branch these drafts were written on is a contract-author branch, so it could not create
the revisions even though it landed every model they will carry.

That leaves ~30 tables in `Base.metadata` with no migration behind them, which is why
`test_the_migrations_match_the_models` is red on that branch by construction and why Task 20's
gate is scoped rather than a full-suite run. These drafts are the handover: what each wave's
revision has to contain, and specifically **what autogenerate will get wrong or cannot see.**

## Turning one into a revision, on `main`

```bash
.venv/bin/alembic revision --autogenerate -m "<the wave>"
# then read the draft beside the generated file and reconcile
.venv/bin/alembic upgrade head          # on a FRESH database
.venv/bin/alembic upgrade head          # and on the PREVIOUS wave's database
.venv/bin/pytest tests/core/test_alembic_baseline.py -q
```

Both upgrades matter and they fail differently. A fresh database catches a `CREATE TABLE`
ordering problem; an existing one catches a column added without a server default on a table
that already has rows.

## The chain

| Draft | Revision | Revises | Wave | Verticals |
|---|---|---|---|---|
| `w2-draft.py` | `0006` | `0005` | W2 | schedule · people |
| `w3-draft.py` | `0007` | `0006` | W3 | attendance · health |
| `w4-draft.py` | `0008` | `0007` | W4 | billing · events · belts |
| `w5-draft.py` | `0009` | `0008` | W5 | comms · reports |

`0005` is M1's head. The chain is linear on purpose — SPEC §8.3 and the milestone plan both
put one revision per wave, and a branched history would make "upgrade a staging database that
is two waves behind" a merge rather than a replay.

## What applies to all four

- **Grants are inherited, not written.** Revision `0001` set
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO studio_app`,
  so every table a later revision creates picks the runtime grant up automatically. Do **not**
  add per-table `GRANT` statements; `tests/identity/test_migration.py` asserts the inheritance
  actually happened rather than trusting it.
- **`0002`'s `REVOKE` on `audit_log` must survive.** A revision that touches that table must
  not quietly re-grant what `0002` took away — the append-only property is a grant, not a
  trigger, and it is the one thing in the schema that cannot be restored after the fact.
- **`EncryptedJSON` / `EncryptedBytes` columns must be written with those types**, not with
  the `JSONB` / `LargeBinary` they wrap. Substituting the underlying type produces a schema
  that works and an `alembic check` that is permanently dirty.
- **Partial indexes carry `postgresql_where`.** Autogenerate does emit it, but it is the first
  thing lost when a generated file is hand-tidied, and every one of them here is load-bearing:
  a partial unique index that loses its predicate becomes a total unique constraint and starts
  rejecting legitimate rows.
