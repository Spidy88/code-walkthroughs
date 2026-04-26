#!/usr/bin/env bash
#
# Stop the e2e dev servers started by e2e-up.sh. Reads .e2e-state for
# tracked PIDs, then kills anything still listening on the e2e ports as
# a fallback. Idempotent: a no-op if nothing is running.
#
# Flags:
#   --quiet  suppress "nothing to stop" output (used by e2e-up.sh)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

QUIET=0
if [ "${1:-}" = "--quiet" ]; then
  QUIET=1
fi

SERVER_PORT="${CW_E2E_SERVER_PORT:-4099}"
WEB_PORT="${CW_E2E_WEB_PORT:-5179}"
STATE_FILE="$ROOT/.e2e-state"

# Read tracked PIDs if the state file exists
if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
fi

# Fallback: kill anything still on the e2e ports
killed=0
for port in "$SERVER_PORT" "$WEB_PORT"; do
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    killed=1
  fi
done

# Wait briefly for sockets to close
sleep 1

# Remove state file
rm -f "$STATE_FILE"

if [ "$QUIET" = "0" ]; then
  if [ "$killed" = "1" ] || [ -f "$STATE_FILE" ]; then
    echo "✓ e2e servers stopped"
  else
    echo "✓ nothing to stop"
  fi
fi
