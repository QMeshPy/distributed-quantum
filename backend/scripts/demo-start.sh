#!/usr/bin/env bash
# Keep startup equivalent to the CLI: one dotenv loader, no process or data cleanup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

for arg in "$@"; do
  if [ "$arg" = "--clean" ]; then
    echo "Startup no longer deletes peer logs or peerstores. Back up runtime data before removing it manually." >&2
    exit 2
  fi
done

if [ -x ".venv/bin/quantum-backend" ]; then
  exec .venv/bin/quantum-backend "$@"
fi
exec uv run --locked quantum-backend "$@"
