#!/usr/bin/env bash
# scripts/lane-check.sh <vertical> [--dry-run]   —   the one command every lane runs.
#
# Departures from the milestone plan's §W0 snippet. Each was measured, not assumed:
#
#   * vitest positional arguments are FILTERS, not globs. A glob that matches nothing
#     exits 1, so the plan's frontend gate fails for every vertical with no frontend
#     tests yet — `core` included. File lists are resolved here and passed as concrete
#     paths.
#   * `npx eslint` from the repo root downloads a fresh eslint and never reads
#     web/eslint.config.js: it exits 0 having applied none of the D10 rules. `npx vitest`
#     from the repo root finds no config either, so jsdom is absent and every component
#     test errors with `document is not defined`. Everything frontend runs from web/.
#   * `belts`, `privacy` and `core` are verticals with no i18n namespace, so `$V` reaches
#     the parity script only when a namespace file for it exists.
#   * A gate with no targets prints `skipped` and names itself. If NO vertical-scoped
#     gate ran, the check FAILS — a green that verified nothing is the worst outcome
#     available here.
#
# bash 3.2 compatible (that is /bin/bash on macOS; CI runs bash 5): no globstar, no
# mapfile, and empty arrays expand through the ${arr[@]+"${arr[@]}"} idiom.
set -euo pipefail

V="${1:?usage: lane-check.sh <vertical> [--dry-run]}"
DRY_RUN=0
if [ "${2:-}" = "--dry-run" ]; then DRY_RUN=1; fi
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SCOPED_GATES=0

say()  { printf '\n── %s ──\n' "$*"; }
skip() { printf '   · skipped — %s\n' "$*"; }
run()  {
  if [ "$DRY_RUN" = 1 ]; then printf '   would run: %s\n' "$*"; return 0; fi
  "$@"
}

# ── which paths belong to this vertical ─────────────────────────────────────
# `core` is M0's cross-cutting layer, not a feature vertical: it lives in app/core and
# web/packages, so its paths differ from the convention every other vertical follows
# (app/services/<v>/, app/routers/<v>.py, app/models/<v>.py, tests/<v>/,
# web/apps/*/src/features/<v>/, web/packages/i18n/<locale>/<v>.ts).
py_candidates=()
test_candidates=()
case "$V" in
  core)
    py_candidates=(app/core app/models app/services)
    test_candidates=(tests/core tests/config)
    ;;
  *)
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    ;;
esac

py_paths=()
for candidate in ${py_candidates[@]+"${py_candidates[@]}"}; do
  if [ -e "$candidate" ]; then py_paths[${#py_paths[@]}]="$candidate"; fi
done

test_paths=()
for candidate in ${test_candidates[@]+"${test_candidates[@]}"}; do
  if [ -d "$candidate" ]; then test_paths[${#test_paths[@]}]="$candidate"; fi
done

# Frontend test files, resolved with find because bash 3.2 has no globstar. Printed
# relative to web/, which is where vitest runs.
if [ "$V" = "core" ]; then
  web_tests=$(
    find web/packages -path '*/src/*' \
      \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null | sed 's|^web/||' | sort
  )
else
  web_tests=$(
    {
      find web/apps -path "*/src/features/$V/*" \
        \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
      find "web/packages/core/src/$V" \
        \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
    } | sed 's|^web/||' | sort
  )
fi

# eslint targets, also relative to web/.
if [ "$V" = "core" ]; then
  eslint_targets="packages"
else
  eslint_targets=$(
    {
      for path in web/apps/*/src/features/"$V"; do
        if [ -d "$path" ]; then echo "${path#web/}"; fi
      done
      for locale in he en ru; do
        if [ -f "web/packages/i18n/$locale/$V.ts" ]; then echo "packages/i18n/$locale/$V.ts"; fi
      done
    } | sort
  )
fi

# ── the gates ───────────────────────────────────────────────────────────────
say "invariants (SPEC §13)"
# Not scoped: these run in every lane, every time, which is the whole point of them.
run .venv/bin/pytest tests/invariants -q

say "backend · $V"
if [ ${#test_paths[@]} -eq 0 ]; then
  skip "no test directory for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/pytest ${test_paths[@]+"${test_paths[@]}"} -q
fi

say "types · $V"
if [ ${#py_paths[@]} -eq 0 ]; then
  skip "no backend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/mypy ${py_paths[@]+"${py_paths[@]}"}
fi

say "frontend · $V"
if [ -z "$web_tests" ]; then
  skip "no frontend tests for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && vitest run %s)\n' "$(echo $web_tests)"
  else
    # shellcheck disable=SC2086 -- deliberate word splitting; no repo path has a space
    ( cd web && npx vitest run --reporter=dot $web_tests )
  fi
fi

say "lint · $V"
if [ ${#py_paths[@]} -eq 0 ]; then
  skip "no backend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run .venv/bin/ruff check ${py_paths[@]+"${py_paths[@]}"}
  run .venv/bin/ruff format --check ${py_paths[@]+"${py_paths[@]}"}
fi

if [ -z "$eslint_targets" ]; then
  skip "no frontend source for $V"
else
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && eslint %s)\n' "$(echo $eslint_targets)"
  else
    # shellcheck disable=SC2086
    ( cd web && npx eslint $eslint_targets )
  fi
fi

# CSS is invisible to eslint. D10's rule is a `no-restricted-syntax` rule over JS object
# properties, so a physical property written in a .css file never reaches it. Verified in
# M0.3 by planting `margin-left: 4px; inset: 0;` in tokens.css: `lane-check.sh core` went
# green at exit 0 with both in the file. A lane that writes CSS needs the CSS gate in its
# own check, not only in ci-local.
if [ "$V" = "core" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && stylelint "packages/**/*.css")\n'
  else
    # No --allow-empty-input: packages/ always holds tokens.css and fonts.css, so zero
    # matches would itself be the bug.
    ( cd web && npx stylelint "packages/**/*.css" )
  fi
elif [ -n "$eslint_targets" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && stylelint "apps/*/src/features/%s/**/*.css")\n' "$V"
  else
    ( cd web && npx stylelint "apps/*/src/features/$V/**/*.css" --allow-empty-input )
  fi
else
  skip "no CSS for $V"
fi

say "i18n parity · $V"
# `belts`, `privacy` and `core` have no namespace of their own. Checking all nine is
# strictly stronger than checking one, and never silently weaker than checking none.
# An unknown vertical falls through to neither branch, so it cannot buy a scoped gate
# it did not earn.
if [ -f "web/packages/i18n/he/$V.ts" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  run node web/scripts/i18n-parity.mjs "$V"
elif [ ${#py_paths[@]} -gt 0 ] || [ -n "$eslint_targets" ] || [ ${#test_paths[@]} -gt 0 ]; then
  printf '   · %s has no namespace of its own — checking all nine\n' "$V"
  run node web/scripts/i18n-parity.mjs
else
  skip "$V owns no namespace and no source"
fi

if [ "$SCOPED_GATES" -eq 0 ]; then
  printf '\n❌ lane %s: every vertical-scoped gate was skipped — nothing was checked.\n' "$V" >&2
  printf '   A green check that verified nothing is worse than a red one.\n' >&2
  exit 1
fi

printf '\n✅ lane %s green (%s scoped gates)\n' "$V" "$SCOPED_GATES"
