#!/usr/bin/env bash
# The one way a developer gets a database. psql is not installed here, so every
# command below goes through the container.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMPOSE=(docker compose -f docker-compose.yml)

usage() { echo "usage: dev-db.sh {up|down|reset|wait|url|psql}" >&2; exit 64; }

wait_ready() {
  for _ in $(seq 1 60); do
    if "${COMPOSE[@]}" exec -T db pg_isready -U studio_migrator -d studio_manager >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "database did not become ready in 60s" >&2
  return 1
}

case "${1:-}" in
  up)    "${COMPOSE[@]}" up -d db; wait_ready; echo "✅ postgres ready on 127.0.0.1:55433" ;;
  # -v drops the volume, so the init script re-runs and the next `alembic upgrade
  # head` is genuinely against a fresh database — which is this milestone's exit gate.
  reset) "${COMPOSE[@]}" down -v; "${COMPOSE[@]}" up -d db; wait_ready; echo "✅ fresh database" ;;
  down)  "${COMPOSE[@]}" down ;;
  wait)  wait_ready ;;
  url)   echo "postgresql+psycopg://studio_app@127.0.0.1:55433/studio_manager" ;;
  psql)  shift; "${COMPOSE[@]}" exec -T db psql -U studio_migrator -d studio_manager "$@" ;;
  *)     usage ;;
esac
