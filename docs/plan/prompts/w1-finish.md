# Finishing W1 · M1 — everything still owed before the wave can close

Companion to [milestone-plan.md](../milestone-plan.md) W1 · M1 and to
[the M1 session prompt](m1.md). That prompt opened the wave; this one closes it.

---

## Where the wave actually stands (2026-08-25)

Seven pieces are shipped and `docs/plan/state.yaml` records them. All three lane checks are
green, `./scripts/ci-local.sh` exits 0, and the suite is 744 backend / 655 frontend.

**W1 is still `active` anyway**, because the milestone plan's own *Delivers* list has four
entries with no code behind them and one holdback M1 was supposed to close.

| Still owed | Where the plan says so |
|---|---|
| Studio setup wizard container + steps 1, 3, 5, 6 | W1 *Delivers*, artboards `5c` `5f` |
| The object-storage seam the logo needs | six `object_key` fields, no storage layer |
| Dashboard app shell + `3d` צוות + `3f` הגדרות | W1 *Artboards* — the app is still `HelloProof` |
| Parent home `1a` | W1 *Artboards* — `Resolve.tsx` renders an empty `parent-home` |
| `studio_app` login password from a Railway secret | **HB-staging-superuser**, m1.md task 5 |

Two things the gate needs that a keyboard cannot produce: **HB-devices** (the real-device
OAuth round trip in standalone mode) and, separately, **HB-domain**, which m1.md already
escalated and which is still `base_domain: null`.

---

## Read first

The design for the first two items is already written and approved:
[docs/superpowers/specs/2026-08-25-object-storage-and-setup-wizard-design.md](../../superpowers/specs/2026-08-25-object-storage-and-setup-wizard-design.md).
It settles the decisions that would otherwise be re-litigated — storage backend, why no
presigned uploads, why progress lives in `settings` and not a column, and why steps 3 and 6
get no sub-slots.

---

## The prompt

```
Read @docs/superpowers/specs/2026-08-25-object-storage-and-setup-wizard-design.md
in full — it is approved and its decisions are settled, not open.
Read @docs/plan/milestone-plan.md — W1 · M1 (Delivers, Artboards, Verification).
Read @docs/plan/prompts/w1-finish.md. Read @CLAUDE.md.
Read @SPEC.md §3.2, §4.3, §5.1, §6.1, §6.4, §11.

This is the rest of W1 · M1. Sequential on feat/w1-m1-identity — the branch
already carries 27 commits and main has none of them. Do NOT open a worktree.

Work these in order; each unblocks the next.

  M1.8 — the object-storage seam. app/core/storage.py, the filesystem backend,
         and the three scoped studio-logo routes. Follow §2 of the design
         exactly: magic-byte sniffing rather than the declared Content-Type,
         PNG/JPEG/WebP and never SVG, a 2 MB ceiling, server-constructed keys,
         and NO generic /files/{key} route. There is no image library on the
         backend — the browser resizes.

  M1.9 — the setup wizard. web/packages/ui/src/setup-wizard/: the container
         reading useSlot('setup-wizard'), and M1's four steps registered at
         orders 1, 3, 5 and 6. Do not add a SlotId — the union is closed and
         Resolve.tsx already refused to extend it. Progress goes in
         studio.settings per §3.4, including the dismissed_at / complete split;
         getting that split wrong breaks one of SPEC §5.1's two sentences.
         Both apps mount it, so it needs a real narrow layout — it is drawn at
         1440×900 and an owner doing setup on a phone is a normal case.
         Write the header note on the groups and students step files naming
         which W2 lane owns each extension.

         Then change Resolve.decideOutcome from "does this studio have classes"
         to dismissed_at. The current rule throws an owner who skipped step 3
         back into the wizard on every launch, forever — write the failing test
         for that first.

  M1.10 — the dashboard app. It is still M0's HelloProof. Give it the AppShell
         the staff app already uses, then artboards 3d (צוות — weekly load,
         permissions, classes with no coach) and 3f (הגדרות — every toggle
         carries a state label; that labelling is the point of the artboard).

  M1.11 — parent home 1a. Resolve.tsx renders <section data-testid="parent-home" />
         and nothing else. 1a is the BASE home, 390×844, light and dark — the
         day strip and past attendance are 2a and belong to M5. Do not build
         those.

  M1.12 — HB-staging-superuser. Give studio_app a login password from a Railway
         secret and point the staging api DSN at it. Until this lands the
         append-only audit grant is not in force on staging, so §11.2 is a claim
         there rather than a guarantee. Close the holdback in state.yaml only
         once you have proven it against staging, not once the code is written.

Per CLAUDE.md §Workflow: tick each piece in docs/plan/state.yaml in the SAME
commit as the work. Never write anything measurable there.

Plan first with superpowers:writing-plans, then work the plan task by task:
failing test, confirm it fails, minimal implementation, green, commit.

Exit gate: ./scripts/lane-check.sh identity && ./scripts/lane-check.sh structure
green, ./scripts/ci-local.sh exit 0, and both apps sign in, refuse correctly per
§6.1's two refusal screens, and route into a wizard that now exists and resumes.

Do NOT mark W1 done. Two of its gate items are external: HB-devices (the OAuth
round trip verified on a real iPhone in standalone mode) and HB-domain. Say
plainly in the log which parts of the gate you proved and which you could not.
```

---

## Three things that will bite otherwise

- **The generated client is a CI gate.** Any new endpoint means
  `.venv/bin/python scripts/export_openapi.py` and the `openapi-typescript` regeneration,
  committed. `./scripts/lane-check.sh` does **not** check this; `ci-local.sh` does, and it
  fails the build. M1.8 and M1.9 both add endpoints.

- **`tests/dev/` can poison the shared database.** Three tests commit
  `UPDATE studio SET name = 'wrecked'` and rely on a later reset to undo it, with no
  fixture cleanup. A run interrupted between those two commits leaves the dev DB wrecked,
  and the failure then surfaces somewhere else entirely — `tests/core/test_alembic_baseline.py`
  reporting a demo-studio name mismatch. A completed run self-heals. If you see `'wrecked'`,
  that is what it is, and it is not your change.

- **No migration is needed.** This whole design stays out of `alembic/versions/**`, which
  `main` owns and which `block-protected.sh` enforces. If you find yourself reaching for
  `alembic revision`, re-read §3.4 of the design — the answer is `settings`.
