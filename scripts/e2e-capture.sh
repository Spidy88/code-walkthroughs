#!/usr/bin/env bash
#
# Drive an end-to-end capture against a fresh backend.
#
#   1. e2e-down (any stale servers)
#   2. e2e-up   (fresh data dir, server + web)
#   3. run the named capture script
#   4. e2e-down (always, even on failure)
#
# Usage:
#   bash scripts/e2e-capture.sh <capture-script-path> [...args]
#
# Example:
#   bash scripts/e2e-capture.sh \
#     apps/web/e2e-capture/capture-analysis-flow.ts \
#     /Users/nick/projects/code-walkthroughs

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <capture-script-path> [...args]" >&2
  exit 64
fi

CAPTURE_SCRIPT="$1"
shift

cleanup() {
  bash "$ROOT/scripts/e2e-down.sh" --quiet || true
}
trap cleanup EXIT INT TERM

bash "$ROOT/scripts/e2e-up.sh"

# Source the state file to pick up the assigned ports for the tsx script
# shellcheck disable=SC1091
source "$ROOT/.e2e-state"

# tsx lives in apps/web's devDependencies, so route through that workspace
CW_WEB_PORT="$WEB_PORT" \
CW_SERVER_PORT="$SERVER_PORT" \
  pnpm --filter @cw/web exec tsx "$ROOT/$CAPTURE_SCRIPT" "$@"
