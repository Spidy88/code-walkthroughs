# scripts/

Reusable orchestration for end-to-end captures and dev-server lifecycle.
These exist so we don't repeat long compound shell incantations every time
we need to run a Playwright capture against a real backend.

## Quick reference

| Script | Purpose |
|---|---|
| `e2e-up.sh` | Start the server + web on dedicated ports against a fresh tmp data dir. Writes `.e2e-state` so `e2e-down.sh` can find them. Idempotent. |
| `e2e-down.sh` | Stop e2e servers (by tracked PID, plus a port-fallback kill). Idempotent. |
| `e2e-capture.sh <script> [...args]` | down → up → run the named capture script via tsx → down (always, even on failure). |

## Defaults

- Server port: `4099` (override with `CW_E2E_SERVER_PORT`)
- Web port: `5179` (override with `CW_E2E_WEB_PORT`)
- Data dir: a fresh `mktemp` (override with `CW_E2E_DATA_DIR` to reuse one)
- Startup timeout: `30s` for `/health` (override with `CW_E2E_STARTUP_S`)

## Logs

`.e2e-logs/server.log` and `.e2e-logs/web.log` are preserved across runs so
you can read them post-mortem. Both directories are gitignored.

## Example

```bash
# Capture the analysis-progress flow against a fresh backend
bash scripts/e2e-capture.sh \
  apps/web/e2e-capture/capture-analysis-flow.ts \
  /Users/you/projects/some-codebase

# Or split into stages for interactive use
bash scripts/e2e-up.sh
# … run things manually against http://localhost:5179 …
bash scripts/e2e-down.sh
```

## When to add a new script here

- Recurring multi-step flow that's awkward as a single shell line.
- Anything that needs to be invoked from CI or by Claude Code reliably.
- Scripts that the project's permission allowlist (`Bash(bash scripts/*)`)
  should cover so the AI doesn't keep prompting.
