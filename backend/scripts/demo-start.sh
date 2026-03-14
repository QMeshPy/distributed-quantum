#!/usr/bin/env bash
# Demo startup script for Distributed Quantum Services
#
# Ensures ports are free and optionally clears the DB for a clean run.
# Run from project root: ./scripts/demo-start.sh [--clean]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

API_PORT=8080
COORD_PORT=9100
SERVICE_PORTS="9200 9201 9202"
DB_PATH="${DB_PATH:-./data/quantum_coordinator.db}"
CONFIG_FILE="${QC_CONFIG_FILE:-config/config.example.yaml}"

CLEAN_RUN=false
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN_RUN=true ;;
  esac
done

echo "=== Quantum Coordinator Demo Startup ==="

# 1. Free required ports
echo ""
echo "Checking ports $API_PORT, $COORD_PORT, $SERVICE_PORTS..."
for port in $API_PORT $COORD_PORT $SERVICE_PORTS; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  Killing process(es) on port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null || true
  fi
done
sleep 2

# Verify ports are free
for port in $API_PORT $COORD_PORT $SERVICE_PORTS; do
  if lsof -ti ":$port" 2>/dev/null; then
    echo "ERROR: Port $port still in use. Stop the process manually and retry."
    exit 1
  fi
done
echo "  All ports free."

# 2. Optional clean run - remove DB
if [ "$CLEAN_RUN" = true ]; then
  if [ -f "$DB_PATH" ]; then
    echo ""
    echo "Removing database for clean run: $DB_PATH"
    rm -f "$DB_PATH"
    echo "  Database removed."
  else
    echo ""
    echo "Database not found (already clean): $DB_PATH"
  fi
fi

# 3. Start server
echo ""
echo "Starting server with config: $CONFIG_FILE"
echo "  API:        http://127.0.0.1:$API_PORT"
echo "  Health:     http://127.0.0.1:$API_PORT/api/v1/health"
echo "  Docs:       http://127.0.0.1:$API_PORT/docs"
echo ""
echo "Press Ctrl+C to stop."
echo ""

QC_CONFIG_FILE="$CONFIG_FILE" uv run uvicorn quantum_coordinator.asgi:app --host 0.0.0.0 --port "$API_PORT"
