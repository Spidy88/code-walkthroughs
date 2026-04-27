# Code Walkthroughs

A local-first code review tool. You point it at a directory; it analyses the
codebase into entry-point-rooted execution paths, classifies every function,
and gives you a guided surface to walk those paths and leave per-function
reviews. Comparison mode (chunks 18–19, scaffolded) does the same for two
git refs.

This is v1, single-user, single-machine. No cloud, no shared backend.

## Status

Implementation tracked in [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
Current state: chunks 1A–19 shipped. Chunk 20 (comparison detailed visual
design) is design-blocked. Per-chunk follow-ups noted in commit messages —
ask for the deferral inventory if you want a checklist.

## Quick start

```bash
# Prerequisites: Node 22+, pnpm 9+
pnpm install

# Run server + web together (server on :4099, web on :5179)
pnpm dev

# In another terminal: open http://localhost:5179, paste an absolute path
# to a JS/TS codebase (e.g. fixtures/js-ts/express-tiny), click "Open codebase".
```

## Workspace layout

```
apps/
  server/       Hono + tRPC backend. Owns analysis, persistence, LLM client.
  web/          React + TanStack Router/Query frontend. Blueprint Draft UI.
packages/
  shared/       Types + Zod schemas shared across the workspace.
  adapters/     Language adapters (currently JS/TS via ts-morph) + framework
                adapters (express).
  analyzer/    Stage 1/2/3 classification, path detection, rename detection,
                rule evaluation, comparison delta.
fixtures/       Sample codebases the e2e captures run against.
docs/           Engineering + product specs. Implementation plan.
scripts/        e2e orchestration (e2e-up / e2e-down / e2e-capture).
```

## Common commands

```bash
pnpm typecheck         # tsc -b across every package
pnpm lint              # biome check (no warnings tolerated)
pnpm lint:fix          # biome check --write
pnpm test              # vitest workspace
pnpm test:e2e          # playwright against the web app
pnpm dev               # server + web concurrently

# End-to-end captures (golden-path videos + screenshots)
bash scripts/e2e-capture.sh \
  apps/web/e2e-capture/<script>.ts \
  /absolute/path/to/codebase
# Capture artifacts land in apps/web/test-results/{screenshots,videos}/.
```

## Architecture in three sentences

Two SQLite databases per opened codebase: `cache.db` (regenerable analysis
output — analyzed nodes, classifications, paths, call edges, prep questions,
rule results) and `state.db` (precious user state — review status, comments,
prep answers, project rules). The analyzer runs deterministic Stage 1
classification, optional LLM Stage 2 reclassification, then path detection
that walks resolved call edges from each detected entry point; everything
persists to `cache.db` and the UI reads it back via tRPC. The four-state
runtime machine (`never_reviewed` / `reviewed_current` / `reviewed_stale` /
`info_requested`) is computed at query time by joining `review_status`
(state) against `classifications.contentHash` (cache).

Deeper detail in [`docs/engineering/01-architecture.md`](docs/engineering/01-architecture.md).

## Key product surfaces

- **Walkthrough** (`/project/$projectId/path/$pathId`) — the canvas-driven
  guided review. Spatial dig-into for downstream callees, reuse prompts for
  previously-reviewed functions, line-range commenting in the focused code
  body, mid-walkthrough prep injection on path forks.
- **File browser** (`/project/$projectId/files`) — flat list with
  classification + per-function review counts. File detail view drops
  classification + status chips at each function's signature row.
- **Prep queue** (`/prep`) — outstanding analysis questions (low-confidence
  classifications, path-branch forks, rename candidates). Answers feed back
  into `cache.db` (classification answers) or trigger re-analysis (path-
  branch answers).
- **Rules** (`/rules`) — author shell or LLM rules scoped to the project.
  Built-in pattern rules ship with the analyzer and run unconditionally.
- **Progress** (`/progress`) — coverage at codebase / path / file scopes
  with reset.
- **Comparison** (`/comparison`) — paste two filesets, get the three-layer
  delta surface (contract changes / path deltas / indirect impact). Real
  git-ref orchestration is a follow-up.

## Where the LLM-on path lives

The analyzer accepts an `AnalysisLlmCallback` with hooks for Stage 0 (per-
codebase architectural pass), Stage 2 (per-file LLM reclassification),
branch resolution, and prep suggestion generation. With no client wired
(the v1 default), every callback returns null and the analyzer falls back
to deterministic output. The LLM client lives in `apps/server/src/llm/`
and is presently a no-op shell — wire a real client there to light up the
LLM-on path. See [`docs/engineering/06-llm-integration.md`](docs/engineering/06-llm-integration.md).

## Conventions

- **Memory rules**: bug fixes ship with a regression test in the same commit
  (see `docs/engineering/10-testing.md`). Visual chunks ship with a capture
  script + screenshots/video.
- **One chunk per commit**, imperative subject + body explaining the *why*.
  Co-author footer is `Claude Opus 4.7 (1M context)`.
- **No `--no-verify`, no `--amend` of pushed commits.** Pre-commit hook
  failures should be fixed and re-committed, never bypassed.

More in [`docs/engineering/03-conventions.md`](docs/engineering/03-conventions.md).
