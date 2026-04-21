# 11 — Development Workflow

## Scope

How to run, debug, and extend the codebase day-to-day. Scripts, environment, logging, debugging recipes, and the extension recipes that recur when building features. This doc is the "I opened the repo and want to get something done" reference.

## Out of scope

Deep architecture (see `01-architecture.md`). Testing specifics (see `10-testing.md`).

## Prerequisites

- **Node** ≥ 22 (for native `node:sqlite` compatibility and modern features; `better-sqlite3` is still the driver).
- **pnpm** ≥ 9.
- **git** installed and on `$PATH`.
- An **Anthropic API key** in `.env` if you want LLM features during development. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

No Docker, no database server, no external services.

## First-time setup

```bash
pnpm install
pnpm build        # Builds packages/* so apps can import them
pnpm db:migrate   # Runs migrations on user.db (creates ~/.code-walkthrough/ on first run)
pnpm dev
```

`pnpm dev` runs both the Vite dev server and the Node server concurrently. The web app is at `http://localhost:5173`, the API at `http://localhost:4000/trpc`.

## Scripts

Root scripts (defined in the root `package.json`, delegated to workspaces via pnpm filters):

| Script | What it does |
|---|---|
| `pnpm dev` | Starts web + server concurrently (`concurrently` + filtered `dev` scripts) |
| `pnpm dev:server` | Server only |
| `pnpm dev:web` | Web only |
| `pnpm build` | Builds all packages + apps in dependency order |
| `pnpm typecheck` | `tsc --noEmit` across the workspace (uses project references) |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome auto-fix |
| `pnpm format` | Biome format |
| `pnpm test` | Vitest workspace |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright |
| `pnpm storybook` | Storybook dev server |
| `pnpm storybook:build` | Static Storybook build |
| `pnpm db:migrate` | Run Drizzle migrations on user.db (codebase DBs migrate on codebase open) |
| `pnpm db:generate` | Generate a new Drizzle migration from schema changes |
| `pnpm clean` | Removes `dist/`, `node_modules/.vite`, `.turbo/`, etc. |
| `pnpm reset:codebases` | Nukes `~/.code-walkthrough/codebases/` (state + cache). Prompts for confirmation. |

Per-package scripts (in each `package.json`):

- `build`, `typecheck`, `lint`, `test` — scoped to that package.

## Environment variables

All configured via `.env` at the repo root. The server loads it via `dotenv` at startup; `.env.example` documents every variable.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | unset → LLM disabled | Claude API key |
| `CW_SERVER_PORT` | No | `4000` | Server HTTP port |
| `CW_WEB_PORT` | No | `5173` | Vite dev port |
| `CW_LOG_LEVEL` | No | `info` (dev), `warn` (prod) | Pino log level |
| `CW_DATA_DIR` | No | `~/.code-walkthrough` | Override storage location |
| `CW_ALLOW_REAL_LLM` | No | unset | Permits integration tests to hit the real API |

Unset the key at any time to test the LLM-disabled code paths without touching code.

## Dev loop

### Typical backend change

1. Edit server code.
2. `tsx` watch mode restarts the server.
3. Client keeps its SSE reconnection; refresh the browser only if tRPC types changed (TS server will tell you).
4. Run `pnpm test -- path/to/your/test` tightly scoped while iterating.

### Typical frontend change

1. Edit a component or route.
2. Vite HMR updates in place.
3. For Storybook-isolated work: `pnpm storybook` in a second terminal.

### Adding a new tRPC procedure

1. Define input schema in `packages/shared/src/schemas/`.
2. Add the procedure under `apps/server/src/router/<area>.ts`.
3. Write the service function it calls under `apps/server/src/<area>/`.
4. Add a test under `apps/server/test/router/<area>.ts` via `createCaller`.
5. Types flow to the web automatically — the client call site autocompletes.

### Adding a new schema / DB table

1. Update the Drizzle schema under `apps/server/src/db/schema/<scope>/<table>.ts`.
2. `pnpm db:generate` — writes a new migration under `apps/server/src/db/migrations/<scope>/`.
3. Review the generated SQL. If it's destructive on `state.db`, ensure the migration preserves data; add a seed-migration step if needed.
4. Open the DB in a browser (`pnpm db:studio` opens Drizzle Studio) to verify.
5. Write tests that touch the new table.

### Adding a framework sub-adapter

See `03-conventions.md` for the recipe. Checklist:

- [ ] New file under `packages/adapters/src/<lang>/frameworks/<framework>.ts`.
- [ ] Implements `FrameworkAdapter` interface.
- [ ] Registered in `packages/adapters/src/<lang>/index.ts`.
- [ ] Fixture under `fixtures/<lang>/<framework>/` — a minimal real app.
- [ ] Entry-point detection tests under `packages/adapters/test/<lang>/frameworks/<framework>.test.ts`.
- [ ] Classifier signals added where applicable.

### Adding an LLM pipeline

See `06-llm-integration.md`. Checklist:

- [ ] New prompt file under `apps/server/src/llm/prompts/<name>.ts` exporting `name`, `version`, `responseSchema`, `buildMessages`.
- [ ] New row in the degradation contract table in `06-llm-integration.md`.
- [ ] Service function that calls `llm.call(...)` and handles all three result kinds (`ok`, `disabled/miss`, `disabled/hit`).
- [ ] Model chosen in `apps/server/src/llm/models.ts`.
- [ ] Tests: happy path, disabled+miss fallback, disabled+hit cache, schema validation failure.

## Debugging

### Server

- **VS Code**: a launch config under `.vscode/launch.json` attaches to the `pnpm dev:server` process via the inspector port. Place breakpoints in TS directly.
- **Print debugging**: `logger.debug({ ...context }, 'checkpoint')`. Bump `CW_LOG_LEVEL=debug`. Pino-pretty formats in dev.
- **Querying state**: `pnpm db:studio` opens Drizzle Studio against the active codebase's DB files. Read-only by default; use a scratch codebase if you want to experiment with writes.
- **Inspecting analysis output**: procedure `analysis.getStatus` and the cache tables show everything. There's also a CLI under `apps/server/src/cli/` for scripted inspection: `pnpm --filter @cw/server cli -- inspect paths --codebase <hash>`.

### Web

- Standard browser devtools. React DevTools recommended.
- TanStack Query DevTools is mounted in dev builds only. Shows cache, invalidations, in-flight requests.
- tRPC calls appear in the network tab as regular HTTP — inspect like any API.

### LLM calls

- Set `CW_LOG_LEVEL=debug` to see every call's input hash, cache status, and response.
- The `llm.listRecentActivity` procedure powers a UI panel showing the same info. Use it to verify caching is working.

## Debugging recipes

### "Why isn't this classification what I expect?"

1. Run `analysis.reanalyze({ force: true })` to bypass cache.
2. Query `cache.db.classifications` for the node. Look at `source`.
3. If `stage1`: check the adapter's classifier signals for that file — add logging in `packages/adapters/src/<lang>/classifier-signals.ts`.
4. If `stage2`: the response is cached in `cache.db.llm_results` keyed by input hash. Inspect the response. Adjust the prompt in `apps/server/src/llm/prompts/classify-file.ts` and bump its `version` to invalidate cache.
5. If `prep`: the reviewer answered via the prep pass. Query `state.db.prep_answers`.

### "Why is this path fork resolving to the wrong branch?"

1. Check `cache.db.paths` for the path.
2. Check which stage resolved the branch: `cache.db.dispatch_resolutions`.
3. If LLM resolved it, re-prompt with a better few-shot example (prompt file) and bump version.

### "Why is this node showing 'stale'?"

1. Compare current content hash vs. `review_status.code_hash` for the node.
2. The content hash normalizes whitespace and comments — if the change is purely cosmetic, it shouldn't flag as stale. If it does, the normalizer has a bug; file-a-bug with the repro.

## Production-like run

`pnpm build && pnpm start` runs the server with the built web bundle served from the same origin. Use this for E2E tests and to verify production bundling.

There is no separate deploy target in v1. "Production" means running locally with `NODE_ENV=production`.

## Branching and PRs

- **Branch per feature**, short-lived.
- **PRs include**: code, tests, doc updates, and a note in the PR description pointing to the relevant doc section.
- **CI gates**: typecheck, lint, test. E2E is opt-in per PR (heavier, flakier).
- **Reviewer checklist** for PRs:
  - [ ] Tests cover the change.
  - [ ] If behavior changed, the relevant engineering doc was updated.
  - [ ] If an LLM pipeline was added, it appears in the degradation contract.
  - [ ] No new `console.log`, no new `any`, no new `@ts-ignore`.
  - [ ] No new dependency unless genuinely needed.

## When something feels off

If the codebase is fighting you — a refactor that should be one file touches many, a test that can't be written without mocks, a seam that keeps getting crossed — **flag it**. Usually that signals a structural problem these docs didn't anticipate. Open a doc-update PR alongside the code change.
