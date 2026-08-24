---
name: feature
description: Build a feature end to end from SPEC.md — plan, implement, test, self-review
argument-hint: <feature name or SPEC.md section>
---
Build the feature: $ARGUMENTS

1. Read the relevant section of @SPEC.md. If it is ambiguous, ask before coding.
2. List the files you will create or change, and what is explicitly out of scope.
3. Write failing tests first, covering the acceptance criteria and the edge cases
   named in the spec.
4. Implement until the tests pass. Run `pytest -q` and the relevant vitest file.
5. Run lint and typecheck.
6. Use a subagent to review your diff against the spec section. Report gaps only —
   correctness and stated requirements, not style preferences.
7. Fix real gaps, then summarize what you built, what you skipped, and why.

Show evidence: the commands you ran and their output. Do not claim success without it.
