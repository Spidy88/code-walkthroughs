#!/usr/bin/env bash
#
# Start the server + web dev servers on dedicated e2e ports against a
# fresh tmp data directory. PIDs and ports are written to .e2e-state in
# the repo root so e2e-down.sh can find and stop them later.
#
# Idempotent: if servers are already running on the e2e ports, kills
# them first.
#
# Env overrides:
#   CW_E2E_SERVER_PORT  default 4099
#   CW_E2E_WEB_PORT     default 5179
#   CW_E2E_DATA_DIR     default a fresh mktemp dir
#   CW_E2E_STARTUP_S    default 30 (seconds to wait for /health before failing)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

SERVER_PORT="${CW_E2E_SERVER_PORT:-4099}"
WEB_PORT="${CW_E2E_WEB_PORT:-5179}"
DATA_DIR="${CW_E2E_DATA_DIR:-$(mktemp -d -t cw-e2e)}"
STARTUP_S="${CW_E2E_STARTUP_S:-30}"
STATE_FILE="$ROOT/.e2e-state"
LOG_DIR="$ROOT/.e2e-logs"

mkdir -p "$LOG_DIR"

# Idempotent kill of anything already on the e2e ports
"$(dirname "$0")/e2e-down.sh" --quiet || true

echo "→ e2e data dir: $DATA_DIR"
echo "→ server port:  $SERVER_PORT"
echo "→ web port:     $WEB_PORT"

# Start server
CW_SERVER_PORT="$SERVER_PORT" \
CW_WEB_PORT="$WEB_PORT" \
CW_DATA_DIR="$DATA_DIR" \
  pnpm --filter @cw/server dev > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "→ server pid:   $SERVER_PID"

# Start web (vite picks up CW_SERVER_PORT for proxy and CW_WEB_PORT for listen)
(
  cd "$ROOT/apps/web"
  CW_WEB_PORT="$WEB_PORT" \
  CW_SERVER_PORT="$SERVER_PORT" \
    pnpm dev > "$LOG_DIR/web.log" 2>&1 &
  echo $! > "$ROOT/.e2e-web-pid"
)
WEB_PID=$(cat "$ROOT/.e2e-web-pid")
rm "$ROOT/.e2e-web-pid"
echo "→ web pid:      $WEB_PID"

# Persist state for e2e-down.sh
cat > "$STATE_FILE" <<EOF
SERVER_PORT=$SERVER_PORT
WEB_PORT=$WEB_PORT
SERVER_PID=$SERVER_PID
WEB_PID=$WEB_PID
DATA_DIR=$DATA_DIR
LOG_DIR=$LOG_DIR
EOF

# Wait for server /health to respond with 200
echo "→ waiting for server health (timeout ${STARTUP_S}s)..."
deadline=$(( $(date +%s) + STARTUP_S ))
while true; do
  if curl -sf "http://localhost:$SERVER_PORT/health" > /dev/null 2>&1; then
    echo "✓ server ready at http://localhost:$SERVER_PORT"
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "✗ server failed to start within ${STARTUP_S}s — see $LOG_DIR/server.log"
    exit 1
  fi
  sleep 0.5
done

# Wait for web dev server to respond
echo "→ waiting for web..."
deadline=$(( $(date +%s) + STARTUP_S ))
while true; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$WEB_PORT/" || echo 000)
  if [ "$status" = "200" ]; then
    echo "✓ web ready at http://localhost:$WEB_PORT"
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "✗ web failed to start within ${STARTUP_S}s — see $LOG_DIR/web.log"
    exit 1
  fi
  sleep 0.5
done

echo "✓ e2e servers up — state in $STATE_FILE"
