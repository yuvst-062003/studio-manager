# Foundations — W2–W5 contracts · resuming at Task 13

Ready-to-paste opening prompt for the session that continues
`docs/superpowers/plans/2026-08-25-foundations-w2-w5-contracts.md`.

Written 2026-08-25 by the session that resumed the plan at an uncommitted Task 11 and
carried it through Task 12. It reflects what actually landed, including four things the
plan did not anticipate.

---

## Where this work stands

**Branch `feat/foundations-contracts`, in the worktree at `../studio-manager-foundations`.**
Not `main`, and not the `studio-manager` tree — that one holds the concurrent W1 · M1
session's uncommitted work in `web/apps/**`.

**Tasks 1–12 are done.** The plan's checkboxes now match the commits, and its
§ Session log carries the deviations in full. Tasks 13–20 remain:

| Task | What |
|---|---|
| 13 | W4 i18n — `billing` + `events`, belts under `events.belt.*` |
| 14 | uPay IPN parsing + the four §5.10 security verdicts |
| 15 | W5 contract — comms + reports models, schemas, `NotificationService` seam |
| 16 | W5 i18n — `comms` + `reports`, privacy under `reports.privacy.*` |
| 17 | `e2e/` — SPEC §13's five flows, ahead of their implementations |
| 18 | `docs/design/specs/` — component specs for the M2–M9 artboards (**the big one**) |
| 19 | Migration drafts for W2–W5 — plain files, **not** Alembic revisions |
| 20 | Verification, against the rescoped gate |

## The four things the plan did not anticipate

**1. The full suite cannot go green here, and that is by design.** This branch adds ~30
tables to `Base.metadata` and is structurally forbidden from creating the Alembic revision
that would put them in a database: `main` owns `alembic/versions/**` and
`.claude/hooks/block-protected.sh` refuses the edit. Task 19 writes drafts precisely
because of that. So `pytest -q` is **38 red**, and Task 20 was rewritten to the scoped
suites this branch actually owns. Approved by the repo owner on 2026-08-25.

**Do not "fix" the red by creating revisions, and do not weaken a test to make it pass.**

**2. Five of those 38 pre-date this branch entirely** and are **not** the migration gap.
At the fork point `fad71db` — the W1 session's tip, before any contract work — the suite
already had them:

- `tests/identity/test_auth_context.py`, four failures. Pure middleware and JWT, no
  database involved.
- `tests/core/test_alembic_baseline.py::test_the_demo_studio_row_exists_after_migration`

They belong to whoever owns M1. They are outside this plan's ownership boundary and are
**not** yours to fix — but do not let them hide a real failure either. The expected
residue is enumerated in Task 20.

**3. Three M0-era gates had to be amended, each with the owner's explicit approval.** The
rule that produced all three: *a gate whose premise the contract-commit architecture
invalidated gets its trigger corrected, never its teeth pulled.* Every amendment is paired
with tests proving the gate still fires on what it was written to catch.

- Invariant 1's money-naming rule now knows `*_id` is a reference, and exempts
  `upay_ipn_record.amount` by qualified name.
- Two `tests/structure` "not yet" markers were retired; both named their own expiry in
  their docstrings, and this plan is what crossed it.
- Invariant 5 fired on `BillingService` being *importable*. §2.2 lands every seam a
  milestone before the lane that fills it, so it fired on a stub. It now parses the body.

**If a fourth one blocks you: stop and ask.** That is the plan's own C3 instruction and it
has been right three times.

**4. Task 2's `tests/contracts/test_w2_schemas.py` was never written** and has now landed,
as a G16 detector over every schema module rather than four assertions over W2's. M1's six
hand-rolled list envelopes are grandfathered **by name**, so a seventh anywhere fails the
build. If you add a vertical, add its `XPage = CursorPage[XOut]` alias or the gate will
tell you.

## Practical notes that cost this session time

- **Run vitest from `web/`, not the repo root.** `npx vitest run --root web` from above
  makes six files fail on ENOENT — they resolve fixture paths from `cwd`. From `web/` it
  is 674 passing.
- `.venv` is a **symlink** to `../studio-manager/.venv`. The `.venv/bin/` prefix is
  mandatory; a bare `pytest` finds an old 3.8 interpreter.
- `./scripts/dev-db.sh up` must be running. Database tests **fail** rather than skip.
- **Task 14 has a head start.** `app/integrations/upay/ipn.py` already ships
  `build_ipn_query(shape=...)`, `ipn_amount()`, `agorot_from_ipn_amount()` and the four
  `IpnShape` values. Build `callback.py`'s parser against those same bytes — that is what
  makes the simulator and the parser provably agree. **There is no HMAC**; the plan's
  Task 14 preamble says why, twice marked [VERIFIED].
- **There is no `belts` namespace and no `privacy` namespace.** `web/packages/i18n/types.ts`
  lists exactly nine and `index.ts` is authored once. Belt strings go in `events.ts` under
  `belt.*`; privacy strings in `reports.ts` under `privacy.*`.
- Task 18 is roughly sixty artboard specs and is much the largest task. Consider it its own
  session.

---

## The prompt

```
Read @docs/superpowers/plans/2026-08-25-foundations-w2-w5-contracts.md in full,
including its § Session log — that records what deviated from the plan and why.
Read @docs/plan/prompts/foundations-w2-w5.md in full: it carries four things the
plan did not anticipate, and the third one will bite you if you skip it.
Read @docs/plan/milestone-plan.md — Global Constraints, Part 1 §1.3 (the four
seams), and the W4–W5 contract tables. Read @CLAUDE.md.

You are in the worktree ../studio-manager-foundations, on branch
feat/foundations-contracts. Stay there. A concurrent session owns W1 · M1 in the
studio-manager tree and has uncommitted work in web/apps/**.

This session is the CONTRACT AUTHOR, never a lane. Honour the plan's § Session
ownership boundary exactly: new files, in directories with one owner. Never touch
web/apps/**, alembic/versions/**, web/packages/i18n/index.ts,
web/packages/ui/src/slots.ts, app/main.py, app/models/__init__.py, or
docs/plan/state.yaml.

Tasks 1-12 are done and committed. RESUME AT TASK 13 and work forward. Use
superpowers:executing-plans and follow each task's steps exactly: failing test,
confirm it fails, minimal implementation, green, commit. Tick the task's
checkboxes in the same commit as its work.

Two standing rules, both learned the expensive way here:

  * The full suite is 38 red and CANNOT go green on this branch — no Alembic
    revision can be created here, so every test that reflects metadata against a
    live database fails by construction. Task 20 was rewritten to the scoped
    gate for exactly this reason. Do NOT create revisions to fix it, and do NOT
    weaken a test to make it pass. Five of the 38 pre-date this branch and belong
    to the W1 session; the expected residue is enumerated in Task 20.

  * If a shared gate under tests/invariants/, tests/restrictions/ or
    tests/structure/ blocks you, STOP AND ASK rather than editing it. Three have
    already been amended with the owner's approval, each by correcting a trigger
    the contract-commit architecture invalidated — never by removing teeth. A
    fourth is a decision, not a task step.

Run tests as: .venv/bin/pytest <paths> -q   and   cd web && npx vitest run
(vitest from web/, NOT from the repo root — it resolves fixture paths from cwd).

Task 18 is ~60 artboard specs and is far larger than the rest. If the session is
getting long, finish 13-17 and 19, then start 18 fresh rather than rushing it.
```

---

## Verification, before you call anything done

```
.venv/bin/pytest tests/contracts tests/invariants tests/restrictions tests/structure tests/upay -q
cd web && npx vitest run --reporter=dot
npm --prefix web run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests && npm --prefix web run lint
for ns in schedule people health attendance billing events comms reports; do node web/scripts/i18n-parity.mjs $ns; done
```

At the last commit of Task 12 that was **365 passed, 3 skipped, 0 failed**, mypy clean over
72 files, ruff clean, 674 frontend tests passing, and parity green on the four landed
namespaces.
