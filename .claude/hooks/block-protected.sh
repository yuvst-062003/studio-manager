#!/usr/bin/env bash
# Exit 2 = deny the tool call. stderr is shown to Claude so it knows why.
# Claude Code passes hook input as JSON on stdin: .tool_input.file_path
# $CLAUDE_TOOL_FILE_PATH is kept as a fallback for other versions.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$ROOT/.venv/bin/python3"; [ -x "$PY" ] || PY=python3
path="$("$PY" -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path','') or '')" 2>/dev/null)"
path="${path:-${CLAUDE_TOOL_FILE_PATH:-}}"
# The bare `alembic/versions/*` alternatives are not redundant: `*/alembic/versions/*`
# needs something before `alembic`, so a relative path with no prefix slipped straight
# through. Claude Code sends absolute paths today, which is the only reason this was
# never hit.
# .env.example is the one env file that is committed, secret-free and REQUIRED to
# change: tests/config/test_database_config.py asserts every field in Settings has a
# line in it, so adding a setting without editing it fails the build. The blanket
# *.env.* glob caught it, which made a mandated edit impossible and a mandated test
# unsatisfiable -- two repo rules in direct contradiction. Excluded explicitly, before
# the deny list, so the intent survives the next person reading the glob.
# test_no_password_is_committed_anywhere_in_the_local_database_setup is what keeps it
# secret-free; that gate is unaffected by this exclusion.
case "$path" in
  *.env.example) exit 0 ;;
esac

case "$path" in
  *.env|*.env.*|alembic/versions/*|migrations/versions/*|*/alembic/versions/*|*/migrations/versions/*|*/dist/*|*/node_modules/*)
    echo "Blocked: $path is protected. Ask the user before touching it." >&2
    exit 2
    ;;
esac
exit 0
