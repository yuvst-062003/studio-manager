#!/usr/bin/env bash
# PostToolUse: format and autofix Python files after Edit/Write.
# Claude Code passes hook input as JSON on stdin: .tool_input.file_path
# $CLAUDE_TOOL_FILE_PATH is kept as a fallback for other versions.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$ROOT/.venv/bin/python3"; [ -x "$PY" ] || PY=python3
RUFF="$ROOT/.venv/bin/ruff"; [ -x "$RUFF" ] || RUFF="$(command -v ruff 2>/dev/null)"
path="$("$PY" -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path','') or '')" 2>/dev/null)"
path="${path:-${CLAUDE_TOOL_FILE_PATH:-}}"
case "$path" in
  *.py)
    [ -n "$RUFF" ] || { echo "ruff not found; skipped formatting $path" >&2; exit 0; }
    "$RUFF" format "$path" && "$RUFF" check --fix "$path"
    ;;
esac
exit 0
