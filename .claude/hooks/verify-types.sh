#!/usr/bin/env bash
# Stop hook — the turn does not end with a broken typecheck.
#
# WHY THIS EXISTS. On 2026-08-30 a session reported "typecheck clean", then wrote a new test
# file, ran lint and vitest on it, and never re-ran tsc. `npm run typecheck` had been failing
# on main for three commits before anyone noticed. The claim was true when it was made and
# false by the time it was delivered, which is the failure mode a human cannot audit — you
# have to re-run the command to know, and nobody re-runs a command that already passed.
#
# So it is not the model's job to remember. It is this hook's.
#
# CHEAP WHEN THERE IS NOTHING TO CHECK. Most turns touch no source at all. This exits in
# milliseconds unless the working tree actually holds changed .ts/.tsx/.py files, so the
# ~20s of tsc + mypy is paid only by turns that could have broken something.
#
# It reports rather than forbids: exit 2 tells the model what is broken and lets it fix it.
# A hook that silently rewrote or hid the failure would be worse than none.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 0

# Uncommitted work AND anything committed but not yet on the upstream branch: a broken
# typecheck committed three commits ago is exactly the case this was written for.
changed="$(
  {
    git status --porcelain 2>/dev/null | awk '{print $NF}'
    git diff --name-only "@{upstream}...HEAD" 2>/dev/null || git diff --name-only HEAD~3..HEAD 2>/dev/null
  } | sort -u
)"

has_ts=0; has_py=0
grep -qE '\.(ts|tsx)$' <<<"$changed" && has_ts=1
grep -qE '\.py$'       <<<"$changed" && has_py=1
[ "$has_ts" = 0 ] && [ "$has_py" = 0 ] && exit 0

problems=""
if [ "$has_ts" = 1 ] && [ -d "$ROOT/web" ]; then
  if ! out="$(cd "$ROOT/web" && npm run --silent typecheck 2>&1)"; then
    problems+="npm run typecheck FAILED:"$'\n'"$(tail -15 <<<"$out")"$'\n'
  fi
fi
if [ "$has_py" = 1 ] && [ -x "$ROOT/.venv/bin/mypy" ]; then
  if ! out="$("$ROOT/.venv/bin/mypy" app 2>&1)"; then
    problems+="mypy app FAILED:"$'\n'"$(tail -15 <<<"$out")"$'\n'
  fi
fi

[ -z "$problems" ] && exit 0

# Exit 2 = blocking error; stderr reaches the model so it knows what to fix.
printf 'Type checking is broken. Fix before finishing, and do not report this work as verified.\n\n%s\n' "$problems" >&2
exit 2
