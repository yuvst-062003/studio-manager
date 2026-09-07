/goal Ship the onboarding doors-and-wizard rebuild specified in
docs/superpowers/specs/2026-09-03-onboarding-doors-and-wizard.md. Start immediately — do
not report back before dispatching.

## DONE WHEN

Every piece in all five waves of §7 is committed, and for each:

- the failing test was written first, is in the commit, and now passes
- `./scripts/lane-check.sh people` and `./scripts/lane-check.sh health` are both green on
  that commit (plus `npm run typecheck` if it touched `web/packages/`)
- every decision number in §2 that the piece claims is verifiable by reading the code
- every F-number in §5 that the piece claims to close is closed at an identifiable line
- you have looked at the rendered screen in a real browser at 420×900 in RTL, and it
  matches the artboard in `docs/design/proposals/parent-onboarding-redesign.html`

…and `git status --short` shows none of your own work uncommitted.

Not done while any decision in §2 is unimplemented, any finding in §5 is open without a
written reason, or any gate is red.

## THE ROLE SPLIT — absolute

**You are the reviewer and the debugger. You are on Opus. You write no code, ever.**

You may: read files, grep, run tests and gates, run git, drive a browser, read logs, and
diagnose. You may not use Edit or Write on any source, test, config, migration or i18n
file. Not to fix a typo, not to unblock yourself, not because it is faster.

**Every line of code, every test, every string, every migration, every commit's content is
written by a Sonnet subagent** — `Agent` with `model: "sonnet"`. When something is broken,
you diagnose it precisely and hand a Sonnet subagent the diagnosis and the fix to write. A
reviewer who patches stops being a second pair of eyes, and that is the whole reason this
is split.

## WAVES

§7 is five waves. **Everything inside a wave runs in parallel; the waves are ordered.**

- **Wave A** — five independent pieces. Dispatch all five at once, now.
- **Wave B** — the spine, and the only strictly sequential part: `B1` shell, then `B2`
  write-at-the-end. Nothing else starts until both have landed.
- **Wave C** — three screens in parallel. Separable because each owns a different component
  and a different i18n namespace.
- **Wave D** — step 4's summary. Needs wave C's step 2.
- **Wave E** — the other doors: the landing page (`BookingFlow.tsx` retired), the manager's
  invitation, and add-a-child. Needs B, C and D.

**Parallel dispatch needs isolation.** Two subagents in one checkout will collide. Give each
parallel agent `isolation: "worktree"`, and point its `DATABASE_URL` at its **own** database
in the same container — a shared one makes two lanes' fixtures and migrations fight.

## HOW EACH PIECE RUNS

1. **PLAN** — write down: the decision numbers it must honour, the F-numbers it closes, the
   files it may touch, the gate it must pass.
2. **EXECUTE** — dispatch one Sonnet subagent with exactly that brief. Failing test first.
3. **EVALUATE** — read the diff yourself. Never accept a subagent's own claim that it is
   done. Check, in order:
   - **Against §2.** Confirm each claimed decision by reading the code. Half-implemented is
     not implemented.
   - **Against §5.** For each claimed F-number, point at the line that closes it. If you
     cannot, it is not closed.
   - **Against the design HTML.** The artboard, not just "the fields are present" —
     hierarchy, what is a card and what is a link, spacing, RTL.
   - **Render it and look.** Three of this spec's findings — the primary button sitting
     under the accessibility FAB, the login flash on back, and a health declaration that
     asks nothing — were invisible to every unit test and obvious in one screenshot.
   - **The seam, not the component.** A field added to an API is not proven by a test that
     hand-builds props. Assert `fetch → state → component`. F21 is exactly this failure: a
     checkbox that gated the button while the payload posted a constant.
   - **Staleness.** If the subagent edited after running the gate, that gate result is dead.
     Re-run it yourself.
   - **Scope.** Anything outside the piece's file list is reported, not fixed.
4. **DEBUG** — if it fails, or a gate is red, find the cause yourself: read the diff, read
   the surrounding code, run the narrowest diagnostic command that distinguishes the
   possibilities. Then dispatch a **fresh** Sonnet subagent with the cause named and the fix
   to write. Do not hand back "it's broken, try again".
5. **COMMIT** — when your review passes, have the subagent stage **by explicit path** and
   commit. One commit per piece. Then take the next.

## RESOLVING §8's OPEN ITEMS YOURSELF

The spec lists four unknowns. Resolve them in the loop; do not stall on them.

- **F15 — which of two causes breaks the payment frame on staging.** Both are real defects.
  Fix both: guard the demo sentinel the way `PaymentsSection.tsx:329` already does, and
  surface `merchant_account_unconfigured` as its own message instead of a generic error.
  No diagnosis needed to justify either. It is in wave A.
- **F9 — no proving test.** The proving test *is* the first step of `B2`. Write it, watch it
  fail, then fix.
- **Editing an already-created child after the final write.** Write a test that asserts what
  actually happens. If the edit is dropped, that is a bug the piece closes, not a question.
- **`SMTP_PASSWORD` on production.** Out of scope — it is configuration, not code. Decision
  21 already requires the UI to say when the email half is not configured; build that and
  move on.

## CONSTRAINTS

- Read `CLAUDE.md` first and obey all of it, especially the Verification section.
- Every Python command is `.venv/bin/…`. A bare `pytest`/`mypy` is a 3.8 interpreter and its
  green means nothing.
- No inlined strings. Hebrew lives in `web/packages/i18n/he/<namespace>.ts`, mirrored to
  `en/` and `ru/`. `web/packages/i18n/index.ts` is never edited by a lane.
- Scope every test run to what the diff can reach. Re-running the full suite is not extra
  safety, it is a slower way to learn the same thing.
- **Other sessions commit to this repo while you work.** Stage by explicit path, never
  `git add -A`. Before assuming a running dev server is yours, check
  `ps aux | grep -E "uvicorn|vite"` — one on port 8000 or 5174 probably is not.
- Do not deploy. `railway up` from the repo root goes to **production**.

Read the spec, then dispatch wave A.
