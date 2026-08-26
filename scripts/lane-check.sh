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
# Frontend feature directories this lane owns. Defaults to one named for the vertical.
# A lane whose UI does not all live under features/<vertical>/ overrides this in its own
# case branch below. A directory this lane owns but does not name here is a directory the
# gate silently skips -- which is worse than a red gate, because it reads as covered.
feature_dirs=("$V")
# Subdirectories of web/packages/core/src this lane owns. Defaults to one named for the
# vertical -- which is what the frontend and lint gates already looked for, and which no
# vertical actually has, so the default is a no-op preserved rather than a rule.
#
# `attendance` is the only lane in the plan that owns anything under web/packages/core --
# §10's offline queue, pending_ops and the network state machine -- and it does not follow
# the naming convention. Same rule as feature_dirs above: a directory this lane owns but
# does not name here is a directory the gate silently skips.
core_dirs=("$V")

case "$V" in
  core)
    # §19's code is spread across routers/, integrations/ and workers/, none of which
    # follow the per-vertical convention. Listed explicitly rather than by widening to
    # all of app/routers: a lane's own router belongs to that lane's check, not to
    # core's.
    # tools/cockpit is here for the same reason as the explicit router paths above:
    # it lives outside app/ entirely, so no other vertical would ever reach it.
    py_candidates=(app/core app/models app/services app/routers/dev.py app/integrations app/workers tools/cockpit)
    test_candidates=(tests/core tests/config tests/dev tests/cockpit)
    ;;
  identity)
    # SPEC §7 puts these under /auth and /platform, so the router filenames do not
    # follow the per-vertical convention the default branch assumes. Listed explicitly
    # for the same reason `core` lists app/routers/dev.py: a lane's own code belongs in
    # a gate that actually reaches it, and the default branch would have type-checked
    # app/routers/identity.py while silently skipping the console and the middleware.
    py_candidates=(app/services/identity app/routers/identity.py app/routers/platform.py \
                   app/models/identity.py app/models/person.py \
                   app/core/auth_context.py app/core/cors.py)
    test_candidates=(tests/identity)
    ;;
  structure)
    # app/models/health.py is here by conflict C3: M1 seeds the kind='trial' template so
    # M3's trial booking is not blocked on M4. M4 owns the rest of that file.
    #
    # app/routers/studio.py and app/routers/setup.py are here because §3.2 groups
    # 'Studio settings' with 'Create/edit classes, groups, schedules' on one row, and
    # because W1's exit gate runs identity and structure and nothing else -- a router in
    # neither list is a router the stated gate does not reach. app/core/storage.py is
    # already covered by the `core` vertical's app/core.
    py_candidates=(app/services/structure app/routers/structure.py \
                   app/routers/studio.py app/routers/setup.py app/routers/staff.py \
                   app/models/structure.py app/models/health.py)
    test_candidates=(tests/structure)
    ;;
  people)
    # SPEC §7 spreads M3 over four routers named for their endpoints -- /students,
    # /enrollments, /public, /trial-bookings -- so none of them is `app/routers/people.py`
    # and the default branch below would type-check the service package while silently
    # skipping every route in the lane. Listed explicitly for the same reason `identity`
    # lists platform.py: a router in neither list is a router the stated gate does not
    # reach. app/workers/followups.py is here because §5.4a's day 1/3/7 ladder is a job,
    # and a job outside every lane's check is a job nothing type-checks.
    py_candidates=(app/services/people app/routers/students.py app/routers/enrollments.py \
                   app/routers/public.py app/routers/trial_bookings.py \
                   app/workers/followups.py app/models/people.py)
    test_candidates=(tests/people)
    # §5.4a's public trial page is in this lane's ownership but lives under
    # features/landing/, not features/people/ -- it is the parent app's only
    # unauthenticated screen, which is why it has its own directory. Without this line the
    # frontend and lint gates skip all four of its test files and the check still prints
    # green, so a regression in the booking flow would go unnoticed by the exact command
    # meant to catch it.
    feature_dirs=(people landing)
    ;;
  attendance)
    # SPEC §7 puts the offline flush at /sync, so app/routers/sync.py does not follow the
    # per-vertical convention and the default branch would type-check the roster router
    # while silently skipping the endpoint the entire offline queue drains into. Listed
    # explicitly for the same reason `people` lists its four endpoint-named routers.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/routers/sync.py" \
                   "app/models/$V.py")
    test_candidates=("tests/$V")
    # §5.7's parent pre-report is this lane's, and it lives under features/absence/ -- the
    # parent app's own screen for it (artboard 12a), not a section of the coach roster.
    # Same shape as `people`'s features/landing/. Without this line the frontend, lint and
    # CSS gates skip every one of its files and the check still prints green.
    feature_dirs=(attendance absence)
    # §10.1-§10.6 -- pending_ops, the four-state network machine and the sync queue. This
    # is the only lane in the plan that owns anything under web/packages/core, and it is
    # the highest-risk code in it: the default core_dirs=($V) looks for
    # web/packages/core/src/attendance, which will never exist.
    core_dirs=(offline)
    ;;
  health)
    # app/routers/health.py is NOT here, deliberately. That file is core's liveness probe
    # -- `GET /api/v1/health`, asserted by tests/test_health.py -- and the default branch
    # resolves `app/routers/$V.py` straight onto it, which would hand this lane a gate
    # over a file it does not own. A gate reads as ownership. SPEC §7 puts M4's routes at
    # /health-templates and /students/{id}/health-declaration; those two files are the
    # lane's, and `GET /health-templates` stays in app/routers/structure.py where M1's
    # conflict-C3 read side already lives.
    #
    # app/workers/health_reminders.py is the reason this branch exists at all. §5.5's
    # one-tap `שלח תזכורת להורה` and its ladder are a job, and the default branch reaches
    # no worker -- so this lane's own gate would have gone green having never type-checked
    # the reminder worker. Same reasoning as `people`'s app/workers/followups.py.
    py_candidates=("app/services/$V" "app/routers/health_templates.py" \
                   "app/routers/health_declarations.py" \
                   "app/workers/health_reminders.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    # This lane owns nothing under web/packages/core -- `attendance` owns the only piece
    # of it in the plan. Said out loud rather than left to the default, because the
    # default would have this lane's CSS gate glob packages/core/src/health/, which reads
    # as a claim on a directory M5's offline work sits next to.
    core_dirs=()
    ;;
  billing)
    # There is no app/routers/billing.py, so the default branch's `app/routers/$V.py`
    # resolves NOTHING -- and the gates below would then report a green this lane never
    # earned, over the four paths that matter most in it. SPEC §7 spreads M6 across
    # routers named for their endpoints, and two of those four paths are not routers:
    #
    #   webhooks.py       the IPN endpoint. §12: the IPN carries NO cryptographic
    #                     signature, which makes this the highest-stakes file in the
    #                     product. It is the one file a silently-green gate must never
    #                     cover.
    #   payments.py       the parent-facing pay flow.
    #   workers/billing.py  the monthly run -- invariant 5's subject. Same reasoning as
    #                     `people`'s followups.py and `health`'s health_reminders.py: a
    #                     job outside every lane's check is a job nothing type-checks.
    #   integrations/upay the provider boundary. Named as a DIRECTORY, not a `**` glob:
    #                     `-e` tests it directly, mypy and ruff both recurse into it, and
    #                     bash 3.2 has no globstar to expand a glob with.
    #
    # app/routers/billing.py is listed even though it does not exist yet -- the plan gives
    # it to this lane, and the `-e` filter below drops it until lane MONEY creates it.
    # Same for payments.py, webhooks.py and workers/billing.py. Listing them now is the
    # point: the day they appear, the gate reaches them without anyone remembering to.
    py_candidates=("app/services/$V" "app/routers/billing.py" "app/routers/payments.py" \
                   "app/routers/webhooks.py" "app/workers/billing.py" \
                   "app/integrations/upay" "app/models/$V.py")
    # tests/upay already exists and already covers app/integrations/upay/callback.py. A
    # test directory over this lane's code that no lane's check runs is the same silent
    # gap as an unreached source file, in the other direction.
    test_candidates=("tests/$V" tests/upay)
    # This lane owns nothing under web/packages/core -- `attendance` owns the only piece
    # of it in the plan. Said out loud rather than left to the default, which would have
    # the CSS gate glob packages/core/src/billing/ and read as a claim on a directory M6
    # has no business in.
    core_dirs=()
    ;;
  events|belts)
    # These two happen to match the default branch exactly. They are written out anyway,
    # for the same reason `health` writes out `core_dirs=()`: what a lane's gate covers
    # should be a statement someone made, not an accident of a default that would change
    # silently if the default changed.
    #
    # Lane EVENTS owns BOTH verticals and runs both checks (§W4: `lane-check.sh events &&
    # lane-check.sh belts`), so neither branch claims the other's paths.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    # Neither owns anything under web/packages/core -- `attendance` owns the only piece of
    # it in the plan. Said out loud rather than left to the default, which would have the
    # CSS gate glob packages/core/src/{events,belts}/ and read as a claim on a directory
    # that will never exist.
    core_dirs=()
    # `belts` has no i18n namespace of its own, deliberately: belt strings live in
    # events.ts. Seam 3 exists so two LANES never touch one file, and these two verticals
    # are one lane, so a second namespace buys no isolation while costing an edit to
    # web/packages/i18n/types.ts AND index.ts -- both authored once, never by a lane. The
    # i18n gate below therefore takes its "checking all nine" arm for `belts`, which is
    # strictly stronger than checking one.
    ;;
  comms)
    # SPEC §7 puts the ICS feed at /calendar-feeds and §5.11's fan-out is a job, so neither
    # app/routers/calendar.py nor app/workers/notify.py follows the per-vertical convention
    # the default branch assumes -- and the default would have type-checked
    # app/services/comms and app/routers/comms.py while silently skipping BOTH. §5.12's feed
    # is served from an UNAUTHENTICATED URL, which makes it the last file in this lane that
    # should sit outside its own gate, and the notification worker is where every §5.11 send
    # actually happens. Same reasoning as `people`'s followups.py and `health`'s
    # health_reminders.py: a job outside every lane's check is a job nothing type-checks.
    #
    # app/routers/comms.py, app/routers/calendar.py and app/workers/notify.py do not exist
    # yet; the `-e` filter below drops them until lane COMMS creates them. Listing them now
    # IS the point -- the day they appear the gate reaches them without anyone remembering.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/routers/calendar.py" \
                   "app/workers/notify.py" "app/models/$V.py")
    test_candidates=("tests/$V")
    # Owns nothing under web/packages/core -- `attendance` owns the only piece of it in the
    # plan. Said out loud rather than left to the default, which would have the CSS gate glob
    # packages/core/src/comms/ and read as a claim on a directory M8 has no business in.
    core_dirs=()
    ;;
  reports|privacy)
    # Lane REPORTS owns BOTH verticals and runs both checks (§W5: `lane-check.sh reports &&
    # lane-check.sh privacy`), so this branch serves each in turn through "$V" -- neither
    # half claims the other's service, router, model or tests.
    #
    # Two paths the default branch reaches for NEITHER vertical:
    #
    #   app/workers/retention.py   §11.5's 24-month anonymization run. A job, so no default
    #                              branch reaches it. Third time this file has had to say so,
    #                              after followups.py and health_reminders.py. This one
    #                              DESTROYS health declarations and signature images, which
    #                              makes an untype-checked version of it the worst of the
    #                              three.
    #   app/routers/platform.py    §18.2's operations board and break-glass access.
    #
    # platform.py is ALSO in `identity`'s list, and the overlap is deliberate rather than an
    # oversight anyone should tidy. Conflict C4: §14 puts the platform console in both M1 and
    # M9. M1 built the console shell and M9 adds the operations board to it, so a file two
    # milestones both write belongs in both their gates -- the alternative is one of them
    # shipping changes its own check never reaches. A gate reads as ownership, and here two
    # milestones genuinely own it.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/models/$V.py" \
                   app/workers/retention.py app/routers/platform.py)
    test_candidates=("tests/$V")
    core_dirs=()
    # §18.2's board lives under features/platform/, which neither vertical is named for, so
    # the default feature_dirs=($V) skips it in the frontend, lint and CSS gates while still
    # printing green. Given to `reports` rather than to both halves so it is linted once and
    # claimed once. `privacy` keeps the default, which resolves features/privacy/ in both the
    # parent and dashboard apps.
    if [ "$V" = "reports" ]; then feature_dirs=(reports platform); fi
    # `privacy` has no i18n namespace of its own, deliberately, and the same way `belts` has
    # none: privacy strings live in reports.ts under `privacy.*`. types.ts lists exactly nine
    # namespaces and index.ts is authored once, so a lane could not add a tenth even if the
    # W5 contract table said it should -- and both verticals here are ONE lane, so a second
    # namespace would buy no isolation. The i18n gate below therefore takes its "checking all
    # nine" arm for `privacy`, which is strictly stronger than checking one.
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
      for fdir in ${feature_dirs[@]+"${feature_dirs[@]}"}; do
        find web/apps -path "*/src/features/$fdir/*" \
          \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
      done
      for cdir in ${core_dirs[@]+"${core_dirs[@]}"}; do
        find "web/packages/core/src/$cdir" \
          \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null || true
      done
    } | sed 's|^web/||' | sort
  )
fi

# eslint targets, also relative to web/.
if [ "$V" = "core" ]; then
  eslint_targets="packages"
else
  eslint_targets=$(
    {
      for fdir in ${feature_dirs[@]+"${feature_dirs[@]}"}; do
        for path in web/apps/*/src/features/"$fdir"; do
          if [ -d "$path" ]; then echo "${path#web/}"; fi
        done
      done
      # The offline queue is source this lane owns, so D10's logical-property rule and
      # every other eslint rule must reach it. Without this it is linted by nothing.
      for cdir in ${core_dirs[@]+"${core_dirs[@]}"}; do
        if [ -d "web/packages/core/src/$cdir" ]; then echo "packages/core/src/$cdir"; fi
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

say "restrictions (SPEC §19.6)"
# Not scoped, for the same reason the invariants are not: §19.6's five guardrails must
# be checked in every lane, every time, so no lane can land the first violation
# unnoticed. §19.7's demo-data hygiene rides along in the same directory.
run .venv/bin/pytest tests/restrictions -q

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
  # One glob per owned feature directory, quoted so stylelint expands them rather than
  # the shell -- same reason the single-glob version was quoted.
  css_globs=()
  for fdir in ${feature_dirs[@]+"${feature_dirs[@]}"}; do
    css_globs[${#css_globs[@]}]="apps/*/src/features/$fdir/**/*.css"
  done
  for cdir in ${core_dirs[@]+"${core_dirs[@]}"}; do
    css_globs[${#css_globs[@]}]="packages/core/src/$cdir/**/*.css"
  done
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && stylelint %s)\n' "$(printf '"%s" ' ${css_globs[@]+"${css_globs[@]}"})"
  else
    ( cd web && npx stylelint ${css_globs[@]+"${css_globs[@]}"} --allow-empty-input )
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
