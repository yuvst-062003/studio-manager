#!/usr/bin/env bash
# Exit 2 = deny the tool call. stderr is shown to Claude so it knows why.
# Claude Code passes hook input as JSON on stdin.
#
# TWO arms, because a guard on Edit|Write alone is not a guard:
#   * Edit/Write  -> .tool_input.file_path, matched against the protected globs.
#   * Bash        -> .tool_input.command, matched for shell constructs that WRITE to a
#                    protected path. Every file in this repo can be written with a
#                    heredoc, so a matcher that covers only the file tools leaves the
#                    front door open while bolting the side one.
#
# The Bash arm is deliberately partial, and the boundary is tested rather than implied:
# it sees shell writes (> >> tee sed -i rm mv cp truncate install dd) but CANNOT see a
# program that writes the file itself -- `python - <<PY ... Path(...).write_text(...)`
# is opaque to any inspection of the command string. A detector that pretended to catch
# every form would be the more dangerous artefact, so this one states its limit.
# Reads (cat, grep, sed -n) and `git add` stay allowed: blocking them would make an
# authorized migration impossible to stage.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$ROOT/.venv/bin/python3"; [ -x "$PY" ] || PY=python3

payload="$(cat)"
offending="$(printf '%s' "$payload" | "$PY" -c '
import fnmatch, json, re, shlex, sys

# .env.example is the one env file that is committed, secret-free and REQUIRED to
# change: tests/config/test_database_config.py asserts every field in Settings has a
# line in it, so adding a setting without editing it fails the build. The blanket
# *.env.* glob caught it, which made a mandated edit impossible and a mandated test
# unsatisfiable -- two repo rules in direct contradiction.
ALLOWED = ("*.env.example",)

# The bare `alembic/versions/*` alternatives are not redundant: `*/alembic/versions/*`
# needs something before `alembic`, so a relative path with no prefix slips through.
PROTECTED = (
    "*.env", "*.env.*",
    "alembic/versions/*", "migrations/versions/*",
    "*/alembic/versions/*", "*/migrations/versions/*",
    "*/dist/*", "*/node_modules/*",
)

WRITE_SHAPE = re.compile(r">>?|\btee\b|\bsed\s+-i\b|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\binstall\b|\bdd\b")


def protected(path):
    if not path:
        return False
    if any(fnmatch.fnmatch(path, glob) for glob in ALLOWED):
        return False
    return any(fnmatch.fnmatch(path, glob) for glob in PROTECTED)


data = json.load(sys.stdin)
tool_input = data.get("tool_input") or {}

path = tool_input.get("file_path") or ""
if protected(path):
    print(path)
    raise SystemExit

command = tool_input.get("command") or ""
if command and WRITE_SHAPE.search(command):
    try:
        tokens = shlex.split(command, comments=False)
    except ValueError:
        tokens = command.split()
    for token in tokens:
        token = token.strip("\"'\''")
        if protected(token):
            print(token)
            raise SystemExit
' 2>/dev/null)"

if [ -n "$offending" ]; then
  echo "Blocked: $offending is protected. Ask the user before touching it." >&2
  exit 2
fi
exit 0
