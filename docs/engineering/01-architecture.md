# 01 — Architecture

## Scope

System-level shape: what processes run, how data moves, and where the seams are. This doc is the one-page mental model a new contributor should hold before touching any code.

## Out of scope

Package-by-package layout (see `02-project-structure.md`), API signatures (see `07-api-surface.md`), or DB schema (see `04-persistence.md`).

## Guiding principles

1. **Deterministic where accuracy matters, LLM where determinism breaks down.** Parsing, symbol resolution, and call graphs are AST-driven. LLMs classify ambiguous files, resolve dynamic dispatch, pre-generate prep suggestions, and evaluate LLM rules. Never the reverse.
2. **Local, single-user, file-based.** No network services, no background daemons, no multi-tenant concerns. State lives on disk in a predictable location.
3. **One codebase active per running instance.** Codebases can be swapped at runtime via an explicit action. No cross-codebase queries, no multi-codebase joins.
4. **Degradation is explicit.** LLM-off, missing-cache, and partial-analysis states are first-class in the UI. The reviewer always knows what they're seeing.
5. **Cancellable pipelines from day one.** Any analysis or LLM call must be interruptible. This supports re-analyze, codebase-switch, and user-initiated abort.
6. **Claude is the source of truth for how to extend this.** These docs are written to be read by Claude. Patterns are uniform and named so that "add a new X" has one correct shape.

## Processes

Two processes in development, one in a production-like run.

```
┌─────────────────────────────────────────────────────────┐
│ pnpm dev                                                │
│                                                         │
│   ┌───────────────────┐        ┌──────────────────────┐ │
│   │ apps/web          │        │ apps/server          │ │
│   │ Vite dev server   │◄──────►│ Node (Hono + tRPC)   │ │
│   │ React + TanStack  │  HTTP  │ Drizzle + SQLite     │ │
│   │ localhost:5173    │        │ localhost:4000       │ │
│   └───────────────────┘        └──────────────────────┘ │
│                                                         │
│                                      ▼                  │
│                            ┌──────────────────────┐     │
│                            │ ~/.code-walkthrough/ │     │
│                            │  config.ts           │     │
│                            │  codebases/<hash>/   │     │
│                            │    state.db          │     │
│                            │    cache.db          │     │
│                            └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

- **`apps/web`**: Vite + React 19 + TanStack Router + TanStack Query + Zustand. In dev, runs under Vite's dev server. In prod build, emits a static bundle consumed by the server.
- **`apps/server`**: Node process running Hono. Exposes a tRPC router on `/trpc`. Owns all filesystem, SQLite, git, and Anthropic API access. Serves the built web bundle in prod mode.
- **`packages/shared`**: Zod schemas, tRPC router types, shared TS types, shared utilities with no runtime dependencies on server or web.
- **`packages/analyzer`**: Pure analysis library. AST parsing, classification, path detection. No I/O — given files, produces analysis data structures. Called from the server.
- **`packages/adapters`**: Language and framework adapters. The JS/TS adapter lives here. New languages are new files under this package.

## Data flow

### Startup

1. `apps/server` boots, loads `.env`, connects to the user config DB at `~/.code-walkthrough/config.db`.
2. No codebase is active yet. The server exposes tRPC procedures in two groups: **global** (ok without an active codebase — list recent codebases, open codebase, check LLM status) and **scoped** (require an active codebase — everything else).
3. `apps/web` boots, connects to the server, calls `app.getBootstrap()`, and renders either the codebase picker or, if a session restored an active codebase, the main UI.

### Opening a codebase

1. User picks a directory via the web UI. The request hits `app.openCodebase({ path })`.
2. Server resolves the codebase hash (stable ID derived from the absolute path), opens or creates `~/.code-walkthrough/codebases/<hash>/state.db`, and attaches the cache DB.
3. Server runs **ingestion** (`packages/analyzer`): detect projects, detect languages, register adapters. This is fast — it does not parse file contents yet.
4. Server sets the session's active codebase. All subsequent scoped procedures resolve against it.
5. Server kicks off **background analysis** via a cancellable task. The web UI subscribes to progress events over tRPC subscriptions (SSE under the hood).

### Analysis pipeline

Analysis runs in stages, each cancellable. See `05-analysis-pipeline.md` for the full contract.

```
ingest → parse → classify → detect entries → detect paths → categorize paths
                  │            │                │              │
                  └─ Stage 1 ──┘                │              │
                  └─ Stage 2 (LLM) ─────────────┤              │
                  └─ Stage 3 (prep pass) ───────┘              │
                                                               │
                                              └─ LLM (optional) ─┘
```

Each stage reads from and writes to SQLite via Drizzle. Caching is content-hash-keyed so re-running an unchanged stage is a no-op. See `04-persistence.md` for schemas.

### A walkthrough request

1. User opens a path in the web UI. The router's typed search params encode the current node and path position.
2. `apps/web` calls `walkthrough.getNode({ pathId, nodeId })`.
3. Server reads node data + its checklist + prior review state from SQLite.
4. Server returns a single JSON payload. No further server calls unless the user navigates, acts, or digs in.
5. On a status action (approve / reject / request info), the web UI calls `review.setStatus(...)` and optimistically updates. The server writes through SQLite and returns the new canonical state.

## Boundaries

These are the seams where the architecture intentionally refuses to couple things. Violating them will look convenient and accumulate cost.

| Seam | Rule |
|------|-----|
| `packages/analyzer` ↔ `apps/server` | Analyzer is pure. Server drives I/O. Analyzer never calls the DB, Anthropic, or the filesystem directly — the server passes it file contents and stores its output. |
| `packages/adapters` ↔ `packages/analyzer` | Adapters implement a uniform interface (see `05-analysis-pipeline.md`). The analyzer orchestrates; adapters parse. |
| `apps/server` ↔ `apps/web` | The only contract is the tRPC router. No shared runtime state, no imported server code in web. `packages/shared` exposes the router's *type* only, not its implementation. |
| LLM calls ↔ everything else | All Claude calls go through `apps/server/src/llm/client.ts`. Nothing else imports `@anthropic-ai/sdk`. See `06-llm-integration.md`. |
| Git ↔ everything else | All git calls go through `apps/server/src/git/git.ts`. Everything shells out through one wrapper with one set of flags. See `09-reanalysis.md`. |
| Active codebase context | Scoped tRPC procedures receive the active codebase via context middleware, not via procedure args. There is no "codebase ID" in the URL or body of scoped procedures. |

## Concurrency model

- **One codebase active at a time** per server process.
- **One analysis in flight at a time** per codebase. Triggering re-analysis while one is running cancels the in-flight run and starts a new one.
- **LLM calls run in a bounded concurrency pool** (default: 4). Configurable. See `06-llm-integration.md`.
- **All long-running work is cancellable via `AbortSignal`.** Cancellation is propagated into the analyzer, LLM client, and git wrapper.

## Error model

Three kinds of error:

1. **User-actionable errors** (bad path, missing permission, malformed config). Surfaced to the UI with a clear message and a remediation hint.
2. **Degradations** (LLM unavailable, deterministic fallback active). Not errors. Surfaced as UI state, logged at `info`. See `06-llm-integration.md`.
3. **Bugs** (invariant violated, assertion failed). Logged at `error` with full context. Surfaced to the UI as "something went wrong" with a copy-to-clipboard trace. Never swallowed silently.

Never catch an exception just to continue. Either handle it specifically or let it bubble to the top-level handler that classifies it.

## What this architecture is *not* optimized for

- **Throughput.** It's a single-user local tool. We will gladly do a synchronous SQLite write in the request path.
- **Horizontal scale.** There is one server process. There are no plans for more.
- **Hot reload of analysis state.** Re-analysis is explicit (see `09-reanalysis.md`). No file watcher.
- **Plugin discovery at runtime.** Rule plugins are config files. Language adapters are compiled into the build. No dynamic loading in v1.
