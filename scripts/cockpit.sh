#!/usr/bin/env bash
# The build cockpit. Loopback only; the URL and token are printed on start.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec .venv/bin/python -m tools.cockpit.local.server "$@"
