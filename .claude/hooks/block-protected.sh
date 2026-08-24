#!/usr/bin/env bash
# Exit 2 = deny the tool call. stderr is shown to Claude so it knows why.
# Claude Code passes hook input as JSON on stdin: .tool_input.file_path
# $CLAUDE_TOOL_FILE_PATH is kept as a fallback for other versions.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$ROOT/.venv/bin/python3"; [ -x "$PY" ] || PY=python3
path="$("$PY" -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path','') or '')" 2>/dev/null)"
path="${path:-${CLAUDE_TOOL_FILE_PATH:-}}"
case "$path" in
  *.env|*.env.*|*/alembic/versions/*|*/migrations/versions/*|*/dist/*|*/node_modules/*)
    echo "Blocked: $path is protected. Ask the user before touching it." >&2
    exit 2
    ;;
esac
exit 0
